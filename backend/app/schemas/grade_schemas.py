from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.user_schemas import UserBriefDTO


class UpsertGradeRequest(BaseModel):
    value: float = Field(ge=0)
    comment: str | None = Field(default=None, max_length=2000)


class GradeDTO(BaseModel):
    submission_id: int
    value: float
    comment: str | None
    graded_by: UserBriefDTO
    graded_at: datetime
    updated_at: datetime | None
