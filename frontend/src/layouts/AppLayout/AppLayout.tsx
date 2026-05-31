import { useEffect, useState } from "react"
import { NavLink, Outlet, useNavigate } from "react-router-dom"
import logo from "../../assets/logo.svg"
import BellIcon from "../../assets/icons/layout/bell.svg?react"
import CoursesIcon from "../../assets/icons/layout/courses.svg?react"
import ExitIcon from "../../assets/icons/layout/exit.svg?react"
import GradesIcon from "../../assets/icons/layout/grades.svg?react"
import HomeIcon from "../../assets/icons/layout/home.svg?react"
import SidebarIcon from "../../assets/icons/layout/sidebar.svg?react"
import UserIcon from "../../assets/icons/layout/user.svg?react"
import { useToast } from "../../components/Toast/ToastProvider"
import { useAuth } from "../../contexts/AuthContext"
import { Api, ApiError, ApiSilentError } from "../../services/api"
import { logout as logoutRequest } from "../../services/auth.api"
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

// Ключ настройки сайдбара в localStorage.
const SIDEBAR_OPEN_STORAGE_KEY = "sidebar_open"

// Берём сохранённое состояние сайдбара. Если значения нет, сайдбар закрыт.
function getInitialSidebarOpen() {
  const saved = localStorage.getItem(SIDEBAR_OPEN_STORAGE_KEY)
  return saved === "true"
}

// Сохраняем выбранное состояние, чтобы оно не сбрасывалось после перезагрузки.
function saveSidebarOpen(isOpen: boolean) {
  localStorage.setItem(SIDEBAR_OPEN_STORAGE_KEY, String(isOpen))
}

export default function AppLayout() {
  const { user, setUser } = useAuth()
  const navigate = useNavigate()
  const showToast = useToast()
  const userEmail = user?.email ?? ""

  // Открыт ли сайдбар. Если настройки ещё нет, по умолчанию он закрыт.
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(getInitialSidebarOpen)

  // Фиксируем дефолтное состояние в localStorage при первом входе.
  useEffect(() => {
    saveSidebarOpen(isSidebarOpen)
  }, [])

  // Переключаем сайдбар и сразу сохраняем новое состояние.
  function toggleSidebar() {
    setIsSidebarOpen((prev) => {
      const next = !prev
      saveSidebarOpen(next)
      return next
    })
  }

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

      showToast({
        type: "error",
        message: (error as Error).message
      })
    }
  }

  const appClassName = `${styles.app} ${isSidebarOpen ? "" : styles.appCollapsed}`
  const sidebarToggleLabel = isSidebarOpen ? "Свернуть меню" : "Развернуть меню"

  return (
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
          <button className={styles.iconButton} type="button" aria-label="Уведомления">
            <BellIcon className={styles.bellIcon} />
          </button>

          <NavLink className={styles.userCard} to="/profile" aria-label="Открыть профиль">
            <div className={styles.avatar} aria-hidden="true">
              <UserIcon className={styles.avatarIcon} />
            </div>
            <div className={styles.userEmail}>{userEmail}</div>
          </NavLink>
        </div>
      </header>

      <div className={styles.shell}>
        <aside className={styles.sidebar}>
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
                  <Icon className={styles.menuIcon} />
                  <span className={styles.menuLabel}>{item.title}</span>
                </NavLink>
              )
            })}
          </nav>

          <button className={styles.logoutButton} type="button" onClick={logout} title="Выйти">
            <ExitIcon className={styles.logoutIcon} />
            <span className={styles.menuLabel}>Выйти</span>
          </button>
        </aside>

        <div className={styles.main}>
          <div className={styles.scrollArea}>
            <main className={styles.content}>
              <Outlet />
            </main>

            <footer className={styles.footer}>
              <a className={`${styles.footerLink} ${styles.footerBrand}`} href="/">
                a4dev
              </a>
              <a className={styles.footerLink} href="/">
                Помощь
              </a>
              <a className={styles.footerLink} href="/">
                Контакты
              </a>
            </footer>
          </div>
        </div>
      </div>
    </div>
  )
}
