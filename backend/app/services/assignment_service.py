from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import (
    AssignmentsTable,
    ClassMembersTable,
    ClassRole,
    GradesTable,
    SubmissionsTable,
    UsersTable,
)
from app.database.repositories import (
    assignment_repo,
    class_repo,
    grade_repo,
    submission_repo,
)
from app.schemas.assignment_schemas import (
    AssignmentDTO,
    AssignmentPageDTO,
    AssignmentReviewStatus,
    AssignmentStatsDTO,
    MySubmissionBriefDTO,
    UpdateAssignmentRequest,
)
from app.schemas.errors import ServiceError
from app.schemas.user_schemas import UserBriefDTO
from app.services import notification_service
from app.services.submission_service import _is_late


def _my_submission_dto(
    sub: SubmissionsTable, grade: GradesTable | None, asg: AssignmentsTable
) -> MySubmissionBriefDTO:
    return MySubmissionBriefDTO(
        submission_id=sub.id,
        status=sub.status,
        submitted_at=sub.submitted_at,
        is_late=_is_late(sub, asg),
        grade=grade.value if grade is not None else None,
    )


def _dto(
    asg: AssignmentsTable,
    author: UsersTable,
    *,
    can_edit: bool,
    can_delete: bool,
    my_submission: MySubmissionBriefDTO | None = None,
    stats: AssignmentStatsDTO | None = None,
) -> AssignmentDTO:
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
        can_edit=can_edit,
        can_delete=can_delete,
        my_submission=my_submission,
        stats=stats,
    )


async def create_assignment(
    class_id: int,
    class_name: str,
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
    await notification_service.notify_assignment_created(
        class_id=class_id,
        assignment_id=asg.id,
        class_name=class_name,
        db=db,
    )
    # создаёт только teacher/creator — сразу отдаём пустую сводку прогресса,
    # чтобы карточка на фронте была того же формата, что и в списке
    counts = await class_repo.count_by_role(class_id, db)
    stats = AssignmentStatsDTO(
        students_total=counts[ClassRole.STUDENT],
        submitted_count=0,
        pending_review_count=0,
        graded_count=0,
        returned_count=0,
    )
    return _dto(asg, author, can_edit=True, can_delete=True, stats=stats)


async def list_assignments(
    class_id: int,
    member: ClassMembersTable,
    page: int,
    limit: int,
    offset: int,
    review_status: AssignmentReviewStatus | None,
    db: AsyncSession,
) -> AssignmentPageDTO:
    only_pending_review = review_status == AssignmentReviewStatus.PENDING
    if only_pending_review and member.role == ClassRole.STUDENT:
        raise ServiceError(
            "Фильтр review_status=pending доступен только teacher/creator",
            403,
        )

    rows = await assignment_repo.list_for_class(
        class_id,
        limit,
        offset,
        only_pending_review=only_pending_review,
        learning_started_at=(
            member.learning_started_at if member.role == ClassRole.STUDENT else None
        ),
        db=db,
    )
    total = await assignment_repo.count_for_class(
        class_id,
        only_pending_review=only_pending_review,
        learning_started_at=(
            member.learning_started_at if member.role == ClassRole.STUDENT else None
        ),
        db=db,
    )
    aids = [a.id for a, _ in rows]

    if member.role == ClassRole.STUDENT:
        # студент видит свой статус по каждому заданию (один запрос на всю страницу)
        my_subs = await submission_repo.map_student_submissions_for_assignments(
            aids, member.user_id, db
        )
        items = [
            _dto(
                a,
                u,
                can_edit=False,
                can_delete=False,
                my_submission=(
                    _my_submission_dto(*my_subs[a.id], a)
                    if a.id in my_subs
                    else None
                ),
            )
            for a, u in rows
        ]
        pending_review_total = 0
    else:
        # teacher/creator видят прогресс сдачи (групповой запрос + один на counts)
        stats_map = await submission_repo.stats_for_assignments(aids, db)
        eligible_counts = await class_repo.count_eligible_students_for_assignments(
            aids, db
        )
        items = [
            _dto(
                a,
                u,
                can_edit=member.role == ClassRole.CREATOR or a.author_id == member.user_id,
                can_delete=member.role == ClassRole.CREATOR or a.author_id == member.user_id,
                stats=_stats_for(a.id, stats_map, eligible_counts.get(a.id, 0)),
            )
            for a, u in rows
        ]
        pending_review_total = await assignment_repo.count_pending_review_for_class(
            class_id, db
        )

    return AssignmentPageDTO(
        items=items,
        total=total,
        page=page,
        limit=limit,
        pending_review_total=pending_review_total,
    )


def _stats_for(
    aid: int, stats_map: dict[int, tuple[int, int, int, int]], students_total: int
) -> AssignmentStatsDTO:
    submitted, graded, pending_review, returned = stats_map.get(aid, (0, 0, 0, 0))
    return AssignmentStatsDTO(
        students_total=students_total,
        submitted_count=submitted,
        pending_review_count=pending_review,
        graded_count=graded,
        returned_count=returned,
    )


async def get_assignment(
    class_id: int, aid: int, member: ClassMembersTable, db: AsyncSession
) -> AssignmentDTO:
    row = await assignment_repo.get_with_author(aid, class_id, db)
    if row is None:
        raise ServiceError("Задание не найдено", 404)
    asg, author = row

    if member.role == ClassRole.STUDENT:
        if (
            member.learning_started_at is None
            or asg.created_at < member.learning_started_at
        ):
            raise ServiceError("Задание не найдено", 404)
        sub = await submission_repo.get_by_assignment_and_student(
            asg.id, member.user_id, db
        )
        my_submission = None
        if sub is not None:
            grade = await grade_repo.get_by_submission(sub.id, db)
            my_submission = _my_submission_dto(sub, grade, asg)
        return _dto(
            asg,
            author,
            can_edit=False,
            can_delete=False,
            my_submission=my_submission,
        )

    stats_map = await submission_repo.stats_for_assignments([asg.id], db)
    eligible_counts = await class_repo.count_eligible_students_for_assignments(
        [asg.id], db
    )
    return _dto(
        asg,
        author,
        can_edit=member.role == ClassRole.CREATOR or asg.author_id == member.user_id,
        can_delete=member.role == ClassRole.CREATOR or asg.author_id == member.user_id,
        stats=_stats_for(asg.id, stats_map, eligible_counts.get(asg.id, 0)),
    )


async def update_assignment(
    class_id: int,
    aid: int,
    user: UsersTable,
    member: ClassMembersTable,
    body: UpdateAssignmentRequest,
    db: AsyncSession,
) -> AssignmentDTO:
    row = await assignment_repo.get_with_author(aid, class_id, db)
    if row is None:
        raise ServiceError("Задание не найдено", 404)
    asg, author = row
    if member.role != ClassRole.CREATOR and asg.author_id != user.id:
        raise ServiceError("Редактировать может только автор или создатель класса", 403)

    # Различаем "поле не передали" от "передали null" по model_fields_set.
    # Для material_url и due_at null значит «сбросить», для остальных — игнор.
    fields_set = body.model_fields_set
    material_url_provided = "material_url" in fields_set
    due_at_provided = "due_at" in fields_set

    if body.max_grade is not None and body.max_grade != asg.max_grade:
        has_grades = await grade_repo.has_any_for_assignment(asg.id, db)
        if has_grades:
            raise ServiceError(
                "Нельзя менять max_grade: по этому заданию уже выставлены оценки",
                422,
            )

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
    return _dto(asg, author, can_edit=True, can_delete=True)


async def delete_assignment(
    class_id: int,
    aid: int,
    user: UsersTable,
    member: ClassMembersTable,
    db: AsyncSession,
) -> None:
    asg = await assignment_repo.get_by_id(aid, class_id, db)
    if asg is None:
        raise ServiceError("Задание не найдено", 404)
    if member.role != ClassRole.CREATOR and asg.author_id != user.id:
        raise ServiceError("Удалять может только автор или создатель класса", 403)
    # Решения и оценки остаются в БД для аудита, но из API уходят: все запросы
    # к решениям джойнятся с assignments через _ASSIGNMENT_ACTIVE, поэтому
    # /my-submission и /submissions для удалённого задания дают 404.
    await assignment_repo.soft_delete(asg, db)
