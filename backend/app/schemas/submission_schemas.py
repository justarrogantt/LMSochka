from datetime import datetime

from pydantic import BaseModel, Field, HttpUrl

from app.database.models import SubmissionStatus
from app.schemas.user_schemas import UserBriefDTO


class SaveSubmissionRequest(BaseModel):
    # Пустой текст допустим: часть студентов сдают только ссылкой/файлом.
    answer_text: str = Field(default="", max_length=20000)
    attachment_url: HttpUrl | None = None


class ReturnSubmissionRequest(BaseModel):
    # Комментарий пока не храним отдельным полем в submissions.
    # Поле оставляем в контракте, чтобы не ломать фронт до модуля grades.
    comment: str | None = Field(default=None, max_length=2000)


class SubmissionGradeDTO(BaseModel):
    value: float
    comment: str | None
    graded_at: datetime


class SubmissionDTO(BaseModel):
    id: int
    assignment_id: int
    student: UserBriefDTO
    answer_text: str
    attachment_url: str | None
    status: SubmissionStatus
    submitted_at: datetime | None
    is_late: bool
    grade: SubmissionGradeDTO | None = None
    created_at: datetime
    updated_at: datetime | None
