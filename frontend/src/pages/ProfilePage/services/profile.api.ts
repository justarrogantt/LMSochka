import { Api } from "../../../services/api"
import { UserSchema, type AuthUser } from "../../../services/auth.api"
import { parseApiResponse, throwApiResponseError } from "../../../services/response"
import type { Errors } from "../../../types/api.types"

export type UpdateProfileBody = {
  first_name: string | null
  last_name: string | null
  email: string
}

export type ChangePasswordBody = {
  current_password: string
  new_password: string
}

const UPDATE_PROFILE_ERRORS: Errors = {
  default: "Не удалось сохранить профиль",
  409: "Пользователь с таким email уже существует",
  422: "Проверьте правильность заполнения полей"
}

const CHANGE_PASSWORD_ERRORS: Errors = {
  default: "Не удалось сменить пароль",
  400: "Не удалось сменить пароль. Проверьте текущий пароль и сложность нового.",
  409: "Новый пароль должен отличаться от текущего",
  422: "Новый пароль не подходит по требованиям"
}

// Обновление данных профиля: имя, фамилия, email (он же логин). Возвращает свежего юзера.
export async function updateProfile(body: UpdateProfileBody): Promise<AuthUser> {
  try {
    const response = await Api.fetchPatch("/api/auth/me", body, UPDATE_PROFILE_ERRORS)
    return await parseApiResponse(response, UserSchema)
  } catch (error) {
    throwApiResponseError(error)
  }
}

// Смена пароля с подтверждением текущего. Тело ответа не используем — важен только успех.
export async function changePassword(body: ChangePasswordBody): Promise<void> {
  try {
    await Api.fetchPost("/api/auth/change-password", body, CHANGE_PASSWORD_ERRORS)
  } catch (error) {
    throwApiResponseError(error)
  }
}
