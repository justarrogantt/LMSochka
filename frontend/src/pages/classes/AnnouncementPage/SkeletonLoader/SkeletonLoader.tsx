import SkeletonBlock from "../../../../shared/SkeletonBlock/SkeletonBlock"
import styles from "./SkeletonLoader.module.css"

export default function SkeletonLoader() {
  return (
    <div className={styles.card}>
      <SkeletonBlock width="46%" height={28} radius={999} />
      <SkeletonBlock width="82%" height={14} radius={999} />
      <SkeletonBlock width="68%" height={14} radius={999} />
      <div className={styles.meta}>
        <SkeletonBlock width={180} height={11} radius={999} />
        <SkeletonBlock width={120} height={11} radius={999} />
      </div>
    </div>
  )
}
