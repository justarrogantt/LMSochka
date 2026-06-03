import { useEffect, useMemo, useState } from "react"
import { Link, useOutletContext } from "react-router-dom"
import SearchIcon from "../../../assets/icons/layout/search.svg?react"
import SelectArrowIcon from "../../../assets/icons/select-arrow.svg?react"
import Loading from "../../../components/Loading/Loading"
import { useToast } from "../../../components/Toast/ToastProvider"
import { useAuth } from "../../../contexts/AuthContext"
import type { ClassLayoutContext } from "../../../layouts/ClassLayout/ClassLayout"
import { ApiSilentError } from "../../../services/api"
import { formatDateTime } from "../../../services/helpers"
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

const STATUS_LABELS: Record<GradebookStatus, string> = {
  draft: "Не сдано",
  submitted: "На проверке",
  returned: "Возвращено",
  graded: "Оценено"
}

function studentName(student: GradebookStudent) {
  return `${student.first_name ?? ""} ${student.last_name ?? ""}`.trim() || student.email
}

function cellKey(studentId: number, assignmentId: number) {
  return `${studentId}:${assignmentId}`
}

export default function GradesPage() {
  const { classDetail } = useOutletContext<ClassLayoutContext>()
  const { user } = useAuth()
  const showToast = useToast()

  const [gradebook, setGradebook] = useState<GradebookDto | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const canViewGradebook = classDetail?.permissions.can_view_gradebook ?? false

  useEffect(() => {
    if (!classDetail?.id) {
      setIsLoading(false)
      return
    }

    async function load() {
      setIsLoading(true)
      try {
        const data = canViewGradebook
          ? await getGradebook(classDetail.id)
          : user
            ? await getStudentGradebook(classDetail.id, {
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
  }, [classDetail?.id, canViewGradebook, user?.id])

  const cellMap = useMemo(() => {
    const map = new Map<string, GradebookCell>()
    gradebook?.cells.forEach((cell) => map.set(cellKey(cell.student_id, cell.assignment_id), cell))
    return map
  }, [gradebook])

  const hasData = gradebook && gradebook.students.length > 0

  return (
    <div className={styles.page}>
      <div className={styles.titleBlock}>
        <div className={styles.title}>Оценки курса</div>
        <div className={styles.text}>
          {canViewGradebook ? "Оценки студентов по заданиям курса." : "Ваши оценки по заданиям этого курса."}
        </div>
      </div>

      {isLoading && <Loading />}

      {!isLoading && hasData && canViewGradebook && (
        <TeacherGradebook gradebook={gradebook!} cellMap={cellMap} />
      )}

      {!isLoading && hasData && !canViewGradebook && (
        <StudentGrades
          classId={classDetail!.id}
          assignments={gradebook!.assignments}
          cellMap={cellMap}
          student={gradebook!.students[0]}
        />
      )}

      {!isLoading && !hasData && <div className={styles.emptyMessage}>Данных по оценкам пока нет</div>}
    </div>
  )
}

type TeacherGradebookProps = {
  gradebook: GradebookDto
  cellMap: Map<string, GradebookCell>
}

function TeacherGradebook({ gradebook, cellMap }: TeacherGradebookProps) {
  const [search, setSearch] = useState("")
  const [openStudentId, setOpenStudentId] = useState<number | null>(null)

  const query = search.trim().toLowerCase()
  const students = query
    ? gradebook.students.filter(
        (student) => studentName(student).toLowerCase().includes(query) || student.email.toLowerCase().includes(query)
      )
    : gradebook.students

  return (
    <>
      <label className={styles.search}>
        <div className={styles.searchControl}>
          <SearchIcon className={styles.searchFieldIcon} />
          <input
            className={styles.searchInput}
            type="search"
            placeholder="Поиск по студенту"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </label>

      {students.length > 0 ? (
        <div className={styles.studentList}>
          {students.map((student) => (
            <StudentCard
              key={student.id}
              student={student}
              assignments={gradebook.assignments}
              cellMap={cellMap}
              isOpen={openStudentId === student.id}
              onToggle={() => setOpenStudentId((prev) => (prev === student.id ? null : student.id))}
            />
          ))}
        </div>
      ) : (
        <div className={styles.emptyMessage}>Студенты не найдены</div>
      )}
    </>
  )
}

type StudentCardProps = {
  student: GradebookStudent
  assignments: GradebookAssignment[]
  cellMap: Map<string, GradebookCell>
  isOpen: boolean
  onToggle: () => void
}

function StudentCard({ student, assignments, cellMap, isOpen, onToggle }: StudentCardProps) {
  const avg = student.summary.average_percent
  const gradedCount = student.summary.graded_count
  const totalAssignments = student.summary.total_assignments

  return (
    <div className={styles.studentCard}>
      <button type="button" className={styles.studentHead} onClick={onToggle} aria-expanded={isOpen}>
        <div className={styles.studentAvatar}>{studentName(student)[0]}</div>
        <div className={styles.studentInfo}>
          <div className={styles.studentName}>{studentName(student)}</div>
          <div className={styles.studentEmail}>{student.email}</div>
        </div>
        <div className={styles.studentStats}>
          <span className={styles.studentAvg}>{avg === null ? "—" : `${avg}%`}</span>
          <span className={styles.studentGraded}>оценено {gradedCount} из {totalAssignments}</span>
        </div>
        <span className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ""}`} aria-hidden="true">
          <SelectArrowIcon className={styles.chevronIcon} />
        </span>
      </button>

      {isOpen && (
        <table className={styles.miniTable}>
          <thead>
            <tr>
              <th className={styles.miniTh}>Задание</th>
              <th className={styles.miniTh}>Статус</th>
              <th className={`${styles.miniTh} ${styles.miniNum}`}>Оценка</th>
              <th className={`${styles.miniTh} ${styles.miniNum}`}>%</th>
            </tr>
          </thead>
          <tbody>
            {assignments.map((assignment) => {
              const cell = cellMap.get(cellKey(student.id, assignment.id))
              const status = cell?.status ?? "draft"
              const isGraded = status === "graded" && cell?.value !== null && cell?.value !== undefined
              return (
                <tr key={assignment.id}>
                  <td className={styles.miniTd}>
                    <div className={styles.miniTitle}>{assignment.title}</div>
                    {cell?.is_late && <span className={styles.cellLate}>опоздание</span>}
                  </td>
                  <td className={styles.miniTd}>
                    <span className={`${styles.statusText} ${styles[`status_${status}`]}`}>{STATUS_LABELS[status]}</span>
                  </td>
                  <td className={`${styles.miniTd} ${styles.miniNum}`}>
                    {isGraded ? `${cell!.value} / ${assignment.max_grade}` : "—"}
                  </td>
                  <td className={`${styles.miniTd} ${styles.miniNum}`}>
                    {isGraded && cell!.percent !== null ? `${cell!.percent}%` : "—"}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

type StudentGradesProps = {
  classId: number
  assignments: GradebookAssignment[]
  cellMap: Map<string, GradebookCell>
  student: GradebookStudent
}

function StudentGrades({ classId, assignments, cellMap, student }: StudentGradesProps) {
  const [search, setSearch] = useState("")

  const average = student.summary.average_percent
  const gradedCount = student.summary.graded_count
  const totalAssignments = student.summary.total_assignments

  const query = search.trim().toLowerCase()
  const visible = query ? assignments.filter((assignment) => assignment.title.toLowerCase().includes(query)) : assignments

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
          <div className={styles.summaryValue}>{gradedCount} из {totalAssignments}</div>
        </div>
      </div>

      <label className={styles.search}>
        <div className={styles.searchControl}>
          <SearchIcon className={styles.searchFieldIcon} />
          <input
            className={styles.searchInput}
            type="search"
            placeholder="Поиск по заданию"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </label>

      {visible.length > 0 ? (
        <div className={styles.gradeList}>
          {visible.map((assignment) => {
            const cell = cellMap.get(cellKey(student.id, assignment.id))
            const status = cell?.status ?? "draft"
            const isGraded = status === "graded" && cell?.value !== null && cell?.value !== undefined

            return (
              <Link key={assignment.id} className={styles.gradeRow} to={`/classes/${classId}/assignments/${assignment.id}`}>
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
                      {cell!.percent !== null ? `${cell!.percent}%` : "—"}
                    </span>
                  </div>
                ) : (
                  <span className={`${styles.rowStatus} ${styles[`status_${status}`]}`}>{STATUS_LABELS[status]}</span>
                )}
              </Link>
            )
          })}
        </div>
      ) : (
        <div className={styles.emptyMessage}>Задания не найдены</div>
      )}
    </>
  )
}
