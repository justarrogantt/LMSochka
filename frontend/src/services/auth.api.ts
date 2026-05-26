import { Api } from "./api"
import { parseApiResponse, throwApiResponseError } from "./response"
import { UserSchema } from "../schemas/auth.schema"
import type { AuthUser } from "../schemas/auth.schema"
import type { Errors } from "../types/api.types"

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
