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
| GET | `/public?page=&limit=&search=` | `PageDTO[PublicClassDTO]` | каталог открытых классов с опц. `?search=` (ilike); включает `is_member`. |
| PATCH | `/{id}` | `ClassDetailDTO` | редактировать `name`/`type`. `creator`/`teacher`. Переход open→closed генерит код, обратный — убирает. Ответ — свежий DetailDTO с пересчитанными counts/permissions. |
| DELETE | `/{id}` | `204` | soft delete класса. Только `creator`. |
| PATCH | `/{id}/members/{userId}/role` | `ClassMembersDTO` | сменить роль на `student`/`teacher`. Только `creator`. Менять `creator` нельзя. Ответ — обновлённая секция участников + counts. |
| DELETE | `/{id}/members/{userId}` | `ClassMembersDTO` | кикнуть участника (soft delete). Только `creator`. `creator` убрать нельзя. **200 OK** с актуальным списком. |
| POST | `/{id}/leave` | `{class_id, status}` | самовыход. `student`/`teacher`. `creator` — 403 (только delete класса). **200 OK** с `{class_id, status: "left"}`. После leave можно вернуться обратно (`/join` или `/join-open`) — реактивация как `student`. |
| POST | `/{id}/transfer-ownership` | `ClassDetailDTO` | передать класс другому участнику (`new_owner_id`). Только `creator`. Новый владелец → `creator`, прежний → `teacher`. Ответ — свежий DetailDTO от лица бывшего создателя (прав уже меньше, `join_code` скрыт). 404 если получатель не активный участник, 409 если передаёшь сам себе. |

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

> Если по заданию уже есть хотя бы одна оценка, менять `max_grade` нельзя (`422`).

`AssignmentDTO` обогащён под роль смотрящего (одним запросом на всю страницу, без N+1):
- **студент** получает `my_submission` (`{submission_id, status, submitted_at, is_late, grade}`) — или `null`, если ещё не создавал решение. Хватает для бейджа в списке без отдельного GET по каждому заданию.
- **teacher/creator** получают `stats` (`{students_total, submitted_count, graded_count}`) — прогресс сдачи. `submitted_count` = статус `submitted`+`graded`, `graded_count` = `graded`.
- Неприменимое поле всегда `null` (студенту не приходит `stats`, преподавателю — `my_submission`).

### Submissions (`/api`)
| Метод | Путь | Описание |
|---|---|---|
| PUT | `/assignments/{aid}/my-submission` | сохранить черновик решения (`answer_text`, `attachment_url`). Только `student` класса задания. Если решения не было — создаётся `draft`, если было `draft/returned` — обновляется. |
| POST | `/assignments/{aid}/my-submission/submit` | отправить решение (`draft/returned -> submitted`) и проставить `submitted_at`. Только `student`. |
| GET | `/assignments/{aid}/my-submission` | получить своё решение. Только `student`. Если ещё не создавал — `200 null`. |
| GET | `/assignments/{aid}/submissions?page=&limit=&status=` | список решений по заданию для `teacher/creator`. Фильтр `status` опционален (`draft/submitted/returned/graded`). Сортировка `submitted_at DESC NULLS LAST`. |
| GET | `/submissions/{sid}` | одно решение: видно владельцу-студенту или `teacher/creator` класса задания. |
| POST | `/submissions/{sid}/return` | вернуть решение на доработку (`submitted/graded -> returned`) с опц. `comment`. Только `teacher/creator`. Если решение было оценено — оценка снимается (на доработке прежний балл неактуален). |

Статусы решения: `draft`, `submitted`, `returned`, `graded`.
`is_late` считается на бэке: `submitted_at > due_at` (если у задания есть `due_at`).
В `SubmissionDTO` есть `grade` (если оценка уже выставлена) и `return_comment` (если вернули на доработку с комментарием).

### Grades (`/api`)
| Метод | Путь | Описание |
|---|---|---|
| PUT | `/submissions/{sid}/grade` | поставить или обновить оценку (`value`, `comment`). Только `teacher/creator`. Валидация: `0 <= value <= assignment.max_grade`. Переводит решение в `graded`. |
| DELETE | `/submissions/{sid}/grade` | снять оценку (исправление ошибки). Только `teacher/creator`. Решение из `graded` возвращается в `submitted`. Отдаёт обновлённый `SubmissionDTO`. 404 если оценки не было. |
| GET | `/submissions/{sid}/grade` | получить оценку. Доступ: владелец-студент решения или `teacher/creator` класса. |

### Gradebook (`/api/classes/{class_id}/gradebook`)
| Метод | Путь | Описание |
|---|---|---|
| GET | `/api/classes/{class_id}/gradebook` | сводная таблица по классу: `assignments`, `students` (включая `is_active=false` ушедших), `cells` со статусами/баллами/late-флагом. Только `teacher/creator`. |

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
- Пароли хранятся как bcrypt-хеш (cost=12). Перед bcrypt пароль прехешируется `sha256 → base64`: снимает 72-байтный лимит bcrypt (важно для кириллицы/эмодзи, иначе bcrypt 5.x бросает `ValueError`) и не теряет «хвост» длинного пароля.
- JWT подписан симметричным ключом из `.env`. Access TTL 15 мин, refresh — 7 дней.
- Refresh — одноразовый (rotation). При повторном использовании старого refresh все сессии юзера отзываются.
- В БД хранится только sha256 от refresh-токена.
- При логине одинаковая ошибка для неверного email и неверного пароля — не палим существование email.
- `join_code` генерится через `secrets.choice` (криптостойко) с проверкой уникальности.
- `join_code` закрытого класса отдаётся в `GET /{id}` только участникам с `can_manage_members` (сейчас — только creator). Остальные получают `null`.
