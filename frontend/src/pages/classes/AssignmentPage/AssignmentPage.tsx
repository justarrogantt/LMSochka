import { useEffect, useState } from "react"
import { useNavigate, useOutletContext, useParams } from "react-router-dom"
import ArrowIcon from "../../../assets/icons/classes/arrow.svg?react"
import DeleteIcon from "../../../assets/icons/classes/delete.svg?react"
import EditIcon from "../../../assets/icons/classes/settings.svg?react"
import Loading from "../../../components/Loading/Loading"
import Modal from "../../../components/Modal/Modal"
import { useToast } from "../../../components/Toast/ToastProvider"
import { ApiSilentError } from "../../../services/api"
import { formatDateTime } from "../../../services/helpers"
import type { ClassLayoutContext } from "../../../layouts/ClassLayout/ClassLayout"
import {
  getAssignment,
  updateAssignment,
  deleteAssignment,
  type AssignmentDto
} from "../AssignmentsPage/services/assignments.api"
import styles from "./AssignmentPage.module.css"

type FormState = {
  title: string
  description: string
  material_url: string
  due_at: string
  max_grade: string
}

export default function AssignmentPage() {
  const { classId, assignmentId } = useParams<{ classId: string; assignmentId: string }>()
  const { classDetail } = useOutletContext<ClassLayoutContext>()
  const navigate = useNavigate()
  const showToast = useToast()

  // Данные задания
  const [assignment, setAssignment] = useState<AssignmentDto | null>(null)

  // Лоадер страницы
  const [isLoading, setIsLoading] = useState(true)

  // Активная модалка
  const [activeModal, setActiveModal] = useState<"edit" | "delete" | null>(null)

  // Флаг отправки запроса
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Поля формы редактирования и начальное состояние для сравнения
  const [form, setForm] = useState<FormState>({ title: "", description: "", material_url: "", due_at: "", max_grade: "" })
  const [initialForm, setInitialForm] = useState<FormState>({ title: "", description: "", material_url: "", due_at: "", max_grade: "" })

  const parsedClassId = Number(classId)
  const parsedAssignmentId = Number(assignmentId)

  // Загрузка задания по ID
  useEffect(() => {
    async function load() {
      if (!parsedClassId || !parsedAssignmentId) return

      try {
        const data = await getAssignment(parsedClassId, parsedAssignmentId)
        setAssignment(data)
      } catch (error) {
        if (error instanceof ApiSilentError) return
        showToast({ type: "error", message: (error as Error).message })
        navigate(`/classes/${classId}/assignments`, { replace: true })
      } finally {
        setIsLoading(false)
      }
    }

    void load()
  }, [parsedClassId, parsedAssignmentId])

  // Переход к списку заданий
  function goBack() {
    navigate(`/classes/${classId}/assignments`)
  }

  // Закрытие активной модалки
  function closeModal() {
    if (isSubmitting) return
    setActiveModal(null)
  }

  // Открытие модалки редактирования с заполнением текущих значений
  function openEditModal() {
    if (!assignment) return
    const saved: FormState = {
      title: assignment.title,
      description: assignment.description,
      material_url: assignment.material_url ?? "",
      due_at: assignment.due_at ? assignment.due_at.slice(0, 16) : "",
      max_grade: String(assignment.max_grade)
    }
    setForm(saved)
    setInitialForm(saved)
    setActiveModal("edit")
  }

  // Обновление одного поля формы
  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  // Оптимистичное редактирование с роллбэком при ошибке
  async function submitEdit() {
    if (!assignment || isSubmitting) return

    const title = form.title.trim()
    const maxGrade = Number(form.max_grade)
    if (!title || maxGrade <= 0) return

    const prev = assignment
    const optimistic: AssignmentDto = {
      ...assignment,
      title,
      description: form.description.trim(),
      material_url: form.material_url.trim() || null,
      due_at: form.due_at || null,
      max_grade: maxGrade
    }

    setAssignment(optimistic)
    setActiveModal(null)
    setIsSubmitting(true)

    try {
      const updated = await updateAssignment(parsedClassId, parsedAssignmentId, {
        title,
        description: form.description.trim() || undefined,
        material_url: form.material_url.trim() || null,
        due_at: form.due_at || null,
        max_grade: maxGrade
      })
      setAssignment(updated)
      showToast({ type: "neutral", message: "Задание обновлено" })
    } catch (error) {
      setAssignment(prev)
      showToast({ type: "error", message: (error as Error).message })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Удаление с навигацией назад при успехе
  async function submitDelete() {
    if (isSubmitting) return

    setIsSubmitting(true)

    try {
      await deleteAssignment(parsedClassId, parsedAssignmentId)
      showToast({ type: "neutral", message: "Задание удалено" })
      navigate(`/classes/${classId}/assignments`, { replace: true })
    } catch (error) {
      showToast({ type: "error", message: (error as Error).message })
      setIsSubmitting(false)
    }
  }

  const canManage = classDetail?.user_role !== "student"
  const isFormChanged =
    form.title.trim() !== initialForm.title.trim() ||
    form.description.trim() !== initialForm.description.trim() ||
    form.material_url.trim() !== initialForm.material_url.trim() ||
    form.due_at !== initialForm.due_at ||
    form.max_grade !== initialForm.max_grade
  const canSave = form.title.trim().length > 0 && Number(form.max_grade) > 0 && isFormChanged && !isSubmitting

  return (
    <div className={styles.page}>
      <div className={styles.pageHead}>
        <button className={styles.backButton} type="button" onClick={goBack}>
          <ArrowIcon className={styles.backIcon} />
          Все задания
        </button>

        {canManage && !isLoading && assignment && (
          <div className={styles.pageActions}>
            <button className={styles.secondaryButton} type="button" onClick={openEditModal}>
              <EditIcon className={styles.buttonIcon} />
              Редактировать
            </button>
            <button className={styles.dangerButton} type="button" onClick={() => setActiveModal("delete")}>
              <DeleteIcon className={styles.buttonIcon} />
              Удалить
            </button>
          </div>
        )}
      </div>

      {isLoading && <Loading />}

      {!isLoading && assignment && (
        <div className={styles.card}>
          <div className={styles.title}>{assignment.title}</div>

          {assignment.description && (
            <div className={styles.content}>{assignment.description}</div>
          )}

          {assignment.material_url && (
            <a className={styles.materialLink} href={assignment.material_url} target="_blank" rel="noopener noreferrer">
              Открыть материал →
            </a>
          )}

          <div className={styles.meta}>
            {assignment.due_at && <div>Дедлайн: {formatDateTime(assignment.due_at)}</div>}
            <div>Максимальный балл: {assignment.max_grade}</div>
            <div>Создано: {formatDateTime(assignment.created_at)}</div>
          </div>
        </div>
      )}

      {canManage && activeModal === "edit" && (
        <Modal title="Редактировать задание" onClose={closeModal} disabled={isSubmitting}>
          <label className={styles.field}>
            <div className={styles.fieldLabel}>Название</div>
            <input
              className={styles.input}
              type="text"
              value={form.title}
              onChange={(e) => setField("title", e.target.value)}
              disabled={isSubmitting}
            />
          </label>

          <label className={styles.field}>
            <div className={styles.fieldLabel}>Описание <span className={styles.fieldOptional}>(необязательно)</span></div>
            <textarea
              className={styles.textarea}
              value={form.description}
              onChange={(e) => setField("description", e.target.value)}
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
                disabled={isSubmitting}
              />
            </label>
          </div>

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

      {canManage && activeModal === "delete" && (
        <Modal title="Удалить задание" onClose={closeModal} disabled={isSubmitting}>
          <div className={styles.modalText}>Вы точно хотите удалить задание? Это действие нельзя отменить.</div>
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
    </div>
  )
}
