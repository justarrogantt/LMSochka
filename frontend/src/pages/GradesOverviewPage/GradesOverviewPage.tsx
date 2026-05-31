import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import Loading from "../../components/Loading/Loading"
import { useToast } from "../../components/Toast/ToastProvider"
import { ApiSilentError } from "../../services/api"
import { getGradesOverview, type CourseGradesSummary } from "./services/gradesOverview.api"
import styles from "./GradesOverviewPage.module.css"

// Цвет среднего балла по диапазону (зелёный / жёлтый / красный)
function averageClass(percent: number | null) {
  if (percent === null) return styles.avgEmpty
  if (percent >= 85) return styles.avgGood
  if (percent >= 65) return styles.avgMid
  return styles.avgLow
}

type CourseCardProps = {
  course: CourseGradesSummary
}

// Карточка сводки по одному курсу
function CourseCard({ course }: CourseCardProps) {
  return (
    <Link className={styles.card} to={`/classes/${course.class_id}/grades`}>
      <div className={styles.cardHead}>
        <div className={styles.courseName}>{course.class_name}</div>
        <div className={`${styles.average} ${averageClass(course.average_percent)}`}>
          {course.average_percent === null ? "—" : `${course.average_percent}%`}
        </div>
      </div>

      <div className={styles.cardMeta}>
        <span>Оценено {course.graded_count} из {course.assignments_count}</span>
        {course.pending_count > 0 && <span className={styles.pending}>Ждут сдачи: {course.pending_count}</span>}
      </div>
    </Link>
  )
}

export default function GradesOverviewPage() {
  const showToast = useToast()

  // Сводка оценок по курсам
  const [courses, setCourses] = useState<CourseGradesSummary[]>([])

  // Лоадер страницы
  const [isLoading, setIsLoading] = useState(true)

  // Загрузка сводки оценок
  useEffect(() => {
    async function load() {
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
        <div className={styles.text}>Сводка успеваемости по всем вашим курсам.</div>
      </div>

      {isLoading && <Loading />}

      {!isLoading && courses.length > 0 && (
        <div className={styles.cards}>
          {courses.map((course) => (
            <CourseCard key={course.class_id} course={course} />
          ))}
        </div>
      )}

      {!isLoading && courses.length === 0 && <div className={styles.emptyMessage}>Оценок пока нет</div>}
    </div>
  )
}
