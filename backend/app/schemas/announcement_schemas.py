from datetime import datetime

from pydantic import BaseModel, Field, model_validator

from app.schemas.file_schemas import FileDTO
from app.schemas.user_schemas import UserBriefDTO


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


class AnnouncementDTO(BaseModel):
    id: int
    class_id: int
    author: UserBriefDTO
    title: str
    content: str
    material_file: FileDTO | None = None
    created_at: datetime
    updated_at: datetime | None
    can_edit: bool
    can_delete: bool
