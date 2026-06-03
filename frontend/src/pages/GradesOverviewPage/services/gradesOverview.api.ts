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
  // Сколько отправленных работ сейчас ждут проверки.
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
  limit: z.number(),
  pending_review_total: z.number().default(0)
}).strip()

// Журнал оценок для преподавателя/создателя.
const GradebookStudentSummarySchema = z.object({
  average_percent: z.number().nullable(),
  graded_count: z.number(),
  submitted_count: z.number(),
  pending_review_count: z.number(),
  total_assignments: z.number()
}).strip()

const GradebookSchema = z.object({
  assignments: z.array(z.object({
    id: z.number(),
    max_grade: z.number()
  }).strip()),
  students: z.array(z.object({
    id: z.number(),
    summary: GradebookStudentSummarySchema.optional()
  }).strip()),
  cells: z.array(z.object({
    student_id: z.number(),
    assignment_id: z.number(),
    status: z.enum(["draft", "submitted", "returned", "graded"]),
    value: z.number().nullable(),
    percent: z.number().nullable().optional()
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

function averageReadyPercent(values: number[]): number | null {
  if (values.length === 0) return null

  const sum = values.reduce((acc, value) => acc + value, 0)
  return Math.round((sum / values.length) * 100) / 100
}

function percentOf(value: number | null, maxGrade: number): number | null {
  if (value === null || maxGrade <= 0) return null
  return Math.round((value / maxGrade) * 10000) / 100
}

function getTeacherCellPercent(
  cell: GradebookDto["cells"][number],
  assignmentsById: Map<number, GradebookDto["assignments"][number]>
): number | null {
  if (cell.percent !== undefined) return cell.percent

  const assignment = assignmentsById.get(cell.assignment_id)
  if (cell.status !== "graded" || !assignment) return null

  return percentOf(cell.value, assignment.max_grade)
}

function getTeacherStudentSummary(
  student: GradebookDto["students"][number],
  gradebook: GradebookDto,
  assignmentsById: Map<number, GradebookDto["assignments"][number]>
) {
  if (student.summary) return student.summary

  const cells = gradebook.cells.filter((cell) => cell.student_id === student.id)
  const gradedPercents = cells
    .filter((cell) => cell.status === "graded")
    .map((cell) => getTeacherCellPercent(cell, assignmentsById))
    .filter((value): value is number => value !== null)

  return {
    average_percent: averageReadyPercent(gradedPercents),
    graded_count: cells.filter((cell) => cell.status === "graded").length,
    submitted_count: cells.filter((cell) => cell.status === "submitted" || cell.status === "graded").length,
    pending_review_count: cells.filter((cell) => cell.status === "submitted").length,
    total_assignments: gradebook.assignments.length
  }
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
    pending_count: assignments.filter((assignment) => assignment.my_submission?.status === "submitted").length
  }
}

function buildTeacherSummary(course: MyClassDto, gradebook: GradebookDto): CourseGradesSummary {
  const assignmentsById = new Map(gradebook.assignments.map((assignment) => [assignment.id, assignment]))
  const studentSummaries = gradebook.students.map((student) =>
    getTeacherStudentSummary(student, gradebook, assignmentsById)
  )
  const gradedPercents = gradebook.cells
    .filter((cell) => cell.status === "graded")
    .map((cell) => getTeacherCellPercent(cell, assignmentsById))
    .filter((value): value is number => value !== null)
  const totalAssignments = studentSummaries.reduce((sum, summary) => sum + summary.total_assignments, 0)

  return {
    class_id: course.id,
    class_name: course.name,
    average_percent: averageReadyPercent(gradedPercents),
    graded_count: studentSummaries.reduce((sum, summary) => sum + summary.graded_count, 0),
    assignments_count: totalAssignments,
    pending_count: studentSummaries.reduce((sum, summary) => sum + summary.pending_review_count, 0)
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
