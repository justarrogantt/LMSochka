from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.database import get_db
from app.database.models import UsersTable
from app.dependencies import get_current_user
from app.schemas.quiz_schemas import (
    AddQuestionToQuizRequest,
    QuizAssignmentDetailsResponse,
    QuizAttemptResultResponse,
    SaveQuizAnswerRequest,
    StartQuizAttemptResponse,
    SubmitQuizAttemptResponse,
    UpdateQuizQuestionRequest,
)
from app.services import quiz_service

quizzes_router = APIRouter(tags=["Quizzes"])


@quizzes_router.post("/assignments/{assignment_id}/quiz/questions", status_code=201)
async def add_question_to_quiz(
    assignment_id: int,
    body: AddQuestionToQuizRequest,
    context: tuple[UsersTable, str] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user, _ = context
    return await quiz_service.add_question_to_quiz(assignment_id, body, user, db)


@quizzes_router.get("/assignments/{assignment_id}/quiz/questions")
async def list_quiz_questions(
    assignment_id: int,
    context: tuple[UsersTable, str] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> QuizAssignmentDetailsResponse:
    user, _ = context
    return await quiz_service.list_quiz_questions_for_teacher(assignment_id, user, db)


@quizzes_router.patch("/assignments/{assignment_id}/quiz/questions/{quiz_question_id}")
async def update_quiz_question(
    assignment_id: int,
    quiz_question_id: int,
    body: UpdateQuizQuestionRequest,
    context: tuple[UsersTable, str] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user, _ = context
    return await quiz_service.update_quiz_question(
        assignment_id, quiz_question_id, body, user, db
    )


@quizzes_router.delete(
    "/assignments/{assignment_id}/quiz/questions/{quiz_question_id}", status_code=204
)
async def delete_quiz_question(
    assignment_id: int,
    quiz_question_id: int,
    context: tuple[UsersTable, str] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    user, _ = context
    await quiz_service.delete_quiz_question(assignment_id, quiz_question_id, user, db)
    return Response(status_code=204)


@quizzes_router.post("/assignments/{assignment_id}/quiz/attempts/start")
async def start_quiz_attempt(
    assignment_id: int,
    context: tuple[UsersTable, str] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StartQuizAttemptResponse:
    user, _ = context
    return await quiz_service.start_quiz_attempt(assignment_id, user, db)


@quizzes_router.put("/quiz/attempts/{attempt_id}/answers/{question_id}", status_code=204)
async def save_quiz_answer(
    attempt_id: int,
    question_id: int,
    body: SaveQuizAnswerRequest,
    context: tuple[UsersTable, str] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    user, _ = context
    await quiz_service.save_quiz_answer(attempt_id, question_id, body, user, db)
    return Response(status_code=204)


@quizzes_router.post("/quiz/attempts/{attempt_id}/submit")
async def submit_quiz_attempt(
    attempt_id: int,
    context: tuple[UsersTable, str] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SubmitQuizAttemptResponse:
    user, _ = context
    return await quiz_service.submit_quiz_attempt(attempt_id, user, db)


@quizzes_router.get("/quiz/attempts/{attempt_id}/result")
async def get_quiz_attempt_result(
    attempt_id: int,
    context: tuple[UsersTable, str] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> QuizAttemptResultResponse:
    user, _ = context
    return await quiz_service.get_quiz_attempt_result(attempt_id, user, db)
