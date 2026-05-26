import hashlib
from datetime import UTC, datetime, timedelta

import jwt

from app.config import settings


def _now() -> datetime:
    return datetime.now(UTC)


def generate_access_token(user_id: int, jti: str) -> str:
    # jti общий для пары access+refresh — по нему ищем сессию в БД;
    # type нужен чтобы не принять refresh там, где ждём access
    payload = {
        "user_id": user_id,
        "jti": jti,
        "type": "access",
        "exp": _now() + timedelta(minutes=settings.ACCESS_TOKEN_TTL),
    }
    return jwt.encode(payload, settings.SECRET_KEY, settings.ALGORITHM)


def generate_refresh_token(user_id: int, jti: str) -> str:
    payload = {
        "user_id": user_id,
        "jti": jti,
        "type": "refresh",
        "exp": _now() + timedelta(minutes=settings.REFRESH_TOKEN_TTL),
    }
    return jwt.encode(payload, settings.SECRET_KEY, settings.ALGORITHM)


def decode_token(token: str) -> dict:
    """Декодирует JWT. Бросает ValueError если невалиден или истёк."""
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except jwt.ExpiredSignatureError as e:
        raise ValueError("Срок действия токена истёк") from e
    except jwt.InvalidTokenError as e:
        raise ValueError("Недействительный токен") from e


def hash_token(token: str) -> str:
    """sha256-хеш для хранения refresh в БД (сам токен не храним — защита от утечки БД)."""
    return hashlib.sha256(token.encode()).hexdigest()
