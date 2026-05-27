import styles from "./ClassPage.module.css"

const classInfo = {
  type: "Закрытый",
  role: "Создатель",
  join_code: "AB12CD34",
  students_count: 27,
  teachers_count: 2
}

export default function ClassPage() {
  return (
    <div className={styles.overview}>
      <div className={styles.infoCard}>
        <div className={styles.cardTitle}>Информация о курсе</div>
        <div className={styles.infoRows}>
          <div className={styles.infoRow}>
            <div className={styles.infoLabel}>Тип курса</div>
            <div className={styles.infoValue}>{classInfo.type}</div>
          </div>
          <div className={styles.infoRow}>
            <div className={styles.infoLabel}>Ваша роль</div>
            <div className={styles.infoValue}>{classInfo.role}</div>
          </div>
          <div className={styles.infoRow}>
            <div className={styles.infoLabel}>Код приглашения</div>
            <div className={styles.infoValue}>{classInfo.join_code}</div>
          </div>
        </div>
      </div>

      <div className={styles.statCard}>
        <div className={styles.statValue}>{classInfo.students_count}</div>
        <div className={styles.statLabel}>студентов в курсе</div>
      </div>

      <div className={styles.statCard}>
        <div className={styles.statValue}>{classInfo.teachers_count}</div>
        <div className={styles.statLabel}>преподавателей</div>
      </div>
    </div>
  )
}
