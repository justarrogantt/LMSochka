import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { useNavigate } from "react-router-dom"
import BellIcon from "../../assets/icons/layout/bell.svg?react"
import { useNotifications } from "../../contexts/useNotifications"
import { formatRelativeTime } from "../../services/helpers"
import type { AppNotification } from "../../services/notifications.api"
import { DURATION, EASE_OUT } from "../../shared/motion"
import styles from "./NotificationsBell.module.css"

// Куда вести по клику — на конкретную страницу сущности, а не просто на курс.
// entity_id у assignment/grade/submission_* — это id задания, у announcement — id объявления.
function notificationLink(notification: AppNotification): string | null {
  if (notification.class_id === null) return null

  const base = `/classes/${notification.class_id}`
  if (notification.entity_id === null) return base

  switch (notification.type) {
    case "announcement":
      return `${base}/announcements/${notification.entity_id}`
    case "assignment":
    case "grade":
    case "submission_returned":
    case "submission_submitted":
      return `${base}/assignments/${notification.entity_id}`
    default:
      return base
  }
}

export default function NotificationsBell() {
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications()
  const navigate = useNavigate()
  // Открыта ли выпадающая панель
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  // Закрываем панель по клику вне неё
  useEffect(() => {
    if (!isOpen) return

    function onClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener("mousedown", onClickOutside)
    return () => document.removeEventListener("mousedown", onClickOutside)
  }, [isOpen])

  function toggle() {
    setIsOpen((prev) => !prev)
  }

  function onItemClick(notification: AppNotification) {
    markRead(notification.id)
    setIsOpen(false)

    const link = notificationLink(notification)
    if (link) navigate(link)
  }

  return (
    <div className={styles.container} ref={containerRef}>
      <button
        className={styles.bellButton}
        type="button"
        onClick={toggle}
        aria-label="Уведомления"
      >
        <BellIcon className={styles.bellIcon} />
        {unreadCount > 0 && (
          <span className={styles.badge}>{unreadCount > 99 ? "99+" : unreadCount}</span>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            className={styles.panel}
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: DURATION.panel, ease: EASE_OUT }}
          >
            <div className={styles.panelHead}>
            <div className={styles.panelTitle}>Уведомления</div>
            {unreadCount > 0 && (
              <button className={styles.readAll} type="button" onClick={markAllRead}>
                Прочитать все
              </button>
            )}
          </div>

          <div className={styles.list}>
            {notifications.length === 0 && <div className={styles.empty}>Пока нет уведомлений</div>}

            {notifications.map((notification) => (
              <button
                key={notification.id}
                className={`${styles.item} ${notification.is_read ? "" : styles.itemUnread}`}
                type="button"
                onClick={() => onItemClick(notification)}
              >
                {!notification.is_read && <span className={styles.dot} aria-hidden="true" />}
                <span className={styles.itemBody}>
                  <span className={styles.itemTitle}>{notification.title}</span>
                  <span className={styles.itemTime}>{formatRelativeTime(notification.created_at)}</span>
                </span>
              </button>
            ))}
          </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
