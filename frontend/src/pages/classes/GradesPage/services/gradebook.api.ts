import { z } from "zod"
import { Api } from "../../../../services/api"
import { parseApiResponse, throwApiResponseError } from "../../../../services/response"
import type { Errors } from "../../../../types/api.types"

export type GradebookStatus = "draft" | "submitted" | "returned" | "graded"

// Задание в журнале оценок.
const GradebookAssignmentSchema = z.object({
  id: z.number(),
  title: z.string(),
  max_grade: z.number(),
  due_at: z.string().nullable()
}).strip()

// Готовая сводка по студенту из журнала оценок.
const GradebookStudentSummarySchema = z.object({
  average_percent: z.number().nullable(),
  graded_count: z.number(),
  submitted_count: z.number(),
  pending_review_count: z.number(),
  total_assignments: z.number()
}).strip()

// Студент в журнале оценок.
const GradebookStudentSchema = z.object({
  id: z.number(),
  email: z.string().email(),
  first_name: z.string().nullable(),
  last_name: z.string().nullable(),
  is_active: z.boolean(),
  summary: GradebookStudentSummarySchema.optional()
}).strip()

// Ячейка журнала: статус и оценка студента по заданию.
const GradebookCellSchema = z.object({
  student_id: z.number(),
  assignment_id: z.number(),
  status: z.enum(["draft", "submitted", "returned", "graded"]),
  value: z.number().nullable(),
  percent: z.number().nullable().optional(),
  is_late: z.boolean(),
  submitted_at: z.string().nullable()
}).strip()

// Полная таблица оценок курса.
const GradebookSchema = z.object({
  assignments: z.array(GradebookAssignmentSchema),
  students: z.array(GradebookStudentSchema),
  cells: z.array(GradebookCellSchema)
}).strip()

// Ответ списка заданий для студента. Используем его, чтобы собрать личную строку оценок.
const StudentAssignmentsPageSchema = z.object({
  items: z.array(z.object({
    id: z.number(),
    title: z.string(),
    max_grade: z.number(),
    due_at: z.string().nullable(),
    my_submission: z.object({
      submission_id: z.number(),
      status: z.enum(["draft", "submitted", "returned", "graded"]),
      submitted_at: z.string().nullable(),
      is_late: z.boolean(),
      grade: z.number().nullable()
    }).strip().nullable()
  }).strip()),
  total: z.number(),
  page: z.number(),
  limit: z.number()
}).strip()

export type GradebookAssignment = z.infer<typeof GradebookAssignmentSchema>
export type GradebookStudentSummary = z.infer<typeof GradebookStudentSummarySchema>
export type GradebookStudent = Omit<z.infer<typeof GradebookStudentSchema>, "summary"> & {
  summary: GradebookStudentSummary
}
export type GradebookCell = Omit<z.infer<typeof GradebookCellSchema>, "percent"> & {
  percent: number | null
}
export type GradebookDto = {
  assignments: GradebookAssignment[]
  students: GradebookStudent[]
  cells: GradebookCell[]
}

export type GradebookViewer = {
  id: number
  email: string
  first_name: string | null
  last_name: string | null
}

const GRADEBOOK_ERRORS: Errors = {
  default: "Не удалось загрузить журнал оценок",
  403: "Журнал оценок доступен только преподавателям"
}

const STUDENT_GRADES_ERRORS: Errors = {
  default: "Не удалось загрузить ваши оценки"
}

export async function getGradebook(classId: number): Promise<GradebookDto> {
  try {
    const response = await Api.fetchGet(`/api/classes/${classId}/gradebook`, GRADEBOOK_ERRORS)
    const gradebook = await parseApiResponse(response, GradebookSchema)
    return normalizeGradebook(gradebook)
  } catch (error) {
    throwApiResponseError(error)
  }
}

function percentOf(value: number | null, maxGrade: number): number | null {
  if (value === null || maxGrade <= 0) return null
  return Math.round((value / maxGrade) * 10000) / 100
}

function averagePercent(values: number[]): number | null {
  if (values.length === 0) return null

  const sum = values.reduce((acc, value) => acc + value, 0)
  return Math.round((sum / values.length) * 100) / 100
}

function buildStudentSummary(
  studentId: number,
  assignments: GradebookAssignment[],
  cells: GradebookCell[]
): GradebookStudentSummary {
  const studentCells = cells.filter((cell) => cell.student_id === studentId)
  const gradedPercents = studentCells
    .filter((cell) => cell.status === "graded" && cell.percent !== null)
    .map((cell) => cell.percent!)

  return {
    average_percent: averagePercent(gradedPercents),
    graded_count: studentCells.filter((cell) => cell.status === "graded").length,
    submitted_count: studentCells.filter((cell) => cell.status === "submitted" || cell.status === "graded").length,
    pending_review_count: studentCells.filter((cell) => cell.status === "submitted").length,
    total_assignments: assignments.length
  }
}

function normalizeGradebook(raw: z.infer<typeof GradebookSchema>): GradebookDto {
  const assignmentsById = new Map(raw.assignments.map((assignment) => [assignment.id, assignment]))
  const cells = raw.cells.map((cell) => {
    const assignment = assignmentsById.get(cell.assignment_id)
    const percent = cell.percent ?? (
      cell.status === "graded" && assignment
        ? percentOf(cell.value, assignment.max_grade)
        : null
    )

    return { ...cell, percent }
  })
  const students = raw.students.map((student) => ({
    ...student,
    summary: student.summary ?? buildStudentSummary(student.id, raw.assignments, cells)
  }))

  return {
    assignments: raw.assignments,
    students,
    cells
  }
}

export async function getStudentGradebook(classId: number, viewer: GradebookViewer): Promise<GradebookDto> {
  try {
    const response = await Api.fetchGet(
      `/api/classes/${classId}/assignments?page=1&limit=100`,
      STUDENT_GRADES_ERRORS
    )
    const page = await parseApiResponse(response, StudentAssignmentsPageSchema)
    const assignments = page.items.map((item) => ({
      id: item.id,
      title: item.title,
      max_grade: item.max_grade,
      due_at: item.due_at
    }))
    const cells = page.items.map((item) => {
      const status = item.my_submission?.status ?? "draft"
      const value = item.my_submission?.grade ?? null
      return {
        student_id: viewer.id,
        assignment_id: item.id,
        status,
        value,
        percent: status === "graded" ? percentOf(value, item.max_grade) : null,
        is_late: item.my_submission?.is_late ?? false,
        submitted_at: item.my_submission?.submitted_at ?? null
      }
    })
    const percentValues = cells
      .map((cell) => cell.percent)
      .filter((value): value is number => value !== null)
    const averagePercent = percentValues.length > 0
      ? Math.round((percentValues.reduce((sum, value) => sum + value, 0) / percentValues.length) * 100) / 100
      : null
    const submittedCount = cells.filter((cell) => cell.status === "submitted" || cell.status === "graded").length

    return {
      assignments,
      students: [{
        ...viewer,
        is_active: true,
        summary: {
          average_percent: averagePercent,
          graded_count: cells.filter((cell) => cell.status === "graded").length,
          submitted_count: submittedCount,
          pending_review_count: cells.filter((cell) => cell.status === "submitted").length,
          total_assignments: assignments.length
        }
      }],
      cells
    }
  } catch (error) {
    throwApiResponseError(error)
  }
}
