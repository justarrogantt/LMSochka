import { z } from "zod"
import { Api } from "../../../services/api"
import { parseApiResponse, throwApiResponseError } from "../../../services/response"
import type { Errors } from "../../../types/api.types"

// Роль пользователя в курсе — приходит вместе со сводкой, по ней делим «учусь / преподаю».
export type ClassRole = "creator" | "teacher" | "student"

export type CourseGradesSummary = {
  class_id: number
  class_name: string
  role: ClassRole
  // Средний балл в процентах от максимума; null — если ещё нет оценок.
  average_percent: number | null
  graded_count: number
  assignments_count: number
  // Сколько работ ждут проверки или ещё не сданы.
  pending_count: number
}

export type GradesOverviewDto = {
  courses: CourseGradesSummary[]
}

const CourseGradesSummarySchema = z.object({
  class_id: z.number(),
  class_name: z.string(),
  role: z.enum(["creator", "teacher", "student"]),
  average_percent: z.number().nullable(),
  graded_count: z.number(),
  assignments_count: z.number(),
  pending_count: z.number()
}).strip()

const GradesOverviewSchema = z.object({
  courses: z.array(CourseGradesSummarySchema)
}).strip()

const GRADES_OVERVIEW_ERRORS: Errors = {
  default: "Не удалось загрузить сводку оценок"
}

// Сводка оценок по всем курсам пользователя — одним запросом, всю агрегацию делает бэк.
export async function getGradesOverview(): Promise<GradesOverviewDto> {
  try {
    const response = await Api.fetchGet("/api/me/grades", GRADES_OVERVIEW_ERRORS)
    return await parseApiResponse(response, GradesOverviewSchema)
  } catch (error) {
    throwApiResponseError(error)
  }
}
