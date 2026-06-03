from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.database.models import NotificationType
from app.schemas.pagination import PageDTO


class NotificationDTO(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    type: NotificationType
    title: str
    class_id: int | None
    entity_id: int | None
    is_read: bool
    created_at: datetime


class NotificationPageDTO(PageDTO[NotificationDTO]):
    unread_count: int


class ReadAllNotificationsResponseDTO(BaseModel):
    updated_count: int
    unread_count: int
