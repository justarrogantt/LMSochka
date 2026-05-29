import { useEffect, useState } from "react"
import { useNavigate, useOutletContext, useParams } from "react-router-dom"
import ActionsIcon from "../../assets/icons/classes/actions.svg?react"
import TrashIcon from "../../assets/icons/classes/trash.svg?react"
import Loading from "../../components/Loading/Loading"
import Modal from "../../components/Modal/Modal"
import Pagination from "../../components/Pagination/Pagination"
import { useToast } from "../../components/Toast/ToastProvider"
import { ApiSilentError } from "../../services/api"
import { formatDateTime, truncate } from "../../services/helpers"
import type { ClassLayoutContext } from "../../layouts/ClassLayout/ClassLayout"
import {
  createAssignment,
  deleteAssignment,
  listAssignments,
  updateAssignment,
  type AssignmentDto
} from "./services/assignments.api"
import styles from "./AssignmentsPage.module.css"

const LIMIT = 10

type FormState = {
  title: string
  description: string
  material_url: string
  due_at: string
  max_grade: string
}

const EMPTY_FORM: FormState = {
  title: "",
  description: "",
  material_url: "",
  due_at: "",
  max_grade: "100"
}

type AssignmentCardProps = {
  item: AssignmentDto
  canManage: boolean
  onOpen: () => void
  onEdit: () => void
  onDelete: () => void
}

// Карточка-превью задания в списке
function AssignmentCard({ item, canManage, onOpen, onEdit, onDelete }: AssignmentCardProps) {
  return (
    <div className={styles.card} onClick={onOpen}>
      <div className={styles.cardHead}>
        <div className={styles.cardTitle}>{truncate(item.title, 80)}</div>
        {canManage && (
          <div className={styles.cardActions} onClick={(e) => e.stopPropagation()}>
            <button className={styles.iconButton} type="button" aria-label="Редактировать задание" onClick={onEdit}>
              <ActionsIcon className={styles.icon} />
            </button>
            <button className={styles.iconButton} type="button" aria-label="Удалить задание" onClick={onDelete}>
              <TrashIcon className={styles.icon} />
            </button>
          </div>
        )}
      </div>

      {item.description && <div className={styles.content}>{truncate(item.description, 200)}</div>}

      <div className={styles.meta}>
        {item.due_at && <div>до {formatDateTime(item.due_at)}</div>}
        <div>до {item.max_grade} баллов</div>
      </div>
    </div>
  )
}

export default function AssignmentsPage() {
  const { classDetail } = useOutletContext<ClassLayoutContext>()
  const { classId } = useParams<{ classId: string }>()
  const navigate = useNavigate()
  const showToast = useToast()

  // Задания текущей страницы
  const [items, setItems] = useState<AssignmentDto[]>([])

  // Лоадер страницы
  const [isLoading, setIsLoading] = useState(true)

  // Пагинация: текущая страница и общее число заданий
  const [currentPage, setCurrentPage] = useState(1)
  const [totalItems, setTotalItems] = useState(0)

  // Id редактируемого задания (null — режим создания)
  const [editingId, setEditingId] = useState<number | null>(null)

  // Открыта ли модалка формы (создание/редактирование)
  const [isFormOpen, setIsFormOpen] = useState(false)

  // Id задания, выбранного для удаления
  const [deletingId, setDeletingId] = useState<number | null>(null)

  // Флаг отправки запроса
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Поля формы и их исходное состояние (для блокировки кнопки до изменений)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [initialForm, setInitialForm] = useState<FormState>(EMPTY_FORM)

  // Загрузка страницы заданий
  async function loadPage(page: number) {
    if (!classDetail?.id) return
    setIsLoading(true)
    try {
      const data = await listAssignments(classDetail.id, page, LIMIT)
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
  function openEditModal(item: AssignmentDto) {
    const saved: FormState = {
      title: item.title,
      description: item.description,
      material_url: item.material_url ?? "",
      due_at: item.due_at ? item.due_at.slice(0, 16) : "",
      max_grade: String(item.max_grade)
    }
    setForm(saved)
    setInitialForm(saved)
    setEditingId(item.id)
    setIsFormOpen(true)
  }

  // Обновление одного поля формы
  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  // Собрать тело запроса из полей формы
  function buildBody() {
    return {
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      material_url: form.material_url.trim() || null,
      due_at: form.due_at || null,
      max_grade: Number(form.max_grade)
    }
  }

  // Создание задания — перезагружаем первую страницу (меняется пагинация)
  async function submitCreate() {
    if (!classDetail?.id) return

    const body = buildBody()
    closeFormModal()
    setIsSubmitting(true)

    try {
      await createAssignment(classDetail.id, body)
      showToast({ type: "neutral", message: "Задание создано" })
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
    const body = buildBody()
    const prevItems = items

    setItems((prev) =>
      prev.map((it) =>
        it.id === id
          ? { ...it, title: body.title, description: body.description ?? "", material_url: body.material_url, due_at: body.due_at, max_grade: body.max_grade }
          : it
      )
    )
    closeFormModal()
    setIsSubmitting(true)

    try {
      const updated = await updateAssignment(classDetail.id, id, body)
      setItems((prev) => prev.map((it) => (it.id === updated.id ? updated : it)))
      showToast({ type: "neutral", message: "Задание обновлено" })
    } catch (error) {
      setItems(prevItems)
      showToast({ type: "error", message: (error as Error).message })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Удаление задания — перезагружаем страницу (меняется пагинация)
  async function submitDelete() {
    if (!classDetail?.id || !deletingId || isSubmitting) return
    setIsSubmitting(true)

    try {
      await deleteAssignment(classDetail.id, deletingId)
      setDeletingId(null)
      showToast({ type: "neutral", message: "Задание удалено" })
      const nextPage = items.length === 1 && currentPage > 1 ? currentPage - 1 : currentPage
      void loadPage(nextPage)
    } catch (error) {
      showToast({ type: "error", message: (error as Error).message })
    } finally {
      setIsSubmitting(false)
    }
  }

  const isFilled = form.title.trim().length > 0 && Number(form.max_grade) > 0
  const isChanged =
    form.title.trim() !== initialForm.title.trim() ||
    form.description.trim() !== initialForm.description.trim() ||
    form.material_url.trim() !== initialForm.material_url.trim() ||
    form.due_at !== initialForm.due_at ||
    form.max_grade !== initialForm.max_grade
  const canSubmit = !isSubmitting && isFilled && (editingId === null || isChanged)
  const canManage = classDetail?.user_role !== "student"

  return (
    <div className={styles.page}>
      <div className={styles.pageHead}>
        <div className={styles.titleBlock}>
          <div className={styles.title}>Задания</div>
          <div className={styles.text}>Учебные задания и дедлайны курса.</div>
        </div>

        {canManage && (
          <button className={styles.primaryButton} type="button" onClick={openCreateModal}>
            Создать задание
          </button>
        )}
      </div>

      {isLoading && <Loading />}

      {!isLoading && items.length > 0 && (
        <div className={styles.cards}>
          {items.map((item) => (
            <AssignmentCard
              key={item.id}
              item={item}
              canManage={canManage}
              onOpen={() => navigate(`/classes/${classId}/assignments/${item.id}`)}
              onEdit={() => openEditModal(item)}
              onDelete={() => setDeletingId(item.id)}
            />
          ))}
        </div>
      )}

      {!isLoading && items.length === 0 && <div className={styles.emptyMessage}>Заданий пока нет</div>}

      <Pagination page={currentPage} total={totalItems} limit={LIMIT} onChange={(p) => void loadPage(p)} />

      {canManage && isFormOpen && (
        <Modal title={editingId ? "Редактировать задание" : "Создать задание"} onClose={closeFormModal} disabled={isSubmitting}>
          <label className={styles.field}>
            <div className={styles.fieldLabel}>Название</div>
            <input
              className={styles.input}
              type="text"
              value={form.title}
              onChange={(e) => setField("title", e.target.value)}
              placeholder="Например, Домашнее задание №1"
              disabled={isSubmitting}
            />
          </label>

          <label className={styles.field}>
            <div className={styles.fieldLabel}>Описание <span className={styles.fieldOptional}>(необязательно)</span></div>
            <textarea
              className={styles.textarea}
              value={form.description}
              onChange={(e) => setField("description", e.target.value)}
              placeholder="Условие задания, что нужно сделать..."
              disabled={isSubmitting}
            />
          </label>

          <label className={styles.field}>
            <div className={styles.fieldLabel}>Ссылка на материал <span className={styles.fieldOptional}>(необязательно)</span></div>
            <input
              className={styles.input}
              type="url"
              value={form.material_url}
              onChange={(e) => setField("material_url", e.target.value)}
              placeholder="https://..."
              disabled={isSubmitting}
            />
          </label>

          <div className={styles.fieldRow}>
            <label className={styles.field}>
              <div className={styles.fieldLabel}>Дедлайн <span className={styles.fieldOptional}>(необязательно)</span></div>
              <input
                className={styles.input}
                type="datetime-local"
                value={form.due_at}
                onChange={(e) => setField("due_at", e.target.value)}
                disabled={isSubmitting}
              />
            </label>

            <label className={styles.field}>
              <div className={styles.fieldLabel}>Максимальный балл</div>
              <input
                className={styles.input}
                type="number"
                min="1"
                value={form.max_grade}
                onChange={(e) => setField("max_grade", e.target.value)}
                placeholder="100"
                disabled={isSubmitting}
              />
            </label>
          </div>

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
              {isSubmitting ? "Сохраняем..." : editingId ? "Сохранить" : "Создать"}
            </button>
          </div>
        </Modal>
      )}

      {canManage && deletingId && (
        <Modal title="Удалить задание" onClose={closeDeleteModal} disabled={isSubmitting}>
          <div className={styles.modalText}>Вы точно хотите удалить задание? Это действие нельзя отменить.</div>
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
