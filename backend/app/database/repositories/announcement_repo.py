from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import AnnouncementsTable, UsersTable

# Скрываем soft-deleted во всех геттерах. Если когда-то надо будет смотреть удалённые
# (аудит, восстановление) — добавим include_deleted=True.
_NOT_DELETED = AnnouncementsTable.deleted_at.is_(None)


async def create(
    class_id: int, author_id: int, title: str, content: str, db: AsyncSession
) -> AnnouncementsTable:
    ann = AnnouncementsTable(
        class_id=class_id,
        author_id=author_id,
        title=title,
        content=content,
    )
    db.add(ann)
    await db.flush()
    return ann


async def get_by_id(
    aid: int, class_id: int, db: AsyncSession
) -> AnnouncementsTable | None:
    """Объявление по id и его классу. Привязка к class_id гарантирует, что
    нельзя достать чужое объявление через знание только aid."""
    result = await db.execute(
        select(AnnouncementsTable).where(
            AnnouncementsTable.id == aid,
            AnnouncementsTable.class_id == class_id,
            _NOT_DELETED,
        )
    )
    return result.scalar_one_or_none()


async def get_with_author(
    aid: int, class_id: int, db: AsyncSession
) -> tuple[AnnouncementsTable, UsersTable] | None:
    """То же, но сразу с автором для сборки DTO одним запросом."""
    result = await db.execute(
        select(AnnouncementsTable, UsersTable)
        .join(UsersTable, UsersTable.id == AnnouncementsTable.author_id)
        .where(
            AnnouncementsTable.id == aid,
            AnnouncementsTable.class_id == class_id,
            _NOT_DELETED,
        )
    )
    row = result.first()
    return (row[0], row[1]) if row else None


async def list_for_class(
    class_id: int, limit: int, offset: int, db: AsyncSession
) -> list[tuple[AnnouncementsTable, UsersTable]]:
    """Страница объявлений с авторами. Сортировка — самое свежее сверху."""
    result = await db.execute(
        select(AnnouncementsTable, UsersTable)
        .join(UsersTable, UsersTable.id == AnnouncementsTable.author_id)
        .where(AnnouncementsTable.class_id == class_id, _NOT_DELETED)
        .order_by(AnnouncementsTable.created_at.desc(), AnnouncementsTable.id.desc())
        .limit(limit)
        .offset(offset)
    )
    return [(a, u) for a, u in result.all()]


async def count_for_class(class_id: int, db: AsyncSession) -> int:
    """Тотал для PageDTO. Отдельным запросом, чтобы не тянуть весь список ради count."""
    result = await db.execute(
        select(func.count(AnnouncementsTable.id)).where(
            AnnouncementsTable.class_id == class_id, _NOT_DELETED
        )
    )
    return int(result.scalar_one())


async def update(
    ann: AnnouncementsTable,
    title: str | None,
    content: str | None,
    db: AsyncSession,
) -> AnnouncementsTable:
    if title is not None:
        ann.title = title
    if content is not None:
        ann.content = content
    db.add(ann)
    await db.commit()
    await db.refresh(ann)
    return ann


async def soft_delete(ann: AnnouncementsTable, db: AsyncSession) -> None:
    """Помечаем удалённым. Запись остаётся в БД для истории."""
    ann.deleted_at = datetime.now(UTC)
    db.add(ann)
    await db.commit()
