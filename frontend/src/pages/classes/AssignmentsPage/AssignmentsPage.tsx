import { useEffect, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { useNavigate, useOutletContext, useParams } from "react-router-dom"
import AddIcon from "../../../assets/icons/classes/add.svg?react"
import DeleteIcon from "../../../assets/icons/classes/delete.svg?react"
import EditIcon from "../../../assets/icons/classes/settings.svg?react"
import Modal from "../../../components/Modal/Modal"
import Pagination from "../../../components/Pagination/Pagination"
import CardsSkeleton from "../../../components/Skeleton/CardsSkeleton"
import LoadingSwap from "../../../components/Skeleton/LoadingSwap"
import { useToast } from "../../../components/Toast/ToastProvider"
import { ApiSilentError } from "../../../services/api"
import { formatDateTime, truncate } from "../../../services/helpers"
import { listContainer, listItem } from "../../../shared/motion"
import type { ClassLayoutContext } from "../../../layouts/ClassLayout/ClassLayout"
import {
  createAssignment,
  deleteAssignment,
  uploadAssignmentMaterial,
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

  const [items, setItems] = useState<AssignmentDto[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalItems, setTotalItems] = useState(0)
  const [pendingReviewTotal, setPendingReviewTotal] = useState(0)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [viewMode, setViewMode] = useState<"all" | "pending">("all")
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [initialForm, setInitialForm] = useState<FormState>(EMPTY_FORM)
  const [materialFile, setMaterialFile] = useState<File | null>(null)

  async function loadPage(page: number, mode: "all" | "pending" = viewMode) {
    if (!classDetail?.id) return
    setIsLoading(true)
    try {
      const data = await listAssignments(classDetail.id, page, LIMIT, mode === "pending" ? "pending" : undefined)
      setItems(data.items)
      setTotalItems(data.total)
      setPendingReviewTotal(data.pending_review_total)
      setCurrentPage(page)
    } catch (error) {
      if (error instanceof ApiSilentError) return
      showToast({ type: "error", message: (error as Error).message })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadPage(1, viewMode)
  }, [classDetail?.id, viewMode])

  function closeFormModal() {
    if (isSubmitting) return
    setIsFormOpen(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
    setInitialForm(EMPTY_FORM)
    setMaterialFile(null)
  }

  function closeDeleteModal() {
    if (isSubmitting) return
    setDeletingId(null)
  }

  function openCreateModal() {
    setForm(EMPTY_FORM)
    setInitialForm(EMPTY_FORM)
    setEditingId(null)
    setMaterialFile(null)
    setIsFormOpen(true)
  }

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
    setMaterialFile(null)
    setIsFormOpen(true)
  }

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function buildBody() {
    return {
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      material_url: form.material_url.trim() || null,
      due_at: form.due_at || null,
      max_grade: Number(form.max_grade)
    }
  }

  async function submitCreate() {
    if (!classDetail?.id) return

    const body = buildBody()
    closeFormModal()
    setIsSubmitting(true)

    try {
      const created = await createAssignment(classDetail.id, body)
      if (materialFile) {
        await uploadAssignmentMaterial(classDetail.id, created.id, materialFile)
      }
      showToast({ type: "neutral", message: "Задание создано" })
      if (viewMode === "all") {
        void loadPage(1, "all")
      } else {
        setViewMode("all")
      }
    } catch (error) {
      showToast({ type: "error", message: (error as Error).message })
    } finally {
      setIsSubmitting(false)
    }
  }

  async function submitEdit() {
    if (!classDetail?.id || !editingId) return

    const id = editingId
    const body = buildBody()
    const prevItems = items

    setItems((prev) =>
      prev.map((it) =>
        it.id === id
          ? {
              ...it,
              title: body.title,
              description: body.description ?? "",
              material_url: body.material_url,
              due_at: body.due_at,
              max_grade: body.max_grade
            }
          : it
      )
    )
    closeFormModal()
    setIsSubmitting(true)

    try {
      let updated = await updateAssignment(classDetail.id, id, body)
      if (materialFile) {
        const uploaded = await uploadAssignmentMaterial(classDetail.id, id, materialFile)
        updated = { ...updated, material_file: uploaded }
      }
      setItems((prev) => prev.map((it) => (it.id === updated.id ? updated : it)))
      showToast({ type: "neutral", message: "Задание обновлено" })
    } catch (error) {
      setItems(prevItems)
      showToast({ type: "error", message: (error as Error).message })
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
  const canSubmit = !isSubmitting && isFilled && (editingId === null || isChanged || materialFile !== null)
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

      <LoadingSwap isLoading={isLoading} skeleton={<CardsSkeleton className={styles.cards} count={5} variant="assignment" />}>
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
      </LoadingSwap>

      <Pagination page={currentPage} total={totalItems} limit={LIMIT} onChange={(p) => void loadPage(p, viewMode)} />

      <AnimatePresence>
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
            <div className={styles.fieldLabel}>Файл материала <span className={styles.fieldOptional}>(необязательно, до 20 МБ)</span></div>
            <input
              className={styles.input}
              type="file"
              onChange={(event) => setMaterialFile(event.target.files?.[0] ?? null)}
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
