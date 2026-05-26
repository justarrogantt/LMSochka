"""Тесты на управление участниками класса: promote/demote/kick/leave."""

import pytest


async def _register(client, email: str) -> tuple[str, int]:
    r = await client.post(
        "/api/auth/register",
        json={"email": email, "password": "password123"},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    return body["access_token"], body["user"]["id"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _create_open_class(client, token: str, name: str = "Class") -> int:
    r = await client.post(
        "/api/classes",
        json={"name": name, "type": "open"},
        headers=_auth(token),
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def _join_open(client, token: str, class_id: int) -> None:
    r = await client.post(
        f"/api/classes/{class_id}/join-open", headers=_auth(token)
    )
    assert r.status_code == 201, r.text


# --- PATCH role ---------------------------------------------------------------


@pytest.mark.asyncio
async def test_creator_can_promote_student_to_teacher(client):
    creator_token, _ = await _register(client, "creator@example.com")
    class_id = await _create_open_class(client, creator_token)

    student_token, student_id = await _register(client, "student@example.com")
    await _join_open(client, student_token, class_id)

    r = await client.patch(
        f"/api/classes/{class_id}/members/{student_id}/role",
        json={"role": "teacher"},
        headers=_auth(creator_token),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["user_id"] == student_id
    assert body["role"] == "teacher"
    assert body["is_active"] is True

    # students_count теперь 0, teachers_count = 2 (creator + новый teacher)
    r = await client.get(f"/api/classes/{class_id}", headers=_auth(creator_token))
    detail = r.json()
    assert detail["students_count"] == 0
    assert detail["teachers_count"] == 2


@pytest.mark.asyncio
async def test_creator_can_demote_teacher_to_student(client):
    creator_token, _ = await _register(client, "creator@example.com")
    class_id = await _create_open_class(client, creator_token)

    student_token, student_id = await _register(client, "student@example.com")
    await _join_open(client, student_token, class_id)

    # сначала повышаем
    await client.patch(
        f"/api/classes/{class_id}/members/{student_id}/role",
        json={"role": "teacher"},
        headers=_auth(creator_token),
    )
    # потом понижаем обратно
    r = await client.patch(
        f"/api/classes/{class_id}/members/{student_id}/role",
        json={"role": "student"},
        headers=_auth(creator_token),
    )
    assert r.status_code == 200
    assert r.json()["role"] == "student"


@pytest.mark.asyncio
async def test_teacher_cannot_change_roles(client):
    creator_token, _ = await _register(client, "creator@example.com")
    class_id = await _create_open_class(client, creator_token)

    teacher_token, teacher_id = await _register(client, "teacher@example.com")
    await _join_open(client, teacher_token, class_id)
    await client.patch(
        f"/api/classes/{class_id}/members/{teacher_id}/role",
        json={"role": "teacher"},
        headers=_auth(creator_token),
    )

    student_token, student_id = await _register(client, "student@example.com")
    await _join_open(client, student_token, class_id)

    # teacher не может менять роли — это право creator-а
    r = await client.patch(
        f"/api/classes/{class_id}/members/{student_id}/role",
        json={"role": "teacher"},
        headers=_auth(teacher_token),
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_student_cannot_change_roles(client):
    creator_token, _ = await _register(client, "creator@example.com")
    class_id = await _create_open_class(client, creator_token)

    s1_token, _ = await _register(client, "s1@example.com")
    await _join_open(client, s1_token, class_id)
    s2_token, s2_id = await _register(client, "s2@example.com")
    await _join_open(client, s2_token, class_id)

    # студент пытается повысить другого студента → 403
    r = await client.patch(
        f"/api/classes/{class_id}/members/{s2_id}/role",
        json={"role": "teacher"},
        headers=_auth(s1_token),
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_cannot_change_creator_role(client):
    creator_token, creator_id = await _register(client, "creator@example.com")
    class_id = await _create_open_class(client, creator_token)

    r = await client.patch(
        f"/api/classes/{class_id}/members/{creator_id}/role",
        json={"role": "teacher"},
        headers=_auth(creator_token),
    )
    assert r.status_code == 403
    assert "создател" in r.json()["detail"].lower()


@pytest.mark.asyncio
async def test_cannot_assign_creator_role(client):
    """В теле PATCH запрещаем role=creator — она привязана к автору класса."""
    creator_token, _ = await _register(client, "creator@example.com")
    class_id = await _create_open_class(client, creator_token)

    student_token, student_id = await _register(client, "student@example.com")
    await _join_open(client, student_token, class_id)

    r = await client.patch(
        f"/api/classes/{class_id}/members/{student_id}/role",
        json={"role": "creator"},
        headers=_auth(creator_token),
    )
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_change_role_member_not_found(client):
    creator_token, _ = await _register(client, "creator@example.com")
    class_id = await _create_open_class(client, creator_token)

    r = await client.patch(
        f"/api/classes/{class_id}/members/99999/role",
        json={"role": "teacher"},
        headers=_auth(creator_token),
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_change_role_class_not_found(client):
    creator_token, _ = await _register(client, "creator@example.com")
    r = await client.patch(
        "/api/classes/9999/members/1/role",
        json={"role": "teacher"},
        headers=_auth(creator_token),
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_change_role_same_role_noop(client):
    """Если новая роль = текущей, отдаём 200 без записи в БД."""
    creator_token, _ = await _register(client, "creator@example.com")
    class_id = await _create_open_class(client, creator_token)

    student_token, student_id = await _register(client, "student@example.com")
    await _join_open(client, student_token, class_id)

    r = await client.patch(
        f"/api/classes/{class_id}/members/{student_id}/role",
        json={"role": "student"},
        headers=_auth(creator_token),
    )
    assert r.status_code == 200
    assert r.json()["role"] == "student"


# --- DELETE member (kick) -----------------------------------------------------


@pytest.mark.asyncio
async def test_creator_can_kick_student(client):
    creator_token, _ = await _register(client, "creator@example.com")
    class_id = await _create_open_class(client, creator_token)

    student_token, student_id = await _register(client, "student@example.com")
    await _join_open(client, student_token, class_id)

    r = await client.delete(
        f"/api/classes/{class_id}/members/{student_id}",
        headers=_auth(creator_token),
    )
    assert r.status_code == 204

    # студент пропал из /members
    r = await client.get(
        f"/api/classes/{class_id}/members", headers=_auth(creator_token)
    )
    assert r.status_code == 200
    assert all(m["user_id"] != student_id for m in r.json())

    # студент больше не видит класс
    r = await client.get(
        f"/api/classes/{class_id}", headers=_auth(student_token)
    )
    assert r.status_code == 403
    r = await client.get("/api/classes/my", headers=_auth(student_token))
    assert r.json() == []


@pytest.mark.asyncio
async def test_kicked_student_cannot_rejoin(client):
    creator_token, _ = await _register(client, "creator@example.com")
    class_id = await _create_open_class(client, creator_token)

    student_token, student_id = await _register(client, "student@example.com")
    await _join_open(client, student_token, class_id)
    await client.delete(
        f"/api/classes/{class_id}/members/{student_id}",
        headers=_auth(creator_token),
    )

    # повторный join → 403, а не молча восстановление
    r = await client.post(
        f"/api/classes/{class_id}/join-open", headers=_auth(student_token)
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_teacher_cannot_kick(client):
    creator_token, _ = await _register(client, "creator@example.com")
    class_id = await _create_open_class(client, creator_token)

    teacher_token, teacher_id = await _register(client, "teacher@example.com")
    await _join_open(client, teacher_token, class_id)
    await client.patch(
        f"/api/classes/{class_id}/members/{teacher_id}/role",
        json={"role": "teacher"},
        headers=_auth(creator_token),
    )

    student_token, student_id = await _register(client, "student@example.com")
    await _join_open(client, student_token, class_id)

    r = await client.delete(
        f"/api/classes/{class_id}/members/{student_id}",
        headers=_auth(teacher_token),
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_cannot_kick_creator(client):
    creator_token, creator_id = await _register(client, "creator@example.com")
    class_id = await _create_open_class(client, creator_token)

    # creator пытается удалить самого себя через DELETE member
    r = await client.delete(
        f"/api/classes/{class_id}/members/{creator_id}",
        headers=_auth(creator_token),
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_kick_outsider_returns_404(client):
    creator_token, _ = await _register(client, "creator@example.com")
    class_id = await _create_open_class(client, creator_token)

    _, outsider_id = await _register(client, "outsider@example.com")

    r = await client.delete(
        f"/api/classes/{class_id}/members/{outsider_id}",
        headers=_auth(creator_token),
    )
    assert r.status_code == 404


# --- POST /leave --------------------------------------------------------------


@pytest.mark.asyncio
async def test_student_can_leave(client):
    creator_token, _ = await _register(client, "creator@example.com")
    class_id = await _create_open_class(client, creator_token)

    student_token, _ = await _register(client, "student@example.com")
    await _join_open(client, student_token, class_id)

    r = await client.post(
        f"/api/classes/{class_id}/leave", headers=_auth(student_token)
    )
    assert r.status_code == 204

    r = await client.get("/api/classes/my", headers=_auth(student_token))
    assert r.json() == []


@pytest.mark.asyncio
async def test_teacher_can_leave(client):
    creator_token, _ = await _register(client, "creator@example.com")
    class_id = await _create_open_class(client, creator_token)

    teacher_token, teacher_id = await _register(client, "teacher@example.com")
    await _join_open(client, teacher_token, class_id)
    await client.patch(
        f"/api/classes/{class_id}/members/{teacher_id}/role",
        json={"role": "teacher"},
        headers=_auth(creator_token),
    )

    r = await client.post(
        f"/api/classes/{class_id}/leave", headers=_auth(teacher_token)
    )
    assert r.status_code == 204


@pytest.mark.asyncio
async def test_creator_cannot_leave(client):
    creator_token, _ = await _register(client, "creator@example.com")
    class_id = await _create_open_class(client, creator_token)

    r = await client.post(
        f"/api/classes/{class_id}/leave", headers=_auth(creator_token)
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_left_user_cannot_rejoin(client):
    """Самовыход — это тот же soft delete, повторный join тоже запрещён."""
    creator_token, _ = await _register(client, "creator@example.com")
    class_id = await _create_open_class(client, creator_token)

    student_token, _ = await _register(client, "student@example.com")
    await _join_open(client, student_token, class_id)
    await client.post(
        f"/api/classes/{class_id}/leave", headers=_auth(student_token)
    )

    r = await client.post(
        f"/api/classes/{class_id}/join-open", headers=_auth(student_token)
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_leave_class_not_found(client):
    student_token, _ = await _register(client, "student@example.com")
    r = await client.post(
        "/api/classes/9999/leave", headers=_auth(student_token)
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_leave_when_not_member(client):
    creator_token, _ = await _register(client, "creator@example.com")
    class_id = await _create_open_class(client, creator_token)

    outsider_token, _ = await _register(client, "outsider@example.com")
    r = await client.post(
        f"/api/classes/{class_id}/leave", headers=_auth(outsider_token)
    )
    assert r.status_code == 403
