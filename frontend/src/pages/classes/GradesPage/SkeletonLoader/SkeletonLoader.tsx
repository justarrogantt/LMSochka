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

// Карточка студента в журнале преподавателя: аватар + имя/почта + средний балл.
function GradebookSkeletonCard() {
  return (
    <div className={styles.card}>
      <Skeleton width={42} height={42} radius={999} />
      <div className={styles.info}>
        <Skeleton width={150} height={13} radius={999} />
        <Skeleton width={200} height={11} radius={999} />
      </div>
      <Skeleton className={styles.pushRight} width={90} height={26} radius={999} />
    </div>
  )
}

// Сводка студента: «Средний балл» и «Оценено заданий».
function StudentSummarySkeleton() {
  return (
    <div className={styles.summary}>
      <div className={styles.summaryBlock}>
        <Skeleton width={84} height={12} radius={999} />
        <Skeleton width={60} height={26} radius={8} />
      </div>
      <div className={styles.summaryDivider} />
      <div className={styles.summaryBlock}>
        <Skeleton width={110} height={12} radius={999} />
        <Skeleton width={72} height={26} radius={8} />
      </div>
    </div>
  )
}

// Строка оценки студента: задание + meta слева, статус/балл справа (без аватара).
function StudentGradeRowSkeleton() {
  return (
    <div className={styles.gradeRow}>
      <div className={styles.gradeRowMain}>
        <Skeleton width={160} height={15} radius={999} />
        <div className={styles.gradeRowMeta}>
          <Skeleton width={120} height={12} radius={999} />
          <Skeleton width={150} height={12} radius={999} />
        </div>
      </div>
      <Skeleton width={88} height={28} radius={999} />
    </div>
  )
}

// gradebook=true — журнал преподавателя (список студентов);
// false — личные оценки студента (сводка + строки заданий).
export default function SkeletonLoader({
  count = 4,
  gradebook = true
}: {
  count?: number
  gradebook?: boolean
}) {
  if (!gradebook) {
    return (
      <div className={styles.studentWrap}>
        <StudentSummarySkeleton />
        <div className={styles.gradeList}>
          {Array.from({ length: count }).map((_, index) => (
            <StudentGradeRowSkeleton key={index} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className={styles.list}>
      {Array.from({ length: count }).map((_, index) => (
        <GradebookSkeletonCard key={index} />
      ))}
    </div>
  )
}
