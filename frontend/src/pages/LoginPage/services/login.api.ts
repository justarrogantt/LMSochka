import { Api } from "../../../services/api"
import { parseApiResponse, throwApiResponseError } from "../../../services/response"
import type { AuthSuccess } from "../../../schemas/auth.schema"
import type { Errors } from "../../../types/api.types"
import { LoginSuccessSchema } from "../schemas/login.schema"

type LoginPayload = {
  email: string
  password: string
}

const LOGIN_ERRORS: Errors = {
  default: "Не удалось войти. Попробуйте позже",
  network: "Не удалось связаться с сервером",
  401: "Неверный email или пароль",
  422: "Проверьте email и пароль"
}

export async function login(payload: LoginPayload): Promise<AuthSuccess> {
  try {
    const response = await Api.fetchPost("/api/auth/login", payload, LOGIN_ERRORS, false, false)
    const authData = await parseApiResponse(response, LoginSuccessSchema)

    Api.saveTokens(authData.access_token, authData.refresh_token)
    return authData
  } catch (error) {
    throwApiResponseError(error)
  }
}
