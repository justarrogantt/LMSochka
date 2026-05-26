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
        f"/api/classes/{class_id}/join-open", headers=_auth(student_token)
    )
    assert r.status_code == 201, r.text
    assert r.json()["role"] == "student"

    # повторное присоединение → 409
    r = await client.post(
        f"/api/classes/{class_id}/join-open", headers=_auth(student_token)
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
        f"/api/classes/{class_id}/join-open", headers=_auth(student_token)
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

    # сторонний юзер не состоит → 403 (класс существует, но не для него)
    outsider_token = await _register(client, "outsider@example.com")
    r = await client.get(
        f"/api/classes/{class_id}/role", headers=_auth(outsider_token)
    )
    assert r.status_code == 403

    # несуществующий класс → 404
    r = await client.get("/api/classes/9999/role", headers=_auth(creator_token))
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_classes_require_auth(client):
    r = await client.get("/api/classes/my")
    assert r.status_code in (401, 403)


@pytest.mark.asyncio
async def test_get_class_detail_for_member(client):
    creator_token = await _register(client, "creator@example.com")
    r = await client.post(
        "/api/classes",
        json={"name": "Detail", "type": "closed"},
        headers=_auth(creator_token),
    )
    cls = r.json()
    class_id = cls["id"]
    code = cls["join_code"]

    # creator видит всё, включая код приглашения
    r = await client.get(f"/api/classes/{class_id}", headers=_auth(creator_token))
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["user_role"] == "creator"
    assert d["join_code"] == code
    assert d["permissions"]["can_delete_class"] is True
    assert d["permissions"]["can_submit_solution"] is False
    assert d["teachers_count"] == 1  # creator считается за teacher для UI
    assert d["students_count"] == 0

    # студент вступил по коду — видит свою роль, но не видит код приглашения
    student_token = await _register(client, "student@example.com")
    await client.post(
        "/api/classes/join", json={"code": code}, headers=_auth(student_token)
    )
    r = await client.get(f"/api/classes/{class_id}", headers=_auth(student_token))
    assert r.status_code == 200
    d = r.json()
    assert d["user_role"] == "student"
    assert d["join_code"] is None  # студент не должен видеть код
    assert d["permissions"]["can_delete_class"] is False
    assert d["permissions"]["can_submit_solution"] is True
    assert d["students_count"] == 1


@pytest.mark.asyncio
async def test_get_class_detail_forbidden_for_outsider(client):
    creator_token = await _register(client, "creator@example.com")
    r = await client.post(
        "/api/classes",
        json={"name": "Private", "type": "open"},
        headers=_auth(creator_token),
    )
    class_id = r.json()["id"]

    outsider_token = await _register(client, "outsider@example.com")
    r = await client.get(f"/api/classes/{class_id}", headers=_auth(outsider_token))
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_get_class_detail_404(client):
    token = await _register(client, "u@example.com")
    r = await client.get("/api/classes/9999", headers=_auth(token))
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_get_members(client):
    creator_token = await _register(client, "creator@example.com")
    r = await client.post(
        "/api/classes",
        json={"name": "Class", "type": "open"},
        headers=_auth(creator_token),
    )
    class_id = r.json()["id"]

    student_token = await _register(client, "student@example.com")
    await client.post(
        f"/api/classes/{class_id}/join-open", headers=_auth(student_token)
    )

    r = await client.get(
        f"/api/classes/{class_id}/members", headers=_auth(creator_token)
    )
    assert r.status_code == 200
    members = r.json()
    assert len(members) == 2
    roles = {m["role"] for m in members}
    assert roles == {"creator", "student"}

    # outsider не видит участников
    outsider_token = await _register(client, "out@example.com")
    r = await client.get(
        f"/api/classes/{class_id}/members", headers=_auth(outsider_token)
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_public_classes_and_search(client):
    creator_token = await _register(client, "creator@example.com")
    for name in ["Python intro", "Python advanced", "Math basics"]:
        await client.post(
            "/api/classes",
            json={"name": name, "type": "open"},
            headers=_auth(creator_token),
        )
    # закрытый класс в каталог попадать не должен
    await client.post(
        "/api/classes",
        json={"name": "Secret", "type": "closed"},
        headers=_auth(creator_token),
    )

    student_token = await _register(client, "student@example.com")
    r = await client.get("/api/classes/public", headers=_auth(student_token))
    assert r.status_code == 200
    names = sorted(c["name"] for c in r.json())
    assert names == ["Math basics", "Python advanced", "Python intro"]

    # поиск
    r = await client.get(
        "/api/classes/public?search=python", headers=_auth(student_token)
    )
    assert r.status_code == 200
    found = r.json()
    assert len(found) == 2
    assert all("Python" in c["name"] for c in found)
    assert all(c["is_member"] is False for c in found)

    # после вступления is_member становится True
    class_id = found[0]["id"]
    await client.post(
        f"/api/classes/{class_id}/join-open", headers=_auth(student_token)
    )
    r = await client.get(
        "/api/classes/public?search=python", headers=_auth(student_token)
    )
    by_id = {c["id"]: c for c in r.json()}
    assert by_id[class_id]["is_member"] is True


@pytest.mark.asyncio
async def test_my_classes_counts(client):
    creator_token = await _register(client, "creator@example.com")
    r = await client.post(
        "/api/classes",
        json={"name": "C", "type": "open"},
        headers=_auth(creator_token),
    )
    class_id = r.json()["id"]

    # три студента вступают
    for i in range(3):
        t = await _register(client, f"s{i}@example.com")
        await client.post(f"/api/classes/{class_id}/join-open", headers=_auth(t))

    r = await client.get("/api/classes/my", headers=_auth(creator_token))
    assert r.status_code == 200
    item = r.json()[0]
    assert item["students_count"] == 3
    assert item["teachers_count"] == 1  # сам creator
