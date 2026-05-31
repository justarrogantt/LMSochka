// Страница регистрации нового пользователя.
import { useNavigate } from "react-router-dom"
import { useState, type ChangeEvent, type FormEvent, type MouseEvent } from "react"
import AuthLayout from "../../../layouts/AuthLayout/AuthLayout"
import styles from "../../../layouts/AuthLayout/AuthLayout.module.css"
import { useAuth } from "../../../contexts/AuthContext"
import { ApiSilentError } from "../../../services/api"
import { register as registerRequest } from "./services/register.api"

type RegisterForm = {
  email: string
  password: string
  repeatPassword: string
}

type RegisterErrors = Partial<Record<keyof RegisterForm, string>>

const defaultForm: RegisterForm = {
  email: "",
  password: "",
  repeatPassword: ""
}

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const passwordMinLength = 8

const validationErrors = {
  emailRequired: "Введите электронную почту.",
  emailInvalid: "Введите корректную электронную почту.",
  passwordRequired: "Введите пароль.",
  passwordInvalid: "Пароль должен быть не короче 8 символов.",
  repeatPasswordRequired: "Повторите пароль.",
  repeatPasswordMismatch: "Пароли не совпадают."
}

export default function RegisterPage() {
  // Значения полей регистрации.
  const [userData, setUserData] = useState<RegisterForm>(defaultForm)

  // Ошибки клиентской валидации под конкретные поля.
  const [inputErrors, setInputErrors] = useState<RegisterErrors>({})

  // Ошибка от бэка или непредвиденная ошибка запроса.
  const [serverError, setServerError] = useState("")

  // Блокирует кнопку, пока идет запрос на регистрацию.
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
  function checkForm(formData: RegisterForm) {
    const newErrors: RegisterErrors = {}

    if (!formData.email.trim()) {
      newErrors.email = validationErrors.emailRequired
    } else if (!emailRegex.test(formData.email)) {
      newErrors.email = validationErrors.emailInvalid
    }

    if (!formData.password) {
      newErrors.password = validationErrors.passwordRequired
    } else if (formData.password.length < passwordMinLength) {
      newErrors.password = validationErrors.passwordInvalid
    }

    if (!formData.repeatPassword) {
      newErrors.repeatPassword = validationErrors.repeatPasswordRequired
    } else if (formData.password !== formData.repeatPassword) {
      newErrors.password = validationErrors.repeatPasswordMismatch
      newErrors.repeatPassword = validationErrors.repeatPasswordMismatch
    }

    setInputErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  // Создает аккаунт, сохраняет пользователя и ведет в приложение.
  async function register() {
    setServerError("")

    const isFormValid = checkForm(userData)
    if (!isFormValid) return

    try {
      setIsSubmitting(true)
      const authData = await registerRequest({
        email: userData.email,
        password: userData.password
      })

      setUser(authData.user)
      navigate("/classes", { replace: true })
    } catch (error) {
      if (error instanceof ApiSilentError) return

      setServerError((error as Error).message)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Нативная отправка формы: клик по кнопке и Enter в полях.
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void register()
  }

  // Оставляем навигацию через router, но в разметке используем обычный a.
  function goToLogin(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault()
    navigate("/login")
  }

  const errors = Object.values(inputErrors).filter(Boolean)

  return (
    <AuthLayout title="Создать аккаунт" subtitle="Зарегистрируйся, чтобы получить доступ к учебной платформе.">
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
            autoComplete="new-password"
            value={userData.password}
            onChange={updateForm}
          />
        </label>

        <label
          className={`${styles.field} ${inputErrors.repeatPassword ? styles.fieldError : ""}`}
          htmlFor="repeatPassword"
        >
          <div className={styles.fieldTitle}>Повторите пароль</div>
          <input
            className={styles.input}
            id="repeatPassword"
            name="repeatPassword"
            placeholder="••••••••"
            type="password"
            autoComplete="new-password"
            value={userData.repeatPassword}
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
            {isSubmitting ? "Регистрируем..." : "Зарегистрироваться"}
          </button>

          <div className={styles.switch}>
            <div>Уже есть аккаунт?</div>
            <a className={styles.switchLink} href="/login" onClick={goToLogin}>
              Войти
            </a>
          </div>
        </div>
      </form>
    </AuthLayout>
  )
}


