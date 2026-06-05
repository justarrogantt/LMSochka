from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import (
    AssignmentsTable,
    GradesTable,
    GradingMode,
    SubmissionsTable,
    SubmissionStatus,
    UsersTable,
)
from app.database.repositories import (
    assignment_repo,
    class_repo,
    file_repo,
    grade_repo,
    group_repo,
    member_grade_repo,
    submission_repo,
)
from app.schemas.errors import ServiceError
from app.schemas.grade_schemas import GradeDTO, UpsertGradeRequest
from app.schemas.gradebook_schemas import (
    GradebookAssignmentDTO,
    GradebookCellDTO,
    GradebookDTO,
    GradebookStudentDTO,
    GradebookStudentSummaryDTO,
)
from app.schemas.group_schemas import (
    MemberGradeDTO,
    MemberGradesRequest,
    SubmissionMemberGradesDTO,
)
from app.schemas.submission_schemas import SubmissionDTO
from app.schemas.user_schemas import UserBriefDTO
from app.services import access, group_service, notification_service, submission_service
from app.services.submission_service import _is_late

# Точность сравнения для дробных оценок (среднее = командной).
_EPSILON = 1e-6


def _grade_dto(grade: GradesTable, grader: UsersTable) -> GradeDTO:
    return GradeDTO(
        submission_id=grade.submission_id,
        value=grade.value,
        comment=grade.comment,
        graded_by=UserBriefDTO.model_validate(grader),
        graded_at=grade.graded_at,
        updated_at=grade.updated_at,
    )


async def _active_member_ids(
    sub: SubmissionsTable, asg: AssignmentsTable, db: AsyncSession
) -> list[int]:
    """ID активных членов команды, чьё это решение."""
    group = await group_repo.get_group_for_submission(sub.id, db)
    if group is None:
        return []
    rows = await group_repo.list_group_member_users(group.id, asg.class_id, db)
    return [user.id for user, is_active in rows if is_active]


async def put_grade(
    sid: int,
    body: UpsertGradeRequest,
    grader: UsersTable,
    db: AsyncSession,
) -> GradeDTO:
    row = await submission_repo.get_with_student_by_id(sid, db)
    if row is None:
        raise ServiceError("Решение не найдено", 404)
    sub, _, _ = row

    asg = await access.get_assignment_or_404(sub.assignment_id, db)
    await access.ensure_teacher_or_creator(asg.class_id, grader.id, db)

    # individual-группа: пере-выставить командную оценку можно и из pending_redistribution
    if sub.status not in {
        SubmissionStatus.SUBMITTED,
        SubmissionStatus.GRADED,
        SubmissionStatus.PENDING_REDISTRIBUTION,
    }:
        raise ServiceError("Оценивать можно только отправленное или уже оценённое решение", 409)

    if body.value > asg.max_grade:
        raise ServiceError("Оценка не может быть больше max_grade задания", 422)

    grade = await grade_repo.upsert(
        submission_id=sub.id,
        graded_by_user_id=grader.id,
        value=body.value,
        comment=body.comment.strip() if body.comment else None,
        db=db,
    )

    config = await group_repo.get_config(asg.id, db)
    is_group_individual = (
        config is not None and config.grading_mode == GradingMode.INDIVIDUAL
    )

    if is_group_individual:
        # командная оценка выставлена — студенты должны распределить её внутри команды
        sub.status = SubmissionStatus.PENDING_REDISTRIBUTION
        await member_grade_repo.delete_for_submission(sub.id, db)
        db.add(sub)
        await db.commit()
    elif sub.status != SubmissionStatus.GRADED:
        sub.status = SubmissionStatus.GRADED
        db.add(sub)
        await db.commit()

    await db.refresh(sub)
    cls = await class_repo.get_by_id(asg.class_id, db)
    if cls is not None:
        if is_group_individual:
            await notification_service.notify_redistribution(
                user_ids=await _active_member_ids(sub, asg, db),
                class_id=asg.class_id,
                assignment_id=asg.id,
                assignment_title=asg.title,
                db=db,
            )
        elif config is not None:
            # групповое even: командная оценка = оценка каждого члена
            for member_id in await _active_member_ids(sub, asg, db):
                await notification_service.notify_grade_created(
                    student_id=member_id,
                    class_id=asg.class_id,
                    class_name=cls.name,
                    assignment_id=asg.id,
                    value=grade.value,
                    max_grade=asg.max_grade,
                    db=db,
                )
        else:
            await notification_service.notify_grade_created(
                student_id=sub.student_id,
                class_id=asg.class_id,
                class_name=cls.name,
                assignment_id=asg.id,
                value=grade.value,
                max_grade=asg.max_grade,
                db=db,
            )
    return _grade_dto(grade, grader)


async def get_grade(
    sid: int,
    user: UsersTable,
    db: AsyncSession,
) -> GradeDTO:
    row = await submission_repo.get_with_student_by_id(sid, db)
    if row is None:
        raise ServiceError("Решение не найдено", 404)
    sub, _, _ = row

    asg = await access.get_assignment_or_404(sub.assignment_id, db)
    if user.id != sub.student_id:
        await access.ensure_teacher_or_creator(asg.class_id, user.id, db)
    else:
        await access.get_class_member_or_403(asg.class_id, user.id, db)

    grade_row = await grade_repo.get_with_grader_by_submission(sub.id, db)
    if grade_row is None:
        raise ServiceError("Оценка не найдена", 404)
    grade, grader = grade_row
    return _grade_dto(grade, grader)


async def delete_grade(
    sid: int,
    user: UsersTable,
    db: AsyncSession,
) -> SubmissionDTO:
    """Снять оценку (исправление ошибки преподавателя).

    Возвращаем решение в статус submitted, чтобы оно снова попало в очередь
    на проверку. Отдаём обновлённый SubmissionDTO — фронт перерисует карточку.
    """
    row = await submission_repo.get_with_student_by_id(sid, db)
    if row is None:
        raise ServiceError("Решение не найдено", 404)
    sub, student, grade = row

    asg = await access.get_assignment_or_404(sub.assignment_id, db)
    await access.ensure_teacher_or_creator(asg.class_id, user.id, db)

    if grade is None:
        raise ServiceError("Оценка не найдена", 404)

    await grade_repo.delete(grade, db)
    # У группового individual вместе с командной оценкой снимаем и распределение по членам.
    await member_grade_repo.delete_for_submission(sub.id, db)

    # graded или pending_redistribution → возвращаем в submitted (решение ведь сдано).
    # Если уже returned (вернули на доработку после оценки) — статус не трогаем.
    if sub.status in {SubmissionStatus.GRADED, SubmissionStatus.PENDING_REDISTRIBUTION}:
        sub.status = SubmissionStatus.SUBMITTED
        db.add(sub)
    await db.commit()
    await db.refresh(sub)

    group_title = await submission_service._group_title(sub, db)
    attachment_file = (
        await file_repo.get(sub.attachment_file_id, db) if sub.attachment_file_id else None
    )
    return submission_service._dto(sub, student, asg, None, attachment_file, group_title)


# ── Перераспределение оценки внутри команды (individual) ──


async def _load_member_grades_context(
    sid: int, user: UsersTable, db: AsyncSession, *, require_member: bool
) -> tuple[SubmissionsTable, AssignmentsTable, list[UsersTable], GradesTable]:
    """Общая загрузка для member-grades: решение, задание, активные члены, команд. оценка.

    require_member=True — текущий юзер обязан быть членом команды (для записи);
    иначе допускаем и teacher/creator (для чтения/override).
    """
    row = await submission_repo.get_with_student_by_id(sid, db)
    if row is None:
        raise ServiceError("Решение не найдено", 404)
    sub, _, _ = row

    asg = await access.get_assignment_or_404(sub.assignment_id, db)
    config = await group_repo.get_config(asg.id, db)
    if config is None or config.grading_mode != GradingMode.INDIVIDUAL:
        raise ServiceError(
            "Перераспределение доступно только для группового задания "
            "с индивидуальным оцениванием",
            409,
        )

    group = await group_repo.get_group_for_submission(sub.id, db)
    if group is None:
        raise ServiceError("Команда решения не найдена", 404)
    member_rows = await group_repo.list_group_member_users(group.id, asg.class_id, db)
    active_members = [user_row for user_row, is_active in member_rows if is_active]
    is_member = any(member.id == user.id for member in active_members)

    if require_member:
        if not is_member:
            raise ServiceError("Распределять оценку могут только члены команды", 403)
    elif not is_member:
        # не член — пускаем только teacher/creator
        await access.ensure_teacher_or_creator(asg.class_id, user.id, db)

    grade = await grade_repo.get_by_submission(sub.id, db)
    if grade is None:
        raise ServiceError("Команде ещё не выставлена оценка", 409)

    return sub, asg, active_members, grade


def _member_grades_dto(
    asg: AssignmentsTable,
    members: list[UsersTable],
    grade: GradesTable,
    current: list[MemberGradeDTO],
) -> SubmissionMemberGradesDTO:
    return SubmissionMemberGradesDTO(
        team_value=grade.value,
        max_grade=asg.max_grade,
        members=[group_service._member_dto(member, True) for member in members],
        grades=current,
    )


async def get_member_grades(
    sid: int, user: UsersTable, db: AsyncSession
) -> SubmissionMemberGradesDTO:
    sub, asg, members, grade = await _load_member_grades_context(
        sid, user, db, require_member=False
    )
    rows = await member_grade_repo.list_for_submission(sub.id, db)
    current = [MemberGradeDTO(user_id=row.user_id, value=row.value) for row in rows]
    return _member_grades_dto(asg, members, grade, current)


async def put_member_grades(
    sid: int, body: MemberGradesRequest, user: UsersTable, db: AsyncSession
) -> SubmissionMemberGradesDTO:
    sub, asg, members, grade = await _load_member_grades_context(
        sid, user, db, require_member=True
    )

    if sub.status != SubmissionStatus.PENDING_REDISTRIBUTION:
        raise ServiceError("Решение не ожидает распределения оценки", 422)

    member_ids = {member.id for member in members}
    incoming_ids = [item.user_id for item in body.grades]
    if len(incoming_ids) != len(set(incoming_ids)):
        raise ServiceError("В распределении есть повторяющиеся студенты", 422)
    if set(incoming_ids) != member_ids:
        raise ServiceError("Нужно распределить оценку ровно между активными членами команды", 422)

    for item in body.grades:
        if item.value < 0 or item.value > asg.max_grade:
            raise ServiceError(f"Балл должен быть в диапазоне 0…{asg.max_grade}", 422)

    # среднее арифметическое распределения должно равняться командной оценке
    total = sum(item.value for item in body.grades)
    if abs(total - grade.value * len(member_ids)) > _EPSILON:
        raise ServiceError("Среднее арифметическое должно быть равно командной оценке", 422)

    await member_grade_repo.replace_for_submission(
        sub.id, [(item.user_id, item.value) for item in body.grades], db
    )
    sub.status = SubmissionStatus.GRADED
    db.add(sub)
    await db.commit()

    cls = await class_repo.get_by_id(asg.class_id, db)
    if cls is not None:
        for item in body.grades:
            await notification_service.notify_grade_created(
                student_id=item.user_id,
                class_id=asg.class_id,
                class_name=cls.name,
                assignment_id=asg.id,
                value=item.value,
                max_grade=asg.max_grade,
                db=db,
            )

    current = [MemberGradeDTO(user_id=item.user_id, value=item.value) for item in body.grades]
    return _member_grades_dto(asg, members, grade, current)


async def get_gradebook(
    class_id: int, user: UsersTable, db: AsyncSession
) -> GradebookDTO:
    # 404 если класса нет вообще, 403 если есть, но ты не teacher/creator
    if await class_repo.get_by_id(class_id, db) is None:
        raise ServiceError("Класс не найден", 404)
    await access.ensure_teacher_or_creator(class_id, user.id, db)

    assignments = await assignment_repo.list_for_class_plain(class_id, db)
    students_rows = await class_repo.list_students_for_gradebook(class_id, db)

    assignment_ids = [a.id for a in assignments]
    student_ids = [u.id for u, _ in students_rows]
    assignments_by_id = {a.id: a for a in assignments}

    # групповые задания читаем отдельно: решение у команды одно, а оценку нужно
    # показать каждому её члену (даже тому, кто решение не создавал)
    group_modes = await group_repo.map_configs(assignment_ids, db)
    group_ids = set(group_modes)

    cells: list[GradebookCellDTO] = []

    # ── индивидуальные задания: как раньше, по решению каждого студента ──
    individual_ids = [aid for aid in assignment_ids if aid not in group_ids]
    submissions_rows = await submission_repo.list_for_gradebook(
        individual_ids, student_ids, db
    )
    for sub, grade in submissions_rows:
        asg = assignments_by_id.get(sub.assignment_id)
        if asg is None:
            continue
        value = grade.value if grade is not None else None
        cells.append(_gradebook_cell(sub.student_id, asg, sub, sub.status, value))

    # ── групповые задания: по каждому члену команды эффективная оценка ──
    if group_ids:
        member_rows = await group_repo.gradebook_member_rows(list(group_ids), db)
        member_grade_subs = [
            sub.id for _, _, sub, _ in member_rows if sub is not None
        ]
        member_grade_map = await member_grade_repo.map_for_submissions(
            member_grade_subs, db
        )
        for aid, user_id, sub, grade in member_rows:
            asg = assignments_by_id.get(aid)
            if asg is None or sub is None:
                continue
            status, value = _effective_group_cell(
                group_modes[aid], sub, grade, user_id, member_grade_map
            )
            cells.append(_gradebook_cell(user_id, asg, sub, status, value))

    summary_map = _build_summaries(student_ids, cells)
    total_assignments = len(assignments)

    return GradebookDTO(
        assignments=[
            GradebookAssignmentDTO(
                id=a.id,
                title=a.title,
                max_grade=a.max_grade,
                due_at=a.due_at,
                created_at=a.created_at,
            )
            for a in assignments
        ],
        students=[
            GradebookStudentDTO(
                id=u.id,
                email=u.email,
                first_name=u.first_name,
                last_name=u.last_name,
                is_active=m.deleted_at is None,
                learning_started_at=m.learning_started_at,
                summary=GradebookStudentSummaryDTO(
                    average_percent=(
                        round(
                            summary_map[u.id]["percent_sum"] / summary_map[u.id]["percent_count"], 2
                        )
                        if summary_map[u.id]["percent_count"] > 0
                        else None
                    ),
                    graded_count=int(summary_map[u.id]["graded_count"]),
                    submitted_count=int(summary_map[u.id]["submitted_count"]),
                    pending_review_count=int(summary_map[u.id]["pending_review_count"]),
                    total_assignments=total_assignments,
                ),
            )
            for u, m in students_rows
        ],
        cells=cells,
    )


def _gradebook_cell(
    student_id: int,
    asg: AssignmentsTable,
    sub: SubmissionsTable,
    status: SubmissionStatus,
    value: float | None,
) -> GradebookCellDTO:
    percent: float | None = None
    if status == SubmissionStatus.GRADED and value is not None and asg.max_grade > 0:
        percent = round((value / asg.max_grade) * 100, 2)
    return GradebookCellDTO(
        student_id=student_id,
        assignment_id=asg.id,
        status=status,
        value=value,
        percent=percent,
        is_late=_is_late(sub, asg),
        submitted_at=sub.submitted_at,
    )


def _effective_group_cell(
    mode: GradingMode,
    sub: SubmissionsTable,
    grade: GradesTable | None,
    user_id: int,
    member_grade_map: dict[int, dict[int, float]],
) -> tuple[SubmissionStatus, float | None]:
    """Эффективные статус и балл члена команды по командному решению."""
    if mode == GradingMode.EVEN:
        # равномерное: командная оценка = оценка каждого члена
        value = grade.value if sub.status == SubmissionStatus.GRADED and grade else None
        return sub.status, value

    # individual: пока не распределили — pending; после — личный балл члена
    if sub.status == SubmissionStatus.PENDING_REDISTRIBUTION:
        return SubmissionStatus.PENDING_REDISTRIBUTION, None
    if sub.status == SubmissionStatus.GRADED:
        return SubmissionStatus.GRADED, member_grade_map.get(sub.id, {}).get(user_id)
    return sub.status, None


def _build_summaries(
    student_ids: list[int], cells: list[GradebookCellDTO]
) -> dict[int, dict[str, float | int]]:
    """Сводка по каждому студенту из готовых ячеек журнала."""
    summary_map: dict[int, dict[str, float | int]] = {
        student_id: {
            "graded_count": 0,
            "submitted_count": 0,
            "pending_review_count": 0,
            "percent_sum": 0.0,
            "percent_count": 0,
        }
        for student_id in student_ids
    }
    for cell in cells:
        summary = summary_map.setdefault(
            cell.student_id,
            {
                "graded_count": 0,
                "submitted_count": 0,
                "pending_review_count": 0,
                "percent_sum": 0.0,
                "percent_count": 0,
            },
        )
        # сдал = есть командное/личное решение в работе у преподавателя или оценено
        if cell.status in {
            SubmissionStatus.SUBMITTED,
            SubmissionStatus.GRADED,
            SubmissionStatus.PENDING_REDISTRIBUTION,
        }:
            summary["submitted_count"] += 1
        if cell.status == SubmissionStatus.SUBMITTED:
            summary["pending_review_count"] += 1
        if cell.status == SubmissionStatus.GRADED:
            summary["graded_count"] += 1
            if cell.percent is not None:
                summary["percent_sum"] += cell.percent
                summary["percent_count"] += 1
    return summary_map
