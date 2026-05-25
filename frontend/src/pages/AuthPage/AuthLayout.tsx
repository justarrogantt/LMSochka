import type { ReactNode } from "react"
import logo from "../../assets/logo.svg"
import mascot from "../../assets/mascot.png"
import styles from "./AuthPage.module.css"

type AuthLayoutProps = {
  title: string
  subtitle: string
  children: ReactNode
}

// Общий каркас для login/register: бренд, поля, маскот и нижние ссылки.
export default function AuthLayout({ title, subtitle, children }: AuthLayoutProps) {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.container}>
          <div className={styles.brand}>
            <img className={styles.brandLogo} src={logo} alt="4LMS logo" />
            <div className={styles.brandText}>LMS</div>
          </div>
        </div>
      </header>

      <div className={`${styles.main} ${styles.container}`}>
        <section className={styles.authCard}>
          <div className={styles.title}>{title}</div>
          <div className={styles.subtitle}>{subtitle}</div>

          {children}
        </section>

        <img className={styles.mascotImage} src={mascot} alt="Маскот проекта" />
      </div>

      <div className={styles.footer}>
        <div className={`${styles.container} ${styles.footerInner}`}>
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
  )
}
