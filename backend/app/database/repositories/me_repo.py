from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import AssignmentsTable, GradesTable, SubmissionsTable, SubmissionStatus

_ASSIGNMENT_ACTIVE = AssignmentsTable.deleted_at.is_(None)


async def count_assignments_for_classes(
    class_ids: list[int], db: AsyncSession
) -> dict[int, int]:
    if not class_ids:
        return {}

    result = await db.execute(
        select(AssignmentsTable.class_id, func.count(AssignmentsTable.id))
        .where(
            AssignmentsTable.class_id.in_(class_ids),
            _ASSIGNMENT_ACTIVE,
        )
        .group_by(AssignmentsTable.class_id)
    )
    return {class_id: int(cnt) for class_id, cnt in result.all()}


async def student_graded_stats_for_classes(
    class_ids: list[int], student_id: int, db: AsyncSession
) -> dict[int, tuple[int, float | None]]:
    if not class_ids:
        return {}

    percent_expr = (GradesTable.value / AssignmentsTable.max_grade) * 100
    result = await db.execute(
        select(
            AssignmentsTable.class_id,
            func.count(GradesTable.id),
            func.avg(percent_expr),
        )
        .join(SubmissionsTable, SubmissionsTable.assignment_id == AssignmentsTable.id)
        .join(GradesTable, GradesTable.submission_id == SubmissionsTable.id)
        .where(
            AssignmentsTable.class_id.in_(class_ids),
            _ASSIGNMENT_ACTIVE,
            SubmissionsTable.student_id == student_id,
            SubmissionsTable.status == SubmissionStatus.GRADED,
        )
        .group_by(AssignmentsTable.class_id)
    )
    return {
        class_id: (
            int(graded_count),
            round(float(avg_percent), 2) if avg_percent is not None else None,
        )
        for class_id, graded_count, avg_percent in result.all()
    }


async def teacher_graded_stats_for_classes(
    class_ids: list[int], db: AsyncSession
) -> dict[int, tuple[int, float | None]]:
    if not class_ids:
        return {}

    percent_expr = (GradesTable.value / AssignmentsTable.max_grade) * 100
    result = await db.execute(
        select(
            AssignmentsTable.class_id,
            func.count(GradesTable.id),
            func.avg(percent_expr),
        )
        .join(SubmissionsTable, SubmissionsTable.assignment_id == AssignmentsTable.id)
        .join(GradesTable, GradesTable.submission_id == SubmissionsTable.id)
        .where(
            AssignmentsTable.class_id.in_(class_ids),
            _ASSIGNMENT_ACTIVE,
            SubmissionsTable.status == SubmissionStatus.GRADED,
        )
        .group_by(AssignmentsTable.class_id)
    )
    return {
        class_id: (
            int(graded_count),
            round(float(avg_percent), 2) if avg_percent is not None else None,
        )
        for class_id, graded_count, avg_percent in result.all()
    }
