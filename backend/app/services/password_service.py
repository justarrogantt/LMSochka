import base64
import hashlib

import bcrypt


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


def verify_password(password: str, password_hash: str) -> bool:
    # ValueError ловим на случай битого формата хеша в БД — возвращаем False вместо 500
    try:
        return bcrypt.checkpw(_prepare(password), password_hash.encode("utf-8"))
    except ValueError:
        return False
