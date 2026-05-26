import { Navigate, Outlet } from "react-router-dom"
import { useAuth } from "../contexts/AuthContext"

export default function PublicRoute() {
  const { user, isAuthLoading } = useAuth()

  if (isAuthLoading) {
    return null
  }

  if (user) {
    return <Navigate to="/classes" replace />
  }

  return <Outlet />
}
