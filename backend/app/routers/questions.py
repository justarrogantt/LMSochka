from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.database import get_db
from app.database.models import ClassMembersTable, ClassRole, ClassesTable, QuestionStatus, QuestionType, UsersTable
from app.dependencies import require_class_role
from app.schemas.pagination import PageParams
from app.schemas.question_schemas import (
    CreateQuestionRequest,
    QuestionPageDTO,
    QuestionResponseForTeacher,
    UpdateQuestionRequest,
)
from app.services import question_service

questions_router = APIRouter(prefix="/classes/{class_id}/questions", tags=["Questions"])


@questions_router.post("", status_code=201)
async def create_question(
    body: CreateQuestionRequest,
    ctx: tuple[UsersTable, ClassesTable, ClassMembersTable] = Depends(
        require_class_role(ClassRole.CREATOR, ClassRole.TEACHER)
    ),
    db: AsyncSession = Depends(get_db),
) -> QuestionResponseForTeacher:
    user, cls, _ = ctx
    return await question_service.create_question(cls.id, user, body, db)


@questions_router.get("")
async def list_questions(
    params: PageParams = Depends(),
    question_type: QuestionType | None = Query(default=None, alias="type"),
    status: QuestionStatus | None = Query(default=None),
    search: str | None = Query(default=None),
    ctx: tuple[UsersTable, ClassesTable, ClassMembersTable] = Depends(
        require_class_role(ClassRole.CREATOR, ClassRole.TEACHER)
    ),
    db: AsyncSession = Depends(get_db),
) -> QuestionPageDTO:
    _, cls, _ = ctx
    return await question_service.list_questions(
        class_id=cls.id,
        question_type=question_type,
        status=status,
        search=search,
        page=params.page,
        limit=params.limit,
        offset=params.offset,
        db=db,
    )


@questions_router.get("/{question_id}")
async def get_question(
    question_id: int,
    ctx: tuple[UsersTable, ClassesTable, ClassMembersTable] = Depends(
        require_class_role(ClassRole.CREATOR, ClassRole.TEACHER)
    ),
    db: AsyncSession = Depends(get_db),
) -> QuestionResponseForTeacher:
    _, cls, _ = ctx
    return await question_service.get_question(cls.id, question_id, db)


@questions_router.patch("/{question_id}")
async def update_question(
    question_id: int,
    body: UpdateQuestionRequest,
    ctx: tuple[UsersTable, ClassesTable, ClassMembersTable] = Depends(
        require_class_role(ClassRole.CREATOR, ClassRole.TEACHER)
    ),
    db: AsyncSession = Depends(get_db),
) -> QuestionResponseForTeacher:
    _, cls, _ = ctx
    return await question_service.update_question(cls.id, question_id, body, db)


@questions_router.delete("/{question_id}", status_code=204)
async def delete_question(
    question_id: int,
    ctx: tuple[UsersTable, ClassesTable, ClassMembersTable] = Depends(
        require_class_role(ClassRole.CREATOR, ClassRole.TEACHER)
    ),
    db: AsyncSession = Depends(get_db),
) -> Response:
    _, cls, _ = ctx
    await question_service.delete_question(cls.id, question_id, db)
    return Response(status_code=204)
