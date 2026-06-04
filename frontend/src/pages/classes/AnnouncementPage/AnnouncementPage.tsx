import { useEffect, useState } from "react"
import { AnimatePresence } from "framer-motion"
import { useNavigate, useParams } from "react-router-dom"
import ArrowIcon from "../../../assets/icons/classes/arrow.svg?react"
import DeleteIcon from "../../../assets/icons/classes/delete.svg?react"
import EditIcon from "../../../assets/icons/classes/settings.svg?react"
import Modal from "../../../components/Modal/Modal"
import { useToast } from "../../../components/Toast/ToastProvider"
import { ApiError } from "../../../services/api"
import { formatDateTime } from "../../../services/helpers"
import {
  getAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  type AnnouncementDto
} from "../ClassAnnouncementsPage/services/announcement.api"
import SkeletonLoader from "./SkeletonLoader/SkeletonLoader"
import styles from "./AnnouncementPage.module.css"

type FormState = {
  title: string
  content: string
}

export default function AnnouncementPage() {
  const { classId, announcementId } = useParams<{ classId: string; announcementId: string }>()
  const navigate = useNavigate()
  const showToast = useToast()

  // Данные объявления
  const [announcement, setAnnouncement] = useState<AnnouncementDto | null>(null)

  // Лоадер страницы
  const [isLoading, setIsLoading] = useState(true)

  // Активная модалка
  const [activeModal, setActiveModal] = useState<"edit" | "delete" | null>(null)

  // Флаг отправки запроса
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Поля формы редактирования и начальное состояние для сравнения
  const [form, setForm] = useState<FormState>({ title: "", content: "" })
  const [initialForm, setInitialForm] = useState<FormState>({ title: "", content: "" })

  const parsedClassId = Number(classId)
  const parsedAnnouncementId = Number(announcementId)

  // Загрузка объявления по ID
  useEffect(() => {
    async function load() {
      if (!parsedClassId || !parsedAnnouncementId) return

      try {
        const data = await getAnnouncement(parsedClassId, parsedAnnouncementId)
        setAnnouncement(data)
      } catch (error) {
        if (error instanceof ApiError) {
          showToast({ type: "error", message: error.message })
          navigate(`/classes/${classId}/announcements`, { replace: true })
          return
        }
        throw error
      } finally {
        setIsLoading(false)
      }
    }

    void load()
  }, [parsedClassId, parsedAnnouncementId])

  // Переход к списку объявлений
  function goBack() {
    navigate(`/classes/${classId}/announcements`)
  }

  // Закрытие активной модалки
  function closeModal() {
    if (isSubmitting) return
    setActiveModal(null)
  }

  // Открытие модалки редактирования
  function openEditModal() {
    if (!announcement) return
    const saved = { title: announcement.title, content: announcement.content }
    setForm(saved)
    setInitialForm(saved)
    setActiveModal("edit")
  }

  // Оптимистичное редактирование с роллбэком при ошибке
  async function submitEdit() {
    if (!announcement || isSubmitting) return

    const nextTitle = form.title.trim()
    const nextContent = form.content.trim()
    if (!nextTitle || !nextContent) return

    const prev = announcement
    setAnnouncement({ ...announcement, title: nextTitle, content: nextContent })
    setActiveModal(null)
    setIsSubmitting(true)

    try {
      const updated = await updateAnnouncement(parsedClassId, parsedAnnouncementId, { title: nextTitle, content: nextContent })
      setAnnouncement(updated)
      showToast({ type: "neutral", message: "Объявление обновлено" })
    } catch (error) {
      setAnnouncement(prev)
      if (error instanceof ApiError) {
        showToast({ type: "error", message: error.message })
        return
      }
      throw error
    } finally {
      setIsSubmitting(false)
    }
  }

  // Удаление с навигацией назад при успехе
  async function submitDelete() {
    if (isSubmitting) return

    setIsSubmitting(true)

    try {
      await deleteAnnouncement(parsedClassId, parsedAnnouncementId)
      showToast({ type: "neutral", message: "Объявление удалено" })
      navigate(`/classes/${classId}/announcements`, { replace: true })
    } catch (error) {
      if (error instanceof ApiError) {
        showToast({ type: "error", message: error.message })
        setIsSubmitting(false)
        return
      }
      throw error
    }
  }

  const canEdit = announcement?.can_edit ?? false
  const canDelete = announcement?.can_delete ?? false
  const isFormChanged = form.title.trim() !== initialForm.title.trim() || form.content.trim() !== initialForm.content.trim()
  const canSave = form.title.trim().length > 0 && form.content.trim().length > 0 && isFormChanged && !isSubmitting

  return (
    <div className={styles.page}>
      <div className={styles.pageHead}>
        <button className={styles.backButton} type="button" onClick={goBack}>
          <ArrowIcon className={styles.backIcon} />
          Все объявления
        </button>

        {!isLoading && announcement && (canEdit || canDelete) && (
          <div className={styles.pageActions}>
            {canEdit && (
              <button className={styles.secondaryButton} type="button" onClick={openEditModal}>
                <EditIcon className={styles.buttonIcon} />
                Редактировать
              </button>
            )}
            {canDelete && (
              <button className={styles.dangerButton} type="button" onClick={() => setActiveModal("delete")}>
                <DeleteIcon className={styles.buttonIcon} />
                Удалить
              </button>
            )}
          </div>
        )}
      </div>

      {isLoading && <SkeletonLoader />}

      {!isLoading && announcement && (
        <div className={styles.card}>
          <div className={styles.title}>{announcement.title}</div>

          <div className={styles.content}>{announcement.content}</div>

          <div className={styles.meta}>
            <div>{announcement.author.email}</div>
            <div>{formatDateTime(announcement.created_at)}</div>
            {announcement.updated_at && announcement.updated_at !== announcement.created_at && (
              <div>изменено {formatDateTime(announcement.updated_at)}</div>
            )}
          </div>
        </div>
      )}

      <AnimatePresence>
        {canEdit && activeModal === "edit" && (
        <Modal title="Редактировать объявление" onClose={closeModal} disabled={isSubmitting} size="lg">
          <label className={styles.field}>
            <div className={styles.fieldLabel}>Заголовок</div>
            <input
              className={styles.input}
              type="text"
              value={form.title}
              onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
              disabled={isSubmitting}
            />
          </label>

          <label className={styles.field}>
            <div className={styles.fieldLabel}>Текст объявления</div>
            <textarea
              className={styles.textarea}
              value={form.content}
              onChange={(e) => setForm((prev) => ({ ...prev, content: e.target.value }))}
              disabled={isSubmitting}
            />
          </label>

          <div className={styles.modalActions}>
            <button className={styles.secondaryButton} type="button" onClick={closeModal} disabled={isSubmitting}>
              Отмена
            </button>
            <button className={styles.primaryButton} type="button" onClick={() => void submitEdit()} disabled={!canSave}>
              {isSubmitting ? "Сохраняем..." : "Сохранить"}
            </button>
          </div>
        </Modal>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {canDelete && activeModal === "delete" && (
        <Modal title="Удалить объявление" onClose={closeModal} disabled={isSubmitting}>
          <div className={styles.modalText}>Вы точно хотите удалить объявление? Это действие нельзя отменить.</div>
          <div className={styles.modalActions}>
            <button className={styles.secondaryButton} type="button" onClick={closeModal} disabled={isSubmitting}>
              Отмена
            </button>
            <button className={styles.dangerButton} type="button" onClick={() => void submitDelete()} disabled={isSubmitting}>
              {isSubmitting ? "Удаляем..." : "Удалить"}
            </button>
          </div>
        </Modal>
        )}
      </AnimatePresence>
    </div>
  )
}
