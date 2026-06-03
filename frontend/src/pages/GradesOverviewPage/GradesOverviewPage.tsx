import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import Loading from "../../components/Loading/Loading"
import { useToast } from "../../components/Toast/ToastProvider"
import { ApiSilentError } from "../../services/api"
import { getGradesOverview, type CourseGradesSummary } from "./services/gradesOverview.api"
import styles from "./GradesOverviewPage.module.css"

function averageClassName(value: number | null) {
  if (value === null) return styles.avgEmpty
  if (value >= 80) return styles.avgGood
  if (value >= 50) return styles.avgMid
  return styles.avgLow
}

function formatAverage(value: number | null) {
  return value === null ? "—" : `${value}%`
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

export default function GradesOverviewPage() {
  const [courses, setCourses] = useState<CourseGradesSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
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

  return (
    <div className={styles.page}>
      <div className={styles.titleBlock}>
        <div className={styles.title}>Оценки</div>
        <div className={styles.text}>Сводка по оценкам и работам на проверке во всех ваших курсах.</div>
      </div>

      {isLoading && <Loading />}

      {!isLoading && courses.length > 0 && (
        <div className={styles.cards}>
          {courses.map((course) => (
            <CourseCard key={course.class_id} course={course} />
          ))}
        </div>
      )}

      {!isLoading && courses.length === 0 && (
        <div className={styles.emptyMessage}>Курсов с оценками пока нет</div>
      )}
    </div>
  )
}
