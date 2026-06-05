import { useOutletContext } from "react-router-dom"
import type { ClassLayoutContext } from "../../../layouts/ClassLayout/ClassLayout"
import SkeletonLoader from "./SkeletonLoader/SkeletonLoader"
import styles from "./ClassPage.module.css"

export default function ClassPage() {
  const { classDetail } = useOutletContext<ClassLayoutContext>()

  if (!classDetail) return <SkeletonLoader />

  return (
    <div className={styles.overview}>
      <div className={styles.infoCard}>
        <div className={styles.cardTitle}>Информация о курсе</div>
        <div className={styles.infoRows}>
          <div className={styles.infoRow}>
            <div className={styles.infoLabel}>Тип курса</div>
            <div className={styles.infoValue}>{classDetail.type === "closed" ? "Закрытый" : "Открытый"}</div>
          </div>
          <div className={styles.infoRow}>
            <div className={styles.infoLabel}>Ваша роль</div>
            <div className={styles.infoValue}>
              {classDetail.user_role === "creator"
                ? "Создатель"
                : classDetail.user_role === "teacher"
                  ? "Преподаватель"
                  : "Студент"}
            </div>
          </div>
          <div className={styles.infoRow}>
            <div className={styles.infoLabel}>Студентов в курсе</div>
            <div className={styles.infoValue}>{classDetail.students_count}</div>
          </div>
          <div className={styles.infoRow}>
            <div className={styles.infoLabel}>Преподавателей в курсе</div>
            <div className={styles.infoValue}>{classDetail.teachers_count}</div>
          </div>
          <div className={styles.infoRow}>
            <div className={styles.infoLabel}>Код приглашения</div>
            <div className={styles.infoValue}>{classDetail.join_code ?? "Недоступен"}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
