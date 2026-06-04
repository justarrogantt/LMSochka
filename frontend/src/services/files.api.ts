import { z } from "zod"
import type { Errors } from "../types/api.types"
import { Api, ApiError } from "./api"
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

const MAX_UPLOAD_SIZE = 20 * 1024 * 1024

const ALLOWED_FILE_TYPES: Record<string, string[]> = {
  ".pdf": ["application/pdf"],
  ".doc": ["application/msword"],
  ".docx": ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ".xls": ["application/vnd.ms-excel"],
  ".xlsx": ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  ".ppt": ["application/vnd.ms-powerpoint"],
  ".pptx": ["application/vnd.openxmlformats-officedocument.presentationml.presentation"],
  ".txt": ["text/plain"],
  ".csv": ["text/csv", "application/csv", "text/plain"],
  ".png": ["image/png"],
  ".jpg": ["image/jpeg"],
  ".jpeg": ["image/jpeg"],
  ".webp": ["image/webp"],
  ".zip": ["application/zip", "application/x-zip-compressed"],
  ".7z": ["application/x-7z-compressed"]
}

export const ACCEPTED_FILE_EXTENSIONS = Object.keys(ALLOWED_FILE_TYPES)
export const ACCEPTED_FILE_INPUT = ACCEPTED_FILE_EXTENSIONS.join(",")
export const ACCEPTED_FILE_TYPES_LABEL = "PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, TXT, CSV, PNG, JPG, JPEG, WEBP, ZIP, 7Z"

function getFileExtension(fileName: string): string {
  const dotIndex = fileName.lastIndexOf(".")
  return dotIndex === -1 ? "" : fileName.slice(dotIndex).toLowerCase()
}

export function validateUploadFile(file: File): string | null {
  const extension = getFileExtension(file.name)
  const allowedMimeTypes = ALLOWED_FILE_TYPES[extension]

  if (!allowedMimeTypes) {
    return `Недопустимый формат файла. Доступны: ${ACCEPTED_FILE_TYPES_LABEL}`
  }

  if (file.type && !allowedMimeTypes.includes(file.type.toLowerCase())) {
    return "Тип файла не соответствует расширению"
  }

  if (file.size > MAX_UPLOAD_SIZE) {
    return "Файл превышает лимит 20 МБ"
  }

  return null
}

export async function uploadStoredFile(path: string, file: File): Promise<StoredFileDto> {
  const validationError = validateUploadFile(file)
  if (validationError) throw new ApiError(validationError, 422)

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
