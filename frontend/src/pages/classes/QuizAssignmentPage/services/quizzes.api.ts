import { z } from "zod"
import { Api } from "../../../../services/api"
import { parseApiResponse, throwApiResponseError } from "../../../../services/response"
import type { Errors } from "../../../../types/api.types"

const QuizOptionSchema = z.object({
  id: z.number(),
  text: z.string(),
  position: z.number()
}).strip()

const QuizQuestionTeacherSchema = z.object({
  id: z.number(),
  question_id: z.number(),
  title: z.string(),
  type: z.enum(["single_choice", "multiple_choice", "text_input"]),
  question_text: z.string(),
  points: z.number(),
  position: z.number(),
  options: z.array(
    z.object({
      id: z.number(),
      text: z.string(),
      is_correct: z.boolean(),
      position: z.number()
    }).strip()
  ).default([]),
  text_answers: z.array(
    z.object({
      id: z.number(),
      answer: z.string(),
      is_case_sensitive: z.boolean()
    }).strip()
  ).default([]),
  explanation: z.string().nullable()
}).strip()

const QuizQuestionStudentSchema = z.object({
  id: z.number(),
  question_id: z.number(),
  type: z.enum(["single_choice", "multiple_choice", "text_input"]),
  question_text: z.string(),
  points: z.number(),
  options: z.array(QuizOptionSchema).default([])
}).strip()

const QuizSettingsSchema = z.object({
  shuffle_questions: z.boolean(),
  shuffle_options: z.boolean(),
  show_result_after_submit: z.boolean(),
  show_correct_answers_after_submit: z.boolean(),
  time_limit_minutes: z.number().nullable(),
  attempts_limit: z.number()
}).strip()

const QuizAssignmentDetailsSchema = z.object({
  assignment_id: z.number(),
  type: z.enum(["quiz"]),
  settings: QuizSettingsSchema,
  questions: z.array(QuizQuestionTeacherSchema)
}).strip()

const StartAttemptSchema = z.object({
  attempt_id: z.number(),
  assignment_id: z.number(),
  status: z.enum(["in_progress", "submitted"]),
  started_at: z.string(),
  questions: z.array(QuizQuestionStudentSchema)
}).strip()

const AttemptAnswerResultSchema = z.object({
  question_id: z.number(),
  is_correct: z.boolean().nullable(),
  score: z.number().nullable(),
  selected_option_ids: z.array(z.number()).nullable().optional(),
  text_answer: z.string().nullable().optional(),
  correct_option_ids: z.array(z.number()).nullable().optional(),
  correct_text_answers: z.array(z.string()).nullable().optional(),
  explanation: z.string().nullable().optional()
}).strip()

const AttemptResultSchema = z.object({
  attempt_id: z.number(),
  assignment_id: z.number().optional(),
  status: z.enum(["in_progress", "submitted"]),
  score: z.number().nullable(),
  max_score: z.number().nullable(),
  submitted_at: z.string().nullable(),
  answers: z.array(AttemptAnswerResultSchema)
}).strip()

export type QuizAssignmentDetails = z.infer<typeof QuizAssignmentDetailsSchema>
export type QuizQuestionTeacher = z.infer<typeof QuizQuestionTeacherSchema>
export type QuizQuestionStudent = z.infer<typeof QuizQuestionStudentSchema>
export type QuizAttempt = z.infer<typeof StartAttemptSchema>
export type QuizAttemptResult = z.infer<typeof AttemptResultSchema>

const DEFAULT_ERRORS: Errors = {
  default: "Не удалось выполнить действие с тестом",
  422: "Проверьте данные теста"
}

export async function addQuestionToQuiz(
  assignmentId: number,
  body: { question_id: number; points: number; position: number }
): Promise<QuizQuestionTeacher> {
  try {
    const response = await Api.fetchPost(
      `/api/assignments/${assignmentId}/quiz/questions`,
      body,
      DEFAULT_ERRORS
    )
    return await parseApiResponse(response, QuizQuestionTeacherSchema)
  } catch (error) {
    throwApiResponseError(error)
  }
}

export async function getQuizQuestionsForTeacher(
  assignmentId: number
): Promise<QuizAssignmentDetails> {
  try {
    const response = await Api.fetchGet(
      `/api/assignments/${assignmentId}/quiz/questions`,
      DEFAULT_ERRORS
    )
    return await parseApiResponse(response, QuizAssignmentDetailsSchema)
  } catch (error) {
    throwApiResponseError(error)
  }
}

export async function deleteQuizQuestion(
  assignmentId: number,
  quizQuestionId: number
): Promise<void> {
  try {
    await Api.fetchDelete(
      `/api/assignments/${assignmentId}/quiz/questions/${quizQuestionId}`,
      DEFAULT_ERRORS
    )
  } catch (error) {
    throwApiResponseError(error)
  }
}

export async function startQuizAttempt(assignmentId: number): Promise<QuizAttempt> {
  try {
    const response = await Api.fetchPost(
      `/api/assignments/${assignmentId}/quiz/attempts/start`,
      {},
      DEFAULT_ERRORS
    )
    return await parseApiResponse(response, StartAttemptSchema)
  } catch (error) {
    throwApiResponseError(error)
  }
}

export async function saveQuizAnswer(
  attemptId: number,
  questionId: number,
  body: { selected_option_ids?: number[]; text_answer?: string }
): Promise<void> {
  try {
    await Api.fetchPut(
      `/api/quiz/attempts/${attemptId}/answers/${questionId}`,
      body,
      DEFAULT_ERRORS
    )
  } catch (error) {
    throwApiResponseError(error)
  }
}

export async function submitQuizAttempt(attemptId: number): Promise<QuizAttemptResult> {
  try {
    const response = await Api.fetchPost(
      `/api/quiz/attempts/${attemptId}/submit`,
      {},
      DEFAULT_ERRORS
    )
    return await parseApiResponse(response, AttemptResultSchema)
  } catch (error) {
    throwApiResponseError(error)
  }
}

export async function getQuizAttemptResult(attemptId: number): Promise<QuizAttemptResult> {
  try {
    const response = await Api.fetchGet(
      `/api/quiz/attempts/${attemptId}/result`,
      DEFAULT_ERRORS
    )
    return await parseApiResponse(response, AttemptResultSchema)
  } catch (error) {
    throwApiResponseError(error)
  }
}
