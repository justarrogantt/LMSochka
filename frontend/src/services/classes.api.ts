import { Api } from "./api"
import { throwApiResponseError } from "./response"
import type { Errors } from "../types/api.types"

export type ClassType = "open" | "closed"
export type ClassRole = "creator" | "teacher" | "student"

export type MyClassDto = {
  id: number
  name: string
  type: ClassType
  role: ClassRole
  students_count: number
  teachers_count: number
}

export type PublicClassDto = {
  id: number
  name: string
  created_at: string
  students_count: number
  is_member: boolean
}

export type ClassMemberDto = {
  user_id: number
  email: string
  first_name: string | null
  last_name: string | null
  role: ClassRole
}

export type ClassDetailDto = {
  id: number
  name: string
  type: ClassType
  creator_id: number
  join_code: string | null
  user_role: ClassRole
  students_count: number
  teachers_count: number
}

const MY_CLASSES_ERRORS: Errors = {
  default: "Не удалось загрузить мои курсы"
}

const PUBLIC_CLASSES_ERRORS: Errors = {
  default: "Не удалось загрузить каталог курсов"
}

const CREATE_CLASS_ERRORS: Errors = {
  default: "Не удалось создать курс",
  422: "Проверьте поля курса"
}

const JOIN_BY_CODE_ERRORS: Errors = {
  default: "Не удалось вступить по коду",
  404: "Курс по такому коду не найден",
  409: "Вы уже состоите в этом курсе"
}

const JOIN_OPEN_ERRORS: Errors = {
  default: "Не удалось вступить в курс",
  403: "Этот курс закрыт, нужен код приглашения"
}

const CLASS_DETAIL_ERRORS: Errors = {
  default: "Не удалось загрузить курс"
}

const CLASS_MEMBERS_ERRORS: Errors = {
  default: "Не удалось загрузить участников"
}

const UPDATE_CLASS_ERRORS: Errors = {
  default: "Не удалось обновить курс"
}

const DELETE_CLASS_ERRORS: Errors = {
  default: "Не удалось удалить курс"
}

export async function getMyClasses(): Promise<MyClassDto[]> {
  try {
    const response = await Api.fetchGet("/api/classes/my", MY_CLASSES_ERRORS)
    return (await response.json()) as MyClassDto[]
  } catch (error) {
    throwApiResponseError(error)
  }
}

export async function getPublicClasses(search?: string): Promise<PublicClassDto[]> {
  const params = new URLSearchParams()
  if (search && search.trim()) {
    params.set("search", search.trim())
  }
  const query = params.toString()

  try {
    const response = await Api.fetchGet(`/api/classes/public${query ? `?${query}` : ""}`, PUBLIC_CLASSES_ERRORS)
    return (await response.json()) as PublicClassDto[]
  } catch (error) {
    throwApiResponseError(error)
  }
}

export async function createClass(body: { name: string; type: ClassType }): Promise<ClassDetailDto> {
  try {
    const response = await Api.fetchPost("/api/classes", body, CREATE_CLASS_ERRORS)
    return (await response.json()) as ClassDetailDto
  } catch (error) {
    throwApiResponseError(error)
  }
}

export async function joinClassByCode(code: string): Promise<{ class_id: number; role: ClassRole }> {
  try {
    const response = await Api.fetchPost("/api/classes/join", { code }, JOIN_BY_CODE_ERRORS)
    return (await response.json()) as { class_id: number; role: ClassRole }
  } catch (error) {
    throwApiResponseError(error)
  }
}

export async function joinOpenClass(classId: number): Promise<{ class_id: number; role: ClassRole }> {
  try {
    const response = await Api.fetchPost(`/api/classes/${classId}/join-open`, {}, JOIN_OPEN_ERRORS)
    return (await response.json()) as { class_id: number; role: ClassRole }
  } catch (error) {
    throwApiResponseError(error)
  }
}

export async function getClassDetail(classId: number): Promise<ClassDetailDto> {
  try {
    const response = await Api.fetchGet(`/api/classes/${classId}`, CLASS_DETAIL_ERRORS)
    return (await response.json()) as ClassDetailDto
  } catch (error) {
    throwApiResponseError(error)
  }
}

export async function getClassMembers(classId: number): Promise<ClassMemberDto[]> {
  try {
    const response = await Api.fetchGet(`/api/classes/${classId}/members`, CLASS_MEMBERS_ERRORS)
    return (await response.json()) as ClassMemberDto[]
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
