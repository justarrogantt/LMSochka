import bcrypt


def hash_password(password: str) -> str:
    """bcrypt хеш. cost=12 — разумный баланс безопасности и скорости (~250мс на проверку)."""
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode(
        "utf-8"
    )


def verify_password(password: str, password_hash: str) -> bool:
    # ValueError ловим на случай битого формата хеша в БД — возвращаем False вместо 500
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False
