import { useNavigate } from "react-router-dom"
import { useState, type ChangeEvent, type FormEvent, type MouseEvent } from "react"
import AuthLayout from "../../../layouts/AuthLayout/AuthLayout"
import styles from "../../../layouts/AuthLayout/AuthLayout.module.css"
import { useAuth } from "../../../contexts/useAuth"
import { ApiError } from "../../../services/api"
import { login as loginRequest } from "./services/login.api"

type LoginForm = {
  email: string
  password: string
}

type LoginErrors = Partial<Record<keyof LoginForm, string>>

const defaultForm: LoginForm = {
  email: "",
  password: ""
}

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const validationErrors = {
  emailRequired: "Введите электронную почту.",
  emailInvalid: "Введите корректную электронную почту.",
  passwordRequired: "Введите пароль."
}

export default function LoginPage() {
  // Значения полей входа.
  const [userData, setUserData] = useState<LoginForm>(defaultForm)

  // Ошибки клиентской валидации под конкретные поля.
  const [inputErrors, setInputErrors] = useState<LoginErrors>({})

  // Ошибка от бэка или непредвиденная ошибка запроса.
  const [serverError, setServerError] = useState("")

  // Блокирует кнопку, пока идет запрос на вход.
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { setUser } = useAuth()
  const navigate = useNavigate()

  // Обновляет поле и сразу очищает старые ошибки.
  function updateForm(event: ChangeEvent<HTMLInputElement>) {
    const { name, value } = event.target

    setUserData((prev) => ({
      ...prev,
      [name]: value.replace(/\s/g, "")
    }))

    setInputErrors((prev) => ({
      ...prev,
      [name]: ""
    }))
    setServerError("")
  }

  // Проверяет поля до запроса, чтобы не дергать бэк пустыми данными.
  function checkForm(formData: LoginForm) {
    const newErrors: LoginErrors = {}

    if (!formData.email.trim()) {
      newErrors.email = validationErrors.emailRequired
    } else if (!emailRegex.test(formData.email)) {
      newErrors.email = validationErrors.emailInvalid
    }

    if (!formData.password) {
      newErrors.password = validationErrors.passwordRequired
    }

    setInputErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  // Отправляет данные на login, сохраняет пользователя и ведет в приложение.
  async function login() {
    setServerError("")

    const isFormValid = checkForm(userData)
    if (!isFormValid) return

    try {
      setIsSubmitting(true)
      const authData = await loginRequest(userData)

      setUser(authData.user)
      navigate("/classes", { replace: true })
    } catch (error) {
      if (error instanceof ApiError) {
        setServerError(error.message)
        return
      }
      throw error
    } finally {
      setIsSubmitting(false)
    }
  }

  // Нативная отправка формы: клик по кнопке и Enter в полях.
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void login()
  }

  // Оставляем навигацию через router, но в разметке используем обычный a.
  function goToRegister(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault()
    navigate("/register")
  }

  const errors = Object.values(inputErrors).filter(Boolean)

  return (
    <AuthLayout
      title="Войти в аккаунт"
      subtitle="Войди, чтобы продолжить работу с учебными материалами, заданиями и своим профилем."
    >
      <form className={styles.form} onSubmit={onSubmit}>
        <label className={`${styles.field} ${inputErrors.email ? styles.fieldError : ""}`} htmlFor="email">
          <div className={styles.fieldTitle}>Электронная почта</div>
          <input
            className={styles.input}
            id="email"
            name="email"
            placeholder="student@example.com"
            type="email"
            autoComplete="email"
            value={userData.email}
            onChange={updateForm}
          />
        </label>

        <label className={`${styles.field} ${inputErrors.password ? styles.fieldError : ""}`} htmlFor="password">
          <div className={styles.fieldTitle}>Пароль</div>
          <input
            className={styles.input}
            id="password"
            name="password"
            placeholder="••••••••"
            type="password"
            autoComplete="current-password"
            value={userData.password}
            onChange={updateForm}
          />
        </label>

        {errors.length > 0 && (
          <div className={styles.errorList}>
            <ul>
              {errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </div>
        )}

        {serverError && <div className={styles.serverError}>{serverError}</div>}

        <div className={styles.actions}>
          <button className={styles.primaryButton} type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Входим..." : "Войти"}
          </button>

          <div className={styles.switch}>
            <div>Нет аккаунта?</div>
            <a className={styles.switchLink} href="/register" onClick={goToRegister}>
              Зарегистрироваться
            </a>
          </div>
        </div>
      </form>
    </AuthLayout>
  )
}


