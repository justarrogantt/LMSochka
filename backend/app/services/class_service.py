import secrets
import string

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database.models import (
    ClassesTable,
    ClassMembersTable,
    ClassRole,
    ClassType,
    UsersTable,
)
from app.database.repositories import class_repo
from app.schemas.class_schemas import (
    ClassDetailDTO,
    ClassDTO,
    ClassMemberDTO,
    MyClassDTO,
    PublicClassDTO,
)
from app.schemas.errors import ServiceError
from app.services.permissions_service import build_permissions

_CODE_ALPHABET = string.ascii_uppercase + string.digits


async def _generate_unique_code(db: AsyncSession) -> str:
    """8 символов A-Z0-9 через secrets (криптостойко). Перегенерируем при коллизии."""
    # 36^8 ≈ 2.8 трлн комбинаций, шанс коллизии ничтожный, но проверяем на всякий
    for _ in range(10):
        code = "".join(
            secrets.choice(_CODE_ALPHABET) for _ in range(settings.JOIN_CODE_LENGTH)
        )
        if not await class_repo.get_by_code(code, db):
            return code
    raise ServiceError("Не удалось сгенерировать уникальный код", 500)


async def create_class(
    name: str, class_type: ClassType, creator_id: int, db: AsyncSession
) -> ClassDTO:
    # код приглашения нужен только закрытым классам, открытые ищутся по id
    join_code = (
        await _generate_unique_code(db) if class_type == ClassType.CLOSED else None
    )

    cls = await class_repo.create_class(
        name=name.strip(),
        class_type=class_type,
        join_code=join_code,
        creator_id=creator_id,
        db=db,
    )
    # сразу записываем создателя в участники с ролью creator,
    # чтобы /my и /role работали для него без отдельной логики
    await class_repo.add_member(cls.id, creator_id, ClassRole.CREATOR, db)
    await db.commit()
    await db.refresh(cls)
    return ClassDTO.model_validate(cls)


async def list_my_classes(user_id: int, db: AsyncSession) -> list[MyClassDTO]:
    rows = await class_repo.list_for_user(user_id, db)
    # счётчики дёргаем по одному классу — нагрузка маленькая для MVP, не оптимизируем заранее
    result: list[MyClassDTO] = []
    for c, m in rows:
        counts = await class_repo.count_by_role(c.id, db)
        result.append(
            MyClassDTO(
                id=c.id,
                name=c.name,
                type=c.type,
                creator_id=c.creator_id,
                role=m.role,
                joined_at=m.joined_at,
                students_count=counts[ClassRole.STUDENT],
                teachers_count=counts[ClassRole.TEACHER] + counts[ClassRole.CREATOR],
            )
        )
    return result


async def get_class_detail(
    cls: ClassesTable, member: ClassMembersTable, db: AsyncSession
) -> ClassDetailDTO:
    """Страница класса для участника.

    Зависимость уже проверила членство — здесь только сборка DTO.
    """
    perms = build_permissions(member.role)
    counts = await class_repo.count_by_role(cls.id, db)

    # join_code прячем от тех, кто не может управлять участниками — для студента это лишнее
    visible_code = cls.join_code if perms["can_manage_members"] else None

    return ClassDetailDTO(
        id=cls.id,
        name=cls.name,
        type=cls.type,
        join_code=visible_code,
        creator_id=cls.creator_id,
        created_at=cls.created_at,
        user_role=member.role,
        permissions=perms,
        students_count=counts[ClassRole.STUDENT],
        teachers_count=counts[ClassRole.TEACHER] + counts[ClassRole.CREATOR],
    )


def _member_dto(u: UsersTable, m: ClassMembersTable) -> ClassMemberDTO:
    """Сборка DTO участника. is_active=False для ушедших (нужно для gradebook)."""
    return ClassMemberDTO(
        user_id=u.id,
        email=u.email,
        first_name=u.first_name,
        last_name=u.last_name,
        role=m.role,
        joined_at=m.joined_at,
        is_active=m.deleted_at is None,
    )


async def list_class_members(class_id: int, db: AsyncSession) -> list[ClassMemberDTO]:
    rows = await class_repo.list_members(class_id, db)
    return [_member_dto(u, m) for u, m in rows]


async def list_public_classes(
    search: str | None, user_id: int, db: AsyncSession
) -> list[PublicClassDTO]:
    classes = await class_repo.list_public(search, db)
    if not classes:
        return []

    # одним запросом узнаём в каких из найденных классов юзер уже участник
    my_ids = await class_repo.get_member_class_ids(
        user_id, [c.id for c in classes], db
    )
    result: list[PublicClassDTO] = []
    for c in classes:
        counts = await class_repo.count_by_role(c.id, db)
        result.append(
            PublicClassDTO(
                id=c.id,
                name=c.name,
                creator_id=c.creator_id,
                created_at=c.created_at,
                students_count=counts[ClassRole.STUDENT],
                is_member=c.id in my_ids,
            )
        )
    return result


async def _join(
    cls: ClassesTable, user_id: int, db: AsyncSession
) -> ClassMembersTable:
    # Берём запись включая soft-deleted: UniqueConstraint(class_id, user_id) не даст
    # insert-нуть повторно, плюс PM явно сказал — кикнутые в класс не возвращаются
    existing = await class_repo.get_member_any(cls.id, user_id, db)
    if existing and existing.deleted_at is None:
        raise ServiceError("Вы уже состоите в этом классе", 409)
    if existing and existing.deleted_at is not None:
        raise ServiceError(
            "Вы были удалены из этого класса. Обратитесь к создателю.", 403
        )

    member = await class_repo.add_member(cls.id, user_id, ClassRole.STUDENT, db)
    await db.commit()
    return member


async def join_open_class(
    class_id: int, user_id: int, db: AsyncSession
) -> ClassMembersTable:
    cls = await class_repo.get_by_id(class_id, db)
    if not cls:
        raise ServiceError("Класс не найден", 404)
    if cls.type != ClassType.OPEN:
        raise ServiceError("Этот класс закрытый, нужен код приглашения", 403)
    return await _join(cls, user_id, db)


async def join_by_code(
    code: str, user_id: int, db: AsyncSession
) -> ClassMembersTable:
    # код мог прийти с пробелами или в нижнем регистре — приводим к канону
    cls = await class_repo.get_by_code(code.strip().upper(), db)
    if not cls:
        raise ServiceError("Неверный код приглашения", 404)
    return await _join(cls, user_id, db)


async def update_class(
    cls: ClassesTable,
    name: str | None,
    new_type: ClassType | None,
    db: AsyncSession,
) -> ClassesTable:
    """Меняем name и/или type. При переходе OPEN→CLOSED генерим join_code, обратный убираем."""
    if name is not None:
        cls.name = name.strip()

    if new_type is not None and new_type != cls.type:
        if new_type == ClassType.CLOSED and cls.join_code is None:
            cls.join_code = await _generate_unique_code(db)
        elif new_type == ClassType.OPEN:
            # открытому коду делать нечего — для join используется id
            cls.join_code = None
        cls.type = new_type

    db.add(cls)
    await db.commit()
    await db.refresh(cls)
    return cls


async def delete_class(cls: ClassesTable, db: AsyncSession) -> None:
    """Soft delete: проставляем deleted_at, класс пропадает из всех выборок."""
    await class_repo.soft_delete(cls, db)


async def update_member_role(
    class_id: int, target_user_id: int, new_role: ClassRole, db: AsyncSession
) -> ClassMemberDTO:
    """Сменить роль участника. Вызывает только creator (проверено в роутере)."""
    row = await class_repo.get_member_with_user(class_id, target_user_id, db)
    if row is None:
        raise ServiceError("Участник не найден", 404)
    user, member = row

    # creator-а нельзя ни понизить, ни передать его роль — она привязана к автору класса
    if member.role == ClassRole.CREATOR:
        raise ServiceError("Нельзя изменить роль создателя класса", 403)

    if member.role == new_role:
        # ничего не меняем, просто возвращаем актуальную запись
        return _member_dto(user, member)

    member = await class_repo.update_member_role(member, new_role, db)
    return _member_dto(user, member)


async def remove_member(
    class_id: int, target_user_id: int, db: AsyncSession
) -> None:
    """Кик участника creator-ом. Удаление creator-а запрещено."""
    member = await class_repo.get_member(class_id, target_user_id, db)
    if member is None:
        raise ServiceError("Участник не найден", 404)
    if member.role == ClassRole.CREATOR:
        # creator уходит только через delete_class
        raise ServiceError("Создателя нельзя удалить из своего класса", 403)
    await class_repo.soft_delete_member(member, db)


async def leave_class(member: ClassMembersTable, db: AsyncSession) -> None:
    """Самовыход. creator-у нельзя — у него только delete_class."""
    if member.role == ClassRole.CREATOR:
        raise ServiceError(
            "Создатель не может выйти из своего класса — только удалить его", 403
        )
    await class_repo.soft_delete_member(member, db)


