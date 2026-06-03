"""Тесты на notifications REST, триггеры событий и WebSocket-доставку."""

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.main import app


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


async def _create_class(client, token: str, name: str = "Class") -> int:
    r = await client.post(
        "/api/classes",
        json={"name": name, "type": "open"},
        headers=_auth(token),
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def _join_open(client, token: str, class_id: int) -> None:
    r = await client.post(f"/api/classes/{class_id}/join-open", headers=_auth(token))
    assert r.status_code == 201, r.text


async def _promote(client, creator_token: str, class_id: int, user_id: int) -> None:
    r = await client.patch(
        f"/api/classes/{class_id}/members/{user_id}/role",
        json={"role": "teacher"},
        headers=_auth(creator_token),
    )
    assert r.status_code == 200, r.text


async def _make_assignment(client, token: str, class_id: int, title: str = "ДЗ 1") -> int:
    r = await client.post(
        f"/api/classes/{class_id}/assignments",
        json={"title": title, "description": "", "max_grade": 100},
        headers=_auth(token),
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def _submit(client, token: str, aid: int) -> int:
    r = await client.put(
        f"/api/assignments/{aid}/my-submission",
        json={"answer_text": "answer"},
        headers=_auth(token),
    )
    assert r.status_code == 200, r.text
    sid = r.json()["id"]
    r = await client.post(
        f"/api/assignments/{aid}/my-submission/submit", headers=_auth(token)
    )
    assert r.status_code == 200, r.text
    return sid


@pytest.mark.asyncio
async def test_notifications_rest_and_triggers(client):
    creator_token, _ = await _register(client, "creator@example.com")
    teacher_token, teacher_id = await _register(client, "teacher@example.com")
    student_token, _ = await _register(client, "student@example.com")
    outsider_token, _ = await _register(client, "outsider@example.com")

    class_id = await _create_class(client, creator_token, "Математика 10А")
    await _join_open(client, teacher_token, class_id)
    await _promote(client, creator_token, class_id, teacher_id)
    await _join_open(client, student_token, class_id)

    r = await client.post(
        f"/api/classes/{class_id}/announcements",
        json={"title": "Важно", "content": "Контрольная в пятницу"},
        headers=_auth(teacher_token),
    )
    assert r.status_code == 201, r.text
    announcement_id = r.json()["id"]

    aid = await _make_assignment(client, creator_token, class_id, "ДЗ 1")
    sid = await _submit(client, student_token, aid)

    r = await client.put(
        f"/api/submissions/{sid}/grade",
        json={"value": 90},
        headers=_auth(creator_token),
    )
    assert r.status_code == 200, r.text

    r = await client.post(
        f"/api/submissions/{sid}/return",
        json={"comment": "Переделай"},
        headers=_auth(creator_token),
    )
    assert r.status_code == 200, r.text

    r = await client.get("/api/notifications", headers=_auth(student_token))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["total"] == 4
    assert body["unread_count"] == 4
    assert [item["type"] for item in body["items"]] == [
        "submission_returned",
        "grade",
        "assignment",
        "announcement",
    ]
    assert body["items"][0]["entity_id"] == sid
    assert body["items"][1]["entity_id"] == sid
    assert body["items"][2]["entity_id"] == aid
    assert body["items"][3]["entity_id"] == announcement_id
    assert body["items"][3]["title"] == "Новое объявление в курсе «Математика 10А»"

    first_id = body["items"][0]["id"]
    r = await client.post(
        f"/api/notifications/{first_id}/read",
        headers=_auth(student_token),
    )
    assert r.status_code == 200, r.text
    assert r.json()["is_read"] is True

    r = await client.post(
        f"/api/notifications/{first_id}/read",
        headers=_auth(student_token),
    )
    assert r.status_code == 200
    assert r.json()["is_read"] is True

    r = await client.get("/api/notifications", headers=_auth(student_token))
    assert r.json()["unread_count"] == 3

    r = await client.post("/api/notifications/read-all", headers=_auth(student_token))
    assert r.status_code == 200, r.text
    assert r.json() == {"updated_count": 3, "unread_count": 0}

    r = await client.get("/api/notifications", headers=_auth(student_token))
    assert r.json()["unread_count"] == 0

    r = await client.post(
        f"/api/notifications/{first_id}/read",
        headers=_auth(outsider_token),
    )
    assert r.status_code == 404

    r = await client.get("/api/notifications", headers=_auth(teacher_token))
    assert r.json()["items"] == []

    r = await client.get("/api/notifications", headers=_auth(creator_token))
    creator_items = r.json()["items"]
    assert [item["type"] for item in creator_items] == ["announcement"]


@pytest.mark.asyncio
async def test_notifications_pagination(client):
    creator_token, _ = await _register(client, "creator@example.com")
    student_token, _ = await _register(client, "student@example.com")
    class_id = await _create_class(client, creator_token)
    await _join_open(client, student_token, class_id)

    for i in range(3):
        r = await client.post(
            f"/api/classes/{class_id}/announcements",
            json={"title": f"ann {i}", "content": "body"},
            headers=_auth(creator_token),
        )
        assert r.status_code == 201, r.text

    r = await client.get("/api/notifications?page=1&limit=2", headers=_auth(student_token))
    assert r.status_code == 200
    assert r.json()["total"] == 3
    assert r.json()["limit"] == 2
    assert len(r.json()["items"]) == 2

    r = await client.get("/api/notifications?page=2&limit=2", headers=_auth(student_token))
    assert r.status_code == 200
    assert len(r.json()["items"]) == 1


def test_notifications_websocket_live_delivery_and_invalid_token():
    with TestClient(app) as sync_client:
        r = sync_client.post(
            "/api/auth/register",
            json={"email": "creator@example.com", "password": "password123"},
        )
        creator_token = r.json()["access_token"]

        r = sync_client.post(
            "/api/auth/register",
            json={"email": "student@example.com", "password": "password123"},
        )
        student_token = r.json()["access_token"]

        r = sync_client.post(
            "/api/classes",
            json={"name": "Алгебра", "type": "open"},
            headers=_auth(creator_token),
        )
        class_id = r.json()["id"]

        r = sync_client.post(
            f"/api/classes/{class_id}/join-open",
            headers=_auth(student_token),
        )
        assert r.status_code == 201

        with sync_client.websocket_connect(
            f"/api/ws/notifications?token={student_token}"
        ) as websocket:
            r = sync_client.post(
                f"/api/classes/{class_id}/assignments",
                json={"title": "Новая работа", "description": "", "max_grade": 100},
                headers=_auth(creator_token),
            )
            assert r.status_code == 201
            assignment_id = r.json()["id"]

            payload = websocket.receive_json()
            assert payload["type"] == "assignment"
            assert payload["class_id"] == class_id
            assert payload["entity_id"] == assignment_id
            assert payload["is_read"] is False

        with pytest.raises(WebSocketDisconnect) as exc, sync_client.websocket_connect(
            "/api/ws/notifications?token=bad-token"
        ) as websocket:
            websocket.receive_json()
        assert exc.value.code == 1008
