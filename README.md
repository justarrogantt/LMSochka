# LMSочка

Учебная LMS-платформа. Закрывает базовые сценарии: регистрация и вход по JWT, классы (открытые и закрытые с кодом приглашения) с ролями `creator` / `teacher` / `student`, объявления, задания, сдачи решений, оценки и gradebook, файлы и live-уведомления по WebSocket.

Монорепо: бэкенд на Python (FastAPI) и фронтенд на React. Бэк отдаёт REST API, фронт — SPA, ходит на бэк через `fetch`. Деплоятся как два отдельных контейнера за общим nginx.

## Структура

```
.
├── backend/            — FastAPI + SQLAlchemy (async) + SQLite
│   ├── app/
│   │   ├── main.py     — сборка приложения, CORS, роутеры
│   │   ├── routers/    — HTTP-слой по доменам
│   │   ├── services/   — бизнес-логика
│   │   ├── database/   — модели, репозитории, конфиг БД
│   │   └── schemas/    — DTO, валидация, ошибки
│   ├── tests/          — API-сценарии на pytest + httpx
│   ├── Dockerfile
│   └── Makefile
├── frontend/           — Vite + React + TypeScript
│   ├── src/
│   │   ├── pages/      — экраны (auth, classes, HomePage, ProfilePage, GradesOverviewPage)
│   │   ├── components/ — переиспользуемые компоненты (Modal, Toast, Pagination, …)
│   │   ├── layouts/    — каркасы (AppLayout, AuthLayout, ClassLayout)
│   │   ├── contexts/   — Auth, Notifications, Theme
│   │   ├── routes/     — ProtectedRoute / PublicRoute
│   │   ├── services/   — API-клиент и доменные api-модули
│   │   └── types/      — общие TypeScript-типы
│   ├── nginx.conf      — раздача SPA + проксирование /api на бэкенд
│   └── Dockerfile
├── compose.yaml        — запуск всего стека через Docker Compose
└── .github/workflows/  — CI для бэкенда (ruff + pytest)
```

## Стек

**Backend:** Python 3.12 · FastAPI · SQLAlchemy 2.x (async) · SQLite + `aiosqlite` · Pydantic 2 · JWT (`pyjwt`) · `uv` · pytest + httpx · ruff

**Frontend:** React 19 · TypeScript · Vite · React Router · Zod · Framer Motion · Radix UI · ESLint

## Возможности

- регистрация, логин, refresh/logout, профиль и смена пароля;
- классы с ролями `creator`, `teacher`, `student`;
- открытые и закрытые классы: вступление по `join_code` либо в открытый курс без кода;
- объявления внутри класса;
- задания с дедлайном, описанием, ссылкой на материал и максимальным баллом;
- сдача решений: черновик → отправка → возврат на доработку → повторная отправка;
- выставление и обновление оценок, сводка по своим оценкам и gradebook по классу;
- загрузка материалов к заданиям и файлов решений;
- live-уведомления по WebSocket и их история.

## Быстрый старт

### Вариант 1. Docker Compose (рекомендуется)

Поднимает бэк и фронт за nginx одной командой. Нужен только Docker.

```bash
cp .env.docker.example .env
# обязательно заменить SECRET_KEY на длинную случайную строку (>= 32 байт)

docker compose up --build
```

Приложение будет на `http://localhost:8080` (порт настраивается через `APP_PORT`). Фронт сам проксирует `/api/*` и WebSocket на бэкенд, отдельно открывать бэк не нужно. Данные (SQLite-база и загруженные файлы) хранятся в томе `lms_data`.

### Вариант 2. Запуск вручную

Нужны: **Python 3.12+** и [**uv**](https://docs.astral.sh/uv/) для бэка, **Node 22+** для фронта.

**Бэкенд:**

```bash
cd backend
cp .env.example .env
# заменить SECRET_KEY на длинную случайную строку (>= 32 байт)

make install          # uv sync
make dev              # uvicorn с --reload на :8000
```

API — на `http://localhost:8000`, интерактивная документация (OpenAPI) — на `http://localhost:8000/docs`.

**Фронтенд:**

```bash
cd frontend
cp .env.example .env
# VITE_API_URL=http://localhost:8000
# VITE_API_PREFIX=/api

npm install
npm run dev           # Vite на :5173
```

Vite в dev-режиме проксирует запросы с префиксом `VITE_API_PREFIX` (включая WebSocket) на `VITE_API_URL`.

## Конфигурация

### Backend (`backend/.env`)

| Переменная | По умолчанию | Что делает |
|---|---|---|
| `SECRET_KEY` | нет | ключ для подписи JWT, обязателен |
| `DATABASE_NAME` | `lms.db` | имя SQLite-файла базы |
| `ACCESS_TOKEN_TTL` | `15` | TTL access-токена в минутах |
| `REFRESH_TOKEN_TTL` | `10080` | TTL refresh-токена в минутах |
| `PASSWORD_MIN_LENGTH` | `8` | минимальная длина пароля |
| `JOIN_CODE_LENGTH` | `8` | длина кода вступления в закрытый класс |
| `UPLOAD_DIR` | `uploads` | директория для загруженных файлов |
| `MAX_UPLOAD_SIZE` | `20971520` | максимальный размер файла в байтах |

Строка подключения собирается в коде как `sqlite+aiosqlite:///{DATABASE_NAME}`.

### Frontend (`frontend/.env`)

| Переменная | Пример | Что делает |
|---|---|---|
| `VITE_API_URL` | `http://localhost:8000` | адрес бэкенда для dev-прокси |
| `VITE_API_PREFIX` | `/api` | префикс, который проксируется на бэкенд |

### Docker Compose (`.env` в корне)

См. [.env.docker.example](.env.docker.example): `SECRET_KEY` (обязателен), `APP_PORT` (внешний порт, по умолчанию `8080`), `ACCESS_TOKEN_TTL`, `REFRESH_TOKEN_TTL`.

## API

База всех ручек — `/api`. README не дублирует контракт: точные схемы запросов и ответов смотри в Swagger UI на `http://localhost:8000/docs`.

Домены:

- `auth` — регистрация, логин, refresh/logout, профиль, смена пароля;
- `classes` — курсы, участники, роли, вступление, выход, передача владения;
- `announcements` — объявления внутри класса;
- `assignments` — задания и списки заданий;
- `submissions` — черновики, отправка, возврат на доработку, просмотр решений;
- `grades` — выставление, обновление и удаление оценок;
- `gradebook` — сводная таблица успеваемости по классу;
- `me` — агрегированные данные текущего пользователя;
- `notifications` — история уведомлений и WebSocket;
- `files` — загрузка и скачивание файлов.

### Поведение, которое важно знать

- Все защищённые ручки ждут заголовок `Authorization: Bearer <access_token>`.
- Refresh-токены одноразовые: используется rotation, повторное применение старого refresh отзывает все сессии пользователя.
- В ответах API — `snake_case`.
- Для растущих списков — пагинация в формате `{ items, total, page, limit }`.
- `Submission` живёт в статусах `draft`, `submitted`, `returned`, `graded`.
- Многие mutation-ручки сразу возвращают актуальный DTO экрана, чтобы фронт обновлял state без дополнительного `GET`.

## Разработка

### Backend

Команды вынесены в [backend/Makefile](backend/Makefile):

| Команда | Что делает |
|---|---|
| `make install` | установить зависимости (`uv sync`) |
| `make dev` | запустить сервер с `--reload` |
| `make start` | запустить сервер без `--reload` |
| `make test` | прогнать тесты (`pytest`) |
| `make lint` | проверить код (`ruff`) |
| `make clean` | удалить кэши и `__pycache__` |

CI ([.github/workflows/backend-ci.yml](.github/workflows/backend-ci.yml)) прогоняет `ruff` и `pytest` на каждый PR и push в `main`, затрагивающий `backend/`.

### Frontend

| Скрипт | Что делает |
|---|---|
| `npm run dev` | dev-сервер Vite |
| `npm run build` | type-check + production-сборка |
| `npm run preview` | локальный просмотр production-сборки |
| `npm run lint` | проверка ESLint |

## Безопасность

- Пароли хранятся в виде bcrypt-хеша.
- JWT подписываются симметричным ключом из `.env`.
- В базе хранится только sha256-хеш refresh-токена.
- Ошибка логина единая для неверного email и неверного пароля.
- `join_code` закрытого класса виден только тем, у кого есть право управлять участниками.

## Команда

| Зона | Кто |
|---|---|
| Product manager | [@justarrogantt](https://github.com/justarrogantt) |
| Backend | [@Rezak159](https://github.com/Rezak159) |
| Frontend | [@alihor123](https://github.com/alihor123) |

## Полезные ссылки

- ТЗ и задачи в трекере (Redmine)
- [FastAPI docs](https://fastapi.tiangolo.com/)
- [SQLAlchemy 2.0 async](https://docs.sqlalchemy.org/en/20/orm/extensions/asyncio.html)
- [React + Vite](https://vitejs.dev/guide/)
