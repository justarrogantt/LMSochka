from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.database import get_db
from app.database.models import UsersTable
from app.dependencies import get_current_user
from app.schemas.grade_schemas import GradeDTO, UpsertGradeRequest
from app.schemas.gradebook_schemas import GradebookDTO
from app.schemas.submission_schemas import SubmissionDTO
from app.services import grade_service

grades_router = APIRouter(tags=["Grades", "Gradebook"])


@grades_router.put("/submissions/{sid}/grade")
async def put_grade(
    sid: int,
    body: UpsertGradeRequest,
    context: tuple[UsersTable, str] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> GradeDTO:
    user, _ = context
    return await grade_service.put_grade(sid, body, user, db)


@grades_router.delete("/submissions/{sid}/grade")
async def delete_grade(
    sid: int,
    context: tuple[UsersTable, str] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SubmissionDTO:
    """Снять оценку (teacher/creator). Решение возвращается в очередь на проверку.

    Отдаём обновлённый SubmissionDTO — фронт сразу перерисует карточку решения.
    """
    user, _ = context
    return await grade_service.delete_grade(sid, user, db)


@grades_router.get("/submissions/{sid}/grade")
async def get_grade(
    sid: int,
    context: tuple[UsersTable, str] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> GradeDTO:
    user, _ = context
    return await grade_service.get_grade(sid, user, db)


@grades_router.get("/classes/{class_id}/gradebook")
async def get_gradebook(
    class_id: int,
    context: tuple[UsersTable, str] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> GradebookDTO:
    user, _ = context
    return await grade_service.get_gradebook(class_id, user, db)
