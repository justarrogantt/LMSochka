"""Тесты на агрегированную сводку оценок текущего пользователя."""

import pytest


async def _register(client, email: str) -> tuple[str, str, int]:
    r = await client.post(
        "/api/auth/register",
        json={"email": email, "password": "password123"},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    return body["access_token"], body["refresh_token"], body["user"]["id"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _create_class(client, token: str, name: str) -> int:
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


async def _make_assignment(client, token: str, class_id: int, title: str, max_grade: float) -> int:
    r = await client.post(
        f"/api/classes/{class_id}/assignments",
        json={"title": title, "description": "", "max_grade": max_grade},
        headers=_auth(token),
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def _submit(client, token: str, aid: int, answer_text: str = "answer") -> int:
    r = await client.put(
        f"/api/assignments/{aid}/my-submission",
        json={"answer_text": answer_text},
        headers=_auth(token),
    )
    assert r.status_code == 200, r.text
    sid = r.json()["id"]
    r = await client.post(
        f"/api/assignments/{aid}/my-submission/submit",
        headers=_auth(token),
    )
    assert r.status_code == 200, r.text
    return sid


@pytest.mark.asyncio
async def test_student_grades_overview(client):
    creator_token, _, _ = await _register(client, "creator@example.com")
    class_id = await _create_class(client, creator_token, "Математика")

    student_token, _, _ = await _register(client, "student@example.com")
    await _join_open(client, student_token, class_id)

    aid1 = await _make_assignment(client, creator_token, class_id, "ДЗ 1", 100)
    aid2 = await _make_assignment(client, creator_token, class_id, "ДЗ 2", 50)

    sid1 = await _submit(client, student_token, aid1)
    await _submit(client, student_token, aid2)

    r = await client.put(
        f"/api/submissions/{sid1}/grade",
        json={"value": 50},
        headers=_auth(creator_token),
    )
    assert r.status_code == 200, r.text

    r = await client.get("/api/me/grades", headers=_auth(student_token))
    assert r.status_code == 200, r.text
    body = r.json()
    assert len(body["courses"]) == 1
    course = body["courses"][0]
    assert course["class_id"] == class_id
    assert course["role"] == "student"
    assert course["average_percent"] == 50.0
    assert course["graded_count"] == 1
    assert course["assignments_count"] == 2
    assert course["pending_count"] == 1


@pytest.mark.asyncio
async def test_teacher_grades_overview_and_inactive_classes_excluded(client):
    creator_token, _, creator_id = await _register(client, "creator@example.com")
    class_id = await _create_class(client, creator_token, "Физика")

    teacher_token, _, teacher_id = await _register(client, "teacher@example.com")
    await _join_open(client, teacher_token, class_id)
    await _promote(client, creator_token, class_id, teacher_id)

    s1_token, _, _ = await _register(client, "s1@example.com")
    s2_token, _, _ = await _register(client, "s2@example.com")
    await _join_open(client, s1_token, class_id)
    await _join_open(client, s2_token, class_id)

    aid1 = await _make_assignment(client, creator_token, class_id, "ЛР 1", 100)
    aid2 = await _make_assignment(client, creator_token, class_id, "ЛР 2", 100)

    sid1 = await _submit(client, s1_token, aid1)
    sid2 = await _submit(client, s2_token, aid2)

    r = await client.put(
        f"/api/submissions/{sid1}/grade",
        json={"value": 80},
        headers=_auth(teacher_token),
    )
    assert r.status_code == 200, r.text
    r = await client.put(
        f"/api/submissions/{sid2}/grade",
        json={"value": 50},
        headers=_auth(teacher_token),
    )
    assert r.status_code == 200, r.text

    old_class_id = await _create_class(client, creator_token, "Старый курс")
    await _join_open(client, teacher_token, old_class_id)
    await _promote(client, creator_token, old_class_id, teacher_id)
    r = await client.post(f"/api/classes/{old_class_id}/leave", headers=_auth(teacher_token))
    assert r.status_code == 200, r.text

    r = await client.get("/api/me/grades", headers=_auth(teacher_token))
    assert r.status_code == 200, r.text
    courses = {course["class_id"]: course for course in r.json()["courses"]}
    assert set(courses) == {class_id}
    course = courses[class_id]
    assert course["role"] == "teacher"
    assert course["average_percent"] == 65.0
    assert course["graded_count"] == 2
    assert course["assignments_count"] == 4
    assert course["pending_count"] == 2

    r = await client.get("/api/me/grades", headers=_auth(creator_token))
    assert r.status_code == 200, r.text
    creator_courses = {course["class_id"]: course for course in r.json()["courses"]}
    assert creator_courses[class_id]["role"] == "creator"
    assert creator_courses[class_id]["assignments_count"] == 4
    assert creator_courses[class_id]["graded_count"] == 2
    assert creator_courses[class_id]["average_percent"] == 65.0

    # отдельная регрессия: пользователь, вышедший из класса, не видит его в overview
    leaver_token, _, _ = await _register(client, "leaver@example.com")
    leave_class_id = await _create_class(client, creator_token, "Химия")
    await _join_open(client, leaver_token, leave_class_id)
    r = await client.post(f"/api/classes/{leave_class_id}/leave", headers=_auth(leaver_token))
    assert r.status_code == 200, r.text
    r = await client.get("/api/me/grades", headers=_auth(leaver_token))
    assert r.status_code == 200, r.text
    assert r.json()["courses"] == []
