import { z } from "zod"
import { Api } from "../../../../services/api"
import { parseApiResponse, throwApiResponseError } from "../../../../services/response"
import type { Errors, PageDto } from "../../../../types/api.types"

// Обёртка пагинации для списка заданий.
function createPageSchema<T extends z.ZodType>(itemSchema: T) {
  return z.object({
    items: z.array(itemSchema),
    total: z.number(),
    page: z.number(),
    limit: z.number()
  }).strip()
}

// Краткая карточка пользователя-автора задания.
const UserBriefSchema = z.object({
  id: z.number(),
  email: z.string().email(),
  first_name: z.string().nullable(),
  last_name: z.string().nullable()
}).strip()

// Статус решения студента.
const SubmissionStatusSchema = z.enum(["draft", "submitted", "returned", "graded"])

// Краткая сводка решения текущего студента в карточке задания.
const AssignmentMySubmissionSchema = z.object({
  submission_id: z.number(),
  status: SubmissionStatusSchema,
  submitted_at: z.string().nullable(),
  is_late: z.boolean(),
  grade: z.number().nullable()
}).strip()

// Статистика сдачи задания для преподавателя.
const AssignmentStatsSchema = z.object({
  students_total: z.number(),
  submitted_count: z.number(),
  pending_review_count: z.number().default(0),
  graded_count: z.number(),
  returned_count: z.number().default(0)
}).strip()

// Полное задание из API.
const AssignmentSchema = z.object({
  id: z.number(),
  class_id: z.number(),
  author: UserBriefSchema,
  title: z.string(),
  description: z.string(),
  material_url: z.string().nullable(),
  due_at: z.string().nullable(),
  max_grade: z.number(),
  created_at: z.string(),
  updated_at: z.string().nullable(),
  my_submission: AssignmentMySubmissionSchema.nullable(),
  stats: AssignmentStatsSchema.nullable()
}).strip()

export type AssignmentDto = z.infer<typeof AssignmentSchema>

const LIST_ASSIGNMENTS_ERRORS: Errors = {
  default: "Не удалось загрузить задания"
}

const GET_ASSIGNMENT_ERRORS: Errors = {
  default: "Не удалось загрузить задание",
  404: "Задание не найдено"
}

const CREATE_ASSIGNMENT_ERRORS: Errors = {
  default: "Не удалось создать задание",
  403: "Недостаточно прав для создания задания",
  404: "Курс не найден",
  422: "Проверьте поля задания"
}

const UPDATE_ASSIGNMENT_ERRORS: Errors = {
  default: "Не удалось обновить задание",
  403: "Недостаточно прав для редактирования задания",
  404: "Задание не найдено",
  422: "Проверьте поля задания"
}

const DELETE_ASSIGNMENT_ERRORS: Errors = {
  default: "Не удалось удалить задание",
  403: "Недостаточно прав для удаления задания",
  404: "Задание не найдено"
}

// Пагинированный ответ списка заданий с серверным счётчиком вкладки "На проверке".
const AssignmentsPageSchema = createPageSchema(AssignmentSchema).extend({
  pending_review_total: z.number().default(0)
})

export type AssignmentsReviewStatus = "pending"
export type AssignmentsPageDto = PageDto<AssignmentDto> & z.infer<typeof AssignmentsPageSchema>

export async function listAssignments(
  classId: number,
  page: number = 1,
  limit: number = 20,
  reviewStatus?: AssignmentsReviewStatus
): Promise<AssignmentsPageDto> {
  try {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit)
    })

    if (reviewStatus) {
      params.set("review_status", reviewStatus)
    }

    const response = await Api.fetchGet(
      `/api/classes/${classId}/assignments?${params.toString()}`,
      LIST_ASSIGNMENTS_ERRORS
    )
    return await parseApiResponse(response, AssignmentsPageSchema)
  } catch (error) {
    throwApiResponseError(error)
  }
}

export async function getAssignment(classId: number, assignmentId: number): Promise<AssignmentDto> {
  try {
    const response = await Api.fetchGet(
      `/api/classes/${classId}/assignments/${assignmentId}`,
      GET_ASSIGNMENT_ERRORS
    )
    return await parseApiResponse(response, AssignmentSchema)
  } catch (error) {
    throwApiResponseError(error)
  }
}

export async function createAssignment(
  classId: number,
  body: {
    title: string
    description?: string
    material_url?: string | null
    due_at?: string | null
    max_grade: number
  }
): Promise<AssignmentDto> {
  try {
    const response = await Api.fetchPost(
      `/api/classes/${classId}/assignments`,
      body,
      CREATE_ASSIGNMENT_ERRORS
    )
    return await parseApiResponse(response, AssignmentSchema)
  } catch (error) {
    throwApiResponseError(error)
  }
}

export async function updateAssignment(
  classId: number,
  assignmentId: number,
  body: {
    title?: string
    description?: string
    material_url?: string | null
    due_at?: string | null
    max_grade?: number
  }
): Promise<AssignmentDto> {
  try {
    const response = await Api.fetchPatch(
      `/api/classes/${classId}/assignments/${assignmentId}`,
      body,
      UPDATE_ASSIGNMENT_ERRORS
    )
    return await parseApiResponse(response, AssignmentSchema)
  } catch (error) {
    throwApiResponseError(error)
  }
}

export async function deleteAssignment(classId: number, assignmentId: number): Promise<void> {
  try {
    await Api.fetchDelete(
      `/api/classes/${classId}/assignments/${assignmentId}`,
      DELETE_ASSIGNMENT_ERRORS
    )
  } catch (error) {
    throwApiResponseError(error)
  }
}
