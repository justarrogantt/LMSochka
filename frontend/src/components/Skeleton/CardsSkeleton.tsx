import type { ReactElement } from "react"
import Skeleton from "./Skeleton"
import styles from "./CardsSkeleton.module.css"

// Вариант силуэта карточки — повторяет реальные карточки соответствующих экранов.
type SkeletonVariant = "course" | "grades" | "feed" | "assignment" | "member"

type CardsSkeletonProps = {
  count?: number
  variant?: SkeletonVariant
  // Контейнер передаёт страница (её же грид), иначе раскладываем колонкой
  className?: string
  // Показать ли строку-заголовок над списком (для экранов с секциями)
  title?: boolean
}

// Карточка курса (Мои курсы): заголовок, два бейджа во всю ширину, два стат-блока снизу.
function CourseCard() {
  return (
    <div className={styles.courseCard}>
      <Skeleton width="70%" height={19} radius={999} />
      <div className={styles.badgesRow}>
        <Skeleton className={styles.badge} height={34} radius={999} />
        <Skeleton className={styles.badge} height={34} radius={999} />
      </div>
      <div className={styles.statsRow}>
        <div className={styles.statBox}>
          <Skeleton width={30} height={22} radius={6} />
          <Skeleton width="72%" height={11} radius={999} />
        </div>
        <div className={styles.statBox}>
          <Skeleton width={30} height={22} radius={6} />
          <Skeleton width="72%" height={11} radius={999} />
        </div>
      </div>
    </div>
  )
}

// Карточка сводки оценок: название слева + крупный процент справа, ниже строка-мета.
function GradesCard() {
  return (
    <div className={styles.card}>
      <div className={styles.spreadRow}>
        <Skeleton width="55%" height={17} radius={999} />
        <Skeleton className={styles.pushRight} width={52} height={26} radius={8} />
      </div>
      <Skeleton width="42%" height={12} radius={999} />
    </div>
  )
}

// Карточка объявления: заголовок + две иконки-кнопки справа, строка текста,
// ниже мета — автор и дата. Повторяет реальную карточку преподавателя.
function FeedCard() {
  return (
    <div className={styles.card}>
      <div className={styles.headRow}>
        <Skeleton width="40%" height={18} radius={999} />
        <div className={`${styles.actionsRow} ${styles.pushRight}`}>
          <Skeleton width={36} height={36} radius={8} />
          <Skeleton width={36} height={36} radius={8} />
        </div>
      </div>
      <Skeleton width="70%" height={12} radius={999} />
      <div className={styles.metaRow}>
        <Skeleton width={180} height={11} radius={999} />
        <Skeleton width={120} height={11} radius={999} />
      </div>
    </div>
  )
}

// Карточка задания: крупный заголовок + две иконки-кнопки справа, ниже две строки меты
// (до N баллов / на проверке: N) — повторяет реальную карточку преподавателя.
function AssignmentCard() {
  return (
    <div className={styles.card}>
      <div className={styles.headRow}>
        <Skeleton width="45%" height={18} radius={999} />
        <div className={`${styles.actionsRow} ${styles.pushRight}`}>
          <Skeleton width={36} height={36} radius={8} />
          <Skeleton width={36} height={36} radius={8} />
        </div>
      </div>
      <Skeleton width={130} height={12} radius={999} />
      <Skeleton width={96} height={12} radius={999} />
    </div>
  )
}

// Карточка участника/студента: аватар + имя/почта + бейдж роли.
function MemberCard() {
  return (
    <div className={`${styles.card} ${styles.memberCard}`}>
      <Skeleton width={42} height={42} radius={999} />
      <div className={styles.memberInfo}>
        <Skeleton width={150} height={13} radius={999} />
        <Skeleton width={200} height={11} radius={999} />
      </div>
      <Skeleton className={styles.pushRight} width={90} height={26} radius={999} />
    </div>
  )
}

const CARD_BY_VARIANT: Record<SkeletonVariant, () => ReactElement> = {
  course: CourseCard,
  grades: GradesCard,
  feed: FeedCard,
  assignment: AssignmentCard,
  member: MemberCard
}

export default function CardsSkeleton({ count = 6, variant = "course", className, title }: CardsSkeletonProps) {
  const Card = CARD_BY_VARIANT[variant]

  return (
    <div className={styles.shell}>
      {title && <Skeleton className={styles.titleBar} width={180} height={22} radius={999} />}

      <div className={className ?? styles.list}>
        {Array.from({ length: count }).map((_, index) => (
          <Card key={index} />
        ))}
      </div>
    </div>
  )
}
