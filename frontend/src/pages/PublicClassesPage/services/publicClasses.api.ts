import { Api } from "../../../services/api"
import { throwApiResponseError } from "../../../services/response"
import type { Errors } from "../../../types/api.types"

export type PublicClassDto = {
  id: number
  name: string
  created_at: string
  students_count: number
  is_member: boolean
}

const PUBLIC_CLASSES_ERRORS: Errors = {
  default: "Не удалось загрузить каталог курсов"
}

const JOIN_OPEN_ERRORS: Errors = {
  default: "Не удалось вступить в курс",
  403: "Этот курс закрыт, нужен код приглашения"
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

export async function joinOpenClass(classId: number): Promise<void> {
  try {
    await Api.fetchPost(`/api/classes/${classId}/join-open`, {}, JOIN_OPEN_ERRORS)
  } catch (error) {
    throwApiResponseError(error)
  }
}
