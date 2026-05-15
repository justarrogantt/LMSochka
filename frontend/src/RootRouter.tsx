import { Route, Routes } from "react-router-dom"
import MainPage from "./pages/MainPage/MainPage"

// Централизованная таблица маршрутов.
// Здесь удобно держать всю структуру навигации проекта.
export default function RootRouter() {
  return (
    <Routes>
      {/* Базовый маршрут приложения. По мере роста проекта добавляй здесь новые роуты. */}
      <Route path="/" element={<MainPage />} />
    </Routes>
  )
}
