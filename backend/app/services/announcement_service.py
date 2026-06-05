from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import (
    AnnouncementsTable,
    ClassMembersTable,
    ClassRole,
    StoredFilesTable,
    UsersTable,
)
from app.database.repositories import announcement_repo, file_repo
from app.schemas.announcement_schemas import AnnouncementDTO
from app.schemas.errors import ServiceError
from app.schemas.pagination import PageDTO
from app.schemas.user_schemas import UserBriefDTO
from app.services import file_service, notification_service


def _dto(
    ann: AnnouncementsTable,
    author: UsersTable,
    user: UsersTable,
    member: ClassMembersTable,
    material_file: StoredFilesTable | None = None,
) -> AnnouncementDTO:
    can_manage = ann.author_id == user.id or member.role == ClassRole.CREATOR
    return AnnouncementDTO(
        id=ann.id,
        class_id=ann.class_id,
        author=UserBriefDTO.model_validate(author),
        title=ann.title,
        content=ann.content,
        material_file=file_service.dto(material_file),
        created_at=ann.created_at,
        updated_at=ann.updated_at,
        can_edit=can_manage,
        can_delete=can_manage,
    )


async def create_announcement(
    class_id: int,
    class_name: str,
    author: UsersTable,
    member: ClassMembersTable,
    title: str,
    content: str,
    db: AsyncSession,
) -> AnnouncementDTO:
    ann = await announcement_repo.create(
        class_id=class_id,
        author_id=author.id,
        # strip — фронт может прислать с лишними пробелами по краям
        title=title.strip(),
        content=content.strip(),
        db=db,
    )
    await db.commit()
    await db.refresh(ann)
    await notification_service.notify_announcement_created(
        class_id=class_id,
        announcement_id=ann.id,
        author_id=author.id,
        class_name=class_name,
        db=db,
    )
    return _dto(ann, author, author, member)


async def list_announcements(
    class_id: int,
    page: int,
    limit: int,
    offset: int,
    user: UsersTable,
    member: ClassMembersTable,
    db: AsyncSession,
) -> PageDTO[AnnouncementDTO]:
    rows = await announcement_repo.list_for_class(class_id, limit, offset, db)
    total = await announcement_repo.count_for_class(class_id, db)
    files = await file_repo.get_many(
        [a.material_file_id for a, _ in rows if a.material_file_id], db
    )
    return PageDTO[AnnouncementDTO](
        items=[
            _dto(a, u, user, member, files.get(a.material_file_id)) for a, u in rows
        ],
        total=total,
        page=page,
        limit=limit,
    )


async def get_announcement(
    class_id: int,
    aid: int,
    user: UsersTable,
    member: ClassMembersTable,
    db: AsyncSession,
) -> AnnouncementDTO:
    row = await announcement_repo.get_with_author(aid, class_id, db)
    if row is None:
        raise ServiceError("Объявление не найдено", 404)
    ann, author = row
    material_file = (
        await file_repo.get(ann.material_file_id, db) if ann.material_file_id else None
    )
    return _dto(ann, author, user, member, material_file)


def _can_edit(
    ann: AnnouncementsTable, user: UsersTable, member: ClassMembersTable
) -> bool:
    """Редактировать/удалять может автор объявления или creator класса.
    teacher без авторства править чужие объявления не может — это намеренно,
    чтобы не было «войны учителей»."""
    return ann.author_id == user.id or member.role == ClassRole.CREATOR


async def update_announcement(
    class_id: int,
    aid: int,
    user: UsersTable,
    member: ClassMembersTable,
    title: str | None,
    content: str | None,
    db: AsyncSession,
) -> AnnouncementDTO:
    row = await announcement_repo.get_with_author(aid, class_id, db)
    if row is None:
        raise ServiceError("Объявление не найдено", 404)
    ann, author = row

    if not _can_edit(ann, user, member):
        raise ServiceError("Редактировать может только автор или создатель класса", 403)

    ann = await announcement_repo.update(
        ann,
        title=title.strip() if title is not None else None,
        content=content.strip() if content is not None else None,
        db=db,
    )
    material_file = (
        await file_repo.get(ann.material_file_id, db) if ann.material_file_id else None
    )
    # если поменялся сам автор класса (creator редактирует чужое) — все равно
    # автор объявления остаётся прежним, повторно подтягивать не надо
    return _dto(ann, author, user, member, material_file)


async def delete_announcement(
    class_id: int,
    aid: int,
    user: UsersTable,
    member: ClassMembersTable,
    db: AsyncSession,
) -> None:
    ann = await announcement_repo.get_by_id(aid, class_id, db)
    if ann is None:
        raise ServiceError("Объявление не найдено", 404)

    if not _can_edit(ann, user, member):
        raise ServiceError("Удалять может только автор или создатель класса", 403)

    # снимаем прикреплённый файл из хранилища, чтобы не оставлять сирот
    await file_service.purge_announcement_file(ann, db)
    await announcement_repo.soft_delete(ann, db)
