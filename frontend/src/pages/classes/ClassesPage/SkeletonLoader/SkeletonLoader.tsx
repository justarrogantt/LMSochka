import SkeletonBlock from "../../../../shared/SkeletonBlock/SkeletonBlock"
import styles from "./SkeletonLoader.module.css"

function CourseSkeletonCard() {
  return (
    <div className={styles.card}>
      <SkeletonBlock width="70%" height={19} radius={999} />
      <div className={styles.badges}>
        <SkeletonBlock className={styles.badge} height={34} radius={999} />
        <SkeletonBlock className={styles.badge} height={34} radius={999} />
      </div>
      <div className={styles.stats}>
        <div className={styles.statBox}>
          <SkeletonBlock width={30} height={22} radius={6} />
          <SkeletonBlock width="72%" height={11} radius={999} />
        </div>
        <div className={styles.statBox}>
          <SkeletonBlock width={30} height={22} radius={6} />
          <SkeletonBlock width="72%" height={11} radius={999} />
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
