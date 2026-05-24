class ServiceError(Exception):
    """Доменная ошибка с HTTP-статусом — роутер ловит и пробрасывает в HTTPException."""

    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code

    def __str__(self) -> str:
        return self.message
