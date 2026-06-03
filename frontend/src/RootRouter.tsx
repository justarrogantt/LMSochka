import { Route, Routes } from "react-router-dom"
import AppLayout from "./layouts/AppLayout/AppLayout"
import LoginPage from "./pages/auth/LoginPage/LoginPage"
import RegisterPage from "./pages/auth/RegisterPage/RegisterPage"
import HomePage from "./pages/HomePage/HomePage"
import ClassesPage from "./pages/classes/ClassesPage/ClassesPage"
import PublicClassesPage from "./pages/classes/PublicClassesPage/PublicClassesPage"
import ClassLayout from "./layouts/ClassLayout/ClassLayout"
import ClassPage from "./pages/classes/ClassPage/ClassPage"
import ClassAnnouncementsPage from "./pages/classes/ClassAnnouncementsPage/ClassAnnouncementsPage"
import ClassMembersPage from "./pages/classes/ClassMembersPage/ClassMembersPage"
import AssignmentsPage from "./pages/classes/AssignmentsPage/AssignmentsPage"
import AssignmentPage from "./pages/classes/AssignmentPage/AssignmentPage"
import AnnouncementPage from "./pages/classes/AnnouncementPage/AnnouncementPage"
import GradesPage from "./pages/classes/GradesPage/GradesPage"
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
          <Route path="/classes/public" element={<PublicClassesPage />} />
          <Route path="/classes/:classId" element={<ClassLayout />}>
            <Route index element={<ClassPage />} />
            <Route path="announcements" element={<ClassAnnouncementsPage />} />
            <Route path="announcements/:announcementId" element={<AnnouncementPage />} />
            <Route path="assignments" element={<AssignmentsPage />} />
            <Route path="assignments/:assignmentId" element={<AssignmentPage />} />
            <Route path="members" element={<ClassMembersPage />} />
            <Route path="grades" element={<GradesPage />} />
          </Route>
          <Route path="/grades" element={<GradesOverviewPage />} />
          <Route path="/profile" element={<ProfilePage />} />
        </Route>
      </Route>
    </Routes>
  )
}
