import styles from "./HomePage.module.css"

export default function HomePage() {
  return (
    <section className={styles.page}>
      <div className={styles.title}>Главная страница</div>
      <div className={styles.text}>Здесь будут мои задания.</div>
    </section>
  )
}
