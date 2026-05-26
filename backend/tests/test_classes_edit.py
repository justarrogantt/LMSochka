"""Тесты редактирования и удаления класса (PATCH/DELETE)."""

import pytest


async def _register(client, email: str) -> str:
    r = await client.post(
        "/api/auth/register",
        json={"email": email, "password": "password123"},
    )
    assert r.status_code == 201, r.text
    return r.json()["access_token"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _create_class(client, token: str, name: str, type_: str = "open") -> dict:
    r = await client.post(
        "/api/classes",
        json={"name": name, "type": type_},
        headers=_auth(token),
    )
    assert r.status_code == 201, r.text
    return r.json()


@pytest.mark.asyncio
async def test_update_name_by_creator(client):
    token = await _register(client, "creator@example.com")
    cls = await _create_class(client, token, "Old name")

    r = await client.patch(
        f"/api/classes/{cls['id']}",
        json={"name": "New name"},
        headers=_auth(token),
    )
    assert r.status_code == 200, r.text
    assert r.json()["name"] == "New name"


@pytest.mark.asyncio
async def test_update_type_open_to_closed_generates_code(client):
    token = await _register(client, "creator@example.com")
    cls = await _create_class(client, token, "Test", "open")

    r = await client.patch(
        f"/api/classes/{cls['id']}",
        json={"type": "closed"},
        headers=_auth(token),
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["type"] == "closed"
    assert data["join_code"] is not None  # creator всегда видит код
    assert len(data["join_code"]) == 8


@pytest.mark.asyncio
async def test_update_type_closed_to_open_drops_code(client):
    token = await _register(client, "creator@example.com")
    cls = await _create_class(client, token, "Test", "closed")
    assert cls["join_code"] is not None

    r = await client.patch(
        f"/api/classes/{cls['id']}",
        json={"type": "open"},
        headers=_auth(token),
    )
    assert r.status_code == 200
    assert r.json()["type"] == "open"
    assert r.json()["join_code"] is None


@pytest.mark.asyncio
async def test_update_forbidden_for_student(client):
    creator_token = await _register(client, "creator@example.com")
    cls = await _create_class(client, creator_token, "C", "open")

    student_token = await _register(client, "student@example.com")
    await client.post(
        f"/api/classes/{cls['id']}/join-open", headers=_auth(student_token)
    )

    r = await client.patch(
        f"/api/classes/{cls['id']}",
        json={"name": "Hacked"},
        headers=_auth(student_token),
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_update_forbidden_for_outsider(client):
    creator_token = await _register(client, "creator@example.com")
    cls = await _create_class(client, creator_token, "C", "open")

    outsider_token = await _register(client, "out@example.com")
    r = await client.patch(
        f"/api/classes/{cls['id']}",
        json={"name": "x"},
        headers=_auth(outsider_token),
    )
    # outsider не состоит → require_class_member вернёт 403 раньше проверки роли
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_update_404_for_missing(client):
    token = await _register(client, "u@example.com")
    r = await client.patch(
        "/api/classes/9999", json={"name": "x"}, headers=_auth(token)
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_delete_by_creator_soft(client):
    token = await _register(client, "creator@example.com")
    cls = await _create_class(client, token, "Doomed", "open")

    r = await client.delete(
        f"/api/classes/{cls['id']}", headers=_auth(token)
    )
    assert r.status_code == 204

    # после удаления класс пропадает из всех выборок
    r = await client.get(f"/api/classes/{cls['id']}", headers=_auth(token))
    assert r.status_code == 404

    r = await client.get("/api/classes/my", headers=_auth(token))
    assert r.json() == []

    r = await client.get("/api/classes/public", headers=_auth(token))
    assert r.json() == []


@pytest.mark.asyncio
async def test_delete_forbidden_for_teacher_role(client):
    """teacher не может удалить класс — только creator. (сейчас teacher некому назначить,
    но проверяем через outsider+student что 403 отдаётся не creator-ом)."""
    creator_token = await _register(client, "creator@example.com")
    cls = await _create_class(client, creator_token, "C", "open")

    student_token = await _register(client, "student@example.com")
    await client.post(
        f"/api/classes/{cls['id']}/join-open", headers=_auth(student_token)
    )

    r = await client.delete(
        f"/api/classes/{cls['id']}", headers=_auth(student_token)
    )
    assert r.status_code == 403

    # класс по-прежнему жив
    r = await client.get(f"/api/classes/{cls['id']}", headers=_auth(creator_token))
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_deleted_class_cannot_be_joined_by_code(client):
    token = await _register(client, "creator@example.com")
    cls = await _create_class(client, token, "C", "closed")
    code = cls["join_code"]

    await client.delete(f"/api/classes/{cls['id']}", headers=_auth(token))

    student_token = await _register(client, "student@example.com")
    r = await client.post(
        "/api/classes/join", json={"code": code}, headers=_auth(student_token)
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_delete_404_for_missing(client):
    token = await _register(client, "u@example.com")
    r = await client.delete("/api/classes/9999", headers=_auth(token))
    assert r.status_code == 404
