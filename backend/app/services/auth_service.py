import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database.models import SessionsTable, UsersTable
from app.database.repositories import session_repo, user_repo
from app.schemas.auth_schemas import AuthSuccessDTO, UserDTO
from app.schemas.errors import ServiceError
from app.services.password_service import hash_password, verify_password
from app.services.token_service import (
    decode_token,
    generate_access_token,
    generate_refresh_token,
    hash_token,
)


async def _create_session(
    user_id: int, db: AsyncSession, device_info: str | None
) -> tuple[str, str]:
    """Генерит новую пару токенов и пишет сессию в БД. Используется при register/login/refresh."""
    jti = str(uuid.uuid4())
    access_token = generate_access_token(user_id, jti)
    refresh_token = generate_refresh_token(user_id, jti)
    expires_at = datetime.now(timezone.utc) + timedelta(
        minutes=settings.REFRESH_TOKEN_TTL
    )

    session = SessionsTable(
        id=jti,
        user_id=user_id,
        refresh_token_hash=hash_token(refresh_token),
        expires_at=expires_at,
        device_info=device_info,
    )
    db.add(session)
    await db.commit()
    return access_token, refresh_token


def _build_success(user: UsersTable, access: str, refresh: str) -> AuthSuccessDTO:
    return AuthSuccessDTO(
        user=UserDTO.model_validate(user),
        access_token=access,
        refresh_token=refresh,
    )


async def register(
    email: str,
    password: str,
    first_name: str | None,
    last_name: str | None,
    db: AsyncSession,
    device_info: str | None,
) -> AuthSuccessDTO:
    # нормализуем email чтобы Foo@X.com и foo@x.com считались одним юзером
    email = email.lower().strip()

    existing = await user_repo.get_by_email(email, db)
    if existing:
        raise ServiceError("Пользователь с таким email уже существует", 409)

    user = await user_repo.create_user(
        email=email,
        password_hash=hash_password(password),
        first_name=first_name,
        last_name=last_name,
        db=db,
    )

    access, refresh = await _create_session(user.id, db, device_info)
    return _build_success(user, access, refresh)


async def login(
    email: str, password: str, db: AsyncSession, device_info: str | None
) -> AuthSuccessDTO:
    email = email.lower().strip()
    user = await user_repo.get_by_email(email, db)

    # одинаковая ошибка чтобы не палить существование email
    if not user or not verify_password(password, user.password_hash):
        raise ServiceError("Неверный email или пароль", 401)

    access, refresh = await _create_session(user.id, db, device_info)
    return _build_success(user, access, refresh)


async def refresh_tokens(
    refresh_token: str, db: AsyncSession, device_info: str | None
) -> AuthSuccessDTO:
    """
    Refresh rotation: старый refresh помечается как использованный, выдаётся новая пара.
    Если refresh уже был использован — отзываем все сессии юзера (защита от кражи токена).
    """
    try:
        payload = decode_token(refresh_token)
    except ValueError as e:
        raise ServiceError(str(e), 401)

    if payload.get("type") != "refresh":
        raise ServiceError("Неверный тип токена", 401)

    user_id = payload.get("user_id")
    jti = payload.get("jti")

    session = await session_repo.get_by_jti(jti, db)
    if not session or session.user_id != user_id:
        raise ServiceError("Сессия не найдена", 401)

    # сравниваем хеш — JWT подпись валидна, но токен мог быть подменён на чужой с тем же jti
    if session.refresh_token_hash != hash_token(refresh_token):
        raise ServiceError("Недействительный токен", 401)

    # Reuse detection: если этот refresh уже использовался или сессия отозвана —
    # значит токен украден и его пытаются использовать повторно. Отзываем все сессии юзера.
    if session.refresh_used or session.revoked:
        await session_repo.revoke_all_for_user(user_id, db)
        raise ServiceError("Токен скомпрометирован, все сессии отозваны", 401)

    # SQLite возвращает naive datetime, добавляем UTC чтобы сравнить с aware now()
    if session.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        raise ServiceError("Срок действия токена истёк", 401)

    # старую сессию закрываем; новая создастся ниже в _create_session
    session.refresh_used = True
    session.revoked = True
    db.add(session)
    await db.commit()

    user = await user_repo.get_by_id(user_id, db)
    if not user:
        raise ServiceError("Пользователь не найден", 401)

    access, refresh = await _create_session(user.id, db, device_info)
    return _build_success(user, access, refresh)


async def logout(jti: str, db: AsyncSession) -> None:
    await session_repo.revoke_by_jti(jti, db)
