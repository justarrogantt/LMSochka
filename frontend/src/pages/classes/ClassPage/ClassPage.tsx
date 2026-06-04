import { motion } from "framer-motion"
import { useOutletContext } from "react-router-dom"
import Skeleton from "../../../components/Skeleton/Skeleton"
import { DURATION, EASE_OUT } from "../../../shared/motion"
import type { ClassLayoutContext } from "../../../layouts/ClassLayout/ClassLayout"
import styles from "./ClassPage.module.css"

// Статичные подписи строк «Информации о курсе» — не зависят от данных,
// поэтому показываем их и в скелетоне, и в готовой карточке.
const OVERVIEW_LABELS = [
  "Тип курса",
  "Ваша роль",
  "Студентов в курсе",
  "Преподавателей в курсе",
  "Код приглашения"
]

// Скелетон вкладки «Обзор»: заголовок и подписи строк реальные (всегда видны),
// скелетоном заглушены только значения справа — они подтянутся после загрузки.
export function OverviewSkeleton() {
  return (
    <div className={styles.overview}>
      <div className={styles.infoCard}>
        <div className={styles.cardTitle}>Информация о курсе</div>
        <div className={styles.infoRows}>
          {OVERVIEW_LABELS.map((label) => (
            <div className={styles.infoRow} key={label}>
              <div className={styles.infoLabel}>{label}</div>
              <Skeleton width={90} height={14} radius={999} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

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
