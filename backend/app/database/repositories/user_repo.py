from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import UsersTable


async def get_by_email(email: str, db: AsyncSession) -> UsersTable | None:
    result = await db.execute(select(UsersTable).where(UsersTable.email == email))
    return result.scalar_one_or_none()


async def get_by_id(user_id: int, db: AsyncSession) -> UsersTable | None:
    result = await db.execute(select(UsersTable).where(UsersTable.id == user_id))
    return result.scalar_one_or_none()


async def create_user(
    email: str,
    password_hash: str,
    first_name: str | None,
    last_name: str | None,
    db: AsyncSession,
) -> UsersTable:
    user = UsersTable(
        email=email,
        password_hash=password_hash,
        first_name=first_name,
        last_name=last_name,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def update_profile(
    user: UsersTable,
    *,
    email: str | None,
    first_name: str | None,
    last_name: str | None,
    db: AsyncSession,
) -> UsersTable:
    if email is not None:
        user.email = email
    if first_name is not None:
        user.first_name = first_name
    if last_name is not None:
        user.last_name = last_name

    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user
