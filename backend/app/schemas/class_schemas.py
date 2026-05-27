from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.database.models import ClassRole, ClassType


class CreateClassRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    type: ClassType


class UpdateClassRequest(BaseModel):
    """Все поля опциональны — PATCH-семантика."""

    name: str | None = Field(default=None, min_length=1, max_length=100)
    type: ClassType | None = None


class JoinByCodeRequest(BaseModel):
    code: str = Field(min_length=1, max_length=16)


class UpdateMemberRoleRequest(BaseModel):
    """Назначение новой роли участнику. Создателя назначать нельзя — он один на класс."""

    role: ClassRole

    @field_validator("role")
    @classmethod
    def _no_creator(cls, v: ClassRole) -> ClassRole:
        if v == ClassRole.CREATOR:
            raise ValueError("Назначить роль creator нельзя — она привязана к автору класса")
        return v


class ClassDTO(BaseModel):
    """Базовая карточка класса — отдаём, например, при создании."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    type: ClassType
    join_code: str | None
    creator_id: int
    created_at: datetime


class MyClassDTO(BaseModel):
    """Класс + роль текущего юзера в нём.

    Этот же DTO возвращают mutation-ручки (POST /classes, /join, /join-open),
    чтобы фронт мог сразу обновить список «Мои курсы» без отдельного GET /my.
    """

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    type: ClassType
    creator_id: int
    role: ClassRole
    joined_at: datetime
    students_count: int
    teachers_count: int
    # join_code отдаём только тем, у кого есть can_manage_members (creator).
    # Для student/teacher всегда None, чтобы код не разлетался по ученикам.
    join_code: str | None = None


class ClassRoleDTO(BaseModel):
    class_id: int
    role: ClassRole


class LeaveClassResponseDTO(BaseModel):
    """Ответ на POST /classes/{id}/leave. Возвращаем именно `class_id`+`status`,
    чтобы фронт мог сразу удалить карточку из локального списка."""

    class_id: int
    status: str = "left"


class ClassDetailDTO(BaseModel):
    """Полная страница класса: всё что нужно фронту чтобы отрисовать UI."""

    id: int
    name: str
    type: ClassType
    # join_code отдаём только если у юзера есть can_manage_members (см. сервис)
    join_code: str | None
    creator_id: int
    created_at: datetime
    user_role: ClassRole
    permissions: dict[str, bool]
    students_count: int
    teachers_count: int


class ClassMemberDTO(BaseModel):
    """Запись участника класса для /members."""

    user_id: int
    email: EmailStr
    first_name: str | None
    last_name: str | None
    role: ClassRole
    joined_at: datetime
    # пока всегда True (в обычных списках видим только активных). Появится false,
    # когда gradebook начнёт показывать ушедших студентов с их прошлыми оценками
    is_active: bool = True


class ClassMembersDTO(BaseModel):
    """Полная секция «Участники» — список + счётчики ролей.

    Используется как ответ на PATCH/DELETE по /members, чтобы фронт мог
    атомарно обновить весь блок: и список карточек, и цифры в шапке класса.
    """

    items: list[ClassMemberDTO]
    students_count: int
    teachers_count: int


class PublicClassDTO(BaseModel):
    """Карточка в публичном каталоге открытых классов."""

    id: int
    name: str
    creator_id: int
    created_at: datetime
    students_count: int
    is_member: bool
