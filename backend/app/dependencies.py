from fastapi import Depends, HTTPException, Path
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.database import get_db
from app.database.models import ClassesTable, ClassMembersTable, ClassRole, UsersTable
from app.database.repositories import class_repo, session_repo, user_repo
from app.services.token_service import decode_token

security = HTTPBearer()


async def authenticate_access_token(
    token: str, db: AsyncSession
) -> tuple[UsersTable, str]:
    try:
        payload = decode_token(token)
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e)) from e

    # отдельная проверка: refresh-токен сюда подсунуть нельзя
    if payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="Неверный тип токена")

    user_id = payload.get("user_id")
    jti = payload.get("jti")

    # подпись JWT может быть валидна, но сессию могли отозвать через logout — проверяем БД
    session = await session_repo.get_active_by_jti(jti, user_id, db)
    if not session:
        raise HTTPException(status_code=401, detail="Сессия отозвана или истекла")

    user = await user_repo.get_by_id(user_id, db)
    if not user:
        raise HTTPException(status_code=401, detail="Пользователь не найден")

    # jti возвращаем чтобы logout мог отозвать конкретно эту сессию
    return user, jti


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> tuple[UsersTable, str]:
    """Зависимость для защищённых эндпоинтов: проверяет access-токен и живую сессию."""
    return await authenticate_access_token(credentials.credentials, db)


async def require_class_member(
    class_id: int = Path(..., ge=1),
    context: tuple[UsersTable, str] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> tuple[UsersTable, ClassesTable, ClassMembersTable]:
    """Гарантирует, что текущий юзер — участник класса. Возвращает (user, cls, membership)."""
    user, _ = context

    # сначала проверяем существование класса — иначе бы не отличили "класса нет"
    # от "ты не в классе"
    cls = await class_repo.get_by_id(class_id, db)
    if not cls:
        raise HTTPException(status_code=404, detail="Класс не найден")

    member = await class_repo.get_member(class_id, user.id, db)
    if not member:
        raise HTTPException(status_code=403, detail="Вы не состоите в этом классе")

    return user, cls, member


def require_class_role(*allowed_roles: ClassRole):
    """Фабрика зависимостей: проверяет, что роль юзера в классе входит в allowed_roles."""

    async def dependency(
        ctx: tuple[UsersTable, ClassesTable, ClassMembersTable] = Depends(
            require_class_member
        ),
    ) -> tuple[UsersTable, ClassesTable, ClassMembersTable]:
        user, cls, member = ctx
        if member.role not in allowed_roles:
            raise HTTPException(status_code=403, detail="Недостаточно прав")
        return user, cls, member

    return dependency
