import { createContext, useContext, type Dispatch, type SetStateAction } from "react"
import type { AuthUser } from "../services/auth.api"

export type AuthContextValue = {
  user: AuthUser | null
  setUser: Dispatch<SetStateAction<AuthUser | null>>
  isAuthLoading: boolean
  runAuth: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth() {
  const value = useContext(AuthContext)

  if (!value) {
    throw new Error("useAuth должен использоваться внутри AuthProvider")
  }

  return value
}
