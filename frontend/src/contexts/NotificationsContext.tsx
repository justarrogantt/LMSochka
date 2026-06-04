import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { Api, ApiError } from "../services/api"
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  parseNotificationEvent,
  type AppNotification
} from "../services/notifications.api"

type NotificationsContextValue = {
  notifications: AppNotification[]
  unreadCount: number
  isLoading: boolean
  markRead: (id: number) => void
  markAllRead: () => void
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null)

export function NotificationsProvider({ children }: { children: ReactNode }) {
  // Последние уведомления (страница 1) и счётчик непрочитанных
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Флаг живости — чтобы не писать в state после размонтирования (logout)
    let isActive = true

    // Первичная загрузка истории: список не должен быть пустым до первого WS-события
    async function load() {
      try {
        const page = await getNotifications()
        if (!isActive) return
        setNotifications(page.items)
        setUnreadCount(page.unread_count)
      } catch (error) {
        if (error instanceof ApiError) {
          // Уведомления не критичны — не спамим тостом на каждом экране, просто молчим
          return
        }
        throw error
      } finally {
        if (isActive) setIsLoading(false)
      }
    }

    void load()

    // Живая доставка: новое уведомление прилетает по WebSocket и встаёт в начало списка
    const connection = Api.connectWebSocket("/api/ws/notifications", (data) => {
      const notification = parseNotificationEvent(data)
      if (!notification) return

      setNotifications((prev) => {
        // Защита от дубля, если то же уведомление уже попало в список
        if (prev.some((item) => item.id === notification.id)) return prev
        return [notification, ...prev]
      })
      if (!notification.is_read) {
        setUnreadCount((prev) => prev + 1)
      }
    })

    return () => {
      isActive = false
      connection.close()
    }
  }, [])

  // Пометить одно прочитанным — оптимистично, с откатом при ошибке
  function markRead(id: number) {
    const target = notifications.find((item) => item.id === id)
    if (!target || target.is_read) return

    const prevNotifications = notifications
    const prevUnread = unreadCount
    setNotifications((items) => items.map((item) => (item.id === id ? { ...item, is_read: true } : item)))
    setUnreadCount((count) => Math.max(count - 1, 0))

    void (async () => {
      try {
        await markNotificationRead(id)
      } catch (error) {
        if (error instanceof ApiError) {
          setNotifications(prevNotifications)
          setUnreadCount(prevUnread)
          return
        }
        throw error
      }
    })()
  }

  // Пометить все прочитанными — тоже оптимистично
  function markAllRead() {
    if (unreadCount === 0) return

    const prevNotifications = notifications
    const prevUnread = unreadCount
    setNotifications((items) => items.map((item) => ({ ...item, is_read: true })))
    setUnreadCount(0)

    void (async () => {
      try {
        await markAllNotificationsRead()
      } catch (error) {
        if (error instanceof ApiError) {
          setNotifications(prevNotifications)
          setUnreadCount(prevUnread)
          return
        }
        throw error
      }
    })()
  }

  return (
    <NotificationsContext.Provider value={{ notifications, unreadCount, isLoading, markRead, markAllRead }}>
      {children}
    </NotificationsContext.Provider>
  )
}

export function useNotifications() {
  const value = useContext(NotificationsContext)

  if (!value) {
    throw new Error("useNotifications должен использоваться внутри NotificationsProvider")
  }

  return value
}
