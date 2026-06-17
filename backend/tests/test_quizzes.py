from __future__ import annotations

import pytest


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


async def _create_class(client, token: str, *, name: str = "Class") -> int:
    response = await client.post(
        "/api/classes",
        json={"name": name, "type": "open"},
        headers=_auth(token),
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


async def _join_open(client, token: str, class_id: int) -> None:
    response = await client.post(
        f"/api/classes/{class_id}/join-open",
        headers=_auth(token),
    )
    assert response.status_code == 201, response.text


async def _promote(client, creator_token: str, class_id: int, user_id: int) -> None:
    response = await client.patch(
        f"/api/classes/{class_id}/members/{user_id}/role",
        json={"role": "teacher"},
        headers=_auth(creator_token),
    )
    assert response.status_code == 200, response.text


async def _setup(client):
    creator_token, _ = await _register(client, "creator@example.com")
    class_id = await _create_class(client, creator_token)

    teacher_token, teacher_id = await _register(client, "teacher@example.com")
    await _join_open(client, teacher_token, class_id)
    await _promote(client, creator_token, class_id, teacher_id)

    student_token, student_id = await _register(client, "student@example.com")
    await _join_open(client, student_token, class_id)

    return {
        "creator_token": creator_token,
        "teacher_token": teacher_token,
        "student_token": student_token,
        "student_id": student_id,
        "class_id": class_id,
    }


async def _create_question(client, class_id: int, token: str, payload: dict) -> dict:
    response = await client.post(
        f"/api/classes/{class_id}/questions",
        json=payload,
        headers=_auth(token),
    )
    assert response.status_code == 201, response.text
    return response.json()


async def _create_quiz_assignment(client, class_id: int, token: str, *, title: str = "Quiz") -> dict:
    response = await client.post(
        f"/api/classes/{class_id}/assignments",
        json={
            "title": title,
            "description": "quiz desc",
            "max_grade": 10,
            "type": "quiz",
            "quiz_settings": {
                "shuffle_questions": False,
                "shuffle_options": False,
                "show_result_after_submit": True,
                "show_correct_answers_after_submit": False,
                "attempts_limit": 1,
            },
        },
        headers=_auth(token),
    )
    assert response.status_code == 201, response.text
    return response.json()


@pytest.mark.asyncio
async def test_teacher_can_create_all_question_types(client):
    ctx = await _setup(client)

    single = await _create_question(
        client,
        ctx["class_id"],
        ctx["teacher_token"],
        {
            "title": "Python assign",
            "question_text": "Какой оператор присваивания?",
            "type": "single_choice",
            "default_points": 1,
            "status": "ready",
            "options": [
                {"text": "=", "is_correct": True, "position": 1},
                {"text": "==", "is_correct": False, "position": 2},
            ],
        },
    )
    assert single["type"] == "single_choice"
    assert single["options"][0]["is_correct"] is True

    multiple = await _create_question(
        client,
        ctx["class_id"],
        ctx["teacher_token"],
        {
            "title": "HTTP methods",
            "question_text": "Какие методы меняют данные?",
            "type": "multiple_choice",
            "default_points": 2,
            "status": "ready",
            "options": [
                {"text": "GET", "is_correct": False, "position": 1},
                {"text": "POST", "is_correct": True, "position": 2},
                {"text": "PATCH", "is_correct": True, "position": 3},
            ],
        },
    )
    assert multiple["type"] == "multiple_choice"

    text = await _create_question(
        client,
        ctx["class_id"],
        ctx["teacher_token"],
        {
            "title": "Paris",
            "question_text": "Столица Франции?",
            "type": "text_input",
            "default_points": 1,
            "status": "ready",
            "text_answers": [
                {"answer": "Париж", "is_case_sensitive": False},
                {"answer": "Paris", "is_case_sensitive": False},
            ],
        },
    )
    assert text["type"] == "text_input"
    assert len(text["text_answers"]) == 2


@pytest.mark.asyncio
async def test_question_bank_permissions_and_validation(client):
    ctx = await _setup(client)

    response = await client.post(
        f"/api/classes/{ctx['class_id']}/questions",
        json={
            "title": "bad",
            "question_text": "bad",
            "type": "single_choice",
            "default_points": 1,
            "options": [
                {"text": "a", "is_correct": True, "position": 1},
                {"text": "b", "is_correct": False, "position": 2},
            ],
        },
        headers=_auth(ctx["student_token"]),
    )
    assert response.status_code == 403

    response = await client.post(
        f"/api/classes/{ctx['class_id']}/questions",
        json={
            "title": "bad",
            "question_text": "bad",
            "type": "single_choice",
            "default_points": 1,
            "options": [
                {"text": "a", "is_correct": True, "position": 1},
                {"text": "b", "is_correct": True, "position": 2},
            ],
        },
        headers=_auth(ctx["teacher_token"]),
    )
    assert response.status_code == 422

    response = await client.post(
        f"/api/classes/{ctx['class_id']}/questions",
        json={
            "title": "bad",
            "question_text": "bad",
            "type": "multiple_choice",
            "default_points": 1,
            "options": [
                {"text": "a", "is_correct": False, "position": 1},
                {"text": "b", "is_correct": False, "position": 2},
            ],
        },
        headers=_auth(ctx["teacher_token"]),
    )
    assert response.status_code == 422

    response = await client.post(
        f"/api/classes/{ctx['class_id']}/questions",
        json={
            "title": "bad",
            "question_text": "bad",
            "type": "text_input",
            "default_points": 1,
            "text_answers": [],
        },
        headers=_auth(ctx["teacher_token"]),
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_teacher_sees_correct_answers_and_student_cannot_access_bank(client):
    ctx = await _setup(client)
    question = await _create_question(
        client,
        ctx["class_id"],
        ctx["teacher_token"],
        {
            "title": "Python",
            "question_text": "Какой оператор присваивания?",
            "type": "single_choice",
            "default_points": 1,
            "status": "ready",
            "options": [
                {"text": "=", "is_correct": True, "position": 1},
                {"text": "==", "is_correct": False, "position": 2},
            ],
        },
    )

    response = await client.get(
        f"/api/classes/{ctx['class_id']}/questions/{question['id']}",
        headers=_auth(ctx["teacher_token"]),
    )
    assert response.status_code == 200, response.text
    assert response.json()["options"][0]["is_correct"] is True

    response = await client.get(
        f"/api/classes/{ctx['class_id']}/questions",
        headers=_auth(ctx["student_token"]),
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_quiz_assignment_create_and_add_question_rules(client):
    ctx = await _setup(client)
    quiz = await _create_quiz_assignment(client, ctx["class_id"], ctx["teacher_token"])
    assert quiz["type"] == "quiz"
    assert quiz["quiz_settings"]["attempts_limit"] == 1

    student_response = await client.post(
        f"/api/classes/{ctx['class_id']}/assignments",
        json={"title": "Student quiz", "max_grade": 5, "type": "quiz"},
        headers=_auth(ctx["student_token"]),
    )
    assert student_response.status_code == 403

    ready_question = await _create_question(
        client,
        ctx["class_id"],
        ctx["teacher_token"],
        {
            "title": "Ready",
            "question_text": "2+2?",
            "type": "single_choice",
            "default_points": 1,
            "status": "ready",
            "options": [
                {"text": "4", "is_correct": True, "position": 1},
                {"text": "5", "is_correct": False, "position": 2},
            ],
        },
    )
    response = await client.post(
        f"/api/assignments/{quiz['id']}/quiz/questions",
        json={"question_id": ready_question["id"], "points": 2, "position": 1},
        headers=_auth(ctx["teacher_token"]),
    )
    assert response.status_code == 201, response.text
    assert response.json()["question_id"] == ready_question["id"]

    duplicate = await client.post(
        f"/api/assignments/{quiz['id']}/quiz/questions",
        json={"question_id": ready_question["id"], "points": 2, "position": 2},
        headers=_auth(ctx["teacher_token"]),
    )
    assert duplicate.status_code == 409

    draft_question = await _create_question(
        client,
        ctx["class_id"],
        ctx["teacher_token"],
        {
            "title": "Draft",
            "question_text": "draft",
            "type": "single_choice",
            "default_points": 1,
            "status": "draft",
            "options": [
                {"text": "yes", "is_correct": True, "position": 1},
                {"text": "no", "is_correct": False, "position": 2},
            ],
        },
    )
    draft_response = await client.post(
        f"/api/assignments/{quiz['id']}/quiz/questions",
        json={"question_id": draft_question["id"], "points": 1, "position": 2},
        headers=_auth(ctx["teacher_token"]),
    )
    assert draft_response.status_code == 422

    other_creator_token, _ = await _register(client, "other.creator@example.com")
    other_class_id = await _create_class(client, other_creator_token, name="Other")
    foreign_question = await _create_question(
        client,
        other_class_id,
        other_creator_token,
        {
            "title": "Foreign",
            "question_text": "foreign",
            "type": "single_choice",
            "default_points": 1,
            "status": "ready",
            "options": [
                {"text": "yes", "is_correct": True, "position": 1},
                {"text": "no", "is_correct": False, "position": 2},
            ],
        },
    )
    foreign_response = await client.post(
        f"/api/assignments/{quiz['id']}/quiz/questions",
        json={"question_id": foreign_question["id"], "points": 1, "position": 3},
        headers=_auth(ctx["teacher_token"]),
    )
    assert foreign_response.status_code == 404


@pytest.mark.asyncio
async def test_student_can_pass_quiz_and_result_hits_gradebook(client):
    ctx = await _setup(client)
    quiz = await _create_quiz_assignment(client, ctx["class_id"], ctx["teacher_token"], title="HTTP Quiz")

    single = await _create_question(
        client,
        ctx["class_id"],
        ctx["teacher_token"],
        {
            "title": "Assign",
            "question_text": "Какой оператор присваивания?",
            "type": "single_choice",
            "default_points": 1,
            "status": "ready",
            "options": [
                {"text": "=", "is_correct": True, "position": 1},
                {"text": "==", "is_correct": False, "position": 2},
            ],
        },
    )
    multiple = await _create_question(
        client,
        ctx["class_id"],
        ctx["teacher_token"],
        {
            "title": "HTTP",
            "question_text": "Какие методы меняют данные?",
            "type": "multiple_choice",
            "default_points": 2,
            "status": "ready",
            "options": [
                {"text": "GET", "is_correct": False, "position": 1},
                {"text": "POST", "is_correct": True, "position": 2},
                {"text": "PATCH", "is_correct": True, "position": 3},
            ],
        },
    )
    text = await _create_question(
        client,
        ctx["class_id"],
        ctx["teacher_token"],
        {
            "title": "France",
            "question_text": "Столица Франции?",
            "type": "text_input",
            "default_points": 1,
            "status": "ready",
            "text_answers": [
                {"answer": "Париж", "is_case_sensitive": False},
                {"answer": "Paris", "is_case_sensitive": False},
            ],
        },
    )

    for position, question, points in [
        (1, single, 1),
        (2, multiple, 2),
        (3, text, 1),
    ]:
        response = await client.post(
            f"/api/assignments/{quiz['id']}/quiz/questions",
            json={"question_id": question["id"], "points": points, "position": position},
            headers=_auth(ctx["teacher_token"]),
        )
        assert response.status_code == 201, response.text

    teacher_start = await client.post(
        f"/api/assignments/{quiz['id']}/quiz/attempts/start",
        headers=_auth(ctx["teacher_token"]),
    )
    assert teacher_start.status_code == 403

    started = await client.post(
        f"/api/assignments/{quiz['id']}/quiz/attempts/start",
        headers=_auth(ctx["student_token"]),
    )
    assert started.status_code == 200, started.text
    started_body = started.json()
    assert started_body["status"] == "in_progress"
    assert len(started_body["questions"]) == 3
    assert "is_correct" not in started_body["questions"][0]
    attempt_id = started_body["attempt_id"]

    questions = {item["question_id"]: item for item in started_body["questions"]}

    save_single = await client.put(
        f"/api/quiz/attempts/{attempt_id}/answers/{single['id']}",
        json={"selected_option_ids": [questions[single["id"]]["options"][0]["id"]]},
        headers=_auth(ctx["student_token"]),
    )
    assert save_single.status_code == 204

    multiple_option_ids = [option["id"] for option in questions[multiple["id"]]["options"] if option["text"] in {"POST", "PATCH"}]
    save_multiple = await client.put(
        f"/api/quiz/attempts/{attempt_id}/answers/{multiple['id']}",
        json={"selected_option_ids": multiple_option_ids},
        headers=_auth(ctx["student_token"]),
    )
    assert save_multiple.status_code == 204

    save_text = await client.put(
        f"/api/quiz/attempts/{attempt_id}/answers/{text['id']}",
        json={"text_answer": "  париж  "},
        headers=_auth(ctx["student_token"]),
    )
    assert save_text.status_code == 204

    submitted = await client.post(
        f"/api/quiz/attempts/{attempt_id}/submit",
        headers=_auth(ctx["student_token"]),
    )
    assert submitted.status_code == 200, submitted.text
    submitted_body = submitted.json()
    assert submitted_body["score"] == 4
    assert submitted_body["max_score"] == 4
    assert all(answer["is_correct"] is True for answer in submitted_body["answers"])
    assert all(answer["correct_option_ids"] is None for answer in submitted_body["answers"])

    result = await client.get(
        f"/api/quiz/attempts/{attempt_id}/result",
        headers=_auth(ctx["student_token"]),
    )
    assert result.status_code == 200, result.text
    assert result.json()["score"] == 4
    assert all(answer["correct_option_ids"] is None for answer in result.json()["answers"])

    gradebook = await client.get(
        f"/api/classes/{ctx['class_id']}/gradebook",
        headers=_auth(ctx["teacher_token"]),
    )
    assert gradebook.status_code == 200, gradebook.text
    cells = gradebook.json()["cells"]
    matching = [
        cell
        for cell in cells
        if cell["student_id"] == ctx["student_id"] and cell["assignment_id"] == quiz["id"]
    ]
    assert len(matching) == 1
    assert matching[0]["status"] == "graded"
    assert matching[0]["value"] == 4

    second_attempt = await client.post(
        f"/api/assignments/{quiz['id']}/quiz/attempts/start",
        headers=_auth(ctx["student_token"]),
    )
    assert second_attempt.status_code == 409

    change_after_submit = await client.put(
        f"/api/quiz/attempts/{attempt_id}/answers/{single['id']}",
        json={"selected_option_ids": [questions[single['id']]["options"][1]["id"]]},
        headers=_auth(ctx["student_token"]),
    )
    assert change_after_submit.status_code == 409
