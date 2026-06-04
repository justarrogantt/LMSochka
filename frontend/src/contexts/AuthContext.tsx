import { useEffect, useState, type ReactNode } from "react"
import { useNavigate } from "react-router-dom"
import { useToast } from "../components/Toast/useToast"
import { useDelayedLoading } from "../hooks/useDelayedLoading"
import { API_UNAUTHORIZED_EVENT, ApiError } from "../services/api"
import { getCurrentUser } from "../services/auth.api"
import type { AuthUser } from "../services/auth.api"
import { AuthContext } from "./useAuth"

const publicPaths = new Set(["/login", "/register"])

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isAuthLoading, onAuthLoadingChange] = useDelayedLoading(0, true)
  const navigate = useNavigate()
  const showToast = useToast()

  async function runAuth() {
    try {
      onAuthLoadingChange(true)
      const currentUser = await getCurrentUser()

      setUser(currentUser)
      onAuthLoadingChange(false)
    } catch (error) {
      setUser(null)
      onAuthLoadingChange(false)

      if (error instanceof ApiError) {
        if (error.status === 401) {
          return
        }

        showToast({ type: "error", message: error.message })
        return
      }

      throw error
    }
  }

  useEffect(() => {
    function onUnauthorized() {
      setUser(null)
      onAuthLoadingChange(false)

      if (!publicPaths.has(window.location.pathname)) {
        navigate("/login", { replace: true })
      }
    }

    window.addEventListener(API_UNAUTHORIZED_EVENT, onUnauthorized)
    void runAuth()

    return () => {
      window.removeEventListener(API_UNAUTHORIZED_EVENT, onUnauthorized)
    }
  }, [])

  return (
    <AuthContext.Provider value={{ user, setUser, isAuthLoading, runAuth }}>
      {children}
    </AuthContext.Provider>
  )
}
