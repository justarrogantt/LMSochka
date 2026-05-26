from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.database.models import ClassRole, ClassType


class CreateClassRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    type: ClassType


class JoinByCodeRequest(BaseModel):
    code: str = Field(min_length=1, max_length=16)


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
    """Класс + роль текущего юзера в нём (для /my)."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    type: ClassType
    creator_id: int
    role: ClassRole
    joined_at: datetime
    students_count: int
    teachers_count: int


class ClassRoleDTO(BaseModel):
    class_id: int
    role: ClassRole


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


class PublicClassDTO(BaseModel):
    """Карточка в публичном каталоге открытых классов."""

    id: int
    name: str
    creator_id: int
    created_at: datetime
    students_count: int
    is_member: bool
