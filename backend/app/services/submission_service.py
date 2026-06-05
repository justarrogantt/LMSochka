from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import (
    AssignmentsTable,
    GradesTable,
    StoredFilesTable,
    SubmissionsTable,
    SubmissionStatus,
    UsersTable,
)
from app.database.repositories import (
    class_repo,
    file_repo,
    grade_repo,
    group_repo,
    member_grade_repo,
    submission_repo,
    user_repo,
)
from app.schemas.errors import ServiceError
from app.schemas.pagination import PageDTO
from app.schemas.submission_schemas import (
    SaveSubmissionRequest,
    SubmissionDTO,
    SubmissionGradeDTO,
)
from app.schemas.user_schemas import UserBriefDTO
from app.services import access, file_service, notification_service

# Статусы, в которых решение уже нельзя править/перезаписывать студентом.
_LOCKED_STATUSES = {
    SubmissionStatus.SUBMITTED,
    SubmissionStatus.GRADED,
    SubmissionStatus.PENDING_REDISTRIBUTION,
}


def _is_late(submission: SubmissionsTable, assignment: AssignmentsTable) -> bool:
    if submission.submitted_at is None or assignment.due_at is None:
        return False
    return submission.submitted_at > assignment.due_at


async def _author_of(
    submission: SubmissionsTable, user: UsersTable, db: AsyncSession
) -> UsersTable:
    """Автор решения. У группового решение мог создать другой член команды."""
    if submission.student_id == user.id:
        return user
    author = await user_repo.get_by_id(submission.student_id, db)
    return author if author is not None else user


async def _group_title(submission: SubmissionsTable, db: AsyncSession) -> str | None:
    """Название команды у группового решения; у индивидуального — None."""
    group = await group_repo.get_group_for_submission(submission.id, db)
    return group.title if group is not None else None


def _dto(
    submission: SubmissionsTable,
    student: UsersTable,
    assignment: AssignmentsTable,
    grade: GradesTable | None,
    attachment_file: StoredFilesTable | None = None,
    group_title: str | None = None,
) -> SubmissionDTO:
    return SubmissionDTO(
        id=submission.id,
        assignment_id=submission.assignment_id,
        student=UserBriefDTO.model_validate(student),
        answer_text=submission.answer_text,
        attachment_url=submission.attachment_url,
        attachment_file=file_service.dto(attachment_file),
        status=submission.status,
        return_comment=submission.return_comment,
        submitted_at=submission.submitted_at,
        is_late=_is_late(submission, assignment),
        group_title=group_title,
        grade=(
            SubmissionGradeDTO(
                value=grade.value,
                comment=grade.comment,
                graded_at=grade.graded_at,
                updated_at=grade.updated_at,
            )
            if grade is not None
            else None
        ),
        created_at=submission.created_at,
        updated_at=submission.updated_at,
    )


async def save_my_submission(
    aid: int,
    user: UsersTable,
    body: SaveSubmissionRequest,
    db: AsyncSession,
) -> SubmissionDTO:
    asg = await access.get_assignment_or_404(aid, db)
    await access.ensure_student(asg, user.id, db)

    # для группового — командное решение (group_id), для индивидуального — None
    group_id, sub = await access.resolve_submission_target(asg, user.id, db)
    attachment_url = str(body.attachment_url) if body.attachment_url is not None else None

    if sub is None:
        sub = await submission_repo.create(
            assignment_id=asg.id,
            student_id=user.id,
            answer_text=body.answer_text,
            attachment_url=attachment_url,
            db=db,
        )
        if group_id is not None:
            await group_repo.link_submission(sub.id, group_id, db)
        grade = None
    else:
        if sub.status in _LOCKED_STATUSES:
            raise ServiceError(
                "Решение уже отправлено. Попросите преподавателя вернуть на доработку.",
                409,
            )
        sub.answer_text = body.answer_text
        sub.attachment_url = attachment_url
        db.add(sub)
        grade = await grade_repo.get_by_submission(sub.id, db)

    await db.commit()
    await db.refresh(sub)
    student = await _author_of(sub, user, db)
    attachment_file = (
        await file_repo.get(sub.attachment_file_id, db) if sub.attachment_file_id else None
    )
    return _dto(sub, student, asg, grade, attachment_file, await _group_title(sub, db))


async def submit_my_submission(
    aid: int, user: UsersTable, db: AsyncSession
) -> SubmissionDTO:
    asg = await access.get_assignment_or_404(aid, db)
    await access.ensure_student(asg, user.id, db)

    _, sub = await access.resolve_submission_target(asg, user.id, db)
    if sub is None:
        raise ServiceError("Черновик решения не найден", 404)
    if sub.status in _LOCKED_STATUSES:
        raise ServiceError("Решение уже отправлено", 409)

    sub.status = SubmissionStatus.SUBMITTED
    sub.submitted_at = datetime.now(UTC)
    # После повторной отправки очищаем предыдущий комментарий на возврат.
    sub.return_comment = None
    db.add(sub)
    await db.commit()
    await db.refresh(sub)
    await notification_service.notify_submission_submitted(
        class_id=asg.class_id,
        assignment_id=asg.id,
        assignment_title=asg.title,
        student_id=user.id,
        db=db,
    )
    student = await _author_of(sub, user, db)
    grade = await grade_repo.get_by_submission(sub.id, db)
    attachment_file = (
        await file_repo.get(sub.attachment_file_id, db) if sub.attachment_file_id else None
    )
    return _dto(sub, student, asg, grade, attachment_file, await _group_title(sub, db))


async def get_my_submission(
    aid: int, user: UsersTable, db: AsyncSession
) -> SubmissionDTO | None:
    asg = await access.get_assignment_or_404(aid, db)
    await access.ensure_student(asg, user.id, db)

    _, sub = await access.resolve_submission_target(asg, user.id, db)
    if sub is None:
        return None
    student = await _author_of(sub, user, db)
    grade = await grade_repo.get_by_submission(sub.id, db)
    attachment_file = (
        await file_repo.get(sub.attachment_file_id, db) if sub.attachment_file_id else None
    )
    return _dto(sub, student, asg, grade, attachment_file, await _group_title(sub, db))


async def list_assignment_submissions(
    aid: int,
    status: SubmissionStatus | None,
    page: int,
    limit: int,
    offset: int,
    user: UsersTable,
    db: AsyncSession,
) -> PageDTO[SubmissionDTO]:
    asg = await access.get_assignment_or_404(aid, db)
    await access.ensure_teacher_or_creator(asg.class_id, user.id, db)

    rows = await submission_repo.list_for_assignment(asg.id, status, limit, offset, db)
    files = await file_repo.get_many(
        [sub.attachment_file_id for sub, _, _ in rows if sub.attachment_file_id],
        db,
    )
    # для группового задания подмешиваем название команды в каждую карточку
    group_titles = await group_repo.map_submission_group_titles(
        [sub.id for sub, _, _ in rows], db
    )
    total = await submission_repo.count_for_assignment(asg.id, status, db)
    return PageDTO[SubmissionDTO](
        items=[
            _dto(
                sub,
                student,
                asg,
                grade,
                files.get(sub.attachment_file_id),
                group_titles.get(sub.id),
            )
            for sub, student, grade in rows
        ],
        total=total,
        page=page,
        limit=limit,
    )


async def get_submission(
    sid: int, user: UsersTable, db: AsyncSession
) -> SubmissionDTO:
    row = await submission_repo.get_with_student_by_id(sid, db)
    if row is None:
        raise ServiceError("Решение не найдено", 404)
    sub, student, grade = row

    asg = await access.get_assignment_or_404(sub.assignment_id, db)
    if user.id != sub.student_id:
        await access.ensure_teacher_or_creator(asg.class_id, user.id, db)

    attachment_file = (
        await file_repo.get(sub.attachment_file_id, db) if sub.attachment_file_id else None
    )
    return _dto(sub, student, asg, grade, attachment_file, await _group_title(sub, db))


async def return_submission(
    sid: int,
    user: UsersTable,
    comment: str | None,
    db: AsyncSession,
) -> SubmissionDTO:
    row = await submission_repo.get_with_student_by_id(sid, db)
    if row is None:
        raise ServiceError("Решение не найдено", 404)
    sub, student, grade = row

    asg = await access.get_assignment_or_404(sub.assignment_id, db)
    await access.ensure_teacher_or_creator(asg.class_id, user.id, db)

    # для группового individual возврат допустим и из «передано на перераспределение»
    if sub.status not in {
        SubmissionStatus.SUBMITTED,
        SubmissionStatus.GRADED,
        SubmissionStatus.PENDING_REDISTRIBUTION,
    }:
        raise ServiceError("Возвратить можно только отправленное или оценённое решение", 409)

    sub.status = SubmissionStatus.RETURNED
    # После возврата студент дорабатывает заново, старая метка отправки больше неактуальна.
    sub.submitted_at = None
    sub.return_comment = comment.strip() if comment else None
    db.add(sub)

    # Возврат на доработку = решение переделывают, прежняя оценка больше не действует.
    # Снимаем её, иначе студент в списке заданий и gradebook видел бы устаревший балл
    # на решении, которое ещё дорабатывает.
    if grade is not None:
        await grade_repo.delete(grade, db)
        grade = None
    # У группового individual вместе с командной оценкой снимаем и распределение по членам.
    await member_grade_repo.delete_for_submission(sub.id, db)

    await db.commit()
    await db.refresh(sub)
    cls = await class_repo.get_by_id(asg.class_id, db)
    if cls is not None:
        await notification_service.notify_submission_returned(
            student_id=sub.student_id,
            class_id=asg.class_id,
            class_name=cls.name,
            assignment_id=asg.id,
            db=db,
        )
    attachment_file = (
        await file_repo.get(sub.attachment_file_id, db) if sub.attachment_file_id else None
    )
    return _dto(sub, student, asg, grade, attachment_file, await _group_title(sub, db))
