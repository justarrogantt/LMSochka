"""Тесты на групповые задания: распределение, командное решение, оценивание, перераспределение."""

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
    r = await client.post(f"/api/classes/{class_id}/join-open", headers=_auth(token))
    assert r.status_code == 201, r.text


async def _setup(client, *, students: int = 3):
    """Создатель + N студентов в открытом классе. Возвращает токены/ид."""
    creator_token, _ = await _register(client, "creator@example.com")
    class_id = await _create_class(client, creator_token)

    student_tokens: list[str] = []
    student_ids: list[int] = []
    for index in range(students):
        token, user_id = await _register(client, f"student{index}@example.com")
        await _join_open(client, token, class_id)
        student_tokens.append(token)
        student_ids.append(user_id)

    return creator_token, class_id, student_tokens, student_ids


async def _create_group_assignment(
    client, creator_token, class_id, *, grading_mode, groups
):
    r = await client.post(
        f"/api/classes/{class_id}/assignments",
        json={
            "title": "Групповое",
            "description": "desc",
            "max_grade": 100,
            "group": {
                "grading_mode": grading_mode,
                "distribution": {"mode": "manual", "groups": groups},
            },
        },
        headers=_auth(creator_token),
    )
    assert r.status_code == 201, r.text
    return r.json()


@pytest.mark.asyncio
async def test_create_group_assignment_manual(client):
    creator_token, class_id, _, student_ids = await _setup(client, students=3)
    data = await _create_group_assignment(
        client,
        creator_token,
        class_id,
        grading_mode="even",
        groups=[
            {"title": "Команда А", "member_ids": [student_ids[0], student_ids[1]]},
            {"title": "Команда Б", "member_ids": [student_ids[2]]},
        ],
    )
    assert data["is_group"] is True
    assert data["grading_mode"] == "even"

    aid = data["id"]
    r = await client.get(
        f"/api/classes/{class_id}/assignments/{aid}/groups", headers=_auth(creator_token)
    )
    assert r.status_code == 200, r.text
    groups = r.json()
    assert len(groups["groups"]) == 2
    assert groups["unassigned_students"] == []


@pytest.mark.asyncio
async def test_group_submission_shared_between_members(client):
    creator_token, class_id, student_tokens, student_ids = await _setup(client, students=2)
    data = await _create_group_assignment(
        client,
        creator_token,
        class_id,
        grading_mode="even",
        groups=[{"title": "Команда", "member_ids": [student_ids[0], student_ids[1]]}],
    )
    aid = data["id"]

    # первый член создаёт и отправляет командное решение
    r = await client.put(
        f"/api/assignments/{aid}/my-submission",
        json={"answer_text": "командный ответ"},
        headers=_auth(student_tokens[0]),
    )
    assert r.status_code == 200, r.text
    r = await client.post(
        f"/api/assignments/{aid}/my-submission/submit", headers=_auth(student_tokens[0])
    )
    assert r.status_code == 200, r.text

    # второй член видит то же командное решение
    r = await client.get(
        f"/api/assignments/{aid}/my-submission", headers=_auth(student_tokens[1])
    )
    assert r.status_code == 200, r.text
    assert r.json()["answer_text"] == "командный ответ"
    assert r.json()["status"] == "submitted"


@pytest.mark.asyncio
async def test_undistributed_student_cannot_submit(client):
    creator_token, class_id, student_tokens, student_ids = await _setup(client, students=2)
    # второй студент не входит ни в одну группу
    data = await _create_group_assignment(
        client,
        creator_token,
        class_id,
        grading_mode="even",
        groups=[{"title": "Команда", "member_ids": [student_ids[0]]}],
    )
    aid = data["id"]
    r = await client.put(
        f"/api/assignments/{aid}/my-submission",
        json={"answer_text": "x"},
        headers=_auth(student_tokens[1]),
    )
    assert r.status_code == 403, r.text


@pytest.mark.asyncio
async def test_even_grading_visible_to_all_members(client):
    creator_token, class_id, student_tokens, student_ids = await _setup(client, students=2)
    data = await _create_group_assignment(
        client,
        creator_token,
        class_id,
        grading_mode="even",
        groups=[{"title": "Команда", "member_ids": [student_ids[0], student_ids[1]]}],
    )
    aid = data["id"]

    r = await client.put(
        f"/api/assignments/{aid}/my-submission",
        json={"answer_text": "ответ"},
        headers=_auth(student_tokens[0]),
    )
    sub_id = r.json()["id"]
    await client.post(
        f"/api/assignments/{aid}/my-submission/submit", headers=_auth(student_tokens[0])
    )

    # преподаватель ставит командную оценку
    r = await client.put(
        f"/api/submissions/{sub_id}/grade",
        json={"value": 80},
        headers=_auth(creator_token),
    )
    assert r.status_code == 200, r.text

    # оба члена видят оценку 80 в gradebook
    r = await client.get(f"/api/classes/{class_id}/gradebook", headers=_auth(creator_token))
    assert r.status_code == 200, r.text
    cells = {(c["student_id"], c["assignment_id"]): c for c in r.json()["cells"]}
    for student_id in student_ids:
        cell = cells[(student_id, aid)]
        assert cell["status"] == "graded"
        assert cell["value"] == 80


@pytest.mark.asyncio
async def test_individual_grading_redistribution_flow(client):
    creator_token, class_id, student_tokens, student_ids = await _setup(client, students=2)
    data = await _create_group_assignment(
        client,
        creator_token,
        class_id,
        grading_mode="individual",
        groups=[{"title": "Команда", "member_ids": [student_ids[0], student_ids[1]]}],
    )
    aid = data["id"]

    r = await client.put(
        f"/api/assignments/{aid}/my-submission",
        json={"answer_text": "ответ"},
        headers=_auth(student_tokens[0]),
    )
    sub_id = r.json()["id"]
    await client.post(
        f"/api/assignments/{aid}/my-submission/submit", headers=_auth(student_tokens[0])
    )

    # командная оценка 50 → статус pending_redistribution
    r = await client.put(
        f"/api/submissions/{sub_id}/grade",
        json={"value": 50},
        headers=_auth(creator_token),
    )
    assert r.status_code == 200, r.text
    r = await client.get(
        f"/api/assignments/{aid}/my-submission", headers=_auth(student_tokens[0])
    )
    assert r.json()["status"] == "pending_redistribution"

    # неверное распределение (среднее ≠ 50) → 422
    r = await client.put(
        f"/api/submissions/{sub_id}/member-grades",
        json={"grades": [
            {"user_id": student_ids[0], "value": 90},
            {"user_id": student_ids[1], "value": 90},
        ]},
        headers=_auth(student_tokens[1]),
    )
    assert r.status_code == 422, r.text

    # верное распределение (среднее = 50) → graded
    r = await client.put(
        f"/api/submissions/{sub_id}/member-grades",
        json={"grades": [
            {"user_id": student_ids[0], "value": 70},
            {"user_id": student_ids[1], "value": 30},
        ]},
        headers=_auth(student_tokens[1]),
    )
    assert r.status_code == 200, r.text

    # в gradebook у каждого свой балл
    r = await client.get(f"/api/classes/{class_id}/gradebook", headers=_auth(creator_token))
    cells = {(c["student_id"], c["assignment_id"]): c for c in r.json()["cells"]}
    assert cells[(student_ids[0], aid)]["value"] == 70
    assert cells[(student_ids[1], aid)]["value"] == 30


@pytest.mark.asyncio
async def test_auto_distribution(client):
    creator_token, class_id, _, _ = await _setup(client, students=4)
    r = await client.post(
        f"/api/classes/{class_id}/assignments",
        json={
            "title": "Авто",
            "max_grade": 100,
            "group": {
                "grading_mode": "even",
                "distribution": {"mode": "auto", "group_count": 2},
            },
        },
        headers=_auth(creator_token),
    )
    assert r.status_code == 201, r.text
    aid = r.json()["id"]

    r = await client.get(
        f"/api/classes/{class_id}/assignments/{aid}/groups", headers=_auth(creator_token)
    )
    groups = r.json()["groups"]
    assert len(groups) == 2
    total_members = sum(len(g["members"]) for g in groups)
    assert total_members == 4
    assert r.json()["unassigned_students"] == []


@pytest.mark.asyncio
async def test_team_size_limit_enforced(client):
    creator_token, class_id, _, student_ids = await _setup(client, students=3)

    # ручное создание: группа с превышением лимита → 422
    r = await client.post(
        f"/api/classes/{class_id}/assignments",
        json={
            "title": "Лимит",
            "max_grade": 100,
            "group": {
                "grading_mode": "even",
                "max_team_size": 1,
                "distribution": {
                    "mode": "manual",
                    "groups": [
                        {"title": "Перебор", "member_ids": [student_ids[0], student_ids[1]]}
                    ],
                },
            },
        },
        headers=_auth(creator_token),
    )
    assert r.status_code == 422, r.text

    # корректное создание с лимитом 1 и одной командой из одного студента
    data = await _create_group_assignment(
        client,
        creator_token,
        class_id,
        grading_mode="even",
        groups=[{"title": "Команда", "member_ids": [student_ids[0]]}],
    )
    aid = data["id"]
    r = await client.get(
        f"/api/classes/{class_id}/assignments/{aid}/groups", headers=_auth(creator_token)
    )
    # лимит в созданном задании не задан (helper его не шлёт) — добавление пройдёт;
    # здесь проверяем лимит через отдельное задание ниже
    assert r.status_code == 200, r.text

    # задание с лимитом 1: дозаполнение команды сверх лимита → 409
    r = await client.post(
        f"/api/classes/{class_id}/assignments",
        json={
            "title": "Лимит 1",
            "max_grade": 100,
            "group": {
                "grading_mode": "even",
                "max_team_size": 1,
                "distribution": {
                    "mode": "manual",
                    "groups": [{"title": "Команда", "member_ids": [student_ids[0]]}],
                },
            },
        },
        headers=_auth(creator_token),
    )
    assert r.status_code == 201, r.text
    limited_aid = r.json()["id"]
    r = await client.get(
        f"/api/classes/{class_id}/assignments/{limited_aid}/groups",
        headers=_auth(creator_token),
    )
    body = r.json()
    assert body["max_team_size"] == 1
    group_id = body["groups"][0]["id"]
    r = await client.post(
        f"/api/classes/{class_id}/assignments/{limited_aid}/groups/{group_id}/members",
        json={"user_id": student_ids[1]},
        headers=_auth(creator_token),
    )
    assert r.status_code == 409, r.text


@pytest.mark.asyncio
async def test_cannot_remove_member_after_submission(client):
    creator_token, class_id, student_tokens, student_ids = await _setup(client, students=2)
    data = await _create_group_assignment(
        client,
        creator_token,
        class_id,
        grading_mode="even",
        groups=[{"title": "Команда", "member_ids": [student_ids[0], student_ids[1]]}],
    )
    aid = data["id"]
    group_id = data["my_group"]["id"] if data.get("my_group") else None
    if group_id is None:
        r = await client.get(
            f"/api/classes/{class_id}/assignments/{aid}/groups",
            headers=_auth(creator_token),
        )
        group_id = r.json()["groups"][0]["id"]

    # команда отправляет решение
    await client.put(
        f"/api/assignments/{aid}/my-submission",
        json={"answer_text": "x"},
        headers=_auth(student_tokens[0]),
    )
    await client.post(
        f"/api/assignments/{aid}/my-submission/submit", headers=_auth(student_tokens[0])
    )

    # теперь убрать участника нельзя
    r = await client.delete(
        f"/api/classes/{class_id}/assignments/{aid}/groups/{group_id}/members/{student_ids[1]}",
        headers=_auth(creator_token),
    )
    assert r.status_code == 409, r.text
