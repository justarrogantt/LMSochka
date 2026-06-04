"""Тесты на модуль заданий: CRUD, права, валидация, пагинация."""

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
    client,
    token: str,
    class_id: int,
    *,
    title: str = "ДЗ",
    description: str = "",
    material_url: str | None = None,
    due_at: str | None = None,
    max_grade: float = 100.0,
) -> dict:
    body: dict = {"title": title, "description": description, "max_grade": max_grade}
    if material_url is not None:
        body["material_url"] = material_url
    if due_at is not None:
        body["due_at"] = due_at
    r = await client.post(
        f"/api/classes/{class_id}/assignments",
        json=body,
        headers=_auth(token),
    )
    assert r.status_code == 201, r.text
    return r.json()


async def _save_and_submit(client, student_token: str, aid: int) -> int:
    r = await client.put(
        f"/api/assignments/{aid}/my-submission",
        json={"answer_text": "решение"},
        headers=_auth(student_token),
    )
    assert r.status_code == 200, r.text
    sid = r.json()["id"]
    r = await client.post(
        f"/api/assignments/{aid}/my-submission/submit", headers=_auth(student_token)
    )
    assert r.status_code == 200, r.text
    return sid


# --- POST ---------------------------------------------------------------------


@pytest.mark.asyncio
async def test_creator_can_create_assignment(client):
    creator_token, creator_id = await _register(client, "creator@example.com")
    class_id = await _create_class(client, creator_token)

    due = (datetime.now(UTC) + timedelta(days=7)).isoformat()
    r = await client.post(
        f"/api/classes/{class_id}/assignments",
        json={
            "title": "ДЗ 1",
            "description": "Сделать задачи 1-10",
            "material_url": "https://drive.google.com/file/d/abc",
            "due_at": due,
            "max_grade": 100,
        },
        headers=_auth(creator_token),
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["title"] == "ДЗ 1"
    assert body["description"] == "Сделать задачи 1-10"
    assert body["material_url"] == "https://drive.google.com/file/d/abc"
    assert body["max_grade"] == 100
    assert body["author"]["id"] == creator_id
    assert body["class_id"] == class_id


@pytest.mark.asyncio
async def test_teacher_can_create_assignment(client):
    creator_token, _ = await _register(client, "creator@example.com")
    class_id = await _create_class(client, creator_token)

    teacher_token, teacher_id = await _register(client, "teacher@example.com")
    await _join_open(client, teacher_token, class_id)
    await _promote(client, creator_token, class_id, teacher_id)

    r = await client.post(
        f"/api/classes/{class_id}/assignments",
        json={"title": "ДЗ", "max_grade": 50},
        headers=_auth(teacher_token),
    )
    assert r.status_code == 201, r.text


@pytest.mark.asyncio
async def test_student_cannot_create_assignment(client):
    creator_token, _ = await _register(client, "creator@example.com")
    class_id = await _create_class(client, creator_token)

    student_token, _ = await _register(client, "student@example.com")
    await _join_open(client, student_token, class_id)

    r = await client.post(
        f"/api/classes/{class_id}/assignments",
        json={"title": "ДЗ", "max_grade": 10},
        headers=_auth(student_token),
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_outsider_cannot_create_assignment(client):
    creator_token, _ = await _register(client, "creator@example.com")
    class_id = await _create_class(client, creator_token)

    outsider_token, _ = await _register(client, "out@example.com")
    r = await client.post(
        f"/api/classes/{class_id}/assignments",
        json={"title": "x", "max_grade": 1},
        headers=_auth(outsider_token),
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_create_validation(client):
    creator_token, _ = await _register(client, "creator@example.com")
    class_id = await _create_class(client, creator_token)

    # max_grade должен быть > 0
    r = await client.post(
        f"/api/classes/{class_id}/assignments",
        json={"title": "ok", "max_grade": 0},
        headers=_auth(creator_token),
    )
    assert r.status_code == 422

    r = await client.post(
        f"/api/classes/{class_id}/assignments",
        json={"title": "ok", "max_grade": -10},
        headers=_auth(creator_token),
    )
    assert r.status_code == 422

    # пустой title
    r = await client.post(
        f"/api/classes/{class_id}/assignments",
        json={"title": "", "max_grade": 10},
        headers=_auth(creator_token),
    )
    assert r.status_code == 422

    # битый material_url
    r = await client.post(
        f"/api/classes/{class_id}/assignments",
        json={"title": "ok", "max_grade": 10, "material_url": "not a url"},
        headers=_auth(creator_token),
    )
    assert r.status_code == 422

    # отсутствует max_grade
    r = await client.post(
        f"/api/classes/{class_id}/assignments",
        json={"title": "ok"},
        headers=_auth(creator_token),
    )
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_create_without_optional_fields(client):
    """description и due_at и material_url — опциональны."""
    creator_token, _ = await _register(client, "creator@example.com")
    class_id = await _create_class(client, creator_token)

    r = await client.post(
        f"/api/classes/{class_id}/assignments",
        json={"title": "Минимум", "max_grade": 10},
        headers=_auth(creator_token),
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["description"] == ""
    assert body["material_url"] is None
    assert body["due_at"] is None


# --- GET list -----------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_assignments_pagination(client):
    creator_token, _ = await _register(client, "creator@example.com")
    class_id = await _create_class(client, creator_token)

    for i in range(25):
        await _make_assignment(client, creator_token, class_id, title=f"ДЗ #{i}")

    r = await client.get(
        f"/api/classes/{class_id}/assignments", headers=_auth(creator_token)
    )
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 25
    assert body["pending_review_total"] == 0
    assert body["page"] == 1
    assert body["limit"] == 20
    assert len(body["items"]) == 20
    # свежее сверху → #24
    assert body["items"][0]["title"] == "ДЗ #24"

    # вторая страница — оставшиеся 5
    r = await client.get(
        f"/api/classes/{class_id}/assignments?page=2&limit=20",
        headers=_auth(creator_token),
    )
    assert r.json()["total"] == 25
    assert r.json()["pending_review_total"] == 0
    assert len(r.json()["items"]) == 5


@pytest.mark.asyncio
async def test_list_limit_capped(client):
    creator_token, _ = await _register(client, "creator@example.com")
    class_id = await _create_class(client, creator_token)

    r = await client.get(
        f"/api/classes/{class_id}/assignments?limit=101",
        headers=_auth(creator_token),
    )
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_student_can_read_list(client):
    creator_token, _ = await _register(client, "creator@example.com")
    class_id = await _create_class(client, creator_token)
    await _make_assignment(client, creator_token, class_id)

    student_token, _ = await _register(client, "student@example.com")
    await _join_open(client, student_token, class_id)

    r = await client.get(
        f"/api/classes/{class_id}/assignments", headers=_auth(student_token)
    )
    assert r.status_code == 200
    assert r.json()["total"] == 0
    assert r.json()["pending_review_total"] == 0


@pytest.mark.asyncio
async def test_teacher_pending_review_filter_and_total(client):
    creator_token, _ = await _register(client, "creator@example.com")
    class_id = await _create_class(client, creator_token)

    s1_token, _ = await _register(client, "s1@example.com")
    await _join_open(client, s1_token, class_id)
    s2_token, _ = await _register(client, "s2@example.com")
    await _join_open(client, s2_token, class_id)

    a1 = await _make_assignment(client, creator_token, class_id, title="A1")
    a2 = await _make_assignment(client, creator_token, class_id, title="A2")
    await _make_assignment(client, creator_token, class_id, title="A3")

    await _save_and_submit(client, s1_token, a1["id"])
    await _save_and_submit(client, s2_token, a2["id"])

    # сначала в pending две работы
    r = await client.get(
        f"/api/classes/{class_id}/assignments",
        headers=_auth(creator_token),
    )
    assert r.status_code == 200
    assert r.json()["pending_review_total"] == 2

    # после оценки одной работы pending_total уменьшается до 1
    sub = await client.get(
        f"/api/assignments/{a1['id']}/submissions", headers=_auth(creator_token)
    )
    sid = sub.json()["items"][0]["id"]
    r = await client.put(
        f"/api/submissions/{sid}/grade",
        json={"value": 10},
        headers=_auth(creator_token),
    )
    assert r.status_code == 200

    r = await client.get(
        f"/api/classes/{class_id}/assignments?review_status=pending",
        headers=_auth(creator_token),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 1
    assert body["pending_review_total"] == 1
    assert len(body["items"]) == 1
    assert body["items"][0]["id"] == a2["id"]


@pytest.mark.asyncio
async def test_student_cannot_use_pending_review_filter(client):
    creator_token, _ = await _register(client, "creator@example.com")
    class_id = await _create_class(client, creator_token)
    await _make_assignment(client, creator_token, class_id, title="A1")

    student_token, _ = await _register(client, "student@example.com")
    await _join_open(client, student_token, class_id)

    r = await client.get(
        f"/api/classes/{class_id}/assignments?review_status=pending",
        headers=_auth(student_token),
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_outsider_cannot_read_list(client):
    creator_token, _ = await _register(client, "creator@example.com")
    class_id = await _create_class(client, creator_token)

    outsider_token, _ = await _register(client, "out@example.com")
    r = await client.get(
        f"/api/classes/{class_id}/assignments", headers=_auth(outsider_token)
    )
    assert r.status_code == 403


# --- GET one ------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_one_assignment(client):
    creator_token, _ = await _register(client, "creator@example.com")
    class_id = await _create_class(client, creator_token)
    asg = await _make_assignment(client, creator_token, class_id, title="X")

    r = await client.get(
        f"/api/classes/{class_id}/assignments/{asg['id']}",
        headers=_auth(creator_token),
    )
    assert r.status_code == 200
    assert r.json()["title"] == "X"


@pytest.mark.asyncio
async def test_get_one_404(client):
    creator_token, _ = await _register(client, "creator@example.com")
    class_id = await _create_class(client, creator_token)
    r = await client.get(
        f"/api/classes/{class_id}/assignments/9999",
        headers=_auth(creator_token),
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_get_one_cross_class_404(client):
    """Задание одного класса не достучаться через путь другого класса."""
    creator_token, _ = await _register(client, "creator@example.com")
    cls_a = await _create_class(client, creator_token)
    cls_b_r = await client.post(
        "/api/classes",
        json={"name": "B", "type": "open"},
        headers=_auth(creator_token),
    )
    cls_b = cls_b_r.json()["id"]

    asg = await _make_assignment(client, creator_token, cls_a)

    r = await client.get(
        f"/api/classes/{cls_b}/assignments/{asg['id']}",
        headers=_auth(creator_token),
    )
    assert r.status_code == 404


# --- PATCH --------------------------------------------------------------------


@pytest.mark.asyncio
async def test_creator_can_update_assignment(client):
    creator_token, _ = await _register(client, "creator@example.com")
    class_id = await _create_class(client, creator_token)
    asg = await _make_assignment(client, creator_token, class_id, title="old")

    r = await client.patch(
        f"/api/classes/{class_id}/assignments/{asg['id']}",
        json={"title": "new", "max_grade": 50},
        headers=_auth(creator_token),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["title"] == "new"
    assert body["max_grade"] == 50
    assert body["updated_at"] is not None


@pytest.mark.asyncio
async def test_teacher_can_update_assignment(client):
    creator_token, _ = await _register(client, "creator@example.com")
    class_id = await _create_class(client, creator_token)
    teacher_token, teacher_id = await _register(client, "teacher@example.com")
    await _join_open(client, teacher_token, class_id)
    await _promote(client, creator_token, class_id, teacher_id)

    asg = await _make_assignment(client, teacher_token, class_id)

    r = await client.patch(
        f"/api/classes/{class_id}/assignments/{asg['id']}",
        json={"title": "edited"},
        headers=_auth(teacher_token),
    )
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_student_cannot_update(client):
    creator_token, _ = await _register(client, "creator@example.com")
    class_id = await _create_class(client, creator_token)
    asg = await _make_assignment(client, creator_token, class_id)

    student_token, _ = await _register(client, "student@example.com")
    await _join_open(client, student_token, class_id)

    r = await client.patch(
        f"/api/classes/{class_id}/assignments/{asg['id']}",
        json={"title": "hack"},
        headers=_auth(student_token),
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_update_empty_body_rejected(client):
    creator_token, _ = await _register(client, "creator@example.com")
    class_id = await _create_class(client, creator_token)
    asg = await _make_assignment(client, creator_token, class_id)

    r = await client.patch(
        f"/api/classes/{class_id}/assignments/{asg['id']}",
        json={},
        headers=_auth(creator_token),
    )
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_update_can_clear_material_url(client):
    """material_url=null → сбрасываем поле."""
    creator_token, _ = await _register(client, "creator@example.com")
    class_id = await _create_class(client, creator_token)
    asg = await _make_assignment(
        client, creator_token, class_id, material_url="https://example.com/a"
    )

    r = await client.patch(
        f"/api/classes/{class_id}/assignments/{asg['id']}",
        json={"material_url": None},
        headers=_auth(creator_token),
    )
    assert r.status_code == 200
    assert r.json()["material_url"] is None


@pytest.mark.asyncio
async def test_update_can_clear_due_at(client):
    creator_token, _ = await _register(client, "creator@example.com")
    class_id = await _create_class(client, creator_token)
    due = (datetime.now(UTC) + timedelta(days=1)).isoformat()
    asg = await _make_assignment(client, creator_token, class_id, due_at=due)

    r = await client.patch(
        f"/api/classes/{class_id}/assignments/{asg['id']}",
        json={"due_at": None},
        headers=_auth(creator_token),
    )
    assert r.status_code == 200
    assert r.json()["due_at"] is None


@pytest.mark.asyncio
async def test_update_max_grade_validation(client):
    creator_token, _ = await _register(client, "creator@example.com")
    class_id = await _create_class(client, creator_token)
    asg = await _make_assignment(client, creator_token, class_id)

    # max_grade ≤ 0 → 422
    r = await client.patch(
        f"/api/classes/{class_id}/assignments/{asg['id']}",
        json={"max_grade": 0},
        headers=_auth(creator_token),
    )
    assert r.status_code == 422

    r = await client.patch(
        f"/api/classes/{class_id}/assignments/{asg['id']}",
        json={"max_grade": -5},
        headers=_auth(creator_token),
    )
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_update_404(client):
    creator_token, _ = await _register(client, "creator@example.com")
    class_id = await _create_class(client, creator_token)
    r = await client.patch(
        f"/api/classes/{class_id}/assignments/9999",
        json={"title": "x"},
        headers=_auth(creator_token),
    )
    assert r.status_code == 404


# --- DELETE -------------------------------------------------------------------


@pytest.mark.asyncio
async def test_creator_can_delete(client):
    creator_token, _ = await _register(client, "creator@example.com")
    class_id = await _create_class(client, creator_token)
    asg = await _make_assignment(client, creator_token, class_id)

    r = await client.delete(
        f"/api/classes/{class_id}/assignments/{asg['id']}",
        headers=_auth(creator_token),
    )
    assert r.status_code == 204

    # после удаления пропадает из списка и 404 на GET
    r = await client.get(
        f"/api/classes/{class_id}/assignments", headers=_auth(creator_token)
    )
    assert r.json()["total"] == 0

    r = await client.get(
        f"/api/classes/{class_id}/assignments/{asg['id']}",
        headers=_auth(creator_token),
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_teacher_can_delete_only_own_assignment(client):
    creator_token, _ = await _register(client, "creator@example.com")
    class_id = await _create_class(client, creator_token)
    teacher_token, teacher_id = await _register(client, "teacher@example.com")
    await _join_open(client, teacher_token, class_id)
    await _promote(client, creator_token, class_id, teacher_id)

    creator_asg = await _make_assignment(client, creator_token, class_id)

    r = await client.delete(
        f"/api/classes/{class_id}/assignments/{creator_asg['id']}",
        headers=_auth(teacher_token),
    )
    assert r.status_code == 403

    teacher_asg = await _make_assignment(client, teacher_token, class_id)
    r = await client.delete(
        f"/api/classes/{class_id}/assignments/{teacher_asg['id']}",
        headers=_auth(teacher_token),
    )
    assert r.status_code == 204


@pytest.mark.asyncio
async def test_student_cannot_delete(client):
    creator_token, _ = await _register(client, "creator@example.com")
    class_id = await _create_class(client, creator_token)
    asg = await _make_assignment(client, creator_token, class_id)

    student_token, _ = await _register(client, "student@example.com")
    await _join_open(client, student_token, class_id)

    r = await client.delete(
        f"/api/classes/{class_id}/assignments/{asg['id']}",
        headers=_auth(student_token),
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_delete_404(client):
    creator_token, _ = await _register(client, "creator@example.com")
    class_id = await _create_class(client, creator_token)
    r = await client.delete(
        f"/api/classes/{class_id}/assignments/9999",
        headers=_auth(creator_token),
    )
    assert r.status_code == 404
