import { Api } from "../../../services/api"
import { throwApiResponseError } from "../../../services/response"
import type { ClassType, ClassRole } from "../../../types/class.types"
export type { ClassType, ClassRole }
import type { Errors } from "../../../types/api.types"

export type MyClassDto = {
  id: number
  name: string
  type: ClassType
  role: ClassRole
  students_count: number
  teachers_count: number
  join_code?: string | null
}

const MY_CLASSES_ERRORS: Errors = {
  default: "Не удалось загрузить мои курсы"
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

export async function getMyClasses(): Promise<MyClassDto[]> {
  try {
    const response = await Api.fetchGet("/api/classes/my", MY_CLASSES_ERRORS)
    return (await response.json()) as MyClassDto[]
  } catch (error) {
    throwApiResponseError(error)
  }
}

export async function createClass(body: { name: string; type: ClassType }): Promise<MyClassDto> {
  try {
    const response = await Api.fetchPost("/api/classes", body, CREATE_CLASS_ERRORS)
    return (await response.json()) as MyClassDto
  } catch (error) {
    throwApiResponseError(error)
  }
}

export async function joinClassByCode(code: string): Promise<MyClassDto> {
  try {
    const response = await Api.fetchPost("/api/classes/join", { code }, JOIN_BY_CODE_ERRORS)
    return (await response.json()) as MyClassDto
  } catch (error) {
    throwApiResponseError(error)
  }
}
