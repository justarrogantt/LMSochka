import { z } from "zod"
import { Api } from "../../../../services/api"
import { StoredFileSchema } from "../../../../services/files.api"
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
  attachment_file: StoredFileSchema.nullable(),
  status: z.enum(["draft", "submitted", "returned", "graded", "pending_redistribution"]),
  return_comment: z.string().nullable(),
  submitted_at: z.string().nullable(),
  is_late: z.boolean(),
  grade: z.object({
    value: z.number(),
    comment: z.string().nullable(),
    graded_at: z.string(),
    updated_at: z.string().nullable()
  }).strip().nullable(),
  group_title: z.string().nullable().default(null),
  group_members: z.array(z.object({
    user_id: z.number(),
    email: z.string().email(),
    first_name: z.string().nullable(),
    last_name: z.string().nullable(),
    is_active: z.boolean()
  }).strip()).default([]),
  member_grades: z.array(z.object({
    user_id: z.number(),
    value: z.number()
  }).strip()).default([]),
  created_at: z.string(),
  updated_at: z.string().nullable()
}).strip()

export type GradeDto = z.infer<typeof GradeSchema>

// ── Перераспределение командной оценки (individual) ──

const MemberGradeSchema = z.object({
  user_id: z.number(),
  value: z.number()
}).strip()

const MemberGradesGroupMemberSchema = z.object({
  user_id: z.number(),
  email: z.string().email(),
  first_name: z.string().nullable(),
  last_name: z.string().nullable(),
  is_active: z.boolean()
}).strip()

const SubmissionMemberGradesSchema = z.object({
  team_value: z.number(),
  max_grade: z.number(),
  members: z.array(MemberGradesGroupMemberSchema),
  grades: z.array(MemberGradeSchema)
}).strip()

export type SubmissionMemberGradesDto = z.infer<typeof SubmissionMemberGradesSchema>
export type MemberGradeBody = { user_id: number; value: number }

const MEMBER_GRADES_ERRORS: Errors = {
  default: "Не удалось загрузить распределение оценки",
  403: "Распределять оценку могут только члены команды",
  404: "Решение не найдено",
  409: "Команде ещё не выставлена оценка"
}

const SAVE_MEMBER_GRADES_ERRORS: Errors = {
  default: "Не удалось сохранить распределение",
  403: "Распределять оценку могут только члены команды",
  422: "Среднее арифметическое должно быть равно командной оценке"
}

export async function getMemberGrades(submissionId: number): Promise<SubmissionMemberGradesDto> {
  try {
    const response = await Api.fetchGet(`/api/submissions/${submissionId}/member-grades`, MEMBER_GRADES_ERRORS)
    return await parseApiResponse(response, SubmissionMemberGradesSchema)
  } catch (error) {
    throwApiResponseError(error)
  }
}

export async function saveMemberGrades(
  submissionId: number,
  grades: MemberGradeBody[]
): Promise<SubmissionMemberGradesDto> {
  try {
    const response = await Api.fetchPut(
      `/api/submissions/${submissionId}/member-grades`,
      { grades },
      SAVE_MEMBER_GRADES_ERRORS
    )
    return await parseApiResponse(response, SubmissionMemberGradesSchema)
  } catch (error) {
    throwApiResponseError(error)
  }
}

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
