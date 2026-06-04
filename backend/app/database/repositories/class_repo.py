from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import (
    AssignmentsTable,
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


def _normalize_search(search: str | None) -> str | None:
    if not search:
        return None

    normalized = search.strip().casefold()
    return normalized or None


def _matches_search(name: str, search: str) -> bool:
    return search in name.casefold()


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


async def get_active_by_name_for_creator(
    name: str, creator_id: int, db: AsyncSession
) -> ClassesTable | None:
    """Активный курс этого создателя с таким же названием (регистронезависимо).

    Нужен, чтобы не плодить дубликаты курсов с одинаковым именем у одного автора.
    """
    result = await db.execute(
        select(ClassesTable).where(
            func.lower(ClassesTable.name) == name.strip().lower(),
            ClassesTable.creator_id == creator_id,
            _NOT_DELETED,
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
    member = ClassMembersTable(
        class_id=class_id,
        user_id=user_id,
        role=role,
        learning_started_at=datetime.now(UTC) if role == ClassRole.STUDENT else None,
    )
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
    if member.role != ClassRole.STUDENT and new_role == ClassRole.STUDENT:
        member.learning_started_at = datetime.now(UTC)
    member.role = new_role
    db.add(member)
    await db.commit()
    await db.refresh(member)
    return member


async def soft_delete_member(
    member: ClassMembersTable, reason: str, db: AsyncSession
) -> None:
    """Помечаем участника удалённым. Запись остаётся, чтобы не сломать FK у оценок и решений.

    reason: 'left' (само-выход) или 'kicked' (creator выгнал) — нужно, чтобы
    отличить «можно вернуться» от «обратно нельзя» при повторном /join.
    """
    member.deleted_at = datetime.now(UTC)
    member.removal_reason = reason
    db.add(member)
    await db.commit()


async def reactivate_member(
    member: ClassMembersTable, db: AsyncSession
) -> ClassMembersTable:
    """Возвращаем ушедшего юзера в класс (после само-выхода).

    Снимаем soft-delete, сбрасываем роль до student и обновляем joined_at —
    это новое вхождение, прошлые привилегии и дата теряются.
    """
    member.deleted_at = None
    member.removal_reason = None
    member.role = ClassRole.STUDENT
    member.joined_at = datetime.now(UTC)
    member.learning_started_at = member.joined_at
    db.add(member)
    await db.commit()
    await db.refresh(member)
    return member


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


async def list_kicked_members(
    class_id: int, limit: int, offset: int, db: AsyncSession
) -> list[tuple[UsersTable, ClassMembersTable]]:
    result = await db.execute(
        select(UsersTable, ClassMembersTable)
        .join(ClassMembersTable, ClassMembersTable.user_id == UsersTable.id)
        .where(
            ClassMembersTable.class_id == class_id,
            ClassMembersTable.deleted_at.is_not(None),
            ClassMembersTable.removal_reason == "kicked",
        )
        .order_by(ClassMembersTable.deleted_at.desc(), ClassMembersTable.user_id)
        .limit(limit)
        .offset(offset)
    )
    return [(u, m) for u, m in result.all()]


async def count_kicked_members(class_id: int, db: AsyncSession) -> int:
    result = await db.execute(
        select(func.count(ClassMembersTable.id)).where(
            ClassMembersTable.class_id == class_id,
            ClassMembersTable.deleted_at.is_not(None),
            ClassMembersTable.removal_reason == "kicked",
        )
    )
    return int(result.scalar_one())


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


async def list_member_user_ids(
    class_id: int,
    *,
    roles: tuple[ClassRole, ...] | None,
    exclude_user_id: int | None,
    include_inactive: bool,
    db: AsyncSession,
) -> list[int]:
    query = select(ClassMembersTable.user_id).where(ClassMembersTable.class_id == class_id)
    if roles:
        query = query.where(ClassMembersTable.role.in_(roles))
    if exclude_user_id is not None:
        query = query.where(ClassMembersTable.user_id != exclude_user_id)
    if not include_inactive:
        query = query.where(_MEMBER_ACTIVE)

    result = await db.execute(query.order_by(ClassMembersTable.user_id))
    return list(result.scalars().all())


async def list_public(
    search: str | None, limit: int, offset: int, db: AsyncSession
) -> list[ClassesTable]:
    """Открытые классы с опциональным поиском по name (case-insensitive подстрока)."""
    normalized_search = _normalize_search(search)
    query = select(ClassesTable).where(
        ClassesTable.type == ClassType.OPEN, _NOT_DELETED
    )

    if normalized_search:
        result = await db.execute(
            query.order_by(ClassesTable.created_at.desc(), ClassesTable.id.desc())
        )
        classes = [
            cls
            for cls in result.scalars().all()
            if _matches_search(cls.name, normalized_search)
        ]
        return classes[offset : offset + limit]

    result = await db.execute(
        query.order_by(ClassesTable.created_at.desc(), ClassesTable.id.desc())
        .limit(limit)
        .offset(offset)
    )
    return list(result.scalars().all())


async def count_public(search: str | None, db: AsyncSession) -> int:
    normalized_search = _normalize_search(search)
    query = select(func.count(ClassesTable.id)).where(
        ClassesTable.type == ClassType.OPEN, _NOT_DELETED
    )
    if normalized_search:
        names_query = select(ClassesTable.name).where(
            ClassesTable.type == ClassType.OPEN, _NOT_DELETED
        )
        result = await db.execute(names_query)
        return sum(
            1
            for name in result.scalars().all()
            if _matches_search(name, normalized_search)
        )

    result = await db.execute(query)
    return int(result.scalar_one())


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


async def count_active_students_for_classes(
    class_ids: list[int], db: AsyncSession
) -> dict[int, int]:
    if not class_ids:
        return {}

    result = await db.execute(
        select(ClassMembersTable.class_id, func.count())
        .where(
            ClassMembersTable.class_id.in_(class_ids),
            ClassMembersTable.role == ClassRole.STUDENT,
            _MEMBER_ACTIVE,
        )
        .group_by(ClassMembersTable.class_id)
    )
    return {class_id: int(cnt) for class_id, cnt in result.all()}


async def count_eligible_students_for_assignments(
    assignment_ids: list[int], db: AsyncSession
) -> dict[int, int]:
    """Сколько активных студентов обязаны выполнять каждое задание."""
    if not assignment_ids:
        return {}

    result = await db.execute(
        select(AssignmentsTable.id, func.count(ClassMembersTable.id))
        .join(
            ClassMembersTable,
            ClassMembersTable.class_id == AssignmentsTable.class_id,
        )
        .where(
            AssignmentsTable.id.in_(assignment_ids),
            ClassMembersTable.role == ClassRole.STUDENT,
            _MEMBER_ACTIVE,
        )
        .group_by(AssignmentsTable.id)
    )
    return {assignment_id: int(cnt) for assignment_id, cnt in result.all()}


async def list_students_for_gradebook(
    class_id: int, db: AsyncSession
) -> list[tuple[UsersTable, ClassMembersTable]]:
    """Студенты класса для gradebook, включая неактивных (left/kicked)."""
    result = await db.execute(
        select(UsersTable, ClassMembersTable)
        .join(ClassMembersTable, ClassMembersTable.user_id == UsersTable.id)
        .where(
            ClassMembersTable.class_id == class_id,
            ClassMembersTable.role == ClassRole.STUDENT,
        )
        .order_by(
            # Сначала активные, потом выбывшие.
            ClassMembersTable.deleted_at.is_not(None),
            ClassMembersTable.joined_at,
            UsersTable.id,
        )
    )
    return [(u, m) for u, m in result.all()]


async def transfer_ownership(
    cls: ClassesTable,
    old_creator: ClassMembersTable,
    new_creator: ClassMembersTable,
    db: AsyncSession,
) -> None:
    """Передаём роль создателя: новый владелец → creator, прежний → teacher.

    Всё в одной транзакции, чтобы не остаться без creator или с двумя сразу.
    creator_id на классе тоже переносим — он завязан на права и FK.
    """
    old_creator.role = ClassRole.TEACHER
    new_creator.role = ClassRole.CREATOR
    cls.creator_id = new_creator.user_id
    db.add_all([old_creator, new_creator, cls])
    await db.commit()


async def soft_delete(cls: ClassesTable, db: AsyncSession) -> None:
    """Помечаем класс удалённым.

    Запись остаётся в БД, чтобы не сломать связанные сущности (задания, оценки).
    """
    cls.deleted_at = datetime.now(UTC)
    db.add(cls)
    await db.commit()
