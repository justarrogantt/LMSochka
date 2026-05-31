import {
  createContext,
  useContext,
  useEffect,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction
} from "react"
import { useNavigate } from "react-router-dom"
import { useToast } from "../components/Toast/ToastProvider"
import { useDelayedLoading } from "../hooks/useDelayedLoading"
import { API_UNAUTHORIZED_EVENT, ApiError } from "../services/api"
import { getCurrentUser } from "../services/auth.api"
import type { AuthUser } from "../services/auth.api"

type AuthContextValue = {
  user: AuthUser | null
  setUser: Dispatch<SetStateAction<AuthUser | null>>
  isAuthLoading: boolean
  runAuth: () => Promise<void>
}

const publicPaths = new Set(["/login", "/register"])
const AuthContext = createContext<AuthContextValue | null>(null)

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

export function useAuth() {
  const value = useContext(AuthContext)

  if (!value) {
    throw new Error("useAuth должен использоваться внутри AuthProvider")
  }

  return value
}

