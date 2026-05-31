import { z } from "zod"
import { Api } from "../../../../services/api"
import { parseApiResponse, throwApiResponseError } from "../../../../services/response"
import type { Errors } from "../../../../types/api.types"
import type { SubmissionDto } from "./submissions.api"

// Краткая карточка проверяющего в ответе оценки.
const GradeUserSchema = z.object({
  id: z.number(),
  email: z.string().email(),
  first_name: z.string().nullable(),
  last_name: z.string().nullable()
}).strip()

// Оценка как отдельная сущность.
const GradeSchema = z.object({
  submission_id: z.number(),
  value: z.number(),
  comment: z.string().nullable(),
  graded_by: GradeUserSchema,
  graded_at: z.string(),
  updated_at: z.string().nullable()
}).strip()

// Схема решения нужна для ответа DELETE /grade.
const SubmissionSchema = z.object({
  id: z.number(),
  assignment_id: z.number(),
  student: GradeUserSchema,
  answer_text: z.string(),
  attachment_url: z.string().nullable(),
  status: z.enum(["draft", "submitted", "returned", "graded"]),
  return_comment: z.string().nullable(),
  submitted_at: z.string().nullable(),
  is_late: z.boolean(),
  grade: z.object({
    value: z.number(),
    comment: z.string().nullable(),
    graded_at: z.string(),
    updated_at: z.string().nullable()
  }).strip().nullable(),
  created_at: z.string(),
  updated_at: z.string().nullable()
}).strip()

export type GradeDto = z.infer<typeof GradeSchema>

export type UpsertGradeBody = {
  value: number
  comment: string | null
}

const UPSERT_GRADE_ERRORS: Errors = {
  default: "Не удалось сохранить оценку",
  409: "Оценивать можно только отправленное или уже оценённое решение",
  422: "Проверьте значение оценки"
}

const DELETE_GRADE_ERRORS: Errors = {
  default: "Не удалось снять оценку",
  404: "Оценка не найдена"
}

export async function upsertGrade(submissionId: number, body: UpsertGradeBody): Promise<GradeDto> {
  try {
    const response = await Api.fetchPut(`/api/submissions/${submissionId}/grade`, body, UPSERT_GRADE_ERRORS)
    return await parseApiResponse(response, GradeSchema)
  } catch (error) {
    throwApiResponseError(error)
  }
}

export async function deleteGrade(submissionId: number): Promise<SubmissionDto> {
  try {
    const response = await Api.fetchDelete(`/api/submissions/${submissionId}/grade`, DELETE_GRADE_ERRORS)
    return await parseApiResponse(response, SubmissionSchema)
  } catch (error) {
    throwApiResponseError(error)
  }
}
