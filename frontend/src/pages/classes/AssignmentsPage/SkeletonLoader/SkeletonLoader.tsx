import SkeletonBlock from "../../../../shared/SkeletonBlock/SkeletonBlock"
import styles from "./SkeletonLoader.module.css"

function AssignmentSkeletonCard() {
  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <SkeletonBlock width="45%" height={18} radius={999} />
        <div className={styles.actions}>
          <SkeletonBlock width={36} height={36} radius={8} />
          <SkeletonBlock width={36} height={36} radius={8} />
        </div>
      </div>
      <SkeletonBlock width={130} height={12} radius={999} />
      <SkeletonBlock width={96} height={12} radius={999} />
    </div>
  )
}

export default function SkeletonLoader({ count = 5 }: { count?: number }) {
  return (
    <div className={styles.cards}>
      {Array.from({ length: count }).map((_, index) => (
        <AssignmentSkeletonCard key={index} />
      ))}
    </div>
  )
}
