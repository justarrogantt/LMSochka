import { Api } from "../../../../services/api"
import { throwApiResponseError } from "../../../../services/response"
import type { Errors, PageDto } from "../../../../types/api.types"

export type AssignmentDto = {
  id: number
  class_id: number
  author_id: number
  title: string
  description: string
  material_url: string | null
  due_at: string | null
  max_grade: number
  created_at: string
  updated_at: string | null
}

const LIST_ASSIGNMENTS_ERRORS: Errors = {
  default: "Не удалось загрузить задания"
}

const GET_ASSIGNMENT_ERRORS: Errors = {
  default: "Не удалось загрузить задание",
  404: "Задание не найдено"
}

const CREATE_ASSIGNMENT_ERRORS: Errors = {
  default: "Не удалось создать задание",
  403: "Недостаточно прав для создания задания",
  404: "Курс не найден",
  422: "Проверьте поля задания"
}

const UPDATE_ASSIGNMENT_ERRORS: Errors = {
  default: "Не удалось обновить задание",
  403: "Недостаточно прав для редактирования задания",
  404: "Задание не найдено",
  422: "Проверьте поля задания"
}

const DELETE_ASSIGNMENT_ERRORS: Errors = {
  default: "Не удалось удалить задание",
  403: "Недостаточно прав для удаления задания",
  404: "Задание не найдено"
}

export async function listAssignments(classId: number, page: number = 1, limit: number = 20): Promise<PageDto<AssignmentDto>> {
  try {
    const response = await Api.fetchGet(
      `/api/classes/${classId}/assignments?page=${page}&limit=${limit}`,
      LIST_ASSIGNMENTS_ERRORS
    )
    return (await response.json()) as PageDto<AssignmentDto>
  } catch (error) {
    throwApiResponseError(error)
  }
}

export async function getAssignment(classId: number, assignmentId: number): Promise<AssignmentDto> {
  try {
    const response = await Api.fetchGet(
      `/api/classes/${classId}/assignments/${assignmentId}`,
      GET_ASSIGNMENT_ERRORS
    )
    return (await response.json()) as AssignmentDto
  } catch (error) {
    throwApiResponseError(error)
  }
}

export async function createAssignment(
  classId: number,
  body: {
    title: string
    description?: string
    material_url?: string | null
    due_at?: string | null
    max_grade: number
  }
): Promise<AssignmentDto> {
  try {
    const response = await Api.fetchPost(
      `/api/classes/${classId}/assignments`,
      body,
      CREATE_ASSIGNMENT_ERRORS
    )
    return (await response.json()) as AssignmentDto
  } catch (error) {
    throwApiResponseError(error)
  }
}

export async function updateAssignment(
  classId: number,
  assignmentId: number,
  body: {
    title?: string
    description?: string
    material_url?: string | null
    due_at?: string | null
    max_grade?: number
  }
): Promise<AssignmentDto> {
  try {
    const response = await Api.fetchPatch(
      `/api/classes/${classId}/assignments/${assignmentId}`,
      body,
      UPDATE_ASSIGNMENT_ERRORS
    )
    return (await response.json()) as AssignmentDto
  } catch (error) {
    throwApiResponseError(error)
  }
}

export async function deleteAssignment(classId: number, assignmentId: number): Promise<void> {
  try {
    await Api.fetchDelete(
      `/api/classes/${classId}/assignments/${assignmentId}`,
      DELETE_ASSIGNMENT_ERRORS
    )
  } catch (error) {
    throwApiResponseError(error)
  }
}
