from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import AssignmentsTable, SubmissionsTable, SubmissionStatus, UsersTable

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
) -> tuple[SubmissionsTable, UsersTable] | None:
    result = await db.execute(
        select(SubmissionsTable, UsersTable)
        .join(UsersTable, UsersTable.id == SubmissionsTable.student_id)
        .join(AssignmentsTable, AssignmentsTable.id == SubmissionsTable.assignment_id)
        .where(SubmissionsTable.id == sid, _ASSIGNMENT_ACTIVE)
    )
    row = result.first()
    return (row[0], row[1]) if row else None


async def list_for_assignment(
    assignment_id: int,
    status: SubmissionStatus | None,
    limit: int,
    offset: int,
    db: AsyncSession,
) -> list[tuple[SubmissionsTable, UsersTable]]:
    query = (
        select(SubmissionsTable, UsersTable)
        .join(UsersTable, UsersTable.id == SubmissionsTable.student_id)
        .join(AssignmentsTable, AssignmentsTable.id == SubmissionsTable.assignment_id)
        .where(SubmissionsTable.assignment_id == assignment_id, _ASSIGNMENT_ACTIVE)
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
    return [(sub, student) for sub, student in result.all()]


async def count_for_assignment(
    assignment_id: int, status: SubmissionStatus | None, db: AsyncSession
) -> int:
    query = (
        select(func.count(SubmissionsTable.id))
        .join(AssignmentsTable, AssignmentsTable.id == SubmissionsTable.assignment_id)
        .where(SubmissionsTable.assignment_id == assignment_id, _ASSIGNMENT_ACTIVE)
    )
    if status is not None:
        query = query.where(SubmissionsTable.status == status)
    result = await db.execute(query)
    return int(result.scalar_one())
