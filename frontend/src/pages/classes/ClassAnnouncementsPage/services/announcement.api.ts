import { z } from "zod"
import { Api } from "../../../../services/api"
import { deleteStoredFile, StoredFileSchema, type StoredFileDto, uploadStoredFile } from "../../../../services/files.api"
import { parseApiResponse, throwApiResponseError } from "../../../../services/response"
import type { Errors, PageDto } from "../../../../types/api.types"

// Обёртка пагинации для списка объявлений.
function createPageSchema<T extends z.ZodType>(itemSchema: T) {
  return z.object({
    items: z.array(itemSchema),
    total: z.number(),
    page: z.number(),
    limit: z.number()
  }).strip()
}

// Краткая карточка автора объявления.
const UserBriefSchema = z.object({
  id: z.number(),
  email: z.string().email(),
  first_name: z.string().nullable(),
  last_name: z.string().nullable()
}).strip()

// Объявление курса из API.
const AnnouncementSchema = z.object({
  id: z.number(),
  class_id: z.number(),
  title: z.string(),
  content: z.string(),
  material_file: StoredFileSchema.nullable().default(null),
  author: UserBriefSchema,
  created_at: z.string(),
  updated_at: z.string().nullable(),
  can_edit: z.boolean(),
  can_delete: z.boolean()
}).strip()

export type AnnouncementDto = z.infer<typeof AnnouncementSchema>

const GET_ANNOUNCEMENT_ERRORS: Errors = {
  default: "Не удалось загрузить объявление",
  404: "Объявление не найдено"
}

const LIST_ANNOUNCEMENTS_ERRORS: Errors = {
  default: "Не удалось загрузить объявления"
}

const CREATE_ANNOUNCEMENT_ERRORS: Errors = {
  default: "Не удалось создать объявление",
  network: "Не удалось связаться с сервером",
  403: "Недостаточно прав для создания объявления",
  404: "Курс не найден",
  422: "Проверьте поля объявления"
}

const UPDATE_ANNOUNCEMENT_ERRORS: Errors = {
  default: "Не удалось обновить объявление",
  403: "Недостаточно прав для редактирования объявления",
  404: "Объявление не найдено",
  422: "Проверьте поля объявления"
}

const DELETE_ANNOUNCEMENT_ERRORS: Errors = {
  default: "Не удалось удалить объявление",
  403: "Недостаточно прав для удаления объявления",
  404: "Объявление не найдено"
}

// Пагинированный ответ списка объявлений.
const AnnouncementsPageSchema = createPageSchema(AnnouncementSchema)

export async function getAnnouncement(classId: number, announcementId: number): Promise<AnnouncementDto> {
  try {
    const response = await Api.fetchGet(
      `/api/classes/${classId}/announcements/${announcementId}`,
      GET_ANNOUNCEMENT_ERRORS
    )
    return await parseApiResponse(response, AnnouncementSchema)
  } catch (error) {
    throwApiResponseError(error)
  }
}

export async function listAnnouncements(classId: number, page: number = 1, limit: number = 20): Promise<PageDto<AnnouncementDto>> {
  try {
    const response = await Api.fetchGet(
      `/api/classes/${classId}/announcements?page=${page}&limit=${limit}`,
      LIST_ANNOUNCEMENTS_ERRORS
    )
    return await parseApiResponse(response, AnnouncementsPageSchema)
  } catch (error) {
    throwApiResponseError(error)
  }
}

export async function createAnnouncement(
  classId: number,
  body: { title: string; content: string }
): Promise<AnnouncementDto> {
  try {
    const response = await Api.fetchPost(`/api/classes/${classId}/announcements`, body, CREATE_ANNOUNCEMENT_ERRORS)
    return await parseApiResponse(response, AnnouncementSchema)
  } catch (error) {
    throwApiResponseError(error)
  }
}

export async function updateAnnouncement(
  classId: number,
  announcementId: number,
  body: { title?: string; content?: string }
): Promise<AnnouncementDto> {
  try {
    const response = await Api.fetchPatch(
      `/api/classes/${classId}/announcements/${announcementId}`,
      body,
      UPDATE_ANNOUNCEMENT_ERRORS
    )
    return await parseApiResponse(response, AnnouncementSchema)
  } catch (error) {
    throwApiResponseError(error)
  }
}

export async function deleteAnnouncement(classId: number, announcementId: number): Promise<void> {
  try {
    await Api.fetchDelete(`/api/classes/${classId}/announcements/${announcementId}`, DELETE_ANNOUNCEMENT_ERRORS)
  } catch (error) {
    throwApiResponseError(error)
  }
}

export function uploadAnnouncementMaterial(
  classId: number,
  announcementId: number,
  file: File
): Promise<StoredFileDto> {
  return uploadStoredFile(`/api/classes/${classId}/announcements/${announcementId}/material-file`, file)
}

export function deleteAnnouncementMaterial(classId: number, announcementId: number): Promise<void> {
  return deleteStoredFile(`/api/classes/${classId}/announcements/${announcementId}/material-file`)
}
