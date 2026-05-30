"""Тесты на передачу роли создателя класса (POST /classes/{id}/transfer-ownership)."""

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


async def _create_class(client, token: str, ctype: str = "open") -> dict:
    r = await client.post(
        "/api/classes",
        json={"name": "Class", "type": ctype},
        headers=_auth(token),
    )
    assert r.status_code == 201, r.text
    return r.json()


async def _join_open(client, token: str, class_id: int) -> None:
    r = await client.post(
        f"/api/classes/{class_id}/join-open", headers=_auth(token)
    )
    assert r.status_code == 201, r.text


@pytest.mark.asyncio
async def test_creator_can_transfer_ownership(client):
    creator_token, creator_id = await _register(client, "creator@example.com")
    class_id = (await _create_class(client, creator_token))["id"]

    student_token, student_id = await _register(client, "student@example.com")
    await _join_open(client, student_token, class_id)

    r = await client.post(
        f"/api/classes/{class_id}/transfer-ownership",
        json={"new_owner_id": student_id},
        headers=_auth(creator_token),
    )
    assert r.status_code == 200, r.text
    detail = r.json()
    # ответ — от лица бывшего создателя: теперь он teacher с урезанными правами
    assert detail["creator_id"] == student_id
    assert detail["user_role"] == "teacher"
    assert detail["permissions"]["can_delete_class"] is False
    assert detail["permissions"]["can_manage_members"] is False

    # новый владелец видит себя creator-ом
    r = await client.get(f"/api/classes/{class_id}", headers=_auth(student_token))
    new_owner_detail = r.json()
    assert new_owner_detail["user_role"] == "creator"
    assert new_owner_detail["permissions"]["can_delete_class"] is True

    # роли в секции участников: ровно один creator (новый), бывший — teacher
    r = await client.get(
        f"/api/classes/{class_id}/members", headers=_auth(student_token)
    )
    items = r.json()["items"]
    by_id = {m["user_id"]: m["role"] for m in items}
    assert by_id[student_id] == "creator"
    assert by_id[creator_id] == "teacher"


@pytest.mark.asyncio
async def test_after_transfer_new_owner_controls_and_old_cannot(client):
    creator_token, creator_id = await _register(client, "creator@example.com")
    class_id = (await _create_class(client, creator_token))["id"]

    student_token, student_id = await _register(client, "student@example.com")
    await _join_open(client, student_token, class_id)

    await client.post(
        f"/api/classes/{class_id}/transfer-ownership",
        json={"new_owner_id": student_id},
        headers=_auth(creator_token),
    )

    # бывший создатель больше не может удалить класс
    r = await client.delete(f"/api/classes/{class_id}", headers=_auth(creator_token))
    assert r.status_code == 403

    # ...и не может передать класс дальше (он уже не creator)
    r = await client.post(
        f"/api/classes/{class_id}/transfer-ownership",
        json={"new_owner_id": creator_id},
        headers=_auth(creator_token),
    )
    assert r.status_code == 403

    # новый владелец теперь может выгнать бывшего
    r = await client.delete(
        f"/api/classes/{class_id}/members/{creator_id}",
        headers=_auth(student_token),
    )
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_transfer_hides_join_code_from_old_owner(client):
    """Для закрытого класса join_code должен уйти от бывшего владельца к новому."""
    creator_token, _ = await _register(client, "creator@example.com")
    cls = await _create_class(client, creator_token, ctype="closed")
    class_id = cls["id"]
    code = cls["join_code"]

    student_token, student_id = await _register(client, "student@example.com")
    await client.post(
        "/api/classes/join", json={"code": code}, headers=_auth(student_token)
    )

    r = await client.post(
        f"/api/classes/{class_id}/transfer-ownership",
        json={"new_owner_id": student_id},
        headers=_auth(creator_token),
    )
    # бывший создатель (теперь teacher) код больше не видит
    assert r.json()["join_code"] is None

    # новый владелец видит код в деталях
    r = await client.get(f"/api/classes/{class_id}", headers=_auth(student_token))
    assert r.json()["join_code"] == code


@pytest.mark.asyncio
async def test_transfer_to_self_conflict(client):
    creator_token, creator_id = await _register(client, "creator@example.com")
    class_id = (await _create_class(client, creator_token))["id"]

    r = await client.post(
        f"/api/classes/{class_id}/transfer-ownership",
        json={"new_owner_id": creator_id},
        headers=_auth(creator_token),
    )
    assert r.status_code == 409


@pytest.mark.asyncio
async def test_transfer_to_non_member_404(client):
    creator_token, _ = await _register(client, "creator@example.com")
    class_id = (await _create_class(client, creator_token))["id"]

    _, outsider_id = await _register(client, "outsider@example.com")

    r = await client.post(
        f"/api/classes/{class_id}/transfer-ownership",
        json={"new_owner_id": outsider_id},
        headers=_auth(creator_token),
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_non_creator_cannot_transfer(client):
    creator_token, _ = await _register(client, "creator@example.com")
    class_id = (await _create_class(client, creator_token))["id"]

    student_token, student_id = await _register(client, "student@example.com")
    await _join_open(client, student_token, class_id)

    # студент пытается передать класс самому себе → 403 (не creator)
    r = await client.post(
        f"/api/classes/{class_id}/transfer-ownership",
        json={"new_owner_id": student_id},
        headers=_auth(student_token),
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_transfer_to_kicked_member_404(client):
    """Передать класс выбывшему участнику нельзя — он уже не активный член."""
    creator_token, _ = await _register(client, "creator@example.com")
    class_id = (await _create_class(client, creator_token))["id"]

    student_token, student_id = await _register(client, "student@example.com")
    await _join_open(client, student_token, class_id)
    await client.delete(
        f"/api/classes/{class_id}/members/{student_id}",
        headers=_auth(creator_token),
    )

    r = await client.post(
        f"/api/classes/{class_id}/transfer-ownership",
        json={"new_owner_id": student_id},
        headers=_auth(creator_token),
    )
    assert r.status_code == 404
