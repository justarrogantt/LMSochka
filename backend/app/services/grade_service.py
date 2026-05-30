from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import (
    AssignmentsTable,
    ClassMembersTable,
    ClassRole,
    GradesTable,
    SubmissionStatus,
    UsersTable,
)
from app.database.repositories import assignment_repo, class_repo, grade_repo, submission_repo
from app.schemas.errors import ServiceError
from app.schemas.grade_schemas import GradeDTO, UpsertGradeRequest
from app.schemas.gradebook_schemas import (
    GradebookAssignmentDTO,
    GradebookCellDTO,
    GradebookDTO,
    GradebookStudentDTO,
)
from app.schemas.submission_schemas import SubmissionDTO
from app.schemas.user_schemas import UserBriefDTO
from app.services import submission_service
from app.services.submission_service import _is_late


def _grade_dto(grade: GradesTable, grader: UsersTable) -> GradeDTO:
    return GradeDTO(
        submission_id=grade.submission_id,
        value=grade.value,
        comment=grade.comment,
        graded_by=UserBriefDTO.model_validate(grader),
        graded_at=grade.graded_at,
        updated_at=grade.updated_at,
    )


async def _get_assignment_or_404(aid: int, db: AsyncSession) -> AssignmentsTable:
    asg = await assignment_repo.get_by_id_any(aid, db)
    if asg is None:
        raise ServiceError("Задание не найдено", 404)
    return asg


async def _get_member_or_403(
    class_id: int, user_id: int, db: AsyncSession
) -> ClassMembersTable:
    member = await class_repo.get_member(class_id, user_id, db)
    if member is None:
        raise ServiceError("Вы не состоите в этом классе", 403)
    return member


async def _ensure_teacher_or_creator(
    assignment: AssignmentsTable, user_id: int, db: AsyncSession
) -> ClassMembersTable:
    member = await _get_member_or_403(assignment.class_id, user_id, db)
    if member.role not in {ClassRole.TEACHER, ClassRole.CREATOR}:
        raise ServiceError("Недостаточно прав", 403)
    return member


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

    asg = await _get_assignment_or_404(sub.assignment_id, db)
    await _ensure_teacher_or_creator(asg, grader.id, db)

    if sub.status not in {SubmissionStatus.SUBMITTED, SubmissionStatus.GRADED}:
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

    if sub.status != SubmissionStatus.GRADED:
        sub.status = SubmissionStatus.GRADED
        db.add(sub)
        await db.commit()

    await db.refresh(sub)
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

    asg = await _get_assignment_or_404(sub.assignment_id, db)
    if user.id != sub.student_id:
        await _ensure_teacher_or_creator(asg, user.id, db)
    else:
        await _get_member_or_403(asg.class_id, user.id, db)

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

    asg = await _get_assignment_or_404(sub.assignment_id, db)
    await _ensure_teacher_or_creator(asg, user.id, db)

    if grade is None:
        raise ServiceError("Оценка не найдена", 404)

    await grade_repo.delete(grade, db)

    # если решение было в статусе graded — возвращаем его в submitted (оно ведь сдано).
    # Если уже returned (вернули на доработку после оценки) — статус не трогаем.
    if sub.status == SubmissionStatus.GRADED:
        sub.status = SubmissionStatus.SUBMITTED
        db.add(sub)
        await db.commit()
        await db.refresh(sub)

    return submission_service._dto(sub, student, asg, None)


async def get_gradebook(
    class_id: int, user: UsersTable, db: AsyncSession
) -> GradebookDTO:
    if await class_repo.get_by_id(class_id, db) is None:
        raise ServiceError("Класс не найден", 404)

    member = await _get_member_or_403(class_id, user.id, db)
    if member.role not in {ClassRole.TEACHER, ClassRole.CREATOR}:
        raise ServiceError("Недостаточно прав", 403)

    assignments = await assignment_repo.list_for_class_plain(class_id, db)
    students_rows = await class_repo.list_students_for_gradebook(class_id, db)

    assignment_ids = [a.id for a in assignments]
    student_ids = [u.id for u, _ in students_rows]
    submissions_rows = await submission_repo.list_for_gradebook(assignment_ids, student_ids, db)

    assignments_by_id = {a.id: a for a in assignments}
    cells: list[GradebookCellDTO] = []
    for sub, grade in submissions_rows:
        asg = assignments_by_id.get(sub.assignment_id)
        if asg is None:
            continue
        cells.append(
            GradebookCellDTO(
                student_id=sub.student_id,
                assignment_id=sub.assignment_id,
                status=sub.status,
                value=grade.value if grade is not None else None,
                is_late=_is_late(sub, asg),
                submitted_at=sub.submitted_at,
            )
        )

    return GradebookDTO(
        assignments=[
            GradebookAssignmentDTO(
                id=a.id,
                title=a.title,
                max_grade=a.max_grade,
                due_at=a.due_at,
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
            )
            for u, m in students_rows
        ],
        cells=cells,
    )
