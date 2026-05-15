# React TS Template

Стартовый шаблон для проектов на **React + TypeScript + Vite**.
Подходит как база для новых приложений с уже подготовленной структурой и API-слоем.

## Что внутри

- Маршрутизация: `src/RootRouter.tsx`
- Стартовая страница: `src/pages/MainPage/MainPage.tsx`
- Универсальный API-клиент: `src/services/api.ts`
- Хук отложенного лоадера: `src/hooks/useDelayedLoading.ts`
- Базовый компонент загрузки: `src/components/Loading`
- Папка для схем: `src/schemas/`
- Прокси для API через `.env` (`VITE_API_URL`, `VITE_API_PREFIX`)

## Структура

- `src/main.tsx` - точка входа приложения
- `src/pages/` - страницы
- `src/components/` - переиспользуемые компоненты
- `src/hooks/` - переиспользуемые хуки
- `src/services/` - API и сервисный слой
- `src/types/` - общие TypeScript-типы
- `src/schemas/` - схемы (JSON Schema/OpenAPI/ER-диаграммы и т.д.)

## Переменные окружения

- `.env.example` - шаблон переменных
- `.env` - локальные значения для разработки

Скопируй `.env.example` в `.env` и укажи нужные значения.

## Скрипты

- `npm run dev` - запуск dev-сервера
- `npm run build` - type-check + production build
- `npm run preview` - локальный просмотр production-сборки
- `npm run lint` - проверка линтером

## Быстрый старт

```bash
npm install
npm run dev
```

## Примечание

`node_modules` и `dist` в репозиторий не коммитятся.
