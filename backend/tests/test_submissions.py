"""Тесты на модуль решений: черновики, отправка, права и список для преподавателя."""

from datetime import UTC, datetime, timedelta

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


async def _create_class(client, token: str) -> int:
    r = await client.post(
        "/api/classes",
        json={"name": "Class", "type": "open"},
        headers=_auth(token),
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def _join_open(client, token: str, class_id: int) -> None:
    r = await client.post(
        f"/api/classes/{class_id}/join-open", headers=_auth(token)
    )
    assert r.status_code == 201, r.text


async def _promote(client, creator_token: str, class_id: int, user_id: int) -> None:
    r = await client.patch(
        f"/api/classes/{class_id}/members/{user_id}/role",
        json={"role": "teacher"},
        headers=_auth(creator_token),
    )
    assert r.status_code == 200, r.text


async def _make_assignment(
    client, token: str, class_id: int, *, due_at: str | None = None
) -> int:
    body: dict = {"title": "ДЗ 1", "description": "desc", "max_grade": 100}
    if due_at is not None:
        body["due_at"] = due_at
    r = await client.post(
        f"/api/classes/{class_id}/assignments",
        json=body,
        headers=_auth(token),
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def _setup_class_with_student_and_teacher(client):
    creator_token, _ = await _register(client, "creator@example.com")
    class_id = await _create_class(client, creator_token)

    teacher_token, teacher_id = await _register(client, "teacher@example.com")
    await _join_open(client, teacher_token, class_id)
    await _promote(client, creator_token, class_id, teacher_id)

    student_token, student_id = await _register(client, "student@example.com")
    await _join_open(client, student_token, class_id)

    return creator_token, teacher_token, student_token, student_id, class_id


@pytest.mark.asyncio
async def test_get_my_submission_returns_null_when_absent(client):
    creator_token, _, student_token, _, class_id = await _setup_class_with_student_and_teacher(
        client
    )
    aid = await _make_assignment(client, creator_token, class_id)

    r = await client.get(
        f"/api/assignments/{aid}/my-submission",
        headers=_auth(student_token),
    )
    assert r.status_code == 200, r.text
    assert r.json() is None


@pytest.mark.asyncio
async def test_student_can_create_and_update_draft(client):
    creator_token, _, student_token, _, class_id = await _setup_class_with_student_and_teacher(
        client
    )
    aid = await _make_assignment(client, creator_token, class_id)

    r = await client.put(
        f"/api/assignments/{aid}/my-submission",
        json={
            "answer_text": "first version",
            "attachment_url": "https://example.com/a",
        },
        headers=_auth(student_token),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "draft"
    assert body["answer_text"] == "first version"
    assert body["submitted_at"] is None

    r = await client.put(
        f"/api/assignments/{aid}/my-submission",
        json={"answer_text": "second version"},
        headers=_auth(student_token),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "draft"
    assert body["answer_text"] == "second version"


@pytest.mark.asyncio
async def test_teacher_and_creator_cannot_save_submission(client):
    creator_token, teacher_token, _, _, class_id = await _setup_class_with_student_and_teacher(
        client
    )
    aid = await _make_assignment(client, creator_token, class_id)

    r = await client.put(
        f"/api/assignments/{aid}/my-submission",
        json={"answer_text": "x"},
        headers=_auth(teacher_token),
    )
    assert r.status_code == 403

    r = await client.put(
        f"/api/assignments/{aid}/my-submission",
        json={"answer_text": "x"},
        headers=_auth(creator_token),
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_submit_sets_submitted_and_is_late(client):
    creator_token, _, student_token, _, class_id = await _setup_class_with_student_and_teacher(
        client
    )
    due_at = (datetime.now(UTC) - timedelta(hours=1)).isoformat()
    aid = await _make_assignment(client, creator_token, class_id, due_at=due_at)

    await client.put(
        f"/api/assignments/{aid}/my-submission",
        json={"answer_text": "answer"},
        headers=_auth(student_token),
    )
    r = await client.post(
        f"/api/assignments/{aid}/my-submission/submit",
        headers=_auth(student_token),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "submitted"
    assert body["submitted_at"] is not None
    assert body["is_late"] is True


@pytest.mark.asyncio
async def test_submit_without_draft_returns_404(client):
    creator_token, _, student_token, _, class_id = await _setup_class_with_student_and_teacher(
        client
    )
    aid = await _make_assignment(client, creator_token, class_id)

    r = await client.post(
        f"/api/assignments/{aid}/my-submission/submit",
        headers=_auth(student_token),
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_cannot_edit_after_submit(client):
    creator_token, _, student_token, _, class_id = await _setup_class_with_student_and_teacher(
        client
    )
    aid = await _make_assignment(client, creator_token, class_id)
    await client.put(
        f"/api/assignments/{aid}/my-submission",
        json={"answer_text": "answer"},
        headers=_auth(student_token),
    )
    await client.post(
        f"/api/assignments/{aid}/my-submission/submit",
        headers=_auth(student_token),
    )

    r = await client.put(
        f"/api/assignments/{aid}/my-submission",
        json={"answer_text": "new answer"},
        headers=_auth(student_token),
    )
    assert r.status_code == 409


@pytest.mark.asyncio
async def test_teacher_can_list_submissions_and_filter_by_status(client):
    creator_token, teacher_token, student_token, _, class_id = (
        await _setup_class_with_student_and_teacher(client)
    )
    aid = await _make_assignment(client, creator_token, class_id)

    # submitted
    await client.put(
        f"/api/assignments/{aid}/my-submission",
        json={"answer_text": "final"},
        headers=_auth(student_token),
    )
    await client.post(
        f"/api/assignments/{aid}/my-submission/submit",
        headers=_auth(student_token),
    )

    # draft from second student
    student2_token, _ = await _register(client, "student2@example.com")
    await _join_open(client, student2_token, class_id)
    await client.put(
        f"/api/assignments/{aid}/my-submission",
        json={"answer_text": "draft answer"},
        headers=_auth(student2_token),
    )

    r = await client.get(
        f"/api/assignments/{aid}/submissions",
        headers=_auth(teacher_token),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["total"] == 2
    # submitted_at DESC NULLS LAST: сначала submitted, затем draft (submitted_at=null)
    assert body["items"][0]["status"] == "submitted"
    assert body["items"][1]["status"] == "draft"

    r = await client.get(
        f"/api/assignments/{aid}/submissions?status=submitted",
        headers=_auth(teacher_token),
    )
    assert r.status_code == 200
    assert r.json()["total"] == 1
    assert r.json()["items"][0]["status"] == "submitted"


@pytest.mark.asyncio
async def test_student_cannot_list_submissions(client):
    creator_token, _, student_token, _, class_id = await _setup_class_with_student_and_teacher(
        client
    )
    aid = await _make_assignment(client, creator_token, class_id)

    r = await client.get(
        f"/api/assignments/{aid}/submissions",
        headers=_auth(student_token),
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_get_submission_permissions(client):
    creator_token, teacher_token, student_token, _, class_id = (
        await _setup_class_with_student_and_teacher(client)
    )
    aid = await _make_assignment(client, creator_token, class_id)
    r = await client.put(
        f"/api/assignments/{aid}/my-submission",
        json={"answer_text": "answer"},
        headers=_auth(student_token),
    )
    sid = r.json()["id"]

    r = await client.get(f"/api/submissions/{sid}", headers=_auth(student_token))
    assert r.status_code == 200

    r = await client.get(f"/api/submissions/{sid}", headers=_auth(teacher_token))
    assert r.status_code == 200

    outsider_token, _ = await _register(client, "outsider@example.com")
    r = await client.get(f"/api/submissions/{sid}", headers=_auth(outsider_token))
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_teacher_can_return_submitted_submission(client):
    creator_token, teacher_token, student_token, _, class_id = (
        await _setup_class_with_student_and_teacher(client)
    )
    aid = await _make_assignment(client, creator_token, class_id)

    r = await client.put(
        f"/api/assignments/{aid}/my-submission",
        json={"answer_text": "answer"},
        headers=_auth(student_token),
    )
    sid = r.json()["id"]
    await client.post(
        f"/api/assignments/{aid}/my-submission/submit",
        headers=_auth(student_token),
    )

    r = await client.post(
        f"/api/submissions/{sid}/return",
        json={"comment": "Доработай решение"},
        headers=_auth(teacher_token),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "returned"
    assert body["submitted_at"] is None


@pytest.mark.asyncio
async def test_return_rejected_for_draft(client):
    creator_token, teacher_token, student_token, _, class_id = (
        await _setup_class_with_student_and_teacher(client)
    )
    aid = await _make_assignment(client, creator_token, class_id)
    r = await client.put(
        f"/api/assignments/{aid}/my-submission",
        json={"answer_text": "draft"},
        headers=_auth(student_token),
    )
    sid = r.json()["id"]

    r = await client.post(
        f"/api/submissions/{sid}/return",
        headers=_auth(teacher_token),
    )
    assert r.status_code == 409


@pytest.mark.asyncio
async def test_student_can_edit_after_return(client):
    creator_token, teacher_token, student_token, _, class_id = (
        await _setup_class_with_student_and_teacher(client)
    )
    aid = await _make_assignment(client, creator_token, class_id)
    r = await client.put(
        f"/api/assignments/{aid}/my-submission",
        json={"answer_text": "first"},
        headers=_auth(student_token),
    )
    sid = r.json()["id"]
    await client.post(
        f"/api/assignments/{aid}/my-submission/submit",
        headers=_auth(student_token),
    )
    await client.post(
        f"/api/submissions/{sid}/return",
        headers=_auth(teacher_token),
    )

    r = await client.put(
        f"/api/assignments/{aid}/my-submission",
        json={"answer_text": "fixed"},
        headers=_auth(student_token),
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "returned"
    assert r.json()["answer_text"] == "fixed"


@pytest.mark.asyncio
async def test_my_submission_returns_404_for_deleted_assignment(client):
    creator_token, _, student_token, _, class_id = await _setup_class_with_student_and_teacher(
        client
    )
    aid = await _make_assignment(client, creator_token, class_id)

    r = await client.delete(
        f"/api/classes/{class_id}/assignments/{aid}",
        headers=_auth(creator_token),
    )
    assert r.status_code == 204

    r = await client.get(
        f"/api/assignments/{aid}/my-submission",
        headers=_auth(student_token),
    )
    assert r.status_code == 404
