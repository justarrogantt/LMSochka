import { Navigate, Outlet } from "react-router-dom"
import { useAuth } from "../contexts/useAuth"

export default function ProtectedRoute() {
  const { user, isAuthLoading } = useAuth()

  if (isAuthLoading) {
    return null
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}
