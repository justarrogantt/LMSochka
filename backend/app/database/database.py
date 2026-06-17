from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.config import settings

# Асинхронный движок SQLAlchemy (echo=True — выводить SQL в консоль для отладки)
engine = create_async_engine(url=settings.database_url, echo=False)

# Фабрика сессий — каждый запрос получает свою сессию через get_db()
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def get_db():
    """Зависимость FastAPI: открывает сессию БД на время запроса и закрывает после."""
    async with AsyncSessionLocal() as session:
        yield session


async def apply_lightweight_migrations() -> None:
    """Мини-миграции для dev SQLite, где create_all не обновляет старые таблицы."""
    if not settings.database_url.startswith("sqlite"):
        return

    async with engine.begin() as conn:
        result = await conn.execute(text("PRAGMA table_info(announcements)"))
        columns = {row[1] for row in result.fetchall()}
        if "material_file_id" not in columns:
            await conn.execute(
                text("ALTER TABLE announcements ADD COLUMN material_file_id VARCHAR(36)")
            )

        result = await conn.execute(text("PRAGMA table_info(assignments)"))
        columns = {row[1] for row in result.fetchall()}
        if "type" not in columns:
            await conn.execute(
                text(
                    "ALTER TABLE assignments "
                    "ADD COLUMN type VARCHAR(16) NOT NULL DEFAULT 'REGULAR'"
                )
            )

        await conn.execute(
            text(
                "UPDATE assignments "
                "SET type = CASE "
                "WHEN type = 'regular' THEN 'REGULAR' "
                "WHEN type = 'quiz' THEN 'QUIZ' "
                "ELSE type END "
                "WHERE type IN ('regular', 'quiz')"
            )
        )
