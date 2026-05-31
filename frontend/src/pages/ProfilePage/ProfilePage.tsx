import { useAuth } from "../../contexts/AuthContext"
import { useTheme } from "../../contexts/ThemeContext"
import { formatDateTime, formatUserName } from "../../services/helpers"
import styles from "./ProfilePage.module.css"

export default function ProfilePage() {
  // Текущий пользователь (гарантированно есть внутри защищённых маршрутов)
  const { user } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const userName = user ? formatUserName(user) : ""
  const userInitial = userName.trim().charAt(0).toUpperCase() || "U"

  // Есть ли заполненное имя — чтобы не дублировать email в обеих строках
  const hasName = Boolean(user?.first_name || user?.last_name)

  return (
    <div className={styles.page}>
      <div className={styles.titleBlock}>
        <div className={styles.title}>Профиль</div>
      </div>

      <div className={styles.card}>
        <div className={styles.avatar}>{userInitial}</div>

        <div className={styles.info}>
          <div className={styles.name}>{userName}</div>
          {hasName && <div className={styles.userEmail}>{user?.email}</div>}
          {user && <div className={styles.since}>С нами с {formatDateTime(user.created_at)}</div>}
        </div>
      </div>

      <div className={styles.settingsCard}>
        <div className={styles.settingRow}>
          <div className={styles.settingText}>
            <div className={styles.settingTitle}>Тема оформления</div>
            <div className={styles.settingHint}>Выберите светлый или тёмный режим интерфейса.</div>
          </div>

          <div className={styles.themeSwitch}>
            <button
              className={`${styles.themeOption} ${theme === "light" ? styles.themeOptionActive : ""}`}
              type="button"
              onClick={() => theme !== "light" && toggleTheme()}
            >
              <SunIcon className={styles.themeIcon} />
              Светлая
            </button>
            <button
              className={`${styles.themeOption} ${theme === "dark" ? styles.themeOptionActive : ""}`}
              type="button"
              onClick={() => theme !== "dark" && toggleTheme()}
            >
              <MoonIcon className={styles.themeIcon} />
              Тёмная
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function SunIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  )
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  )
}
