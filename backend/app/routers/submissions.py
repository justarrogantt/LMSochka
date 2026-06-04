from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.database import get_db
from app.database.models import SubmissionStatus, UsersTable
from app.dependencies import get_current_user
from app.schemas.pagination import PageDTO, PageParams
from app.schemas.submission_schemas import (
    ReturnSubmissionRequest,
    SaveSubmissionRequest,
    SubmissionDTO,
)
from app.services import submission_service

submissions_router = APIRouter(tags=["Submissions"])


@submissions_router.put("/assignments/{aid}/my-submission")
async def save_my_submission(
    aid: int,
    body: SaveSubmissionRequest,
    context: tuple[UsersTable, str] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SubmissionDTO:
    user, _ = context
    return await submission_service.save_my_submission(aid, user, body, db)


@submissions_router.post("/assignments/{aid}/my-submission/submit")
async def submit_my_submission(
    aid: int,
    context: tuple[UsersTable, str] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SubmissionDTO:
    user, _ = context
    return await submission_service.submit_my_submission(aid, user, db)


@submissions_router.get("/assignments/{aid}/my-submission")
async def get_my_submission(
    aid: int,
    context: tuple[UsersTable, str] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SubmissionDTO | None:
    user, _ = context
    return await submission_service.get_my_submission(aid, user, db)


@submissions_router.get("/assignments/{aid}/submissions")
async def list_assignment_submissions(
    aid: int,
    params: PageParams = Depends(),
    status: SubmissionStatus | None = Query(default=None),
    context: tuple[UsersTable, str] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PageDTO[SubmissionDTO]:
    user, _ = context
    return await submission_service.list_assignment_submissions(
        aid=aid,
        status=status,
        page=params.page,
        limit=params.limit,
        offset=params.offset,
        user=user,
        db=db,
    )


@submissions_router.get("/submissions/{sid}")
async def get_submission(
    sid: int,
    context: tuple[UsersTable, str] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SubmissionDTO:
    user, _ = context
    return await submission_service.get_submission(sid, user, db)


@submissions_router.post("/submissions/{sid}/return")
async def return_submission(
    sid: int,
    body: ReturnSubmissionRequest | None = None,
    context: tuple[UsersTable, str] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SubmissionDTO:
    user, _ = context
    return await submission_service.return_submission(
        sid=sid,
        user=user,
        comment=body.comment if body is not None else None,
        db=db,
    )
