import { Api } from "../../../../services/api"
import { throwApiResponseError } from "../../../../services/response"
import type { ClassRole } from "../../../../types/class.types"
import type { Errors } from "../../../../types/api.types"

export type ClassMemberDto = {
  user_id: number
  email: string
  first_name: string | null
  last_name: string | null
  role: ClassRole
}

export type ClassMembersDto = {
  items: ClassMemberDto[]
  students_count: number
  teachers_count: number
}

const CLASS_MEMBERS_ERRORS: Errors = {
  default: "Не удалось загрузить участников"
}

const UPDATE_CLASS_MEMBER_ROLE_ERRORS: Errors = {
  default: "Не удалось изменить роль участника"
}

const REMOVE_CLASS_MEMBER_ERRORS: Errors = {
  default: "Не удалось удалить участника из курса"
}

export async function getClassMembers(classId: number): Promise<ClassMembersDto> {
  try {
    const response = await Api.fetchGet(`/api/classes/${classId}/members`, CLASS_MEMBERS_ERRORS)
    return (await response.json()) as ClassMembersDto
  } catch (error) {
    throwApiResponseError(error)
  }
}

export async function updateClassMemberRole(
  classId: number,
  userId: number,
  role: Extract<ClassRole, "teacher" | "student">
): Promise<ClassMembersDto> {
  try {
    const response = await Api.fetchPatch(
      `/api/classes/${classId}/members/${userId}/role`,
      { role },
      UPDATE_CLASS_MEMBER_ROLE_ERRORS
    )
    return (await response.json()) as ClassMembersDto
  } catch (error) {
    throwApiResponseError(error)
  }
}

export async function removeClassMember(classId: number, userId: number): Promise<void> {
  try {
    await Api.fetchDelete(`/api/classes/${classId}/members/${userId}`, REMOVE_CLASS_MEMBER_ERRORS)
  } catch (error) {
    throwApiResponseError(error)
  }
}
