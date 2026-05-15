import { Navigate, Route, Routes } from "react-router-dom"
import LoginPage from "./pages/LoginPage/LoginPage"
import RegisterPage from "./pages/RegisterPage/RegisterPage"
import ClassesPage from "./pages/ClassesPage/ClassesPage"
import ClassPage from "./pages/ClassPage/ClassPage"
import AssignmentsPage from "./pages/AssignmentsPage/AssignmentsPage"
import AssignmentPage from "./pages/AssignmentPage/AssignmentPage"
import GradesPage from "./pages/GradesPage/GradesPage"
import ProfilePage from "./pages/ProfilePage/ProfilePage"

// Централизованная таблица маршрутов приложения.
export default function RootRouter() {
  return (
    <Routes>
      {/* Корень редиректит на /classes — главная страница. */}
      <Route path="/" element={<Navigate to="/classes" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/classes" element={<ClassesPage />} />
      <Route path="/classes/:classId" element={<ClassPage />} />
      <Route path="/classes/:classId/assignments" element={<AssignmentsPage />} />
      <Route path="/classes/:classId/assignments/:assignmentId" element={<AssignmentPage />} />
      <Route path="/classes/:classId/grades" element={<GradesPage />} />
      <Route path="/profile" element={<ProfilePage />} />
    </Routes>
  )
}
