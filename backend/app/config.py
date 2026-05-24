from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    DATABASE_NAME: str = "lms.db"

    SECRET_KEY: str
    ALGORITHM: str = "HS256"

    ACCESS_TOKEN_TTL: int = 15  # минут
    REFRESH_TOKEN_TTL: int = 10080  # минут (7 дней)

    PASSWORD_MIN_LENGTH: int = 8
    JOIN_CODE_LENGTH: int = 8

    @property
    def database_url(self) -> str:
        return f"sqlite+aiosqlite:///{self.DATABASE_NAME}"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


settings = Settings()
