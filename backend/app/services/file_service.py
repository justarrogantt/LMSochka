from pathlib import Path
from uuid import uuid4

import anyio
from fastapi import UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database.models import (
    AnnouncementsTable,
    AssignmentsTable,
    ClassMembersTable,
    ClassRole,
    StoredFilesTable,
    SubmissionsTable,
    SubmissionStatus,
    UsersTable,
)
from app.database.repositories import (
    announcement_repo,
    assignment_repo,
    file_repo,
    group_repo,
    submission_repo,
)
from app.schemas.errors import ServiceError
from app.schemas.file_schemas import FileDTO
from app.services import access

_ALLOWED_TYPES: dict[str, set[str]] = {
    ".pdf": {"application/pdf"},
    ".doc": {"application/msword"},
    ".docx": {"application/vnd.openxmlformats-officedocument.wordprocessingml.document"},
    ".xls": {"application/vnd.ms-excel"},
    ".xlsx": {"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"},
    ".ppt": {"application/vnd.ms-powerpoint"},
    ".pptx": {"application/vnd.openxmlformats-officedocument.presentationml.presentation"},
    ".txt": {"text/plain"},
    ".csv": {"text/csv", "application/csv", "text/plain"},
    ".png": {"image/png"},
    ".jpg": {"image/jpeg"},
    ".jpeg": {"image/jpeg"},
    ".webp": {"image/webp"},
    ".zip": {"application/zip", "application/x-zip-compressed"},
    ".7z": {"application/x-7z-compressed"},
}
_CHUNK_SIZE = 1024 * 1024


def dto(file: StoredFilesTable | None) -> FileDTO | None:
    if file is None:
        return None
    return FileDTO(
        id=file.id,
        name=file.original_name,
        content_type=file.content_type,
        size=file.size,
        download_url=f"/api/files/{file.id}/download",
    )


def _upload_dir() -> Path:
    path = Path(settings.UPLOAD_DIR)
    path.mkdir(parents=True, exist_ok=True)
    return path


def _path(file: StoredFilesTable) -> Path:
    return _upload_dir() / file.storage_name


async def _unlink(file: StoredFilesTable | None) -> None:
    if file is None:
        return
    path = _path(file)
    if path.exists():
        await anyio.to_thread.run_sync(path.unlink)


async def _store(upload: UploadFile, db: AsyncSession) -> StoredFilesTable:
    original_name = Path(upload.filename or "").name.strip()[:255]
    suffix = Path(original_name).suffix.lower()
    content_type = (upload.content_type or "").lower()
    if not original_name or suffix not in _ALLOWED_TYPES:
        raise ServiceError("Недопустимый формат файла", 422)
    if content_type not in _ALLOWED_TYPES[suffix]:
        raise ServiceError("Тип файла не соответствует расширению", 422)

    file_id = str(uuid4())
    storage_name = f"{file_id}{suffix}"
    target = _upload_dir() / storage_name
    size = 0
    try:
        async with await anyio.open_file(target, "wb") as output:
            while chunk := await upload.read(_CHUNK_SIZE):
                size += len(chunk)
                if size > settings.MAX_UPLOAD_SIZE:
                    raise ServiceError("Файл превышает лимит 20 МБ", 413)
                await output.write(chunk)
    except Exception:
        if target.exists():
            await anyio.to_thread.run_sync(target.unlink)
        raise
    finally:
        await upload.close()

    stored = StoredFilesTable(
        id=file_id,
        storage_name=storage_name,
        original_name=original_name,
        content_type=content_type,
        size=size,
    )
    db.add(stored)
    await db.flush()
    return stored


async def _replace(
    owner: AssignmentsTable | SubmissionsTable | AnnouncementsTable,
    field: str,
    upload: UploadFile,
    db: AsyncSession,
) -> StoredFilesTable:
    old_id = getattr(owner, field)
    old = await file_repo.get(old_id, db) if old_id else None
    new: StoredFilesTable | None = None
    try:
        new = await _store(upload, db)
        setattr(owner, field, new.id)
        db.add(owner)
        if old is not None:
            await db.delete(old)
        await db.commit()
        await db.refresh(new)
    except Exception:
        await db.rollback()
        await _unlink(new)
        raise
    await _unlink(old)
    return new


async def _delete(
    owner: AssignmentsTable | SubmissionsTable | AnnouncementsTable,
    field: str,
    db: AsyncSession,
) -> None:
    file_id = getattr(owner, field)
    if file_id is None:
        raise ServiceError("Файл не найден", 404)
    stored = await file_repo.get(file_id, db)
    setattr(owner, field, None)
    db.add(owner)
    if stored is not None:
        await db.delete(stored)
    await db.commit()
    await _unlink(stored)


def _can_manage_assignment(
    assignment: AssignmentsTable, user: UsersTable, member: ClassMembersTable
) -> bool:
    return member.role == ClassRole.CREATOR or assignment.author_id == user.id


def _can_manage_announcement(
    announcement: AnnouncementsTable, user: UsersTable, member: ClassMembersTable
) -> bool:
    return member.role == ClassRole.CREATOR or announcement.author_id == user.id


async def _is_group_member(
    submission: SubmissionsTable, user_id: int, db: AsyncSession
) -> bool:
    """Состоит ли юзер в команде, которой принадлежит групповое решение."""
    group = await group_repo.get_group_for_submission(submission.id, db)
    if group is None:
        return False
    membership = await group_repo.get_member(group.assignment_id, user_id, db)
    return membership is not None and membership.group_id == group.id


async def upload_assignment_material(
    class_id: int,
    aid: int,
    user: UsersTable,
    member: ClassMembersTable,
    upload: UploadFile,
    db: AsyncSession,
) -> FileDTO:
    assignment = await assignment_repo.get_by_id(aid, class_id, db)
    if assignment is None:
        raise ServiceError("Задание не найдено", 404)
    if not _can_manage_assignment(assignment, user, member):
        raise ServiceError("Заменить файл может только автор или создатель класса", 403)
    return dto(await _replace(assignment, "material_file_id", upload, db))


async def delete_assignment_material(
    class_id: int,
    aid: int,
    user: UsersTable,
    member: ClassMembersTable,
    db: AsyncSession,
) -> None:
    assignment = await assignment_repo.get_by_id(aid, class_id, db)
    if assignment is None:
        raise ServiceError("Задание не найдено", 404)
    if not _can_manage_assignment(assignment, user, member):
        raise ServiceError("Удалить файл может только автор или создатель класса", 403)
    await _delete(assignment, "material_file_id", db)


async def upload_announcement_material(
    class_id: int,
    aid: int,
    user: UsersTable,
    member: ClassMembersTable,
    upload: UploadFile,
    db: AsyncSession,
) -> FileDTO:
    announcement = await announcement_repo.get_by_id(aid, class_id, db)
    if announcement is None:
        raise ServiceError("Объявление не найдено", 404)
    if not _can_manage_announcement(announcement, user, member):
        raise ServiceError("Заменить файл может только автор или создатель класса", 403)
    return dto(await _replace(announcement, "material_file_id", upload, db))


async def delete_announcement_material(
    class_id: int,
    aid: int,
    user: UsersTable,
    member: ClassMembersTable,
    db: AsyncSession,
) -> None:
    announcement = await announcement_repo.get_by_id(aid, class_id, db)
    if announcement is None:
        raise ServiceError("Объявление не найдено", 404)
    if not _can_manage_announcement(announcement, user, member):
        raise ServiceError("Удалить файл может только автор или создатель класса", 403)
    await _delete(announcement, "material_file_id", db)


async def purge_announcement_file(
    announcement: AnnouncementsTable, db: AsyncSession
) -> None:
    """Удалить файл объявления при его удалении (вызывается уже после проверки прав)."""
    if announcement.material_file_id is not None:
        await _delete(announcement, "material_file_id", db)


async def upload_my_submission_attachment(
    aid: int, user: UsersTable, upload: UploadFile, db: AsyncSession
) -> FileDTO:
    assignment = await access.get_assignment_or_404(aid, db)
    await access.ensure_student(assignment, user.id, db)
    # для группового — командное решение, для индивидуального — личное
    group_id, submission = await access.resolve_submission_target(assignment, user.id, db)
    if submission is None:
        submission = await submission_repo.create(aid, user.id, "", None, db)
        if group_id is not None:
            await group_repo.link_submission(submission.id, group_id, db)
    if submission.status not in {SubmissionStatus.DRAFT, SubmissionStatus.RETURNED}:
        raise ServiceError("Файл можно менять только в черновике или после возврата", 409)
    return dto(await _replace(submission, "attachment_file_id", upload, db))


async def delete_my_submission_attachment(
    aid: int, user: UsersTable, db: AsyncSession
) -> None:
    assignment = await access.get_assignment_or_404(aid, db)
    await access.ensure_student(assignment, user.id, db)
    _, submission = await access.resolve_submission_target(assignment, user.id, db)
    if submission is None:
        raise ServiceError("Решение не найдено", 404)
    if submission.status not in {SubmissionStatus.DRAFT, SubmissionStatus.RETURNED}:
        raise ServiceError("Файл можно менять только в черновике или после возврата", 409)
    await _delete(submission, "attachment_file_id", db)


async def get_download(
    file_id: str, user: UsersTable, db: AsyncSession
) -> tuple[StoredFilesTable, Path]:
    stored = await file_repo.get(file_id, db)
    if stored is None:
        raise ServiceError("Файл не найден", 404)

    assignment = await file_repo.get_assignment_for_file(file_id, db)
    announcement = (
        await announcement_repo.get_by_file(file_id, db) if assignment is None else None
    )
    if assignment is not None:
        member = await access.get_class_member_or_403(assignment.class_id, user.id, db)
        if member.role == ClassRole.STUDENT:
            await access.ensure_student(assignment, user.id, db)
    elif announcement is not None:
        # файл объявления виден любому участнику класса
        await access.get_class_member_or_403(announcement.class_id, user.id, db)
    else:
        row = await file_repo.get_submission_for_file(file_id, db)
        if row is None:
            raise ServiceError("Файл не найден", 404)
        submission, assignment = row
        if submission.student_id == user.id:
            await access.ensure_student(assignment, user.id, db)
        elif await _is_group_member(submission, user.id, db):
            # член команды скачивает общий файл своего командного решения
            await access.ensure_student(assignment, user.id, db)
        else:
            await access.ensure_teacher_or_creator(assignment.class_id, user.id, db)

    path = _path(stored)
    if not path.is_file():
        raise ServiceError("Файл отсутствует в хранилище", 404)
    return stored, path


async def delete_assignment_tree(assignment_id: int, db: AsyncSession) -> None:
    assignment = await db.get(AssignmentsTable, assignment_id)
    submissions = list(
        (
            await db.execute(
                select(SubmissionsTable).where(
                    SubmissionsTable.assignment_id == assignment_id
                )
            )
        )
        .scalars()
        .all()
    )
    ids = [
        file_id
        for file_id in [
            assignment.material_file_id if assignment else None,
            *(submission.attachment_file_id for submission in submissions),
        ]
        if file_id is not None
    ]
    files = [stored for file_id in ids if (stored := await file_repo.get(file_id, db))]
    if assignment is not None:
        assignment.material_file_id = None
        db.add(assignment)
    for submission in submissions:
        submission.attachment_file_id = None
        db.add(submission)
    for stored in files:
        await db.delete(stored)
    await db.commit()
    for stored in files:
        await _unlink(stored)


async def delete_class_tree(class_id: int, db: AsyncSession) -> None:
    assignment_ids = list(
        (
            await db.execute(
                select(AssignmentsTable.id).where(AssignmentsTable.class_id == class_id)
            )
        )
        .scalars()
        .all()
    )
    for assignment_id in assignment_ids:
        await delete_assignment_tree(assignment_id, db)
