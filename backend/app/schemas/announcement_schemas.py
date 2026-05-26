from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator


class CreateAnnouncementRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    content: str = Field(min_length=1, max_length=10000)


class UpdateAnnouncementRequest(BaseModel):
    """PATCH: оба поля опциональны, но хотя бы одно должно прийти."""

    title: str | None = Field(default=None, min_length=1, max_length=200)
    content: str | None = Field(default=None, min_length=1, max_length=10000)

    @model_validator(mode="after")
    def _at_least_one(self) -> "UpdateAnnouncementRequest":
        # пустой PATCH бессмысленен и часто означает баг на фронте — отбиваем 422
        if self.title is None and self.content is None:
            raise ValueError("Нужно передать хотя бы одно поле: title или content")
        return self


class AuthorDTO(BaseModel):
    """Краткая карточка автора для встраивания в DTO. Не отдаём пароль/служебные поля."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    first_name: str | None
    last_name: str | None


class AnnouncementDTO(BaseModel):
    id: int
    class_id: int
    author: AuthorDTO
    title: str
    content: str
    created_at: datetime
    updated_at: datetime | None
