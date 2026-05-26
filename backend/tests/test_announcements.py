"""Тесты на модуль объявлений: CRUD, права, пагинация."""

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


async def _create_class(client, token: str) -> int:
    r = await client.post(
        "/api/classes",
        json={"name": "Class", "type": "open"},
        headers=_auth(token),
    )
    return r.json()["id"]


async def _join_open(client, token: str, class_id: int) -> None:
    r = await client.post(
        f"/api/classes/{class_id}/join-open", headers=_auth(token)
    )
    assert r.status_code == 201, r.text


async def _promote(client, creator_token: str, class_id: int, user_id: int) -> None:
    r = await client.patch(
        f"/api/classes/{class_id}/members/{user_id}/role",
        json={"role": "teacher"},
        headers=_auth(creator_token),
    )
    assert r.status_code == 200, r.text


async def _make_announcement(
    client, token: str, class_id: int, title: str = "Title", content: str = "Body"
) -> dict:
    r = await client.post(
        f"/api/classes/{class_id}/announcements",
        json={"title": title, "content": content},
        headers=_auth(token),
    )
    assert r.status_code == 201, r.text
    return r.json()


# --- POST ---------------------------------------------------------------------


@pytest.mark.asyncio
async def test_creator_can_create_announcement(client):
    creator_token, creator_id = await _register(client, "creator@example.com")
    class_id = await _create_class(client, creator_token)

    r = await client.post(
        f"/api/classes/{class_id}/announcements",
        json={"title": "Контрольная", "content": "В пятницу"},
        headers=_auth(creator_token),
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["title"] == "Контрольная"
    assert body["content"] == "В пятницу"
    assert body["class_id"] == class_id
    assert body["author"]["id"] == creator_id
    assert body["author"]["email"] == "creator@example.com"
    assert body["updated_at"] is None
    assert "id" in body


@pytest.mark.asyncio
async def test_teacher_can_create_announcement(client):
    creator_token, _ = await _register(client, "creator@example.com")
    class_id = await _create_class(client, creator_token)

    teacher_token, teacher_id = await _register(client, "teacher@example.com")
    await _join_open(client, teacher_token, class_id)
    await _promote(client, creator_token, class_id, teacher_id)

    r = await client.post(
        f"/api/classes/{class_id}/announcements",
        json={"title": "От учителя", "content": "Текст"},
        headers=_auth(teacher_token),
    )
    assert r.status_code == 201


@pytest.mark.asyncio
async def test_student_cannot_create_announcement(client):
    creator_token, _ = await _register(client, "creator@example.com")
    class_id = await _create_class(client, creator_token)

    student_token, _ = await _register(client, "student@example.com")
    await _join_open(client, student_token, class_id)

    r = await client.post(
        f"/api/classes/{class_id}/announcements",
        json={"title": "no", "content": "no"},
        headers=_auth(student_token),
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_outsider_cannot_create_announcement(client):
    creator_token, _ = await _register(client, "creator@example.com")
    class_id = await _create_class(client, creator_token)

    outsider_token, _ = await _register(client, "out@example.com")
    r = await client.post(
        f"/api/classes/{class_id}/announcements",
        json={"title": "no", "content": "no"},
        headers=_auth(outsider_token),
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_create_announcement_class_not_found(client):
    token, _ = await _register(client, "u@example.com")
    r = await client.post(
        "/api/classes/9999/announcements",
        json={"title": "x", "content": "y"},
        headers=_auth(token),
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_create_announcement_validation(client):
    creator_token, _ = await _register(client, "creator@example.com")
    class_id = await _create_class(client, creator_token)

    # пустой title
    r = await client.post(
        f"/api/classes/{class_id}/announcements",
        json={"title": "", "content": "y"},
        headers=_auth(creator_token),
    )
    assert r.status_code == 422

    # пустой content
    r = await client.post(
        f"/api/classes/{class_id}/announcements",
        json={"title": "ok", "content": ""},
        headers=_auth(creator_token),
    )
    assert r.status_code == 422

    # слишком длинный title
    r = await client.post(
        f"/api/classes/{class_id}/announcements",
        json={"title": "x" * 201, "content": "y"},
        headers=_auth(creator_token),
    )
    assert r.status_code == 422


# --- GET list -----------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_announcements_pagination(client):
    creator_token, _ = await _register(client, "creator@example.com")
    class_id = await _create_class(client, creator_token)

    for i in range(25):
        await _make_announcement(
            client, creator_token, class_id, title=f"#{i}", content="..."
        )

    r = await client.get(
        f"/api/classes/{class_id}/announcements", headers=_auth(creator_token)
    )
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 25
    assert body["page"] == 1
    assert body["limit"] == 20
    assert len(body["items"]) == 20
    # сортировка: самое свежее сверху, то есть #24
    assert body["items"][0]["title"] == "#24"

    # вторая страница
    r = await client.get(
        f"/api/classes/{class_id}/announcements?page=2&limit=20",
        headers=_auth(creator_token),
    )
    body = r.json()
    assert len(body["items"]) == 5
    assert body["page"] == 2


@pytest.mark.asyncio
async def test_list_announcements_limit_capped(client):
    creator_token, _ = await _register(client, "creator@example.com")
    class_id = await _create_class(client, creator_token)

    # limit > 100 → 422
    r = await client.get(
        f"/api/classes/{class_id}/announcements?limit=101",
        headers=_auth(creator_token),
    )
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_list_announcements_student_can_read(client):
    creator_token, _ = await _register(client, "creator@example.com")
    class_id = await _create_class(client, creator_token)
    await _make_announcement(client, creator_token, class_id)

    student_token, _ = await _register(client, "student@example.com")
    await _join_open(client, student_token, class_id)

    r = await client.get(
        f"/api/classes/{class_id}/announcements", headers=_auth(student_token)
    )
    assert r.status_code == 200
    assert r.json()["total"] == 1


@pytest.mark.asyncio
async def test_list_announcements_outsider_forbidden(client):
    creator_token, _ = await _register(client, "creator@example.com")
    class_id = await _create_class(client, creator_token)

    outsider_token, _ = await _register(client, "out@example.com")
    r = await client.get(
        f"/api/classes/{class_id}/announcements", headers=_auth(outsider_token)
    )
    assert r.status_code == 403


# --- GET one ------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_one_announcement(client):
    creator_token, _ = await _register(client, "creator@example.com")
    class_id = await _create_class(client, creator_token)
    ann = await _make_announcement(client, creator_token, class_id, "T", "C")

    r = await client.get(
        f"/api/classes/{class_id}/announcements/{ann['id']}",
        headers=_auth(creator_token),
    )
    assert r.status_code == 200
    assert r.json()["id"] == ann["id"]


@pytest.mark.asyncio
async def test_get_one_404(client):
    creator_token, _ = await _register(client, "creator@example.com")
    class_id = await _create_class(client, creator_token)

    r = await client.get(
        f"/api/classes/{class_id}/announcements/9999",
        headers=_auth(creator_token),
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_get_one_cross_class_404(client):
    """Объявление одного класса нельзя достать через путь другого класса."""
    creator_token, _ = await _register(client, "creator@example.com")
    cls_a = await _create_class(client, creator_token)
    cls_b_r = await client.post(
        "/api/classes",
        json={"name": "B", "type": "open"},
        headers=_auth(creator_token),
    )
    cls_b = cls_b_r.json()["id"]

    ann = await _make_announcement(client, creator_token, cls_a)

    r = await client.get(
        f"/api/classes/{cls_b}/announcements/{ann['id']}",
        headers=_auth(creator_token),
    )
    assert r.status_code == 404


# --- PATCH --------------------------------------------------------------------


@pytest.mark.asyncio
async def test_author_can_update_own_announcement(client):
    creator_token, _ = await _register(client, "creator@example.com")
    class_id = await _create_class(client, creator_token)

    teacher_token, teacher_id = await _register(client, "teacher@example.com")
    await _join_open(client, teacher_token, class_id)
    await _promote(client, creator_token, class_id, teacher_id)

    ann = await _make_announcement(client, teacher_token, class_id, "T", "C")

    r = await client.patch(
        f"/api/classes/{class_id}/announcements/{ann['id']}",
        json={"title": "Updated"},
        headers=_auth(teacher_token),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["title"] == "Updated"
    assert body["content"] == "C"
    assert body["updated_at"] is not None


@pytest.mark.asyncio
async def test_creator_can_update_any_announcement(client):
    creator_token, _ = await _register(client, "creator@example.com")
    class_id = await _create_class(client, creator_token)

    teacher_token, teacher_id = await _register(client, "teacher@example.com")
    await _join_open(client, teacher_token, class_id)
    await _promote(client, creator_token, class_id, teacher_id)

    ann = await _make_announcement(client, teacher_token, class_id)

    # creator может редактировать чужое
    r = await client.patch(
        f"/api/classes/{class_id}/announcements/{ann['id']}",
        json={"content": "Изменено creator-ом"},
        headers=_auth(creator_token),
    )
    assert r.status_code == 200
    assert r.json()["content"] == "Изменено creator-ом"


@pytest.mark.asyncio
async def test_teacher_cannot_update_other_teacher_announcement(client):
    """Без авторства teacher править чужие не может — мы намеренно так решили."""
    creator_token, _ = await _register(client, "creator@example.com")
    class_id = await _create_class(client, creator_token)

    t1_token, t1_id = await _register(client, "t1@example.com")
    await _join_open(client, t1_token, class_id)
    await _promote(client, creator_token, class_id, t1_id)

    t2_token, t2_id = await _register(client, "t2@example.com")
    await _join_open(client, t2_token, class_id)
    await _promote(client, creator_token, class_id, t2_id)

    ann = await _make_announcement(client, t1_token, class_id)
    r = await client.patch(
        f"/api/classes/{class_id}/announcements/{ann['id']}",
        json={"title": "Hack"},
        headers=_auth(t2_token),
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_student_cannot_update(client):
    creator_token, _ = await _register(client, "creator@example.com")
    class_id = await _create_class(client, creator_token)
    ann = await _make_announcement(client, creator_token, class_id)

    student_token, _ = await _register(client, "student@example.com")
    await _join_open(client, student_token, class_id)

    r = await client.patch(
        f"/api/classes/{class_id}/announcements/{ann['id']}",
        json={"title": "x"},
        headers=_auth(student_token),
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_update_empty_body_rejected(client):
    creator_token, _ = await _register(client, "creator@example.com")
    class_id = await _create_class(client, creator_token)
    ann = await _make_announcement(client, creator_token, class_id)

    r = await client.patch(
        f"/api/classes/{class_id}/announcements/{ann['id']}",
        json={},
        headers=_auth(creator_token),
    )
    assert r.status_code == 422


# --- DELETE -------------------------------------------------------------------


@pytest.mark.asyncio
async def test_author_can_delete(client):
    creator_token, _ = await _register(client, "creator@example.com")
    class_id = await _create_class(client, creator_token)
    ann = await _make_announcement(client, creator_token, class_id)

    r = await client.delete(
        f"/api/classes/{class_id}/announcements/{ann['id']}",
        headers=_auth(creator_token),
    )
    assert r.status_code == 204

    # после удаления не виден в списке и 404 на GET
    r = await client.get(
        f"/api/classes/{class_id}/announcements", headers=_auth(creator_token)
    )
    assert r.json()["total"] == 0

    r = await client.get(
        f"/api/classes/{class_id}/announcements/{ann['id']}",
        headers=_auth(creator_token),
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_creator_can_delete_any(client):
    creator_token, _ = await _register(client, "creator@example.com")
    class_id = await _create_class(client, creator_token)

    teacher_token, teacher_id = await _register(client, "teacher@example.com")
    await _join_open(client, teacher_token, class_id)
    await _promote(client, creator_token, class_id, teacher_id)

    ann = await _make_announcement(client, teacher_token, class_id)

    r = await client.delete(
        f"/api/classes/{class_id}/announcements/{ann['id']}",
        headers=_auth(creator_token),
    )
    assert r.status_code == 204


@pytest.mark.asyncio
async def test_student_cannot_delete(client):
    creator_token, _ = await _register(client, "creator@example.com")
    class_id = await _create_class(client, creator_token)
    ann = await _make_announcement(client, creator_token, class_id)

    student_token, _ = await _register(client, "student@example.com")
    await _join_open(client, student_token, class_id)

    r = await client.delete(
        f"/api/classes/{class_id}/announcements/{ann['id']}",
        headers=_auth(student_token),
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_delete_404(client):
    creator_token, _ = await _register(client, "creator@example.com")
    class_id = await _create_class(client, creator_token)

    r = await client.delete(
        f"/api/classes/{class_id}/announcements/9999",
        headers=_auth(creator_token),
    )
    assert r.status_code == 404
