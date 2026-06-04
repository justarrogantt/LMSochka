from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.database import AsyncSessionLocal, get_db
from app.database.models import UsersTable
from app.dependencies import authenticate_access_token, get_current_user
from app.schemas.notification_schemas import (
    NotificationDTO,
    NotificationPageDTO,
    ReadAllNotificationsResponseDTO,
)
from app.schemas.pagination import PageParams
from app.services import notification_service

notifications_router = APIRouter(prefix="/notifications", tags=["Notifications"])

ws_notifications_router = APIRouter(tags=["Notifications"])


@notifications_router.get("")
async def list_notifications(
    params: PageParams = Depends(),
    context: tuple[UsersTable, str] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> NotificationPageDTO:
    user, _ = context
    return await notification_service.list_notifications(
        user.id, params.page, params.limit, params.offset, db
    )


@notifications_router.post("/read-all")
async def mark_all_notifications_read(
    context: tuple[UsersTable, str] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ReadAllNotificationsResponseDTO:
    user, _ = context
    return await notification_service.mark_all_notifications_read(user.id, db)


@notifications_router.post("/{notification_id}/read")
async def mark_notification_read(
    notification_id: int,
    context: tuple[UsersTable, str] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> NotificationDTO:
    user, _ = context
    return await notification_service.mark_notification_read(notification_id, user.id, db)


@ws_notifications_router.websocket("/ws/notifications")
async def notifications_websocket(websocket: WebSocket) -> None:
    token = websocket.query_params.get("token")
    if not token:
        await websocket.accept()
        await websocket.close(code=1008)
        return

    async with AsyncSessionLocal() as db:
        try:
            user, _ = await authenticate_access_token(token, db)
        except HTTPException:
            await websocket.accept()
            await websocket.close(code=1008)
            return

        await notification_service.ws_manager.connect(user.id, websocket)
        try:
            while True:
                await websocket.receive_text()
        except WebSocketDisconnect:
            await notification_service.ws_manager.disconnect(user.id, websocket)
