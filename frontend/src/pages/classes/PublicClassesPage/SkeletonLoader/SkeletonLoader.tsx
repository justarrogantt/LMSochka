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

function PublicClassSkeletonCard() {
  return (
    <div className={styles.card}>
      <div className={styles.info}>
        <Skeleton width="48%" height={18} radius={999} />
        <div className={styles.meta}>
          <Skeleton width={96} height={12} radius={999} />
          <Skeleton width={140} height={12} radius={999} />
        </div>
      </div>
      <Skeleton width={140} height={40} radius={10} />
    </div>
  )
}

export default function SkeletonLoader({ count = 6 }: { count?: number }) {
  return (
    <div className={styles.cards}>
      {Array.from({ length: count }).map((_, index) => (
        <PublicClassSkeletonCard key={index} />
      ))}
    </div>
  )
}
