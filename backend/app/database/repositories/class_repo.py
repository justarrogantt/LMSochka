from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import (
    ClassesTable,
    ClassMembersTable,
    ClassRole,
    ClassType,
)


async def get_by_id(class_id: int, db: AsyncSession) -> ClassesTable | None:
    result = await db.execute(select(ClassesTable).where(ClassesTable.id == class_id))
    return result.scalar_one_or_none()


async def get_by_code(code: str, db: AsyncSession) -> ClassesTable | None:
    result = await db.execute(
        select(ClassesTable).where(ClassesTable.join_code == code)
    )
    return result.scalar_one_or_none()


async def create_class(
    name: str,
    class_type: ClassType,
    join_code: str | None,
    creator_id: int,
    db: AsyncSession,
) -> ClassesTable:
    cls = ClassesTable(
        name=name, type=class_type, join_code=join_code, creator_id=creator_id
    )
    db.add(cls)
    await db.flush()
    return cls


async def add_member(
    class_id: int, user_id: int, role: ClassRole, db: AsyncSession
) -> ClassMembersTable:
    member = ClassMembersTable(class_id=class_id, user_id=user_id, role=role)
    db.add(member)
    await db.flush()
    return member


async def get_member(
    class_id: int, user_id: int, db: AsyncSession
) -> ClassMembersTable | None:
    result = await db.execute(
        select(ClassMembersTable).where(
            ClassMembersTable.class_id == class_id,
            ClassMembersTable.user_id == user_id,
        )
    )
    return result.scalar_one_or_none()


async def list_for_user(
    user_id: int, db: AsyncSession
) -> list[tuple[ClassesTable, ClassMembersTable]]:
    result = await db.execute(
        select(ClassesTable, ClassMembersTable)
        .join(
            ClassMembersTable, ClassMembersTable.class_id == ClassesTable.id
        )
        .where(ClassMembersTable.user_id == user_id)
        .order_by(ClassMembersTable.joined_at.desc())
    )
    return [(c, m) for c, m in result.all()]
