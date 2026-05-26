from datetime import UTC, datetime

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import SessionsTable


async def get_active_by_jti(
    jti: str, user_id: int, db: AsyncSession
) -> SessionsTable | None:
    """Активная сессия = не отозвана и не протухла. Используется для проверки access-токена."""
    result = await db.execute(
        select(SessionsTable).where(
            SessionsTable.id == jti,
            SessionsTable.user_id == user_id,
            SessionsTable.revoked.is_(False),
            SessionsTable.expires_at > datetime.now(UTC),
        )
    )
    return result.scalar_one_or_none()


async def get_by_jti(jti: str, db: AsyncSession) -> SessionsTable | None:
    """Сессия без фильтров — нужна для refresh.

    Геттер видит revoked/refresh_used сессии, чтобы сработала reuse detection.
    """
    result = await db.execute(select(SessionsTable).where(SessionsTable.id == jti))
    return result.scalar_one_or_none()


async def revoke_by_jti(jti: str, db: AsyncSession) -> None:
    await db.execute(
        update(SessionsTable)
        .where(SessionsTable.id == jti)
        .values(revoked=True)
    )
    await db.commit()


async def revoke_all_for_user(user_id: int, db: AsyncSession) -> None:
    await db.execute(
        update(SessionsTable)
        .where(SessionsTable.user_id == user_id, SessionsTable.revoked.is_(False))
        .values(revoked=True)
    )
    await db.commit()
