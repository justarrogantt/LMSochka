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
| Метод | Путь | Ответ | Описание |
|---|---|---|---|
| POST | `/` | `MyClassDTO` | создать класс (`name`, `type`). `creator` сразу получает карточку с counts и `join_code` (для closed). |
| GET | `/my` | `MyClassDTO[]` | список моих курсов с ролью и счётчиками. |
| GET | `/{id}` | `ClassDetailDTO` | страница класса: данные + `user_role` + `permissions` + counts. Только для участников. `join_code` виден только при `can_manage_members`. |
| GET | `/{id}/members` | `ClassMembersDTO` | `{ items: ClassMemberDTO[], students_count, teachers_count }`. Только для участников. |
| GET | `/{id}/role` | `ClassRoleDTO` | роль текущего юзера в классе (403 если не состоит, 404 если класса нет). |
| POST | `/join` | `MyClassDTO` | присоединение по коду (для закрытых). Возвращает карточку «Мои курсы». |
| POST | `/{id}/join-open` | `MyClassDTO` | присоединение к открытому классу. Закрытым — 403. Ответ как у `/join`. |
| GET | `/public` | `PublicClassDTO[]` | каталог открытых классов с опц. `?search=` (ilike); включает `is_member`. |
| PATCH | `/{id}` | `ClassDetailDTO` | редактировать `name`/`type`. `creator`/`teacher`. Переход open→closed генерит код, обратный — убирает. Ответ — свежий DetailDTO с пересчитанными counts/permissions. |
| DELETE | `/{id}` | `204` | soft delete класса. Только `creator`. |
| PATCH | `/{id}/members/{userId}/role` | `ClassMembersDTO` | сменить роль на `student`/`teacher`. Только `creator`. Менять `creator` нельзя. Ответ — обновлённая секция участников + counts. |
| DELETE | `/{id}/members/{userId}` | `ClassMembersDTO` | кикнуть участника (soft delete). Только `creator`. `creator` убрать нельзя. **200 OK** с актуальным списком. |
| POST | `/{id}/leave` | `{class_id, status}` | самовыход. `student`/`teacher`. `creator` — 403 (только delete класса). **200 OK** с `{class_id, status: "left"}`. |

> **Контракт для оптимистичных обновлений на фронте:** все mutation-ручки (`POST`/`PATCH`/`DELETE`, где есть смысл) возвращают тот же DTO, что использует фронт для отрисовки соответствующего экрана. После любой мутации фронту не нужен дополнительный `GET` — он сразу обновляет state. Исключение: `DELETE /classes/{id}` остаётся `204` (класс пропал, обновлять нечего — фронт сам удалит карточку).

### Announcements (`/api/classes/{class_id}/announcements`)
| Метод | Путь | Описание |
|---|---|---|
| POST | `/` | создать объявление (`title`, `content`). Только `teacher` или `creator`. |
| GET | `/?page=&limit=` | список объявлений класса. Любой участник. Пагинация: `page≥1`, `limit≤100` (дефолт 20). Сортировка `created_at DESC`. |
| GET | `/{aid}` | одно объявление. Любой участник. 404 если нет/удалено или из другого класса. |
| PATCH | `/{aid}` | редактировать `title`/`content` (любой набор, минимум одно поле). Автор или `creator` класса. |
| DELETE | `/{aid}` | soft delete. Автор или `creator`. |

### Assignments (`/api/classes/{class_id}/assignments`)
| Метод | Путь | Описание |
|---|---|---|
| POST | `/` | создать задание (`title`, `description` опц., `material_url` опц., `due_at` опц., `max_grade > 0`). Только `teacher`/`creator`. |
| GET | `/?page=&limit=` | список заданий класса. Любой участник. Пагинация и сортировка как у объявлений. |
| GET | `/{aid}` | одно задание. Любой участник. 404 если нет/удалено/из другого класса. |
| PATCH | `/{aid}` | редактировать `title`/`description`/`material_url`/`due_at`/`max_grade`. `teacher`/`creator`. `material_url=null` и `due_at=null` сбрасывают поле. |
| DELETE | `/{aid}` | soft delete. `teacher`/`creator`. Решения и оценки остаются в БД для аудита. |

> `max_grade` после первой оценки менять будет нельзя — проверка зайдёт вместе с модулем оценок.

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
