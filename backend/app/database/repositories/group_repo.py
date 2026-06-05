from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import (
    AssignmentGroupConfigTable,
    AssignmentGroupMembersTable,
    AssignmentGroupsTable,
    AssignmentsTable,
    ClassMembersTable,
    ClassRole,
    GradesTable,
    GradingMode,
    SubmissionGroupTable,
    SubmissionsTable,
    SubmissionStatus,
    UsersTable,
)

_MEMBER_ACTIVE = ClassMembersTable.deleted_at.is_(None)


# ── Конфиг группового задания ──


async def create_config(
    assignment_id: int, grading_mode: GradingMode, db: AsyncSession
) -> AssignmentGroupConfigTable:
    config = AssignmentGroupConfigTable(
        assignment_id=assignment_id, grading_mode=grading_mode
    )
    db.add(config)
    await db.flush()
    return config


async def get_config(
    assignment_id: int, db: AsyncSession
) -> AssignmentGroupConfigTable | None:
    return await db.get(AssignmentGroupConfigTable, assignment_id)


async def map_configs(
    assignment_ids: list[int], db: AsyncSession
) -> dict[int, GradingMode]:
    """{assignment_id: grading_mode} для группового набора заданий. Один запрос."""
    if not assignment_ids:
        return {}
    result = await db.execute(
        select(
            AssignmentGroupConfigTable.assignment_id,
            AssignmentGroupConfigTable.grading_mode,
        ).where(AssignmentGroupConfigTable.assignment_id.in_(assignment_ids))
    )
    return {aid: mode for aid, mode in result.all()}


# ── Группы и состав ──


async def create_group(
    assignment_id: int, title: str, db: AsyncSession
) -> AssignmentGroupsTable:
    group = AssignmentGroupsTable(assignment_id=assignment_id, title=title)
    db.add(group)
    await db.flush()
    return group


async def get_group(
    assignment_id: int, group_id: int, db: AsyncSession
) -> AssignmentGroupsTable | None:
    result = await db.execute(
        select(AssignmentGroupsTable).where(
            AssignmentGroupsTable.id == group_id,
            AssignmentGroupsTable.assignment_id == assignment_id,
        )
    )
    return result.scalar_one_or_none()


async def list_groups(
    assignment_id: int, db: AsyncSession
) -> list[AssignmentGroupsTable]:
    result = await db.execute(
        select(AssignmentGroupsTable)
        .where(AssignmentGroupsTable.assignment_id == assignment_id)
        .order_by(AssignmentGroupsTable.id)
    )
    return list(result.scalars().all())


async def rename_group(
    group: AssignmentGroupsTable, title: str, db: AsyncSession
) -> AssignmentGroupsTable:
    group.title = title
    db.add(group)
    await db.flush()
    return group


async def delete_group(group: AssignmentGroupsTable, db: AsyncSession) -> None:
    await db.delete(group)
    await db.flush()


async def add_member(
    assignment_id: int, group_id: int, user_id: int, db: AsyncSession
) -> AssignmentGroupMembersTable:
    member = AssignmentGroupMembersTable(
        assignment_id=assignment_id, group_id=group_id, user_id=user_id
    )
    db.add(member)
    await db.flush()
    return member


async def get_member(
    assignment_id: int, user_id: int, db: AsyncSession
) -> AssignmentGroupMembersTable | None:
    """Запись членства студента в группе этого задания (он максимум в одной)."""
    result = await db.execute(
        select(AssignmentGroupMembersTable).where(
            AssignmentGroupMembersTable.assignment_id == assignment_id,
            AssignmentGroupMembersTable.user_id == user_id,
        )
    )
    return result.scalar_one_or_none()


async def remove_member(
    member: AssignmentGroupMembersTable, db: AsyncSession
) -> None:
    await db.delete(member)
    await db.flush()


async def list_members_with_users(
    assignment_id: int, db: AsyncSession
) -> list[tuple[AssignmentGroupMembersTable, UsersTable, bool]]:
    """Состав всех групп задания: (членство, юзер, активен ли он ещё в классе).

    is_active=False у тех, кто вышел/кикнут из класса — в составе показываем
    как историю, но при распределении баллов учитываем только активных.
    """
    result = await db.execute(
        select(
            AssignmentGroupMembersTable,
            UsersTable,
            ClassMembersTable.deleted_at,
        )
        .join(UsersTable, UsersTable.id == AssignmentGroupMembersTable.user_id)
        .join(
            AssignmentsTable,
            AssignmentsTable.id == AssignmentGroupMembersTable.assignment_id,
        )
        .outerjoin(
            ClassMembersTable,
            (ClassMembersTable.user_id == AssignmentGroupMembersTable.user_id)
            & (ClassMembersTable.class_id == AssignmentsTable.class_id),
        )
        .where(AssignmentGroupMembersTable.assignment_id == assignment_id)
        .order_by(AssignmentGroupMembersTable.group_id, AssignmentGroupMembersTable.id)
    )
    return [(m, u, deleted_at is None) for m, u, deleted_at in result.all()]


async def list_group_member_users(
    group_id: int, class_id: int, db: AsyncSession
) -> list[tuple[UsersTable, bool]]:
    """Юзеры одной группы + флаг активности в классе."""
    result = await db.execute(
        select(UsersTable, ClassMembersTable.deleted_at)
        .join(
            AssignmentGroupMembersTable,
            AssignmentGroupMembersTable.user_id == UsersTable.id,
        )
        .outerjoin(
            ClassMembersTable,
            (ClassMembersTable.user_id == UsersTable.id)
            & (ClassMembersTable.class_id == class_id),
        )
        .where(AssignmentGroupMembersTable.group_id == group_id)
        .order_by(UsersTable.id)
    )
    return [(u, deleted_at is None) for u, deleted_at in result.all()]


async def list_active_students(
    class_id: int, db: AsyncSession
) -> list[UsersTable]:
    """Активные студенты класса — кандидаты на распределение по группам."""
    result = await db.execute(
        select(UsersTable)
        .join(ClassMembersTable, ClassMembersTable.user_id == UsersTable.id)
        .where(
            ClassMembersTable.class_id == class_id,
            ClassMembersTable.role == ClassRole.STUDENT,
            _MEMBER_ACTIVE,
        )
        .order_by(UsersTable.id)
    )
    return list(result.scalars().all())


async def list_assigned_user_ids(assignment_id: int, db: AsyncSession) -> set[int]:
    """ID студентов, уже распределённых в какую-либо группу задания."""
    result = await db.execute(
        select(AssignmentGroupMembersTable.user_id).where(
            AssignmentGroupMembersTable.assignment_id == assignment_id
        )
    )
    return set(result.scalars().all())


# ── Связь решения с группой ──


async def link_submission(submission_id: int, group_id: int, db: AsyncSession) -> None:
    db.add(SubmissionGroupTable(submission_id=submission_id, group_id=group_id))
    await db.flush()


async def get_group_submission(
    group_id: int, db: AsyncSession
) -> SubmissionsTable | None:
    """Командное решение группы (если уже создано любым её членом)."""
    result = await db.execute(
        select(SubmissionsTable)
        .join(
            SubmissionGroupTable,
            SubmissionGroupTable.submission_id == SubmissionsTable.id,
        )
        .where(SubmissionGroupTable.group_id == group_id)
    )
    return result.scalar_one_or_none()


async def group_has_submission(group_id: int, db: AsyncSession) -> bool:
    """Есть ли у группы решение со статусом ≠ draft (тогда состав менять нельзя)."""
    sub = await get_group_submission(group_id, db)
    return sub is not None and sub.status != SubmissionStatus.DRAFT


async def map_group_submission_status(
    assignment_id: int, db: AsyncSession
) -> dict[int, SubmissionStatus]:
    """{group_id: статус командного решения} для всех групп задания. Один запрос."""
    result = await db.execute(
        select(SubmissionGroupTable.group_id, SubmissionsTable.status)
        .join(
            SubmissionsTable,
            SubmissionsTable.id == SubmissionGroupTable.submission_id,
        )
        .join(
            AssignmentGroupsTable,
            AssignmentGroupsTable.id == SubmissionGroupTable.group_id,
        )
        .where(AssignmentGroupsTable.assignment_id == assignment_id)
    )
    return {group_id: status for group_id, status in result.all()}


async def get_group_for_submission(
    submission_id: int, db: AsyncSession
) -> AssignmentGroupsTable | None:
    result = await db.execute(
        select(AssignmentGroupsTable)
        .join(
            SubmissionGroupTable,
            SubmissionGroupTable.group_id == AssignmentGroupsTable.id,
        )
        .where(SubmissionGroupTable.submission_id == submission_id)
    )
    return result.scalar_one_or_none()


async def map_submission_group_titles(
    submission_ids: list[int], db: AsyncSession
) -> dict[int, str]:
    """{submission_id: название команды} — для карточек решений у преподавателя."""
    if not submission_ids:
        return {}
    result = await db.execute(
        select(SubmissionGroupTable.submission_id, AssignmentGroupsTable.title)
        .join(
            AssignmentGroupsTable,
            AssignmentGroupsTable.id == SubmissionGroupTable.group_id,
        )
        .where(SubmissionGroupTable.submission_id.in_(submission_ids))
    )
    return {submission_id: title for submission_id, title in result.all()}


async def gradebook_member_rows(
    assignment_ids: list[int], db: AsyncSession
) -> list[tuple[int, int, SubmissionsTable | None, GradesTable | None]]:
    """Для групповых заданий: по каждому члену команды — её решение и командная оценка.

    Возвращает (assignment_id, user_id, submission|None, grade|None).
    Нужно для gradebook: у не-автора своего решения нет, грейд берём с командного.
    """
    if not assignment_ids:
        return []
    result = await db.execute(
        select(
            AssignmentGroupMembersTable.assignment_id,
            AssignmentGroupMembersTable.user_id,
            SubmissionsTable,
            GradesTable,
        )
        .join(
            AssignmentGroupsTable,
            AssignmentGroupsTable.id == AssignmentGroupMembersTable.group_id,
        )
        .outerjoin(
            SubmissionGroupTable,
            SubmissionGroupTable.group_id == AssignmentGroupsTable.id,
        )
        .outerjoin(
            SubmissionsTable,
            SubmissionsTable.id == SubmissionGroupTable.submission_id,
        )
        .outerjoin(GradesTable, GradesTable.submission_id == SubmissionsTable.id)
        .where(AssignmentGroupMembersTable.assignment_id.in_(assignment_ids))
    )
    return [(aid, uid, sub, grade) for aid, uid, sub, grade in result.all()]
