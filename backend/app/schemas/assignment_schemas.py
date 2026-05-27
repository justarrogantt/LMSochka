from datetime import datetime

from pydantic import BaseModel, Field, HttpUrl, model_validator

from app.schemas.user_schemas import UserBriefDTO


class CreateAssignmentRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    # description можно оставить пустым — задание может жить только в material_url
    description: str = Field(default="", max_length=20000)
    # HttpUrl сам режет битые ссылки. В БД пишем str(url).
    material_url: HttpUrl | None = None
    # дедлайн опциональный — у длинных задач может не быть жёсткого срока
    due_at: datetime | None = None
    # шкала жёсткая: > 0. После выставления первой оценки менять max_grade нельзя
    max_grade: float = Field(gt=0)


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
        return self


class AssignmentDTO(BaseModel):
    id: int
    class_id: int
    author: UserBriefDTO
    title: str
    description: str
    material_url: str | None
    due_at: datetime | None
    max_grade: float
    created_at: datetime
    updated_at: datetime | None
