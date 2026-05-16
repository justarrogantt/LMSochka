import styles from "./LoginPage.module.css"
import { useState } from "react"

type LoginForm = {
  email: string
  password: string
}

const defaultForm: LoginForm = {
  email: "",
  password: ""
}

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const validationErrors = {
  emailRequired: "Введите электронную почту",
  emailInvalid: "Введите корректную электронную почту",
  passwordRequired: "Введите пароль"
}

export default function LoginPage() {
  const [userData, setUserData] = useState<LoginForm>(defaultForm)
  const [inputErrors, setInputErrors] = useState<LoginForm>(defaultForm)

  function updateForm(event: React.ChangeEvent<HTMLInputElement>) {
    const { name, value } = event.target

    setUserData((prev) => ({
      ...prev,
      [name]: value.replace(/\s/g, "")
    }))
  }

  function checkForm(formData: LoginForm) {
    const newErrors: LoginForm = {
      email: "",
      password: ""
    }

    if (!formData.email.trim()) {
      newErrors.email = validationErrors.emailRequired
    } else if (!emailRegex.test(formData.email)) {
      newErrors.email = validationErrors.emailInvalid
    }

    if (!formData.password) {
      newErrors.password = validationErrors.passwordRequired
    }

    setInputErrors(newErrors)

    return !newErrors.email && !newErrors.password
  }

  async function login() {
    const isFormValid = checkForm(userData)
    if (!isFormValid) {
      return
    }

    console.log(userData)
  }

  return (
    <main className={styles.page}>
      <h1>Вход</h1>

      <label htmlFor="email">Электронная почта</label>
      <br />
      <input
        id="email"
        name="email"
        placeholder="example@mail.ru"
        type="email"
        autoComplete="email"
        value={userData.email}
        onChange={updateForm}
      />
      {inputErrors.email && (
        <>
          <br />
          <div className={styles.errorPlace}>{inputErrors.email}</div>
        </>
      )}
      <br />
      <br />

      <label htmlFor="password">Пароль</label>
      <br />
      <input
        id="password"
        name="password"
        placeholder="Введите пароль"
        type="password"
        autoComplete="current-password"
        value={userData.password}
        onChange={updateForm}
      />
      {inputErrors.password && (
        <>
          <br />
          <div className={styles.errorPlace}>{inputErrors.password}</div>
        </>
      )}
      <br />
      <br />

      <button onClick={login}>Войти</button>
      <p>
        Нет аккаунта? <a href="/register">Зарегистрироваться</a>
      </p>
    </main>
  )
}
