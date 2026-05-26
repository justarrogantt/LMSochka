"""Обёртка для пагинированных списков и зависимость для query-параметров.

Используется на эндпоинтах с растущими списками (объявления, задания, решения,
публичный каталог классов). Для маленьких фиксированных списков (members, my)
оставляем чистый массив.
"""

from fastapi import Query
from pydantic import BaseModel


class PageDTO[T](BaseModel):
    items: list[T]
    total: int
    page: int
    limit: int


class PageParams:
    """Зависимость для page/limit. `max limit=100` — чтобы клиент не запросил всё разом."""

    def __init__(
        self,
        page: int = Query(default=1, ge=1, description="Номер страницы, начиная с 1"),
        limit: int = Query(
            default=20, ge=1, le=100, description="Размер страницы, до 100"
        ),
    ) -> None:
        self.page = page
        self.limit = limit
        # offset считаем тут, чтобы не дублировать в каждом сервисе
        self.offset = (page - 1) * limit
