import { Route, Routes } from "react-router-dom"
import AppLayout from "./components/AppLayout/AppLayout"
import LoginPage from "./pages/LoginPage/LoginPage"
import RegisterPage from "./pages/RegisterPage/RegisterPage"
import HomePage from "./pages/HomePage/HomePage"
import ClassesPage from "./pages/ClassesPage/ClassesPage"
import ClassPage from "./pages/ClassPage/ClassPage"
import AssignmentsPage from "./pages/AssignmentsPage/AssignmentsPage"
import AssignmentPage from "./pages/AssignmentPage/AssignmentPage"
import GradesPage from "./pages/GradesPage/GradesPage"
import GradesOverviewPage from "./pages/GradesOverviewPage/GradesOverviewPage"
import ProfilePage from "./pages/ProfilePage/ProfilePage"
import ProtectedRoute from "./routes/ProtectedRoute"
import PublicRoute from "./routes/PublicRoute"

// Централизованная таблица маршрутов приложения.
export default function RootRouter() {
  return (
    <Routes>
      <Route element={<PublicRoute />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/assignments" element={<HomePage />} />
          <Route path="/classes" element={<ClassesPage />} />
          <Route path="/classes/:classId" element={<ClassPage />} />
          <Route path="/classes/:classId/assignments" element={<AssignmentsPage />} />
          <Route path="/classes/:classId/assignments/:assignmentId" element={<AssignmentPage />} />
          <Route path="/classes/:classId/grades" element={<GradesPage />} />
          <Route path="/grades" element={<GradesOverviewPage />} />
          <Route path="/profile" element={<ProfilePage />} />
        </Route>
      </Route>
    </Routes>
  )
}
