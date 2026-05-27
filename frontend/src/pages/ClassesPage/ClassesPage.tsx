// Страница курсов пользователя.
import styles from "./ClassesPage.module.css"

export default function ClassesPage() {
  return (
    <section className={styles.page}>
      <div className={styles.title}>Мои курсы</div>
      <div className={styles.text}>Здесь будет список курсов, в которых пользователь состоит.</div>
    </section>
  )
}
