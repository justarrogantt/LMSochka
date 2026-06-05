from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import SubmissionMemberGradesTable


async def list_for_submission(
    submission_id: int, db: AsyncSession
) -> list[SubmissionMemberGradesTable]:
    result = await db.execute(
        select(SubmissionMemberGradesTable).where(
            SubmissionMemberGradesTable.submission_id == submission_id
        )
    )
    return list(result.scalars().all())


async def delete_for_submission(submission_id: int, db: AsyncSession) -> None:
    await db.execute(
        delete(SubmissionMemberGradesTable).where(
            SubmissionMemberGradesTable.submission_id == submission_id
        )
    )
    await db.flush()


async def replace_for_submission(
    submission_id: int,
    grades: list[tuple[int, float]],
    db: AsyncSession,
) -> list[SubmissionMemberGradesTable]:
    """Перезаписываем распределение целиком: чистим старое, кладём новое."""
    await delete_for_submission(submission_id, db)
    rows = [
        SubmissionMemberGradesTable(
            submission_id=submission_id, user_id=user_id, value=value
        )
        for user_id, value in grades
    ]
    db.add_all(rows)
    await db.flush()
    return rows


async def map_for_submissions(
    submission_ids: list[int], db: AsyncSession
) -> dict[int, dict[int, float]]:
    """{submission_id: {user_id: value}} — для подмешивания в gradebook/me."""
    if not submission_ids:
        return {}
    result = await db.execute(
        select(
            SubmissionMemberGradesTable.submission_id,
            SubmissionMemberGradesTable.user_id,
            SubmissionMemberGradesTable.value,
        ).where(SubmissionMemberGradesTable.submission_id.in_(submission_ids))
    )
    grades: dict[int, dict[int, float]] = {}
    for submission_id, user_id, value in result.all():
        grades.setdefault(submission_id, {})[user_id] = value
    return grades
