import { useRef, useState } from "react"
import { AnimatePresence } from "framer-motion"
import EditIcon from "../../assets/icons/classes/edit.svg?react"
import Modal from "../../components/Modal/Modal"
import { useToast } from "../../components/Toast/ToastProvider"
import { useAuth } from "../../contexts/AuthContext"
import { useTheme } from "../../contexts/ThemeContext"
import { ApiSilentError } from "../../services/api"
import type { AuthUser } from "../../services/auth.api"
import { formatDateTime, formatUserName } from "../../services/helpers"
import { changePassword, updateProfile } from "./services/profile.api"
import styles from "./ProfilePage.module.css"

export default function ProfilePage() {
  // Текущий пользователь (гарантированно есть внутри защищённых маршрутов)
  const { user, setUser } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const userName = user ? formatUserName(user) : ""
  const userInitial = userName.trim().charAt(0).toUpperCase() || "U"

  // Есть ли заполненное имя — чтобы не дублировать email в обеих строках
  const hasName = Boolean(user?.first_name || user?.last_name)

  // Открыта ли модалка редактирования
  const [isEditing, setIsEditing] = useState(false)

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

        <button className={styles.editButton} type="button" onClick={() => setIsEditing(true)}>
          Редактировать
          <EditIcon className={styles.editIcon} />
        </button>
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

      <AnimatePresence>
        {isEditing && user && (
          <EditProfileModal user={user} onSaved={setUser} onClose={() => setIsEditing(false)} />
        )}
      </AnimatePresence>
    </div>
  )
}

type EditFormErrors = {
  firstName?: string
  lastName?: string
  email?: string
  currentPassword?: string
  newPassword?: string
  repeatPassword?: string
}

// Те же правила, что и на странице регистрации
const nameRegex = /^[A-Za-zА-Яа-яЁё \-]+$/
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const passwordMinLength = 8
const nameMaxLength = 50

type EditProfileModalProps = {
  user: AuthUser
  onSaved: (user: AuthUser) => void
  onClose: () => void
}

// Модалка редактирования профиля: имя, фамилия, email (логин) и опциональная смена пароля
function EditProfileModal({ user, onSaved, onClose }: EditProfileModalProps) {
  const showToast = useToast()
  const [firstName, setFirstName] = useState(user.first_name ?? "")
  const [lastName, setLastName] = useState(user.last_name ?? "")
  const [email, setEmail] = useState(user.email)
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [repeatPassword, setRepeatPassword] = useState("")

  // Ошибки клиентской валидации по полям и ошибка от сервера
  const [errors, setErrors] = useState<EditFormErrors>({})
  const [serverError, setServerError] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  // Защита от двойной отправки формы
  const pendingRef = useRef(false)

  // Пароль меняем, только если пользователь тронул хоть одно из полей пароля
  const wantsPasswordChange = Boolean(currentPassword || newPassword || repeatPassword)

  // Сбрасываем ошибку поля и серверную ошибку при правке
  function clearFieldError(field: keyof EditFormErrors) {
    setErrors((prev) => ({ ...prev, [field]: "" }))
    setServerError("")
  }

  // Проверка полей до запроса
  function validate(): boolean {
    const nextErrors: EditFormErrors = {}

    const trimmedFirst = firstName.trim()
    if (!trimmedFirst) {
      nextErrors.firstName = "Введите имя."
    } else if (trimmedFirst.length > nameMaxLength) {
      nextErrors.firstName = "Имя не длиннее 50 символов."
    } else if (!nameRegex.test(trimmedFirst)) {
      nextErrors.firstName = "Имя — только русские или латинские буквы."
    }

    const trimmedLast = lastName.trim()
    if (!trimmedLast) {
      nextErrors.lastName = "Введите фамилию."
    } else if (trimmedLast.length > nameMaxLength) {
      nextErrors.lastName = "Фамилия не длиннее 50 символов."
    } else if (!nameRegex.test(trimmedLast)) {
      nextErrors.lastName = "Фамилия — только русские или латинские буквы."
    }

    const trimmedEmail = email.trim()
    if (!trimmedEmail) {
      nextErrors.email = "Введите электронную почту."
    } else if (!emailRegex.test(trimmedEmail)) {
      nextErrors.email = "Введите корректную электронную почту."
    }

    if (wantsPasswordChange) {
      if (!currentPassword) {
        nextErrors.currentPassword = "Введите текущий пароль."
      }
      if (!newPassword) {
        nextErrors.newPassword = "Введите новый пароль."
      } else if (newPassword.length < passwordMinLength) {
        nextErrors.newPassword = "Пароль должен быть не короче 8 символов."
      } else if (newPassword === currentPassword) {
        nextErrors.newPassword = "Новый пароль должен отличаться от текущего."
      }
      if (!repeatPassword) {
        nextErrors.repeatPassword = "Повторите новый пароль."
      } else if (newPassword !== repeatPassword) {
        nextErrors.repeatPassword = "Пароли не совпадают."
      }
    }

    setErrors(nextErrors)
    return Object.values(nextErrors).every((value) => !value)
  }

  async function submit() {
    if (pendingRef.current) return

    setServerError("")
    if (!validate()) return

    pendingRef.current = true
    setIsSubmitting(true)
    try {
      // Сначала сохраняем профиль, чтобы имя сразу обновилось в шапке и на главной
      const updated = await updateProfile({
        first_name: firstName.trim() || null,
        last_name: lastName.trim() || null,
        email: email.trim()
      })
      onSaved(updated)

      // Затем, если нужно, меняем пароль отдельным запросом
      if (wantsPasswordChange) {
        await changePassword({ current_password: currentPassword, new_password: newPassword })
      }

      showToast({ type: "neutral", message: "Профиль обновлён" })
      onClose()
    } catch (error) {
      if (error instanceof ApiSilentError) return
      // Ошибку (email занят, неверный текущий пароль и т.п.) показываем прямо в форме
      setServerError((error as Error).message)
    } finally {
      pendingRef.current = false
      setIsSubmitting(false)
    }
  }

  return (
    <Modal title="Редактировать профиль" onClose={onClose} disabled={isSubmitting}>
      <label className={styles.field}>
        <div className={styles.fieldLabel}>Имя</div>
        <input
          className={`${styles.input} ${errors.firstName ? styles.inputError : ""}`}
          type="text"
          value={firstName}
          onChange={(event) => {
            setFirstName(event.target.value)
            clearFieldError("firstName")
          }}
          placeholder="Иван"
          maxLength={nameMaxLength}
          disabled={isSubmitting}
        />
        {errors.firstName && <div className={styles.fieldErrorText}>{errors.firstName}</div>}
      </label>

      <label className={styles.field}>
        <div className={styles.fieldLabel}>Фамилия</div>
        <input
          className={`${styles.input} ${errors.lastName ? styles.inputError : ""}`}
          type="text"
          value={lastName}
          onChange={(event) => {
            setLastName(event.target.value)
            clearFieldError("lastName")
          }}
          placeholder="Иванов"
          maxLength={nameMaxLength}
          disabled={isSubmitting}
        />
        {errors.lastName && <div className={styles.fieldErrorText}>{errors.lastName}</div>}
      </label>

      <label className={styles.field}>
        <div className={styles.fieldLabel}>Email</div>
        <input
          className={`${styles.input} ${errors.email ? styles.inputError : ""}`}
          type="email"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value)
            clearFieldError("email")
          }}
          placeholder="you@example.com"
          disabled={isSubmitting}
        />
        {errors.email && <div className={styles.fieldErrorText}>{errors.email}</div>}
      </label>

      <div className={styles.divider} />

      <div className={styles.passwordHead}>
        <div className={styles.passwordTitle}>Смена пароля</div>
        <div className={styles.passwordHint}>Оставьте поля пустыми, если менять пароль не нужно.</div>
      </div>

      <label className={styles.field}>
        <div className={styles.fieldLabel}>Текущий пароль</div>
        <input
          className={`${styles.input} ${errors.currentPassword ? styles.inputError : ""}`}
          type="password"
          value={currentPassword}
          onChange={(event) => {
            setCurrentPassword(event.target.value)
            clearFieldError("currentPassword")
          }}
          autoComplete="current-password"
          disabled={isSubmitting}
        />
        {errors.currentPassword && <div className={styles.fieldErrorText}>{errors.currentPassword}</div>}
      </label>

      <label className={styles.field}>
        <div className={styles.fieldLabel}>Новый пароль</div>
        <input
          className={`${styles.input} ${errors.newPassword ? styles.inputError : ""}`}
          type="password"
          value={newPassword}
          onChange={(event) => {
            setNewPassword(event.target.value)
            clearFieldError("newPassword")
          }}
          autoComplete="new-password"
          disabled={isSubmitting}
        />
        {errors.newPassword && <div className={styles.fieldErrorText}>{errors.newPassword}</div>}
      </label>

      <label className={styles.field}>
        <div className={styles.fieldLabel}>Повторите новый пароль</div>
        <input
          className={`${styles.input} ${errors.repeatPassword ? styles.inputError : ""}`}
          type="password"
          value={repeatPassword}
          onChange={(event) => {
            setRepeatPassword(event.target.value)
            clearFieldError("repeatPassword")
          }}
          autoComplete="new-password"
          disabled={isSubmitting}
        />
        {errors.repeatPassword && <div className={styles.fieldErrorText}>{errors.repeatPassword}</div>}
      </label>

      {serverError && <div className={styles.serverError}>{serverError}</div>}

      <div className={styles.modalActions}>
        <button className={styles.secondaryButton} type="button" onClick={onClose} disabled={isSubmitting}>
          Отмена
        </button>
        <button className={styles.primaryButton} type="button" onClick={submit} disabled={isSubmitting}>
          Сохранить
        </button>
      </div>
    </Modal>
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
