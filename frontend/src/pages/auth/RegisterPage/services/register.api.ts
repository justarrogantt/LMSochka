import { Api } from "../../../../services/api"
import { parseApiResponse, throwApiResponseError } from "../../../../services/response"
import type { AuthSuccess } from "../../../../schemas/auth.schema"
import type { Errors } from "../../../../types/api.types"
import { RegisterSuccessSchema } from "../schemas/register.schema"

type RegisterPayload = {
  email: string
  password: string
  first_name?: string | null
  last_name?: string | null
}

const REGISTER_ERRORS: Errors = {
  default: "Не удалось зарегистрироваться. Попробуйте позже",
  network: "Не удалось связаться с сервером",
  409: "Пользователь с таким email уже существует",
  422: "Проверьте данные регистрации"
}

export async function register(payload: RegisterPayload): Promise<AuthSuccess> {
  try {
    const response = await Api.fetchPost("/api/auth/register", payload, REGISTER_ERRORS, false, false)
    const authData = await parseApiResponse(response, RegisterSuccessSchema)

    Api.saveTokens(authData.access_token, authData.refresh_token)
    return authData
  } catch (error) {
    throwApiResponseError(error, { ignoreUnauthorized: false })
  }
}
