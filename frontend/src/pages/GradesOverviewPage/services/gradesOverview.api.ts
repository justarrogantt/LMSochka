// Мок-реализация сводки оценок студента по всем курсам.
// Отдельного эндпоинта на бэке для этого пока нет — это чисто фронтовый мок,
// имитирующий агрегат по курсам. Данные детерминированы по составу курсов.

export type CourseGradesSummary = {
  class_id: number
  class_name: string
  // Средний балл в процентах от максимума; null — если ещё нет оценок
  average_percent: number | null
  graded_count: number
  assignments_count: number
  // Сколько работ ждут проверки или ещё не сданы
  pending_count: number
}

export type GradesOverviewDto = {
  courses: CourseGradesSummary[]
}

const MOCK_DELAY_MS = 450

function mockDelay(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, MOCK_DELAY_MS))
}

// Выдуманные курсы студента со сводкой оценок
const MOCK_COURSES: CourseGradesSummary[] = [
  { class_id: 1, class_name: "Математический анализ", average_percent: 88, graded_count: 4, assignments_count: 5, pending_count: 1 },
  { class_id: 2, class_name: "Программирование на Python", average_percent: 95, graded_count: 6, assignments_count: 6, pending_count: 0 },
  { class_id: 3, class_name: "История искусств", average_percent: 72, graded_count: 2, assignments_count: 4, pending_count: 2 },
  { class_id: 4, class_name: "Английский язык", average_percent: null, graded_count: 0, assignments_count: 3, pending_count: 3 }
]

// Получить сводку оценок по всем курсам студента
export async function getGradesOverview(): Promise<GradesOverviewDto> {
  await mockDelay()
  return { courses: MOCK_COURSES.map((course) => ({ ...course })) }
}
