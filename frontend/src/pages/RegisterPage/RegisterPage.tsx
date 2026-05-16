// Страница регистрации нового пользователя.
import styles from "./RegisterPage.module.css"
import { useState } from "react"

type RegisterForm = {
    email: string
    password: string
    repeatPassword: string
}

const defaultForm = {
    email: "",
    password: "",
    repeatPassword: ""
}

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{8,}$/

export default function RegisterPage() {

    const [userData, setUserData] = useState<RegisterForm>(defaultForm)
    const [inputErrors, setInputErrors] = useState<RegisterForm>(defaultForm)

    function updateForm(event: React.ChangeEvent<HTMLInputElement>) {
        const { name, value } = event.target

        setUserData((prev) => ({
            ...prev,
            [name]: value.replace(/\s/g, "")
        }))
    }

    function checkForm(userData: RegisterForm) {
        const newErrors: RegisterForm = {
        email: "",
        password: "",
        repeatPassword: "",
        }

        if (!userData.email.trim()) {
            newErrors.email = "Введите электронную почту"
        } else if (!emailRegex.test(userData.email)) {
            newErrors.email = "Введите корректную электронную почту"
        }

        if (!userData.password) {
            newErrors.password = "Введите пароль"
        }
        else if (!passwordRegex.test(userData.password)) {
            newErrors.password = "Пароль должен быть не короче 8 символов, содержать латинские буквы и хотя бы одну цифру"
        }

        if (!userData.repeatPassword) {
            newErrors.repeatPassword = "Повторите пароль"
        } 
        else if (userData.password !== userData.repeatPassword) {
            newErrors.repeatPassword = "Пароли не совпадают"
        }

        setInputErrors(newErrors)

        return !newErrors.email && !newErrors.password && !newErrors.repeatPassword
  }


    async function register() {
        const isFormValid = checkForm(userData)
        if (!isFormValid) {
            return
        }
        console.log(userData)
    }

    return (
    <main className={styles.page}>
        <h1>Регистрация</h1>

        <label htmlFor="email">Электронная почта</label><br />
        <input id="email" name="email" placeholder="example@mail.ru" 
        type="email" autoComplete="email" value={userData.email} onChange={updateForm} />
        {inputErrors.email && <><br /><div className={styles.errorPlace}>{inputErrors.email}</div></>}
        <br /><br />

        <label htmlFor="password">Пароль</label><br />
        <input id="password" name="password" placeholder="Введите пароль" 
        type="password" autoComplete="new-password" value={userData.password} onChange={updateForm} />
         {inputErrors.password && <><br /><div className={styles.errorPlace}>{inputErrors.password}</div></>}
        <br /><br />

        <label htmlFor="repeatPassword">Подтверждение пароля</label><br />
        <input id="repeatPassword" name="repeatPassword" placeholder="Повторите пароль" 
        type="password" autoComplete="new-password" value={userData.repeatPassword} onChange={updateForm} />
         {inputErrors.repeatPassword && <><br /><div className={styles.errorPlace}>{inputErrors.repeatPassword}</div></>}
        <br /><br />
        <button onClick={register}>Зарегистрироваться</button>
    </main>
    )
}
