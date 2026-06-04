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

function GradeCourseSkeletonCard() {
  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <Skeleton width="55%" height={17} radius={999} />
        <Skeleton width={52} height={26} radius={8} />
      </div>
      <Skeleton width="42%" height={12} radius={999} />
    </div>
  )
}

export default function SkeletonLoader({ count = 12 }: { count?: number }) {
  return (
    <div className={styles.shell}>
      <Skeleton width={180} height={22} radius={999} />
      <div className={styles.cards}>
        {Array.from({ length: count }).map((_, index) => (
          <GradeCourseSkeletonCard key={index} />
        ))}
      </div>
    </div>
  )
}
