import type { Errors } from "../types/api.types"

// Таймаут фронтового запроса (в миллисекундах).
// Держи его не больше таймаута reverse proxy (Nginx/Traefik и т.д.),
// чтобы UI завершал запрос контролируемо до того, как инфраструктура оборвет соединение.
const REQUEST_TIMEOUT_MS = 120_000

// Флаг нужен, чтобы не показывать лишние ошибки в момент ухода со страницы/перезагрузки.
let isPageUnloading = false

window.addEventListener("pagehide", () => {
  isPageUnloading = true
})

window.addEventListener("beforeunload", () => {
  isPageUnloading = true
})

window.addEventListener("pageshow", () => {
  isPageUnloading = false
})

export const NETWORK_ERROR_MESSAGE =
  "Не удалось связаться с сервером. Проверьте соединение с интернетом или попробуйте позже"

// Единый тип ошибок для API-слоя.
// Поле status опциональное, потому что сетевые ошибки могут приходить без HTTP-кода.
export class ApiError extends Error {
  status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = "ApiError"
    this.status = status
  }
}

export class Api {
  // Базовая карта сообщений: HTTP-статус -> текст для пользователя.
  // При необходимости отдельные запросы могут переопределять эти тексты.
  private static readonly defaultErrors: Errors = {
    400: "Не удалось выполнить запрос. Проверьте данные и попробуйте снова",
    401: "Необходимо повторно войти в систему",
    403: "Недостаточно прав для выполнения этого действия",
    404: "Запрошенные данные не найдены",
    408: "Сервер не ответил вовремя. Попробуйте позже",
    409: "Данные уже изменились или конфликтуют с текущим состоянием",
    413: "Объем отправляемых данных слишком большой",
    422: "Не удалось обработать отправленные данные",
    429: "Слишком много запросов. Попробуйте немного позже",
    500: "На сервере произошла ошибка. Попробуйте позже",
    503: "Сервис временно недоступен. Попробуйте позже",
    504: "Сервер не ответил вовремя. Попробуйте позже"
  }

  private static getErrorMessage(
    status: number,
    errors: Errors = {},
    errorsReplace: boolean = false
  ): string {
    const errorMessages = errorsReplace ? errors : { ...Api.defaultErrors, ...errors }
    return errorMessages[status as keyof Errors] ?? "Не удалось выполнить запрос. Попробуйте позже"
  }

  // Стабильный client/device id для аналитики и серверной идентификации устройства.
  // Создаем один раз и сохраняем в localStorage.
  public static getDeviceId(): string {
    const key = "device_id"
    let deviceId = localStorage.getItem(key)

    if (!deviceId) {
      deviceId =
        window.isSecureContext && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : Api.generateFallbackUuid()
      localStorage.setItem(key, deviceId)
    }

    return deviceId
  }

  // Резервная генерация UUID для старых/небезопасных контекстов браузера.
  private static generateFallbackUuid(): string {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
      const random = Math.floor(Math.random() * 16)
      const value = char === "x" ? random : (random & 0x3) | 0x8
      return value.toString(16)
    })
  }

  // Хелперы для токенов доступа/обновления.
  public static getTokens() {
    return {
      accessToken: localStorage.getItem("access_token"),
      refreshToken: localStorage.getItem("refresh_token")
    }
  }

  public static saveTokens(accessToken: string, refreshToken: string): void {
    localStorage.setItem("access_token", accessToken)
    localStorage.setItem("refresh_token", refreshToken)
  }

  private static getHeaders(withAuth: boolean = true): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Device-Id": Api.getDeviceId()
    }

    if (withAuth) {
      const { accessToken } = Api.getTokens()
      if (accessToken) {
        headers.Authorization = `Bearer ${accessToken}`
      }
    }

    return headers
  }

  // Обертка над fetch с таймаутом.
  // Если таймаут срабатывает раньше ответа, AbortController прерывает запрос.
  private static async fetchWithTimeout(path: string, init: RequestInit, timeoutMs: number): Promise<Response> {
    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs)

    try {
      return await fetch(path, {
        ...init,
        signal: controller.signal
      })
    } finally {
      window.clearTimeout(timeoutId)
    }
  }

  // Общий promise защищает от шторма refresh-запросов:
  // если несколько запросов получили 401 одновременно, refresh запускается один раз.
  private static refreshPromise: Promise<boolean> | null = null

  private static async runRefresh(): Promise<boolean> {
    const { refreshToken } = Api.getTokens()

    if (!refreshToken) {
      window.location.replace("/register")
      return false
    }

    // Refresh вызываем без Authorization.
    // В body передаем только refresh_token из локального хранилища.
    const response = await Api.fetchWithTimeout(
      "/api/auth/refresh",
      {
        method: "POST",
        headers: Api.getHeaders(false),
        body: JSON.stringify({
          refresh_token: refreshToken
        })
      },
      REQUEST_TIMEOUT_MS
    )

    if (!response.ok) {
      if (response.status !== 401) {
        throw new ApiError(Api.getErrorMessage(response.status), response.status)
      }

      window.location.replace("/login")
      return false
    }

    const data = await response.json()
    const accessToken = data.access_token
    const nextRefreshToken = data.refresh_token

    if (accessToken && nextRefreshToken) {
      Api.saveTokens(accessToken, nextRefreshToken)
      return true
    }

    throw new ApiError("Не удалось обновить сессию. Попробуйте позже")
  }

  private static async fetchRefresh(): Promise<boolean> {
    if (!Api.refreshPromise) {
      Api.refreshPromise = (async () => {
        try {
          return await Api.runRefresh()
        } finally {
          Api.refreshPromise = null
        }
      })()
    }

    return Api.refreshPromise
  }

  // Универсальный пайплайн запроса:
  // 1) выполняем запрос с таймаутом,
  // 2) если 401 и запрос с авторизацией -> пробуем refresh токена один раз,
  // 3) приводим типовые ошибки к ApiError.
  private static async request(
    path: string,
    init: RequestInit,
    errors: Errors = {},
    errorsReplace: boolean = false,
    withAuth: boolean = true,
    timeoutMs: number = REQUEST_TIMEOUT_MS
  ): Promise<Response | undefined> {
    try {
      let response = await Api.fetchWithTimeout(
        path,
        {
          ...init,
          headers: Api.getHeaders(withAuth)
        },
        timeoutMs
      )

      if (withAuth && response.status === 401) {
        const refreshed = await Api.fetchRefresh()
        if (!refreshed) return

        response = await Api.fetchWithTimeout(
          path,
          {
            ...init,
            headers: Api.getHeaders(withAuth)
          },
          timeoutMs
        )
      }

      if (!response.ok) {
        throw new ApiError(Api.getErrorMessage(response.status, errors, errorsReplace), response.status)
      }

      return response
    } catch (error: unknown) {
      // Игнорируем шум fetch-ошибок при жесткой навигации/перезагрузке страницы.
      if (isPageUnloading) return

      // Abort из-за таймаута мапим в 408 для единообразной обработки в UI.
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new ApiError(Api.getErrorMessage(408, errors, errorsReplace), 408)
      }

      // Ошибки транспорта: offline/DNS/CORS на сетевом уровне.
      if (error instanceof TypeError) {
        throw new ApiError(NETWORK_ERROR_MESSAGE)
      }

      throw error
    }
  }

  static async fetchGet(
    path: string,
    errors: Errors = {},
    errorsReplace: boolean = false,
    withAuth: boolean = true,
    timeoutMs: number = REQUEST_TIMEOUT_MS
  ): Promise<Response | undefined> {
    return Api.request(path, { method: "GET" }, errors, errorsReplace, withAuth, timeoutMs)
  }

  static async fetchPost(
    path: string,
    body: unknown,
    errors: Errors = {},
    errorsReplace: boolean = false,
    withAuth: boolean = true,
    timeoutMs: number = REQUEST_TIMEOUT_MS
  ): Promise<Response | undefined> {
    return Api.request(
      path,
      {
        method: "POST",
        body: JSON.stringify(body)
      },
      errors,
      errorsReplace,
      withAuth,
      timeoutMs
    )
  }

  static async fetchDelete(
    path: string,
    errors: Errors = {},
    errorsReplace: boolean = false,
    withAuth: boolean = true,
    timeoutMs: number = REQUEST_TIMEOUT_MS
  ): Promise<Response | undefined> {
    return Api.request(path, { method: "DELETE" }, errors, errorsReplace, withAuth, timeoutMs)
  }

  static async fetchPut(
    path: string,
    body: unknown,
    errors: Errors = {},
    errorsReplace: boolean = false,
    withAuth: boolean = true,
    timeoutMs: number = REQUEST_TIMEOUT_MS
  ): Promise<Response | undefined> {
    return Api.request(
      path,
      {
        method: "PUT",
        body: JSON.stringify(body)
      },
      errors,
      errorsReplace,
      withAuth,
      timeoutMs
    )
  }
}
