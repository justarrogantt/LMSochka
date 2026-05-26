import enum
import uuid
from datetime import datetime

from sqlalchemy import Enum, ForeignKey, String, Text, UniqueConstraint, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class UsersTable(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    # 254 — максимальная длина email по RFC 5321
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(72))  # bcrypt всегда 60, с запасом
    first_name: Mapped[str | None] = mapped_column(String(50))
    last_name: Mapped[str | None] = mapped_column(String(50))
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(onupdate=func.now())


class SessionsTable(Base):
    """Одна запись = одна пара (access, refresh) на одном устройстве. id = jti."""

    __tablename__ = "sessions"

    # id (он же jti в JWT) кладём в payload токена,
    # чтобы по нему находить сессию при проверке access и refresh
    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    # храним sha256, а не сам токен — если БД утечёт, использовать токены не получится
    refresh_token_hash: Mapped[str] = mapped_column(String(64))
    expires_at: Mapped[datetime]
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    # refresh_used — этот refresh уже обменяли на новый (rotation);
    # revoked — сессия отозвана через logout или при детекте кражи
    refresh_used: Mapped[bool] = mapped_column(default=False)
    revoked: Mapped[bool] = mapped_column(default=False)
    device_info: Mapped[str | None] = mapped_column(String(255))  # User-Agent для удобства


class ClassType(enum.Enum):
    OPEN = "open"
    CLOSED = "closed"


class ClassRole(enum.Enum):
    CREATOR = "creator"
    TEACHER = "teacher"
    STUDENT = "student"


class ClassesTable(Base):
    __tablename__ = "classes"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100))
    type: Mapped[ClassType] = mapped_column(Enum(ClassType))
    # код приглашения только у закрытых классов
    join_code: Mapped[str | None] = mapped_column(String(16), unique=True, index=True)
    # RESTRICT — нельзя удалить юзера, пока у него есть созданные классы
    creator_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT")
    )
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(onupdate=func.now())
    # soft delete: класс остаётся в БД (история заданий/оценок), но скрыт из всех выборок
    deleted_at: Mapped[datetime | None] = mapped_column(default=None)


class ClassMembersTable(Base):
    __tablename__ = "class_members"
    # один юзер не может вступить в один класс дважды
    __table_args__ = (UniqueConstraint("class_id", "user_id", name="uq_class_user"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    class_id: Mapped[int] = mapped_column(ForeignKey("classes.id", ondelete="CASCADE"))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    role: Mapped[ClassRole] = mapped_column(Enum(ClassRole))
    joined_at: Mapped[datetime] = mapped_column(server_default=func.now())
    # soft delete: запись остаётся в БД, чтобы оценки и сданные решения ушедшего
    # участника не потерялись (нужны для аудита и просмотра в gradebook)
    deleted_at: Mapped[datetime | None] = mapped_column(default=None)


class AnnouncementsTable(Base):
    __tablename__ = "announcements"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    # удалили класс — удаляем и его объявления, держать осиротевшие смысла нет
    class_id: Mapped[int] = mapped_column(ForeignKey("classes.id", ondelete="CASCADE"))
    # RESTRICT — пока автор не пересоздан/не очищен, юзера не удалить.
    # На уровне продукта пользователя физически не удаляем, так что норм.
    author_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT")
    )
    title: Mapped[str] = mapped_column(String(200))
    # Text без жёсткого лимита в БД, max_length 10000 валидируем в Pydantic
    content: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(onupdate=func.now())
    # soft delete: объявление пропадает из выдачи, но запись остаётся для истории
    deleted_at: Mapped[datetime | None] = mapped_column(default=None)
