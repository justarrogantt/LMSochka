from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import (
    AssignmentsTable,
    GradesTable,
    SubmissionsTable,
    SubmissionStatus,
    UsersTable,
)
from app.database.repositories import class_repo, grade_repo, submission_repo
from app.schemas.errors import ServiceError
from app.schemas.pagination import PageDTO
from app.schemas.submission_schemas import (
    SaveSubmissionRequest,
    SubmissionDTO,
    SubmissionGradeDTO,
)
from app.schemas.user_schemas import UserBriefDTO
from app.services import access, notification_service


def _is_late(submission: SubmissionsTable, assignment: AssignmentsTable) -> bool:
    if submission.submitted_at is None or assignment.due_at is None:
        return False
    return submission.submitted_at > assignment.due_at


def _dto(
    submission: SubmissionsTable,
    student: UsersTable,
    assignment: AssignmentsTable,
    grade: GradesTable | None,
) -> SubmissionDTO:
    return SubmissionDTO(
        id=submission.id,
        assignment_id=submission.assignment_id,
        student=UserBriefDTO.model_validate(student),
        answer_text=submission.answer_text,
        attachment_url=submission.attachment_url,
        status=submission.status,
        return_comment=submission.return_comment,
        submitted_at=submission.submitted_at,
        is_late=_is_late(submission, assignment),
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

    sub = await submission_repo.get_by_assignment_and_student(asg.id, user.id, db)
    attachment_url = str(body.attachment_url) if body.attachment_url is not None else None

    if sub is None:
        sub = await submission_repo.create(
            assignment_id=asg.id,
            student_id=user.id,
            answer_text=body.answer_text,
            attachment_url=attachment_url,
            db=db,
        )
        grade = None
    else:
        if sub.status in {SubmissionStatus.SUBMITTED, SubmissionStatus.GRADED}:
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
    return _dto(sub, user, asg, grade)


async def submit_my_submission(
    aid: int, user: UsersTable, db: AsyncSession
) -> SubmissionDTO:
    asg = await access.get_assignment_or_404(aid, db)
    await access.ensure_student(asg, user.id, db)

    sub = await submission_repo.get_by_assignment_and_student(asg.id, user.id, db)
    if sub is None:
        raise ServiceError("Черновик решения не найден", 404)
    if sub.status in {SubmissionStatus.SUBMITTED, SubmissionStatus.GRADED}:
        raise ServiceError("Решение уже отправлено", 409)

    sub.status = SubmissionStatus.SUBMITTED
    sub.submitted_at = datetime.now(UTC)
    # После повторной отправки очищаем предыдущий комментарий на возврат.
    sub.return_comment = None
    db.add(sub)
    await db.commit()
    await db.refresh(sub)
    grade = await grade_repo.get_by_submission(sub.id, db)
    return _dto(sub, user, asg, grade)


async def get_my_submission(
    aid: int, user: UsersTable, db: AsyncSession
) -> SubmissionDTO | None:
    asg = await access.get_assignment_or_404(aid, db)
    await access.ensure_student(asg, user.id, db)

    sub = await submission_repo.get_by_assignment_and_student(asg.id, user.id, db)
    if sub is None:
        return None
    grade = await grade_repo.get_by_submission(sub.id, db)
    return _dto(sub, user, asg, grade)


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
    total = await submission_repo.count_for_assignment(asg.id, status, db)
    return PageDTO[SubmissionDTO](
        items=[_dto(sub, student, asg, grade) for sub, student, grade in rows],
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

    return _dto(sub, student, asg, grade)


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

    if sub.status not in {SubmissionStatus.SUBMITTED, SubmissionStatus.GRADED}:
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
    return _dto(sub, student, asg, grade)
