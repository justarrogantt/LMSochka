import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { Link } from "react-router-dom"
import SearchIcon from "../../assets/icons/layout/search.svg?react"
import CardsSkeleton from "../../components/Skeleton/CardsSkeleton"
import LoadingSwap from "../../components/Skeleton/LoadingSwap"
import { useToast } from "../../components/Toast/ToastProvider"
import { ApiSilentError } from "../../services/api"
import { listContainer, listItem } from "../../shared/motion"
import { getGradesOverview, type CourseGradesSummary } from "./services/gradesOverview.api"
import styles from "./GradesOverviewPage.module.css"

function averageClassName(value: number | null) {
  if (value === null) return styles.avgEmpty
  if (value >= 80) return styles.avgGood
  if (value >= 50) return styles.avgMid
  return styles.avgLow
}

function formatAverage(value: number | null) {
  return value === null ? "—" : `${Math.round(value)}%`
}

function CourseCard({ course }: { course: CourseGradesSummary }) {
  return (
    <Link className={styles.card} to={`/classes/${course.class_id}/grades`}>
      <div className={styles.cardHead}>
        <div className={styles.courseName}>{course.class_name}</div>
        <div className={`${styles.average} ${averageClassName(course.average_percent)}`}>
          {formatAverage(course.average_percent)}
        </div>
      </div>

      <div className={styles.cardMeta}>
        <span>оценено {course.graded_count} из {course.assignments_count}</span>
        {course.pending_count > 0 && (
          <span className={styles.pending}>на проверке {course.pending_count}</span>
        )}
      </div>
    </Link>
  )
}

// Секция с заголовком и сеткой курсов — общая для «учусь» и «преподаю».
// Карточки появляются со стаггером через variants.
function GradesSection({ title, courses }: { title: string; courses: CourseGradesSummary[] }) {
  return (
    <div className={styles.section}>
      <div className={styles.sectionTitle}>{title}</div>
      <motion.div className={styles.cards} variants={listContainer} initial="hidden" animate="visible">
        {courses.map((course) => (
          <motion.div key={course.class_id} variants={listItem}>
            <CourseCard course={course} />
          </motion.div>
        ))}
      </motion.div>
    </div>
  )
}

export default function GradesOverviewPage() {
  const [courses, setCourses] = useState<CourseGradesSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  // Локальный поиск по названию курса (на бэке поиска по сводке нет)
  const [search, setSearch] = useState("")
  const showToast = useToast()

  useEffect(() => {
    async function load() {
      setIsLoading(true)
      try {
        const data = await getGradesOverview()
        setCourses(data.courses)
      } catch (error) {
        if (error instanceof ApiSilentError) return
        showToast({ type: "error", message: (error as Error).message })
      } finally {
        setIsLoading(false)
      }
    }

    void load()
  }, [])

  // Фильтруем по названию + делим по роли: у студента и преподавателя цифры значат разное
  const query = search.trim().toLowerCase()
  const filtered = query
    ? courses.filter((course) => course.class_name.toLowerCase().includes(query))
    : courses
  const studyCourses = filtered.filter((course) => course.role === "student")
  const teachCourses = filtered.filter((course) => course.role !== "student")

  const hasResults = studyCourses.length > 0 || teachCourses.length > 0

  return (
    <div className={styles.page}>
      <div className={styles.titleBlock}>
        <div className={styles.title}>Оценки</div>
        <div className={styles.text}>Сводка по оценкам и работам на проверке во всех ваших курсах.</div>
      </div>

      <div className={styles.searchControl}>
        <SearchIcon className={styles.searchIcon} />
        <input
          className={styles.searchInput}
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Поиск по курсам"
          disabled={isLoading}
        />
      </div>

      <LoadingSwap isLoading={isLoading} skeleton={<CardsSkeleton className={styles.cards} count={12} variant="grades" title />}>
        {courses.length === 0 && (
          <div className={styles.emptyMessage}>Курсов с оценками пока нет</div>
        )}

        {courses.length > 0 && !hasResults && (
          <div className={styles.emptyMessage}>По запросу «{search.trim()}» курсов не найдено</div>
        )}

        {hasResults && (
          <div className={styles.results}>
            {studyCourses.length > 0 && <GradesSection title="Где я учусь" courses={studyCourses} />}
            {teachCourses.length > 0 && <GradesSection title="Где я преподаю" courses={teachCourses} />}
          </div>
        )}
      </LoadingSwap>
    </div>
  )
}
