from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import (
    ClassesTable,
    ClassMembersTable,
    ClassRole,
    ClassType,
    UsersTable,
)

# Все геттеры по умолчанию скрывают soft-deleted классы. Если когда-то понадобится
# админский доступ к удалённым — добавим параметр include_deleted=True.
_NOT_DELETED = ClassesTable.deleted_at.is_(None)
# То же для участников: ушедшие/исключённые остаются в БД (для истории оценок),
# но не должны показываться в обычных выборках
_MEMBER_ACTIVE = ClassMembersTable.deleted_at.is_(None)


async def get_by_id(class_id: int, db: AsyncSession) -> ClassesTable | None:
    result = await db.execute(
        select(ClassesTable).where(ClassesTable.id == class_id, _NOT_DELETED)
    )
    return result.scalar_one_or_none()


async def get_by_code(code: str, db: AsyncSession) -> ClassesTable | None:
    result = await db.execute(
        select(ClassesTable).where(
            ClassesTable.join_code == code, _NOT_DELETED
        )
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
    """Активный участник класса. Soft-deleted записи скрыты."""
    result = await db.execute(
        select(ClassMembersTable).where(
            ClassMembersTable.class_id == class_id,
            ClassMembersTable.user_id == user_id,
            _MEMBER_ACTIVE,
        )
    )
    return result.scalar_one_or_none()


async def get_member_any(
    class_id: int, user_id: int, db: AsyncSession
) -> ClassMembersTable | None:
    """То же, но включая удалённых. Нужно для /join, чтобы отличить
    «никогда не вступал» от «был кикнут» — повторный join таким запрещён."""
    result = await db.execute(
        select(ClassMembersTable).where(
            ClassMembersTable.class_id == class_id,
            ClassMembersTable.user_id == user_id,
        )
    )
    return result.scalar_one_or_none()


async def get_member_with_user(
    class_id: int, user_id: int, db: AsyncSession
) -> tuple[UsersTable, ClassMembersTable] | None:
    """Участник + связанный юзер одним запросом — для DTO ответа на PATCH role."""
    result = await db.execute(
        select(UsersTable, ClassMembersTable)
        .join(ClassMembersTable, ClassMembersTable.user_id == UsersTable.id)
        .where(
            ClassMembersTable.class_id == class_id,
            ClassMembersTable.user_id == user_id,
            _MEMBER_ACTIVE,
        )
    )
    row = result.first()
    return (row[0], row[1]) if row else None


async def update_member_role(
    member: ClassMembersTable, new_role: ClassRole, db: AsyncSession
) -> ClassMembersTable:
    member.role = new_role
    db.add(member)
    await db.commit()
    await db.refresh(member)
    return member


async def soft_delete_member(
    member: ClassMembersTable, db: AsyncSession
) -> None:
    """Помечаем участника удалённым. Запись остаётся, чтобы не сломать FK у оценок и решений."""
    member.deleted_at = datetime.now(UTC)
    db.add(member)
    await db.commit()


async def list_for_user(
    user_id: int, db: AsyncSession
) -> list[tuple[ClassesTable, ClassMembersTable]]:
    """Классы юзера вместе с записью членства — отсюда берём роль и дату вступления."""
    result = await db.execute(
        select(ClassesTable, ClassMembersTable)
        .join(ClassMembersTable, ClassMembersTable.class_id == ClassesTable.id)
        .where(
            ClassMembersTable.user_id == user_id,
            _MEMBER_ACTIVE,
            _NOT_DELETED,
        )
        .order_by(ClassMembersTable.joined_at.desc())
    )
    return [(c, m) for c, m in result.all()]


async def list_members(
    class_id: int, db: AsyncSession
) -> list[tuple[UsersTable, ClassMembersTable]]:
    """Все участники класса (юзер + запись членства).

    Сортируем: сначала роль (CREATOR→STUDENT), потом по дате вступления.
    """
    result = await db.execute(
        select(UsersTable, ClassMembersTable)
        .join(ClassMembersTable, ClassMembersTable.user_id == UsersTable.id)
        .where(ClassMembersTable.class_id == class_id, _MEMBER_ACTIVE)
        .order_by(ClassMembersTable.role, ClassMembersTable.joined_at)
    )
    return [(u, m) for u, m in result.all()]


async def count_by_role(class_id: int, db: AsyncSession) -> dict[ClassRole, int]:
    """Сколько участников каждой роли в классе. Используется для counts в DTO."""
    result = await db.execute(
        select(ClassMembersTable.role, func.count())
        .where(ClassMembersTable.class_id == class_id, _MEMBER_ACTIVE)
        .group_by(ClassMembersTable.role)
    )
    counts = {role: 0 for role in ClassRole}
    for role, cnt in result.all():
        counts[role] = cnt
    return counts


async def list_public(
    search: str | None, db: AsyncSession
) -> list[ClassesTable]:
    """Открытые классы с опциональным поиском по name (case-insensitive подстрока)."""
    query = select(ClassesTable).where(
        ClassesTable.type == ClassType.OPEN, _NOT_DELETED
    )
    if search:
        query = query.where(ClassesTable.name.ilike(f"%{search.strip()}%"))
    result = await db.execute(query.order_by(ClassesTable.created_at.desc()))
    return list(result.scalars().all())


async def get_member_class_ids(
    user_id: int, class_ids: list[int], db: AsyncSession
) -> set[int]:
    """Возвращает подмножество class_ids, в которых юзер уже состоит. Один запрос для всех."""
    if not class_ids:
        return set()
    result = await db.execute(
        select(ClassMembersTable.class_id).where(
            ClassMembersTable.user_id == user_id,
            ClassMembersTable.class_id.in_(class_ids),
            _MEMBER_ACTIVE,
        )
    )
    return set(result.scalars().all())


async def soft_delete(cls: ClassesTable, db: AsyncSession) -> None:
    """Помечаем класс удалённым.

    Запись остаётся в БД, чтобы не сломать связанные сущности (задания, оценки).
    """
    cls.deleted_at = datetime.now(UTC)
    db.add(cls)
    await db.commit()
