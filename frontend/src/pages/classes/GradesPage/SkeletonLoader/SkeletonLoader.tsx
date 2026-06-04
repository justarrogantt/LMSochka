import SkeletonBlock from "../../../../shared/SkeletonBlock/SkeletonBlock"
import styles from "./SkeletonLoader.module.css"

function GradebookSkeletonCard() {
  return (
    <div className={styles.card}>
      <SkeletonBlock width={42} height={42} radius={999} />
      <div className={styles.info}>
        <SkeletonBlock width={150} height={13} radius={999} />
        <SkeletonBlock width={200} height={11} radius={999} />
      </div>
      <SkeletonBlock className={styles.pushRight} width={90} height={26} radius={999} />
    </div>
  )
}

export default function SkeletonLoader({ count = 4 }: { count?: number }) {
  return (
    <div className={styles.list}>
      {Array.from({ length: count }).map((_, index) => (
        <GradebookSkeletonCard key={index} />
      ))}
    </div>
  )
}
