import { z } from "zod"
import { Api } from "./api"
import { parseApiResponse, throwApiResponseError } from "./response"
import type { Errors } from "../types/api.types"

export type NotificationType = "announcement" | "assignment" | "grade" | "submission_returned"

// Уведомление в том виде, в каком его отдаёт REST и присылает WebSocket.
const NotificationSchema = z.object({
  id: z.number(),
  type: z.enum(["announcement", "assignment", "grade", "submission_returned"]),
  title: z.string(),
  class_id: z.number().nullable(),
  entity_id: z.number().nullable(),
  is_read: z.boolean(),
  created_at: z.string()
}).strip()

export type AppNotification = z.infer<typeof NotificationSchema>

// Страница уведомлений + счётчик непрочитанных в одном ответе.
const NotificationPageSchema = z.object({
  items: z.array(NotificationSchema),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
  unread_count: z.number()
}).strip()

export type NotificationPage = z.infer<typeof NotificationPageSchema>

const ReadAllSchema = z.object({
  updated_count: z.number(),
  unread_count: z.number()
}).strip()

const NOTIFICATIONS_ERRORS: Errors = {
  default: "Не удалось загрузить уведомления"
}

// Разбор сообщения из WebSocket. Возвращаем null, если формат неожиданный — лишнего не падаем.
export function parseNotificationEvent(data: unknown): AppNotification | null {
  const result = NotificationSchema.safeParse(data)
  return result.success ? result.data : null
}

// История уведомлений (страница 1 хватает для колокольчика).
export async function getNotifications(page = 1, limit = 20): Promise<NotificationPage> {
  try {
    const response = await Api.fetchGet(`/api/notifications?page=${page}&limit=${limit}`, NOTIFICATIONS_ERRORS)
    return await parseApiResponse(response, NotificationPageSchema)
  } catch (error) {
    throwApiResponseError(error)
  }
}

// Пометить одно уведомление прочитанным.
export async function markNotificationRead(id: number): Promise<AppNotification> {
  try {
    const response = await Api.fetchPost(`/api/notifications/${id}/read`, {}, NOTIFICATIONS_ERRORS)
    return await parseApiResponse(response, NotificationSchema)
  } catch (error) {
    throwApiResponseError(error)
  }
}

// Пометить все прочитанными. Возвращаем актуальный счётчик непрочитанных (0).
export async function markAllNotificationsRead(): Promise<number> {
  try {
    const response = await Api.fetchPost("/api/notifications/read-all", {}, NOTIFICATIONS_ERRORS)
    const data = await parseApiResponse(response, ReadAllSchema)
    return data.unread_count
  } catch (error) {
    throwApiResponseError(error)
  }
}
