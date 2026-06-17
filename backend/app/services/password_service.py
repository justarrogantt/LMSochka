import base64
import hashlib
from dataclasses import dataclass
from typing import Literal

import bcrypt

from app.config import settings


@dataclass(frozen=True)
class PasswordStrength:
    score: int
    level: Literal["easy", "medium", "hard"]
    label: str


def _prepare(password: str) -> bytes:
    """Готовим пароль к bcrypt.

    bcrypt использует только первые 72 байта входа, а bcrypt 5.x на более длинном
    вводе вообще бросает ValueError. Пароль из кириллицы/эмодзи легко превышает
    лимит (2–4 байта на символ — для RU-аудитории это ~36 символов).

    Прехешируем sha256 → base64: всегда 44 байта без null-байтов, лимит больше
    не упираем и не теряем «хвост» длинного пароля. Минус — пароли, совпадающие
    в первых 72 байтах, перестают быть эквивалентными (это и есть цель).
    """
    digest = hashlib.sha256(password.encode("utf-8")).digest()
    return base64.b64encode(digest)


def hash_password(password: str) -> str:
    """bcrypt хеш. cost=12 — разумный баланс безопасности и скорости (~250мс на проверку)."""
    return bcrypt.hashpw(_prepare(password), bcrypt.gensalt(rounds=12)).decode("utf-8")


def get_password_strength(password: str) -> PasswordStrength:
    """Прозрачная эвристика силы пароля.

    Метрика намеренно простая и объяснимая в UI:
    - длина даёт до 3 баллов;
    - каждый тип символов (lower/upper/digit/special) даёт по 1 баллу;
    - разнообразие символов даёт ещё 1 балл.

    Уровни:
    - 0..3: легкий
    - 4..6: средний
    - 7..8: сложный
    """
    length = len(password)
    unique_chars = len(set(password))
    has_lower = any(char.islower() for char in password)
    has_upper = any(char.isupper() for char in password)
    has_digit = any(char.isdigit() for char in password)
    has_special = any(not char.isalnum() for char in password)

    score = 0
    if length >= settings.PASSWORD_MIN_LENGTH:
        score += 1
    if length >= 12:
        score += 1
    if length >= 16:
        score += 1

    score += int(has_lower) + int(has_upper) + int(has_digit) + int(has_special)

    if unique_chars >= 6:
        score += 1

    if score <= 3:
        return PasswordStrength(score=score, level="easy", label="легкий")
    if score <= 6:
        return PasswordStrength(score=score, level="medium", label="средний")
    return PasswordStrength(score=score, level="hard", label="сложный")


def verify_password(password: str, password_hash: str) -> bool:
    # ValueError ловим на случай битого формата хеша в БД — возвращаем False вместо 500
    try:
        return bcrypt.checkpw(_prepare(password), password_hash.encode("utf-8"))
    except ValueError:
        return False
