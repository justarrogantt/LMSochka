import hashlib
from datetime import datetime, timedelta, timezone

import jwt

from app.config import settings


def _now() -> datetime:
    return datetime.now(timezone.utc)


def generate_access_token(user_id: int, jti: str) -> str:
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
    except jwt.ExpiredSignatureError:
        raise ValueError("Срок действия токена истёк")
    except jwt.InvalidTokenError:
        raise ValueError("Недействительный токен")


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()
