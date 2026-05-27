from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.database import get_db
from app.database.models import ClassesTable, ClassMembersTable, ClassRole, UsersTable
from app.dependencies import require_class_member, require_class_role
from app.schemas.assignment_schemas import (
    AssignmentDTO,
    CreateAssignmentRequest,
    UpdateAssignmentRequest,
)
from app.schemas.errors import ServiceError
from app.schemas.pagination import PageDTO, PageParams
from app.services import assignment_service

# Прибили к классу: путь читаемый, права рулятся общими зависимостями
assignments_router = APIRouter(
    prefix="/classes/{class_id}/assignments", tags=["Assignments"]
)


@assignments_router.post("", status_code=201)
async def create_assignment(
    body: CreateAssignmentRequest,
    ctx: tuple[UsersTable, ClassesTable, ClassMembersTable] = Depends(
        require_class_role(ClassRole.CREATOR, ClassRole.TEACHER)
    ),
    db: AsyncSession = Depends(get_db),
) -> AssignmentDTO:
    """Создать задание. Только teacher/creator."""
    user, cls, _ = ctx
    try:
        return await assignment_service.create_assignment(
            class_id=cls.id,
            author=user,
            title=body.title,
            description=body.description,
            material_url=str(body.material_url) if body.material_url else None,
            due_at=body.due_at,
            max_grade=body.max_grade,
            db=db,
        )
    except ServiceError as e:
        raise HTTPException(status_code=e.status_code, detail=str(e)) from e


@assignments_router.get("")
async def list_assignments(
    params: PageParams = Depends(),
    ctx: tuple[UsersTable, ClassesTable, ClassMembersTable] = Depends(
        require_class_member
    ),
    db: AsyncSession = Depends(get_db),
) -> PageDTO[AssignmentDTO]:
    """Список заданий класса. Любой участник. Сортировка — свежие сверху."""
    _, cls, _ = ctx
    return await assignment_service.list_assignments(
        cls.id, params.page, params.limit, params.offset, db
    )


@assignments_router.get("/{aid}")
async def get_assignment(
    aid: int,
    ctx: tuple[UsersTable, ClassesTable, ClassMembersTable] = Depends(
        require_class_member
    ),
    db: AsyncSession = Depends(get_db),
) -> AssignmentDTO:
    """Одно задание. Любой участник."""
    _, cls, _ = ctx
    try:
        return await assignment_service.get_assignment(cls.id, aid, db)
    except ServiceError as e:
        raise HTTPException(status_code=e.status_code, detail=str(e)) from e


@assignments_router.patch("/{aid}")
async def update_assignment(
    aid: int,
    body: UpdateAssignmentRequest,
    ctx: tuple[UsersTable, ClassesTable, ClassMembersTable] = Depends(
        require_class_role(ClassRole.CREATOR, ClassRole.TEACHER)
    ),
    db: AsyncSession = Depends(get_db),
) -> AssignmentDTO:
    """Редактировать. teacher/creator. Менять max_grade при наличии оценок будет нельзя
    (заведём проверку, когда появится модуль оценок)."""
    _, cls, _ = ctx
    try:
        return await assignment_service.update_assignment(cls.id, aid, body, db)
    except ServiceError as e:
        raise HTTPException(status_code=e.status_code, detail=str(e)) from e


@assignments_router.delete("/{aid}", status_code=204)
async def delete_assignment(
    aid: int,
    ctx: tuple[UsersTable, ClassesTable, ClassMembersTable] = Depends(
        require_class_role(ClassRole.CREATOR, ClassRole.TEACHER)
    ),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Soft delete. teacher/creator. Связанные решения/оценки остаются в БД."""
    _, cls, _ = ctx
    try:
        await assignment_service.delete_assignment(cls.id, aid, db)
    except ServiceError as e:
        raise HTTPException(status_code=e.status_code, detail=str(e)) from e
    return Response(status_code=204)
