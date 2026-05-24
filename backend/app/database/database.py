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
