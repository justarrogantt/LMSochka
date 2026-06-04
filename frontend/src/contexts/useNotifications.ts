import { createContext, useContext } from "react"
import type { AppNotification } from "../services/notifications.api"

export type NotificationsContextValue = {
  notifications: AppNotification[]
  unreadCount: number
  isLoading: boolean
  markRead: (id: number) => void
  markAllRead: () => void
}

export const NotificationsContext = createContext<NotificationsContextValue | null>(null)

export function useNotifications() {
  const value = useContext(NotificationsContext)

  if (!value) {
    throw new Error("useNotifications должен использоваться внутри NotificationsProvider")
  }

  return value
}
