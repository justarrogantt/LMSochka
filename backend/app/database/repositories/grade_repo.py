from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import GradesTable, SubmissionsTable, UsersTable


async def get_by_submission(submission_id: int, db: AsyncSession) -> GradesTable | None:
    result = await db.execute(
        select(GradesTable).where(GradesTable.submission_id == submission_id)
    )
    return result.scalar_one_or_none()


async def get_with_grader_by_submission(
    submission_id: int, db: AsyncSession
) -> tuple[GradesTable, UsersTable] | None:
    result = await db.execute(
        select(GradesTable, UsersTable)
        .join(UsersTable, UsersTable.id == GradesTable.graded_by_user_id)
        .where(GradesTable.submission_id == submission_id)
    )
    row = result.first()
    return (row[0], row[1]) if row else None


async def upsert(
    submission_id: int,
    graded_by_user_id: int,
    value: float,
    comment: str | None,
    db: AsyncSession,
) -> GradesTable:
    grade = await get_by_submission(submission_id, db)
    if grade is None:
        grade = GradesTable(
            submission_id=submission_id,
            graded_by_user_id=graded_by_user_id,
            value=value,
            comment=comment,
        )
    else:
        grade.graded_by_user_id = graded_by_user_id
        grade.value = value
        grade.comment = comment

    db.add(grade)
    await db.commit()
    await db.refresh(grade)
    return grade


async def has_any_for_assignment(assignment_id: int, db: AsyncSession) -> bool:
    result = await db.execute(
        select(func.count(GradesTable.id))
        .join(SubmissionsTable, SubmissionsTable.id == GradesTable.submission_id)
        .where(SubmissionsTable.assignment_id == assignment_id)
    )
    return int(result.scalar_one()) > 0
