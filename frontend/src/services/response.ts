import { ApiError } from "./api"
import { ZodError, type ZodType } from "zod"

export async function parseApiResponse<T>(response: Response, schema: ZodType<T>) {
  const data = await response.json()
  return schema.parse(data)
}

export function throwApiResponseError(error: unknown): never {
  if (error instanceof ZodError) {
    throw new ApiError("Ошибка, попробуйте позже")
  }

  throw error
}
