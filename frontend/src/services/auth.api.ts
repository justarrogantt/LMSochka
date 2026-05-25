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

export async function getCurrentUser(): Promise<AuthUser> {
  try {
    const response = await Api.fetchGet("/api/auth/me", ME_ERRORS)
    return await parseApiResponse(response, UserSchema)
  } catch (error) {
    throwApiResponseError(error)
  }
}
