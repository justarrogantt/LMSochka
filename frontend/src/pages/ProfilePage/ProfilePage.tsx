import { useNavigate } from "react-router-dom"
import { useAuth } from "../../contexts/AuthContext"
import { useToast } from "../../components/Toast/ToastProvider"
import { Api, ApiError, ApiSilentError } from "../../services/api"
import { logout as logoutRequest } from "../../services/auth.api"
import { formatDateTime } from "../../services/helpers"
import styles from "./ProfilePage.module.css"

function getInitials(firstName: string | null, lastName: string | null, email: string): string {
  const first = firstName?.trim()[0] ?? ""
  const last = lastName?.trim()[0] ?? ""
  if (first || last) return (first + last).toUpperCase()
  return email[0].toUpperCase()
}

function getDisplayName(firstName: string | null, lastName: string | null, email: string): string {
  const name = `${firstName ?? ""} ${lastName ?? ""}`.trim()
  return name || email
}

export default function ProfilePage() {
  const { user, setUser } = useAuth()
  const navigate = useNavigate()
  const showToast = useToast()

  async function logout() {
    try {
      await logoutRequest()
      Api.clearTokens()
      setUser(null)
      navigate("/login", { replace: true })
    } catch (error) {
      if (error instanceof ApiSilentError) return

      if (error instanceof ApiError && error.status === 401) {
        Api.clearTokens()
        setUser(null)
        navigate("/login", { replace: true })
        return
      }

      showToast({ type: "error", message: (error as Error).message })
    }
  }

  if (!user) return null

  const initials = getInitials(user.first_name, user.last_name, user.email)
  const displayName = getDisplayName(user.first_name, user.last_name, user.email)

  return (
    <div className={styles.page}>
      <div className={styles.titleBlock}>
        <div className={styles.title}>Профиль</div>
      </div>

      <div className={styles.card}>
        <div className={styles.avatar}>{initials}</div>

        <div className={styles.info}>
          <div className={styles.name}>{displayName}</div>
          <div className={styles.email}>{user.email}</div>
          <div className={styles.since}>С нами с {formatDateTime(user.created_at)}</div>
        </div>
      </div>

      <button className={styles.logoutButton} type="button" onClick={() => void logout()}>
        Выйти из аккаунта
      </button>
    </div>
  )
}
