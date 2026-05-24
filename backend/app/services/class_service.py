import secrets
import string

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database.models import (
    ClassesTable,
    ClassMembersTable,
    ClassRole,
    ClassType,
)
from app.database.repositories import class_repo
from app.schemas.class_schemas import ClassDTO, MyClassDTO
from app.schemas.errors import ServiceError

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
    return [
        MyClassDTO(
            id=c.id,
            name=c.name,
            type=c.type,
            creator_id=c.creator_id,
            role=m.role,
            joined_at=m.joined_at,
        )
        for c, m in rows
    ]


async def _join(
    cls: ClassesTable, user_id: int, db: AsyncSession
) -> ClassMembersTable:
    existing = await class_repo.get_member(cls.id, user_id, db)
    if existing:
        raise ServiceError("Вы уже состоите в этом классе", 409)

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


async def get_user_role_in_class(
    class_id: int, user_id: int, db: AsyncSession
) -> ClassRole:
    cls = await class_repo.get_by_id(class_id, db)
    if not cls:
        raise ServiceError("Класс не найден", 404)
    member = await class_repo.get_member(class_id, user_id, db)
    if not member:
        raise ServiceError("Вы не состоите в этом классе", 404)
    return member.role
