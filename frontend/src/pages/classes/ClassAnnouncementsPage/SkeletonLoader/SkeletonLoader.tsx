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

// showActions=false — силуэт карточки студента (объявление без кнопок
// редактирования/удаления); true — карточка автора/creator.
function AnnouncementSkeletonCard({ showActions }: { showActions: boolean }) {
  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <Skeleton width="40%" height={18} radius={999} />
        {showActions && (
          <div className={styles.actions}>
            <Skeleton width={36} height={36} radius={8} />
            <Skeleton width={36} height={36} radius={8} />
          </div>
        )}
      </div>
      <Skeleton width="70%" height={12} radius={999} />
      <div className={styles.meta}>
        <Skeleton width={180} height={11} radius={999} />
        <Skeleton width={120} height={11} radius={999} />
      </div>
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
        <AnnouncementSkeletonCard key={index} showActions={showActions} />
      ))}
    </div>
  )
}
