import { ApiError, ApiSilentError } from "./api"
import { ZodError, type ZodType } from "zod"

type ApiResponseErrorOptions = {
  ignoreUnauthorized?: boolean
}

export async function parseApiResponse<T>(response: Response, schema: ZodType<T>) {
  const data = await response.json()
  return schema.parse(data)
}

export function throwApiResponseError(
  error: unknown,
  options: ApiResponseErrorOptions = {}
): never {
  const { ignoreUnauthorized = true } = options

  // 401 уже обрабатывается глобально через API_UNAUTHORIZED_EVENT + AuthContext.
  // В сервисах гасим его как "тихую" ошибку, чтобы не дублировать локальную обработку.
  if (ignoreUnauthorized && error instanceof ApiError && error.status === 401) {
    throw new ApiSilentError()
  }

  if (error instanceof ZodError) {
    throw new ApiError("Ошибка, попробуйте позже")
  }

  throw error
}
