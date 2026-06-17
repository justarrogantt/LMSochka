from datetime import UTC, datetime
from enum import StrEnum

from pydantic import BaseModel, Field, HttpUrl, model_validator

from app.database.models import AssignmentType, GradingMode, SubmissionStatus
from app.schemas.file_schemas import FileDTO
from app.schemas.group_schemas import AssignmentGroupCreate, AssignmentGroupDTO
from app.schemas.pagination import PageDTO
from app.schemas.quiz_schemas import QuizAttemptBriefDTO, QuizSettingsDTO, QuizSettingsRequest
from app.schemas.user_schemas import UserBriefDTO


def _validate_due_at(due_at: datetime | None) -> datetime | None:
    if due_at is None:
        return None

    normalized = due_at if due_at.tzinfo is not None else due_at.replace(tzinfo=UTC)
    if normalized <= datetime.now(UTC):
        raise ValueError("Дедлайн не может быть в прошлом")

    return due_at


class CreateAssignmentRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    # description можно оставить пустым — задание может жить только в material_url
    description: str = Field(default="", max_length=20000)
    # HttpUrl сам режет битые ссылки. В БД пишем str(url).
    material_url: HttpUrl | None = None
    # дедлайн опциональный — у длинных задач может не быть жёсткого срока
    due_at: datetime | None = None
    # Для тестов max_grade считается автоматически как сумма баллов вопросов,
    # поэтому при создании допускаем 0. Для обычных заданий оставляем > 0.
    max_grade: float = Field(ge=0)
    type: AssignmentType = AssignmentType.REGULAR
    # отсутствует → индивидуальное задание; присутствует → групповое
    group: AssignmentGroupCreate | None = None
    quiz_settings: QuizSettingsRequest | None = None

    @model_validator(mode="after")
    def _validate_due_at_not_past(self) -> "CreateAssignmentRequest":
        _validate_due_at(self.due_at)
        if self.type == AssignmentType.QUIZ and self.quiz_settings is None:
            self.quiz_settings = QuizSettingsRequest()
        if self.type != AssignmentType.QUIZ and self.quiz_settings is not None:
            raise ValueError("quiz_settings доступны только для заданий типа quiz")
        if self.type != AssignmentType.QUIZ and self.max_grade <= 0:
            raise ValueError("max_grade должен быть больше 0")
        return self


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
        _validate_due_at(self.due_at)
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

    submitted_count — сколько студентов уже сдали (submitted/graded),
    pending_review_count — сколько решений сейчас ждут проверки (submitted),
    graded_count — сколько из них оценено (graded),
    returned_count — сколько решений возвращено на доработку (returned).
    students_total — активных студентов.
    """

    students_total: int
    submitted_count: int
    pending_review_count: int
    graded_count: int
    returned_count: int


class AssignmentReviewStatus(StrEnum):
    PENDING = "pending"


class AssignmentDTO(BaseModel):
    id: int
    class_id: int
    author: UserBriefDTO
    title: str
    description: str
    material_url: str | None
    material_file: FileDTO | None
    due_at: datetime | None
    max_grade: float
    type: AssignmentType = AssignmentType.REGULAR
    created_at: datetime
    updated_at: datetime | None
    can_edit: bool
    can_delete: bool
    # Заполняется только когда задание смотрит студент и у него есть решение.
    # У преподавателя/создателя — всегда null.
    my_submission: MySubmissionBriefDTO | None = None
    # Заполняется только для teacher/creator. У студента — всегда null.
    stats: AssignmentStatsDTO | None = None
    # Групповые поля. У индивидуальных заданий: is_group=False, остальное null.
    is_group: bool = False
    grading_mode: GradingMode | None = None
    # Команда текущего студента (только когда задание смотрит студент группового).
    my_group: AssignmentGroupDTO | None = None
    quiz_settings: QuizSettingsDTO | None = None
    quiz_question_count: int | None = None
    my_quiz_attempt: QuizAttemptBriefDTO | None = None


class AssignmentPageDTO(PageDTO[AssignmentDTO]):
    # Сколько заданий по курсу имеют хотя бы одно submitted-решение.
    # Нужен для вкладки "На проверке (N)".
    pending_review_total: int
