from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.config import settings


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=settings.PASSWORD_MIN_LENGTH, max_length=128)
    first_name: str | None = Field(default=None, max_length=50)
    last_name: str | None = Field(default=None, max_length=50)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class RefreshRequest(BaseModel):
    refresh_token: str


class UserDTO(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    first_name: str | None
    last_name: str | None
    created_at: datetime
    updated_at: datetime | None


class AuthSuccessDTO(BaseModel):
    user: UserDTO
    access_token: str
    refresh_token: str
