from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import QuestionBankQuestionTable, QuestionOptionTable, QuestionTextAnswerTable, UsersTable
from app.database.repositories import question_repo, quiz_repo
from app.schemas.errors import ServiceError
from app.schemas.pagination import PageDTO
from app.schemas.question_schemas import (
    CreateQuestionRequest,
    QuestionListItemDTO,
    QuestionOptionDTO,
    QuestionPageDTO,
    QuestionResponseForTeacher,
    QuestionTextAnswerDTO,
    UpdateQuestionRequest,
    _validate_question_payload,
)


def _question_dto(
    question: QuestionBankQuestionTable,
    options: list[QuestionOptionTable],
    text_answers: list[QuestionTextAnswerTable],
) -> QuestionResponseForTeacher:
    return QuestionResponseForTeacher(
        id=question.id,
        class_id=question.class_id,
        created_by_user_id=question.created_by_user_id,
        title=question.title,
        question_text=question.question_text,
        type=question.type,
        default_points=question.default_points,
        explanation=question.explanation,
        status=question.status,
        options=[
            QuestionOptionDTO(
                id=option.id,
                text=option.text,
                is_correct=option.is_correct,
                position=option.position,
            )
            for option in options
        ],
        text_answers=[
            QuestionTextAnswerDTO(
                id=answer.id,
                answer=answer.answer,
                is_case_sensitive=answer.is_case_sensitive,
            )
            for answer in text_answers
        ],
        created_at=question.created_at,
        updated_at=question.updated_at,
    )


async def create_question(
    class_id: int,
    user: UsersTable,
    body: CreateQuestionRequest,
    db: AsyncSession,
) -> QuestionResponseForTeacher:
    question = await question_repo.create_question(
        class_id=class_id,
        created_by_user_id=user.id,
        title=body.title.strip(),
        question_text=body.question_text.strip(),
        question_type=body.type,
        default_points=body.default_points,
        explanation=body.explanation.strip() if body.explanation else None,
        status=body.status,
        db=db,
    )
    options = await question_repo.create_options(
        question.id,
        [(item.text.strip(), item.is_correct, item.position) for item in body.options],
        db,
    )
    text_answers = await question_repo.create_text_answers(
        question.id,
        [(item.answer.strip(), item.is_case_sensitive) for item in body.text_answers],
        db,
    )
    await db.commit()
    await db.refresh(question)
    return _question_dto(question, options, text_answers)


async def list_questions(
    *,
    class_id: int,
    question_type,
    status,
    search: str | None,
    page: int,
    limit: int,
    offset: int,
    db: AsyncSession,
) -> QuestionPageDTO:
    questions = await question_repo.list_questions(
        class_id=class_id,
        question_type=question_type,
        status=status,
        search=search.strip() if search else None,
        limit=limit,
        offset=offset,
        db=db,
    )
    total = await question_repo.count_questions(
        class_id=class_id,
        question_type=question_type,
        status=status,
        search=search.strip() if search else None,
        db=db,
    )
    options_map = await question_repo.list_options([item.id for item in questions], db)
    return QuestionPageDTO(
        items=[
            QuestionListItemDTO(
                id=question.id,
                title=question.title,
                question_text=question.question_text,
                type=question.type,
                default_points=question.default_points,
                status=question.status,
                options_count=len(options_map.get(question.id, [])),
                created_at=question.created_at,
            )
            for question in questions
        ],
        total=total,
        page=page,
        limit=limit,
    )


async def get_question(
    class_id: int, question_id: int, db: AsyncSession
) -> QuestionResponseForTeacher:
    question = await question_repo.get_question(question_id, class_id, db)
    if question is None:
        raise ServiceError("Вопрос не найден", 404)
    options_map = await question_repo.list_options([question.id], db)
    text_answers_map = await question_repo.list_text_answers([question.id], db)
    return _question_dto(
        question,
        options_map.get(question.id, []),
        text_answers_map.get(question.id, []),
    )


async def update_question(
    class_id: int,
    question_id: int,
    body: UpdateQuestionRequest,
    db: AsyncSession,
) -> QuestionResponseForTeacher:
    question = await question_repo.get_question(question_id, class_id, db)
    if question is None:
        raise ServiceError("Вопрос не найден", 404)

    options_map = await question_repo.list_options([question.id], db)
    text_answers_map = await question_repo.list_text_answers([question.id], db)
    current_options = options_map.get(question.id, [])
    current_text_answers = text_answers_map.get(question.id, [])

    next_type = body.type or question.type
    next_options_payload = body.options
    next_text_answers_payload = body.text_answers

    if next_options_payload is not None or next_text_answers_payload is not None or body.type is not None:
        _validate_question_payload(
            question_type=next_type,
            options=next_options_payload
            if next_options_payload is not None
            else [
                type("OptionStub", (), {"text": item.text, "is_correct": item.is_correct, "position": item.position})
                for item in current_options
            ],
            text_answers=next_text_answers_payload
            if next_text_answers_payload is not None
            else [
                type("TextAnswerStub", (), {"answer": item.answer, "is_case_sensitive": item.is_case_sensitive})
                for item in current_text_answers
            ],
        )

    if await quiz_repo.has_submitted_attempt_for_question(question.id, db):
        answer_structure_changed = (
            body.type is not None and body.type != question.type
        ) or next_options_payload is not None or next_text_answers_payload is not None
        if answer_structure_changed:
            raise ServiceError(
                "Нельзя менять тип вопроса или правильные ответы после отправленных попыток",
                409,
            )

    if body.title is not None:
        question.title = body.title.strip()
    if body.question_text is not None:
        question.question_text = body.question_text.strip()
    if body.type is not None:
        question.type = body.type
    if body.default_points is not None:
        question.default_points = body.default_points
    if "explanation" in body.model_fields_set:
        question.explanation = body.explanation.strip() if body.explanation else None
    if body.status is not None:
        question.status = body.status

    db.add(question)

    options = current_options
    text_answers = current_text_answers
    if next_options_payload is not None:
        options = await question_repo.replace_options(
            question.id,
            [
                (item.text.strip(), item.is_correct, item.position)
                for item in next_options_payload
            ],
            db,
        )
    if next_text_answers_payload is not None:
        text_answers = await question_repo.replace_text_answers(
            question.id,
            [
                (item.answer.strip(), item.is_case_sensitive)
                for item in next_text_answers_payload
            ],
            db,
        )

    await db.commit()
    await db.refresh(question)
    return _question_dto(question, options, text_answers)


async def delete_question(class_id: int, question_id: int, db: AsyncSession) -> None:
    question = await question_repo.get_question(question_id, class_id, db)
    if question is None:
        raise ServiceError("Вопрос не найден", 404)
    if await quiz_repo.is_question_used_in_active_quiz(question.id, db):
        raise ServiceError("Вопрос используется в активном тесте", 409)
    await question_repo.soft_delete(question, db)
