import { z } from "zod"
import { Api } from "../../../../services/api"
import { parseApiResponse, throwApiResponseError } from "../../../../services/response"
import type { Errors } from "../../../../types/api.types"

// Роли участников курса.
const ClassRoleSchema = z.enum(["creator", "teacher", "student"])

// Один участник курса в списке участников.
const ClassMemberSchema = z.object({
  user_id: z.number(),
  email: z.string().email(),
  first_name: z.string().nullable(),
  last_name: z.string().nullable(),
  role: ClassRoleSchema,
  joined_at: z.string(),
  is_active: z.boolean()
}).strip()

// Полный ответ секции участников: список и счётчики.
const ClassMembersSchema = z.object({
  items: z.array(ClassMemberSchema),
  students_count: z.number(),
  teachers_count: z.number()
}).strip()

export type ClassRole = z.infer<typeof ClassRoleSchema>
export type ClassMemberDto = z.infer<typeof ClassMemberSchema>
export type ClassMembersDto = z.infer<typeof ClassMembersSchema>

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
    return await parseApiResponse(response, ClassMembersSchema)
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
    return await parseApiResponse(response, ClassMembersSchema)
  } catch (error) {
    throwApiResponseError(error)
  }
}

export async function removeClassMember(classId: number, userId: number): Promise<ClassMembersDto> {
  try {
    const response = await Api.fetchDelete(`/api/classes/${classId}/members/${userId}`, REMOVE_CLASS_MEMBER_ERRORS)
    return await parseApiResponse(response, ClassMembersSchema)
  } catch (error) {
    throwApiResponseError(error)
  }
}
