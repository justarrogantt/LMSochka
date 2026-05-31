import { z } from "zod"
import { Api } from "../../../../services/api"
import { parseApiResponse, throwApiResponseError } from "../../../../services/response"
import type { Errors } from "../../../../types/api.types"

// Пользователь внутри успешного ответа register.
const RegisterUserSchema = z.object({
  id: z.number(),
  email: z.string().email(),
  first_name: z.string().nullable(),
  last_name: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string().nullable()
}).strip()

// Успешный ответ register: созданный пользователь и новая пара токенов.
const RegisterSuccessSchema = z.object({
  user: RegisterUserSchema,
  access_token: z.string(),
  refresh_token: z.string()
}).strip()

type AuthSuccess = z.infer<typeof RegisterSuccessSchema>

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
