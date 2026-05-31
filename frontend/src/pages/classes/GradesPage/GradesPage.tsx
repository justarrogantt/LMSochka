import { useEffect, useState } from "react"
import { useOutletContext } from "react-router-dom"
import Loading from "../../../components/Loading/Loading"
import { useToast } from "../../../components/Toast/ToastProvider"
import { useAuth } from "../../../contexts/AuthContext"
import { ApiSilentError } from "../../../services/api"
import { formatDateTime } from "../../../services/helpers"
import type { ClassLayoutContext } from "../../../layouts/ClassLayout/ClassLayout"
import {
  getGradebook,
  getStudentGradebook,
  type GradebookAssignment,
  type GradebookCell,
  type GradebookDto,
  type GradebookStatus,
  type GradebookStudent
} from "./services/gradebook.api"
import styles from "./GradesPage.module.css"

// Краткие подписи статусов для ячеек без оценки (таблица преподавателя)
const STATUS_SHORT: Record<GradebookStatus, string> = {
  draft: "—",
  submitted: "Сдано",
  returned: "Возврат",
  graded: ""
}

// Подписи статусов для списка студента
const STATUS_LABELS: Record<GradebookStatus, string> = {
  draft: "Не сдано",
  submitted: "На проверке",
  returned: "Возвращено",
  graded: "Оценено"
}

// Имя студента или email, если имя не заполнено
function studentName(student: GradebookStudent) {
  return `${student.first_name ?? ""} ${student.last_name ?? ""}`.trim() || student.email
}

// Ключ ячейки в карте student×assignment
function cellKey(studentId: number, assignmentId: number) {
  return `${studentId}:${assignmentId}`
}

export default function GradesPage() {
  const { classDetail } = useOutletContext<ClassLayoutContext>()
  const { user } = useAuth()
  const showToast = useToast()

  // Данные журнала
  const [gradebook, setGradebook] = useState<GradebookDto | null>(null)

  // Лоадер страницы
  const [isLoading, setIsLoading] = useState(true)

  const canViewGradebook = classDetail?.permissions.can_view_gradebook ?? false

  // Загрузка журнала. Преподаватель получает весь журнал, студент — свою строку из списка заданий.
  useEffect(() => {
    if (!classDetail?.id) {
      setIsLoading(false)
      return
    }

    async function load() {
      setIsLoading(true)
      try {
        const data = canViewGradebook
          ? await getGradebook(classDetail!.id)
          : user
            ? await getStudentGradebook(classDetail!.id, {
                id: user.id,
                email: user.email,
                first_name: user.first_name,
                last_name: user.last_name
              })
            : null
        if (!data) return
        setGradebook(data)
      } catch (error) {
        if (error instanceof ApiSilentError) return
        showToast({ type: "error", message: (error as Error).message })
      } finally {
        setIsLoading(false)
      }
    }

    void load()
  }, [classDetail?.id, canViewGradebook])

  // Карта ячеек для быстрого доступа по студенту и заданию
  const cellMap = new Map<string, GradebookCell>()
  gradebook?.cells.forEach((cell) => cellMap.set(cellKey(cell.student_id, cell.assignment_id), cell))

  // Средний балл студента по выставленным оценкам (в процентах от максимума)
  function averagePercent(studentId: number): number | null {
    if (!gradebook) return null
    const graded = gradebook.assignments
      .map((assignment) => ({ assignment, cell: cellMap.get(cellKey(studentId, assignment.id)) }))
      .filter((entry) => entry.cell?.status === "graded" && entry.cell.value !== null)

    if (graded.length === 0) return null

    const sum = graded.reduce((acc, entry) => acc + (entry.cell!.value! / entry.assignment.max_grade) * 100, 0)
    return Math.round(sum / graded.length)
  }

  const hasData = gradebook && gradebook.students.length > 0

  return (
    <div className={styles.page}>
      <div className={styles.titleBlock}>
        <div className={styles.title}>Оценки курса</div>
        <div className={styles.text}>
          {canViewGradebook
            ? "Сводная таблица оценок студентов по заданиям курса."
            : "Ваши оценки по заданиям этого курса."}
        </div>
      </div>

      {isLoading && <Loading />}

      {/* Преподаватель: матрица студент × задание */}
      {!isLoading && hasData && canViewGradebook && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={`${styles.th} ${styles.stickyCol}`}>Студент</th>
                {gradebook!.assignments.map((assignment) => (
                  <th key={assignment.id} className={styles.th} title={assignment.title}>
                    <div className={styles.thTitle}>{assignment.title}</div>
                    <div className={styles.thMax}>макс. {assignment.max_grade}</div>
                  </th>
                ))}
                <th className={`${styles.th} ${styles.thAvg}`}>Средний</th>
              </tr>
            </thead>
            <tbody>
              {gradebook!.students.map((student) => {
                const avg = averagePercent(student.id)
                return (
                  <tr key={student.id}>
                    <td className={`${styles.td} ${styles.stickyCol} ${styles.studentCell}`}>
                      <div className={styles.studentName}>{studentName(student)}</div>
                      <div className={styles.studentEmail}>{student.email}</div>
                    </td>

                    {gradebook!.assignments.map((assignment) => {
                      const cell = cellMap.get(cellKey(student.id, assignment.id))
                      const status = cell?.status ?? "draft"
                      return (
                        <td key={assignment.id} className={styles.td}>
                          {status === "graded" && cell?.value !== null && cell?.value !== undefined ? (
                            <div className={styles.gradeCell}>
                              <span className={styles.gradeCellValue}>{cell.value}</span>
                              {cell.is_late && <span className={styles.cellLate}>опоздание</span>}
                            </div>
                          ) : (
                            <span className={`${styles.statusCell} ${styles[`status_${status}`]}`}>
                              {STATUS_SHORT[status]}
                            </span>
                          )}
                        </td>
                      )
                    })}

                    <td className={`${styles.td} ${styles.avgCell}`}>
                      {avg === null ? <span className={styles.statusCell}>—</span> : `${avg}%`}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Студент: вертикальный список своих заданий с оценками */}
      {!isLoading && hasData && !canViewGradebook && (
        <StudentGrades
          assignments={gradebook!.assignments}
          cellMap={cellMap}
          studentId={gradebook!.students[0].id}
          average={averagePercent(gradebook!.students[0].id)}
        />
      )}

      {!isLoading && !hasData && <div className={styles.emptyMessage}>Данных по оценкам пока нет</div>}
    </div>
  )
}

type StudentGradesProps = {
  assignments: GradebookAssignment[]
  cellMap: Map<string, GradebookCell>
  studentId: number
  average: number | null
}

// Список заданий студента с его оценками (одна строка на задание)
function StudentGrades({ assignments, cellMap, studentId, average }: StudentGradesProps) {
  const gradedCount = assignments.filter(
    (assignment) => cellMap.get(cellKey(studentId, assignment.id))?.status === "graded"
  ).length

  return (
    <>
      <div className={styles.summary}>
        <div className={styles.summaryBlock}>
          <div className={styles.summaryLabel}>Средний балл</div>
          <div className={styles.summaryValue}>{average === null ? "—" : `${average}%`}</div>
        </div>
        <div className={styles.summaryDivider} />
        <div className={styles.summaryBlock}>
          <div className={styles.summaryLabel}>Оценено заданий</div>
          <div className={styles.summaryValue}>{gradedCount} из {assignments.length}</div>
        </div>
      </div>

      <div className={styles.gradeList}>
        {assignments.map((assignment) => {
          const cell = cellMap.get(cellKey(studentId, assignment.id))
          const status = cell?.status ?? "draft"
          const isGraded = status === "graded" && cell?.value !== null && cell?.value !== undefined

          return (
            <div key={assignment.id} className={styles.gradeRow}>
              <div className={styles.gradeRowMain}>
                <div className={styles.gradeRowTitle}>{assignment.title}</div>
                <div className={styles.gradeRowMeta}>
                  <span>макс. {assignment.max_grade} баллов</span>
                  {assignment.due_at && <span>дедлайн {formatDateTime(assignment.due_at)}</span>}
                  {cell?.is_late && <span className={styles.cellLate}>сдано с опозданием</span>}
                </div>
              </div>

              {isGraded ? (
                <div className={styles.gradeRowScore}>
                  <span className={styles.gradeRowValue}>{cell!.value} / {assignment.max_grade}</span>
                  <span className={styles.gradeRowPercent}>
                    {Math.round((cell!.value! / assignment.max_grade) * 100)}%
                  </span>
                </div>
              ) : (
                <span className={`${styles.rowStatus} ${styles[`status_${status}`]}`}>{STATUS_LABELS[status]}</span>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}
