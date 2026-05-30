"""Общие проверки доступа для сервисов решений и оценок.

Раньше эти хелперы дублировались в submission_service и grade_service —
свели в одно место, чтобы правила «кто и что может» жили в одной точке.
Все функции бросают ServiceError с корректным HTTP-кодом.
"""

from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import AssignmentsTable, ClassMembersTable, ClassRole
from app.database.repositories import assignment_repo, class_repo
from app.schemas.errors import ServiceError

_TEACHER_ROLES = {ClassRole.TEACHER, ClassRole.CREATOR}


async def get_assignment_or_404(aid: int, db: AsyncSession) -> AssignmentsTable:
    """Задание по id (без привязки к классу — путь /assignments/{aid}/...). 404 если нет/удалено."""
    asg = await assignment_repo.get_by_id_any(aid, db)
    if asg is None:
        raise ServiceError("Задание не найдено", 404)
    return asg


async def get_class_member_or_403(
    class_id: int, user_id: int, db: AsyncSession
) -> ClassMembersTable:
    """Активное членство в классе. 403 если юзер не состоит."""
    member = await class_repo.get_member(class_id, user_id, db)
    if member is None:
        raise ServiceError("Вы не состоите в этом классе", 403)
    return member


async def ensure_teacher_or_creator(
    class_id: int, user_id: int, db: AsyncSession
) -> ClassMembersTable:
    """Членство + роль teacher/creator. 403 если не состоит или роль ниже."""
    member = await get_class_member_or_403(class_id, user_id, db)
    if member.role not in _TEACHER_ROLES:
        raise ServiceError("Недостаточно прав", 403)
    return member


async def ensure_student(
    assignment: AssignmentsTable, user_id: int, db: AsyncSession
) -> ClassMembersTable:
    """Членство в классе задания + роль student (сдавать решения может только студент)."""
    member = await get_class_member_or_403(assignment.class_id, user_id, db)
    if member.role != ClassRole.STUDENT:
        raise ServiceError("Сдавать решения может только студент", 403)
    return member
