"""Тесты на унифицированные ответы mutation-ручек:

POST /classes, POST /classes/join, POST /classes/{id}/join-open — отдают MyClassDTO.
PATCH/DELETE /classes/{id}/members/{userId} — отдают ClassMembersDTO.
POST /classes/{id}/leave — отдаёт {class_id, status}.
"""

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


# Минимальный набор полей, которые фронт ожидает в MyClassDTO
_MY_CLASS_FIELDS = {
    "id",
    "name",
    "type",
    "creator_id",
    "role",
    "joined_at",
    "students_count",
    "teachers_count",
    "join_code",
}


@pytest.mark.asyncio
async def test_post_classes_returns_my_class_dto_open(client):
    """POST /classes для open класса отдаёт MyClassDTO без кода."""
    token, creator_id = await _register(client, "c@example.com")

    r = await client.post(
        "/api/classes",
        json={"name": "Open", "type": "open"},
        headers=_auth(token),
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert set(body.keys()) >= _MY_CLASS_FIELDS
    assert body["role"] == "creator"
    assert body["creator_id"] == creator_id
    assert body["students_count"] == 0
    assert body["teachers_count"] == 1  # creator
    assert body["join_code"] is None  # у open класса кода нет


@pytest.mark.asyncio
async def test_post_classes_returns_my_class_dto_closed(client):
    """POST /classes для closed класса — creator сразу видит join_code."""
    token, _ = await _register(client, "c@example.com")

    r = await client.post(
        "/api/classes",
        json={"name": "Closed", "type": "closed"},
        headers=_auth(token),
    )
    assert r.status_code == 201
    body = r.json()
    assert set(body.keys()) >= _MY_CLASS_FIELDS
    assert body["join_code"] is not None
    assert len(body["join_code"]) == 8


@pytest.mark.asyncio
async def test_post_join_by_code_returns_my_class_dto(client):
    """POST /classes/join отдаёт MyClassDTO нового студента — фронт сразу вставит в /my."""
    creator_token, _ = await _register(client, "c@example.com")
    r = await client.post(
        "/api/classes",
        json={"name": "Closed", "type": "closed"},
        headers=_auth(creator_token),
    )
    code = r.json()["join_code"]
    class_id = r.json()["id"]

    student_token, _ = await _register(client, "s@example.com")
    r = await client.post(
        "/api/classes/join", json={"code": code}, headers=_auth(student_token)
    )
    assert r.status_code == 201
    body = r.json()
    assert set(body.keys()) >= _MY_CLASS_FIELDS
    assert body["id"] == class_id
    assert body["role"] == "student"
    assert body["students_count"] == 1
    assert body["teachers_count"] == 1
    assert body["join_code"] is None  # студент не должен видеть код


@pytest.mark.asyncio
async def test_post_join_open_returns_my_class_dto(client):
    """POST /classes/{id}/join-open — то же, но для открытых классов."""
    creator_token, _ = await _register(client, "c@example.com")
    r = await client.post(
        "/api/classes",
        json={"name": "Open", "type": "open"},
        headers=_auth(creator_token),
    )
    class_id = r.json()["id"]

    student_token, _ = await _register(client, "s@example.com")
    r = await client.post(
        f"/api/classes/{class_id}/join-open", headers=_auth(student_token)
    )
    assert r.status_code == 201
    body = r.json()
    assert set(body.keys()) >= _MY_CLASS_FIELDS
    assert body["id"] == class_id
    assert body["role"] == "student"
    assert body["join_code"] is None


@pytest.mark.asyncio
async def test_patch_role_returns_members_dto(client):
    """PATCH role → секция участников с counts (без отдельного GET /members)."""
    creator_token, _ = await _register(client, "c@example.com")
    r = await client.post(
        "/api/classes",
        json={"name": "C", "type": "open"},
        headers=_auth(creator_token),
    )
    class_id = r.json()["id"]

    student_token, student_id = await _register(client, "s@example.com")
    await client.post(
        f"/api/classes/{class_id}/join-open", headers=_auth(student_token)
    )

    r = await client.patch(
        f"/api/classes/{class_id}/members/{student_id}/role",
        json={"role": "teacher"},
        headers=_auth(creator_token),
    )
    assert r.status_code == 200
    body = r.json()
    assert set(body.keys()) == {"items", "students_count", "teachers_count"}
    assert len(body["items"]) == 2
    assert body["students_count"] == 0
    assert body["teachers_count"] == 2


@pytest.mark.asyncio
async def test_delete_member_returns_members_dto(client):
    """DELETE member → 200 OK с актуальным списком участников."""
    creator_token, _ = await _register(client, "c@example.com")
    r = await client.post(
        "/api/classes",
        json={"name": "C", "type": "open"},
        headers=_auth(creator_token),
    )
    class_id = r.json()["id"]

    student_token, student_id = await _register(client, "s@example.com")
    await client.post(
        f"/api/classes/{class_id}/join-open", headers=_auth(student_token)
    )

    r = await client.delete(
        f"/api/classes/{class_id}/members/{student_id}",
        headers=_auth(creator_token),
    )
    assert r.status_code == 200  # больше не 204
    body = r.json()
    assert set(body.keys()) == {"items", "students_count", "teachers_count"}
    assert len(body["items"]) == 1
    assert body["students_count"] == 0
    assert body["teachers_count"] == 1
    assert body["items"][0]["role"] == "creator"


@pytest.mark.asyncio
async def test_leave_returns_class_id_and_status(client):
    """POST /leave → 200 OK с {class_id, status}."""
    creator_token, _ = await _register(client, "c@example.com")
    r = await client.post(
        "/api/classes",
        json={"name": "C", "type": "open"},
        headers=_auth(creator_token),
    )
    class_id = r.json()["id"]

    student_token, _ = await _register(client, "s@example.com")
    await client.post(
        f"/api/classes/{class_id}/join-open", headers=_auth(student_token)
    )

    r = await client.post(
        f"/api/classes/{class_id}/leave", headers=_auth(student_token)
    )
    assert r.status_code == 200  # больше не 204
    body = r.json()
    assert body == {"class_id": class_id, "status": "left"}


@pytest.mark.asyncio
async def test_patch_class_returns_fresh_detail(client):
    """PATCH /classes/{id} уже отдаёт ClassDetailDTO — проверяем, что счётчики/permissions
    свежие после апдейта."""
    creator_token, _ = await _register(client, "c@example.com")
    r = await client.post(
        "/api/classes",
        json={"name": "Old", "type": "open"},
        headers=_auth(creator_token),
    )
    class_id = r.json()["id"]

    student_token, _ = await _register(client, "s@example.com")
    await client.post(
        f"/api/classes/{class_id}/join-open", headers=_auth(student_token)
    )

    r = await client.patch(
        f"/api/classes/{class_id}",
        json={"name": "New", "type": "closed"},
        headers=_auth(creator_token),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["name"] == "New"
    assert body["type"] == "closed"
    assert body["join_code"] is not None  # сгенерили при переходе open→closed
    assert body["students_count"] == 1
    assert body["teachers_count"] == 1
    assert body["user_role"] == "creator"
    assert body["permissions"]["can_delete_class"] is True
