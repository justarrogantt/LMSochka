# LMS Backend

Бэкенд практики: авторизация по email/паролю + работа с классами и ролями.

## Стек
Python 3.12+, FastAPI, SQLAlchemy (async) + SQLite, JWT (HS256), bcrypt.

## Запуск
```bash
cp .env.example .env
# отредактируй SECRET_KEY на длинную случайную строку (>= 32 байт)

uv sync
uv run uvicorn app.main:app --reload --port 8000
```

OpenAPI: http://localhost:8000/docs

## Тесты
```bash
SECRET_KEY=test-secret-key-that-is-long-enough-32bytes uv run pytest
```

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
| POST | `/` | создать класс (`name`, `type`: open/closed). Создатель → роль creator. Для closed автоматически генерится 8-символьный код. |
| GET | `/my` | список классов, где состоит пользователь, с его ролью |
| POST | `/join` | присоединение по коду (для закрытых классов) |
| POST | `/{id}/join` | присоединение к открытому классу по id |
| GET | `/{id}/role` | роль текущего юзера в классе (404 если не состоит) |

## Безопасность
- Пароли хранятся как bcrypt-хеш (cost=12).
- JWT подписан симметричным ключом из `.env`. Access TTL 15 мин, refresh — 7 дней.
- Refresh — одноразовый (rotation). При повторном использовании старого refresh все сессии юзера отзываются.
- В БД хранится только sha256 от refresh-токена.
- При логине одинаковая ошибка для неверного email и неверного пароля — не палим существование email.
- `join_code` генерится через `secrets.token_urlsafe` (криптостойко) с проверкой уникальности.
