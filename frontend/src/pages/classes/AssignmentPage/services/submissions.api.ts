// Мок-реализация работы с решениями (submissions).
// Вместо реальных запросов к бэку дёргает in-memory хранилище из submissionsMock.
// Сигнатуры и DTO повторяют бэкенд, чтобы позже легко заменить на настоящий Api.
import {
  listRoster,
  locateSubmission,
  mockDelay,
  readMySubmission,
  returnSubmissionInStore,
  submitMySubmission as submitInStore,
  writeMyDraft
} from "./submissionsMock"
import type { PageDto } from "../../../../types/api.types"

export type SubmissionStatus = "draft" | "submitted" | "returned" | "graded"

// Краткая карточка студента (повторяет UserBriefDTO с бэка)
export type SubmissionStudent = {
  id: number
  email: string
  first_name: string | null
  last_name: string | null
}

// Оценка, вложенная в решение
export type SubmissionGrade = {
  value: number
  comment: string | null
  graded_at: string
  updated_at: string | null
}

export type SubmissionDto = {
  id: number
  assignment_id: number
  student: SubmissionStudent
  answer_text: string
  attachment_url: string | null
  status: SubmissionStatus
  return_comment: string | null
  submitted_at: string | null
  is_late: boolean
  grade: SubmissionGrade | null
  created_at: string
  updated_at: string | null
}

// Тело сохранения/отправки решения
export type SaveSubmissionBody = {
  answer_text: string
  attachment_url: string | null
}

// Получить своё решение по заданию (студент). null — если ещё не начато
export async function getMySubmission(assignmentId: number): Promise<SubmissionDto | null> {
  await mockDelay()
  return readMySubmission(assignmentId)
}

// Сохранить черновик своего решения (студент)
export async function saveMySubmission(
  assignmentId: number,
  student: SubmissionStudent,
  body: SaveSubmissionBody
): Promise<SubmissionDto> {
  await mockDelay()
  return writeMyDraft(assignmentId, student, body)
}

// Отправить решение на проверку (студент). dueAt нужен для пометки «сдано с опозданием»
export async function submitMySubmission(
  assignmentId: number,
  student: SubmissionStudent,
  body: SaveSubmissionBody,
  dueAt: string | null
): Promise<SubmissionDto> {
  await mockDelay()
  return submitInStore(assignmentId, student, body, dueAt)
}

// Список решений по заданию с фильтром по статусу и пагинацией (преподаватель)
export async function listSubmissions(
  assignmentId: number,
  page: number = 1,
  limit: number = 8,
  status: SubmissionStatus | null = null
): Promise<PageDto<SubmissionDto>> {
  await mockDelay()
  const all = listRoster(assignmentId)
  const filtered = status ? all.filter((item) => item.status === status) : all
  const start = (page - 1) * limit
  return {
    items: filtered.slice(start, start + limit),
    total: filtered.length,
    page,
    limit
  }
}

// Получить одно решение по id
export async function getSubmission(submissionId: number): Promise<SubmissionDto> {
  await mockDelay()
  const found = locateSubmission(submissionId)
  if (!found) throw new Error("Решение не найдено")
  return found
}

// Вернуть решение на доработку с комментарием (преподаватель)
export async function returnSubmission(submissionId: number, comment: string | null): Promise<SubmissionDto> {
  await mockDelay()
  return returnSubmissionInStore(submissionId, comment)
}
