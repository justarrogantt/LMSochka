import { z } from "zod"
import { Api } from "./api"
import { parseApiResponse, throwApiResponseError } from "./response"
import type { Errors } from "../types/api.types"

// Текущий пользователь, которого отдаёт /auth/me.
const UserSchema = z.object({
  id: z.number(),
  email: z.string().email(),
  first_name: z.string().nullable(),
  last_name: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string().nullable()
}).strip()

export type AuthUser = z.infer<typeof UserSchema>

const ME_ERRORS: Errors = {
  default: "Не удалось получить данные пользователя",
  network: "Не удалось связаться с сервером",
  401: "Необходимо повторно войти в систему"
}

const LOGOUT_ERRORS: Errors = {
  default: "Не удалось выйти из аккаунта. Попробуйте позже",
  network: "Не удалось связаться с сервером",
  401: "Сессия уже завершена"
}

export async function getCurrentUser(): Promise<AuthUser> {
  try {
    const response = await Api.fetchGet("/api/auth/me", ME_ERRORS)
    return await parseApiResponse(response, UserSchema)
  } catch (error) {
    throwApiResponseError(error)
  }
}

export async function logout(): Promise<void> {
  try {
    await Api.fetchPost("/api/auth/logout", {}, LOGOUT_ERRORS)
  } catch (error) {
    throwApiResponseError(error)
  }
}
