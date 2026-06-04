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

function FeedSkeletonCard() {
  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <Skeleton width="40%" height={18} radius={999} />
        <div className={styles.actions}>
          <Skeleton width={36} height={36} radius={8} />
          <Skeleton width={36} height={36} radius={8} />
        </div>
      </div>
      <Skeleton width="70%" height={12} radius={999} />
      <div className={styles.meta}>
        <Skeleton width={180} height={11} radius={999} />
        <Skeleton width={120} height={11} radius={999} />
      </div>
    </div>
  )
}

function MemberSkeletonCard() {
  return (
    <div className={`${styles.card} ${styles.memberCard}`}>
      <Skeleton width={42} height={42} radius={999} />
      <div className={styles.memberInfo}>
        <Skeleton width={150} height={13} radius={999} />
        <Skeleton width={200} height={11} radius={999} />
      </div>
      <Skeleton className={styles.pushRight} width={90} height={26} radius={999} />
    </div>
  )
}

export function AssignmentSkeletonLoader({ count = 2 }: { count?: number }) {
  return (
    <div className={styles.list}>
      {Array.from({ length: count }).map((_, index) => (
        <FeedSkeletonCard key={index} />
      ))}
    </div>
  )
}

export function MySubmissionSkeletonLoader() {
  return (
    <div className={styles.list}>
      <FeedSkeletonCard />
    </div>
  )
}

export function StudentSubmissionsSkeletonLoader({ count = 2 }: { count?: number }) {
  return (
    <div className={styles.list}>
      {Array.from({ length: count }).map((_, index) => (
        <MemberSkeletonCard key={index} />
      ))}
    </div>
  )
}
