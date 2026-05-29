import { NavLink, Outlet, useNavigate } from "react-router-dom"
import logo from "../../assets/logo.svg"
import BellIcon from "../../assets/icons/layout/bell.svg?react"
import CoursesIcon from "../../assets/icons/layout/courses.svg?react"
import GradesIcon from "../../assets/icons/layout/grades.svg?react"
import HomeIcon from "../../assets/icons/layout/home.svg?react"
import UserIcon from "../../assets/icons/layout/user.svg?react"
import { useToast } from "../Toast/ToastProvider"
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

export default function AppLayout() {
  const { user, setUser } = useAuth()
  const navigate = useNavigate()
  const showToast = useToast()
  const userEmail = user?.email ?? ""

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
        message: error instanceof ApiError ? error.message : "Не удалось выйти из аккаунта"
      })
    }
  }

  return (
    <div className={styles.app}>
      <div className={styles.main}>
        <div className={styles.header}>
          <NavLink className={styles.brand} to="/" aria-label="Главная страница LMS">
            <img className={styles.brandLogo} src={logo} alt="4LMS logo" />
            <div className={styles.brandText}>Learning Management System</div>
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
        </div>

        <div className={styles.scrollArea}>
          <main className={styles.content}>
            <Outlet />
          </main>

          <div className={styles.footer}>
            <a className={`${styles.footerLink} ${styles.footerBrand}`} href="/">
              a4dev
            </a>
            <a className={styles.footerLink} href="/">
              Помощь
            </a>
            <a className={styles.footerLink} href="/">
              Контакты
            </a>
          </div>
        </div>
      </div>

      <div className={styles.sidebar}>
        <div className={styles.menu} aria-label="Основное меню">
          {menuItems.map((item) => {
            const Icon = item.icon

            return (
              <NavLink
                key={item.path}
                className={({ isActive }) => `${styles.menuButton} ${isActive ? styles.menuButtonActive : ""}`}
                to={item.path}
                end={item.end}
              >
                <Icon className={styles.menuIcon} />
                <div>{item.title}</div>
              </NavLink>
            )
          })}
        </div>

        <button className={styles.logoutButton} type="button" onClick={logout}>
          Выйти
        </button>
      </div>
    </div>
  )
}


