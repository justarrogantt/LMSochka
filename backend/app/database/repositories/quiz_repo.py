import json

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import (
    AssignmentsTable,
    QuestionBankQuestionTable,
    QuizAssignmentQuestionTable,
    QuizAssignmentSettingsTable,
    QuizAttemptAnswerTable,
    QuizAttemptStatus,
    QuizAttemptTable,
)


async def create_settings(
    *,
    assignment_id: int,
    shuffle_questions: bool,
    shuffle_options: bool,
    show_result_after_submit: bool,
    show_correct_answers_after_submit: bool,
    time_limit_minutes: int | None,
    attempts_limit: int,
    db: AsyncSession,
) -> QuizAssignmentSettingsTable:
    settings = QuizAssignmentSettingsTable(
        assignment_id=assignment_id,
        shuffle_questions=shuffle_questions,
        shuffle_options=shuffle_options,
        show_result_after_submit=show_result_after_submit,
        show_correct_answers_after_submit=show_correct_answers_after_submit,
        time_limit_minutes=time_limit_minutes,
        attempts_limit=attempts_limit,
    )
    db.add(settings)
    await db.flush()
    return settings


async def get_settings(assignment_id: int, db: AsyncSession) -> QuizAssignmentSettingsTable | None:
    result = await db.execute(
        select(QuizAssignmentSettingsTable).where(
            QuizAssignmentSettingsTable.assignment_id == assignment_id
        )
    )
    return result.scalar_one_or_none()


async def count_questions_for_assignment(assignment_id: int, db: AsyncSession) -> int:
    result = await db.execute(
        select(func.count(QuizAssignmentQuestionTable.id)).where(
            QuizAssignmentQuestionTable.assignment_id == assignment_id
        )
    )
    return int(result.scalar_one())


async def list_assignment_questions(
    assignment_id: int, db: AsyncSession
) -> list[QuizAssignmentQuestionTable]:
    result = await db.execute(
        select(QuizAssignmentQuestionTable)
        .where(QuizAssignmentQuestionTable.assignment_id == assignment_id)
        .order_by(
            QuizAssignmentQuestionTable.position.asc(),
            QuizAssignmentQuestionTable.id.asc(),
        )
    )
    return list(result.scalars().all())


async def get_assignment_question(
    quiz_question_id: int, assignment_id: int, db: AsyncSession
) -> QuizAssignmentQuestionTable | None:
    result = await db.execute(
        select(QuizAssignmentQuestionTable).where(
            QuizAssignmentQuestionTable.id == quiz_question_id,
            QuizAssignmentQuestionTable.assignment_id == assignment_id,
        )
    )
    return result.scalar_one_or_none()


async def get_assignment_question_by_question(
    assignment_id: int, question_id: int, db: AsyncSession
) -> QuizAssignmentQuestionTable | None:
    result = await db.execute(
        select(QuizAssignmentQuestionTable).where(
            QuizAssignmentQuestionTable.assignment_id == assignment_id,
            QuizAssignmentQuestionTable.question_id == question_id,
        )
    )
    return result.scalar_one_or_none()


async def add_question_to_assignment(
    *,
    assignment_id: int,
    question_id: int,
    points: float,
    position: int,
    db: AsyncSession,
) -> QuizAssignmentQuestionTable:
    row = QuizAssignmentQuestionTable(
        assignment_id=assignment_id,
        question_id=question_id,
        points=points,
        position=position,
    )
    db.add(row)
    await db.flush()
    return row


async def delete_assignment_question(row: QuizAssignmentQuestionTable, db: AsyncSession) -> None:
    await db.delete(row)
    await db.flush()


async def create_attempt(
    assignment_id: int, student_id: int, db: AsyncSession
) -> QuizAttemptTable:
    attempt = QuizAttemptTable(assignment_id=assignment_id, student_id=student_id)
    db.add(attempt)
    await db.flush()
    return attempt


async def get_in_progress_attempt(
    assignment_id: int, student_id: int, db: AsyncSession
) -> QuizAttemptTable | None:
    result = await db.execute(
        select(QuizAttemptTable).where(
            QuizAttemptTable.assignment_id == assignment_id,
            QuizAttemptTable.student_id == student_id,
            QuizAttemptTable.status == QuizAttemptStatus.IN_PROGRESS,
        )
    )
    return result.scalar_one_or_none()


async def count_attempts(
    assignment_id: int, student_id: int, db: AsyncSession
) -> int:
    result = await db.execute(
        select(func.count(QuizAttemptTable.id)).where(
            QuizAttemptTable.assignment_id == assignment_id,
            QuizAttemptTable.student_id == student_id,
        )
    )
    return int(result.scalar_one())


async def get_attempt(attempt_id: int, db: AsyncSession) -> QuizAttemptTable | None:
    result = await db.execute(
        select(QuizAttemptTable).where(QuizAttemptTable.id == attempt_id)
    )
    return result.scalar_one_or_none()


async def get_latest_attempt_for_student(
    assignment_id: int, student_id: int, db: AsyncSession
) -> QuizAttemptTable | None:
    result = await db.execute(
        select(QuizAttemptTable)
        .where(
            QuizAttemptTable.assignment_id == assignment_id,
            QuizAttemptTable.student_id == student_id,
        )
        .order_by(QuizAttemptTable.id.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def upsert_attempt_answer(
    *,
    attempt_id: int,
    question_id: int,
    selected_option_ids: list[int] | None,
    text_answer: str | None,
    db: AsyncSession,
) -> QuizAttemptAnswerTable:
    result = await db.execute(
        select(QuizAttemptAnswerTable).where(
            QuizAttemptAnswerTable.attempt_id == attempt_id,
            QuizAttemptAnswerTable.question_id == question_id,
        )
    )
    answer = result.scalar_one_or_none()
    if answer is None:
        answer = QuizAttemptAnswerTable(
            attempt_id=attempt_id,
            question_id=question_id,
        )
    answer.selected_option_ids = (
        json.dumps(selected_option_ids) if selected_option_ids is not None else None
    )
    answer.text_answer = text_answer
    db.add(answer)
    await db.flush()
    return answer


async def list_attempt_answers(
    attempt_id: int, db: AsyncSession
) -> list[QuizAttemptAnswerTable]:
    result = await db.execute(
        select(QuizAttemptAnswerTable)
        .where(QuizAttemptAnswerTable.attempt_id == attempt_id)
        .order_by(QuizAttemptAnswerTable.id.asc())
    )
    return list(result.scalars().all())


async def has_submitted_attempt_for_question(question_id: int, db: AsyncSession) -> bool:
    result = await db.execute(
        select(func.count(QuizAttemptAnswerTable.id))
        .join(QuizAttemptTable, QuizAttemptTable.id == QuizAttemptAnswerTable.attempt_id)
        .where(
            QuizAttemptAnswerTable.question_id == question_id,
            QuizAttemptTable.status == QuizAttemptStatus.SUBMITTED,
        )
    )
    return int(result.scalar_one()) > 0


async def has_submitted_attempts_for_assignment(assignment_id: int, db: AsyncSession) -> bool:
    result = await db.execute(
        select(func.count(QuizAttemptTable.id)).where(
            QuizAttemptTable.assignment_id == assignment_id,
            QuizAttemptTable.status == QuizAttemptStatus.SUBMITTED,
        )
    )
    return int(result.scalar_one()) > 0


async def is_question_used_in_active_quiz(question_id: int, db: AsyncSession) -> bool:
    result = await db.execute(
        select(func.count(QuizAssignmentQuestionTable.id))
        .join(AssignmentsTable, AssignmentsTable.id == QuizAssignmentQuestionTable.assignment_id)
        .where(
            QuizAssignmentQuestionTable.question_id == question_id,
            AssignmentsTable.deleted_at.is_(None),
        )
    )
    return int(result.scalar_one()) > 0


def parse_selected_option_ids(answer: QuizAttemptAnswerTable) -> list[int]:
    if not answer.selected_option_ids:
        return []
    return [int(item) for item in json.loads(answer.selected_option_ids)]
