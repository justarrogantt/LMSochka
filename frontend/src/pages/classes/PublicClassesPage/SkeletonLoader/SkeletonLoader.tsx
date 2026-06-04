import SkeletonBlock from "../../../../shared/SkeletonBlock/SkeletonBlock"
import styles from "./SkeletonLoader.module.css"

function PublicClassSkeletonCard() {
  return (
    <div className={styles.card}>
      <div className={styles.info}>
        <SkeletonBlock width="48%" height={18} radius={999} />
        <div className={styles.meta}>
          <SkeletonBlock width={96} height={12} radius={999} />
          <SkeletonBlock width={140} height={12} radius={999} />
        </div>
      </div>
      <SkeletonBlock width={140} height={40} radius={10} />
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
