from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.database import get_db
from app.database.models import ClassesTable, ClassMembersTable, UsersTable
from app.dependencies import get_current_user, require_class_member
from app.schemas.errors import ServiceError
from app.schemas.file_schemas import FileDTO
from app.services import file_service

files_router = APIRouter(tags=["Files"])


@files_router.post("/classes/{class_id}/assignments/{aid}/material-file")
async def upload_assignment_material(
    aid: int,
    upload: UploadFile = File(...),
    ctx: tuple[UsersTable, ClassesTable, ClassMembersTable] = Depends(
        require_class_member
    ),
    db: AsyncSession = Depends(get_db),
) -> FileDTO:
    user, cls, member = ctx
    try:
        return await file_service.upload_assignment_material(
            cls.id, aid, user, member, upload, db
        )
    except ServiceError as e:
        raise HTTPException(status_code=e.status_code, detail=str(e)) from e


@files_router.delete("/classes/{class_id}/assignments/{aid}/material-file", status_code=204)
async def delete_assignment_material(
    aid: int,
    ctx: tuple[UsersTable, ClassesTable, ClassMembersTable] = Depends(
        require_class_member
    ),
    db: AsyncSession = Depends(get_db),
) -> Response:
    user, cls, member = ctx
    try:
        await file_service.delete_assignment_material(cls.id, aid, user, member, db)
    except ServiceError as e:
        raise HTTPException(status_code=e.status_code, detail=str(e)) from e
    return Response(status_code=204)


@files_router.post("/assignments/{aid}/my-submission/attachment-file")
async def upload_submission_attachment(
    aid: int,
    upload: UploadFile = File(...),
    context: tuple[UsersTable, str] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> FileDTO:
    user, _ = context
    try:
        return await file_service.upload_my_submission_attachment(aid, user, upload, db)
    except ServiceError as e:
        raise HTTPException(status_code=e.status_code, detail=str(e)) from e


@files_router.delete("/assignments/{aid}/my-submission/attachment-file", status_code=204)
async def delete_submission_attachment(
    aid: int,
    context: tuple[UsersTable, str] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    user, _ = context
    try:
        await file_service.delete_my_submission_attachment(aid, user, db)
    except ServiceError as e:
        raise HTTPException(status_code=e.status_code, detail=str(e)) from e
    return Response(status_code=204)


@files_router.get("/files/{file_id}/download")
async def download_file(
    file_id: str,
    context: tuple[UsersTable, str] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> FileResponse:
    user, _ = context
    try:
        stored, path = await file_service.get_download(file_id, user, db)
    except ServiceError as e:
        raise HTTPException(status_code=e.status_code, detail=str(e)) from e
    return FileResponse(
        path,
        media_type=stored.content_type,
        filename=stored.original_name,
    )
