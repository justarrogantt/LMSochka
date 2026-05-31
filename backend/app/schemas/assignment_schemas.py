from datetime import datetime

from pydantic import BaseModel, Field, HttpUrl, model_validator

from app.database.models import SubmissionStatus
from app.schemas.user_schemas import UserBriefDTO


class CreateAssignmentRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    # description можно оставить пустым — задание может жить только в material_url
    description: str = Field(default="", max_length=20000)
    # HttpUrl сам режет битые ссылки. В БД пишем str(url).
    material_url: HttpUrl | None = None
    # дедлайн опциональный — у длинных задач может не быть жёсткого срока
    due_at: datetime | None = None
    # шкала жёсткая: > 0. После выставления первой оценки менять max_grade нельзя
    max_grade: float = Field(gt=0)


class UpdateAssignmentRequest(BaseModel):
    """PATCH: любое подмножество полей.

    `material_url` и `due_at` можно сбросить, передав `null` — для остальных
    полей null трактуется как «не менять».
    """

    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=20000)
    material_url: HttpUrl | None = None
    due_at: datetime | None = None
    max_grade: float | None = Field(default=None, gt=0)

    @model_validator(mode="after")
    def _not_empty(self) -> "UpdateAssignmentRequest":
        # пустой PATCH — почти всегда баг на фронте, отбиваем 422
        if not self.model_fields_set:
            raise ValueError("Передайте хотя бы одно поле для обновления")
        return self


class MySubmissionBriefDTO(BaseModel):
    """Краткая сводка решения текущего студента для карточки задания в списке.

    Позволяет фронту нарисовать бейдж (Сдано / Возвращено / Оценено N/M /
    Просрочено) без отдельного GET /my-submission по каждому заданию.
    """

    submission_id: int
    status: SubmissionStatus
    submitted_at: datetime | None
    is_late: bool
    grade: float | None


class AssignmentStatsDTO(BaseModel):
    """Сводка по заданию для преподавателя: прогресс сдачи по активным студентам.

    submitted_count — сколько студентов уже сдали (статус submitted/graded),
    graded_count — сколько из них оценено. students_total — активных студентов.
    """

    students_total: int
    submitted_count: int
    graded_count: int


class AssignmentDTO(BaseModel):
    id: int
    class_id: int
    author: UserBriefDTO
    title: str
    description: str
    material_url: str | None
    due_at: datetime | None
    max_grade: float
    created_at: datetime
    updated_at: datetime | None
    # Заполняется только когда задание смотрит студент и у него есть решение.
    # У преподавателя/создателя — всегда null.
    my_submission: MySubmissionBriefDTO | None = None
    # Заполняется только для teacher/creator. У студента — всегда null.
    stats: AssignmentStatsDTO | None = None
