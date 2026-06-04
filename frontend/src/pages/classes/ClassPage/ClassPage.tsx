import { motion } from "framer-motion"
import { useOutletContext } from "react-router-dom"
import { DURATION, EASE_OUT } from "../../../shared/motion"
import type { ClassLayoutContext } from "../../../layouts/ClassLayout/ClassLayout"
import styles from "./ClassPage.module.css"

export default function ClassPage() {
  const { classDetail } = useOutletContext<ClassLayoutContext>()

  return (
    <div className={styles.overview}>
      <motion.div
        className={styles.infoCard}
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: DURATION.card, ease: EASE_OUT }}
      >
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
            <div className={styles.infoLabel}>Студентов в курсе</div>
            <div className={styles.infoValue}>{classDetail?.students_count ?? 0}</div>
          </div>
          <div className={styles.infoRow}>
            <div className={styles.infoLabel}>Преподавателей в курсе</div>
            <div className={styles.infoValue}>{classDetail?.teachers_count ?? 0}</div>
          </div>
          <div className={styles.infoRow}>
            <div className={styles.infoLabel}>Код приглашения</div>
            <div className={styles.infoValue}>{classDetail?.join_code ?? "Недоступен"}</div>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
