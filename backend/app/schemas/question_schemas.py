from datetime import datetime

from pydantic import BaseModel, Field, model_validator

from app.database.models import QuestionStatus, QuestionType
from app.schemas.pagination import PageDTO


class QuestionOptionRequest(BaseModel):
    text: str = Field(min_length=1, max_length=5000)
    is_correct: bool = False
    position: int = Field(ge=1)


class QuestionTextAnswerRequest(BaseModel):
    answer: str = Field(min_length=1, max_length=5000)
    is_case_sensitive: bool = False


class CreateQuestionRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    question_text: str = Field(min_length=1, max_length=20000)
    type: QuestionType
    default_points: float = Field(gt=0)
    explanation: str | None = Field(default=None, max_length=20000)
    status: QuestionStatus = QuestionStatus.DRAFT
    options: list[QuestionOptionRequest] = Field(default_factory=list)
    text_answers: list[QuestionTextAnswerRequest] = Field(default_factory=list)

    @model_validator(mode="after")
    def _validate_by_type(self) -> "CreateQuestionRequest":
        _validate_question_payload(
            question_type=self.type,
            options=self.options,
            text_answers=self.text_answers,
        )
        return self


class UpdateQuestionRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    question_text: str | None = Field(default=None, min_length=1, max_length=20000)
    type: QuestionType | None = None
    default_points: float | None = Field(default=None, gt=0)
    explanation: str | None = Field(default=None, max_length=20000)
    status: QuestionStatus | None = None
    options: list[QuestionOptionRequest] | None = None
    text_answers: list[QuestionTextAnswerRequest] | None = None

    @model_validator(mode="after")
    def _not_empty(self) -> "UpdateQuestionRequest":
        if not self.model_fields_set:
            raise ValueError("Передайте хотя бы одно поле для обновления")
        return self


class QuestionOptionDTO(BaseModel):
    id: int
    text: str
    is_correct: bool
    position: int


class StudentQuestionOptionDTO(BaseModel):
    id: int
    text: str
    position: int


class QuestionTextAnswerDTO(BaseModel):
    id: int
    answer: str
    is_case_sensitive: bool


class QuestionResponseForTeacher(BaseModel):
    id: int
    class_id: int
    created_by_user_id: int
    title: str
    question_text: str
    type: QuestionType
    default_points: float
    explanation: str | None
    status: QuestionStatus
    options: list[QuestionOptionDTO]
    text_answers: list[QuestionTextAnswerDTO]
    created_at: datetime
    updated_at: datetime | None


class QuestionListItemDTO(BaseModel):
    id: int
    title: str
    question_text: str
    type: QuestionType
    default_points: float
    status: QuestionStatus
    options_count: int
    created_at: datetime


class QuestionPageDTO(PageDTO[QuestionListItemDTO]):
    pass


def _validate_question_payload(
    *,
    question_type: QuestionType,
    options: list[QuestionOptionRequest] | None,
    text_answers: list[QuestionTextAnswerRequest] | None,
) -> None:
    normalized_options = options or []
    normalized_text_answers = text_answers or []

    if question_type == QuestionType.TEXT_INPUT:
        if not normalized_text_answers:
            raise ValueError("Для text_input нужен хотя бы один правильный ответ")
        return

    if len(normalized_options) < 2:
        raise ValueError("Для вариантов ответа нужно минимум два варианта")

    correct_count = sum(1 for option in normalized_options if option.is_correct)
    if question_type == QuestionType.SINGLE_CHOICE and correct_count != 1:
        raise ValueError("Для single_choice нужен ровно один правильный вариант")
    if question_type == QuestionType.MULTIPLE_CHOICE and correct_count < 1:
        raise ValueError("Для multiple_choice нужен хотя бы один правильный вариант")
