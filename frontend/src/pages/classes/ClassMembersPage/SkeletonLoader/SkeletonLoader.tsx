import type { CSSProperties } from "react"
import styles from "../ClassMembersPage.module.css"

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

function MemberSkeletonCard() {
  return (
    <div className={styles.memberCard}>
      <Skeleton width={44} height={44} radius={999} />
      <div className={styles.memberInfo}>
        <Skeleton width={150} height={14} radius={999} />
        <Skeleton width={210} height={11} radius={999} />
      </div>
      <Skeleton width={120} height={30} radius={999} />
    </div>
  )
}

export default function SkeletonLoader() {
  return (
    <div className={styles.skeletonGroups}>
      <div className={styles.group}>
        <div className={styles.groupTitle}>Создатель</div>
        <div className={styles.members}>
          <MemberSkeletonCard />
        </div>
      </div>
      <div className={styles.group}>
        <div className={styles.groupTitle}>Преподаватели</div>
        <div className={styles.members}>
          <MemberSkeletonCard />
          <MemberSkeletonCard />
        </div>
      </div>
      <div className={styles.group}>
        <div className={styles.groupTitle}>Студенты</div>
        <div className={styles.members}>
          <MemberSkeletonCard />
          <MemberSkeletonCard />
          <MemberSkeletonCard />
        </div>
      </div>
    </div>
  )
}
