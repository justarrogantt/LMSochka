// Точка входа клиентского приложения:
// 1) подключаем глобальные стили,
// 2) оборачиваем приложение роутером,
// 3) монтируем в #root из index.html.
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import RootRouter from './RootRouter.tsx'

// Non-null assertion безопасен, потому что Vite-шаблон всегда содержит <div id="root" />.
createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <RootRouter />
  </BrowserRouter>,
)
