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

function CourseSkeletonCard() {
  return (
    <div className={styles.card}>
      <Skeleton width="70%" height={19} radius={999} />
      <div className={styles.badges}>
        <Skeleton className={styles.badge} height={34} radius={999} />
        <Skeleton className={styles.badge} height={34} radius={999} />
      </div>
      <div className={styles.stats}>
        <div className={styles.statBox}>
          <Skeleton width={30} height={22} radius={6} />
          <Skeleton width="72%" height={11} radius={999} />
        </div>
        <div className={styles.statBox}>
          <Skeleton width={30} height={22} radius={6} />
          <Skeleton width="72%" height={11} radius={999} />
        </div>
      </div>
    </div>
  )
}

export default function SkeletonLoader({ count = 6 }: { count?: number }) {
  return (
    <div className={styles.cards}>
      {Array.from({ length: count }).map((_, index) => (
        <CourseSkeletonCard key={index} />
      ))}
    </div>
  )
}
