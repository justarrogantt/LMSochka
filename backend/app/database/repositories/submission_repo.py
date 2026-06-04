from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import (
    AssignmentsTable,
    ClassMembersTable,
    ClassRole,
    GradesTable,
    SubmissionsTable,
    SubmissionStatus,
    UsersTable,
)

# После удаления задания его решения остаются в БД, но через API недоступны.
_ASSIGNMENT_ACTIVE = AssignmentsTable.deleted_at.is_(None)


async def get_by_assignment_and_student(
    assignment_id: int, student_id: int, db: AsyncSession
) -> SubmissionsTable | None:
    result = await db.execute(
        select(SubmissionsTable)
        .join(AssignmentsTable, AssignmentsTable.id == SubmissionsTable.assignment_id)
        .where(
            SubmissionsTable.assignment_id == assignment_id,
            SubmissionsTable.student_id == student_id,
            _ASSIGNMENT_ACTIVE,
        )
    )
    return result.scalar_one_or_none()


async def create(
    assignment_id: int,
    student_id: int,
    answer_text: str,
    attachment_url: str | None,
    db: AsyncSession,
) -> SubmissionsTable:
    sub = SubmissionsTable(
        assignment_id=assignment_id,
        student_id=student_id,
        answer_text=answer_text,
        attachment_url=attachment_url,
        status=SubmissionStatus.DRAFT,
    )
    db.add(sub)
    await db.flush()
    return sub


async def get_with_student_by_id(
    sid: int, db: AsyncSession
) -> tuple[SubmissionsTable, UsersTable, GradesTable | None] | None:
    result = await db.execute(
        select(SubmissionsTable, UsersTable, GradesTable)
        .join(UsersTable, UsersTable.id == SubmissionsTable.student_id)
        .join(AssignmentsTable, AssignmentsTable.id == SubmissionsTable.assignment_id)
        .join(
            ClassMembersTable,
            (ClassMembersTable.class_id == AssignmentsTable.class_id)
            & (ClassMembersTable.user_id == SubmissionsTable.student_id),
        )
        .outerjoin(GradesTable, GradesTable.submission_id == SubmissionsTable.id)
        .where(
            SubmissionsTable.id == sid,
            _ASSIGNMENT_ACTIVE,
            ClassMembersTable.role == ClassRole.STUDENT,
            ClassMembersTable.learning_started_at.is_not(None),
            ClassMembersTable.learning_started_at <= AssignmentsTable.created_at,
        )
    )
    row = result.first()
    return (row[0], row[1], row[2]) if row else None


async def list_for_assignment(
    assignment_id: int,
    status: SubmissionStatus | None,
    limit: int,
    offset: int,
    db: AsyncSession,
) -> list[tuple[SubmissionsTable, UsersTable, GradesTable | None]]:
    query = (
        select(SubmissionsTable, UsersTable, GradesTable)
        .join(UsersTable, UsersTable.id == SubmissionsTable.student_id)
        .join(AssignmentsTable, AssignmentsTable.id == SubmissionsTable.assignment_id)
        .join(
            ClassMembersTable,
            (ClassMembersTable.class_id == AssignmentsTable.class_id)
            & (ClassMembersTable.user_id == SubmissionsTable.student_id),
        )
        .outerjoin(GradesTable, GradesTable.submission_id == SubmissionsTable.id)
        .where(
            SubmissionsTable.assignment_id == assignment_id,
            _ASSIGNMENT_ACTIVE,
            ClassMembersTable.role == ClassRole.STUDENT,
            ClassMembersTable.learning_started_at.is_not(None),
            ClassMembersTable.learning_started_at <= AssignmentsTable.created_at,
        )
    )
    if status is not None:
        query = query.where(SubmissionsTable.status == status)

    result = await db.execute(
        query
        # submitted_at DESC NULLS LAST
        .order_by(
            SubmissionsTable.submitted_at.is_(None),
            SubmissionsTable.submitted_at.desc(),
            SubmissionsTable.id.desc(),
        )
        .limit(limit)
        .offset(offset)
    )
    return [(sub, student, grade) for sub, student, grade in result.all()]


async def count_for_assignment(
    assignment_id: int, status: SubmissionStatus | None, db: AsyncSession
) -> int:
    query = (
        select(func.count(SubmissionsTable.id))
        .join(AssignmentsTable, AssignmentsTable.id == SubmissionsTable.assignment_id)
        .join(
            ClassMembersTable,
            (ClassMembersTable.class_id == AssignmentsTable.class_id)
            & (ClassMembersTable.user_id == SubmissionsTable.student_id),
        )
        .where(
            SubmissionsTable.assignment_id == assignment_id,
            _ASSIGNMENT_ACTIVE,
            ClassMembersTable.role == ClassRole.STUDENT,
            ClassMembersTable.learning_started_at.is_not(None),
            ClassMembersTable.learning_started_at <= AssignmentsTable.created_at,
        )
    )
    if status is not None:
        query = query.where(SubmissionsTable.status == status)
    result = await db.execute(query)
    return int(result.scalar_one())


async def map_student_submissions_for_assignments(
    assignment_ids: list[int], student_id: int, db: AsyncSession
) -> dict[int, tuple[SubmissionsTable, GradesTable | None]]:
    """Решения одного студента по набору заданий: {assignment_id: (submission, grade)}.

    Один запрос вместо N — нужно для бейджей в списке заданий студента.
    """
    if not assignment_ids:
        return {}
    result = await db.execute(
        select(SubmissionsTable, GradesTable)
        .join(AssignmentsTable, AssignmentsTable.id == SubmissionsTable.assignment_id)
        .outerjoin(GradesTable, GradesTable.submission_id == SubmissionsTable.id)
        .where(
            SubmissionsTable.assignment_id.in_(assignment_ids),
            SubmissionsTable.student_id == student_id,
            _ASSIGNMENT_ACTIVE,
        )
    )
    return {sub.assignment_id: (sub, grade) for sub, grade in result.all()}


async def stats_for_assignments(
    assignment_ids: list[int], db: AsyncSession
) -> dict[int, tuple[int, int, int, int]]:
    """Прогресс сдачи по заданиям.

    Возвращает:
    {assignment_id: (submitted_count, graded_count, pending_review_count, returned_count)}

    submitted_count — submitted/graded (студент сдал),
    pending_review_count — только submitted,
    graded_count — только graded,
    returned_count — только returned.
    """
    if not assignment_ids:
        return {}
    submitted_expr = func.sum(
        case(
            (
                SubmissionsTable.status.in_(
                    [SubmissionStatus.SUBMITTED, SubmissionStatus.GRADED]
                ),
                1,
            ),
            else_=0,
        )
    )
    graded_expr = func.sum(
        case((SubmissionsTable.status == SubmissionStatus.GRADED, 1), else_=0)
    )
    pending_expr = func.sum(
        case((SubmissionsTable.status == SubmissionStatus.SUBMITTED, 1), else_=0)
    )
    returned_expr = func.sum(
        case((SubmissionsTable.status == SubmissionStatus.RETURNED, 1), else_=0)
    )
    result = await db.execute(
        select(
            SubmissionsTable.assignment_id,
            submitted_expr,
            graded_expr,
            pending_expr,
            returned_expr,
        )
        .join(AssignmentsTable, AssignmentsTable.id == SubmissionsTable.assignment_id)
        .join(
            ClassMembersTable,
            (ClassMembersTable.class_id == AssignmentsTable.class_id)
            & (ClassMembersTable.user_id == SubmissionsTable.student_id),
        )
        .where(
            SubmissionsTable.assignment_id.in_(assignment_ids),
            _ASSIGNMENT_ACTIVE,
            ClassMembersTable.role == ClassRole.STUDENT,
            ClassMembersTable.deleted_at.is_(None),
            ClassMembersTable.learning_started_at.is_not(None),
            ClassMembersTable.learning_started_at <= AssignmentsTable.created_at,
        )
        .group_by(SubmissionsTable.assignment_id)
    )
    return {
        aid: (int(s or 0), int(g or 0), int(p or 0), int(r or 0))
        for aid, s, g, p, r in result.all()
    }


async def list_for_gradebook(
    assignment_ids: list[int], student_ids: list[int], db: AsyncSession
) -> list[tuple[SubmissionsTable, GradesTable | None]]:
    if not assignment_ids or not student_ids:
        return []

    result = await db.execute(
        select(SubmissionsTable, GradesTable)
        .join(AssignmentsTable, AssignmentsTable.id == SubmissionsTable.assignment_id)
        .join(
            ClassMembersTable,
            (ClassMembersTable.class_id == AssignmentsTable.class_id)
            & (ClassMembersTable.user_id == SubmissionsTable.student_id),
        )
        .outerjoin(GradesTable, GradesTable.submission_id == SubmissionsTable.id)
        .where(
            SubmissionsTable.assignment_id.in_(assignment_ids),
            SubmissionsTable.student_id.in_(student_ids),
            _ASSIGNMENT_ACTIVE,
            ClassMembersTable.role == ClassRole.STUDENT,
            ClassMembersTable.learning_started_at.is_not(None),
            ClassMembersTable.learning_started_at <= AssignmentsTable.created_at,
        )
    )
    return [(sub, grade) for sub, grade in result.all()]
