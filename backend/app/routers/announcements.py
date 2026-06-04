from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.database import get_db
from app.database.models import ClassesTable, ClassMembersTable, ClassRole, UsersTable
from app.dependencies import require_class_member, require_class_role
from app.schemas.announcement_schemas import (
    AnnouncementDTO,
    CreateAnnouncementRequest,
    UpdateAnnouncementRequest,
)
from app.schemas.errors import ServiceError
from app.schemas.pagination import PageDTO, PageParams
from app.services import announcement_service

# Прикрепляемся к /classes/{class_id}/announcements — путь читаемый, права рулятся
# теми же зависимостями, что и для остальных эндпоинтов класса
announcements_router = APIRouter(
    prefix="/classes/{class_id}/announcements", tags=["Announcements"]
)


@announcements_router.post("", status_code=201)
async def create_announcement(
    body: CreateAnnouncementRequest,
    ctx: tuple[UsersTable, ClassesTable, ClassMembersTable] = Depends(
        require_class_role(ClassRole.CREATOR, ClassRole.TEACHER)
    ),
    db: AsyncSession = Depends(get_db),
) -> AnnouncementDTO:
    """Создать объявление в классе. Только teacher или creator."""
    user, cls, member = ctx
    try:
        return await announcement_service.create_announcement(
            cls.id, cls.name, user, member, body.title, body.content, db
        )
    except ServiceError as e:
        raise HTTPException(status_code=e.status_code, detail=str(e)) from e


@announcements_router.get("")
async def list_announcements(
    params: PageParams = Depends(),
    ctx: tuple[UsersTable, ClassesTable, ClassMembersTable] = Depends(
        require_class_member
    ),
    db: AsyncSession = Depends(get_db),
) -> PageDTO[AnnouncementDTO]:
    """Список объявлений в классе. Любой участник. Сортировка — свежие сверху."""
    user, cls, member = ctx
    return await announcement_service.list_announcements(
        cls.id, params.page, params.limit, params.offset, user, member, db
    )


@announcements_router.get("/{aid}")
async def get_announcement(
    aid: int,
    ctx: tuple[UsersTable, ClassesTable, ClassMembersTable] = Depends(
        require_class_member
    ),
    db: AsyncSession = Depends(get_db),
) -> AnnouncementDTO:
    """Одно объявление. Любой участник."""
    user, cls, member = ctx
    try:
        return await announcement_service.get_announcement(
            cls.id, aid, user, member, db
        )
    except ServiceError as e:
        raise HTTPException(status_code=e.status_code, detail=str(e)) from e


@announcements_router.patch("/{aid}")
async def update_announcement(
    aid: int,
    body: UpdateAnnouncementRequest,
    ctx: tuple[UsersTable, ClassesTable, ClassMembersTable] = Depends(
        require_class_member
    ),
    db: AsyncSession = Depends(get_db),
) -> AnnouncementDTO:
    """Редактировать. Автор или creator класса. teacher без авторства — 403."""
    user, cls, member = ctx
    try:
        return await announcement_service.update_announcement(
            cls.id, aid, user, member, body.title, body.content, db
        )
    except ServiceError as e:
        raise HTTPException(status_code=e.status_code, detail=str(e)) from e


@announcements_router.delete("/{aid}", status_code=204)
async def delete_announcement(
    aid: int,
    ctx: tuple[UsersTable, ClassesTable, ClassMembersTable] = Depends(
        require_class_member
    ),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Soft delete. Автор или creator класса."""
    user, cls, member = ctx
    try:
        await announcement_service.delete_announcement(cls.id, aid, user, member, db)
    except ServiceError as e:
        raise HTTPException(status_code=e.status_code, detail=str(e)) from e
    return Response(status_code=204)
