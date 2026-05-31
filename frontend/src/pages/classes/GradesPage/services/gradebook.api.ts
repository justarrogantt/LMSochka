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

// Студент в журнале оценок.
const GradebookStudentSchema = z.object({
  id: z.number(),
  email: z.string().email(),
  first_name: z.string().nullable(),
  last_name: z.string().nullable(),
  is_active: z.boolean()
}).strip()

// Ячейка журнала: статус и оценка студента по заданию.
const GradebookCellSchema = z.object({
  student_id: z.number(),
  assignment_id: z.number(),
  status: z.enum(["draft", "submitted", "returned", "graded"]),
  value: z.number().nullable(),
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
export type GradebookStudent = z.infer<typeof GradebookStudentSchema>
export type GradebookCell = z.infer<typeof GradebookCellSchema>
export type GradebookDto = z.infer<typeof GradebookSchema>

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
    return await parseApiResponse(response, GradebookSchema)
  } catch (error) {
    throwApiResponseError(error)
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
    const cells = page.items.map((item) => ({
      student_id: viewer.id,
      assignment_id: item.id,
      status: item.my_submission?.status ?? "draft",
      value: item.my_submission?.grade ?? null,
      is_late: item.my_submission?.is_late ?? false,
      submitted_at: item.my_submission?.submitted_at ?? null
    }))

    return {
      assignments,
      students: [{ ...viewer, is_active: true }],
      cells
    }
  } catch (error) {
    throwApiResponseError(error)
  }
}
