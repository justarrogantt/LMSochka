import SkeletonBlock from "../../../shared/SkeletonBlock/SkeletonBlock"
import styles from "./SkeletonLoader.module.css"

function GradeCourseSkeletonCard() {
  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <SkeletonBlock width="55%" height={17} radius={999} />
        <SkeletonBlock width={52} height={26} radius={8} />
      </div>
      <SkeletonBlock width="42%" height={12} radius={999} />
    </div>
  )
}

export default function SkeletonLoader({ count = 12 }: { count?: number }) {
  return (
    <div className={styles.shell}>
      <SkeletonBlock width={180} height={22} radius={999} />
      <div className={styles.cards}>
        {Array.from({ length: count }).map((_, index) => (
          <GradeCourseSkeletonCard key={index} />
        ))}
      </div>
    </div>
  )
}
