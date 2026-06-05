from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.database import get_db
from app.database.models import (
    AssignmentsTable,
    ClassesTable,
    ClassMembersTable,
    ClassRole,
    UsersTable,
)
from app.database.repositories import assignment_repo
from app.dependencies import require_class_role
from app.schemas.errors import ServiceError
from app.schemas.group_schemas import (
    AddGroupMemberRequest,
    AssignmentGroupsDTO,
    AutoDistributeRequest,
    CreateGroupRequest,
    RenameGroupRequest,
)
from app.services import group_service

# Управление группами задания. Только teacher/creator-автор задания.
groups_router = APIRouter(
    prefix="/classes/{class_id}/assignments/{aid}/groups", tags=["Groups"]
)


async def _load_managed_assignment(
    aid: int,
    cls: ClassesTable,
    user: UsersTable,
    member: ClassMembersTable,
    db: AsyncSession,
) -> AssignmentsTable:
    """Задание этого класса + проверка прав на управление группами."""
    assignment = await assignment_repo.get_by_id(aid, cls.id, db)
    if assignment is None:
        raise ServiceError("Задание не найдено", 404)
    group_service.ensure_can_manage(assignment, user, member)
    return assignment


@groups_router.get("")
async def get_groups(
    aid: int,
    ctx: tuple[UsersTable, ClassesTable, ClassMembersTable] = Depends(
        require_class_role(ClassRole.CREATOR, ClassRole.TEACHER)
    ),
    db: AsyncSession = Depends(get_db),
) -> AssignmentGroupsDTO:
    """Группы задания + состав + нераспределённые активные студенты."""
    user, cls, member = ctx
    assignment = await _load_managed_assignment(aid, cls, user, member, db)
    return await group_service.build_groups_dto(assignment, db)


@groups_router.post("", status_code=201)
async def create_group(
    aid: int,
    body: CreateGroupRequest,
    ctx: tuple[UsersTable, ClassesTable, ClassMembersTable] = Depends(
        require_class_role(ClassRole.CREATOR, ClassRole.TEACHER)
    ),
    db: AsyncSession = Depends(get_db),
) -> AssignmentGroupsDTO:
    """Создать пустую группу."""
    user, cls, member = ctx
    assignment = await _load_managed_assignment(aid, cls, user, member, db)
    return await group_service.create_empty_group(assignment, body.title, db)


@groups_router.patch("/{gid}")
async def rename_group(
    aid: int,
    gid: int,
    body: RenameGroupRequest,
    ctx: tuple[UsersTable, ClassesTable, ClassMembersTable] = Depends(
        require_class_role(ClassRole.CREATOR, ClassRole.TEACHER)
    ),
    db: AsyncSession = Depends(get_db),
) -> AssignmentGroupsDTO:
    """Переименовать группу."""
    user, cls, member = ctx
    assignment = await _load_managed_assignment(aid, cls, user, member, db)
    return await group_service.rename_group(assignment, gid, body.title, db)


@groups_router.delete("/{gid}")
async def delete_group(
    aid: int,
    gid: int,
    ctx: tuple[UsersTable, ClassesTable, ClassMembersTable] = Depends(
        require_class_role(ClassRole.CREATOR, ClassRole.TEACHER)
    ),
    db: AsyncSession = Depends(get_db),
) -> AssignmentGroupsDTO:
    """Удалить группу. Нельзя, если у команды уже есть решение."""
    user, cls, member = ctx
    assignment = await _load_managed_assignment(aid, cls, user, member, db)
    return await group_service.delete_group(assignment, gid, db)


@groups_router.post("/{gid}/members")
async def add_member(
    aid: int,
    gid: int,
    body: AddGroupMemberRequest,
    ctx: tuple[UsersTable, ClassesTable, ClassMembersTable] = Depends(
        require_class_role(ClassRole.CREATOR, ClassRole.TEACHER)
    ),
    db: AsyncSession = Depends(get_db),
) -> AssignmentGroupsDTO:
    """Добавить студента в группу."""
    user, cls, member = ctx
    assignment = await _load_managed_assignment(aid, cls, user, member, db)
    return await group_service.add_member(assignment, gid, body.user_id, db)


@groups_router.delete("/{gid}/members/{user_id}")
async def remove_member(
    aid: int,
    gid: int,
    user_id: int,
    ctx: tuple[UsersTable, ClassesTable, ClassMembersTable] = Depends(
        require_class_role(ClassRole.CREATOR, ClassRole.TEACHER)
    ),
    db: AsyncSession = Depends(get_db),
) -> AssignmentGroupsDTO:
    """Убрать студента из группы. Нельзя, если у команды уже есть решение."""
    user, cls, member = ctx
    assignment = await _load_managed_assignment(aid, cls, user, member, db)
    return await group_service.remove_member(assignment, gid, user_id, db)


@groups_router.post("/auto")
async def auto_distribute(
    aid: int,
    body: AutoDistributeRequest,
    ctx: tuple[UsersTable, ClassesTable, ClassMembersTable] = Depends(
        require_class_role(ClassRole.CREATOR, ClassRole.TEACHER)
    ),
    db: AsyncSession = Depends(get_db),
) -> AssignmentGroupsDTO:
    """Авто-распределение активных студентов по N группам (round-robin)."""
    user, cls, member = ctx
    assignment = await _load_managed_assignment(aid, cls, user, member, db)
    return await group_service.auto_distribute(assignment, body.group_count, db)
