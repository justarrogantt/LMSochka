// Мок-реализация журнала оценок (gradebook).
// Генерирует детерминированную матрицу студент × задание по id курса.
// Повторяет GradebookDTO с бэка; вместо запроса — задержка + локальные данные.

export type GradebookStatus = "draft" | "submitted" | "returned" | "graded"

export type GradebookAssignment = {
  id: number
  title: string
  max_grade: number
  due_at: string | null
}

export type GradebookStudent = {
  id: number
  email: string
  first_name: string | null
  last_name: string | null
  is_active: boolean
}

export type GradebookCell = {
  student_id: number
  assignment_id: number
  status: GradebookStatus
  value: number | null
  is_late: boolean
  submitted_at: string | null
}

export type GradebookDto = {
  assignments: GradebookAssignment[]
  students: GradebookStudent[]
  cells: GradebookCell[]
}

// Карточка текущего студента — для режима «вижу только свою строку»
export type GradebookViewer = {
  id: number
  email: string
  first_name: string | null
  last_name: string | null
}

const MOCK_DELAY_MS = 450

function mockDelay(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, MOCK_DELAY_MS))
}

// Простой детерминированный ГПСЧ, чтобы журнал одного курса был стабилен
function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state |= 0
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Выдуманные задания курса
const MOCK_ASSIGNMENTS: Array<{ title: string; max_grade: number; due_at: string | null }> = [
  { title: "Введение в предмет", max_grade: 100, due_at: "2026-04-10T18:00:00" },
  { title: "Практическая работа №1", max_grade: 100, due_at: "2026-04-24T18:00:00" },
  { title: "Контрольная работа", max_grade: 50, due_at: "2026-05-08T18:00:00" },
  { title: "Проект", max_grade: 100, due_at: "2026-05-22T18:00:00" },
  { title: "Итоговый тест", max_grade: 30, due_at: null }
]

// Выдуманные студенты курса
const MOCK_STUDENTS: Array<{ first_name: string | null; last_name: string | null; email: string }> = [
  { first_name: "Анна", last_name: "Смирнова", email: "a.smirnova@example.com" },
  { first_name: "Иван", last_name: "Петров", email: "i.petrov@example.com" },
  { first_name: "Мария", last_name: "Кузнецова", email: "m.kuznetsova@example.com" },
  { first_name: "Дмитрий", last_name: "Волков", email: "d.volkov@example.com" },
  { first_name: null, last_name: null, email: "e.popova@example.com" },
  { first_name: "Сергей", last_name: "Фёдоров", email: "s.fedorov@example.com" }
]

// Сгенерировать ячейки одного студента по всем заданиям
function buildCells(
  assignments: GradebookAssignment[],
  studentId: number,
  random: () => number
): GradebookCell[] {
  return assignments.map((assignment) => {
    const roll = random()
    let status: GradebookStatus
    if (roll < 0.15) status = "draft"
    else if (roll < 0.4) status = "submitted"
    else if (roll < 0.55) status = "returned"
    else status = "graded"

    const isLate = random() < 0.2
    const hasWork = status !== "draft"
    const value =
      status === "graded" ? Math.round((0.5 + random() * 0.5) * assignment.max_grade) : null

    return {
      student_id: studentId,
      assignment_id: assignment.id,
      status,
      value,
      is_late: hasWork && isLate,
      submitted_at: hasWork ? assignment.due_at : null
    }
  })
}

// Получить журнал оценок курса.
// Если передан viewer (студент без права на полный журнал) — вернётся только его строка.
export async function getGradebook(classId: number, viewer: GradebookViewer | null = null): Promise<GradebookDto> {
  await mockDelay()

  const random = mulberry32(classId * 7919 + 13)

  const assignments: GradebookAssignment[] = MOCK_ASSIGNMENTS.map((item, index) => ({
    id: classId * 100 + index + 1,
    title: item.title,
    max_grade: item.max_grade,
    due_at: item.due_at
  }))

  // Режим студента — единственная строка с его данными
  if (viewer) {
    const student: GradebookStudent = {
      id: viewer.id,
      email: viewer.email,
      first_name: viewer.first_name,
      last_name: viewer.last_name,
      is_active: true
    }
    return {
      assignments,
      students: [student],
      cells: buildCells(assignments, viewer.id, mulberry32(viewer.id * 31 + classId))
    }
  }

  // Режим преподавателя — весь список студентов
  const students: GradebookStudent[] = MOCK_STUDENTS.map((item, index) => ({
    id: classId * 1000 + index + 1,
    email: item.email,
    first_name: item.first_name,
    last_name: item.last_name,
    is_active: true
  }))

  const cells = students.flatMap((student) => buildCells(assignments, student.id, random))

  return { assignments, students, cells }
}
