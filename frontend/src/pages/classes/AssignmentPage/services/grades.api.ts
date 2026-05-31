// Мок-реализация выставления оценок (grades).
// Оперирует тем же in-memory хранилищем, что и submissions.api.
import { applyGrade, clearGrade, getGradedBy, locateSubmission, mockDelay } from "./submissionsMock"
import type { SubmissionDto, SubmissionStudent } from "./submissions.api"

// Оценка как отдельная сущность (повторяет GradeDTO с бэка)
export type GradeDto = {
  submission_id: number
  value: number
  comment: string | null
  graded_by: SubmissionStudent
  graded_at: string
  updated_at: string | null
}

// Тело выставления оценки
export type UpsertGradeBody = {
  value: number
  comment: string | null
}

// Выставить/обновить оценку (преподаватель)
export async function upsertGrade(
  submissionId: number,
  gradedBy: SubmissionStudent,
  body: UpsertGradeBody
): Promise<GradeDto> {
  await mockDelay()
  const submission = applyGrade(submissionId, body.value, body.comment, gradedBy)
  const grade = submission.grade!

  return {
    submission_id: submission.id,
    value: grade.value,
    comment: grade.comment,
    graded_by: gradedBy,
    graded_at: grade.graded_at,
    updated_at: grade.updated_at
  }
}

// Снять оценку (преподаватель). Возвращаем обновлённое решение, как и бэк
export async function deleteGrade(submissionId: number): Promise<SubmissionDto> {
  await mockDelay()
  return clearGrade(submissionId)
}

// Получить оценку решения
export async function getGrade(submissionId: number): Promise<GradeDto> {
  await mockDelay()
  const submission = locateSubmission(submissionId)
  if (!submission || !submission.grade) throw new Error("Оценка не найдена")

  return {
    submission_id: submission.id,
    value: submission.grade.value,
    comment: submission.grade.comment,
    graded_by: getGradedBy(submissionId),
    graded_at: submission.grade.graded_at,
    updated_at: submission.grade.updated_at
  }
}
