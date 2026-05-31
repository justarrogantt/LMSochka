import { z } from "zod"
import { Api } from "../../../../services/api"
import { parseApiResponse, throwApiResponseError } from "../../../../services/response"
import type { Errors, PageDto } from "../../../../types/api.types"

// Обёртка пагинации для списка решений.
function createPageSchema<T extends z.ZodType>(itemSchema: T) {
  return z.object({
    items: z.array(itemSchema),
    total: z.number(),
    page: z.number(),
    limit: z.number()
  }).strip()
}

// Статусы решения на бэке.
const SubmissionStatusSchema = z.enum(["draft", "submitted", "returned", "graded"])

// Краткая карточка студента внутри решения.
const SubmissionStudentSchema = z.object({
  id: z.number(),
  email: z.string().email(),
  first_name: z.string().nullable(),
  last_name: z.string().nullable()
}).strip()

// Оценка, вложенная в решение.
const SubmissionGradeSchema = z.object({
  value: z.number(),
  comment: z.string().nullable(),
  graded_at: z.string(),
  updated_at: z.string().nullable()
}).strip()

// Полное решение задания.
const SubmissionSchema = z.object({
  id: z.number(),
  assignment_id: z.number(),
  student: SubmissionStudentSchema,
  answer_text: z.string(),
  attachment_url: z.string().nullable(),
  status: SubmissionStatusSchema,
  return_comment: z.string().nullable(),
  submitted_at: z.string().nullable(),
  is_late: z.boolean(),
  grade: SubmissionGradeSchema.nullable(),
  created_at: z.string(),
  updated_at: z.string().nullable()
}).strip()

// Пагинированный список решений по заданию.
const SubmissionsPageSchema = createPageSchema(SubmissionSchema)
const NullableSubmissionSchema = SubmissionSchema.nullable()

export type SubmissionStatus = z.infer<typeof SubmissionStatusSchema>
export type SubmissionStudent = z.infer<typeof SubmissionStudentSchema>
export type SubmissionGrade = z.infer<typeof SubmissionGradeSchema>
export type SubmissionDto = z.infer<typeof SubmissionSchema>

export type SaveSubmissionBody = {
  answer_text: string
  attachment_url: string | null
}

const MY_SUBMISSION_ERRORS: Errors = {
  default: "Не удалось загрузить решение",
  404: "Решение не найдено"
}

const SAVE_SUBMISSION_ERRORS: Errors = {
  default: "Не удалось сохранить черновик",
  409: "Решение уже отправлено. Попросите преподавателя вернуть его на доработку",
  422: "Проверьте поля решения"
}

const SUBMIT_SUBMISSION_ERRORS: Errors = {
  default: "Не удалось отправить решение",
  404: "Сначала сохраните черновик решения",
  409: "Решение уже отправлено"
}

const LIST_SUBMISSIONS_ERRORS: Errors = {
  default: "Не удалось загрузить решения студентов"
}

const RETURN_SUBMISSION_ERRORS: Errors = {
  default: "Не удалось вернуть решение на доработку",
  409: "Возвратить можно только отправленное или оценённое решение"
}

export async function getMySubmission(assignmentId: number): Promise<SubmissionDto | null> {
  try {
    const response = await Api.fetchGet(`/api/assignments/${assignmentId}/my-submission`, MY_SUBMISSION_ERRORS)
    return await parseApiResponse(response, NullableSubmissionSchema)
  } catch (error) {
    throwApiResponseError(error)
  }
}

export async function saveMySubmission(
  assignmentId: number,
  body: SaveSubmissionBody
): Promise<SubmissionDto> {
  try {
    const response = await Api.fetchPut(
      `/api/assignments/${assignmentId}/my-submission`,
      body,
      SAVE_SUBMISSION_ERRORS
    )
    return await parseApiResponse(response, SubmissionSchema)
  } catch (error) {
    throwApiResponseError(error)
  }
}

export async function submitMySubmission(assignmentId: number): Promise<SubmissionDto> {
  try {
    const response = await Api.fetchPost(
      `/api/assignments/${assignmentId}/my-submission/submit`,
      {},
      SUBMIT_SUBMISSION_ERRORS
    )
    return await parseApiResponse(response, SubmissionSchema)
  } catch (error) {
    throwApiResponseError(error)
  }
}

export async function listSubmissions(
  assignmentId: number,
  page: number = 1,
  limit: number = 8,
  status: SubmissionStatus | null = null
): Promise<PageDto<SubmissionDto>> {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit)
  })

  if (status) {
    params.set("status", status)
  }

  try {
    const response = await Api.fetchGet(
      `/api/assignments/${assignmentId}/submissions?${params.toString()}`,
      LIST_SUBMISSIONS_ERRORS
    )
    return await parseApiResponse(response, SubmissionsPageSchema)
  } catch (error) {
    throwApiResponseError(error)
  }
}

export async function returnSubmission(submissionId: number, comment: string | null): Promise<SubmissionDto> {
  try {
    const response = await Api.fetchPost(
      `/api/submissions/${submissionId}/return`,
      { comment },
      RETURN_SUBMISSION_ERRORS
    )
    return await parseApiResponse(response, SubmissionSchema)
  } catch (error) {
    throwApiResponseError(error)
  }
}
