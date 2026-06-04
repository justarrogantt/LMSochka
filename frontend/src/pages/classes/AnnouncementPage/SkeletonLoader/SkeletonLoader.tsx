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

export default function SkeletonLoader() {
  return (
    <div className={styles.card}>
      <Skeleton width="46%" height={28} radius={999} />
      <Skeleton width="82%" height={14} radius={999} />
      <Skeleton width="68%" height={14} radius={999} />
      <div className={styles.meta}>
        <Skeleton width={180} height={11} radius={999} />
        <Skeleton width={120} height={11} radius={999} />
      </div>
    </div>
  )
}
