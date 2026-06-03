from datetime import UTC, datetime

from sqlalchemy import exists, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import (
    AssignmentsTable,
    SubmissionsTable,
    SubmissionStatus,
    UsersTable,
)

# Скрываем soft-deleted во всех выборках. Для аудита позже добавим include_deleted=True.
_NOT_DELETED = AssignmentsTable.deleted_at.is_(None)


def _has_pending_submission_expr():
    return exists(
        select(1).where(
            SubmissionsTable.assignment_id == AssignmentsTable.id,
            SubmissionsTable.status == SubmissionStatus.SUBMITTED,
        )
    )


async def create(
    class_id: int,
    author_id: int,
    title: str,
    description: str,
    material_url: str | None,
    due_at: datetime | None,
    max_grade: float,
    db: AsyncSession,
) -> AssignmentsTable:
    asg = AssignmentsTable(
        class_id=class_id,
        author_id=author_id,
        title=title,
        description=description,
        material_url=material_url,
        due_at=due_at,
        max_grade=max_grade,
    )
    db.add(asg)
    await db.flush()
    return asg


async def get_by_id(
    aid: int, class_id: int, db: AsyncSession
) -> AssignmentsTable | None:
    """Задание по id с привязкой к классу. Это защищает от случайного достукивания
    задания одного класса через путь другого класса."""
    result = await db.execute(
        select(AssignmentsTable).where(
            AssignmentsTable.id == aid,
            AssignmentsTable.class_id == class_id,
            _NOT_DELETED,
        )
    )
    return result.scalar_one_or_none()


async def get_by_id_any(aid: int, db: AsyncSession) -> AssignmentsTable | None:
    """Задание по id без привязки к class_id. Нужно для /assignments/{aid}/..."""
    result = await db.execute(
        select(AssignmentsTable).where(
            AssignmentsTable.id == aid,
            _NOT_DELETED,
        )
    )
    return result.scalar_one_or_none()


async def get_with_author(
    aid: int, class_id: int, db: AsyncSession
) -> tuple[AssignmentsTable, UsersTable] | None:
    """Задание + автор одним запросом для сборки DTO."""
    result = await db.execute(
        select(AssignmentsTable, UsersTable)
        .join(UsersTable, UsersTable.id == AssignmentsTable.author_id)
        .where(
            AssignmentsTable.id == aid,
            AssignmentsTable.class_id == class_id,
            _NOT_DELETED,
        )
    )
    row = result.first()
    return (row[0], row[1]) if row else None


async def list_for_class(
    class_id: int,
    limit: int,
    offset: int,
    *,
    only_pending_review: bool,
    db: AsyncSession,
) -> list[tuple[AssignmentsTable, UsersTable]]:
    """Страница заданий с авторами, свежие сверху."""
    query = (
        select(AssignmentsTable, UsersTable)
        .join(UsersTable, UsersTable.id == AssignmentsTable.author_id)
        .where(AssignmentsTable.class_id == class_id, _NOT_DELETED)
    )
    if only_pending_review:
        query = query.where(_has_pending_submission_expr())
    result = await db.execute(
        query
        .order_by(AssignmentsTable.created_at.desc(), AssignmentsTable.id.desc())
        .limit(limit)
        .offset(offset)
    )
    return [(a, u) for a, u in result.all()]


async def list_for_class_plain(
    class_id: int, db: AsyncSession
) -> list[AssignmentsTable]:
    """Список заданий класса без join-ов для gradebook."""
    result = await db.execute(
        select(AssignmentsTable)
        .where(AssignmentsTable.class_id == class_id, _NOT_DELETED)
        .order_by(AssignmentsTable.created_at.asc(), AssignmentsTable.id.asc())
    )
    return list(result.scalars().all())


async def count_for_class(
    class_id: int, *, only_pending_review: bool, db: AsyncSession
) -> int:
    """Total для PageDTO. Отдельным запросом — count и фетч не на одном узле."""
    query = select(func.count(AssignmentsTable.id)).where(
        AssignmentsTable.class_id == class_id, _NOT_DELETED
    )
    if only_pending_review:
        query = query.where(_has_pending_submission_expr())
    result = await db.execute(query)
    return int(result.scalar_one())


async def count_pending_review_for_class(class_id: int, db: AsyncSession) -> int:
    result = await db.execute(
        select(func.count(AssignmentsTable.id)).where(
            AssignmentsTable.class_id == class_id,
            _NOT_DELETED,
            _has_pending_submission_expr(),
        )
    )
    return int(result.scalar_one())


async def update(
    asg: AssignmentsTable,
    *,
    title: str | None,
    description: str | None,
    material_url: str | None,
    due_at: datetime | None,
    max_grade: float | None,
    clear_material_url: bool,
    clear_due_at: bool,
    db: AsyncSession,
) -> AssignmentsTable:
    """Частичное обновление. Флаги clear_* отделяют «не передали поле» от «передали null»."""
    if title is not None:
        asg.title = title
    if description is not None:
        asg.description = description
    if material_url is not None:
        asg.material_url = material_url
    elif clear_material_url:
        asg.material_url = None
    if due_at is not None:
        asg.due_at = due_at
    elif clear_due_at:
        asg.due_at = None
    if max_grade is not None:
        asg.max_grade = max_grade

    db.add(asg)
    await db.commit()
    await db.refresh(asg)
    return asg


async def soft_delete(asg: AssignmentsTable, db: AsyncSession) -> None:
    """Помечаем удалённым. Решения и оценки в БД остаются для аудита,
    но недоступны через API после фильтра _NOT_DELETED."""
    asg.deleted_at = datetime.now(UTC)
    db.add(asg)
    await db.commit()
