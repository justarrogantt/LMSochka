import type { ReactNode } from "react"
import logo from "../../assets/logo.svg"
import styles from "./AuthLayout.module.css"

type AuthLayoutProps = {
  title: string
  subtitle: string
  children: ReactNode
}

// Общий каркас для login/register: бренд, поля и нижние ссылки.
export default function AuthLayout({ title, subtitle, children }: AuthLayoutProps) {
  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.brand}>
            <img className={styles.brandLogo} src={logo} alt="4LMS logo" />
            <div className={styles.brandText}>
              <span className={styles.brandFull}>Learning Management System</span>
              <span className={styles.brandShort}>LMS</span>
            </div>
          </div>
        </div>
      </div>

      <main className={styles.main}>
        <section className={styles.authCard}>
          <div className={styles.title}>{title}</div>
          <div className={styles.subtitle}>{subtitle}</div>

          {children}
        </section>
      </main>
    </div>
  )
}
