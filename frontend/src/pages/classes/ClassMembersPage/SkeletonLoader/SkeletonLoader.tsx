import SkeletonBlock from "../../../../shared/SkeletonBlock/SkeletonBlock"
import styles from "../ClassMembersPage.module.css"

function MemberSkeletonCard() {
  return (
    <div className={styles.memberCard}>
      <SkeletonBlock width={44} height={44} radius={999} />
      <div className={styles.memberInfo}>
        <SkeletonBlock width={150} height={14} radius={999} />
        <SkeletonBlock width={210} height={11} radius={999} />
      </div>
      <SkeletonBlock width={120} height={30} radius={999} />
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
