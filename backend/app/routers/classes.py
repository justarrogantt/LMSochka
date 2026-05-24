from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.database import get_db
from app.database.models import UsersTable
from app.dependencies import get_current_user
from app.schemas.class_schemas import (
    ClassDTO,
    ClassRoleDTO,
    CreateClassRequest,
    JoinByCodeRequest,
    MyClassDTO,
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
    user, _ = context
    try:
        return await class_service.create_class(body.name, body.type, user.id, db)
    except ServiceError as e:
        raise HTTPException(status_code=e.status_code, detail=str(e))


@classes_router.get("/my")
async def my_classes(
    context: tuple[UsersTable, str] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[MyClassDTO]:
    user, _ = context
    return await class_service.list_my_classes(user.id, db)


@classes_router.post("/join", status_code=201)
async def join_by_code(
    body: JoinByCodeRequest,
    context: tuple[UsersTable, str] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ClassRoleDTO:
    user, _ = context
    try:
        member = await class_service.join_by_code(body.code, user.id, db)
        return ClassRoleDTO(class_id=member.class_id, role=member.role)
    except ServiceError as e:
        raise HTTPException(status_code=e.status_code, detail=str(e))


@classes_router.post("/{class_id}/join", status_code=201)
async def join_open(
    class_id: int,
    context: tuple[UsersTable, str] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ClassRoleDTO:
    user, _ = context
    try:
        member = await class_service.join_open_class(class_id, user.id, db)
        return ClassRoleDTO(class_id=member.class_id, role=member.role)
    except ServiceError as e:
        raise HTTPException(status_code=e.status_code, detail=str(e))


@classes_router.get("/{class_id}/role")
async def get_my_role(
    class_id: int,
    context: tuple[UsersTable, str] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ClassRoleDTO:
    user, _ = context
    try:
        role = await class_service.get_user_role_in_class(class_id, user.id, db)
        return ClassRoleDTO(class_id=class_id, role=role)
    except ServiceError as e:
        raise HTTPException(status_code=e.status_code, detail=str(e))
