"""Общие DTO юзера для встраивания в другие сущности (автор объявления/задания и т.п.).

Полную карточку с created_at/updated_at смотри в auth_schemas.UserDTO.
"""

from pydantic import BaseModel, ConfigDict, EmailStr


class UserBriefDTO(BaseModel):
    """Минимум, который безопасно показывать любому участнику класса.
    Без пароля и служебных полей."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    first_name: str | None
    last_name: str | None
