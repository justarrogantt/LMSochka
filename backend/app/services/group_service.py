"""Групповые задания: распределение студентов по командам и управление ими.

Все мутации возвращают свежий AssignmentGroupsDTO — фронт обновляет блок
«Команды» атомарно, без лишних GET. Управляет только teacher/creator-автор.
"""

import secrets

from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import (
    AssignmentsTable,
    ClassMembersTable,
    ClassRole,
    GradingMode,
    UsersTable,
)
from app.database.repositories import group_repo
from app.schemas.errors import ServiceError
from app.schemas.group_schemas import (
    AssignmentGroupCreate,
    AssignmentGroupDTO,
    AssignmentGroupsDTO,
    GroupDistributionAuto,
    GroupDistributionManual,
    GroupMemberDTO,
)


def _member_dto(user: UsersTable, is_active: bool) -> GroupMemberDTO:
    return GroupMemberDTO(
        user_id=user.id,
        email=user.email,
        first_name=user.first_name,
        last_name=user.last_name,
        is_active=is_active,
    )


def _can_manage(
    assignment: AssignmentsTable, user: UsersTable, member: ClassMembersTable
) -> bool:
    return member.role == ClassRole.CREATOR or assignment.author_id == user.id


def ensure_can_manage(
    assignment: AssignmentsTable, user: UsersTable, member: ClassMembersTable
) -> None:
    if not _can_manage(assignment, user, member):
        raise ServiceError("Управлять группами может только автор или создатель класса", 403)


async def require_config(
    assignment: AssignmentsTable, db: AsyncSession
) -> GradingMode:
    """Режим оценивания группового задания. 404, если задание индивидуальное."""
    config = await group_repo.get_config(assignment.id, db)
    if config is None:
        raise ServiceError("Это задание не групповое", 404)
    return config.grading_mode


# ── Создание (combined-create) ──


async def apply_distribution(
    assignment: AssignmentsTable,
    group: AssignmentGroupCreate,
    db: AsyncSession,
) -> None:
    """Создаёт конфиг + группы + членов в рамках транзакции assignment_service.

    Коммит делает вызывающий сервис, здесь только flush.
    """
    await group_repo.create_config(assignment.id, group.grading_mode, db)

    if isinstance(group.distribution, GroupDistributionManual):
        await _create_manual(assignment, group.distribution, db)
    elif isinstance(group.distribution, GroupDistributionAuto):
        await _create_auto(assignment, group.distribution.group_count, db)


async def _create_manual(
    assignment: AssignmentsTable,
    distribution: GroupDistributionManual,
    db: AsyncSession,
) -> None:
    student_ids = {
        u.id for u in await group_repo.list_active_students(assignment.class_id, db)
    }
    seen: set[int] = set()
    for index, draft in enumerate(distribution.groups, start=1):
        for user_id in draft.member_ids:
            if user_id not in student_ids:
                raise ServiceError(
                    "В группу можно добавить только активного студента класса", 422
                )
            if user_id in seen:
                raise ServiceError("Студент не может быть сразу в двух группах", 422)
            seen.add(user_id)

        title = (draft.title or "").strip() or f"Группа {index}"
        new_group = await group_repo.create_group(assignment.id, title, db)
        for user_id in draft.member_ids:
            await group_repo.add_member(assignment.id, new_group.id, user_id, db)


async def _create_auto(
    assignment: AssignmentsTable, group_count: int, db: AsyncSession
) -> None:
    students = await group_repo.list_active_students(assignment.class_id, db)
    # криптослучайно перемешиваем, чтобы распределение было непредсказуемым
    secrets.SystemRandom().shuffle(students)

    groups = [
        await group_repo.create_group(assignment.id, f"Группа {i + 1}", db)
        for i in range(group_count)
    ]
    for index, student in enumerate(students):
        await group_repo.add_member(
            assignment.id, groups[index % group_count].id, student.id, db
        )


# ── Сборка DTO ──


async def build_groups_dto(
    assignment: AssignmentsTable, db: AsyncSession
) -> AssignmentGroupsDTO:
    grading_mode = await require_config(assignment, db)

    groups = await group_repo.list_groups(assignment.id, db)
    members_rows = await group_repo.list_members_with_users(assignment.id, db)
    statuses = await group_repo.map_group_submission_status(assignment.id, db)

    members_by_group: dict[int, list[GroupMemberDTO]] = {g.id: [] for g in groups}
    assigned_ids: set[int] = set()
    for membership, user, is_active in members_rows:
        members_by_group.setdefault(membership.group_id, []).append(
            _member_dto(user, is_active)
        )
        assigned_ids.add(user.id)

    group_dtos = [
        AssignmentGroupDTO(
            id=g.id,
            title=g.title,
            members=members_by_group.get(g.id, []),
            submission_status=statuses.get(g.id),
        )
        for g in groups
    ]

    students = await group_repo.list_active_students(assignment.class_id, db)
    unassigned = [
        _member_dto(student, True)
        for student in students
        if student.id not in assigned_ids
    ]

    return AssignmentGroupsDTO(
        grading_mode=grading_mode,
        groups=group_dtos,
        unassigned_students=unassigned,
    )


async def get_my_group_dto(
    assignment: AssignmentsTable, user_id: int, db: AsyncSession
) -> AssignmentGroupDTO | None:
    """Команда конкретного студента — для AssignmentDTO.my_group."""
    membership = await group_repo.get_member(assignment.id, user_id, db)
    if membership is None:
        return None
    group = await group_repo.get_group(assignment.id, membership.group_id, db)
    if group is None:
        return None
    rows = await group_repo.list_group_member_users(group.id, assignment.class_id, db)
    sub = await group_repo.get_group_submission(group.id, db)
    return AssignmentGroupDTO(
        id=group.id,
        title=group.title,
        members=[_member_dto(u, is_active) for u, is_active in rows],
        submission_status=sub.status if sub is not None else None,
    )


# ── Управление группами после создания ──


async def create_empty_group(
    assignment: AssignmentsTable, title: str | None, db: AsyncSession
) -> AssignmentGroupsDTO:
    await require_config(assignment, db)
    count = len(await group_repo.list_groups(assignment.id, db))
    name = (title or "").strip() or f"Группа {count + 1}"
    await group_repo.create_group(assignment.id, name, db)
    await db.commit()
    return await build_groups_dto(assignment, db)


async def rename_group(
    assignment: AssignmentsTable, group_id: int, title: str, db: AsyncSession
) -> AssignmentGroupsDTO:
    await require_config(assignment, db)
    group = await group_repo.get_group(assignment.id, group_id, db)
    if group is None:
        raise ServiceError("Группа не найдена", 404)
    await group_repo.rename_group(group, title.strip(), db)
    await db.commit()
    return await build_groups_dto(assignment, db)


async def delete_group(
    assignment: AssignmentsTable, group_id: int, db: AsyncSession
) -> AssignmentGroupsDTO:
    await require_config(assignment, db)
    group = await group_repo.get_group(assignment.id, group_id, db)
    if group is None:
        raise ServiceError("Группа не найдена", 404)
    if await group_repo.group_has_submission(group_id, db):
        raise ServiceError("Нельзя удалить группу: у команды уже есть решение", 409)
    await group_repo.delete_group(group, db)
    await db.commit()
    return await build_groups_dto(assignment, db)


async def add_member(
    assignment: AssignmentsTable, group_id: int, user_id: int, db: AsyncSession
) -> AssignmentGroupsDTO:
    await require_config(assignment, db)
    group = await group_repo.get_group(assignment.id, group_id, db)
    if group is None:
        raise ServiceError("Группа не найдена", 404)

    students = {
        u.id for u in await group_repo.list_active_students(assignment.class_id, db)
    }
    if user_id not in students:
        raise ServiceError("Добавить можно только активного студента класса", 422)

    existing = await group_repo.get_member(assignment.id, user_id, db)
    if existing is not None:
        raise ServiceError("Студент уже распределён в группу этого задания", 409)

    await group_repo.add_member(assignment.id, group_id, user_id, db)
    await db.commit()
    return await build_groups_dto(assignment, db)


async def remove_member(
    assignment: AssignmentsTable, group_id: int, user_id: int, db: AsyncSession
) -> AssignmentGroupsDTO:
    await require_config(assignment, db)
    if await group_repo.group_has_submission(group_id, db):
        raise ServiceError(
            "Нельзя менять состав: у команды уже есть решение", 409
        )
    member = await group_repo.get_member(assignment.id, user_id, db)
    if member is None or member.group_id != group_id:
        raise ServiceError("Участник не найден в этой группе", 404)
    await group_repo.remove_member(member, db)
    await db.commit()
    return await build_groups_dto(assignment, db)


async def auto_distribute(
    assignment: AssignmentsTable, group_count: int, db: AsyncSession
) -> AssignmentGroupsDTO:
    await require_config(assignment, db)

    groups = await group_repo.list_groups(assignment.id, db)
    for group in groups:
        if await group_repo.group_has_submission(group.id, db):
            raise ServiceError(
                "Нельзя перераспределить: у одной из команд уже есть решение", 409
            )
    # сносим текущие группы (каскад снимает членов) и раскладываем заново
    for group in groups:
        await group_repo.delete_group(group, db)
    await _create_auto(assignment, group_count, db)
    await db.commit()
    return await build_groups_dto(assignment, db)
