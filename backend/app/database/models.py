import enum
import uuid
from datetime import UTC, datetime

from sqlalchemy import BigInteger, Enum, Float, ForeignKey, String, Text, UniqueConstraint, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class UsersTable(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    # 254 — максимальная длина email по RFC 5321
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(72))  # bcrypt всегда 60, с запасом
    first_name: Mapped[str | None] = mapped_column(String(50))
    last_name: Mapped[str | None] = mapped_column(String(50))
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(onupdate=func.now())


class SessionsTable(Base):
    """Одна запись = одна пара (access, refresh) на одном устройстве. id = jti."""

    __tablename__ = "sessions"

    # id (он же jti в JWT) кладём в payload токена,
    # чтобы по нему находить сессию при проверке access и refresh
    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    # храним sha256, а не сам токен — если БД утечёт, использовать токены не получится
    refresh_token_hash: Mapped[str] = mapped_column(String(64))
    expires_at: Mapped[datetime]
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    # refresh_used — этот refresh уже обменяли на новый (rotation);
    # revoked — сессия отозвана через logout или при детекте кражи
    refresh_used: Mapped[bool] = mapped_column(default=False)
    revoked: Mapped[bool] = mapped_column(default=False)
    device_info: Mapped[str | None] = mapped_column(String(255))  # User-Agent для удобства


class ClassType(enum.Enum):
    OPEN = "open"
    CLOSED = "closed"


class ClassRole(enum.Enum):
    CREATOR = "creator"
    TEACHER = "teacher"
    STUDENT = "student"


class ClassesTable(Base):
    __tablename__ = "classes"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100))
    type: Mapped[ClassType] = mapped_column(Enum(ClassType))
    # код приглашения только у закрытых классов
    join_code: Mapped[str | None] = mapped_column(String(16), unique=True, index=True)
    # RESTRICT — нельзя удалить юзера, пока у него есть созданные классы
    creator_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT")
    )
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(onupdate=func.now())
    # soft delete: класс остаётся в БД (история заданий/оценок), но скрыт из всех выборок
    deleted_at: Mapped[datetime | None] = mapped_column(default=None)


class ClassMembersTable(Base):
    __tablename__ = "class_members"
    # один юзер не может вступить в один класс дважды
    __table_args__ = (UniqueConstraint("class_id", "user_id", name="uq_class_user"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    class_id: Mapped[int] = mapped_column(ForeignKey("classes.id", ondelete="CASCADE"))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    role: Mapped[ClassRole] = mapped_column(Enum(ClassRole))
    joined_at: Mapped[datetime] = mapped_column(server_default=func.now())
    # Дата перехода в роль student. Нужна как метаданные членства, задания не фильтрует.
    learning_started_at: Mapped[datetime | None] = mapped_column(default=None)
    # soft delete: запись остаётся в БД, чтобы оценки и сданные решения ушедшего
    # участника не потерялись (нужны для аудита и просмотра в gradebook)
    deleted_at: Mapped[datetime | None] = mapped_column(default=None)
    # Почему запись помечена deleted_at: 'left' (само-выход — юзер может вернуться)
    # или 'kicked' (creator выгнал — назад нельзя). NULL у активных участников.
    removal_reason: Mapped[str | None] = mapped_column(String(16), default=None)


class AnnouncementsTable(Base):
    __tablename__ = "announcements"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    # удалили класс — удаляем и его объявления, держать осиротевшие смысла нет
    class_id: Mapped[int] = mapped_column(ForeignKey("classes.id", ondelete="CASCADE"))
    # RESTRICT — пока автор не пересоздан/не очищен, юзера не удалить.
    # На уровне продукта пользователя физически не удаляем, так что норм.
    author_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT")
    )
    title: Mapped[str] = mapped_column(String(200))
    # Text без жёсткого лимита в БД, max_length 10000 валидируем в Pydantic
    content: Mapped[str] = mapped_column(Text)
    # прикреплённый файл объявления (как material_file у заданий)
    material_file_id: Mapped[str | None] = mapped_column(
        ForeignKey("stored_files.id", ondelete="SET NULL"), default=None
    )
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(onupdate=func.now())
    # soft delete: объявление пропадает из выдачи, но запись остаётся для истории
    deleted_at: Mapped[datetime | None] = mapped_column(default=None)


class GradingMode(enum.Enum):
    EVEN = "even"             # равномерное: командная оценка = оценка каждого члена
    INDIVIDUAL = "individual" # индивидуальное: студенты сами распределяют оценку


class AssignmentType(enum.Enum):
    REGULAR = "regular"
    QUIZ = "quiz"


class AssignmentsTable(Base):
    __tablename__ = "assignments"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    # удалили класс — задания тоже не нужны
    class_id: Mapped[int] = mapped_column(ForeignKey("classes.id", ondelete="CASCADE"))
    # RESTRICT: пока есть задания автора, его юзер-запись не удалить
    author_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT")
    )
    title: Mapped[str] = mapped_column(String(200))
    # description допускается пустым — задание может быть только в материале/файле
    description: Mapped[str] = mapped_column(Text, default="")
    # ссылка на материал (Drive/Notion/etc), валидируем как HttpUrl в Pydantic
    material_url: Mapped[str | None] = mapped_column(String(2048), default=None)
    material_file_id: Mapped[str | None] = mapped_column(
        ForeignKey("stored_files.id", ondelete="SET NULL"), default=None
    )
    # дедлайн опциональный — задание без срока тоже допустимо
    due_at: Mapped[datetime | None] = mapped_column(default=None)
    # максимальный балл, обязательно > 0; шкала фиксируется при создании.
    # Менять можно только пока нет ни одной оценки по заданию (см. сервис)
    max_grade: Mapped[float] = mapped_column(Float)
    type: Mapped[AssignmentType] = mapped_column(
        Enum(AssignmentType), default=AssignmentType.REGULAR
    )
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime | None] = mapped_column(onupdate=func.now())
    # soft delete: задание уходит из выдачи, но связанные решения и оценки
    # сохраняются в БД для аудита
    deleted_at: Mapped[datetime | None] = mapped_column(default=None)


class SubmissionStatus(enum.Enum):
    DRAFT = "draft"
    SUBMITTED = "submitted"
    RETURNED = "returned"
    GRADED = "graded"
    # групповое + individual: командная оценка выставлена, ждём раздачи баллов студентами
    PENDING_REDISTRIBUTION = "pending_redistribution"


class SubmissionsTable(Base):
    __tablename__ = "submissions"
    # Одно актуальное решение на пару (задание, студент). Историю попыток не храним.
    __table_args__ = (
        UniqueConstraint("assignment_id", "student_id", name="uq_submission_assignment_student"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    # удалили задание — его решения через API больше не нужны
    assignment_id: Mapped[int] = mapped_column(
        ForeignKey("assignments.id", ondelete="CASCADE")
    )
    # RESTRICT: пока есть решения студента, его user-запись не удаляем
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    answer_text: Mapped[str] = mapped_column(Text, default="")
    # ссылка на файл/документ с решением (Drive/Notion/etc)
    attachment_url: Mapped[str | None] = mapped_column(String(2048), default=None)
    attachment_file_id: Mapped[str | None] = mapped_column(
        ForeignKey("stored_files.id", ondelete="SET NULL"), default=None
    )
    status: Mapped[SubmissionStatus] = mapped_column(
        Enum(SubmissionStatus), default=SubmissionStatus.DRAFT
    )
    # Комментарий преподавателя при возврате на доработку.
    return_comment: Mapped[str | None] = mapped_column(Text, default=None)
    # проставляется в момент финальной отправки
    submitted_at: Mapped[datetime | None] = mapped_column(default=None)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(onupdate=func.now())


class GradesTable(Base):
    __tablename__ = "grades"
    # Одна оценка на одно решение. Обновления переписывают запись.
    __table_args__ = (UniqueConstraint("submission_id", name="uq_grade_submission"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    submission_id: Mapped[int] = mapped_column(
        ForeignKey("submissions.id", ondelete="CASCADE")
    )
    # RESTRICT: пока есть выставленные оценки, удалять юзера-оценщика нельзя
    graded_by_user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT")
    )
    value: Mapped[float] = mapped_column(Float)
    comment: Mapped[str | None] = mapped_column(Text, default=None)
    graded_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(onupdate=func.now())


# ── Групповые задания ──
# «Групповость» задания включается наличием строки в assignment_group_config.
# Индивидуальные задания этих таблиц не касаются — флоу не меняется.


class AssignmentGroupConfigTable(Base):
    """Признак и режим группового задания. Есть строка ⇔ задание групповое."""

    __tablename__ = "assignment_group_config"

    assignment_id: Mapped[int] = mapped_column(
        ForeignKey("assignments.id", ondelete="CASCADE"), primary_key=True
    )
    grading_mode: Mapped[GradingMode] = mapped_column(Enum(GradingMode))
    # общий лимит участников на команду (None — без ограничения)
    max_team_size: Mapped[int | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


class AssignmentGroupsTable(Base):
    """Команда конкретного задания."""

    __tablename__ = "assignment_groups"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    assignment_id: Mapped[int] = mapped_column(
        ForeignKey("assignments.id", ondelete="CASCADE")
    )
    title: Mapped[str] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


class AssignmentGroupMembersTable(Base):
    """Состав команд. Студент ровно в одной группе на задание."""

    __tablename__ = "assignment_group_members"
    __table_args__ = (
        UniqueConstraint("assignment_id", "user_id", name="uq_group_member_assignment_user"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    # assignment_id денормализован сюда ради UniqueConstraint «один студент — одна группа»
    assignment_id: Mapped[int] = mapped_column(
        ForeignKey("assignments.id", ondelete="CASCADE")
    )
    group_id: Mapped[int] = mapped_column(
        ForeignKey("assignment_groups.id", ondelete="CASCADE")
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


class SubmissionGroupTable(Base):
    """Связь решения с командой. Одно решение на группу, автор — любой её член."""

    __tablename__ = "submission_group"

    submission_id: Mapped[int] = mapped_column(
        ForeignKey("submissions.id", ondelete="CASCADE"), primary_key=True
    )
    group_id: Mapped[int] = mapped_column(
        ForeignKey("assignment_groups.id", ondelete="CASCADE")
    )


class SubmissionMemberGradesTable(Base):
    """Итоговые баллы по членам команды (только individual-режим)."""

    __tablename__ = "submission_member_grades"
    __table_args__ = (
        UniqueConstraint("submission_id", "user_id", name="uq_member_grade_submission_user"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    submission_id: Mapped[int] = mapped_column(
        ForeignKey("submissions.id", ondelete="CASCADE")
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    value: Mapped[float] = mapped_column(Float)  # 0 ≤ value ≤ max_grade
    updated_at: Mapped[datetime | None] = mapped_column(onupdate=func.now())


class QuestionType(enum.Enum):
    SINGLE_CHOICE = "single_choice"
    MULTIPLE_CHOICE = "multiple_choice"
    TEXT_INPUT = "text_input"


class QuestionStatus(enum.Enum):
    DRAFT = "draft"
    READY = "ready"


class QuestionBankQuestionTable(Base):
    __tablename__ = "question_bank_questions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    class_id: Mapped[int] = mapped_column(ForeignKey("classes.id", ondelete="CASCADE"))
    created_by_user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT")
    )
    title: Mapped[str] = mapped_column(String(200))
    question_text: Mapped[str] = mapped_column(Text)
    type: Mapped[QuestionType] = mapped_column(Enum(QuestionType))
    default_points: Mapped[float] = mapped_column(Float)
    explanation: Mapped[str | None] = mapped_column(Text, default=None)
    status: Mapped[QuestionStatus] = mapped_column(
        Enum(QuestionStatus), default=QuestionStatus.DRAFT
    )
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(onupdate=func.now())
    deleted_at: Mapped[datetime | None] = mapped_column(default=None)


class QuestionOptionTable(Base):
    __tablename__ = "question_options"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    question_id: Mapped[int] = mapped_column(
        ForeignKey("question_bank_questions.id", ondelete="CASCADE")
    )
    text: Mapped[str] = mapped_column(Text)
    is_correct: Mapped[bool] = mapped_column(default=False)
    position: Mapped[int] = mapped_column(default=1)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(onupdate=func.now())


class QuestionTextAnswerTable(Base):
    __tablename__ = "question_text_answers"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    question_id: Mapped[int] = mapped_column(
        ForeignKey("question_bank_questions.id", ondelete="CASCADE")
    )
    answer: Mapped[str] = mapped_column(Text)
    is_case_sensitive: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(onupdate=func.now())


class QuizAssignmentSettingsTable(Base):
    __tablename__ = "quiz_assignment_settings"

    assignment_id: Mapped[int] = mapped_column(
        ForeignKey("assignments.id", ondelete="CASCADE"), primary_key=True
    )
    shuffle_questions: Mapped[bool] = mapped_column(default=False)
    shuffle_options: Mapped[bool] = mapped_column(default=True)
    show_result_after_submit: Mapped[bool] = mapped_column(default=True)
    show_correct_answers_after_submit: Mapped[bool] = mapped_column(default=False)
    time_limit_minutes: Mapped[int | None] = mapped_column(default=None)
    attempts_limit: Mapped[int] = mapped_column(default=1)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(onupdate=func.now())


class QuizAssignmentQuestionTable(Base):
    __tablename__ = "quiz_assignment_questions"
    __table_args__ = (
        UniqueConstraint("assignment_id", "question_id", name="uq_quiz_assignment_question"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    assignment_id: Mapped[int] = mapped_column(
        ForeignKey("assignments.id", ondelete="CASCADE")
    )
    question_id: Mapped[int] = mapped_column(
        ForeignKey("question_bank_questions.id", ondelete="RESTRICT")
    )
    points: Mapped[float] = mapped_column(Float)
    position: Mapped[int] = mapped_column(default=1)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(onupdate=func.now())


class QuizAttemptStatus(enum.Enum):
    IN_PROGRESS = "in_progress"
    SUBMITTED = "submitted"


class QuizAttemptTable(Base):
    __tablename__ = "quiz_attempts"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    assignment_id: Mapped[int] = mapped_column(
        ForeignKey("assignments.id", ondelete="CASCADE")
    )
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    status: Mapped[QuizAttemptStatus] = mapped_column(
        Enum(QuizAttemptStatus), default=QuizAttemptStatus.IN_PROGRESS
    )
    started_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(UTC))
    submitted_at: Mapped[datetime | None] = mapped_column(default=None)
    score: Mapped[float | None] = mapped_column(Float, default=None)
    max_score: Mapped[float | None] = mapped_column(Float, default=None)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(onupdate=func.now())


class QuizAttemptAnswerTable(Base):
    __tablename__ = "quiz_attempt_answers"
    __table_args__ = (
        UniqueConstraint("attempt_id", "question_id", name="uq_quiz_attempt_answer"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    attempt_id: Mapped[int] = mapped_column(
        ForeignKey("quiz_attempts.id", ondelete="CASCADE")
    )
    question_id: Mapped[int] = mapped_column(
        ForeignKey("question_bank_questions.id", ondelete="RESTRICT")
    )
    selected_option_ids: Mapped[str | None] = mapped_column(Text, default=None)
    text_answer: Mapped[str | None] = mapped_column(Text, default=None)
    is_correct: Mapped[bool | None] = mapped_column(default=None)
    score: Mapped[float | None] = mapped_column(Float, default=None)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(onupdate=func.now())


class StoredFilesTable(Base):
    __tablename__ = "stored_files"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    storage_name: Mapped[str] = mapped_column(String(80), unique=True)
    original_name: Mapped[str] = mapped_column(String(255))
    content_type: Mapped[str] = mapped_column(String(127))
    size: Mapped[int] = mapped_column(BigInteger)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


class NotificationType(enum.Enum):
    ANNOUNCEMENT = "announcement"
    ASSIGNMENT = "assignment"
    GRADE = "grade"
    SUBMISSION_RETURNED = "submission_returned"
    SUBMISSION_SUBMITTED = "submission_submitted"
    # групповое + individual: членам команды нужно распределить командную оценку
    REDISTRIBUTION = "redistribution"


class NotificationsTable(Base):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    type: Mapped[NotificationType] = mapped_column(Enum(NotificationType))
    title: Mapped[str] = mapped_column(String(255))
    class_id: Mapped[int | None] = mapped_column(
        ForeignKey("classes.id", ondelete="CASCADE"),
        default=None,
    )
    entity_id: Mapped[int | None] = mapped_column(default=None)
    is_read: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
