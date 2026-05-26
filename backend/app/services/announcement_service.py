from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import (
    AnnouncementsTable,
    ClassMembersTable,
    ClassRole,
    UsersTable,
)
from app.database.repositories import announcement_repo
from app.schemas.announcement_schemas import (
    AnnouncementDTO,
    AuthorDTO,
)
from app.schemas.errors import ServiceError
from app.schemas.pagination import PageDTO


def _dto(ann: AnnouncementsTable, author: UsersTable) -> AnnouncementDTO:
    return AnnouncementDTO(
        id=ann.id,
        class_id=ann.class_id,
        author=AuthorDTO.model_validate(author),
        title=ann.title,
        content=ann.content,
        created_at=ann.created_at,
        updated_at=ann.updated_at,
    )


async def create_announcement(
    class_id: int, author: UsersTable, title: str, content: str, db: AsyncSession
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
    return _dto(ann, author)


async def list_announcements(
    class_id: int, page: int, limit: int, offset: int, db: AsyncSession
) -> PageDTO[AnnouncementDTO]:
    rows = await announcement_repo.list_for_class(class_id, limit, offset, db)
    total = await announcement_repo.count_for_class(class_id, db)
    return PageDTO[AnnouncementDTO](
        items=[_dto(a, u) for a, u in rows],
        total=total,
        page=page,
        limit=limit,
    )


async def get_announcement(
    class_id: int, aid: int, db: AsyncSession
) -> AnnouncementDTO:
    row = await announcement_repo.get_with_author(aid, class_id, db)
    if row is None:
        raise ServiceError("Объявление не найдено", 404)
    ann, author = row
    return _dto(ann, author)


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
    # если поменялся сам автор класса (creator редактирует чужое) — все равно
    # автор объявления остаётся прежним, повторно подтягивать не надо
    return _dto(ann, author)


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

    await announcement_repo.soft_delete(ann, db)
