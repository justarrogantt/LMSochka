import { z } from "zod"
import { Api } from "../../../services/api"
import { parseApiResponse, throwApiResponseError } from "../../../services/response"
import type { Errors } from "../../../types/api.types"

export type CourseGradesSummary = {
  class_id: number
  class_name: string
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

// Курс текущего пользователя из /classes/my.
const MyClassSchema = z.object({
  id: z.number(),
  name: z.string(),
  role: z.enum(["creator", "teacher", "student"])
}).strip()

// Задание со сводкой решения текущего студента.
const StudentAssignmentSchema = z.object({
  id: z.number(),
  max_grade: z.number(),
  my_submission: z.object({
    status: z.enum(["draft", "submitted", "returned", "graded"]),
    grade: z.number().nullable()
  }).strip().nullable()
}).strip()

// Пагинированный ответ списка заданий.
const StudentAssignmentsPageSchema = z.object({
  items: z.array(StudentAssignmentSchema),
  total: z.number(),
  page: z.number(),
  limit: z.number()
}).strip()

// Журнал оценок для преподавателя/создателя.
const GradebookSchema = z.object({
  assignments: z.array(z.object({
    id: z.number(),
    max_grade: z.number()
  }).strip()),
  students: z.array(z.object({
    id: z.number()
  }).strip()),
  cells: z.array(z.object({
    assignment_id: z.number(),
    status: z.enum(["draft", "submitted", "returned", "graded"]),
    value: z.number().nullable()
  }).strip())
}).strip()

type MyClassDto = z.infer<typeof MyClassSchema>
type StudentAssignmentDto = z.infer<typeof StudentAssignmentSchema>
type GradebookDto = z.infer<typeof GradebookSchema>

const MY_CLASSES_ERRORS: Errors = {
  default: "Не удалось загрузить курсы"
}

const ASSIGNMENTS_ERRORS: Errors = {
  default: "Не удалось загрузить задания курса"
}

const GRADEBOOK_ERRORS: Errors = {
  default: "Не удалось загрузить журнал оценок курса"
}

function averagePercent(items: Array<{ value: number; max: number }>): number | null {
  if (items.length === 0) return null

  const sum = items.reduce((acc, item) => acc + (item.value / item.max) * 100, 0)
  return Math.round(sum / items.length)
}

function buildStudentSummary(course: MyClassDto, assignments: StudentAssignmentDto[]): CourseGradesSummary {
  const graded = assignments
    .filter((assignment) => assignment.my_submission?.status === "graded" && assignment.my_submission.grade !== null)
    .map((assignment) => ({
      value: assignment.my_submission!.grade!,
      max: assignment.max_grade
    }))

  return {
    class_id: course.id,
    class_name: course.name,
    average_percent: averagePercent(graded),
    graded_count: graded.length,
    assignments_count: assignments.length,
    pending_count: assignments.length - graded.length
  }
}

function buildTeacherSummary(course: MyClassDto, gradebook: GradebookDto): CourseGradesSummary {
  const assignmentsById = new Map(gradebook.assignments.map((assignment) => [assignment.id, assignment]))
  const graded = gradebook.cells
    .filter((cell) => cell.status === "graded" && cell.value !== null)
    .map((cell) => {
      const assignment = assignmentsById.get(cell.assignment_id)
      return assignment ? { value: cell.value!, max: assignment.max_grade } : null
    })
    .filter((item): item is { value: number; max: number } => item !== null)
  const totalCells = gradebook.assignments.length * gradebook.students.length

  return {
    class_id: course.id,
    class_name: course.name,
    average_percent: averagePercent(graded),
    graded_count: graded.length,
    assignments_count: totalCells,
    pending_count: Math.max(totalCells - graded.length, 0)
  }
}

async function getMyClasses(): Promise<MyClassDto[]> {
  const response = await Api.fetchGet("/api/classes/my", MY_CLASSES_ERRORS)
  return await parseApiResponse(response, MyClassSchema.array())
}

async function getClassAssignments(classId: number): Promise<StudentAssignmentDto[]> {
  const response = await Api.fetchGet(`/api/classes/${classId}/assignments?page=1&limit=100`, ASSIGNMENTS_ERRORS)
  const page = await parseApiResponse(response, StudentAssignmentsPageSchema)
  return page.items
}

async function getClassGradebook(classId: number): Promise<GradebookDto> {
  const response = await Api.fetchGet(`/api/classes/${classId}/gradebook`, GRADEBOOK_ERRORS)
  return await parseApiResponse(response, GradebookSchema)
}

export async function getGradesOverview(): Promise<GradesOverviewDto> {
  try {
    const courses = await getMyClasses()
    const summaries = await Promise.all(
      courses.map(async (course) => {
        if (course.role === "student") {
          const assignments = await getClassAssignments(course.id)
          return buildStudentSummary(course, assignments)
        }

        const gradebook = await getClassGradebook(course.id)
        return buildTeacherSummary(course, gradebook)
      })
    )

    return { courses: summaries }
  } catch (error) {
    throwApiResponseError(error)
  }
}
