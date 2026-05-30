from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database.database import engine
from app.database.models import Base
from app.routers.announcements import announcements_router
from app.routers.assignments import assignments_router
from app.routers.auth import auth_router
from app.routers.classes import classes_router
from app.routers.grades import grades_router
from app.routers.submissions import submissions_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """События при старте/остановке приложения."""
    # создаём таблицы если их ещё нет (для dev — на проде лучше Alembic-миграции)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield


app = FastAPI(title="LMS Backend", lifespan=lifespan)

# для дева открыто всё; на проде заменить allow_origins на список доменов фронта
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api")
app.include_router(classes_router, prefix="/api")
app.include_router(announcements_router, prefix="/api")
app.include_router(assignments_router, prefix="/api")
app.include_router(submissions_router, prefix="/api")
app.include_router(grades_router, prefix="/api")


@app.get("/")
async def root():
    return {"status": "ok"}


if __name__ == "__main__":
    uvicorn.run("app.main:app", reload=True, port=8000)
