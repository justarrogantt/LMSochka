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


@pytest.mark.asyncio
async def test_create_open_class_and_list(client):
    token = await _register(client, "teacher@example.com")

    r = await client.post(
        "/api/classes",
        json={"name": "Math 101", "type": "open"},
        headers=_auth(token),
    )
    assert r.status_code == 201, r.text
    cls = r.json()
    assert cls["name"] == "Math 101"
    assert cls["type"] == "open"
    assert cls["join_code"] is None  # у открытого класса кода нет

    r = await client.get("/api/classes/my", headers=_auth(token))
    assert r.status_code == 200
    my = r.json()
    assert len(my) == 1
    assert my[0]["role"] == "creator"


@pytest.mark.asyncio
async def test_create_closed_class_has_code(client):
    token = await _register(client, "teacher@example.com")
    r = await client.post(
        "/api/classes",
        json={"name": "Secret Club", "type": "closed"},
        headers=_auth(token),
    )
    assert r.status_code == 201
    cls = r.json()
    assert cls["type"] == "closed"
    assert cls["join_code"] is not None
    assert len(cls["join_code"]) == 8


@pytest.mark.asyncio
async def test_join_open_class(client):
    creator_token = await _register(client, "creator@example.com")
    r = await client.post(
        "/api/classes",
        json={"name": "Open Class", "type": "open"},
        headers=_auth(creator_token),
    )
    class_id = r.json()["id"]

    student_token = await _register(client, "student@example.com")
    r = await client.post(
        f"/api/classes/{class_id}/join", headers=_auth(student_token)
    )
    assert r.status_code == 201, r.text
    assert r.json()["role"] == "student"

    # повторное присоединение → 409
    r = await client.post(
        f"/api/classes/{class_id}/join", headers=_auth(student_token)
    )
    assert r.status_code == 409


@pytest.mark.asyncio
async def test_join_closed_class_by_code(client):
    creator_token = await _register(client, "creator@example.com")
    r = await client.post(
        "/api/classes",
        json={"name": "Closed", "type": "closed"},
        headers=_auth(creator_token),
    )
    code = r.json()["join_code"]
    class_id = r.json()["id"]

    student_token = await _register(client, "student@example.com")
    r = await client.post(
        "/api/classes/join", json={"code": code}, headers=_auth(student_token)
    )
    assert r.status_code == 201
    assert r.json()["class_id"] == class_id
    assert r.json()["role"] == "student"

    # неверный код
    r = await client.post(
        "/api/classes/join", json={"code": "INVALID1"}, headers=_auth(student_token)
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_join_open_via_code_endpoint_should_fail(client):
    """Открытые классы не должны находиться через /join (у них нет кода)."""
    creator_token = await _register(client, "creator@example.com")
    await client.post(
        "/api/classes",
        json={"name": "Open", "type": "open"},
        headers=_auth(creator_token),
    )

    student_token = await _register(client, "student@example.com")
    r = await client.post(
        "/api/classes/join",
        json={"code": "ANYTHING"},
        headers=_auth(student_token),
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_join_closed_class_via_open_endpoint_forbidden(client):
    creator_token = await _register(client, "creator@example.com")
    r = await client.post(
        "/api/classes",
        json={"name": "Closed", "type": "closed"},
        headers=_auth(creator_token),
    )
    class_id = r.json()["id"]

    student_token = await _register(client, "student@example.com")
    r = await client.post(
        f"/api/classes/{class_id}/join", headers=_auth(student_token)
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_get_role(client):
    creator_token = await _register(client, "creator@example.com")
    r = await client.post(
        "/api/classes",
        json={"name": "Class", "type": "open"},
        headers=_auth(creator_token),
    )
    class_id = r.json()["id"]

    # creator видит свою роль
    r = await client.get(
        f"/api/classes/{class_id}/role", headers=_auth(creator_token)
    )
    assert r.status_code == 200
    assert r.json()["role"] == "creator"

    # сторонний юзер — 404
    outsider_token = await _register(client, "outsider@example.com")
    r = await client.get(
        f"/api/classes/{class_id}/role", headers=_auth(outsider_token)
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_classes_require_auth(client):
    r = await client.get("/api/classes/my")
    assert r.status_code in (401, 403)
