from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import (
    AssignmentsTable,
    StoredFilesTable,
    SubmissionsTable,
)


async def get(file_id: str, db: AsyncSession) -> StoredFilesTable | None:
    return await db.get(StoredFilesTable, file_id)


async def get_many(
    file_ids: list[str], db: AsyncSession
) -> dict[str, StoredFilesTable]:
    if not file_ids:
        return {}
    result = await db.execute(
        select(StoredFilesTable).where(StoredFilesTable.id.in_(file_ids))
    )
    return {stored.id: stored for stored in result.scalars().all()}


async def get_assignment_for_file(
    file_id: str, db: AsyncSession
) -> AssignmentsTable | None:
    result = await db.execute(
        select(AssignmentsTable).where(
            AssignmentsTable.material_file_id == file_id,
            AssignmentsTable.deleted_at.is_(None),
        )
    )
    return result.scalar_one_or_none()


async def get_submission_for_file(
    file_id: str, db: AsyncSession
) -> tuple[SubmissionsTable, AssignmentsTable] | None:
    result = await db.execute(
        select(SubmissionsTable, AssignmentsTable)
        .join(AssignmentsTable, AssignmentsTable.id == SubmissionsTable.assignment_id)
        .where(
            SubmissionsTable.attachment_file_id == file_id,
            AssignmentsTable.deleted_at.is_(None),
        )
    )
    row = result.first()
    return (row[0], row[1]) if row else None

