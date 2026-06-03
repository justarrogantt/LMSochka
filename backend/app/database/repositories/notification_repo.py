from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import NotificationsTable


async def create_many(
    notifications: list[NotificationsTable], db: AsyncSession
) -> list[NotificationsTable]:
    if not notifications:
        return []

    db.add_all(notifications)
    await db.commit()
    for notification in notifications:
        await db.refresh(notification)
    return notifications


async def trim_for_users(user_ids: list[int], keep: int, db: AsyncSession) -> None:
    """Оставляем у каждого пользователя только последние `keep` уведомлений.

    Так лента не растёт бесконечно: старые (за пределами окна) удаляем физически.
    """
    for user_id in set(user_ids):
        keep_ids_result = await db.execute(
            select(NotificationsTable.id)
            .where(NotificationsTable.user_id == user_id)
            .order_by(NotificationsTable.created_at.desc(), NotificationsTable.id.desc())
            .limit(keep)
        )
        keep_ids = list(keep_ids_result.scalars().all())
        # пока не накопилось больше лимита — удалять нечего
        if len(keep_ids) < keep:
            continue

        await db.execute(
            delete(NotificationsTable).where(
                NotificationsTable.user_id == user_id,
                NotificationsTable.id.notin_(keep_ids),
            )
        )
    await db.commit()


async def list_for_user(
    user_id: int, limit: int, offset: int, db: AsyncSession
) -> list[NotificationsTable]:
    result = await db.execute(
        select(NotificationsTable)
        .where(NotificationsTable.user_id == user_id)
        .order_by(NotificationsTable.created_at.desc(), NotificationsTable.id.desc())
        .limit(limit)
        .offset(offset)
    )
    return list(result.scalars().all())


async def count_for_user(user_id: int, db: AsyncSession) -> int:
    result = await db.execute(
        select(func.count(NotificationsTable.id)).where(
            NotificationsTable.user_id == user_id
        )
    )
    return int(result.scalar_one())


async def count_unread_for_user(user_id: int, db: AsyncSession) -> int:
    result = await db.execute(
        select(func.count(NotificationsTable.id)).where(
            NotificationsTable.user_id == user_id,
            NotificationsTable.is_read.is_(False),
        )
    )
    return int(result.scalar_one())


async def get_for_user(
    notification_id: int, user_id: int, db: AsyncSession
) -> NotificationsTable | None:
    result = await db.execute(
        select(NotificationsTable).where(
            NotificationsTable.id == notification_id,
            NotificationsTable.user_id == user_id,
        )
    )
    return result.scalar_one_or_none()


async def mark_read(
    notification: NotificationsTable, db: AsyncSession
) -> NotificationsTable:
    notification.is_read = True
    db.add(notification)
    await db.commit()
    await db.refresh(notification)
    return notification


async def mark_all_read(user_id: int, db: AsyncSession) -> int:
    unread_count = await count_unread_for_user(user_id, db)
    if unread_count == 0:
        return 0

    await db.execute(
        update(NotificationsTable)
        .where(
            NotificationsTable.user_id == user_id,
            NotificationsTable.is_read.is_(False),
        )
        .values(is_read=True)
    )
    await db.commit()
    return unread_count
