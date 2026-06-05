import { z } from "zod"
import { Api } from "../../../../services/api"
import { parseApiResponse, throwApiResponseError } from "../../../../services/response"
import type { Errors } from "../../../../types/api.types"

// Режим оценивания группового задания.
export const GradingModeSchema = z.enum(["even", "individual"])
export type GradingMode = z.infer<typeof GradingModeSchema>

// Статус командного решения (включая «передано на перераспределение»).
const GroupSubmissionStatusSchema = z.enum([
  "draft",
  "submitted",
  "returned",
  "graded",
  "pending_redistribution"
])

// Член команды.
export const GroupMemberSchema = z.object({
  user_id: z.number(),
  email: z.string().email(),
  first_name: z.string().nullable(),
  last_name: z.string().nullable(),
  is_active: z.boolean()
}).strip()

// Команда задания.
export const AssignmentGroupSchema = z.object({
  id: z.number(),
  title: z.string(),
  members: z.array(GroupMemberSchema),
  submission_status: GroupSubmissionStatusSchema.nullable()
}).strip()

// Полный блок «Команды»: режим, группы, нераспределённые студенты.
export const AssignmentGroupsSchema = z.object({
  grading_mode: GradingModeSchema,
  // общий лимит участников на команду (null — без ограничения)
  max_team_size: z.number().nullable().default(null),
  groups: z.array(AssignmentGroupSchema),
  unassigned_students: z.array(GroupMemberSchema)
}).strip()

export type GroupMemberDto = z.infer<typeof GroupMemberSchema>
export type AssignmentGroupDto = z.infer<typeof AssignmentGroupSchema>
export type AssignmentGroupsDto = z.infer<typeof AssignmentGroupsSchema>

const GROUPS_ERRORS: Errors = {
  default: "Не удалось загрузить команды",
  404: "Задание не найдено"
}

const MUTATE_GROUPS_ERRORS: Errors = {
  default: "Не удалось обновить команды",
  403: "Недостаточно прав для управления командами",
  404: "Группа не найдена",
  409: "У команды уже есть решение — состав менять нельзя",
  422: "Проверьте данные команды"
}

const base = (classId: number, assignmentId: number) =>
  `/api/classes/${classId}/assignments/${assignmentId}/groups`

export async function getGroups(classId: number, assignmentId: number): Promise<AssignmentGroupsDto> {
  try {
    const response = await Api.fetchGet(base(classId, assignmentId), GROUPS_ERRORS)
    return await parseApiResponse(response, AssignmentGroupsSchema)
  } catch (error) {
    throwApiResponseError(error)
  }
}

export async function createGroup(
  classId: number,
  assignmentId: number,
  title?: string
): Promise<AssignmentGroupsDto> {
  try {
    const response = await Api.fetchPost(base(classId, assignmentId), { title: title ?? null }, MUTATE_GROUPS_ERRORS)
    return await parseApiResponse(response, AssignmentGroupsSchema)
  } catch (error) {
    throwApiResponseError(error)
  }
}

export async function renameGroup(
  classId: number,
  assignmentId: number,
  groupId: number,
  title: string
): Promise<AssignmentGroupsDto> {
  try {
    const response = await Api.fetchPatch(`${base(classId, assignmentId)}/${groupId}`, { title }, MUTATE_GROUPS_ERRORS)
    return await parseApiResponse(response, AssignmentGroupsSchema)
  } catch (error) {
    throwApiResponseError(error)
  }
}

export async function deleteGroup(
  classId: number,
  assignmentId: number,
  groupId: number
): Promise<AssignmentGroupsDto> {
  try {
    const response = await Api.fetchDelete(`${base(classId, assignmentId)}/${groupId}`, MUTATE_GROUPS_ERRORS)
    return await parseApiResponse(response, AssignmentGroupsSchema)
  } catch (error) {
    throwApiResponseError(error)
  }
}

export async function addGroupMember(
  classId: number,
  assignmentId: number,
  groupId: number,
  userId: number
): Promise<AssignmentGroupsDto> {
  try {
    const response = await Api.fetchPost(
      `${base(classId, assignmentId)}/${groupId}/members`,
      { user_id: userId },
      MUTATE_GROUPS_ERRORS
    )
    return await parseApiResponse(response, AssignmentGroupsSchema)
  } catch (error) {
    throwApiResponseError(error)
  }
}

export async function removeGroupMember(
  classId: number,
  assignmentId: number,
  groupId: number,
  userId: number
): Promise<AssignmentGroupsDto> {
  try {
    const response = await Api.fetchDelete(
      `${base(classId, assignmentId)}/${groupId}/members/${userId}`,
      MUTATE_GROUPS_ERRORS
    )
    return await parseApiResponse(response, AssignmentGroupsSchema)
  } catch (error) {
    throwApiResponseError(error)
  }
}

export async function autoDistribute(
  classId: number,
  assignmentId: number,
  groupCount: number
): Promise<AssignmentGroupsDto> {
  try {
    const response = await Api.fetchPost(
      `${base(classId, assignmentId)}/auto`,
      { group_count: groupCount },
      MUTATE_GROUPS_ERRORS
    )
    return await parseApiResponse(response, AssignmentGroupsSchema)
  } catch (error) {
    throwApiResponseError(error)
  }
}
