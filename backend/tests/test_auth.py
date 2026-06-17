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
async def test_register_rejects_easy_password(client):
    r = await client.post(
        "/api/auth/register",
        json={"email": "weak@example.com", "password": "12345678"},
    )
    assert r.status_code == 400
    assert "Слишком легкий пароль" in r.json()["detail"]


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


@pytest.mark.asyncio
async def test_long_cyrillic_password_register_and_login(client):
    """Регрессия: пароль > 72 байт (кириллица) не должен ронять регистрацию в 500.

    bcrypt сам по себе на таком пароле бросает ValueError; прехеш sha256+base64
    в password_service снимает лимит. Проверяем полный цикл register → login.
    """
    # 50 кириллических символов = 100 байт UTF-8, заведомо больше 72
    long_password = "пароль" * 9  # 54 символа, 108 байт
    email = "longpass@example.com"

    r = await client.post(
        "/api/auth/register",
        json={"email": email, "password": long_password},
    )
    assert r.status_code == 201, r.text

    # тем же длинным паролем логинимся успешно
    r = await client.post(
        "/api/auth/login",
        json={"email": email, "password": long_password},
    )
    assert r.status_code == 200, r.text

    # неверный пароль той же длины — 401, а не 500
    r = await client.post(
        "/api/auth/login",
        json={"email": email, "password": "другой" * 9},
    )
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_passwords_differing_after_72_bytes_are_distinct(client):
    """Прехеш sha256 учитывает весь пароль целиком — два пароля, совпадающие
    в первых 72 байтах, но разные дальше, не должны считаться одинаковыми
    (старый bcrypt-в-лоб обрезал бы хвост и пустил бы по обоим)."""
    base = "a" * 72
    email = "tail@example.com"

    r = await client.post(
        "/api/auth/register",
        json={"email": email, "password": base + "ZZZ"},
    )
    assert r.status_code == 201, r.text

    # тот же префикс, другой хвост → доступа быть не должно
    r = await client.post(
        "/api/auth/login",
        json={"email": email, "password": base + "QQQ"},
    )
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_patch_me_updates_fields_and_keeps_token_valid(client):
    r = await client.post(
        "/api/auth/register",
        json={"email": "patchme@example.com", "password": "password123"},
    )
    access = r.json()["access_token"]

    r = await client.patch(
        "/api/auth/me",
        json={
            "email": "  NEW@Example.COM  ",
            "first_name": " Анна ",
            "last_name": " Иванова ",
        },
        headers={"Authorization": f"Bearer {access}"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["email"] == "new@example.com"
    assert body["first_name"] == "Анна"
    assert body["last_name"] == "Иванова"

    r = await client.get(
        "/api/auth/me", headers={"Authorization": f"Bearer {access}"}
    )
    assert r.status_code == 200
    assert r.json()["email"] == "new@example.com"


@pytest.mark.asyncio
async def test_patch_me_empty_body_and_duplicate_email(client):
    r1 = await client.post(
        "/api/auth/register",
        json={"email": "u1@example.com", "password": "password123"},
    )
    access = r1.json()["access_token"]

    await client.post(
        "/api/auth/register",
        json={"email": "u2@example.com", "password": "password123"},
    )

    r = await client.patch(
        "/api/auth/me",
        json={},
        headers={"Authorization": f"Bearer {access}"},
    )
    assert r.status_code == 422

    r = await client.patch(
        "/api/auth/me",
        json={"email": "u2@example.com"},
        headers={"Authorization": f"Bearer {access}"},
    )
    assert r.status_code == 409


@pytest.mark.asyncio
async def test_change_password_revokes_other_sessions_but_keeps_current(client):
    r = await client.post(
        "/api/auth/register",
        json={"email": "changepass@example.com", "password": "password123"},
    )
    access1 = r.json()["access_token"]
    refresh1 = r.json()["refresh_token"]

    r = await client.post(
        "/api/auth/login",
        json={"email": "changepass@example.com", "password": "password123"},
    )
    access2 = r.json()["access_token"]

    r = await client.post(
        "/api/auth/change-password",
        json={
            "current_password": "password123",
            "new_password": "new-password-123",
        },
        headers={"Authorization": f"Bearer {access2}"},
    )
    assert r.status_code == 200, r.text
    assert r.json() == {"status": "ok"}

    r = await client.get(
        "/api/auth/me", headers={"Authorization": f"Bearer {access2}"}
    )
    assert r.status_code == 200

    r = await client.get(
        "/api/auth/me", headers={"Authorization": f"Bearer {access1}"}
    )
    assert r.status_code == 401

    r = await client.post("/api/auth/refresh", json={"refresh_token": refresh1})
    assert r.status_code == 401

    r = await client.post(
        "/api/auth/login",
        json={"email": "changepass@example.com", "password": "password123"},
    )
    assert r.status_code == 401

    r = await client.post(
        "/api/auth/login",
        json={"email": "changepass@example.com", "password": "new-password-123"},
    )
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_change_password_with_wrong_current_password(client):
    r = await client.post(
        "/api/auth/register",
        json={"email": "wrongcurrent@example.com", "password": "password123"},
    )
    access = r.json()["access_token"]

    r = await client.post(
        "/api/auth/change-password",
        json={
            "current_password": "wrong-password",
            "new_password": "new-password-123",
        },
        headers={"Authorization": f"Bearer {access}"},
    )
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_change_password_rejects_same_password(client):
    r = await client.post(
        "/api/auth/register",
        json={"email": "samepass@example.com", "password": "password123"},
    )
    access = r.json()["access_token"]

    r = await client.post(
        "/api/auth/change-password",
        json={
            "current_password": "password123",
            "new_password": "password123",
        },
        headers={"Authorization": f"Bearer {access}"},
    )
    assert r.status_code == 409
    assert "Новый пароль должен отличаться от текущего" in r.json()["detail"]


@pytest.mark.asyncio
async def test_change_password_rejects_easy_password(client):
    r = await client.post(
        "/api/auth/register",
        json={"email": "weakchange@example.com", "password": "Abcdef12"},
    )
    access = r.json()["access_token"]

    r = await client.post(
        "/api/auth/change-password",
        json={
            "current_password": "Abcdef12",
            "new_password": "12345678",
        },
        headers={"Authorization": f"Bearer {access}"},
    )
    assert r.status_code == 400
    assert "Слишком легкий пароль" in r.json()["detail"]
