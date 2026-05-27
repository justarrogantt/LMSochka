import { useOutletContext } from "react-router-dom"
import type { ClassLayoutContext } from "../ClassLayout/ClassLayout"
import styles from "./ClassPage.module.css"

export default function ClassPage() {
  const { classDetail } = useOutletContext<ClassLayoutContext>()

  return (
    <div className={styles.overview}>
      <div className={styles.infoCard}>
        <div className={styles.cardTitle}>Информация о курсе</div>
        <div className={styles.infoRows}>
          <div className={styles.infoRow}>
            <div className={styles.infoLabel}>Тип курса</div>
            <div className={styles.infoValue}>{classDetail?.type === "closed" ? "Закрытый" : "Открытый"}</div>
          </div>
          <div className={styles.infoRow}>
            <div className={styles.infoLabel}>Ваша роль</div>
            <div className={styles.infoValue}>
              {classDetail?.user_role === "creator"
                ? "Создатель"
                : classDetail?.user_role === "teacher"
                  ? "Преподаватель"
                  : "Студент"}
            </div>
          </div>
          <div className={styles.infoRow}>
            <div className={styles.infoLabel}>Код приглашения</div>
            <div className={styles.infoValue}>{classDetail?.join_code ?? "Недоступен"}</div>
          </div>
        </div>
      </div>

      <div className={styles.statCard}>
        <div className={styles.statValue}>{classDetail?.students_count ?? 0}</div>
        <div className={styles.statLabel}>студентов в курсе</div>
      </div>

      <div className={styles.statCard}>
        <div className={styles.statValue}>{classDetail?.teachers_count ?? 0}</div>
        <div className={styles.statLabel}>преподавателей</div>
      </div>
    </div>
  )
}
