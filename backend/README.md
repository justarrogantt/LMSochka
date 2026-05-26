# LMS Backend

Бэкенд практики: авторизация по email/паролю + работа с классами и ролями.

## Стек
Python 3.12+, FastAPI, SQLAlchemy (async) + SQLite, JWT (HS256), bcrypt.

## Запуск
```bash
cp .env.example .env
# отредактируй SECRET_KEY на длинную случайную строку (>= 32 байт)

make install   # uv sync
make dev       # uvicorn с --reload на 0.0.0.0:8000
```

OpenAPI: http://localhost:8000/docs

## Тесты
```bash
SECRET_KEY=test-secret-key-that-is-long-enough-32bytes make test
```

## Make-команды
| Команда | Что делает |
|---|---|
| `make install` | поставить зависимости (uv sync) |
| `make dev` | dev-режим с reload |
| `make start` | прод-режим без reload |
| `make test` | прогнать pytest |
| `make lint` | ruff check (если подключим) |
| `make clean` | снести кеши и __pycache__ |

## Реализованные ручки

### Auth (`/api/auth`)
| Метод | Путь | Описание |
|---|---|---|
| POST | `/register` | регистрация: email, password (+ опц. first_name, last_name) |
| POST | `/login` | вход по email/паролю |
| POST | `/refresh` | обмен refresh на новую пару (rotation) |
| POST | `/logout` | отзыв текущей сессии (нужен access) |
| GET | `/me` | текущий пользователь (нужен access) |

Все защищённые ручки требуют заголовок `Authorization: Bearer <access_token>`.

### Classes (`/api/classes`)
| Метод | Путь | Описание |
|---|---|---|
| POST | `/` | создать класс (`name`, `type`: open/closed). Создатель → роль `creator`. Для closed автоматически генерится 8-символьный код. |
| GET | `/my` | список классов, где состоит пользователь, с ролью и счётчиками участников |
| GET | `/{id}` | страница класса: данные + `user_role` + `permissions` + счётчики. Только для участников. `join_code` отдаётся только тем, у кого `can_manage_members`. |
| GET | `/{id}/members` | список участников (`user_id`, email, name, role). Только для участников. |
| GET | `/{id}/role` | роль текущего юзера в классе (403 если не состоит, 404 если класса нет) |
| POST | `/join` | присоединение по коду (для закрытых классов) |
| POST | `/{id}/join-open` | присоединение к открытому классу по id (закрытым отвечает 403) |
| GET | `/public` | каталог открытых классов с опц. `?search=` (ilike по name); возвращает `is_member` |
| PATCH | `/{id}` | редактировать `name` и/или `type`. Только `creator`/`teacher`. Переход open→closed генерит код, обратный — убирает. |
| DELETE | `/{id}` | soft delete (`deleted_at`). Только `creator`. Класс пропадает из всех выборок и недоступен по коду. |
| PATCH | `/{id}/members/{userId}/role` | сменить роль участника на `student` или `teacher`. Только `creator`. Менять роль самого `creator` нельзя. |
| DELETE | `/{id}/members/{userId}` | кикнуть участника (soft delete). Только `creator`. `creator` убрать нельзя. Решения и оценки ушедшего сохраняются. |
| POST | `/{id}/leave` | самовыход из класса (soft delete своего членства). Для `student`/`teacher`. `creator` выйти не может — только удалить класс. |

### Announcements (`/api/classes/{class_id}/announcements`)
| Метод | Путь | Описание |
|---|---|---|
| POST | `/` | создать объявление (`title`, `content`). Только `teacher` или `creator`. |
| GET | `/?page=&limit=` | список объявлений класса. Любой участник. Пагинация: `page≥1`, `limit≤100` (дефолт 20). Сортировка `created_at DESC`. |
| GET | `/{aid}` | одно объявление. Любой участник. 404 если нет/удалено или из другого класса. |
| PATCH | `/{aid}` | редактировать `title`/`content` (любой набор, минимум одно поле). Автор или `creator` класса. |
| DELETE | `/{aid}` | soft delete. Автор или `creator`. |

#### Пагинация
Растущие списки оборачиваем в `{ items, total, page, limit }` (см. `app/schemas/pagination.py`). Дефолт `page=1, limit=20, max limit=100`. Маленькие списки (`/my`, `/members`) остаются массивом.

#### Permissions
`GET /{id}` отдаёт объект `permissions` с булевыми флагами для UI:

| Флаг | STUDENT | TEACHER | CREATOR |
|---|:---:|:---:|:---:|
| `can_create_assignment` | ❌ | ✅ | ✅ |
| `can_create_announcement` | ❌ | ✅ | ✅ |
| `can_grade_submissions` | ❌ | ✅ | ✅ |
| `can_submit_solution` | ✅ | ❌ | ❌ |
| `can_view_gradebook` | ❌ | ✅ | ✅ |
| `can_view_own_grades` | ✅ | ✅ | ✅ |
| `can_edit_class` | ❌ | ✅ | ✅ |
| `can_manage_members` | ❌ | ❌ | ✅ |
| `can_delete_class` | ❌ | ❌ | ✅ |

Реальная проверка прав всегда на бэке. Фронт берёт `permissions` только для отрисовки кнопок.

#### Соглашения по неймингу
Поля в API используют `snake_case` (`join_code`, `creator_id`, `students_count`). Енумы `type` и `role` — строки в нижнем регистре (`open`/`closed`, `creator`/`teacher`/`student`). См. Pydantic-схемы в `app/schemas/class_schemas.py`.

## Безопасность
- Пароли хранятся как bcrypt-хеш (cost=12).
- JWT подписан симметричным ключом из `.env`. Access TTL 15 мин, refresh — 7 дней.
- Refresh — одноразовый (rotation). При повторном использовании старого refresh все сессии юзера отзываются.
- В БД хранится только sha256 от refresh-токена.
- При логине одинаковая ошибка для неверного email и неверного пароля — не палим существование email.
- `join_code` генерится через `secrets.choice` (криптостойко) с проверкой уникальности.
- `join_code` закрытого класса отдаётся в `GET /{id}` только участникам с `can_manage_members` (сейчас — только creator). Остальные получают `null`.
