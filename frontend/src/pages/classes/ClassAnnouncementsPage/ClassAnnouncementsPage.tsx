import { useEffect, useState } from "react"
import { useNavigate, useOutletContext, useParams } from "react-router-dom"
import AddIcon from "../../../assets/icons/classes/add.svg?react"
import DeleteIcon from "../../../assets/icons/classes/delete.svg?react"
import EditIcon from "../../../assets/icons/classes/settings.svg?react"
import Loading from "../../../components/Loading/Loading"
import Modal from "../../../components/Modal/Modal"
import Pagination from "../../../components/Pagination/Pagination"
import { useToast } from "../../../components/Toast/ToastProvider"
import { ApiSilentError } from "../../../services/api"
import { formatDateTime, truncate } from "../../../services/helpers"
import type { ClassLayoutContext } from "../../../layouts/ClassLayout/ClassLayout"
import {
  createAnnouncement,
  deleteAnnouncement,
  listAnnouncements,
  updateAnnouncement,
  type AnnouncementDto
} from "./services/announcement.api"
import styles from "./ClassAnnouncementsPage.module.css"

const LIMIT = 10

type FormState = {
  title: string
  content: string
}

const EMPTY_FORM: FormState = { title: "", content: "" }

type AnnouncementCardProps = {
  item: AnnouncementDto
  canManage: boolean
  onOpen: () => void
  onEdit: () => void
  onDelete: () => void
}

// Карточка-превью объявления в списке
function AnnouncementCard({ item, canManage, onOpen, onEdit, onDelete }: AnnouncementCardProps) {
  return (
    <div className={styles.card} onClick={onOpen}>
      <div className={styles.cardHead}>
        <div className={styles.cardTitle}>{truncate(item.title, 80)}</div>
        {canManage && (
          <div className={styles.cardActions} onClick={(e) => e.stopPropagation()}>
            <button className={styles.iconButton} type="button" aria-label="Редактировать объявление" onClick={onEdit}>
              <EditIcon className={styles.icon} />
            </button>
            <button className={styles.iconButton} type="button" aria-label="Удалить объявление" onClick={onDelete}>
              <DeleteIcon className={styles.icon} />
            </button>
          </div>
        )}
      </div>

      <div className={styles.content}>{truncate(item.content, 200)}</div>

      <div className={styles.meta}>
        <div>{item.author.email}</div>
        <div>{formatDateTime(item.created_at)}</div>
      </div>
    </div>
  )
}

export default function ClassAnnouncementsPage() {
  const { classDetail } = useOutletContext<ClassLayoutContext>()
  const { classId } = useParams<{ classId: string }>()
  const navigate = useNavigate()
  const showToast = useToast()

  // Объявления текущей страницы
  const [items, setItems] = useState<AnnouncementDto[]>([])

  // Лоадер страницы
  const [isLoading, setIsLoading] = useState(true)

  // Пагинация: текущая страница и общее число объявлений
  const [currentPage, setCurrentPage] = useState(1)
  const [totalItems, setTotalItems] = useState(0)

  // Id редактируемого объявления (null — режим создания)
  const [editingId, setEditingId] = useState<number | null>(null)

  // Открыта ли модалка формы (создание/редактирование)
  const [isFormOpen, setIsFormOpen] = useState(false)

  // Id объявления, выбранного для удаления
  const [deletingId, setDeletingId] = useState<number | null>(null)

  // Флаг отправки запроса
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Поля формы и их исходное состояние (для блокировки кнопки до изменений)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [initialForm, setInitialForm] = useState<FormState>(EMPTY_FORM)

  // Загрузка страницы объявлений
  async function loadPage(page: number) {
    if (!classDetail?.id) return
    setIsLoading(true)
    try {
      const data = await listAnnouncements(classDetail.id, page, LIMIT)
      setItems(data.items)
      setTotalItems(data.total)
      setCurrentPage(page)
    } catch (error) {
      if (error instanceof ApiSilentError) return
      showToast({ type: "error", message: (error as Error).message })
    } finally {
      setIsLoading(false)
    }
  }

  // Начальная загрузка при смене класса
  useEffect(() => {
    void loadPage(1)
  }, [classDetail?.id])

  // Закрытие модалки формы
  function closeFormModal() {
    if (isSubmitting) return
    setIsFormOpen(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
    setInitialForm(EMPTY_FORM)
  }

  // Закрытие модалки удаления
  function closeDeleteModal() {
    if (isSubmitting) return
    setDeletingId(null)
  }

  // Открытие модалки создания
  function openCreateModal() {
    setForm(EMPTY_FORM)
    setInitialForm(EMPTY_FORM)
    setEditingId(null)
    setIsFormOpen(true)
  }

  // Открытие модалки редактирования
  function openEditModal(item: AnnouncementDto) {
    const saved = { title: item.title, content: item.content }
    setForm(saved)
    setInitialForm(saved)
    setEditingId(item.id)
    setIsFormOpen(true)
  }

  // Создание объявления — перезагружаем первую страницу (меняется пагинация)
  async function submitCreate() {
    if (!classDetail?.id) return

    const title = form.title.trim()
    const content = form.content.trim()
    closeFormModal()
    setIsSubmitting(true)

    try {
      await createAnnouncement(classDetail.id, { title, content })
      showToast({ type: "neutral", message: "Объявление создано" })
      void loadPage(1)
    } catch (error) {
      showToast({ type: "error", message: (error as Error).message })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Редактирование — оптимистично обновляем карточку без перезагрузки, при ошибке откат
  async function submitEdit() {
    if (!classDetail?.id || !editingId) return

    const id = editingId
    const nextTitle = form.title.trim()
    const nextContent = form.content.trim()
    const prevItems = items

    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, title: nextTitle, content: nextContent } : it)))
    closeFormModal()
    setIsSubmitting(true)

    try {
      const updated = await updateAnnouncement(classDetail.id, id, { title: nextTitle, content: nextContent })
      setItems((prev) => prev.map((it) => (it.id === updated.id ? updated : it)))
      showToast({ type: "neutral", message: "Объявление обновлено" })
    } catch (error) {
      setItems(prevItems)
      showToast({ type: "error", message: (error as Error).message })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Удаление объявления — перезагружаем страницу (меняется пагинация)
  async function submitDelete() {
    if (!classDetail?.id || !deletingId || isSubmitting) return
    setIsSubmitting(true)

    try {
      await deleteAnnouncement(classDetail.id, deletingId)
      setDeletingId(null)
      showToast({ type: "neutral", message: "Объявление удалено" })
      const nextPage = items.length === 1 && currentPage > 1 ? currentPage - 1 : currentPage
      void loadPage(nextPage)
    } catch (error) {
      showToast({ type: "error", message: (error as Error).message })
    } finally {
      setIsSubmitting(false)
    }
  }

  const isFilled = form.title.trim().length > 0 && form.content.trim().length > 0
  const isChanged = form.title.trim() !== initialForm.title.trim() || form.content.trim() !== initialForm.content.trim()
  const canSubmit = !isSubmitting && isFilled && (editingId === null || isChanged)
  const canManage = classDetail?.permissions.can_create_announcement ?? false

  return (
    <div className={styles.page}>
      <div className={styles.pageHead}>
        <div className={styles.titleBlock}>
          <div className={styles.title}>Объявления</div>
          <div className={styles.text}>Новости и важные сообщения для участников курса.</div>
        </div>

        {canManage && (
          <button className={styles.primaryButton} type="button" onClick={openCreateModal}>
            <AddIcon className={styles.buttonIcon} />
            Создать объявление
          </button>
        )}
      </div>

      {isLoading && <Loading />}

      {!isLoading && items.length > 0 && (
        <div className={styles.cards}>
          {items.map((item) => (
            <AnnouncementCard
              key={item.id}
              item={item}
              canManage={canManage}
              onOpen={() => navigate(`/classes/${classId}/announcements/${item.id}`)}
              onEdit={() => openEditModal(item)}
              onDelete={() => setDeletingId(item.id)}
            />
          ))}
        </div>
      )}

      {!isLoading && items.length === 0 && <div className={styles.emptyMessage}>Объявлений пока нет</div>}

      <Pagination page={currentPage} total={totalItems} limit={LIMIT} onChange={(p) => void loadPage(p)} />

      {canManage && isFormOpen && (
        <Modal title={editingId ? "Редактировать объявление" : "Создать объявление"} onClose={closeFormModal} disabled={isSubmitting} size="lg">
          <label className={styles.field}>
            <div className={styles.fieldLabel}>Заголовок</div>
            <input
              className={styles.input}
              type="text"
              value={form.title}
              onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
              placeholder="Например, Изменение дедлайна"
              disabled={isSubmitting}
            />
          </label>

          <label className={styles.field}>
            <div className={styles.fieldLabel}>Текст объявления</div>
            <textarea
              className={styles.textarea}
              value={form.content}
              onChange={(e) => setForm((prev) => ({ ...prev, content: e.target.value }))}
              placeholder="Текст объявления для участников курса"
              disabled={isSubmitting}
            />
          </label>

          <div className={styles.modalActions}>
            <button className={styles.secondaryButton} type="button" onClick={closeFormModal} disabled={isSubmitting}>
              Отмена
            </button>
            <button
              className={styles.primaryButton}
              type="button"
              onClick={() => void (editingId ? submitEdit() : submitCreate())}
              disabled={!canSubmit}
            >
              {isSubmitting ? "Сохраняем..." : editingId ? "Сохранить" : "Опубликовать"}
            </button>
          </div>
        </Modal>
      )}

      {canManage && deletingId && (
        <Modal title="Удалить объявление" onClose={closeDeleteModal} disabled={isSubmitting}>
          <div className={styles.modalText}>Вы точно хотите удалить объявление? Это действие нельзя отменить.</div>
          <div className={styles.modalActions}>
            <button className={styles.secondaryButton} type="button" onClick={closeDeleteModal} disabled={isSubmitting}>
              Отмена
            </button>
            <button className={styles.dangerButton} type="button" onClick={() => void submitDelete()} disabled={isSubmitting}>
              {isSubmitting ? "Удаляем..." : "Удалить"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
