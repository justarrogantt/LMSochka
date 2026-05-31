import { z } from "zod"
import { Api } from "../../../services/api"
import { parseApiResponse, throwApiResponseError } from "../../../services/response"
import type { Errors } from "../../../types/api.types"

// Типы курса, которые нужны layout-у и вкладкам курса.
const ClassTypeSchema = z.enum(["open", "closed"])
const ClassRoleSchema = z.enum(["creator", "teacher", "student"])

// Матрица прав текущего пользователя в курсе.
const ClassPermissionsSchema = z.object({
  can_create_assignment: z.boolean(),
  can_create_announcement: z.boolean(),
  can_grade_submissions: z.boolean(),
  can_submit_solution: z.boolean(),
  can_view_gradebook: z.boolean(),
  can_view_own_grades: z.boolean(),
  can_edit_class: z.boolean(),
  can_manage_members: z.boolean(),
  can_delete_class: z.boolean()
}).strip()

// Подробности курса для шапки и вложенных страниц.
const ClassDetailSchema = z.object({
  id: z.number(),
  name: z.string(),
  type: ClassTypeSchema,
  join_code: z.string().nullable(),
  creator_id: z.number(),
  created_at: z.string(),
  user_role: ClassRoleSchema,
  permissions: ClassPermissionsSchema,
  students_count: z.number(),
  teachers_count: z.number()
}).strip()

export type ClassType = z.infer<typeof ClassTypeSchema>
export type ClassRole = z.infer<typeof ClassRoleSchema>
export type ClassPermissions = z.infer<typeof ClassPermissionsSchema>
export type ClassDetailDto = z.infer<typeof ClassDetailSchema>

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

const TRANSFER_OWNERSHIP_ERRORS: Errors = {
  default: "Не удалось передать права владельца",
  403: "Передать права может только владелец курса",
  404: "Участник не найден"
}

export async function getClassDetail(classId: number): Promise<ClassDetailDto> {
  try {
    const response = await Api.fetchGet(`/api/classes/${classId}`, CLASS_DETAIL_ERRORS)
    return await parseApiResponse(response, ClassDetailSchema)
  } catch (error) {
    throwApiResponseError(error)
  }
}

export async function updateClass(classId: number, body: { name?: string; type?: ClassType }): Promise<ClassDetailDto> {
  try {
    const response = await Api.fetchPatch(`/api/classes/${classId}`, body, UPDATE_CLASS_ERRORS)
    return await parseApiResponse(response, ClassDetailSchema)
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

// Передать роль создателя другому участнику. Только текущий создатель.
// Бэк возвращает свежий ClassDetailDto уже от лица бывшего владельца (теперь teacher).
export async function transferOwnership(classId: number, newOwnerId: number): Promise<ClassDetailDto> {
  try {
    const response = await Api.fetchPost(
      `/api/classes/${classId}/transfer-ownership`,
      { new_owner_id: newOwnerId },
      TRANSFER_OWNERSHIP_ERRORS
    )
    return await parseApiResponse(response, ClassDetailSchema)
  } catch (error) {
    throwApiResponseError(error)
  }
}
