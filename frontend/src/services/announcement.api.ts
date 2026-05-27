import { Api } from "./api"
import { throwApiResponseError } from "./response"
import type { Errors } from "../types/api.types"

export type AnnouncementAuthor = {
  id: number
  email: string
}

export type AnnouncementDto = {
  id: number
  class_id: number
  title: string
  content: string
  author: AnnouncementAuthor
  created_at: string
  updated_at: string
}

const CREATE_ANNOUNCEMENT_ERRORS: Errors = {
  default: "Не удалось создать объявление",
  network: "Не удалось связаться с сервером",
  403: "Недостаточно прав для создания объявления",
  404: "Курс не найден",
  422: "Проверьте поля объявления"
}

export async function createAnnouncement(
  classId: number,
  body: { title: string; content: string }
): Promise<AnnouncementDto> {
  try {
    const response = await Api.fetchPost(`/api/classes/${classId}/announcements`, body, CREATE_ANNOUNCEMENT_ERRORS)
    return (await response.json()) as AnnouncementDto
  } catch (error) {
    throwApiResponseError(error)
  }
}
