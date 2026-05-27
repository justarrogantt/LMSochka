import { type ReactNode, useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { useOutletContext } from "react-router-dom"
import styles from "./ClassAnnouncementsPage.module.css"
import ActionsIcon from "../../assets/icons/classes/actions.svg?react"
import CloseIcon from "../../assets/icons/classes/close.svg?react"
import { useToast } from "../../components/Toast/ToastProvider"
import { useAuth } from "../../contexts/AuthContext"
import { ApiError, ApiSilentError } from "../../services/api"
import { createAnnouncement, listAnnouncements, type AnnouncementDto } from "../../services/announcement.api"
import type { ClassLayoutContext } from "../ClassLayout/ClassLayout"

type AnnouncementCard = {
  id: number
  title: string
  author: string
  date: string
  content: string
}

type AnnouncementsState = {
  items: AnnouncementCard[]
  isLoading: boolean
  isCreateModalOpen: boolean
  isSubmitting: boolean
  form: {
    title: string
    content: string
  }
}

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

function mapServerAnnouncement(dto: AnnouncementDto): AnnouncementCard {
  return {
    id: dto.id,
    title: dto.title,
    author: dto.author.email,
    date: "только что",
    content: dto.content
  }
}

export default function ClassAnnouncementsPage() {
  const { classDetail } = useOutletContext<ClassLayoutContext>()
  const { user } = useAuth()
  const showToast = useToast()
  const [state, setState] = useState<AnnouncementsState>({
    items: [],
    isLoading: true,
    isCreateModalOpen: false,
    isSubmitting: false,
    form: {
      title: "",
      content: ""
    }
  })

  useEffect(() => {
    async function loadAnnouncements() {
      if (!classDetail?.id) {
        setState((prev) => ({ ...prev, isLoading: false }))
        return
      }

      try {
        const page = await listAnnouncements(classDetail.id)
        setState((prev) => ({
          ...prev,
          items: page.items.map(mapServerAnnouncement),
          isLoading: false
        }))
      } catch (error) {
        setState((prev) => ({ ...prev, isLoading: false }))
        if (error instanceof ApiSilentError) return
        showToast({
          type: "error",
          message: error instanceof ApiError ? error.message : "Не удалось загрузить объявления",
          offsetBottom: 30
        })
      }
    }

    void loadAnnouncements()
  }, [classDetail?.id])

  function closeCreateModal() {
    if (state.isSubmitting) return
    setState((prev) => ({
      ...prev,
      isCreateModalOpen: false,
      form: {
        title: "",
        content: ""
      }
    }))
  }

  async function submitCreateAnnouncement() {
    if (!classDetail?.id) return

    const title = state.form.title.trim()
    const content = state.form.content.trim()
    if (!title || !content) return

    const optimisticItem: AnnouncementCard = {
      id: -Date.now(),
      title,
      content,
      author: user?.email ?? "you@example.com",
      date: "только что"
    }
    const prevItems = state.items

    setState((prev) => ({
      ...prev,
      items: [optimisticItem, ...prev.items],
      isSubmitting: true,
      isCreateModalOpen: false,
      form: { title: "", content: "" }
    }))

    try {
      const created = await createAnnouncement(classDetail.id, { title, content })
      setState((prev) => ({
        ...prev,
        items: prev.items.map((item) => (item.id === optimisticItem.id ? mapServerAnnouncement(created) : item)),
        isSubmitting: false
      }))
      showToast({ type: "neutral", message: "Объявление создано", offsetBottom: 30 })
    } catch (error) {
      setState((prev) => ({ ...prev, items: prevItems, isSubmitting: false }))
      if (error instanceof ApiSilentError) return
      showToast({
        type: "error",
        message: error instanceof ApiError ? error.message : "Не удалось создать объявление",
        offsetBottom: 30
      })
    }
  }

  const canSubmit = state.form.title.trim().length > 0 && state.form.content.trim().length > 0 && !state.isSubmitting

  return (
    <div className={styles.page}>
      <div className={styles.pageHead}>
        <div className={styles.titleBlock}>
          <div className={styles.title}>Объявления</div>
          <div className={styles.text}>Новости и важные сообщения для участников курса.</div>
        </div>

        <button className={styles.primaryButton} type="button" onClick={() => setState((prev) => ({ ...prev, isCreateModalOpen: true }))}>
          Создать объявление
        </button>
      </div>

      {!state.isLoading && (
        <div className={styles.cards}>
          {state.items.map((item) => (
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
      )}

      {state.isCreateModalOpen && (
        <ModalShell title="Создать объявление" onClose={closeCreateModal}>
          <label className={styles.field}>
            <div className={styles.fieldLabel}>Заголовок</div>
            <input
              className={styles.input}
              type="text"
              value={state.form.title}
              onChange={(event) => setState((prev) => ({ ...prev, form: { ...prev.form, title: event.target.value } }))}
              placeholder="Например, Изменение дедлайна"
            />
          </label>

          <label className={styles.field}>
            <div className={styles.fieldLabel}>Текст объявления</div>
            <textarea
              className={styles.textarea}
              value={state.form.content}
              onChange={(event) => setState((prev) => ({ ...prev, form: { ...prev.form, content: event.target.value } }))}
              placeholder={`Текст от ${user?.email ?? "преподавателя"}`}
            />
          </label>

          <div className={styles.modalActions}>
            <button className={styles.secondaryButton} type="button" onClick={closeCreateModal} disabled={state.isSubmitting}>
              Отмена
            </button>
            <button className={styles.primaryButton} type="button" onClick={() => void submitCreateAnnouncement()} disabled={!canSubmit}>
              {state.isSubmitting ? "Публикуем..." : "Опубликовать"}
            </button>
          </div>
        </ModalShell>
      )}
    </div>
  )
}
