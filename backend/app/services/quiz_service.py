import random
import re
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import (
    AssignmentType,
    AssignmentsTable,
    ClassRole,
    QuestionBankQuestionTable,
    QuestionOptionTable,
    QuestionStatus,
    QuestionTextAnswerTable,
    QuestionType,
    QuizAssignmentQuestionTable,
    QuizAttemptAnswerTable,
    QuizAttemptStatus,
    QuizAttemptTable,
    StoredFilesTable,
    SubmissionStatus,
    UsersTable,
)
from app.database.repositories import (
    assignment_repo,
    class_repo,
    grade_repo,
    question_repo,
    quiz_repo,
    submission_repo,
)
from app.schemas.errors import ServiceError
from app.schemas.quiz_schemas import (
    AddQuestionToQuizRequest,
    QuizAssignmentDetailsResponse,
    QuizAttemptAnswerResultDTO,
    QuizAttemptBriefDTO,
    QuizAttemptResultResponse,
    QuizQuestionForStudentDTO,
    QuizQuestionTeacherDTO,
    QuizSettingsDTO,
    SaveQuizAnswerRequest,
    StartQuizAttemptResponse,
    SubmitQuizAttemptResponse,
    UpdateQuizQuestionRequest,
)
from app.schemas.question_schemas import StudentQuestionOptionDTO
from app.services import access, notification_service


def _settings_dto(settings) -> QuizSettingsDTO:
    return QuizSettingsDTO(
        shuffle_questions=settings.shuffle_questions,
        shuffle_options=settings.shuffle_options,
        show_result_after_submit=settings.show_result_after_submit,
        show_correct_answers_after_submit=settings.show_correct_answers_after_submit,
        time_limit_minutes=settings.time_limit_minutes,
        attempts_limit=settings.attempts_limit,
    )


def _attempt_brief(attempt: QuizAttemptTable | None) -> QuizAttemptBriefDTO | None:
    if attempt is None:
        return None
    return QuizAttemptBriefDTO(
        attempt_id=attempt.id,
        status=attempt.status,
        started_at=attempt.started_at,
        submitted_at=attempt.submitted_at,
        score=attempt.score,
        max_score=attempt.max_score,
    )


async def get_assignment_quiz_meta(
    assignment: AssignmentsTable,
    user_id: int | None,
    member_role: ClassRole | None,
    db: AsyncSession,
) -> tuple[QuizSettingsDTO | None, int | None, QuizAttemptBriefDTO | None]:
    if assignment.type != AssignmentType.QUIZ:
        return None, None, None

    settings = await quiz_repo.get_settings(assignment.id, db)
    question_count = await quiz_repo.count_questions_for_assignment(assignment.id, db)
    attempt = None
    if user_id is not None and member_role == ClassRole.STUDENT:
        attempt = await quiz_repo.get_latest_attempt_for_student(assignment.id, user_id, db)
    return (
        _settings_dto(settings) if settings is not None else None,
        question_count,
        _attempt_brief(attempt),
    )


async def ensure_quiz_assignment(aid: int, db: AsyncSession) -> AssignmentsTable:
    assignment = await access.get_assignment_or_404(aid, db)
    if assignment.type != AssignmentType.QUIZ:
        raise ServiceError("Задание не является тестом", 409)
    return assignment


def _teacher_question_dto(
    quiz_question: QuizAssignmentQuestionTable,
    question: QuestionBankQuestionTable,
    options: list[QuestionOptionTable],
    text_answers: list[QuestionTextAnswerTable],
) -> QuizQuestionTeacherDTO:
    return QuizQuestionTeacherDTO(
        id=quiz_question.id,
        question_id=question.id,
        title=question.title,
        type=question.type.value,
        question_text=question.question_text,
        points=quiz_question.points,
        position=quiz_question.position,
        options=[
            {
                "id": option.id,
                "text": option.text,
                "is_correct": option.is_correct,
                "position": option.position,
            }
            for option in options
        ],
        text_answers=[
            {
                "id": answer.id,
                "answer": answer.answer,
                "is_case_sensitive": answer.is_case_sensitive,
            }
            for answer in text_answers
        ],
        explanation=question.explanation,
    )


def _shuffle(items: list, seed_value: str | int) -> list:
    copied = list(items)
    random.Random(str(seed_value)).shuffle(copied)
    return copied


async def create_quiz_settings_for_assignment(
    assignment_id: int,
    quiz_settings,
    db: AsyncSession,
) -> None:
    await quiz_repo.create_settings(
        assignment_id=assignment_id,
        shuffle_questions=quiz_settings.shuffle_questions,
        shuffle_options=quiz_settings.shuffle_options,
        show_result_after_submit=quiz_settings.show_result_after_submit,
        show_correct_answers_after_submit=quiz_settings.show_correct_answers_after_submit,
        time_limit_minutes=quiz_settings.time_limit_minutes,
        attempts_limit=quiz_settings.attempts_limit,
        db=db,
    )


async def _recalculate_assignment_max_grade(
    assignment: AssignmentsTable,
    db: AsyncSession,
) -> None:
    quiz_questions = await quiz_repo.list_assignment_questions(assignment.id, db)
    assignment.max_grade = float(sum(item.points for item in quiz_questions))
    db.add(assignment)
    await db.flush()


async def add_question_to_quiz(
    assignment_id: int,
    body: AddQuestionToQuizRequest,
    user: UsersTable,
    db: AsyncSession,
) -> QuizQuestionTeacherDTO:
    assignment = await ensure_quiz_assignment(assignment_id, db)
    await access.ensure_teacher_or_creator(assignment.class_id, user.id, db)

    question = await question_repo.get_question_any(body.question_id, db)
    if question is None or question.class_id != assignment.class_id:
        raise ServiceError("Вопрос не найден", 404)
    if question.status != QuestionStatus.READY:
        raise ServiceError("В тест можно добавить только вопрос со статусом ready", 422)
    if await quiz_repo.get_assignment_question_by_question(assignment_id, question.id, db):
        raise ServiceError("Этот вопрос уже добавлен в тест", 409)

    quiz_question = await quiz_repo.add_question_to_assignment(
        assignment_id=assignment_id,
        question_id=question.id,
        points=body.points,
        position=body.position,
        db=db,
    )
    await _recalculate_assignment_max_grade(assignment, db)
    await db.commit()

    options_map = await question_repo.list_options([question.id], db)
    text_answers_map = await question_repo.list_text_answers([question.id], db)
    return _teacher_question_dto(
        quiz_question,
        question,
        options_map.get(question.id, []),
        text_answers_map.get(question.id, []),
    )


async def list_quiz_questions_for_teacher(
    assignment_id: int,
    user: UsersTable,
    db: AsyncSession,
) -> QuizAssignmentDetailsResponse:
    assignment = await ensure_quiz_assignment(assignment_id, db)
    await access.ensure_teacher_or_creator(assignment.class_id, user.id, db)
    settings = await quiz_repo.get_settings(assignment.id, db)
    quiz_questions = await quiz_repo.list_assignment_questions(assignment.id, db)
    question_ids = [row.question_id for row in quiz_questions]
    options_map = await question_repo.list_options(question_ids, db)
    text_answers_map = await question_repo.list_text_answers(question_ids, db)
    questions = {
        question_id: await question_repo.get_question_any(question_id, db)
        for question_id in question_ids
    }
    return QuizAssignmentDetailsResponse(
        assignment_id=assignment.id,
        type=assignment.type,
        settings=_settings_dto(settings),
        questions=[
            _teacher_question_dto(
                row,
                questions[row.question_id],
                options_map.get(row.question_id, []),
                text_answers_map.get(row.question_id, []),
            )
            for row in quiz_questions
            if questions[row.question_id] is not None
        ],
    )


async def update_quiz_question(
    assignment_id: int,
    quiz_question_id: int,
    body: UpdateQuizQuestionRequest,
    user: UsersTable,
    db: AsyncSession,
) -> QuizQuestionTeacherDTO:
    assignment = await ensure_quiz_assignment(assignment_id, db)
    await access.ensure_teacher_or_creator(assignment.class_id, user.id, db)
    quiz_question = await quiz_repo.get_assignment_question(quiz_question_id, assignment_id, db)
    if quiz_question is None:
        raise ServiceError("Вопрос теста не найден", 404)
    if body.points is not None:
        quiz_question.points = body.points
    if body.position is not None:
        quiz_question.position = body.position
    db.add(quiz_question)
    await _recalculate_assignment_max_grade(assignment, db)
    await db.commit()
    question = await question_repo.get_question_any(quiz_question.question_id, db)
    options_map = await question_repo.list_options([quiz_question.question_id], db)
    text_answers_map = await question_repo.list_text_answers([quiz_question.question_id], db)
    return _teacher_question_dto(
        quiz_question,
        question,
        options_map.get(quiz_question.question_id, []),
        text_answers_map.get(quiz_question.question_id, []),
    )


async def delete_quiz_question(
    assignment_id: int,
    quiz_question_id: int,
    user: UsersTable,
    db: AsyncSession,
) -> None:
    assignment = await ensure_quiz_assignment(assignment_id, db)
    await access.ensure_teacher_or_creator(assignment.class_id, user.id, db)
    quiz_question = await quiz_repo.get_assignment_question(quiz_question_id, assignment_id, db)
    if quiz_question is None:
        raise ServiceError("Вопрос теста не найден", 404)
    if await quiz_repo.has_submitted_attempts_for_assignment(assignment.id, db):
        raise ServiceError("Нельзя удалять вопросы после отправленных попыток", 409)
    await quiz_repo.delete_assignment_question(quiz_question, db)
    await _recalculate_assignment_max_grade(assignment, db)
    await db.commit()


async def _attempt_questions_payload(
    attempt: QuizAttemptTable,
    assignment: AssignmentsTable,
    db: AsyncSession,
) -> list[QuizQuestionForStudentDTO]:
    settings = await quiz_repo.get_settings(assignment.id, db)
    quiz_questions = await quiz_repo.list_assignment_questions(assignment.id, db)
    question_ids = [row.question_id for row in quiz_questions]
    questions = {
        question_id: await question_repo.get_question_any(question_id, db)
        for question_id in question_ids
    }
    options_map = await question_repo.list_options(question_ids, db)

    rows = [row for row in quiz_questions if questions.get(row.question_id) is not None]
    if settings.shuffle_questions:
        rows = _shuffle(rows, attempt.id)

    payload: list[QuizQuestionForStudentDTO] = []
    for row in rows:
        question = questions[row.question_id]
        options = options_map.get(row.question_id, [])
        if settings.shuffle_options:
            options = _shuffle(options, f"{attempt.id}:{row.question_id}")
        payload.append(
            QuizQuestionForStudentDTO(
                id=row.id,
                question_id=question.id,
                type=question.type.value,
                question_text=question.question_text,
                points=row.points,
                options=[
                    StudentQuestionOptionDTO(
                        id=option.id,
                        text=option.text,
                        position=index + 1,
                    )
                    for index, option in enumerate(options)
                ],
            )
        )
    return payload


async def start_quiz_attempt(
    assignment_id: int,
    user: UsersTable,
    db: AsyncSession,
) -> StartQuizAttemptResponse:
    assignment = await ensure_quiz_assignment(assignment_id, db)
    await access.ensure_student(assignment, user.id, db)
    settings = await quiz_repo.get_settings(assignment.id, db)
    in_progress = await quiz_repo.get_in_progress_attempt(assignment.id, user.id, db)
    if in_progress is not None:
        return StartQuizAttemptResponse(
            attempt_id=in_progress.id,
            assignment_id=assignment.id,
            status=in_progress.status,
            started_at=in_progress.started_at,
            questions=await _attempt_questions_payload(in_progress, assignment, db),
        )

    attempts_count = await quiz_repo.count_attempts(assignment.id, user.id, db)
    if attempts_count >= settings.attempts_limit:
        raise ServiceError("Лимит попыток исчерпан", 409)

    attempt = await quiz_repo.create_attempt(assignment.id, user.id, db)
    await db.commit()
    return StartQuizAttemptResponse(
        attempt_id=attempt.id,
        assignment_id=assignment.id,
        status=attempt.status,
        started_at=attempt.started_at,
        questions=await _attempt_questions_payload(attempt, assignment, db),
    )


async def save_quiz_answer(
    attempt_id: int,
    question_id: int,
    body: SaveQuizAnswerRequest,
    user: UsersTable,
    db: AsyncSession,
) -> None:
    attempt = await quiz_repo.get_attempt(attempt_id, db)
    if attempt is None:
        raise ServiceError("Попытка не найдена", 404)
    if attempt.student_id != user.id:
        raise ServiceError("Недостаточно прав", 403)
    if attempt.status != QuizAttemptStatus.IN_PROGRESS:
        raise ServiceError("Попытка уже завершена", 409)

    assignment = await ensure_quiz_assignment(attempt.assignment_id, db)
    await access.ensure_student(assignment, user.id, db)

    quiz_question = await quiz_repo.get_assignment_question_by_question(assignment.id, question_id, db)
    if quiz_question is None:
        raise ServiceError("Вопрос не входит в этот тест", 404)
    question = await question_repo.get_question_any(question_id, db)
    options_map = await question_repo.list_options([question_id], db)
    valid_option_ids = {option.id for option in options_map.get(question_id, [])}

    selected_option_ids = None
    text_answer = None
    if question.type == QuestionType.SINGLE_CHOICE:
        if not body.selected_option_ids or len(body.selected_option_ids) != 1:
            raise ServiceError("Для single_choice нужен ровно один выбранный вариант", 422)
        if not set(body.selected_option_ids).issubset(valid_option_ids):
            raise ServiceError("Передан неизвестный вариант ответа", 422)
        selected_option_ids = body.selected_option_ids
    elif question.type == QuestionType.MULTIPLE_CHOICE:
        if not body.selected_option_ids:
            raise ServiceError("Для multiple_choice нужен хотя бы один выбранный вариант", 422)
        if not set(body.selected_option_ids).issubset(valid_option_ids):
            raise ServiceError("Передан неизвестный вариант ответа", 422)
        selected_option_ids = sorted(set(body.selected_option_ids))
    else:
        if body.text_answer is None or not body.text_answer.strip():
            raise ServiceError("Для text_input нужен ответ", 422)
        text_answer = body.text_answer

    await quiz_repo.upsert_attempt_answer(
        attempt_id=attempt.id,
        question_id=question_id,
        selected_option_ids=selected_option_ids,
        text_answer=text_answer,
        db=db,
    )
    await db.commit()


def _normalize_text(value: str, *, is_case_sensitive: bool) -> str:
    normalized = re.sub(r"\s+", " ", value.strip())
    return normalized if is_case_sensitive else normalized.lower()


def _evaluate_answer(
    *,
    quiz_question: QuizAssignmentQuestionTable,
    question: QuestionBankQuestionTable,
    answer: QuizAttemptAnswerTable | None,
    options: list[QuestionOptionTable],
    text_answers: list[QuestionTextAnswerTable],
) -> tuple[bool, float]:
    if answer is None:
        return False, 0.0

    if question.type == QuestionType.SINGLE_CHOICE:
        selected = set(quiz_repo.parse_selected_option_ids(answer))
        correct = {option.id for option in options if option.is_correct}
        is_correct = len(selected) == 1 and selected == correct
        return is_correct, quiz_question.points if is_correct else 0.0

    if question.type == QuestionType.MULTIPLE_CHOICE:
        selected = set(quiz_repo.parse_selected_option_ids(answer))
        correct = {option.id for option in options if option.is_correct}
        is_correct = selected == correct and len(correct) > 0
        return is_correct, quiz_question.points if is_correct else 0.0

    if answer.text_answer is None:
        return False, 0.0
    normalized_student_answers = [
        _normalize_text(answer.text_answer, is_case_sensitive=item.is_case_sensitive)
        == _normalize_text(item.answer, is_case_sensitive=item.is_case_sensitive)
        for item in text_answers
    ]
    is_correct = any(normalized_student_answers)
    return is_correct, quiz_question.points if is_correct else 0.0


async def submit_quiz_attempt(
    attempt_id: int,
    user: UsersTable,
    db: AsyncSession,
) -> SubmitQuizAttemptResponse:
    attempt = await quiz_repo.get_attempt(attempt_id, db)
    if attempt is None:
        raise ServiceError("Попытка не найдена", 404)
    if attempt.student_id != user.id:
        raise ServiceError("Недостаточно прав", 403)
    if attempt.status != QuizAttemptStatus.IN_PROGRESS:
        raise ServiceError("Попытка уже завершена", 409)

    assignment = await ensure_quiz_assignment(attempt.assignment_id, db)
    settings = await quiz_repo.get_settings(assignment.id, db)
    quiz_questions = await quiz_repo.list_assignment_questions(assignment.id, db)
    question_ids = [row.question_id for row in quiz_questions]
    questions = {
        question_id: await question_repo.get_question_any(question_id, db)
        for question_id in question_ids
    }
    options_map = await question_repo.list_options(question_ids, db)
    text_answers_map = await question_repo.list_text_answers(question_ids, db)
    answers = await quiz_repo.list_attempt_answers(attempt.id, db)
    answers_map = {answer.question_id: answer for answer in answers}

    total_score = 0.0
    max_score = sum(row.points for row in quiz_questions)
    answer_results: list[QuizAttemptAnswerResultDTO] = []

    for row in quiz_questions:
        question = questions.get(row.question_id)
        if question is None:
            continue
        options = options_map.get(row.question_id, [])
        text_answers = text_answers_map.get(row.question_id, [])
        answer = answers_map.get(row.question_id)
        is_correct, score = _evaluate_answer(
            quiz_question=row,
            question=question,
            answer=answer,
            options=options,
            text_answers=text_answers,
        )
        total_score += score
        if answer is not None:
            answer.is_correct = is_correct
            answer.score = score
            db.add(answer)
        answer_results.append(
            QuizAttemptAnswerResultDTO(
                question_id=row.question_id,
                is_correct=is_correct,
                score=score,
                selected_option_ids=quiz_repo.parse_selected_option_ids(answer) if answer else None,
                text_answer=answer.text_answer if answer else None,
                correct_option_ids=(
                    [option.id for option in options if option.is_correct]
                    if settings.show_correct_answers_after_submit
                    else None
                ),
                correct_text_answers=(
                    [item.answer for item in text_answers]
                    if settings.show_correct_answers_after_submit
                    else None
                ),
                explanation=(
                    question.explanation
                    if settings.show_correct_answers_after_submit
                    else None
                ),
            )
        )

    attempt.status = QuizAttemptStatus.SUBMITTED
    attempt.submitted_at = datetime.now(UTC)
    attempt.score = total_score
    attempt.max_score = max_score
    db.add(attempt)

    submission = await submission_repo.get_by_assignment_and_student(assignment.id, user.id, db)
    if submission is None:
        submission = await submission_repo.create(
            assignment_id=assignment.id,
            student_id=user.id,
            answer_text=f"Quiz attempt #{attempt.id}",
            attachment_url=None,
            db=db,
        )
    submission.answer_text = f"Quiz attempt #{attempt.id}"
    submission.status = SubmissionStatus.GRADED
    submission.submitted_at = attempt.submitted_at
    submission.return_comment = None
    db.add(submission)

    grade = await grade_repo.upsert(
        submission_id=submission.id,
        graded_by_user_id=assignment.author_id,
        value=total_score,
        comment="Автоматическая проверка теста",
        db=db,
    )
    cls = await class_repo.get_by_id(assignment.class_id, db)
    if cls is not None:
        await notification_service.notify_submission_submitted(
            class_id=assignment.class_id,
            assignment_id=assignment.id,
            assignment_title=assignment.title,
            student_id=user.id,
            db=db,
        )
        await notification_service.notify_grade_created(
            student_id=user.id,
            class_id=assignment.class_id,
            class_name=cls.name,
            assignment_id=assignment.id,
            value=grade.value,
            max_grade=assignment.max_grade,
            db=db,
        )

    return SubmitQuizAttemptResponse(
        attempt_id=attempt.id,
        status=attempt.status,
        score=total_score,
        max_score=max_score,
        submitted_at=attempt.submitted_at,
        answers=answer_results,
    )


async def get_quiz_attempt_result(
    attempt_id: int,
    user: UsersTable,
    db: AsyncSession,
) -> QuizAttemptResultResponse:
    attempt = await quiz_repo.get_attempt(attempt_id, db)
    if attempt is None:
        raise ServiceError("Попытка не найдена", 404)

    assignment = await ensure_quiz_assignment(attempt.assignment_id, db)
    member = await access.get_class_member_or_403(assignment.class_id, user.id, db)
    if member.role == ClassRole.STUDENT and attempt.student_id != user.id:
        raise ServiceError("Недостаточно прав", 403)

    settings = await quiz_repo.get_settings(assignment.id, db)
    if attempt.status != QuizAttemptStatus.SUBMITTED:
        raise ServiceError("Попытка ещё не завершена", 409)

    answers = await quiz_repo.list_attempt_answers(attempt.id, db)
    answers_map = {answer.question_id: answer for answer in answers}
    quiz_questions = await quiz_repo.list_assignment_questions(assignment.id, db)
    question_ids = [row.question_id for row in quiz_questions]
    questions = {
        question_id: await question_repo.get_question_any(question_id, db)
        for question_id in question_ids
    }
    options_map = await question_repo.list_options(question_ids, db)
    text_answers_map = await question_repo.list_text_answers(question_ids, db)

    is_teacher_view = member.role in {ClassRole.TEACHER, ClassRole.CREATOR}
    show_score = is_teacher_view or settings.show_result_after_submit
    show_correct = is_teacher_view or settings.show_correct_answers_after_submit

    result_answers: list[QuizAttemptAnswerResultDTO] = []
    for row in quiz_questions:
        question = questions.get(row.question_id)
        if question is None:
            continue
        answer = answers_map.get(row.question_id)
        result_answers.append(
            QuizAttemptAnswerResultDTO(
                question_id=row.question_id,
                is_correct=answer.is_correct if show_score else None,
                score=answer.score if show_score else None,
                selected_option_ids=quiz_repo.parse_selected_option_ids(answer) if answer else None,
                text_answer=answer.text_answer if answer else None,
                correct_option_ids=(
                    [item.id for item in options_map.get(row.question_id, []) if item.is_correct]
                    if show_correct
                    else None
                ),
                correct_text_answers=(
                    [item.answer for item in text_answers_map.get(row.question_id, [])]
                    if show_correct
                    else None
                ),
                explanation=question.explanation if show_correct else None,
            )
        )

    return QuizAttemptResultResponse(
        attempt_id=attempt.id,
        assignment_id=assignment.id,
        status=attempt.status,
        score=attempt.score if show_score else None,
        max_score=attempt.max_score if show_score else None,
        submitted_at=attempt.submitted_at,
        answers=result_answers,
    )
