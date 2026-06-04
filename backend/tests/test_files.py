"""Тесты защищённых файлов материалов и решений."""

from pathlib import Path

import pytest

from app.config import settings


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


async def _setup(client):
    creator_token, _ = await _register(client, "creator@example.com")
    response = await client.post(
        "/api/classes",
        json={"name": "Файлы", "type": "open"},
        headers=_auth(creator_token),
    )
    class_id = response.json()["id"]

    student_token, _ = await _register(client, "student@example.com")
    response = await client.post(
        f"/api/classes/{class_id}/join-open",
        headers=_auth(student_token),
    )
    assert response.status_code == 201

    response = await client.post(
        f"/api/classes/{class_id}/assignments",
        json={"title": "Задание", "max_grade": 10},
        headers=_auth(creator_token),
    )
    assignment_id = response.json()["id"]
    return creator_token, student_token, class_id, assignment_id


async def _upload_material(client, token: str, class_id: int, assignment_id: int, name: str, content: bytes):
    return await client.post(
        f"/api/classes/{class_id}/assignments/{assignment_id}/material-file",
        files={"upload": (name, content, "application/pdf")},
        headers=_auth(token),
    )


@pytest.mark.asyncio
async def test_material_file_is_protected_replaced_and_deleted(client):
    creator_token, student_token, class_id, assignment_id = await _setup(client)
    outsider_token, _ = await _register(client, "outsider@example.com")

    response = await _upload_material(
        client, creator_token, class_id, assignment_id, "../first.pdf", b"first"
    )
    assert response.status_code == 200, response.text
    first = response.json()
    assert first["name"] == "first.pdf"
    assert first["size"] == 5
    first_path = next(Path(settings.UPLOAD_DIR).iterdir())
    assert first_path.name != first["name"]

    response = await client.get(first["download_url"], headers=_auth(student_token))
    assert response.status_code == 200
    assert response.content == b"first"
    response = await client.get(first["download_url"], headers=_auth(outsider_token))
    assert response.status_code == 403

    response = await _upload_material(
        client, creator_token, class_id, assignment_id, "second.pdf", b"second"
    )
    assert response.status_code == 200
    second = response.json()
    assert not first_path.exists()
    response = await client.get(first["download_url"], headers=_auth(creator_token))
    assert response.status_code == 404

    response = await client.delete(
        f"/api/classes/{class_id}/assignments/{assignment_id}/material-file",
        headers=_auth(creator_token),
    )
    assert response.status_code == 204
    assert list(Path(settings.UPLOAD_DIR).iterdir()) == []
    response = await client.get(second["download_url"], headers=_auth(creator_token))
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_old_assignment_material_is_hidden_from_late_student(client):
    creator_token, _ = await _register(client, "creator@example.com")
    response = await client.post(
        "/api/classes",
        json={"name": "Файлы", "type": "open"},
        headers=_auth(creator_token),
    )
    class_id = response.json()["id"]
    response = await client.post(
        f"/api/classes/{class_id}/assignments",
        json={"title": "Старое", "max_grade": 10},
        headers=_auth(creator_token),
    )
    assignment_id = response.json()["id"]
    response = await _upload_material(
        client, creator_token, class_id, assignment_id, "old.pdf", b"old"
    )
    download_url = response.json()["download_url"]

    student_token, _ = await _register(client, "late@example.com")
    await client.post(
        f"/api/classes/{class_id}/join-open",
        headers=_auth(student_token),
    )
    response = await client.get(download_url, headers=_auth(student_token))
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_submission_attachment_access_status_and_cleanup(client):
    creator_token, student_token, class_id, assignment_id = await _setup(client)
    outsider_token, _ = await _register(client, "outsider@example.com")

    response = await client.post(
        f"/api/assignments/{assignment_id}/my-submission/attachment-file",
        files={"upload": ("answer.txt", b"answer", "text/plain")},
        headers=_auth(student_token),
    )
    assert response.status_code == 200, response.text
    uploaded = response.json()

    response = await client.get(uploaded["download_url"], headers=_auth(student_token))
    assert response.status_code == 200
    assert response.content == b"answer"
    response = await client.get(uploaded["download_url"], headers=_auth(creator_token))
    assert response.status_code == 200
    response = await client.get(uploaded["download_url"], headers=_auth(outsider_token))
    assert response.status_code == 403

    response = await client.post(
        f"/api/assignments/{assignment_id}/my-submission/submit",
        headers=_auth(student_token),
    )
    assert response.status_code == 200
    response = await client.delete(
        f"/api/assignments/{assignment_id}/my-submission/attachment-file",
        headers=_auth(student_token),
    )
    assert response.status_code == 409

    response = await client.delete(
        f"/api/classes/{class_id}/assignments/{assignment_id}",
        headers=_auth(creator_token),
    )
    assert response.status_code == 204
    assert list(Path(settings.UPLOAD_DIR).iterdir()) == []
    response = await client.get(uploaded["download_url"], headers=_auth(creator_token))
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_upload_validation_and_author_permissions(client, monkeypatch):
    creator_token, student_token, class_id, assignment_id = await _setup(client)

    response = await client.post(
        f"/api/classes/{class_id}/assignments/{assignment_id}/material-file",
        files={"upload": ("script.exe", b"x", "application/octet-stream")},
        headers=_auth(creator_token),
    )
    assert response.status_code == 422

    response = await client.post(
        f"/api/classes/{class_id}/assignments/{assignment_id}/material-file",
        files={"upload": ("fake.pdf", b"x", "text/plain")},
        headers=_auth(creator_token),
    )
    assert response.status_code == 422

    monkeypatch.setattr(settings, "MAX_UPLOAD_SIZE", 4)
    response = await _upload_material(
        client, creator_token, class_id, assignment_id, "large.pdf", b"12345"
    )
    assert response.status_code == 413
    assert not Path(settings.UPLOAD_DIR).exists() or list(Path(settings.UPLOAD_DIR).iterdir()) == []

    response = await _upload_material(
        client, student_token, class_id, assignment_id, "student.pdf", b"x"
    )
    assert response.status_code == 403
