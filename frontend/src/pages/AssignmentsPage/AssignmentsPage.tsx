import { type ReactNode, useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { useNavigate, useOutletContext, useParams } from "react-router-dom"
import ActionsIcon from "../../assets/icons/classes/actions.svg?react"
import CloseIcon from "../../assets/icons/classes/close.svg?react"
import TrashIcon from "../../assets/icons/classes/trash.svg?react"
import Loading from "../../components/Loading/Loading"
import Pagination from "../../components/Pagination/Pagination"
import { useToast } from "../../components/Toast/ToastProvider"
import { ApiSilentError } from "../../services/api"
import { formatDateTime, truncate } from "../../services/helpers"
import type { ClassLayoutContext } from "../ClassLayout/ClassLayout"
import {
  createAssignment,
  deleteAssignment,
  listAssignments,
  updateAssignment,
  type AssignmentDto
} from "./services/assignments.api"
import styles from "./AssignmentsPage.module.css"

const LIMIT = 10

type AssignmentCard = {
  id: number
  title: string
  description: string
  due_at: string | null
  max_grade: number
}

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

type ModalShellProps = {
  title: string
  onClose: () => void
  children: ReactNode
  disabled?: boolean
}

// Базовая обёртка модального окна
function ModalShell({ title, onClose, children, disabled }: ModalShellProps) {
  return createPortal(
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
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

// Маппинг ответа бэка в карточку задания
function mapServerAssignment(dto: AssignmentDto): AssignmentCard {
  return {
    id: dto.id,
    title: dto.title,
    description: dto.description,
    due_at: dto.due_at ? formatDateTime(dto.due_at) : null,
    max_grade: dto.max_grade
  }
}

export default function AssignmentsPage() {
  const { classDetail } = useOutletContext<ClassLayoutContext>()
  const { classId } = useParams<{ classId: string }>()
  const navigate = useNavigate()
  const showToast = useToast()

  const [items, setItems] = useState<AssignmentCard[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalItems, setTotalItems] = useState(0)
  const [activeModal, setActiveModal] = useState<"create" | "edit" | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [initialForm, setInitialForm] = useState<FormState>(EMPTY_FORM)

  // Загрузка страницы заданий
  async function loadPage(page: number) {
    if (!classDetail?.id) return
    setIsLoading(true)
    try {
      const data = await listAssignments(classDetail.id, page, LIMIT)
      setItems(data.items.map(mapServerAssignment))
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

  // Закрытие модалки создания/редактирования
  function closeFormModal() {
    if (isSubmitting) return
    setActiveModal(null)
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
    setEditingId(null)
    setActiveModal("create")
  }

  // Открытие модалки редактирования
  function openEditModal(item: AssignmentCard) {
    const saved: FormState = {
      title: item.title,
      description: item.description,
      material_url: "",
      due_at: "",
      max_grade: String(item.max_grade)
    }
    setForm(saved)
    setInitialForm(saved)
    setEditingId(item.id)
    setActiveModal("edit")
  }

  // Обновление одного поля формы
  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  // Сохранение задания (создание или редактирование)
  async function submitAssignment() {
    if (!classDetail?.id) return

    const title = form.title.trim()
    const maxGrade = Number(form.max_grade)
    if (!title || maxGrade <= 0) return

    setIsSubmitting(true)

    try {
      const body = {
        title,
        description: form.description.trim() || undefined,
        material_url: form.material_url.trim() || null,
        due_at: form.due_at || null,
        max_grade: maxGrade
      }

      if (editingId) {
        await updateAssignment(classDetail.id, editingId, body)
        showToast({ type: "neutral", message: "Задание обновлено" })
        void loadPage(currentPage)
      } else {
        await createAssignment(classDetail.id, body)
        showToast({ type: "neutral", message: "Задание создано" })
        void loadPage(1)
      }

      setActiveModal(null)
      setEditingId(null)
      setForm(EMPTY_FORM)
    } catch (error) {
      showToast({ type: "error", message: (error as Error).message })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Удаление задания
  async function submitDeleteAssignment() {
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

  const isFormFilled = form.title.trim().length > 0 && Number(form.max_grade) > 0
  const isFormChanged =
    form.title.trim() !== initialForm.title.trim() ||
    form.description.trim() !== initialForm.description.trim() ||
    form.material_url.trim() !== "" ||
    form.due_at !== "" ||
    form.max_grade !== initialForm.max_grade
  const canSubmit = !isSubmitting && isFormFilled && (editingId === null || isFormChanged)
  const canManageAssignments = classDetail?.user_role !== "student"

  return (
    <div className={styles.page}>
      <div className={styles.pageHead}>
        <div className={styles.titleBlock}>
          <div className={styles.title}>Задания</div>
          <div className={styles.text}>Учебные задания и дедлайны курса.</div>
        </div>

        {canManageAssignments && (
          <button className={styles.primaryButton} type="button" onClick={openCreateModal}>
            Создать задание
          </button>
        )}
      </div>

      {isLoading && <Loading />}

      {!isLoading && items.length > 0 && (
        <div className={styles.cards}>
          {items.map((item) => (
            <div
              className={styles.card}
              key={item.id}
              onClick={() => navigate(`/classes/${classId}/assignments/${item.id}`)}
            >
              <div className={styles.cardHead}>
                <div className={styles.cardTitle}>{truncate(item.title, 80)}</div>
                {canManageAssignments && (
                  <div className={styles.cardActions} onClick={(e) => e.stopPropagation()}>
                    <button
                      className={styles.iconButton}
                      type="button"
                      aria-label="Редактировать задание"
                      onClick={() => openEditModal(item)}
                    >
                      <ActionsIcon className={styles.icon} />
                    </button>
                    <button
                      className={styles.iconButton}
                      type="button"
                      aria-label="Удалить задание"
                      onClick={() => setDeletingId(item.id)}
                    >
                      <TrashIcon className={styles.icon} />
                    </button>
                  </div>
                )}
              </div>

              {item.description && (
                <div className={styles.content}>{truncate(item.description, 200)}</div>
              )}

              <div className={styles.meta}>
                {item.due_at && <div>до {item.due_at}</div>}
                <div>до {item.max_grade} баллов</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!isLoading && items.length === 0 && (
        <div className={styles.emptyMessage}>Заданий пока нет</div>
      )}

      <Pagination page={currentPage} total={totalItems} limit={LIMIT} onChange={(p) => void loadPage(p)} />

      {canManageAssignments && activeModal && (
        <ModalShell
          title={activeModal === "create" ? "Создать задание" : "Редактировать задание"}
          onClose={closeFormModal}
          disabled={isSubmitting}
        >
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
            <button className={styles.primaryButton} type="button" onClick={() => void submitAssignment()} disabled={!canSubmit}>
              {isSubmitting ? "Сохраняем..." : activeModal === "create" ? "Создать" : "Сохранить"}
            </button>
          </div>
        </ModalShell>
      )}

      {canManageAssignments && deletingId && (
        <ModalShell title="Удалить задание" onClose={closeDeleteModal} disabled={isSubmitting}>
          <div className={styles.modalText}>Вы точно хотите удалить задание? Это действие нельзя отменить.</div>
          <div className={styles.modalActions}>
            <button className={styles.secondaryButton} type="button" onClick={closeDeleteModal} disabled={isSubmitting}>
              Отмена
            </button>
            <button className={styles.dangerButton} type="button" onClick={() => void submitDeleteAssignment()} disabled={isSubmitting}>
              {isSubmitting ? "Удаляем..." : "Удалить"}
            </button>
          </div>
        </ModalShell>
      )}
    </div>
  )
}
