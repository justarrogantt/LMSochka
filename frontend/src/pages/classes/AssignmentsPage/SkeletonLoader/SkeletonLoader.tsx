import type { CSSProperties } from "react"
import styles from "./SkeletonLoader.module.css"

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

// showActions=false — силуэт карточки студента (без кнопок действий и строки
// "на проверке"); true — карточка teacher/creator.
function AssignmentSkeletonCard({ showActions }: { showActions: boolean }) {
  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <Skeleton width="45%" height={18} radius={999} />
        {showActions && (
          <div className={styles.actions}>
            <Skeleton width={36} height={36} radius={8} />
            <Skeleton width={36} height={36} radius={8} />
          </div>
        )}
      </div>
      <div className={styles.meta}>
        <Skeleton width={130} height={12} radius={999} />
        <Skeleton width={96} height={12} radius={999} />
      </div>
      {showActions && <Skeleton width={110} height={12} radius={999} />}
    </div>
  )
}

export default function SkeletonLoader({
  count = 5,
  showActions = false
}: {
  count?: number
  showActions?: boolean
}) {
  return (
    <div className={styles.cards}>
      {Array.from({ length: count }).map((_, index) => (
        <AssignmentSkeletonCard key={index} showActions={showActions} />
      ))}
    </div>
  )
}
