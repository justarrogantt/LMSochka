# LMSочка

LMS-платформа: регистрация и вход через JWT, классы (открытые и закрытые с кодом приглашения), роли участников (creator / teacher / student).

Учебный проект, монорепо: бэкенд на Python (FastAPI) и фронтенд на React.

## Структура

```
.
├── backend/    — FastAPI + SQLAlchemy + SQLite
└── frontend/   — Vite + React + TypeScript
```

Бэкенд и фронт деплоятся отдельно. Бэк отдаёт REST API, фронт — SPA, ходит на бэк через `fetch`.

## Команда

| Зона | Кто |
|---|---|
| Backend | [@justarrogantt](https://github.com/justarrogantt) |
| Frontend | TBD |

## Быстрый старт

Нужны: **Python 3.12+** и [**uv**](https://docs.astral.sh/uv/) для бэка, **Node 20+** для фронта.

### 1. Бэкенд

```bash
cd backend
cp .env.example .env
# отредактируй SECRET_KEY на длинную случайную строку (>= 32 байт)

uv sync
uv run uvicorn app.main:app --reload --port 8000
```

API будет на `http://localhost:8000`, интерактивная документация — `http://localhost:8000/docs`.

### 2. Фронтенд

```bash
cd frontend
npm install
npm run dev
```

Vite поднимется на `http://localhost:5173` (по умолчанию).

## API

База всех ручек — `http://localhost:8000/api`.

Подробности и примеры — в [backend/README.md](backend/README.md) и в Swagger UI на `/docs`.

Кратко:

**Auth** (`/api/auth`)
- `POST /register` — регистрация по email/паролю
- `POST /login` — вход
- `POST /refresh` — обмен refresh-токена на новую пару
- `POST /logout` — выход с текущего устройства
- `GET  /me` — текущий пользователь

**Classes** (`/api/classes`)
- `POST /` — создать класс (open/closed)
- `GET  /my` — список моих классов с ролью
- `POST /join` — присоединение по коду (для закрытых)
- `POST /{id}/join` — присоединение к открытому классу
- `GET  /{id}/role` — моя роль в классе

Защищённые ручки требуют заголовок:
```
Authorization: Bearer <access_token>
```

## Воркфлоу

Работаем в отдельных ветках, мерджим через PR в `main`.

Соглашение по именам веток:
- `backend/<фича>` — для бэка
- `frontend/<фича>` — для фронта

```bash
git checkout main && git pull
git checkout -b backend/имя-фичи     # или frontend/имя-фичи
# ...работа в своей зоне...
git add backend/  # или frontend/
git commit -m "осмысленное сообщение"
git push -u origin backend/имя-фичи
# открыть PR на GitHub
```

Не пушим напрямую в `main`. Не трогаем чужую папку без согласования.

## Полезные ссылки

- ТЗ и задачи в трекере (Redmine)
- [FastAPI docs](https://fastapi.tiangolo.com/)
- [SQLAlchemy 2.0 async](https://docs.sqlalchemy.org/en/20/orm/extensions/asyncio.html)
- [React + Vite](https://vitejs.dev/guide/)
