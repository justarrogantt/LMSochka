import { z } from "zod"
import { Api } from "../../../../services/api"
import { parseApiResponse, throwApiResponseError } from "../../../../services/response"
import type { Errors } from "../../../../types/api.types"

// Пользователь внутри успешного ответа login.
const LoginUserSchema = z.object({
  id: z.number(),
  email: z.string().email(),
  first_name: z.string().nullable(),
  last_name: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string().nullable()
}).strip()

// Успешный ответ login: пользователь и новая пара токенов.
const LoginSuccessSchema = z.object({
  user: LoginUserSchema,
  access_token: z.string(),
  refresh_token: z.string()
}).strip()

type AuthSuccess = z.infer<typeof LoginSuccessSchema>

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
