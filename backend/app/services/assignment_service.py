from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import AssignmentsTable, UsersTable
from app.database.repositories import assignment_repo
from app.schemas.assignment_schemas import (
    AssignmentDTO,
    UpdateAssignmentRequest,
)
from app.schemas.errors import ServiceError
from app.schemas.pagination import PageDTO
from app.schemas.user_schemas import UserBriefDTO


def _dto(asg: AssignmentsTable, author: UsersTable) -> AssignmentDTO:
    return AssignmentDTO(
        id=asg.id,
        class_id=asg.class_id,
        author=UserBriefDTO.model_validate(author),
        title=asg.title,
        description=asg.description,
        material_url=asg.material_url,
        due_at=asg.due_at,
        max_grade=asg.max_grade,
        created_at=asg.created_at,
        updated_at=asg.updated_at,
    )


async def create_assignment(
    class_id: int,
    author: UsersTable,
    title: str,
    description: str,
    material_url: str | None,
    due_at: datetime | None,
    max_grade: float,
    db: AsyncSession,
) -> AssignmentDTO:
    asg = await assignment_repo.create(
        class_id=class_id,
        author_id=author.id,
        # strip — фронт может прислать с лишними пробелами по краям
        title=title.strip(),
        description=description.strip(),
        material_url=material_url,
        due_at=due_at,
        max_grade=max_grade,
        db=db,
    )
    await db.commit()
    await db.refresh(asg)
    return _dto(asg, author)


async def list_assignments(
    class_id: int, page: int, limit: int, offset: int, db: AsyncSession
) -> PageDTO[AssignmentDTO]:
    rows = await assignment_repo.list_for_class(class_id, limit, offset, db)
    total = await assignment_repo.count_for_class(class_id, db)
    return PageDTO[AssignmentDTO](
        items=[_dto(a, u) for a, u in rows],
        total=total,
        page=page,
        limit=limit,
    )


async def get_assignment(
    class_id: int, aid: int, db: AsyncSession
) -> AssignmentDTO:
    row = await assignment_repo.get_with_author(aid, class_id, db)
    if row is None:
        raise ServiceError("Задание не найдено", 404)
    asg, author = row
    return _dto(asg, author)


async def update_assignment(
    class_id: int,
    aid: int,
    body: UpdateAssignmentRequest,
    db: AsyncSession,
) -> AssignmentDTO:
    row = await assignment_repo.get_with_author(aid, class_id, db)
    if row is None:
        raise ServiceError("Задание не найдено", 404)
    asg, author = row

    # Различаем "поле не передали" от "передали null" по model_fields_set.
    # Для material_url и due_at null значит «сбросить», для остальных — игнор.
    fields_set = body.model_fields_set
    material_url_provided = "material_url" in fields_set
    due_at_provided = "due_at" in fields_set

    # TODO(grades): когда появится модуль оценок, добавить проверку:
    # если max_grade пришёл и для задания уже есть хотя бы одна Grade — отдать 422
    # «нельзя менять max_grade когда уже есть оценки» (см. ТЗ).

    asg = await assignment_repo.update(
        asg,
        title=body.title.strip() if body.title is not None else None,
        description=body.description.strip() if body.description is not None else None,
        # HttpUrl кладём в БД как строку
        material_url=str(body.material_url) if body.material_url is not None else None,
        due_at=body.due_at,
        max_grade=body.max_grade,
        clear_material_url=material_url_provided and body.material_url is None,
        clear_due_at=due_at_provided and body.due_at is None,
        db=db,
    )
    return _dto(asg, author)


async def delete_assignment(class_id: int, aid: int, db: AsyncSession) -> None:
    asg = await assignment_repo.get_by_id(aid, class_id, db)
    if asg is None:
        raise ServiceError("Задание не найдено", 404)
    # TODO(submissions): связанные решения и оценки остаются в БД для аудита,
    # но фильтруются из API через soft delete каскадно. Когда модули будут готовы —
    # убедиться, что /my-submission и /submissions для удалённого задания дают 404.
    await assignment_repo.soft_delete(asg, db)
