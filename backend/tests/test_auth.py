import pytest


@pytest.mark.asyncio
async def test_register_login_me_logout(client):
    # register
    r = await client.post(
        "/api/auth/register",
        json={"email": "alice@example.com", "password": "password123"},
    )
    assert r.status_code == 201, r.text
    data = r.json()
    assert data["user"]["email"] == "alice@example.com"
    assert "access_token" in data and "refresh_token" in data

    access = data["access_token"]

    # me
    r = await client.get(
        "/api/auth/me", headers={"Authorization": f"Bearer {access}"}
    )
    assert r.status_code == 200
    assert r.json()["email"] == "alice@example.com"

    # login
    r = await client.post(
        "/api/auth/login",
        json={"email": "alice@example.com", "password": "password123"},
    )
    assert r.status_code == 200
    access2 = r.json()["access_token"]

    # logout invalidates current session
    r = await client.post(
        "/api/auth/logout", headers={"Authorization": f"Bearer {access2}"}
    )
    assert r.status_code == 204

    r = await client.get(
        "/api/auth/me", headers={"Authorization": f"Bearer {access2}"}
    )
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_register_duplicate_email(client):
    await client.post(
        "/api/auth/register",
        json={"email": "bob@example.com", "password": "password123"},
    )
    r = await client.post(
        "/api/auth/register",
        json={"email": "bob@example.com", "password": "password123"},
    )
    assert r.status_code == 409


@pytest.mark.asyncio
async def test_login_wrong_password(client):
    await client.post(
        "/api/auth/register",
        json={"email": "carol@example.com", "password": "password123"},
    )
    r = await client.post(
        "/api/auth/login",
        json={"email": "carol@example.com", "password": "wrongpass1"},
    )
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_refresh_rotation(client):
    r = await client.post(
        "/api/auth/register",
        json={"email": "dave@example.com", "password": "password123"},
    )
    refresh = r.json()["refresh_token"]

    # первое использование — успех, выдаётся новая пара
    r = await client.post("/api/auth/refresh", json={"refresh_token": refresh})
    assert r.status_code == 200, r.text
    new_refresh = r.json()["refresh_token"]
    assert new_refresh != refresh

    # повторное использование старого refresh — должно отозвать всё
    r = await client.post("/api/auth/refresh", json={"refresh_token": refresh})
    assert r.status_code == 401

    # новый refresh тоже теперь невалиден (все сессии юзера отозваны)
    r = await client.post("/api/auth/refresh", json={"refresh_token": new_refresh})
    assert r.status_code == 401
