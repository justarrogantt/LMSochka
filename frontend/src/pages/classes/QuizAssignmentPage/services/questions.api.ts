import { z } from "zod"
import { Api } from "../../../../services/api"
import { parseApiResponse, throwApiResponseError } from "../../../../services/response"
import type { Errors, PageDto } from "../../../../types/api.types"

const QuestionTypeSchema = z.enum(["single_choice", "multiple_choice", "text_input"])
const QuestionStatusSchema = z.enum(["draft", "ready"])

const QuestionOptionSchema = z.object({
  id: z.number().optional(),
  text: z.string(),
  is_correct: z.boolean().optional(),
  position: z.number()
}).strip()

const QuestionTextAnswerSchema = z.object({
  id: z.number().optional(),
  answer: z.string(),
  is_case_sensitive: z.boolean()
}).strip()

const QuestionSchema = z.object({
  id: z.number(),
  class_id: z.number(),
  created_by_user_id: z.number(),
  title: z.string(),
  question_text: z.string(),
  type: QuestionTypeSchema,
  default_points: z.number(),
  explanation: z.string().nullable(),
  status: QuestionStatusSchema,
  options: z.array(QuestionOptionSchema).default([]),
  text_answers: z.array(QuestionTextAnswerSchema).default([]),
  created_at: z.string(),
  updated_at: z.string().nullable()
}).strip()

const QuestionListItemSchema = z.object({
  id: z.number(),
  title: z.string(),
  question_text: z.string(),
  type: QuestionTypeSchema,
  default_points: z.number(),
  status: QuestionStatusSchema,
  options_count: z.number(),
  created_at: z.string()
}).strip()

const QuestionPageSchema = z.object({
  items: z.array(QuestionListItemSchema),
  total: z.number(),
  page: z.number(),
  limit: z.number()
}).strip()

export type QuestionType = z.infer<typeof QuestionTypeSchema>
export type QuestionStatus = z.infer<typeof QuestionStatusSchema>
export type QuestionOption = z.infer<typeof QuestionOptionSchema>
export type QuestionTextAnswer = z.infer<typeof QuestionTextAnswerSchema>
export type QuestionBankQuestion = z.infer<typeof QuestionSchema>
export type QuestionListItem = z.infer<typeof QuestionListItemSchema>

const CREATE_ERRORS: Errors = {
  default: "Не удалось создать вопрос",
  422: "Проверьте настройки вопроса"
}

const LIST_ERRORS: Errors = {
  default: "Не удалось загрузить банк вопросов"
}

export async function createQuestion(
  classId: number,
  body: {
    title: string
    question_text: string
    type: QuestionType
    default_points: number
    explanation?: string | null
    status: QuestionStatus
    options?: Array<{ text: string; is_correct: boolean; position: number }>
    text_answers?: Array<{ answer: string; is_case_sensitive: boolean }>
  }
): Promise<QuestionBankQuestion> {
  try {
    const response = await Api.fetchPost(
      `/api/classes/${classId}/questions`,
      body,
      CREATE_ERRORS
    )
    return await parseApiResponse(response, QuestionSchema)
  } catch (error) {
    throwApiResponseError(error)
  }
}

export async function getQuestions(
  classId: number,
  filters: { type?: QuestionType; status?: QuestionStatus; search?: string } = {}
): Promise<PageDto<QuestionListItem>> {
  const params = new URLSearchParams({ page: "1", limit: "100" })
  if (filters.type) params.set("type", filters.type)
  if (filters.status) params.set("status", filters.status)
  if (filters.search) params.set("search", filters.search)

  try {
    const response = await Api.fetchGet(
      `/api/classes/${classId}/questions?${params.toString()}`,
      LIST_ERRORS
    )
    return await parseApiResponse(response, QuestionPageSchema)
  } catch (error) {
    throwApiResponseError(error)
  }
}
