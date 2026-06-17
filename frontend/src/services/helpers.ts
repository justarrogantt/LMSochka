export function formatDateTime(value: string) {
  const utcValue = /z$/i.test(value) ? value : `${value}Z`
  const date = new Date(utcValue)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Asia/Yekaterinburg",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date)
}

export function formatDateTimeInputValue(value: string | null): string {
  if (!value) return ""

  const utcValue = /z$/i.test(value) ? value : `${value}Z`
  const date = new Date(utcValue)
  if (Number.isNaN(date.getTime())) return ""

  const offsetMs = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16)
}

export function toApiDateTime(value: string): string | null {
  if (!value) return null

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null

  return date.toISOString()
}

export function currentDateTimeInputValue(): string {
  const now = new Date()
  const offsetMs = now.getTimezoneOffset() * 60_000
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 16)
}

export function isPastDateTimeInputValue(value: string): boolean {
  if (!value) return false

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return false

  return date.getTime() < Date.now()
}

// Аккуратное число баллов без лишних нулей: 1, 2.5, 10 (а не 1.0 / 2.50).
export function formatPoints(value: number | null | undefined): string {
  if (value == null) return "0"
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)))
}

export function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  return text.slice(0, maxChars).trimEnd() + "..."
}

// Отображаемое имя пользователя: "Имя Фамилия", иначе email как запасной вариант
export function formatUserName(user: { first_name?: string | null; last_name?: string | null; email: string }): string {
  return `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim() || user.email
}

// Русский плюрал по числу: 1 минуту / 2 минуты / 5 минут
function plural(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10
  const mod100 = count % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few
  return many
}

// Относительное время «N минут/часов/дней назад» — для уведомлений и лент.
export function formatRelativeTime(value: string): string {
  const utcValue = /z$/i.test(value) ? value : `${value}Z`
  const date = new Date(utcValue)
  if (Number.isNaN(date.getTime())) return value

  const diffMinutes = Math.floor((Date.now() - date.getTime()) / 60000)
  if (diffMinutes < 1) return "только что"
  if (diffMinutes < 60) return `${diffMinutes} ${plural(diffMinutes, "минуту", "минуты", "минут")} назад`

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours} ${plural(diffHours, "час", "часа", "часов")} назад`

  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays} ${plural(diffDays, "день", "дня", "дней")} назад`

  return formatDateTime(value)
}
