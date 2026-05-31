import styles from "./GradesPage.module.css"

export default function GradesPage() {
  return (
    <div className={styles.page}>
      <div className={styles.titleBlock}>
        <div className={styles.title}>Оценки курса</div>
        <div className={styles.text}>Позже здесь будет сводная таблица оценок по заданиям.</div>
      </div>

      <div className={styles.placeholder}>
        <div className={styles.placeholderTitle}>Сводная таблица появится позже</div>
        <div className={styles.placeholderText}>Страница уже добавлена в навигацию курса.</div>
      </div>
    </div>
  )
}
