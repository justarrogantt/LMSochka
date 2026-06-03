import { z } from "zod"
import { Api } from "../../../../services/api"
import { parseApiResponse, throwApiResponseError } from "../../../../services/response"
import type { Errors } from "../../../../types/api.types"

// Типы курса, которые приходят с бэка.
const ClassTypeSchema = z.enum(["open", "closed"])
const ClassRoleSchema = z.enum(["creator", "teacher", "student"])

// Карточка курса в списке "Мои курсы" и в ответах create/join.
const MyClassSchema = z.object({
  id: z.number(),
  name: z.string(),
  type: ClassTypeSchema,
  creator_id: z.number(),
  role: ClassRoleSchema,
  joined_at: z.string(),
  students_count: z.number(),
  teachers_count: z.number(),
  join_code: z.string().nullable()
}).strip()

export type ClassType = z.infer<typeof ClassTypeSchema>
export type ClassRole = z.infer<typeof ClassRoleSchema>
export type MyClassDto = z.infer<typeof MyClassSchema>

const MY_CLASSES_ERRORS: Errors = {
  default: "Не удалось загрузить мои курсы"
}

const CREATE_CLASS_ERRORS: Errors = {
  default: "Не удалось создать курс",
  409: "У вас уже есть курс с таким названием",
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
    return await parseApiResponse(response, MyClassSchema.array())
  } catch (error) {
    throwApiResponseError(error)
  }
}

export async function createClass(body: { name: string; type: ClassType }): Promise<MyClassDto> {
  try {
    const response = await Api.fetchPost("/api/classes", body, CREATE_CLASS_ERRORS)
    return await parseApiResponse(response, MyClassSchema)
  } catch (error) {
    throwApiResponseError(error)
  }
}

export async function joinClassByCode(code: string): Promise<MyClassDto> {
  try {
    const response = await Api.fetchPost("/api/classes/join", { code }, JOIN_BY_CODE_ERRORS)
    return await parseApiResponse(response, MyClassSchema)
  } catch (error) {
    throwApiResponseError(error)
  }
}
