import { ApiError } from "./api"
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
  _options: ApiResponseErrorOptions = {}
): never {
  if (error instanceof ZodError) {
    throw new ApiError("Ошибка, попробуйте позже")
  }

  throw error
}
