import SkeletonBlock from "../../../../shared/SkeletonBlock/SkeletonBlock"
import styles from "../ClassPage.module.css"

const OVERVIEW_LABELS = [
  "Тип курса",
  "Ваша роль",
  "Студентов в курсе",
  "Преподавателей в курсе",
  "Код приглашения"
]

export default function SkeletonLoader() {
  return (
    <div className={styles.overview}>
      <div className={styles.infoCard}>
        <div className={styles.cardTitle}>Информация о курсе</div>
        <div className={styles.infoRows}>
          {OVERVIEW_LABELS.map((label) => (
            <div className={styles.infoRow} key={label}>
              <div className={styles.infoLabel}>{label}</div>
              <SkeletonBlock width={90} height={14} radius={999} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
