import UserIcon from "../../assets/icons/layout/user.svg?react"
import { useAuth } from "../../contexts/AuthContext"
import { formatDateTime } from "../../services/helpers"
import styles from "./ProfilePage.module.css"

export default function ProfilePage() {
  // Текущий пользователь (гарантированно есть внутри защищённых маршрутов)
  const { user } = useAuth()

  return (
    <div className={styles.page}>
      <div className={styles.titleBlock}>
        <div className={styles.title}>Профиль</div>
      </div>

      <div className={styles.card}>
        <div className={styles.avatar}>
          <UserIcon className={styles.avatarIcon} />
        </div>

        <div className={styles.info}>
          <div className={styles.email}>{user?.email}</div>
          {user && <div className={styles.since}>С нами с {formatDateTime(user.created_at)}</div>}
        </div>
      </div>
    </div>
  )
}
