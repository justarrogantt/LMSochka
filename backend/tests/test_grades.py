"""Тесты на модуль оценок и gradebook."""

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


async def _make_assignment(client, token: str, class_id: int, max_grade: float = 100.0) -> int:
    r = await client.post(
        f"/api/classes/{class_id}/assignments",
        json={"title": "ДЗ 1", "description": "desc", "max_grade": max_grade},
        headers=_auth(token),
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def _create_and_submit(client, student_token: str, aid: int) -> int:
    r = await client.put(
        f"/api/assignments/{aid}/my-submission",
        json={"answer_text": "answer"},
        headers=_auth(student_token),
    )
    assert r.status_code == 200, r.text
    sid = r.json()["id"]

    r = await client.post(
        f"/api/assignments/{aid}/my-submission/submit",
        headers=_auth(student_token),
    )
    assert r.status_code == 200, r.text
    return sid


async def _setup(client):
    creator_token, _ = await _register(client, "creator@example.com")
    class_id = await _create_class(client, creator_token)

    teacher_token, teacher_id = await _register(client, "teacher@example.com")
    await _join_open(client, teacher_token, class_id)
    await _promote(client, creator_token, class_id, teacher_id)

    student_token, student_id = await _register(client, "student@example.com")
    await _join_open(client, student_token, class_id)

    return creator_token, teacher_token, student_token, student_id, class_id


@pytest.mark.asyncio
async def test_teacher_can_put_and_get_grade(client):
    creator_token, teacher_token, student_token, _, class_id = await _setup(client)
    aid = await _make_assignment(client, creator_token, class_id, max_grade=50)
    sid = await _create_and_submit(client, student_token, aid)

    r = await client.put(
        f"/api/submissions/{sid}/grade",
        json={"value": 42.5, "comment": "Хорошо"},
        headers=_auth(teacher_token),
    )
    assert r.status_code == 200, r.text
    grade = r.json()
    assert grade["submission_id"] == sid
    assert grade["value"] == 42.5
    assert grade["comment"] == "Хорошо"

    r = await client.get(
        f"/api/submissions/{sid}/grade",
        headers=_auth(student_token),
    )
    assert r.status_code == 200
    assert r.json()["value"] == 42.5


@pytest.mark.asyncio
async def test_put_grade_validations_and_permissions(client):
    creator_token, teacher_token, student_token, _, class_id = await _setup(client)
    aid = await _make_assignment(client, creator_token, class_id, max_grade=10)
    sid = await _create_and_submit(client, student_token, aid)

    # студент не может выставить оценку
    r = await client.put(
        f"/api/submissions/{sid}/grade",
        json={"value": 5},
        headers=_auth(student_token),
    )
    assert r.status_code == 403

    # > max_grade запрещено
    r = await client.put(
        f"/api/submissions/{sid}/grade",
        json={"value": 11},
        headers=_auth(teacher_token),
    )
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_cannot_grade_draft_or_returned(client):
    creator_token, teacher_token, student_token, _, class_id = await _setup(client)
    aid = await _make_assignment(client, creator_token, class_id, max_grade=10)

    # draft
    r = await client.put(
        f"/api/assignments/{aid}/my-submission",
        json={"answer_text": "draft"},
        headers=_auth(student_token),
    )
    assert r.status_code == 200
    sid = r.json()["id"]

    r = await client.put(
        f"/api/submissions/{sid}/grade",
        json={"value": 5},
        headers=_auth(teacher_token),
    )
    assert r.status_code == 409

    await client.post(
        f"/api/assignments/{aid}/my-submission/submit",
        headers=_auth(student_token),
    )
    await client.post(
        f"/api/submissions/{sid}/return",
        json={"comment": "Переделай"},
        headers=_auth(teacher_token),
    )
    r = await client.put(
        f"/api/submissions/{sid}/grade",
        json={"value": 5},
        headers=_auth(teacher_token),
    )
    assert r.status_code == 409


@pytest.mark.asyncio
async def test_max_grade_cannot_change_after_grade_exists(client):
    creator_token, teacher_token, student_token, _, class_id = await _setup(client)
    aid = await _make_assignment(client, creator_token, class_id, max_grade=100)
    sid = await _create_and_submit(client, student_token, aid)

    r = await client.put(
        f"/api/submissions/{sid}/grade",
        json={"value": 80},
        headers=_auth(teacher_token),
    )
    assert r.status_code == 200

    r = await client.patch(
        f"/api/classes/{class_id}/assignments/{aid}",
        json={"max_grade": 120},
        headers=_auth(creator_token),
    )
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_submission_contains_grade_after_grading(client):
    creator_token, teacher_token, student_token, _, class_id = await _setup(client)
    aid = await _make_assignment(client, creator_token, class_id, max_grade=100)
    sid = await _create_and_submit(client, student_token, aid)

    await client.put(
        f"/api/submissions/{sid}/grade",
        json={"value": 90, "comment": "ok"},
        headers=_auth(teacher_token),
    )

    r = await client.get(
        f"/api/submissions/{sid}",
        headers=_auth(student_token),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "graded"
    assert body["grade"]["value"] == 90
    assert body["grade"]["comment"] == "ok"


@pytest.mark.asyncio
async def test_gradebook_includes_inactive_students(client):
    creator_token, teacher_token, student_token, student_id, class_id = await _setup(client)
    aid = await _make_assignment(client, creator_token, class_id, max_grade=100)
    sid = await _create_and_submit(client, student_token, aid)

    await client.put(
        f"/api/submissions/{sid}/grade",
        json={"value": 77},
        headers=_auth(teacher_token),
    )

    # студент выходит, но должен остаться в gradebook как is_active=false
    r = await client.post(
        f"/api/classes/{class_id}/leave",
        headers=_auth(student_token),
    )
    assert r.status_code == 200

    r = await client.get(
        f"/api/classes/{class_id}/gradebook",
        headers=_auth(teacher_token),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert len(body["assignments"]) == 1
    assert body["assignments"][0]["id"] == aid

    by_id = {s["id"]: s for s in body["students"]}
    assert by_id[student_id]["is_active"] is False

    cells = body["cells"]
    assert len(cells) == 1
    assert cells[0]["student_id"] == student_id
    assert cells[0]["assignment_id"] == aid
    assert cells[0]["status"] == "graded"
    assert cells[0]["value"] == 77


@pytest.mark.asyncio
async def test_gradebook_permissions_and_404(client):
    creator_token, _, student_token, _, class_id = await _setup(client)

    r = await client.get(
        f"/api/classes/{class_id}/gradebook",
        headers=_auth(student_token),
    )
    assert r.status_code == 403

    r = await client.get(
        "/api/classes/999999/gradebook",
        headers=_auth(creator_token),
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_return_clears_grade(client):
    """Возврат оценённого решения на доработку снимает оценку: студент не должен
    видеть устаревший балл на решении, которое ещё переделывает."""
    creator_token, teacher_token, student_token, _, class_id = await _setup(client)
    aid = await _make_assignment(client, creator_token, class_id, max_grade=10)
    sid = await _create_and_submit(client, student_token, aid)

    # оценили
    r = await client.put(
        f"/api/submissions/{sid}/grade",
        json={"value": 8},
        headers=_auth(teacher_token),
    )
    assert r.status_code == 200

    # вернули на доработку
    r = await client.post(
        f"/api/submissions/{sid}/return",
        json={"comment": "переделай"},
        headers=_auth(teacher_token),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "returned"
    assert body["grade"] is None  # оценка снята вместе с возвратом

    # GET оценки теперь 404
    r = await client.get(
        f"/api/submissions/{sid}/grade", headers=_auth(teacher_token)
    )
    assert r.status_code == 404

    # в списке заданий у студента тоже нет старого балла
    r = await client.get(
        f"/api/classes/{class_id}/assignments/{aid}", headers=_auth(student_token)
    )
    my = r.json()["my_submission"]
    assert my["status"] == "returned"
    assert my["grade"] is None
