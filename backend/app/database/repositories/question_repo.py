from datetime import UTC, datetime

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import (
    QuestionBankQuestionTable,
    QuestionOptionTable,
    QuestionStatus,
    QuestionTextAnswerTable,
    QuestionType,
)

_ACTIVE_QUESTION = QuestionBankQuestionTable.deleted_at.is_(None)


async def create_question(
    *,
    class_id: int,
    created_by_user_id: int,
    title: str,
    question_text: str,
    question_type: QuestionType,
    default_points: float,
    explanation: str | None,
    status: QuestionStatus,
    db: AsyncSession,
) -> QuestionBankQuestionTable:
    question = QuestionBankQuestionTable(
        class_id=class_id,
        created_by_user_id=created_by_user_id,
        title=title,
        question_text=question_text,
        type=question_type,
        default_points=default_points,
        explanation=explanation,
        status=status,
    )
    db.add(question)
    await db.flush()
    return question


async def create_options(
    question_id: int,
    options: list[tuple[str, bool, int]],
    db: AsyncSession,
) -> list[QuestionOptionTable]:
    rows = [
        QuestionOptionTable(
            question_id=question_id,
            text=text,
            is_correct=is_correct,
            position=position,
        )
        for text, is_correct, position in options
    ]
    db.add_all(rows)
    await db.flush()
    return rows


async def create_text_answers(
    question_id: int,
    answers: list[tuple[str, bool]],
    db: AsyncSession,
) -> list[QuestionTextAnswerTable]:
    rows = [
        QuestionTextAnswerTable(
            question_id=question_id,
            answer=answer,
            is_case_sensitive=is_case_sensitive,
        )
        for answer, is_case_sensitive in answers
    ]
    db.add_all(rows)
    await db.flush()
    return rows


async def list_questions(
    *,
    class_id: int,
    question_type: QuestionType | None,
    status: QuestionStatus | None,
    search: str | None,
    limit: int,
    offset: int,
    db: AsyncSession,
) -> list[QuestionBankQuestionTable]:
    query = select(QuestionBankQuestionTable).where(
        QuestionBankQuestionTable.class_id == class_id,
        _ACTIVE_QUESTION,
    )
    if question_type is not None:
        query = query.where(QuestionBankQuestionTable.type == question_type)
    if status is not None:
        query = query.where(QuestionBankQuestionTable.status == status)
    if search:
        like = f"%{search.lower()}%"
        query = query.where(
            or_(
                func.lower(QuestionBankQuestionTable.title).like(like),
                func.lower(QuestionBankQuestionTable.question_text).like(like),
            )
        )
    result = await db.execute(
        query.order_by(QuestionBankQuestionTable.created_at.desc(), QuestionBankQuestionTable.id.desc())
        .limit(limit)
        .offset(offset)
    )
    return list(result.scalars().all())


async def count_questions(
    *,
    class_id: int,
    question_type: QuestionType | None,
    status: QuestionStatus | None,
    search: str | None,
    db: AsyncSession,
) -> int:
    query = select(func.count(QuestionBankQuestionTable.id)).where(
        QuestionBankQuestionTable.class_id == class_id,
        _ACTIVE_QUESTION,
    )
    if question_type is not None:
        query = query.where(QuestionBankQuestionTable.type == question_type)
    if status is not None:
        query = query.where(QuestionBankQuestionTable.status == status)
    if search:
        like = f"%{search.lower()}%"
        query = query.where(
            or_(
                func.lower(QuestionBankQuestionTable.title).like(like),
                func.lower(QuestionBankQuestionTable.question_text).like(like),
            )
        )
    result = await db.execute(query)
    return int(result.scalar_one())


async def get_question(
    question_id: int,
    class_id: int,
    db: AsyncSession,
) -> QuestionBankQuestionTable | None:
    result = await db.execute(
        select(QuestionBankQuestionTable).where(
            QuestionBankQuestionTable.id == question_id,
            QuestionBankQuestionTable.class_id == class_id,
            _ACTIVE_QUESTION,
        )
    )
    return result.scalar_one_or_none()


async def get_question_any(question_id: int, db: AsyncSession) -> QuestionBankQuestionTable | None:
    result = await db.execute(
        select(QuestionBankQuestionTable).where(
            QuestionBankQuestionTable.id == question_id,
            _ACTIVE_QUESTION,
        )
    )
    return result.scalar_one_or_none()


async def list_options(question_ids: list[int], db: AsyncSession) -> dict[int, list[QuestionOptionTable]]:
    if not question_ids:
        return {}
    result = await db.execute(
        select(QuestionOptionTable)
        .where(QuestionOptionTable.question_id.in_(question_ids))
        .order_by(QuestionOptionTable.position.asc(), QuestionOptionTable.id.asc())
    )
    data: dict[int, list[QuestionOptionTable]] = {}
    for row in result.scalars().all():
        data.setdefault(row.question_id, []).append(row)
    return data


async def list_text_answers(
    question_ids: list[int], db: AsyncSession
) -> dict[int, list[QuestionTextAnswerTable]]:
    if not question_ids:
        return {}
    result = await db.execute(
        select(QuestionTextAnswerTable)
        .where(QuestionTextAnswerTable.question_id.in_(question_ids))
        .order_by(QuestionTextAnswerTable.id.asc())
    )
    data: dict[int, list[QuestionTextAnswerTable]] = {}
    for row in result.scalars().all():
        data.setdefault(row.question_id, []).append(row)
    return data


async def replace_options(
    question_id: int,
    options: list[tuple[str, bool, int]],
    db: AsyncSession,
) -> list[QuestionOptionTable]:
    existing = await db.execute(
        select(QuestionOptionTable).where(QuestionOptionTable.question_id == question_id)
    )
    for row in existing.scalars().all():
        await db.delete(row)
    await db.flush()
    return await create_options(question_id, options, db)


async def replace_text_answers(
    question_id: int,
    answers: list[tuple[str, bool]],
    db: AsyncSession,
) -> list[QuestionTextAnswerTable]:
    existing = await db.execute(
        select(QuestionTextAnswerTable).where(QuestionTextAnswerTable.question_id == question_id)
    )
    for row in existing.scalars().all():
        await db.delete(row)
    await db.flush()
    return await create_text_answers(question_id, answers, db)


async def soft_delete(question: QuestionBankQuestionTable, db: AsyncSession) -> None:
    question.deleted_at = datetime.now(UTC)
    db.add(question)
    await db.commit()
