"""Тесты на обогащённый AssignmentDTO (my_submission / stats) и DELETE оценки.

Покрывают интересы фронта: студент видит свой статус прямо в списке заданий,
преподаватель — прогресс сдачи, без N+1 запросов.
"""

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


async def _make_assignment(client, token: str, class_id: int) -> int:
    r = await client.post(
        f"/api/classes/{class_id}/assignments",
        json={"title": "ДЗ 1", "description": "desc", "max_grade": 100},
        headers=_auth(token),
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def _save_and_submit(client, token: str, aid: int) -> int:
    r = await client.put(
        f"/api/assignments/{aid}/my-submission",
        json={"answer_text": "решение"},
        headers=_auth(token),
    )
    assert r.status_code == 200, r.text
    r = await client.post(
        f"/api/assignments/{aid}/my-submission/submit", headers=_auth(token)
    )
    assert r.status_code == 200, r.text
    return r.json()["id"]


# --- my_submission для студента ----------------------------------------------


@pytest.mark.asyncio
async def test_student_sees_no_submission_before_submitting(client):
    creator_token, _ = await _register(client, "c@example.com")
    class_id = await _create_class(client, creator_token)
    await _make_assignment(client, creator_token, class_id)

    student_token, _ = await _register(client, "s@example.com")
    await _join_open(client, student_token, class_id)

    r = await client.get(
        f"/api/classes/{class_id}/assignments", headers=_auth(student_token)
    )
    assert r.status_code == 200
    item = r.json()["items"][0]
    # студент ещё не создавал решение → my_submission null, stats скрыт
    assert item["my_submission"] is None
    assert item["stats"] is None


@pytest.mark.asyncio
async def test_student_sees_own_submission_status_and_grade(client):
    creator_token, _ = await _register(client, "c@example.com")
    class_id = await _create_class(client, creator_token)
    aid = await _make_assignment(client, creator_token, class_id)

    student_token, _ = await _register(client, "s@example.com")
    await _join_open(client, student_token, class_id)
    sid = await _save_and_submit(client, student_token, aid)

    # после submit — статус submitted, оценки ещё нет
    r = await client.get(
        f"/api/classes/{class_id}/assignments", headers=_auth(student_token)
    )
    my = r.json()["items"][0]["my_submission"]
    assert my["submission_id"] == sid
    assert my["status"] == "submitted"
    assert my["grade"] is None
    assert my["is_late"] is False

    # преподаватель оценил → студент видит оценку в списке без отдельного запроса
    await client.put(
        f"/api/submissions/{sid}/grade",
        json={"value": 87},
        headers=_auth(creator_token),
    )
    r = await client.get(
        f"/api/classes/{class_id}/assignments/{aid}", headers=_auth(student_token)
    )
    my = r.json()["my_submission"]
    assert my["status"] == "graded"
    assert my["grade"] == 87


# --- stats для преподавателя --------------------------------------------------


@pytest.mark.asyncio
async def test_teacher_sees_submission_stats(client):
    creator_token, _ = await _register(client, "c@example.com")
    class_id = await _create_class(client, creator_token)
    aid = await _make_assignment(client, creator_token, class_id)

    # три студента, двое сдают, одного потом оценим
    tokens = []
    for i in range(3):
        t, _ = await _register(client, f"s{i}@example.com")
        await _join_open(client, t, class_id)
        tokens.append(t)

    sid0 = await _save_and_submit(client, tokens[0], aid)
    await _save_and_submit(client, tokens[1], aid)
    # третий только черновик, без submit
    await client.put(
        f"/api/assignments/{aid}/my-submission",
        json={"answer_text": "draft"},
        headers=_auth(tokens[2]),
    )

    await client.put(
        f"/api/submissions/{sid0}/grade",
        json={"value": 50},
        headers=_auth(creator_token),
    )

    r = await client.get(
        f"/api/classes/{class_id}/assignments", headers=_auth(creator_token)
    )
    item = r.json()["items"][0]
    assert item["my_submission"] is None  # creator не студент
    stats = item["stats"]
    assert stats["students_total"] == 3
    assert stats["submitted_count"] == 2  # двое сдали (черновик не считается)
    assert stats["graded_count"] == 1


@pytest.mark.asyncio
async def test_create_assignment_returns_empty_stats(client):
    creator_token, _ = await _register(client, "c@example.com")
    class_id = await _create_class(client, creator_token)

    student_token, _ = await _register(client, "s@example.com")
    await _join_open(client, student_token, class_id)

    r = await client.post(
        f"/api/classes/{class_id}/assignments",
        json={"title": "Новое", "max_grade": 10},
        headers=_auth(creator_token),
    )
    assert r.status_code == 201
    stats = r.json()["stats"]
    assert stats == {"students_total": 1, "submitted_count": 0, "graded_count": 0}


# --- DELETE оценки ------------------------------------------------------------


@pytest.mark.asyncio
async def test_teacher_can_delete_grade(client):
    creator_token, _ = await _register(client, "c@example.com")
    class_id = await _create_class(client, creator_token)
    aid = await _make_assignment(client, creator_token, class_id)

    student_token, _ = await _register(client, "s@example.com")
    await _join_open(client, student_token, class_id)
    sid = await _save_and_submit(client, student_token, aid)

    await client.put(
        f"/api/submissions/{sid}/grade",
        json={"value": 90},
        headers=_auth(creator_token),
    )

    # снимаем оценку → решение возвращается в submitted, оценки больше нет
    r = await client.delete(
        f"/api/submissions/{sid}/grade", headers=_auth(creator_token)
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "submitted"
    assert body["grade"] is None

    # GET оценки теперь 404
    r = await client.get(
        f"/api/submissions/{sid}/grade", headers=_auth(creator_token)
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_delete_grade_without_grade_is_404(client):
    creator_token, _ = await _register(client, "c@example.com")
    class_id = await _create_class(client, creator_token)
    aid = await _make_assignment(client, creator_token, class_id)

    student_token, _ = await _register(client, "s@example.com")
    await _join_open(client, student_token, class_id)
    sid = await _save_and_submit(client, student_token, aid)

    # оценки ещё не было
    r = await client.delete(
        f"/api/submissions/{sid}/grade", headers=_auth(creator_token)
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_student_cannot_delete_grade(client):
    creator_token, _ = await _register(client, "c@example.com")
    class_id = await _create_class(client, creator_token)
    aid = await _make_assignment(client, creator_token, class_id)

    student_token, _ = await _register(client, "s@example.com")
    await _join_open(client, student_token, class_id)
    sid = await _save_and_submit(client, student_token, aid)
    await client.put(
        f"/api/submissions/{sid}/grade",
        json={"value": 90},
        headers=_auth(creator_token),
    )

    r = await client.delete(
        f"/api/submissions/{sid}/grade", headers=_auth(student_token)
    )
    assert r.status_code == 403
