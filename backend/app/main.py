from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.database.database import apply_lightweight_migrations, engine
from app.database.models import Base
from app.routers.announcements import announcements_router
from app.routers.assignments import assignments_router
from app.routers.auth import auth_router
from app.routers.classes import classes_router
from app.routers.files import files_router
from app.routers.grades import grades_router
from app.routers.groups import groups_router
from app.routers.me import me_router
from app.routers.notifications import notifications_router, ws_notifications_router
from app.routers.questions import questions_router
from app.routers.quizzes import quizzes_router
from app.routers.submissions import submissions_router
from app.schemas.errors import ServiceError


@asynccontextmanager
async def lifespan(app: FastAPI):
    """События при старте/остановке приложения."""
    # создаём таблицы если их ещё нет (для dev — на проде лучше Alembic-миграции)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await apply_lightweight_migrations()
    yield


app = FastAPI(title="LMS Backend", lifespan=lifespan)


@app.exception_handler(ServiceError)
async def service_error_handler(_: Request, exc: ServiceError) -> JSONResponse:
    """Единая точка маппинга доменных ошибок в HTTP-ответ.

    Сервисы кидают ServiceError, роутерам больше не нужно ловить его вручную —
    ответ той же формы, что и у HTTPException: {"detail": "..."}.
    """
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.message})

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
app.include_router(questions_router, prefix="/api")
app.include_router(quizzes_router, prefix="/api")
app.include_router(submissions_router, prefix="/api")
app.include_router(groups_router, prefix="/api")
app.include_router(grades_router, prefix="/api")
app.include_router(files_router, prefix="/api")
app.include_router(me_router, prefix="/api")
app.include_router(notifications_router, prefix="/api")
app.include_router(ws_notifications_router, prefix="/api")


@app.get("/")
async def root():
    return {"status": "ok"}


if __name__ == "__main__":
    uvicorn.run("app.main:app", reload=True, port=8000)
