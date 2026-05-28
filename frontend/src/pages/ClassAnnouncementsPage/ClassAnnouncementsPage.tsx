import { type ReactNode, useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { useOutletContext } from "react-router-dom"
import ActionsIcon from "../../assets/icons/classes/actions.svg?react"
import CloseIcon from "../../assets/icons/classes/close.svg?react"
import TrashIcon from "../../assets/icons/classes/trash.svg?react"
import Loading from "../../components/Loading/Loading"
import Pagination from "../../components/Pagination/Pagination"
import { useToast } from "../../components/Toast/ToastProvider"
import { useAuth } from "../../contexts/AuthContext"
import { ApiError, ApiSilentError } from "../../services/api"
import {
  createAnnouncement,
  deleteAnnouncement,
  listAnnouncements,
  updateAnnouncement,
  type AnnouncementDto
} from "../../services/announcement.api"
import { formatDateTime } from "../../services/helpers"
import type { ClassLayoutContext } from "../ClassLayout/ClassLayout"
import styles from "./ClassAnnouncementsPage.module.css"

const LIMIT = 10

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
  disabled?: boolean
}

// Базовая обертка модального окна
function ModalShell({ title, onClose, children, disabled }: ModalShellProps) {
  return createPortal(
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(event) => event.stopPropagation()}>
        <div className={styles.modalHead}>
          <div className={styles.modalTitle}>{title}</div>
          <button className={styles.closeButton} type="button" onClick={onClose} aria-label="Закрыть окно" disabled={disabled}>
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

  // Пагинация
  const [currentPage, setCurrentPage] = useState(1)
  const [totalItems, setTotalItems] = useState(0)

  // Состояние модалки
  const [activeModal, setActiveModal] = useState<"create" | "edit" | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  // Флаг публикации
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Поля формы
  const [form, setForm] = useState<FormState>({
    title: "",
    content: ""
  })

  // Загрузка страницы объявлений
  async function loadPage(page: number) {
    if (!classDetail?.id) return
    setIsLoading(true)
    try {
      const data = await listAnnouncements(classDetail.id, page, LIMIT)
      setItems(data.items.map(mapServerAnnouncement))
      setTotalItems(data.total)
      setCurrentPage(page)
    } catch (error) {
      if (error instanceof ApiSilentError) return
      showToast({ type: "error", message: error instanceof ApiError ? error.message : "Не удалось загрузить объявления" })
    } finally {
      setIsLoading(false)
    }
  }

  // Начальная загрузка при смене класса
  useEffect(() => {
    void loadPage(1)
    
  }, [classDetail?.id])

  // Закрытие модалки создания/редактирования
  function closeCreateModal() {
    if (isSubmitting) return
    setActiveModal(null)
    setEditingId(null)
    setForm({ title: "", content: "" })
  }

  // Закрытие модалки удаления
  function closeDeleteModal() {
    if (isSubmitting) return
    setDeletingId(null)
  }

  // Открытие модалки создания
  function openCreateModal() {
    setForm({ title: "", content: "" })
    setEditingId(null)
    setActiveModal("create")
  }

  // Открытие модалки редактирования
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

    try {
      if (editingId) {
        await updateAnnouncement(classDetail.id, editingId, { title: nextTitle, content: nextContent })
        showToast({ type: "neutral", message: "Объявление обновлено" })
        void loadPage(currentPage)
      } else {
        await createAnnouncement(classDetail.id, { title: nextTitle, content: nextContent })
        showToast({ type: "neutral", message: "Объявление создано" })
        void loadPage(1)
      }

      setActiveModal(null)
      setEditingId(null)
      setForm({ title: "", content: "" })
    } catch (error) {
      showToast({ type: "error", message: error instanceof ApiError ? error.message : "Не удалось сохранить объявление" })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Удаление объявления
  async function submitDeleteAnnouncement() {
    if (!classDetail?.id || !deletingId || isSubmitting) return

    setIsSubmitting(true)

    try {
      await deleteAnnouncement(classDetail.id, deletingId)
      setDeletingId(null)
      showToast({ type: "neutral", message: "Объявление удалено" })
      const nextPage = items.length === 1 && currentPage > 1 ? currentPage - 1 : currentPage
      void loadPage(nextPage)
    } catch (error) {
      showToast({ type: "error", message: error instanceof ApiError ? error.message : "Не удалось удалить объявление" })
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
                  <div className={styles.cardActions}>
                    <button
                      className={styles.iconButton}
                      type="button"
                      aria-label="Редактировать объявление"
                      onClick={() => openEditModal(item)}
                    >
                      <ActionsIcon className={styles.icon} />
                    </button>
                    <button
                      className={styles.iconButton}
                      type="button"
                      aria-label="Удалить объявление"
                      onClick={() => setDeletingId(item.id)}
                    >
                      <TrashIcon className={styles.icon} />
                    </button>
                  </div>
                )}
              </div>

              <div className={styles.content}>{item.content}</div>

              <div className={styles.meta}>
                <div>{item.author}</div>
                <div>{item.date}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!isLoading && items.length === 0 && <div className={styles.emptyMessage}>Объявлений пока нет</div>}

      <Pagination page={currentPage} total={totalItems} limit={LIMIT} onChange={(p) => void loadPage(p)} />

      {canManageAnnouncements && activeModal && (
        <ModalShell title={activeModal === "create" ? "Создать объявление" : "Редактировать объявление"} onClose={closeCreateModal} disabled={isSubmitting}>
          <label className={styles.field}>
            <div className={styles.fieldLabel}>Заголовок</div>
            <input
              className={styles.input}
              type="text"
              value={form.title}
              onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
              placeholder="Например, Изменение дедлайна"
              disabled={isSubmitting}
            />
          </label>

          <label className={styles.field}>
            <div className={styles.fieldLabel}>Текст объявления</div>
            <textarea
              className={styles.textarea}
              value={form.content}
              onChange={(event) => setForm((prev) => ({ ...prev, content: event.target.value }))}
              placeholder={`Текст от ${user?.email ?? "преподавателя"}`}
              disabled={isSubmitting}
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

      {canManageAnnouncements && deletingId && (
        <ModalShell title="Удалить объявление" onClose={closeDeleteModal} disabled={isSubmitting}>
          <div className={styles.modalText}>Вы точно хотите удалить объявление? Это действие нельзя отменить.</div>
          <div className={styles.modalActions}>
            <button className={styles.secondaryButton} type="button" onClick={closeDeleteModal} disabled={isSubmitting}>
              Отмена
            </button>
            <button className={styles.dangerButton} type="button" onClick={() => void submitDeleteAnnouncement()} disabled={isSubmitting}>
              {isSubmitting ? "Удаляем..." : "Удалить"}
            </button>
          </div>
        </ModalShell>
      )}
    </div>
  )
}
