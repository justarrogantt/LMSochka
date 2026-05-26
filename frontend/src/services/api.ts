import type { Errors } from "../types/api.types"

// Таймаут фронтового запроса (в миллисекундах).
// Держи его не больше таймаута reverse proxy (Nginx/Traefik и т.д.),
// чтобы UI завершал запрос контролируемо до того, как инфраструктура оборвет соединение.
const REQUEST_TIMEOUT_MS = 120_000
export const API_UNAUTHORIZED_EVENT = "api:unauthorized"

let isPageUnloading = false

type WebSocketDataHandler = (data: unknown) => void

type WebSocketConnection = {
  close: () => void
}

window.addEventListener("pagehide", () => {
  isPageUnloading = true
})

window.addEventListener("beforeunload", () => {
  isPageUnloading = true
})

window.addEventListener("pageshow", () => {
  isPageUnloading = false
})

export class ApiError extends Error {
  status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = "ApiError"
    this.status = status
  }
}

export class ApiSilentError extends Error {
  constructor() {
    super()
    this.name = "ApiSilentError"
  }
}

export class Api {
  private static notifyUnauthorized() {
    window.dispatchEvent(new CustomEvent(API_UNAUTHORIZED_EVENT))
  }

  private static readonly defaultErrors: Errors = {
    default: "Не удалось выполнить запрос. Попробуйте позже",
    network: "Не удалось связаться с сервером. Проверьте соединение с интернетом или попробуйте позже",
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
    status: number | "network",
    errors: Errors = {},
    errorsReplace: boolean = false
  ): string {
    const errorMessages = errorsReplace ? errors : { ...Api.defaultErrors, ...errors }
    return errorMessages[status as keyof Errors] ?? errorMessages.default ?? Api.defaultErrors.default!
  }

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

  private static generateFallbackUuid(): string {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
      const random = Math.floor(Math.random() * 16)
      const value = char === "x" ? random : (random & 0x3) | 0x8
      return value.toString(16)
    })
  }

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
      return false
    }

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

  private static async request(
    path: string,
    init: RequestInit,
    errors: Errors = {},
    errorsReplace: boolean = false,
    withAuth: boolean = true,
    timeoutMs: number = REQUEST_TIMEOUT_MS
  ): Promise<Response> {
    try {
      const { accessToken, refreshToken } = Api.getTokens()

      if (withAuth && (!refreshToken || !accessToken)) {
        Api.notifyUnauthorized()
        throw new ApiError(Api.getErrorMessage(401, errors, errorsReplace), 401)
      }

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
        if (!refreshed) {
          Api.notifyUnauthorized()
          throw new ApiError(Api.getErrorMessage(401, errors, errorsReplace), 401)
        }

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
        if (withAuth && response.status === 401) {
          Api.notifyUnauthorized()
        }
        throw new ApiError(Api.getErrorMessage(response.status, errors, errorsReplace), response.status)
      }

      return response
    } catch (error: unknown) {
      if (isPageUnloading) {
        throw new ApiSilentError()
      }

      // Abort из-за таймаута мапим в 408 для единообразной обработки в UI.
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new ApiError(Api.getErrorMessage(408, errors, errorsReplace), 408)
      }

      // Ошибки транспорта: offline/DNS/CORS на сетевом уровне.
      if (error instanceof TypeError) {
        throw new ApiError(Api.getErrorMessage("network", errors, errorsReplace))
      }

      throw error
    }
  }

  // WebSocket-обертка с автоматическим переподключением.
  static connectWebSocket(
    path: string,
    onData: WebSocketDataHandler,
    reconnect: boolean = true
  ): WebSocketConnection {
    let websocket: WebSocket | null = null
    let reconnectTimeoutId: number | null = null
    let isClosedByClient = false

    function getWebSocketUrl(): string {
      const { accessToken } = Api.getTokens()

      if (!accessToken) {
        throw new ApiError("Нет access token для WebSocket")
      }

      const protocol = window.location.protocol === "https:" ? "wss" : "ws"
      const token = encodeURIComponent(accessToken)
      return `${protocol}://${window.location.host}${path}?token=${token}`
    }

    function clearReconnectTimeout() {
      if (reconnectTimeoutId === null) return

      window.clearTimeout(reconnectTimeoutId)
      reconnectTimeoutId = null
    }

    function scheduleReconnect(shouldRefreshToken: boolean) {
      if (isClosedByClient) return
      if (reconnectTimeoutId !== null) return

      reconnectTimeoutId = window.setTimeout(async () => {
        reconnectTimeoutId = null

        if (shouldRefreshToken) {
          const refreshed = await Api.fetchRefresh()
          if (!refreshed) return
        }

        connect()
      }, 3000)
    }

    function onSocketMessage(event: MessageEvent) {
      try {
        const data = JSON.parse(event.data)
        onData(data)
      } catch {
        return
      }
    }

    function onSocketError() {
      return
    }

    function onSocketClose(event: CloseEvent) {
      websocket = null

      if (isClosedByClient) return
      if (!reconnect) return

      scheduleReconnect(event.code === 1008)
    }

    function connect() {
      clearReconnectTimeout()

      try {
        websocket = new WebSocket(getWebSocketUrl())
      } catch {
        scheduleReconnect(false)
        return
      }

      websocket.onmessage = onSocketMessage
      websocket.onerror = onSocketError
      websocket.onclose = onSocketClose
    }

    function close() {
      isClosedByClient = true
      clearReconnectTimeout()

      if (!websocket) return

      websocket.close()
      websocket = null
    }

    connect()
    return { close }
  }

  static async fetchGet(
    path: string,
    errors: Errors = {},
    errorsReplace: boolean = false,
    withAuth: boolean = true,
    timeoutMs: number = REQUEST_TIMEOUT_MS
  ): Promise<Response> {
    return Api.request(path, { method: "GET" }, errors, errorsReplace, withAuth, timeoutMs)
  }

  static async fetchPost(
    path: string,
    body: unknown,
    errors: Errors = {},
    errorsReplace: boolean = false,
    withAuth: boolean = true,
    timeoutMs: number = REQUEST_TIMEOUT_MS
  ): Promise<Response> {
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
  ): Promise<Response> {
    return Api.request(path, { method: "DELETE" }, errors, errorsReplace, withAuth, timeoutMs)
  }

  static async fetchPut(
    path: string,
    body: unknown,
    errors: Errors = {},
    errorsReplace: boolean = false,
    withAuth: boolean = true,
    timeoutMs: number = REQUEST_TIMEOUT_MS
  ): Promise<Response> {
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
