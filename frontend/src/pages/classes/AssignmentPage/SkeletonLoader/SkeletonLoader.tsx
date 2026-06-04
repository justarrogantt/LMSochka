import SkeletonBlock from "../../../../shared/SkeletonBlock/SkeletonBlock"
import styles from "./SkeletonLoader.module.css"

function FeedSkeletonCard() {
  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <SkeletonBlock width="40%" height={18} radius={999} />
        <div className={styles.actions}>
          <SkeletonBlock width={36} height={36} radius={8} />
          <SkeletonBlock width={36} height={36} radius={8} />
        </div>
      </div>
      <SkeletonBlock width="70%" height={12} radius={999} />
      <div className={styles.meta}>
        <SkeletonBlock width={180} height={11} radius={999} />
        <SkeletonBlock width={120} height={11} radius={999} />
      </div>
    </div>
  )
}

function MemberSkeletonCard() {
  return (
    <div className={`${styles.card} ${styles.memberCard}`}>
      <SkeletonBlock width={42} height={42} radius={999} />
      <div className={styles.memberInfo}>
        <SkeletonBlock width={150} height={13} radius={999} />
        <SkeletonBlock width={200} height={11} radius={999} />
      </div>
      <SkeletonBlock className={styles.pushRight} width={90} height={26} radius={999} />
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
