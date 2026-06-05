import { useEffect, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { useNavigate, useOutletContext, useParams } from "react-router-dom"
import AddIcon from "../../../assets/icons/classes/add.svg?react"
import DeleteIcon from "../../../assets/icons/classes/delete.svg?react"
import EditIcon from "../../../assets/icons/classes/settings.svg?react"
import Modal from "../../../components/Modal/Modal"
import Pagination from "../../../components/Pagination/Pagination"
import { useToast } from "../../../components/Toast/useToast"
import { useDelayedLoading } from "../../../hooks/useDelayedLoading"
import { ApiError } from "../../../services/api"
import { validateUploadFile } from "../../../services/files.api"
import {
  currentDateTimeInputValue,
  formatDateTime,
  formatDateTimeInputValue,
  isPastDateTimeInputValue,
  toApiDateTime,
  truncate
} from "../../../services/helpers"
import { listContainer, listItem } from "../../../shared/motion"
import type { ClassLayoutContext } from "../../../layouts/ClassLayout/ClassLayout"
import AssignmentFormModal, {
  EMPTY_ASSIGNMENT_FORM,
  type AssignmentFormState
} from "../AssignmentFormModal/AssignmentFormModal"
import {
  createAssignment,
  deleteAssignmentMaterial,
  deleteAssignment,
  uploadAssignmentMaterial,
  listAssignments,
  updateAssignment,
  type AssignmentDto
} from "./services/assignments.api"
import SkeletonLoader from "./SkeletonLoader/SkeletonLoader"
import styles from "./AssignmentsPage.module.css"

const LIMIT = 10

type AssignmentCardProps = {
  item: AssignmentDto
  showStats: boolean
  onOpen: () => void
  onEdit: () => void
  onDelete: () => void
}

function AssignmentCard({ item, showStats, onOpen, onEdit, onDelete }: AssignmentCardProps) {
  const pendingCount = item.stats?.pending_review_count ?? 0

  return (
    <div className={styles.card} onClick={onOpen}>
      <div className={styles.cardHead}>
        <div className={styles.cardTitle}>{truncate(item.title, 80)}</div>
        {(item.can_edit || item.can_delete) && (
          <div className={styles.cardActions} onClick={(e) => e.stopPropagation()}>
            {item.can_edit && (
              <button className={styles.iconButton} type="button" aria-label="Редактировать задание" onClick={onEdit}>
                <EditIcon className={styles.icon} />
              </button>
            )}
            {item.can_delete && (
              <button className={styles.iconButton} type="button" aria-label="Удалить задание" onClick={onDelete}>
                <DeleteIcon className={styles.icon} />
              </button>
            )}
          </div>
        )}
      </div>

      {item.description && <div className={styles.content}>{truncate(item.description, 200)}</div>}

      <div className={styles.meta}>
        {item.due_at && <div>до {formatDateTime(item.due_at)}</div>}
        <div>до {item.max_grade} баллов</div>
      </div>

      {showStats && <div className={styles.pendingText}>на проверке: {pendingCount}</div>}
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

  // Первичная загрузка и переключение вкладок
  const [isLoading, setIsLoading] = useState(true)
  const [showSkeleton, setSkeletonLoading] = useDelayedLoading(350, false)

  // Пагинация списка заданий
  const [currentPage, setCurrentPage] = useState(1)
  const [totalItems, setTotalItems] = useState(0)

  // Серверный счётчик вкладки "На проверке"
  const [pendingReviewTotal, setPendingReviewTotal] = useState(0)

  // Режим списка: все задания или только ожидающие проверки
  const [viewMode, setViewMode] = useState<"all" | "pending">("all")

  // Состояние модалок формы и удаления
  const [editingId, setEditingId] = useState<number | null>(null)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  // Флаг отправки запросов из модалок
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Поля формы задания и исходные значения для проверки изменений
  const [form, setForm] = useState<AssignmentFormState>(EMPTY_ASSIGNMENT_FORM)
  const [initialForm, setInitialForm] = useState<AssignmentFormState>(EMPTY_ASSIGNMENT_FORM)

  // Новый файл материала, выбранный в модалке
  const [materialFile, setMaterialFile] = useState<File | null>(null)
  const [shouldDeleteMaterialFile, setShouldDeleteMaterialFile] = useState(false)
  const [materialFileError, setMaterialFileError] = useState("")

  async function loadPage(page: number, mode: "all" | "pending" = viewMode) {
    if (!classDetail?.id) return
    setIsLoading(true)
    setSkeletonLoading(true)
    try {
      const data = await listAssignments(classDetail.id, page, LIMIT, mode === "pending" ? "pending" : undefined)
      setItems(data.items)
      setTotalItems(data.total)
      setPendingReviewTotal(data.pending_review_total)
      setCurrentPage(page)
    } catch (error) {
      if (error instanceof ApiError) {
        showToast({ type: "error", message: error.message })
        return
      }
      throw error
    } finally {
      setIsLoading(false)
      setSkeletonLoading(false)
    }
  }

  useEffect(() => {
    void loadPage(1, viewMode)
  }, [classDetail?.id, viewMode])

  function resetFormState() {
    setEditingId(null)
    setForm(EMPTY_ASSIGNMENT_FORM)
    setInitialForm(EMPTY_ASSIGNMENT_FORM)
    setMaterialFile(null)
    setShouldDeleteMaterialFile(false)
    setMaterialFileError("")
  }

  function closeFormModal() {
    if (isSubmitting) return
    setIsFormOpen(false)
    resetFormState()
  }

  function finishFormModal() {
    setIsFormOpen(false)
    resetFormState()
  }

  function closeDeleteModal() {
    if (isSubmitting) return
    setDeletingId(null)
  }

  function openCreateModal() {
    setForm(EMPTY_ASSIGNMENT_FORM)
    setInitialForm(EMPTY_ASSIGNMENT_FORM)
    setEditingId(null)
    setMaterialFile(null)
    setShouldDeleteMaterialFile(false)
    setMaterialFileError("")
    setIsFormOpen(true)
  }

  function openEditModal(item: AssignmentDto) {
    const saved: AssignmentFormState = {
      title: item.title,
      description: item.description,
      material_url: item.material_url ?? "",
      due_at: formatDateTimeInputValue(item.due_at),
      max_grade: String(item.max_grade)
    }
    setForm(saved)
    setInitialForm(saved)
    setEditingId(item.id)
    setMaterialFile(null)
    setShouldDeleteMaterialFile(false)
    setMaterialFileError("")
    setIsFormOpen(true)
  }

  function setField<K extends keyof AssignmentFormState>(key: K, value: AssignmentFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function buildBody() {
    return {
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      material_url: form.material_url.trim() || null,
      due_at: toApiDateTime(form.due_at),
      max_grade: Number(form.max_grade)
    }
  }

  function onMaterialFileChange(file: File) {
    setMaterialFile(null)
    setShouldDeleteMaterialFile(false)
    setMaterialFileError("")

    const error = validateUploadFile(file)
    if (error) {
      setMaterialFileError(error)
      return
    }

    setMaterialFile(file)
  }

  function onMaterialFileClear() {
    if (materialFile) {
      setMaterialFile(null)
      setMaterialFileError("")
      return
    }

    setShouldDeleteMaterialFile(true)
    setMaterialFileError("")
  }

  async function deleteCreatedAssignmentAfterFileError(assignmentId: number) {
    if (!classDetail?.id) return

    try {
      await deleteAssignment(classDetail.id, assignmentId)
    } catch (error) {
      if (error instanceof ApiError) {
        showToast({ type: "error", message: error.message })
        return
      }
      throw error
    }
  }

  async function submitCreate() {
    if (!classDetail?.id || materialFileError) return

    const body = buildBody()
    setIsSubmitting(true)
    let created: AssignmentDto | null = null

    try {
      created = await createAssignment(classDetail.id, body)
      if (materialFile) {
        try {
          await uploadAssignmentMaterial(classDetail.id, created.id, materialFile)
        } catch (error) {
          await deleteCreatedAssignmentAfterFileError(created.id)
          if (error instanceof ApiError) {
            setMaterialFileError(error.message)
            return
          }
          throw error
        }
      }
      showToast({ type: "neutral", message: "Задание создано" })
      finishFormModal()
      if (viewMode === "all") {
        void loadPage(1, "all")
      } else {
        setViewMode("all")
      }
    } catch (error) {
      if (error instanceof ApiError) {
        showToast({ type: "error", message: error.message })
        return
      }
      throw error
    } finally {
      setIsSubmitting(false)
    }
  }

  async function submitEdit() {
    if (!classDetail?.id || !editingId || materialFileError) return

    const id = editingId
    const body = buildBody()
    setIsSubmitting(true)

    try {
      let uploadedMaterial: AssignmentDto["material_file"] = null
      let isMaterialDeleted = false
      if (materialFile) {
        try {
          uploadedMaterial = await uploadAssignmentMaterial(classDetail.id, id, materialFile)
        } catch (error) {
          if (error instanceof ApiError) {
            setMaterialFileError(error.message)
            return
          }
          throw error
        }
      }

      if (!materialFile && shouldDeleteMaterialFile) {
        try {
          await deleteAssignmentMaterial(classDetail.id, id)
          isMaterialDeleted = true
        } catch (error) {
          if (error instanceof ApiError) {
            setMaterialFileError(error.message)
            return
          }
          throw error
        }
      }

      let updated = await updateAssignment(classDetail.id, id, body)
      if (uploadedMaterial) updated = { ...updated, material_file: uploadedMaterial }
      if (isMaterialDeleted) updated = { ...updated, material_file: null }
      setItems((prev) => prev.map((it) => (it.id === updated.id ? updated : it)))
      showToast({ type: "neutral", message: "Задание обновлено" })
      finishFormModal()
    } catch (error) {
      if (error instanceof ApiError) {
        showToast({ type: "error", message: error.message })
        return
      }
      throw error
    } finally {
      setIsSubmitting(false)
    }
  }

  async function submitDelete() {
    if (!classDetail?.id || !deletingId || isSubmitting) return
    setIsSubmitting(true)

    try {
      await deleteAssignment(classDetail.id, deletingId)
      setDeletingId(null)
      showToast({ type: "neutral", message: "Задание удалено" })
      const nextPage = items.length === 1 && currentPage > 1 ? currentPage - 1 : currentPage
      void loadPage(nextPage, viewMode)
    } catch (error) {
      if (error instanceof ApiError) {
        showToast({ type: "error", message: error.message })
        return
      }
      throw error
    } finally {
      setIsSubmitting(false)
    }
  }

  const isFilled = form.title.trim().length > 0 && Number(form.max_grade) > 0
  const dueAtError = isPastDateTimeInputValue(form.due_at) ? "Дедлайн не может быть в прошлом" : ""
  const minDueAt = currentDateTimeInputValue()
  const isChanged =
    form.title.trim() !== initialForm.title.trim() ||
    form.description.trim() !== initialForm.description.trim() ||
    form.material_url.trim() !== initialForm.material_url.trim() ||
    form.due_at !== initialForm.due_at ||
    form.max_grade !== initialForm.max_grade
  const editingItem = editingId === null ? null : items.find((item) => item.id === editingId) ?? null
  const currentMaterialFile = editingItem?.material_file && !shouldDeleteMaterialFile
    ? { name: editingItem.material_file.name, size: editingItem.material_file.size }
    : null
  const canSubmit = !isSubmitting && !materialFileError && !dueAtError && isFilled && (
    editingId === null ||
    isChanged ||
    materialFile !== null ||
    shouldDeleteMaterialFile
  )
  const canManage = classDetail?.permissions.can_create_assignment ?? false

  return (
    <div className={styles.page}>
      <div className={styles.pageHead}>
        <div className={styles.titleBlock}>
          <div className={styles.title}>Задания</div>
          <div className={styles.text}>Учебные задания и дедлайны курса.</div>
        </div>

        {canManage && (
          <div className={styles.headActions}>
            <button
              className={`${styles.switchButton} ${viewMode === "all" ? styles.switchButtonActive : ""}`}
              type="button"
              onClick={() => setViewMode("all")}
              disabled={isLoading}
            >
              Все задания
            </button>
            <button
              className={`${styles.switchButton} ${viewMode === "pending" ? styles.switchButtonActive : ""}`}
              type="button"
              onClick={() => setViewMode("pending")}
              disabled={isLoading}
            >
              На проверке {pendingReviewTotal > 0 ? `(${pendingReviewTotal})` : ""}
            </button>
            <button className={styles.primaryButton} type="button" onClick={openCreateModal}>
              <AddIcon className={styles.buttonIcon} />
              Создать задание
            </button>
          </div>
        )}
      </div>

      {showSkeleton && <SkeletonLoader showActions={canManage} />}

      {!isLoading && (
        <>
        {items.length === 0 ? (
          <div className={styles.emptyMessage}>
            {viewMode === "pending" ? "Нет заданий на проверке" : "Заданий пока нет"}
          </div>
        ) : (
          <motion.div className={styles.cards} variants={listContainer} initial="hidden" animate="visible">
            {items.map((item) => (
              <motion.div key={item.id} variants={listItem}>
                <AssignmentCard
                  item={item}
                  showStats={canManage}
                  onOpen={() => navigate(`/classes/${classId}/assignments/${item.id}`)}
                  onEdit={() => openEditModal(item)}
                  onDelete={() => setDeletingId(item.id)}
                />
              </motion.div>
            ))}
          </motion.div>
        )}
        </>
      )}

      <Pagination page={currentPage} total={totalItems} limit={LIMIT} onChange={(p) => void loadPage(p, viewMode)} />

      <AnimatePresence>
        {canManage && isFormOpen && (
          <AssignmentFormModal
            mode={editingId ? "edit" : "create"}
            form={form}
            isSubmitting={isSubmitting}
            canSubmit={canSubmit}
            dueAtError={dueAtError}
            minDueAt={minDueAt}
            materialFile={materialFile}
            isMaterialFileBusy={isSubmitting && (Boolean(materialFile) || shouldDeleteMaterialFile)}
            currentMaterialFile={currentMaterialFile}
            materialFileError={materialFileError}
            onClose={closeFormModal}
            onSubmit={() => void (editingId ? submitEdit() : submitCreate())}
            onFieldChange={setField}
            onMaterialFileChange={onMaterialFileChange}
            onMaterialFileRemove={onMaterialFileClear}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
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
      </AnimatePresence>
    </div>
  )
}
