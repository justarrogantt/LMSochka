from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.database import get_db
from app.database.models import UsersTable
from app.dependencies import get_current_user
from app.schemas.me_schemas import MyGradesOverviewDTO
from app.services import me_service

me_router = APIRouter(prefix="/me", tags=["Me"])


@me_router.get("/grades")
async def get_my_grades(
    context: tuple[UsersTable, str] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MyGradesOverviewDTO:
    user, _ = context
    return await me_service.get_my_grades_overview(user, db)
