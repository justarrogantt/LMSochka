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

export async function wait() {
  await new Promise((resolve) => setTimeout(resolve, 500))
}
