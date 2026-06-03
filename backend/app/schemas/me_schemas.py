from pydantic import BaseModel

from app.database.models import ClassRole


class CourseGradesSummaryDTO(BaseModel):
    class_id: int
    class_name: str
    role: ClassRole
    average_percent: float | None
    graded_count: int
    assignments_count: int
    pending_count: int


class MyGradesOverviewDTO(BaseModel):
    courses: list[CourseGradesSummaryDTO]
