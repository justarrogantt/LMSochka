import asyncio

from fastapi import WebSocket
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import (
    ClassRole,
    NotificationsTable,
    NotificationType,
)
from app.database.repositories import class_repo, notification_repo
from app.schemas.errors import ServiceError
from app.schemas.notification_schemas import (
    NotificationDTO,
    NotificationPageDTO,
    ReadAllNotificationsResponseDTO,
)


class NotificationConnectionManager:
    def __init__(self) -> None:
        self._connections: dict[int, set[WebSocket]] = {}
        self._lock = asyncio.Lock()

    async def connect(self, user_id: int, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._connections.setdefault(user_id, set()).add(websocket)

    async def disconnect(self, user_id: int, websocket: WebSocket) -> None:
        async with self._lock:
            sockets = self._connections.get(user_id)
            if not sockets:
                return
            sockets.discard(websocket)
            if not sockets:
                self._connections.pop(user_id, None)

    async def send(self, user_id: int, notification: NotificationDTO) -> None:
        async with self._lock:
            sockets = list(self._connections.get(user_id, set()))

        dead_sockets: list[WebSocket] = []
        payload = notification.model_dump(mode="json")
        for websocket in sockets:
            try:
                await websocket.send_json(payload)
            except Exception:
                dead_sockets.append(websocket)

        for websocket in dead_sockets:
            await self.disconnect(user_id, websocket)


ws_manager = NotificationConnectionManager()

# Сколько последних уведомлений храним на пользователя, чтобы лента не росла бесконечно
NOTIFICATIONS_KEEP_PER_USER = 50


def _dto(notification: NotificationsTable) -> NotificationDTO:
    return NotificationDTO.model_validate(notification)


def _format_score(value: float) -> str:
    if value.is_integer():
        return str(int(value))
    return f"{value:.2f}".rstrip("0").rstrip(".")


async def _create_and_send_many(
    *,
    user_ids: list[int],
    notification_type: NotificationType,
    title: str,
    class_id: int | None,
    entity_id: int | None,
    db: AsyncSession,
) -> list[NotificationDTO]:
    if not user_ids:
        return []

    notifications = [
        NotificationsTable(
            user_id=user_id,
            type=notification_type,
            title=title,
            class_id=class_id,
            entity_id=entity_id,
        )
        for user_id in user_ids
    ]
    saved = await notification_repo.create_many(notifications, db)
    # подрезаем старые, чтобы у пользователя оставались только последние N
    await notification_repo.trim_for_users(user_ids, NOTIFICATIONS_KEEP_PER_USER, db)
    dtos = [_dto(notification) for notification in saved]
    for notification, dto in zip(saved, dtos, strict=False):
        await ws_manager.send(notification.user_id, dto)
    return dtos


async def notify_announcement_created(
    *,
    class_id: int,
    announcement_id: int,
    author_id: int,
    class_name: str,
    db: AsyncSession,
) -> None:
    user_ids = await class_repo.list_member_user_ids(
        class_id,
        roles=None,
        exclude_user_id=author_id,
        include_inactive=False,
        db=db,
    )
    await _create_and_send_many(
        user_ids=user_ids,
        notification_type=NotificationType.ANNOUNCEMENT,
        title=f"Новое объявление в курсе «{class_name}»",
        class_id=class_id,
        entity_id=announcement_id,
        db=db,
    )


async def notify_assignment_created(
    *,
    class_id: int,
    assignment_id: int,
    class_name: str,
    db: AsyncSession,
    recipient_ids: list[int] | None = None,
) -> None:
    # Для группового задания шлём только распределённым студентам (recipient_ids),
    # для индивидуального — всем активным студентам класса.
    if recipient_ids is None:
        recipient_ids = await class_repo.list_member_user_ids(
            class_id,
            roles=(ClassRole.STUDENT,),
            exclude_user_id=None,
            include_inactive=False,
            db=db,
        )
    await _create_and_send_many(
        user_ids=recipient_ids,
        notification_type=NotificationType.ASSIGNMENT,
        title=f"Новое задание в курсе «{class_name}»",
        class_id=class_id,
        entity_id=assignment_id,
        db=db,
    )


async def notify_redistribution(
    *,
    user_ids: list[int],
    class_id: int,
    assignment_id: int,
    assignment_title: str,
    db: AsyncSession,
) -> None:
    # entity_id = id задания: фронт ведёт студента на страницу задания для распределения
    await _create_and_send_many(
        user_ids=user_ids,
        notification_type=NotificationType.REDISTRIBUTION,
        title=f"Распределите оценку в команде по заданию «{assignment_title}»",
        class_id=class_id,
        entity_id=assignment_id,
        db=db,
    )


async def notify_grade_created(
    *,
    student_id: int,
    class_id: int,
    class_name: str,
    assignment_id: int,
    value: float,
    max_grade: float,
    db: AsyncSession,
) -> None:
    # entity_id = id задания: фронт ведёт студента прямо на страницу задания с оценкой
    await _create_and_send_many(
        user_ids=[student_id],
        notification_type=NotificationType.GRADE,
        title=(
            f"Вас оценили: {_format_score(value)}/{_format_score(max_grade)} "
            f"в курсе «{class_name}»"
        ),
        class_id=class_id,
        entity_id=assignment_id,
        db=db,
    )


async def notify_submission_returned(
    *,
    student_id: int,
    class_id: int,
    class_name: str,
    assignment_id: int,
    db: AsyncSession,
) -> None:
    # entity_id = id задания: ведём студента на страницу задания, чтобы доработать решение
    await _create_and_send_many(
        user_ids=[student_id],
        notification_type=NotificationType.SUBMISSION_RETURNED,
        title=f"Решение вернули на доработку в курсе «{class_name}»",
        class_id=class_id,
        entity_id=assignment_id,
        db=db,
    )


async def notify_submission_submitted(
    *,
    class_id: int,
    assignment_id: int,
    assignment_title: str,
    student_id: int,
    db: AsyncSession,
) -> None:
    user_ids = await class_repo.list_member_user_ids(
        class_id,
        roles=(ClassRole.CREATOR, ClassRole.TEACHER),
        exclude_user_id=student_id,
        include_inactive=False,
        db=db,
    )
    await _create_and_send_many(
        user_ids=user_ids,
        notification_type=NotificationType.SUBMISSION_SUBMITTED,
        title=f"Новое решение по заданию «{assignment_title}»",
        class_id=class_id,
        entity_id=assignment_id,
        db=db,
    )


async def list_notifications(
    user_id: int,
    page: int,
    limit: int,
    offset: int,
    db: AsyncSession,
) -> NotificationPageDTO:
    items = await notification_repo.list_for_user(user_id, limit, offset, db)
    total = await notification_repo.count_for_user(user_id, db)
    unread_count = await notification_repo.count_unread_for_user(user_id, db)
    return NotificationPageDTO(
        items=[_dto(item) for item in items],
        total=total,
        page=page,
        limit=limit,
        unread_count=unread_count,
    )


async def mark_notification_read(
    notification_id: int,
    user_id: int,
    db: AsyncSession,
) -> NotificationDTO:
    notification = await notification_repo.get_for_user(notification_id, user_id, db)
    if notification is None:
        raise ServiceError("Уведомление не найдено", 404)
    if notification.is_read:
        return _dto(notification)
    notification = await notification_repo.mark_read(notification, db)
    return _dto(notification)


async def mark_all_notifications_read(
    user_id: int, db: AsyncSession
) -> ReadAllNotificationsResponseDTO:
    updated_count = await notification_repo.mark_all_read(user_id, db)
    return ReadAllNotificationsResponseDTO(updated_count=updated_count, unread_count=0)
