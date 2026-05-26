from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.database import get_db
from app.database.models import ClassesTable, ClassMembersTable, ClassRole, UsersTable
from app.dependencies import get_current_user, require_class_member, require_class_role
from app.schemas.class_schemas import (
    ClassDetailDTO,
    ClassDTO,
    ClassMemberDTO,
    ClassRoleDTO,
    CreateClassRequest,
    JoinByCodeRequest,
    MyClassDTO,
    PublicClassDTO,
    UpdateClassRequest,
)
from app.schemas.errors import ServiceError
from app.services import class_service

classes_router = APIRouter(prefix="/classes", tags=["Classes"])


@classes_router.post("", status_code=201)
async def create_class(
    body: CreateClassRequest,
    context: tuple[UsersTable, str] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ClassDTO:
    """Создать класс. Создатель → роль creator. Для closed автогенерится join_code."""
    user, _ = context
    try:
        return await class_service.create_class(body.name, body.type, user.id, db)
    except ServiceError as e:
        raise HTTPException(status_code=e.status_code, detail=str(e)) from e


@classes_router.get("/my")
async def my_classes(
    context: tuple[UsersTable, str] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[MyClassDTO]:
    """Список классов, где состоит текущий юзер, вместе с его ролью в каждом."""
    user, _ = context
    return await class_service.list_my_classes(user.id, db)


@classes_router.get("/public")
async def public_classes(
    search: str | None = Query(default=None, max_length=100),
    context: tuple[UsersTable, str] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[PublicClassDTO]:
    """Каталог открытых классов с опциональным поиском по названию."""
    user, _ = context
    return await class_service.list_public_classes(search, user.id, db)


@classes_router.post("/join", status_code=201)
async def join_by_code(
    body: JoinByCodeRequest,
    context: tuple[UsersTable, str] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ClassRoleDTO:
    """Присоединение к закрытому классу по коду приглашения."""
    user, _ = context
    try:
        member = await class_service.join_by_code(body.code, user.id, db)
        return ClassRoleDTO(class_id=member.class_id, role=member.role)
    except ServiceError as e:
        raise HTTPException(status_code=e.status_code, detail=str(e)) from e


@classes_router.post("/{class_id}/join-open", status_code=201)
async def join_open(
    class_id: int,
    context: tuple[UsersTable, str] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ClassRoleDTO:
    """Присоединение к открытому классу по его id. Закрытым отвечает 403."""
    user, _ = context
    try:
        member = await class_service.join_open_class(class_id, user.id, db)
        return ClassRoleDTO(class_id=member.class_id, role=member.role)
    except ServiceError as e:
        raise HTTPException(status_code=e.status_code, detail=str(e)) from e


@classes_router.get("/{class_id}")
async def get_class(
    ctx: tuple[UsersTable, ClassesTable, ClassMembersTable] = Depends(
        require_class_member
    ),
    db: AsyncSession = Depends(get_db),
) -> ClassDetailDTO:
    """Страница класса: данные + роль текущего юзера + permissions. Только для участников."""
    _, cls, member = ctx
    return await class_service.get_class_detail(cls, member, db)


@classes_router.get("/{class_id}/members")
async def get_members(
    ctx: tuple[UsersTable, ClassesTable, ClassMembersTable] = Depends(
        require_class_member
    ),
    db: AsyncSession = Depends(get_db),
) -> list[ClassMemberDTO]:
    """Список участников класса. Только для участников."""
    _, cls, _ = ctx
    return await class_service.list_class_members(cls.id, db)


@classes_router.get("/{class_id}/role")
async def get_my_role(
    ctx: tuple[UsersTable, ClassesTable, ClassMembersTable] = Depends(
        require_class_member
    ),
) -> ClassRoleDTO:
    """Роль текущего юзера в классе. 403 если не состоит, 404 если класса нет."""
    _, cls, member = ctx
    return ClassRoleDTO(class_id=cls.id, role=member.role)


@classes_router.patch("/{class_id}")
async def update_class(
    body: UpdateClassRequest,
    ctx: tuple[UsersTable, ClassesTable, ClassMembersTable] = Depends(
        require_class_role(ClassRole.CREATOR, ClassRole.TEACHER)
    ),
    db: AsyncSession = Depends(get_db),
) -> ClassDetailDTO:
    """Редактировать класс (name, type). Только creator/teacher."""
    _, cls, member = ctx
    try:
        cls = await class_service.update_class(cls, body.name, body.type, db)
    except ServiceError as e:
        raise HTTPException(status_code=e.status_code, detail=str(e)) from e
    return await class_service.get_class_detail(cls, member, db)


@classes_router.delete("/{class_id}", status_code=204)
async def delete_class(
    ctx: tuple[UsersTable, ClassesTable, ClassMembersTable] = Depends(
        require_class_role(ClassRole.CREATOR)
    ),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Soft delete класса. Только creator."""
    _, cls, _ = ctx
    await class_service.delete_class(cls, db)
    return Response(status_code=204)
