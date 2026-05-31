import { z } from "zod"
import { Api } from "../../../../services/api"
import { parseApiResponse, throwApiResponseError } from "../../../../services/response"
import type { Errors, PageDto } from "../../../../types/api.types"

// Обёртка пагинации, которую возвращает бэк для каталога.
function createPageSchema<T extends z.ZodType>(itemSchema: T) {
  return z.object({
    items: z.array(itemSchema),
    total: z.number(),
    page: z.number(),
    limit: z.number()
  }).strip()
}

// Карточка открытого курса в публичном каталоге.
const PublicClassSchema = z.object({
  id: z.number(),
  name: z.string(),
  creator_id: z.number(),
  created_at: z.string(),
  students_count: z.number(),
  is_member: z.boolean()
}).strip()

// Карточка моего курса, которую бэк возвращает после вступления.
const MyClassSchema = z.object({
  id: z.number(),
  name: z.string(),
  type: z.enum(["open", "closed"]),
  creator_id: z.number(),
  role: z.enum(["creator", "teacher", "student"]),
  joined_at: z.string(),
  students_count: z.number(),
  teachers_count: z.number(),
  join_code: z.string().nullable()
}).strip()

export type PublicClassDto = z.infer<typeof PublicClassSchema>
export type MyClassDto = z.infer<typeof MyClassSchema>

const PUBLIC_CLASSES_ERRORS: Errors = {
  default: "Не удалось загрузить каталог курсов"
}

const JOIN_OPEN_ERRORS: Errors = {
  default: "Не удалось вступить в курс",
  403: "Этот курс закрыт, нужен код приглашения"
}

// Пагинированный ответ каталога открытых курсов.
const PublicClassesPageSchema = createPageSchema(PublicClassSchema)

export async function getPublicClasses(
  search?: string,
  page: number = 1,
  limit: number = 20
): Promise<PageDto<PublicClassDto>> {
  const params = new URLSearchParams()
  params.set("page", String(page))
  params.set("limit", String(limit))

  if (search && search.trim()) {
    params.set("search", search.trim())
  }

  try {
    const response = await Api.fetchGet(`/api/classes/public?${params.toString()}`, PUBLIC_CLASSES_ERRORS)
    return await parseApiResponse(response, PublicClassesPageSchema)
  } catch (error) {
    throwApiResponseError(error)
  }
}

export async function joinOpenClass(classId: number): Promise<MyClassDto> {
  try {
    const response = await Api.fetchPost(`/api/classes/${classId}/join-open`, {}, JOIN_OPEN_ERRORS)
    return await parseApiResponse(response, MyClassSchema)
  } catch (error) {
    throwApiResponseError(error)
  }
}
