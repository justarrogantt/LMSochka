import { type ReactNode, useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { useOutletContext } from "react-router-dom"
import ActionsIcon from "../../assets/icons/classes/actions.svg?react"
import CloseIcon from "../../assets/icons/classes/close.svg?react"
import Loading from "../../components/Loading/Loading"
import { useToast } from "../../components/Toast/ToastProvider"
import { useAuth } from "../../contexts/AuthContext"
import { ApiSilentError } from "../../services/api"
import { createAnnouncement, listAnnouncements, updateAnnouncement, type AnnouncementDto } from "../../services/announcement.api"
import { formatDateTime } from "../../services/helpers"
import type { ClassLayoutContext } from "../ClassLayout/ClassLayout"
import styles from "./ClassAnnouncementsPage.module.css"

type AnnouncementCard = {
  id: number
  title: string
  author: string
  date: string
  content: string
}

type FormState = {
  title: string
  content: string
}

type ModalShellProps = {
  title: string
  onClose: () => void
  children: ReactNode
}

// Базовая обертка модального окна
function ModalShell({ title, onClose, children }: ModalShellProps) {
  return createPortal(
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(event) => event.stopPropagation()}>
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

// Маппинг ответа бэка в карточку объявления
function mapServerAnnouncement(dto: AnnouncementDto): AnnouncementCard {
  return {
    id: dto.id,
    title: dto.title,
    author: dto.author.email,
    date: formatDateTime(dto.created_at),
    content: dto.content
  }
}

export default function ClassAnnouncementsPage() {
  const { classDetail } = useOutletContext<ClassLayoutContext>()
  const { user } = useAuth()
  const showToast = useToast()

  // Данные объявлений
  const [items, setItems] = useState<AnnouncementCard[]>([])

  // Лоадер страницы
  const [isLoading, setIsLoading] = useState(true)

  // Состояние модалки
  const [activeModal, setActiveModal] = useState<"create" | "edit" | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)

  // Флаг публикации
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Поля формы
  const [form, setForm] = useState<FormState>({
    title: "",
    content: ""
  })

  // Загрузка объявлений курса
  useEffect(() => {
    async function loadAnnouncements() {
      if (!classDetail?.id) {
        setIsLoading(false)
        return
      }

      try {
        const page = await listAnnouncements(classDetail.id)
        setItems(page.items.map(mapServerAnnouncement))
      } catch (error) {
        if (error instanceof ApiSilentError) return
        showToast({ type: "error", message: error instanceof Error ? error.message : "Не удалось загрузить объявления" })
      } finally {
        setIsLoading(false)
      }
    }

    void loadAnnouncements()
  }, [classDetail?.id, showToast])

  // Закрытие модалки создания объявления
  function closeCreateModal() {
    if (isSubmitting) return
    setActiveModal(null)
    setEditingId(null)
    setForm({ title: "", content: "" })
  }

  // Открытие модалки создания объявления
  function openCreateModal() {
    setForm({ title: "", content: "" })
    setEditingId(null)
    setActiveModal("create")
  }

  // Открытие модалки редактирования объявления
  function openEditModal(item: AnnouncementCard) {
    setForm({ title: item.title, content: item.content })
    setEditingId(item.id)
    setActiveModal("edit")
  }

  // Сохранение объявления (создание или редактирование)
  async function submitAnnouncement() {
    if (!classDetail?.id) return

    const nextTitle = form.title.trim()
    const nextContent = form.content.trim()
    if (!nextTitle || !nextContent) return

    setIsSubmitting(true)
    setActiveModal(null)

    try {
      if (editingId) {
        const updated = await updateAnnouncement(classDetail.id, editingId, { title: nextTitle, content: nextContent })
        const updatedCard = mapServerAnnouncement(updated)
        setItems((prev) => prev.map((item) => (item.id === editingId ? updatedCard : item)))
        showToast({ type: "neutral", message: "Объявление обновлено" })
      } else {
        const created = await createAnnouncement(classDetail.id, { title: nextTitle, content: nextContent })
        setItems((prev) => [mapServerAnnouncement(created), ...prev])
        showToast({ type: "neutral", message: "Объявление создано" })
      }

      setEditingId(null)
      setForm({ title: "", content: "" })
    } catch (error) {
      showToast({ type: "error", message: error instanceof Error ? error.message : "Не удалось сохранить объявление" })
    } finally {
      setIsSubmitting(false)
    }
  }

  const canSubmit = form.title.trim().length > 0 && form.content.trim().length > 0 && !isSubmitting
  const canManageAnnouncements = classDetail?.user_role !== "student"

  return (
    <div className={styles.page}>
      <div className={styles.pageHead}>
        <div className={styles.titleBlock}>
          <div className={styles.title}>Объявления</div>
          <div className={styles.text}>Новости и важные сообщения для участников курса.</div>
        </div>

        {canManageAnnouncements && (
          <button className={styles.primaryButton} type="button" onClick={openCreateModal}>
            Создать объявление
          </button>
        )}
      </div>

      {isLoading && <Loading />}

      {!isLoading && items.length > 0 && (
        <div className={styles.cards}>
          {items.map((item) => (
            <div className={styles.card} key={item.id}>
              <div className={styles.cardHead}>
                <div className={styles.cardTitle}>{item.title}</div>
                {canManageAnnouncements && (
                  <button
                    className={styles.iconButton}
                    type="button"
                    aria-label="Редактировать объявление"
                    onClick={() => openEditModal(item)}
                  >
                    <ActionsIcon className={styles.icon} />
                  </button>
                )}
              </div>

              <div className={styles.meta}>
                <div>{item.author}</div>
                <div>{item.date}</div>
              </div>

              <div className={styles.content}>{item.content}</div>
            </div>
          ))}
        </div>
      )}

      {!isLoading && items.length === 0 && <div className={styles.emptyMessage}>Объявлений пока нет</div>}

      {canManageAnnouncements && activeModal && (
        <ModalShell title={activeModal === "create" ? "Создать объявление" : "Редактировать объявление"} onClose={closeCreateModal}>
          <label className={styles.field}>
            <div className={styles.fieldLabel}>Заголовок</div>
            <input
              className={styles.input}
              type="text"
              value={form.title}
              onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
              placeholder="Например, Изменение дедлайна"
            />
          </label>

          <label className={styles.field}>
            <div className={styles.fieldLabel}>Текст объявления</div>
            <textarea
              className={styles.textarea}
              value={form.content}
              onChange={(event) => setForm((prev) => ({ ...prev, content: event.target.value }))}
              placeholder={`Текст от ${user?.email ?? "преподавателя"}`}
            />
          </label>

          <div className={styles.modalActions}>
            <button className={styles.secondaryButton} type="button" onClick={closeCreateModal} disabled={isSubmitting}>
              Отмена
            </button>
            <button className={styles.primaryButton} type="button" onClick={() => void submitAnnouncement()} disabled={!canSubmit}>
              {isSubmitting ? "Сохраняем..." : activeModal === "create" ? "Опубликовать" : "Сохранить"}
            </button>
          </div>
        </ModalShell>
      )}
    </div>
  )
}
