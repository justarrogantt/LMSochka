from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.database import get_db
from app.database.models import UsersTable
from app.database.repositories import session_repo, user_repo
from app.services.token_service import decode_token

security = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> tuple[UsersTable, str]:
    """Проверяет access-токен и живую сессию. Возвращает (user, jti)."""
    token = credentials.credentials

    try:
        payload = decode_token(token)
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))

    if payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="Неверный тип токена")

    user_id = payload.get("user_id")
    jti = payload.get("jti")

    session = await session_repo.get_active_by_jti(jti, user_id, db)
    if not session:
        raise HTTPException(status_code=401, detail="Сессия отозвана или истекла")

    user = await user_repo.get_by_id(user_id, db)
    if not user:
        raise HTTPException(status_code=401, detail="Пользователь не найден")

    return user, jti
