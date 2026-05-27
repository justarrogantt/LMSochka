import styles from "./AssignmentsPage.module.css"

export default function AssignmentsPage() {
  return (
    <div className={styles.page}>
      <div className={styles.titleBlock}>
        <div className={styles.title}>Задания</div>
        <div className={styles.text}>Позже здесь появятся задания курса, дедлайны и статусы сдачи.</div>
      </div>

      <div className={styles.placeholder}>
        <div className={styles.placeholderTitle}>Модуль заданий пока готовится</div>
        <div className={styles.placeholderText}>Экран уже стоит на месте, чтобы не ломать навигацию курса.</div>
      </div>
    </div>
  )
}
