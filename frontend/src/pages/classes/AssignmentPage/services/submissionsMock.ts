// ── Мок-бэкенд решений и оценок ──────────────────────────────────────
// Имитирует таблицы submissions + grades. Данные живут только в памяти
// вкладки: при перезагрузке страницы хранилище пересоздаётся с нуля.
// Используется из submissions.api.ts и grades.api.ts.
import type {
  SaveSubmissionBody,
  SubmissionDto,
  SubmissionGrade,
  SubmissionStatus,
  SubmissionStudent
} from "./submissions.api"

// Искусственная задержка — чтобы лоадеры и состояния отправки были заметны
const MOCK_DELAY_MS = 450

export function mockDelay(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, MOCK_DELAY_MS))
}

// Счётчик id для новых записей
let nextSubmissionId = 9000

// Текущий момент в формате naive UTC (как отдаёт бэк; formatDateTime сам добавит Z)
function nowIso(): string {
  return new Date().toISOString().slice(0, 19)
}

// Глубокая копия — имитируем сетевую границу, чтобы наружу не утекали ссылки на стор
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

// Выдуманные студенты для списка решений у преподавателя
const MOCK_STUDENTS: SubmissionStudent[] = [
  { id: 501, email: "a.smirnova@example.com", first_name: "Анна", last_name: "Смирнова" },
  { id: 502, email: "i.petrov@example.com", first_name: "Иван", last_name: "Петров" },
  { id: 503, email: "m.kuznetsova@example.com", first_name: "Мария", last_name: "Кузнецова" },
  { id: 504, email: "d.volkov@example.com", first_name: "Дмитрий", last_name: "Волков" },
  { id: 505, email: "e.popova@example.com", first_name: null, last_name: null },
  { id: 506, email: "s.fedorov@example.com", first_name: "Сергей", last_name: "Фёдоров" }
]

// Преподаватель — для поля graded_by у заранее оценённых решений
const MOCK_TEACHER: SubmissionStudent = {
  id: 1,
  email: "teacher@example.com",
  first_name: "Ольга",
  last_name: "Преподавателева"
}

// Решения студентов по id задания (то, что видит преподаватель)
const rosterByAssignment = new Map<number, SubmissionDto[]>()

// Моё решение по id задания (то, что видит студент)
const myByAssignment = new Map<number, SubmissionDto | null>()

// Кто выставил оценку — отдельно, чтобы собрать GradeDto.graded_by
const gradedByBySubmission = new Map<number, SubmissionStudent>()

// Заполнить список решений студентов для задания при первом обращении.
// Статусы намеренно разные, чтобы преподаватель видел все состояния.
function seedRoster(assignmentId: number): SubmissionDto[] {
  const plan: Array<{ status: SubmissionStatus; value?: number; comment?: string; late?: boolean }> = [
    { status: "submitted" },
    { status: "graded", value: 92, comment: "Отличная работа, всё по делу." },
    { status: "returned", comment: "Не хватает вывода — дополни и пришли снова." },
    { status: "graded", value: 76, late: true },
    { status: "submitted", late: true },
    { status: "submitted" }
  ]

  const baseTime = Date.parse("2026-05-20T10:00:00Z")

  const items: SubmissionDto[] = MOCK_STUDENTS.map((student, index) => {
    const cfg = plan[index % plan.length]
    const id = nextSubmissionId++
    const createdAt = new Date(baseTime + index * 3_600_000).toISOString().slice(0, 19)

    const grade: SubmissionGrade | null =
      cfg.status === "graded" && cfg.value !== undefined
        ? { value: cfg.value, comment: cfg.comment ?? null, graded_at: createdAt, updated_at: null }
        : null

    if (grade) gradedByBySubmission.set(id, MOCK_TEACHER)

    return {
      id,
      assignment_id: assignmentId,
      student,
      answer_text: `Решение студента ${student.first_name ?? student.email}. Здесь развёрнутый ответ по условию задания с пояснениями к каждому пункту.`,
      attachment_url: index % 2 === 0 ? "https://example.com/files/work.pdf" : null,
      status: cfg.status,
      return_comment: cfg.status === "returned" ? cfg.comment ?? null : null,
      submitted_at: createdAt,
      is_late: cfg.late ?? false,
      grade,
      created_at: createdAt,
      updated_at: null
    }
  })

  rosterByAssignment.set(assignmentId, items)
  return items
}

// Список решений студентов по заданию (копии)
export function listRoster(assignmentId: number): SubmissionDto[] {
  if (!rosterByAssignment.has(assignmentId)) seedRoster(assignmentId)
  return clone(rosterByAssignment.get(assignmentId) ?? [])
}

// Найти живую ссылку на решение по id во всех хранилищах
function locate(submissionId: number): SubmissionDto | undefined {
  for (const list of rosterByAssignment.values()) {
    const found = list.find((item) => item.id === submissionId)
    if (found) return found
  }

  for (const mine of myByAssignment.values()) {
    if (mine && mine.id === submissionId) return mine
  }

  return undefined
}

// Копия решения по id (наружу)
export function locateSubmission(submissionId: number): SubmissionDto | undefined {
  const found = locate(submissionId)
  return found ? clone(found) : undefined
}

// Кто выставил оценку этому решению
export function getGradedBy(submissionId: number): SubmissionStudent {
  return gradedByBySubmission.get(submissionId) ?? MOCK_TEACHER
}

// ── Действия студента над своим решением ─────────────────────────────

export function readMySubmission(assignmentId: number): SubmissionDto | null {
  const mine = myByAssignment.get(assignmentId)
  return mine ? clone(mine) : null
}

// Сохранить черновик. Если решение было возвращено — возвращаем его обратно в черновик
export function writeMyDraft(
  assignmentId: number,
  student: SubmissionStudent,
  body: SaveSubmissionBody
): SubmissionDto {
  const existing = myByAssignment.get(assignmentId) ?? null
  const now = nowIso()

  const next: SubmissionDto = {
    id: existing?.id ?? nextSubmissionId++,
    assignment_id: assignmentId,
    student,
    answer_text: body.answer_text,
    attachment_url: body.attachment_url,
    status: "draft",
    return_comment: existing?.return_comment ?? null,
    submitted_at: null,
    is_late: false,
    grade: null,
    created_at: existing?.created_at ?? now,
    updated_at: existing ? now : null
  }

  myByAssignment.set(assignmentId, next)
  return clone(next)
}

// Отправить решение на проверку. is_late считаем по дедлайну задания
export function submitMySubmission(
  assignmentId: number,
  student: SubmissionStudent,
  body: SaveSubmissionBody,
  dueAt: string | null
): SubmissionDto {
  const existing = myByAssignment.get(assignmentId) ?? null
  const now = nowIso()
  const isLate = dueAt ? Date.now() > Date.parse(/z$/i.test(dueAt) ? dueAt : `${dueAt}Z`) : false

  const next: SubmissionDto = {
    id: existing?.id ?? nextSubmissionId++,
    assignment_id: assignmentId,
    student,
    answer_text: body.answer_text,
    attachment_url: body.attachment_url,
    status: "submitted",
    return_comment: null,
    submitted_at: now,
    is_late: isLate,
    grade: null,
    created_at: existing?.created_at ?? now,
    updated_at: now
  }

  myByAssignment.set(assignmentId, next)
  return clone(next)
}

// ── Действия преподавателя ───────────────────────────────────────────

// Выставить/обновить оценку. Решение переходит в статус «оценено»
export function applyGrade(
  submissionId: number,
  value: number,
  comment: string | null,
  gradedBy: SubmissionStudent
): SubmissionDto {
  const submission = locate(submissionId)
  if (!submission) throw new Error("Решение не найдено")

  // Бэк разрешает оценивать только отправленное или уже оценённое решение
  if (submission.status !== "submitted" && submission.status !== "graded") {
    throw new Error("Оценивать можно только отправленное или оценённое решение")
  }

  const isNew = !submission.grade
  submission.grade = {
    value,
    comment,
    graded_at: isNew ? nowIso() : submission.grade!.graded_at,
    updated_at: isNew ? null : nowIso()
  }
  submission.status = "graded"
  submission.return_comment = null
  gradedByBySubmission.set(submissionId, gradedBy)

  return clone(submission)
}

// Снять оценку. Решение возвращается в очередь на проверку
export function clearGrade(submissionId: number): SubmissionDto {
  const submission = locate(submissionId)
  if (!submission) throw new Error("Решение не найдено")

  submission.grade = null
  submission.status = "submitted"
  gradedByBySubmission.delete(submissionId)

  return clone(submission)
}

// Вернуть решение на доработку с комментарием
export function returnSubmissionInStore(submissionId: number, comment: string | null): SubmissionDto {
  const submission = locate(submissionId)
  if (!submission) throw new Error("Решение не найдено")

  // Бэк разрешает возврат только отправленного или оценённого решения
  if (submission.status !== "submitted" && submission.status !== "graded") {
    throw new Error("Вернуть можно только отправленное или оценённое решение")
  }

  submission.status = "returned"
  submission.return_comment = comment
  submission.grade = null
  gradedByBySubmission.delete(submissionId)

  return clone(submission)
}
