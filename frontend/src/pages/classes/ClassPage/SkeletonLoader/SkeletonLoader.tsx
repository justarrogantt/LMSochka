import type { CSSProperties } from "react"
import styles from "../ClassPage.module.css"

const OVERVIEW_LABELS = [
  "Тип курса",
  "Ваша роль",
  "Студентов в курсе",
  "Преподавателей в курсе",
  "Код приглашения"
]

type SkeletonProps = {
  width?: string | number
  height?: string | number
  radius?: string | number
  className?: string
}

function Skeleton({ width, height, radius, className = "" }: SkeletonProps) {
  const style: CSSProperties = { width, height, borderRadius: radius }
  return <span className={`${styles.skeleton} ${className}`} style={style} aria-hidden="true" />
}

export default function SkeletonLoader() {
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
