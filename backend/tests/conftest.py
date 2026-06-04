import os
import shutil

# Конфигурим окружение ДО импорта приложения, чтобы settings подхватил тестовые значения
os.environ.setdefault("SECRET_KEY", "test-secret-key-do-not-use-in-prod")
os.environ["DATABASE_NAME"] = "test_lms.db"
os.environ["UPLOAD_DIR"] = "/tmp/lmsochka-test-uploads"

from pathlib import Path

import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.database.database import engine  # noqa: E402
from app.database.models import Base  # noqa: E402
from app.main import app  # noqa: E402


@pytest_asyncio.fixture(autouse=True)
async def _fresh_db():
    """Каждый тест получает чистую БД."""
    db_path = Path("test_lms.db")
    upload_path = Path(os.environ["UPLOAD_DIR"])
    if db_path.exists():
        db_path.unlink()
    shutil.rmtree(upload_path, ignore_errors=True)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    yield

    await engine.dispose()
    if db_path.exists():
        db_path.unlink()
    shutil.rmtree(upload_path, ignore_errors=True)


@pytest_asyncio.fixture
async def client():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac
