from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.database import get_db
from app.database.models import ClassesTable, ClassMembersTable, ClassRole, UsersTable
from app.dependencies import get_current_user, require_class_member, require_class_role
from app.schemas.class_schemas import (
    ClassDetailDTO,
    ClassMembersDTO,
    ClassRoleDTO,
    CreateClassRequest,
    JoinByCodeRequest,
    LeaveClassResponseDTO,
    MyClassDTO,
    PublicClassDTO,
    TransferOwnershipRequest,
    UpdateClassRequest,
    UpdateMemberRoleRequest,
)
from app.schemas.errors import ServiceError
from app.schemas.pagination import PageDTO, PageParams
from app.services import class_service

classes_router = APIRouter(prefix="/classes", tags=["Classes"])


@classes_router.post("", status_code=201)
async def create_class(
    body: CreateClassRequest,
    context: tuple[UsersTable, str] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MyClassDTO:
    """Создать класс. Создатель → роль creator. Для closed автогенерится join_code.

    Возвращает MyClassDTO с counts и join_code (для creator) — фронт сразу
    вставляет карточку в список «Мои курсы» без отдельного GET.
    """
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
    params: PageParams = Depends(),
    search: str | None = Query(default=None, max_length=100),
    context: tuple[UsersTable, str] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PageDTO[PublicClassDTO]:
    """Каталог открытых классов с опциональным поиском по названию."""
    user, _ = context
    return await class_service.list_public_classes(
        search, user.id, params.page, params.limit, params.offset, db
    )


@classes_router.post("/join", status_code=201)
async def join_by_code(
    body: JoinByCodeRequest,
    context: tuple[UsersTable, str] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MyClassDTO:
    """Присоединение к закрытому классу по коду. Ответ — карточка для «Мои курсы»."""
    user, _ = context
    try:
        return await class_service.join_by_code(body.code, user.id, db)
    except ServiceError as e:
        raise HTTPException(status_code=e.status_code, detail=str(e)) from e


@classes_router.post("/{class_id}/join-open", status_code=201)
async def join_open(
    class_id: int,
    context: tuple[UsersTable, str] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MyClassDTO:
    """Присоединение к открытому классу по id. Закрытым отвечает 403.

    Ответ — карточка для «Мои курсы» (тот же формат, что у POST /classes/join).
    """
    user, _ = context
    try:
        return await class_service.join_open_class(class_id, user.id, db)
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
) -> ClassMembersDTO:
    """Список участников + counts. Только для участников."""
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
    """Редактировать класс (name, type). Только creator/teacher.

    Возвращает свежий ClassDetailDTO — counts/permissions/user_role пересчитаны.
    """
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


@classes_router.patch("/{class_id}/members/{user_id}/role")
async def update_member_role(
    user_id: int,
    body: UpdateMemberRoleRequest,
    ctx: tuple[UsersTable, ClassesTable, ClassMembersTable] = Depends(
        require_class_role(ClassRole.CREATOR)
    ),
    db: AsyncSession = Depends(get_db),
) -> ClassMembersDTO:
    """Повысить/понизить участника. Только creator. Менять роль creator-а нельзя.

    Возвращает обновлённый список участников + counts — фронт может
    атомарно перерисовать секцию участников и счётчики в шапке.
    """
    _, cls, _ = ctx
    try:
        return await class_service.update_member_role(cls.id, user_id, body.role, db)
    except ServiceError as e:
        raise HTTPException(status_code=e.status_code, detail=str(e)) from e


@classes_router.delete("/{class_id}/members/{user_id}")
async def remove_member(
    user_id: int,
    ctx: tuple[UsersTable, ClassesTable, ClassMembersTable] = Depends(
        require_class_role(ClassRole.CREATOR)
    ),
    db: AsyncSession = Depends(get_db),
) -> ClassMembersDTO:
    """Кикнуть участника. Только creator. Кикнуть самого себя (creator-а) нельзя.

    Возвращает обновлённый список участников + counts (200 OK), чтобы фронт
    обошёлся без отдельного GET /members.
    """
    _, cls, _ = ctx
    try:
        return await class_service.remove_member(cls.id, user_id, db)
    except ServiceError as e:
        raise HTTPException(status_code=e.status_code, detail=str(e)) from e


@classes_router.post("/{class_id}/transfer-ownership")
async def transfer_ownership(
    body: TransferOwnershipRequest,
    ctx: tuple[UsersTable, ClassesTable, ClassMembersTable] = Depends(
        require_class_role(ClassRole.CREATOR)
    ),
    db: AsyncSession = Depends(get_db),
) -> ClassDetailDTO:
    """Передать роль создателя другому участнику. Только текущий creator.

    Новый владелец становится creator, прежний — teacher. Ответ — свежий
    ClassDetailDTO от лица бывшего создателя (его прав уже меньше).
    """
    _, cls, member = ctx
    try:
        return await class_service.transfer_ownership(cls, member, body.new_owner_id, db)
    except ServiceError as e:
        raise HTTPException(status_code=e.status_code, detail=str(e)) from e


@classes_router.post("/{class_id}/leave")
async def leave_class(
    ctx: tuple[UsersTable, ClassesTable, ClassMembersTable] = Depends(
        require_class_member
    ),
    db: AsyncSession = Depends(get_db),
) -> LeaveClassResponseDTO:
    """Самовыход из класса. creator выйти не может — только удалить класс.

    Возвращает `{ class_id, status: "left" }` (200 OK) — фронт сразу
    удаляет карточку из списка «Мои курсы».
    """
    _, cls, member = ctx
    try:
        return await class_service.leave_class(cls, member, db)
    except ServiceError as e:
        raise HTTPException(status_code=e.status_code, detail=str(e)) from e
