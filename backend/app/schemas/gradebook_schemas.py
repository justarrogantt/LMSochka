from datetime import datetime

from pydantic import BaseModel, EmailStr

from app.database.models import SubmissionStatus


class GradebookAssignmentDTO(BaseModel):
    id: int
    title: str
    max_grade: float
    due_at: datetime | None


class GradebookStudentDTO(BaseModel):
    id: int
    email: EmailStr
    first_name: str | None
    last_name: str | None
    is_active: bool
    summary: "GradebookStudentSummaryDTO"


class GradebookStudentSummaryDTO(BaseModel):
    average_percent: float | None
    graded_count: int
    submitted_count: int
    pending_review_count: int
    total_assignments: int


class GradebookCellDTO(BaseModel):
    student_id: int
    assignment_id: int
    status: SubmissionStatus
    value: float | None
    percent: float | None
    is_late: bool
    submitted_at: datetime | None


class GradebookDTO(BaseModel):
    assignments: list[GradebookAssignmentDTO]
    students: list[GradebookStudentDTO]
    cells: list[GradebookCellDTO]
