import { z } from "zod"
import type { Errors } from "../types/api.types"
import { Api } from "./api"
import { parseApiResponse, throwApiResponseError } from "./response"

export const StoredFileSchema = z.object({
  id: z.string(),
  name: z.string(),
  content_type: z.string(),
  size: z.number(),
  download_url: z.string()
}).strip()

export type StoredFileDto = z.infer<typeof StoredFileSchema>

const FILE_ERRORS: Errors = {
  default: "Не удалось загрузить файл",
  413: "Файл превышает лимит 20 МБ",
  422: "Недопустимый формат файла"
}

export async function uploadStoredFile(path: string, file: File): Promise<StoredFileDto> {
  try {
    const response = await Api.fetchUpload(path, file, FILE_ERRORS)
    return await parseApiResponse(response, StoredFileSchema)
  } catch (error) {
    throwApiResponseError(error)
  }
}

export async function deleteStoredFile(path: string): Promise<void> {
  try {
    await Api.fetchDelete(path, FILE_ERRORS)
  } catch (error) {
    throwApiResponseError(error)
  }
}

export async function downloadStoredFile(file: StoredFileDto): Promise<void> {
  try {
    const response = await Api.fetchGet(file.download_url, FILE_ERRORS)
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = file.name
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  } catch (error) {
    throwApiResponseError(error)
  }
}

export function formatFileSize(size: number): string {
  if (size < 1024) return `${size} Б`
  if (size < 1024 * 1024) return `${Math.ceil(size / 1024)} КБ`
  return `${(size / (1024 * 1024)).toFixed(1)} МБ`
}
