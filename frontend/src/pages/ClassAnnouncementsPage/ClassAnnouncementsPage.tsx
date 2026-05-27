import { type ReactNode, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { useParams } from "react-router-dom"
import styles from "./ClassAnnouncementsPage.module.css"
import ActionsIcon from "../../assets/icons/classes/actions.svg?react"
import CloseIcon from "../../assets/icons/classes/close.svg?react"
import { useToast } from "../../components/Toast/ToastProvider"
import { useAuth } from "../../contexts/AuthContext"
import { createAnnouncement, type AnnouncementDto } from "../../services/announcement.api"
import { ApiError, ApiSilentError } from "../../services/api"

type AnnouncementCard = {
  id: number
  title: string
  author: string
  date: string
  content: string
}

const initialAnnouncements: AnnouncementCard[] = [
  {
    id: 1,
    title: "Контрольная в пятницу",
    author: "teacher@example.com",
    date: "сегодня",
    content: "На занятии разберем последние вопросы и напишем небольшую контрольную работу."
  },
  {
    id: 2,
    title: "Материалы к теме",
    author: "creator@example.com",
    date: "вчера",
    content: "Добавлены ссылки на материалы для самостоятельной подготовки."
  }
]

type ModalShellProps = {
  title: string
  onClose: () => void
  children: ReactNode
}

function ModalShell({ title, onClose, children }: ModalShellProps) {
  return createPortal(
    <div className={styles.modalOverlay}>
      <div className={styles.modal}>
        <div className={styles.modalHead}>
          <div className={styles.modalTitle}>{title}</div>
          <button className={styles.closeButton} type="button" onClick={onClose} aria-label="Закрыть окно">
            <CloseIcon className={styles.closeIcon} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  )
}

export default function ClassAnnouncementsPage() {
  const { classId } = useParams<{ classId: string }>()
  const { user } = useAuth()
  const showToast = useToast()
  const [announcements, setAnnouncements] = useState<AnnouncementCard[]>(initialAnnouncements)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [title, setTitle] = useState("")
  const [content, setContent] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const parsedClassId = Number(classId)

  const canSubmit = useMemo(() => title.trim().length > 0 && content.trim().length > 0 && !isSubmitting, [title, content, isSubmitting])

  function closeCreateModal() {
    if (isSubmitting) return
    setIsCreateModalOpen(false)
    setTitle("")
    setContent("")
  }

  function mapServerAnnouncement(dto: AnnouncementDto): AnnouncementCard {
    return {
      id: dto.id,
      title: dto.title,
      author: dto.author.email,
      date: "только что",
      content: dto.content
    }
  }

  async function submitCreateAnnouncement() {
    if (!canSubmit) return
    if (!Number.isFinite(parsedClassId)) {
      showToast({ type: "error", message: "Некорректный id курса", offsetBottom: 30 })
      return
    }

    try {
      setIsSubmitting(true)
      const created = await createAnnouncement(parsedClassId, {
        title: title.trim(),
        content: content.trim()
      })

      setAnnouncements((prev) => [mapServerAnnouncement(created), ...prev])
      setIsCreateModalOpen(false)
      setTitle("")
      setContent("")
      showToast({ type: "neutral", message: "Объявление создано", offsetBottom: 30 })
    } catch (error) {
      if (error instanceof ApiSilentError) return

      showToast({
        type: "error",
        message: error instanceof ApiError ? error.message : "Не удалось создать объявление",
        offsetBottom: 30
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.pageHead}>
        <div className={styles.titleBlock}>
          <div className={styles.title}>Объявления</div>
          <div className={styles.text}>Новости и важные сообщения для участников курса.</div>
        </div>

        <button className={styles.primaryButton} type="button" onClick={() => setIsCreateModalOpen(true)}>
          Создать объявление
        </button>
      </div>

      <div className={styles.cards}>
        {announcements.map((item) => (
          <div className={styles.card} key={item.id}>
            <div className={styles.cardHead}>
              <div className={styles.cardTitle}>{item.title}</div>
              <button className={styles.iconButton} type="button" aria-label="Действия с объявлением">
                <ActionsIcon className={styles.icon} />
              </button>
            </div>

            <div className={styles.meta}>
              <div>{item.author}</div>
              <div>{item.date}</div>
            </div>

            <div className={styles.content}>{item.content}</div>
          </div>
        ))}
      </div>

      {isCreateModalOpen && (
        <ModalShell title="Создать объявление" onClose={closeCreateModal}>
          <label className={styles.field}>
            <div className={styles.fieldLabel}>Заголовок</div>
            <input
              className={styles.input}
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Например, Изменение дедлайна"
            />
          </label>

          <label className={styles.field}>
            <div className={styles.fieldLabel}>Текст объявления</div>
            <textarea
              className={styles.textarea}
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder={`Текст от ${user?.email ?? "преподавателя"}`}
            />
          </label>

          <div className={styles.modalActions}>
            <button className={styles.secondaryButton} type="button" onClick={closeCreateModal} disabled={isSubmitting}>
              Отмена
            </button>
            <button className={styles.primaryButton} type="button" onClick={submitCreateAnnouncement} disabled={!canSubmit}>
              {isSubmitting ? "Публикуем..." : "Опубликовать"}
            </button>
          </div>
        </ModalShell>
      )}
    </div>
  )
}
