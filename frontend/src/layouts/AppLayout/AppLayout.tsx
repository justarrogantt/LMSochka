import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { NavLink, Outlet, useNavigate } from "react-router-dom"
import logo from "../../assets/logo.svg"
import CoursesIcon from "../../assets/icons/layout/courses.svg?react"
import ExitIcon from "../../assets/icons/layout/exit.svg?react"
import GradesIcon from "../../assets/icons/layout/grades.svg?react"
import HomeIcon from "../../assets/icons/layout/home.svg?react"
import SidebarIcon from "../../assets/icons/layout/sidebar.svg?react"
import NotificationsBell from "../../components/NotificationsBell/NotificationsBell"
import { useToast } from "../../components/Toast/ToastProvider"
import { useAuth } from "../../contexts/AuthContext"
import { NotificationsProvider } from "../../contexts/NotificationsContext"
import { DURATION, EASE_OUT } from "../../shared/motion"
import { Api, ApiError } from "../../services/api"
import { logout as logoutRequest } from "../../services/auth.api"
import { formatUserName } from "../../services/helpers"
import styles from "./AppLayout.module.css"

const menuItems = [
  {
    path: "/",
    title: "Главная страница",
    icon: HomeIcon,
    end: true
  },
  {
    path: "/classes",
    title: "Мои курсы",
    icon: CoursesIcon,
    end: false
  },
  {
    path: "/grades",
    title: "Оценки",
    icon: GradesIcon,
    end: true
  }
]

const SIDEBAR_OPEN_STORAGE_KEY = "sidebar_open"

// Ширина сайдбара в развёрнутом/свёрнутом виде (анимируем между ними)
const SIDEBAR_WIDTH_OPEN = 256
const SIDEBAR_WIDTH_COLLAPSED = 80

function getInitialSidebarOpen() {
  const saved = localStorage.getItem(SIDEBAR_OPEN_STORAGE_KEY)
  return saved === "true"
}

function saveSidebarOpen(isOpen: boolean) {
  localStorage.setItem(SIDEBAR_OPEN_STORAGE_KEY, String(isOpen))
}

export default function AppLayout() {
  const { user, setUser } = useAuth()
  const navigate = useNavigate()
  const showToast = useToast()
  const userName = user ? formatUserName(user) : ""
  const userInitial = userName.trim().charAt(0).toUpperCase() || "U"

  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(getInitialSidebarOpen)
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  useEffect(() => {
    saveSidebarOpen(isSidebarOpen)
  }, [])

  function toggleSidebar() {
    setIsSidebarOpen((prev) => {
      const next = !prev
      saveSidebarOpen(next)
      return next
    })
  }

  async function logout() {
    if (isLoggingOut) return

    setIsLoggingOut(true)
    try {
      await logoutRequest()
      Api.clearTokens()
      setUser(null)
      navigate("/login", { replace: true })
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        Api.clearTokens()
        setUser(null)
        navigate("/login", { replace: true })
        return
      }

      if (!(error instanceof ApiError)) throw error
      showToast({ type: "error", message: error.message })
    } finally {
      setIsLoggingOut(false)
    }
  }

  const appClassName = `${styles.app} ${isSidebarOpen ? "" : styles.appCollapsed}`
  const sidebarToggleLabel = isSidebarOpen ? "Свернуть меню" : "Развернуть меню"

  return (
    <NotificationsProvider>
      <div className={appClassName}>
        <header className={styles.header}>
          <button
            className={styles.collapseButton}
            type="button"
            onClick={toggleSidebar}
            aria-label={sidebarToggleLabel}
            title={sidebarToggleLabel}
          >
            <SidebarIcon className={styles.collapseIcon} />
          </button>

          <NavLink className={styles.brand} to="/" aria-label="Главная страница LMS">
            <img className={styles.brandLogo} src={logo} alt="4LMS logo" />
            <div className={styles.brandText}>LMS</div>
          </NavLink>

          <div className={styles.userActions}>
            <NotificationsBell />

            <NavLink className={styles.userCard} to="/profile" aria-label="Открыть профиль">
              <div className={styles.avatar} aria-hidden="true">{userInitial}</div>
              <div className={styles.userEmail}>{userName}</div>
            </NavLink>
          </div>
        </header>

        <div className={styles.shell}>
          <motion.aside
            className={styles.sidebar}
            initial={false}
            animate={{ width: isSidebarOpen ? SIDEBAR_WIDTH_OPEN : SIDEBAR_WIDTH_COLLAPSED }}
            transition={{ duration: DURATION.sidebar, ease: EASE_OUT }}
          >
            <nav className={styles.menu} aria-label="Основное меню">
              {menuItems.map((item) => {
                const Icon = item.icon

                return (
                  <NavLink
                    key={item.path}
                    className={({ isActive }) => `${styles.menuButton} ${isActive ? styles.menuButtonActive : ""}`}
                    to={item.path}
                    end={item.end}
                    title={item.title}
                  >
                    <span className={styles.menuIconBox}>
                      <Icon className={styles.menuIcon} />
                    </span>
                    <span className={styles.menuLabel}>{item.title}</span>
                  </NavLink>
                )
              })}
            </nav>

            <button className={styles.logoutButton} type="button" onClick={logout} title="Выйти" disabled={isLoggingOut}>
              <span className={styles.menuIconBox}>
                <ExitIcon className={styles.logoutIcon} />
              </span>
              <span className={styles.menuLabel}>{isLoggingOut ? "Выходим" : "Выйти"}</span>
            </button>
          </motion.aside>

          <div className={styles.main}>
            <div className={styles.scrollArea}>
              <main className={styles.content}>
                <Outlet />
              </main>
            </div>
          </div>
        </div>
      </div>
    </NotificationsProvider>
  )
}
