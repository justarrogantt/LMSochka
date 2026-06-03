from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import ClassRole, UsersTable
from app.database.repositories import class_repo, me_repo
from app.schemas.me_schemas import CourseGradesSummaryDTO, MyGradesOverviewDTO


async def get_my_grades_overview(
    user: UsersTable, db: AsyncSession
) -> MyGradesOverviewDTO:
    rows = await class_repo.list_for_user(user.id, db)
    class_ids = [cls.id for cls, _ in rows]

    assignment_counts = await me_repo.count_assignments_for_classes(class_ids, db)
    active_student_counts = await class_repo.count_active_students_for_classes(class_ids, db)
    student_stats = await me_repo.student_graded_stats_for_classes(class_ids, user.id, db)
    teacher_stats = await me_repo.teacher_graded_stats_for_classes(class_ids, db)

    courses: list[CourseGradesSummaryDTO] = []
    for cls, member in rows:
        assignments_total = assignment_counts.get(cls.id, 0)

        if member.role == ClassRole.STUDENT:
            graded_count, average_percent = student_stats.get(cls.id, (0, None))
            assignments_count = assignments_total
        else:
            graded_count, average_percent = teacher_stats.get(cls.id, (0, None))
            assignments_count = assignments_total * active_student_counts.get(cls.id, 0)

        pending_count = max(assignments_count - graded_count, 0)
        courses.append(
            CourseGradesSummaryDTO(
                class_id=cls.id,
                class_name=cls.name,
                role=member.role,
                average_percent=average_percent,
                graded_count=graded_count,
                assignments_count=assignments_count,
                pending_count=pending_count,
            )
        )

    return MyGradesOverviewDTO(courses=courses)
