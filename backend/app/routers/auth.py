from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.database import get_db
from app.database.models import UsersTable
from app.dependencies import get_current_user
from app.schemas.auth_schemas import (
    AuthSuccessDTO,
    ChangePasswordRequest,
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    StatusDTO,
    UpdateMeRequest,
    UserDTO,
)
from app.services import auth_service

auth_router = APIRouter(prefix="/auth", tags=["Auth"])


@auth_router.post("/register", status_code=201)
async def register(
    body: RegisterRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> AuthSuccessDTO:
    """Регистрация по email/паролю. 409 если такой email уже есть."""
    return await auth_service.register(
        email=body.email,
        password=body.password,
        first_name=body.first_name,
        last_name=body.last_name,
        db=db,
        device_info=request.headers.get("User-Agent"),
    )


@auth_router.post("/login")
async def login(
    body: LoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> AuthSuccessDTO:
    """Вход по email/паролю. Создаёт новую сессию с парой токенов."""
    return await auth_service.login(
        email=body.email,
        password=body.password,
        db=db,
        device_info=request.headers.get("User-Agent"),
    )


@auth_router.post("/refresh")
async def refresh(
    body: RefreshRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> AuthSuccessDTO:
    """Обмен refresh-токена на новую пару (rotation). Повторное использование отзовёт все сессии."""
    return await auth_service.refresh_tokens(
        refresh_token=body.refresh_token,
        db=db,
        device_info=request.headers.get("User-Agent"),
    )


@auth_router.post("/logout", status_code=204)
async def logout(
    context: tuple[UsersTable, str] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Выход с текущего устройства — отзывает только эту сессию (по jti)."""
    _, jti = context
    await auth_service.logout(jti, db)


@auth_router.get("/me")
async def me(
    context: tuple[UsersTable, str] = Depends(get_current_user),
) -> UserDTO:
    """Текущий пользователь по access-токену."""
    user, _ = context
    return UserDTO.model_validate(user)


@auth_router.patch("/me")
async def update_me(
    body: UpdateMeRequest,
    context: tuple[UsersTable, str] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserDTO:
    user, _ = context
    return await auth_service.update_me(
        user,
        email=body.email,
        first_name=body.first_name,
        last_name=body.last_name,
        db=db,
    )


@auth_router.post("/change-password")
async def change_password(
    body: ChangePasswordRequest,
    context: tuple[UsersTable, str] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StatusDTO:
    user, jti = context
    await auth_service.change_password(
        user,
        current_jti=jti,
        current_password=body.current_password,
        new_password=body.new_password,
        db=db,
    )
    return StatusDTO(status="ok")
