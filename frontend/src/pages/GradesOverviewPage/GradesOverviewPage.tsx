import styles from "./GradesOverviewPage.module.css"

// Заглушка раздела "Оценки" в левом меню.
// Сводку перенесем на backend-эндпоинт, когда он появится.
export default function GradesOverviewPage() {
  return (
    <div className={styles.page}>
      <div className={styles.titleBlock}>
        <div className={styles.title}>Оценки</div>
        <div className={styles.text}>Раздел в разработке. Здесь будет общая сводка по оценкам.</div>
      </div>

      <div className={styles.emptyMessage}>Пока доступен только журнал оценок внутри конкретного курса.</div>
    </div>
  )
}
