import { Api } from "../../../services/api"
import { throwApiResponseError } from "../../../services/response"
import type { ClassType, ClassRole } from "../../../types/class.types"
export type { ClassType, ClassRole }
import type { Errors } from "../../../types/api.types"

export type ClassPermissions = {
  can_create_assignment: boolean
  can_create_announcement: boolean
  can_grade_submissions: boolean
  can_submit_solution: boolean
  can_view_gradebook: boolean
  can_view_own_grades: boolean
  can_edit_class: boolean
  can_manage_members: boolean
  can_delete_class: boolean
}

export type ClassDetailDto = {
  id: number
  name: string
  type: ClassType
  creator_id: number
  join_code: string | null
  user_role: ClassRole
  permissions: ClassPermissions
  students_count: number
  teachers_count: number
}

const CLASS_DETAIL_ERRORS: Errors = {
  default: "Не удалось загрузить курс"
}

const UPDATE_CLASS_ERRORS: Errors = {
  default: "Не удалось обновить курс"
}

const DELETE_CLASS_ERRORS: Errors = {
  default: "Не удалось удалить курс"
}

const LEAVE_CLASS_ERRORS: Errors = {
  default: "Не удалось покинуть курс"
}

export async function getClassDetail(classId: number): Promise<ClassDetailDto> {
  try {
    const response = await Api.fetchGet(`/api/classes/${classId}`, CLASS_DETAIL_ERRORS)
    return (await response.json()) as ClassDetailDto
  } catch (error) {
    throwApiResponseError(error)
  }
}

export async function updateClass(classId: number, body: { name?: string; type?: ClassType }): Promise<ClassDetailDto> {
  try {
    const response = await Api.fetchPatch(`/api/classes/${classId}`, body, UPDATE_CLASS_ERRORS)
    return (await response.json()) as ClassDetailDto
  } catch (error) {
    throwApiResponseError(error)
  }
}

export async function deleteClass(classId: number): Promise<void> {
  try {
    await Api.fetchDelete(`/api/classes/${classId}`, DELETE_CLASS_ERRORS)
  } catch (error) {
    throwApiResponseError(error)
  }
}

export async function leaveClass(classId: number): Promise<void> {
  try {
    await Api.fetchPost(`/api/classes/${classId}/leave`, {}, LEAVE_CLASS_ERRORS)
  } catch (error) {
    throwApiResponseError(error)
  }
}
