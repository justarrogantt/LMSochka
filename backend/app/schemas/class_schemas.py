from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.database.models import ClassRole, ClassType


class CreateClassRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    type: ClassType


class JoinByCodeRequest(BaseModel):
    code: str = Field(min_length=1, max_length=16)


class ClassDTO(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    type: ClassType
    join_code: str | None
    creator_id: int
    created_at: datetime


class MyClassDTO(BaseModel):
    """Класс + роль текущего юзера в нём."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    type: ClassType
    creator_id: int
    role: ClassRole
    joined_at: datetime


class ClassRoleDTO(BaseModel):
    class_id: int
    role: ClassRole
