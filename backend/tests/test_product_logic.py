"""Регрессии продуктовой логики прав, восстановления и сдачи решений."""

import pytest


async def _register(client, email: str) -> tuple[str, int]:
    response = await client.post(
        "/api/auth/register",
        json={"email": email, "password": "password123"},
    )
    assert response.status_code == 201, response.text
    body = response.json()
    return body["access_token"], body["user"]["id"]


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def _create_class(client, token: str) -> int:
    response = await client.post(
        "/api/classes",
        json={"name": "Продуктовый класс", "type": "open"},
        headers=_auth(token),
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


async def _join(client, token: str, class_id: int) -> None:
    response = await client.post(
        f"/api/classes/{class_id}/join-open",
        headers=_auth(token),
    )
    assert response.status_code == 201, response.text


async def _assignment(client, token: str, class_id: int, title: str) -> dict:
    response = await client.post(
        f"/api/classes/{class_id}/assignments",
        json={"title": title, "max_grade": 10},
        headers=_auth(token),
    )
    assert response.status_code == 201, response.text
    return response.json()


async def _change_role(
    client, creator_token: str, class_id: int, user_id: int, role: str
) -> None:
    response = await client.patch(
        f"/api/classes/{class_id}/members/{user_id}/role",
        json={"role": role},
        headers=_auth(creator_token),
    )
    assert response.status_code == 200, response.text


@pytest.mark.asyncio
async def test_student_sees_assignments_created_before_join(client):
    creator_token, _ = await _register(client, "creator@example.com")
    class_id = await _create_class(client, creator_token)
    old_assignment = await _assignment(client, creator_token, class_id, "Старое")

    student_token, _ = await _register(client, "student@example.com")
    await _join(client, student_token, class_id)
    new_assignment = await _assignment(client, creator_token, class_id, "Новое")

    response = await client.get(
        f"/api/classes/{class_id}/assignments",
        headers=_auth(student_token),
    )
    assert response.status_code == 200
    assert [item["id"] for item in response.json()["items"]] == [
        new_assignment["id"],
        old_assignment["id"],
    ]

    response = await client.get(
        f"/api/classes/{class_id}/assignments/{old_assignment['id']}",
        headers=_auth(student_token),
    )
    assert response.status_code == 200

    response = await client.put(
        f"/api/assignments/{old_assignment['id']}/my-submission",
        json={"answer_text": "Теперь можно сохранить"},
        headers=_auth(student_token),
    )
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_demote_and_rejoin_do_not_hide_existing_assignments(client):
    creator_token, _ = await _register(client, "creator@example.com")
    class_id = await _create_class(client, creator_token)
    member_token, member_id = await _register(client, "member@example.com")
    await _join(client, member_token, class_id)

    await _change_role(client, creator_token, class_id, member_id, "teacher")
    before_demote = await _assignment(client, creator_token, class_id, "До понижения")
    await _change_role(client, creator_token, class_id, member_id, "student")
    after_demote = await _assignment(client, creator_token, class_id, "После понижения")

    response = await client.get(
        f"/api/classes/{class_id}/assignments",
        headers=_auth(member_token),
    )
    assert [item["id"] for item in response.json()["items"]] == [
        after_demote["id"],
        before_demote["id"],
    ]

    response = await client.post(
        f"/api/classes/{class_id}/leave",
        headers=_auth(member_token),
    )
    assert response.status_code == 200
    while_absent = await _assignment(client, creator_token, class_id, "Пока отсутствовал")
    await _join(client, member_token, class_id)
    after_rejoin = await _assignment(client, creator_token, class_id, "После возврата")

    response = await client.get(
        f"/api/classes/{class_id}/assignments",
        headers=_auth(member_token),
    )
    ids = [item["id"] for item in response.json()["items"]]
    assert ids == [
        after_rejoin["id"],
        while_absent["id"],
        after_demote["id"],
        before_demote["id"],
    ]


@pytest.mark.asyncio
async def test_creator_lists_and_restores_only_kicked_members(client):
    creator_token, _ = await _register(client, "creator@example.com")
    class_id = await _create_class(client, creator_token)
    kicked_token, kicked_id = await _register(client, "kicked@example.com")
    left_token, left_id = await _register(client, "left@example.com")
    await _join(client, kicked_token, class_id)
    await _join(client, left_token, class_id)

    response = await client.delete(
        f"/api/classes/{class_id}/members/{kicked_id}",
        headers=_auth(creator_token),
    )
    assert response.status_code == 200
    response = await client.post(
        f"/api/classes/{class_id}/leave",
        headers=_auth(left_token),
    )
    assert response.status_code == 200

    response = await client.get(
        f"/api/classes/{class_id}/members/removed",
        headers=_auth(creator_token),
    )
    assert response.status_code == 200
    assert [item["user_id"] for item in response.json()["items"]] == [kicked_id]

    response = await client.get(
        f"/api/classes/{class_id}/members/removed",
        headers=_auth(kicked_token),
    )
    assert response.status_code == 403

    before_restore = await _assignment(client, creator_token, class_id, "До восстановления")
    response = await client.post(
        f"/api/classes/{class_id}/members/{kicked_id}/restore",
        headers=_auth(creator_token),
    )
    assert response.status_code == 200
    restored = next(
        item for item in response.json()["items"] if item["user_id"] == kicked_id
    )
    assert restored["role"] == "student"
    after_restore = await _assignment(client, creator_token, class_id, "После восстановления")

    response = await client.get(
        f"/api/classes/{class_id}/assignments",
        headers=_auth(kicked_token),
    )
    ids = [item["id"] for item in response.json()["items"]]
    assert ids == [after_restore["id"], before_restore["id"]]

    response = await client.post(
        f"/api/classes/{class_id}/members/{left_id}/restore",
        headers=_auth(creator_token),
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_object_permissions_and_role_change_apply_immediately(client):
    creator_token, _ = await _register(client, "creator@example.com")
    class_id = await _create_class(client, creator_token)
    teacher_token, teacher_id = await _register(client, "teacher@example.com")
    await _join(client, teacher_token, class_id)
    await _change_role(client, creator_token, class_id, teacher_id, "teacher")

    creator_assignment = await _assignment(client, creator_token, class_id, "Создателя")
    teacher_assignment = await _assignment(client, teacher_token, class_id, "Преподавателя")

    response = await client.get(
        f"/api/classes/{class_id}/assignments",
        headers=_auth(teacher_token),
    )
    by_id = {item["id"]: item for item in response.json()["items"]}
    assert by_id[creator_assignment["id"]]["can_edit"] is False
    assert by_id[creator_assignment["id"]]["can_delete"] is False
    assert by_id[teacher_assignment["id"]]["can_edit"] is True
    assert by_id[teacher_assignment["id"]]["can_delete"] is True

    response = await client.patch(
        f"/api/classes/{class_id}",
        json={"name": "Чужое изменение"},
        headers=_auth(teacher_token),
    )
    assert response.status_code == 403

    await _change_role(client, creator_token, class_id, teacher_id, "student")
    response = await client.patch(
        f"/api/classes/{class_id}/assignments/{teacher_assignment['id']}",
        json={"title": "После смены роли"},
        headers=_auth(teacher_token),
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_full_submission_return_resubmit_grade_flow(client):
    creator_token, _ = await _register(client, "creator@example.com")
    class_id = await _create_class(client, creator_token)
    student_token, _ = await _register(client, "student@example.com")
    await _join(client, student_token, class_id)
    assignment = await _assignment(client, creator_token, class_id, "Полный путь")

    response = await client.put(
        f"/api/assignments/{assignment['id']}/my-submission",
        json={"answer_text": "Первая версия"},
        headers=_auth(student_token),
    )
    submission_id = response.json()["id"]
    await client.post(
        f"/api/assignments/{assignment['id']}/my-submission/submit",
        headers=_auth(student_token),
    )
    response = await client.post(
        f"/api/submissions/{submission_id}/return",
        json={"comment": "Исправить"},
        headers=_auth(creator_token),
    )
    assert response.json()["status"] == "returned"

    await client.put(
        f"/api/assignments/{assignment['id']}/my-submission",
        json={"answer_text": "Исправленная версия"},
        headers=_auth(student_token),
    )
    response = await client.post(
        f"/api/assignments/{assignment['id']}/my-submission/submit",
        headers=_auth(student_token),
    )
    assert response.json()["return_comment"] is None

    response = await client.put(
        f"/api/submissions/{submission_id}/grade",
        json={"value": 9},
        headers=_auth(creator_token),
    )
    assert response.status_code == 200
    assert response.json()["value"] == 9
