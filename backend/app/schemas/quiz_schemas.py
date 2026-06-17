from datetime import datetime

from pydantic import BaseModel, Field, model_validator

from app.database.models import AssignmentType, QuizAttemptStatus
from app.schemas.question_schemas import StudentQuestionOptionDTO


class QuizSettingsRequest(BaseModel):
    shuffle_questions: bool = False
    shuffle_options: bool = True
    show_result_after_submit: bool = True
    show_correct_answers_after_submit: bool = False
    time_limit_minutes: int | None = Field(default=None, ge=1)
    attempts_limit: int = Field(default=1, ge=1)


class QuizSettingsDTO(BaseModel):
    shuffle_questions: bool
    shuffle_options: bool
    show_result_after_submit: bool
    show_correct_answers_after_submit: bool
    time_limit_minutes: int | None
    attempts_limit: int


class QuizAttemptBriefDTO(BaseModel):
    attempt_id: int
    status: QuizAttemptStatus
    started_at: datetime
    submitted_at: datetime | None
    score: float | None
    max_score: float | None
    # Сколько попыток студент уже израсходовал (включая текущую/завершённые).
    attempts_used: int = 0


class AddQuestionToQuizRequest(BaseModel):
    question_id: int = Field(ge=1)
    points: float = Field(gt=0)
    position: int = Field(ge=1)


class UpdateQuizQuestionRequest(BaseModel):
    points: float | None = Field(default=None, gt=0)
    position: int | None = Field(default=None, ge=1)

    @model_validator(mode="after")
    def _not_empty(self) -> "UpdateQuizQuestionRequest":
        if not self.model_fields_set:
            raise ValueError("Передайте хотя бы одно поле для обновления")
        return self


class QuizQuestionTeacherDTO(BaseModel):
    id: int
    question_id: int
    title: str
    type: str
    question_text: str
    points: float
    position: int
    options: list[dict]
    text_answers: list[dict]
    explanation: str | None


class QuizQuestionForStudentDTO(BaseModel):
    id: int
    question_id: int
    type: str
    question_text: str
    points: float
    options: list[StudentQuestionOptionDTO] = Field(default_factory=list)


class QuizAssignmentDetailsResponse(BaseModel):
    assignment_id: int
    type: AssignmentType
    settings: QuizSettingsDTO
    questions: list[QuizQuestionTeacherDTO]


class StartQuizAttemptResponse(BaseModel):
    attempt_id: int
    assignment_id: int
    status: QuizAttemptStatus
    started_at: datetime
    questions: list[QuizQuestionForStudentDTO]


class SaveQuizAnswerRequest(BaseModel):
    selected_option_ids: list[int] | None = None
    text_answer: str | None = None


class QuizAttemptAnswerResultDTO(BaseModel):
    question_id: int
    is_correct: bool | None
    score: float | None
    selected_option_ids: list[int] | None = None
    text_answer: str | None = None
    correct_option_ids: list[int] | None = None
    correct_text_answers: list[str] | None = None
    explanation: str | None = None


class SubmitQuizAttemptResponse(BaseModel):
    attempt_id: int
    status: QuizAttemptStatus
    score: float
    max_score: float
    submitted_at: datetime
    answers: list[QuizAttemptAnswerResultDTO]


class QuizAttemptResultResponse(BaseModel):
    attempt_id: int
    assignment_id: int
    status: QuizAttemptStatus
    score: float | None = None
    max_score: float | None = None
    submitted_at: datetime | None = None
    answers: list[QuizAttemptAnswerResultDTO] = Field(default_factory=list)
