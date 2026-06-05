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
import { ACCEPTED_FILE_INPUT, ACCEPTED_FILE_TYPES_LABEL, validateUploadFile } from "../../../services/files.api"
import {
  currentDateTimeInputValue,
  formatDateTime,
  formatDateTimeInputValue,
  isPastDateTimeInputValue,
  toApiDateTime,
  truncate
} from "../../../services/helpers"
import FilePicker from "../../../components/FilePicker/FilePicker"
import GroupEditor, { type EditorMember } from "../../../components/GroupEditor/GroupEditor"
import { listContainer, listItem } from "../../../shared/motion"
import type { ClassLayoutContext } from "../../../layouts/ClassLayout/ClassLayout"
import { getClassMembers } from "../ClassMembersPage/services/classMembers.api"
import {
  createAssignment,
  deleteAssignment,
  uploadAssignmentMaterial,
  listAssignments,
  updateAssignment,
  type AssignmentDto,
  type CreateGroupPayload
} from "./services/assignments.api"
import type { GradingMode } from "./services/groups.api"
import SkeletonLoader from "./SkeletonLoader/SkeletonLoader"
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

// Локальный черновик группы в модалке создания
type GroupDraft = {
  key: string
  title: string
  members: EditorMember[]
}

function newGroupKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `g-${Date.now()}-${Math.random().toString(16).slice(2)}`
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
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [initialForm, setInitialForm] = useState<FormState>(EMPTY_FORM)

  // Новый файл материала, выбранный в модалке
  const [materialFile, setMaterialFile] = useState<File | null>(null)
  const [materialFileError, setMaterialFileError] = useState("")

  // Групповое задание: тип, режим оценивания, локальные черновики групп и список студентов
  const [isGroup, setIsGroup] = useState(false)
  const [gradingMode, setGradingMode] = useState<GradingMode>("even")
  const [groupDrafts, setGroupDrafts] = useState<GroupDraft[]>([])
  const [students, setStudents] = useState<EditorMember[]>([])

  // Студенты, ещё не распределённые ни в одну локальную группу
  const assignedIds = new Set(groupDrafts.flatMap((g) => g.members.map((m) => m.user_id)))
  const unassignedStudents = students.filter((s) => !assignedIds.has(s.user_id))

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
    setForm(EMPTY_FORM)
    setInitialForm(EMPTY_FORM)
    setMaterialFile(null)
    setMaterialFileError("")
    setIsGroup(false)
    setGradingMode("even")
    setGroupDrafts([])
    setStudents([])
  }

  // Подтягиваем активных студентов класса для распределения по группам
  async function loadStudents() {
    if (!classDetail?.id) return
    try {
      const data = await getClassMembers(classDetail.id)
      setStudents(
        data.items
          .filter((m) => m.role === "student" && m.is_active)
          .map((m) => ({
            user_id: m.user_id,
            email: m.email,
            first_name: m.first_name,
            last_name: m.last_name,
            is_active: true
          }))
      )
    } catch (error) {
      if (error instanceof ApiError) {
        showToast({ type: "error", message: error.message })
        return
      }
      throw error
    }
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
    setForm(EMPTY_FORM)
    setInitialForm(EMPTY_FORM)
    setEditingId(null)
    setMaterialFile(null)
    setMaterialFileError("")
    setIsGroup(false)
    setGradingMode("even")
    setGroupDrafts([])
    void loadStudents()
    setIsFormOpen(true)
  }

  // ── Локальные операции с группами (combined-create) ──
  function addGroupDraft() {
    setGroupDrafts((prev) => [...prev, { key: newGroupKey(), title: `Группа ${prev.length + 1}`, members: [] }])
  }

  function renameGroupDraft(key: string, title: string) {
    setGroupDrafts((prev) => prev.map((g) => (g.key === key ? { ...g, title } : g)))
  }

  function deleteGroupDraft(key: string) {
    setGroupDrafts((prev) => prev.filter((g) => g.key !== key))
  }

  function addMemberToDraft(key: string, userId: number) {
    const student = students.find((s) => s.user_id === userId)
    if (!student) return
    setGroupDrafts((prev) =>
      prev.map((g) => (g.key === key ? { ...g, members: [...g.members, student] } : g))
    )
  }

  function removeMemberFromDraft(key: string, userId: number) {
    setGroupDrafts((prev) =>
      prev.map((g) => (g.key === key ? { ...g, members: g.members.filter((m) => m.user_id !== userId) } : g))
    )
  }

  // Раскидать нераспределённых студентов по существующим группам по кругу
  function autoFillDrafts() {
    if (groupDrafts.length === 0) return
    setGroupDrafts((prev) => {
      const next = prev.map((g) => ({ ...g, members: [...g.members] }))
      unassignedStudents.forEach((student, index) => {
        next[index % next.length].members.push(student)
      })
      return next
    })
  }

  function openEditModal(item: AssignmentDto) {
    const saved: FormState = {
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
    setMaterialFileError("")
    setIsFormOpen(true)
  }

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function buildBody() {
    const body: {
      title: string
      description?: string
      material_url: string | null
      due_at: string | null
      max_grade: number
      group?: CreateGroupPayload
    } = {
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      material_url: form.material_url.trim() || null,
      due_at: toApiDateTime(form.due_at),
      max_grade: Number(form.max_grade)
    }
    if (isGroup) {
      body.group = {
        grading_mode: gradingMode,
        distribution: {
          mode: "manual",
          groups: groupDrafts.map((g) => ({
            title: g.title.trim() || undefined,
            member_ids: g.members.map((m) => m.user_id)
          }))
        }
      }
    }
    return body
  }

  function onMaterialFileChange(file: File) {
    setMaterialFile(null)
    setMaterialFileError("")

    const error = validateUploadFile(file)
    if (error) {
      setMaterialFileError(error)
      return
    }

    setMaterialFile(file)
  }

  function onMaterialFileClear() {
    setMaterialFile(null)
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

      let updated = await updateAssignment(classDetail.id, id, body)
      if (uploadedMaterial) updated = { ...updated, material_file: uploadedMaterial }
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
  // Для группового задания нужна хотя бы одна группа с участниками
  const hasFilledGroup = groupDrafts.some((g) => g.members.length > 0)
  const groupValid = !isGroup || hasFilledGroup
  const canSubmit =
    !isSubmitting &&
    !materialFileError &&
    !dueAtError &&
    isFilled &&
    groupValid &&
    (editingId === null || isChanged || materialFile !== null)
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
        <Modal title={editingId ? "Редактировать задание" : "Создать задание"} onClose={closeFormModal} disabled={isSubmitting} size="lg">
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

          {editingId === null && (
            <div className={styles.field}>
              <div className={styles.fieldLabel}>Тип задания</div>
              <div className={styles.typeButtons}>
                <button
                  className={`${styles.typeButton} ${!isGroup ? styles.typeButtonActive : ""}`}
                  type="button"
                  onClick={() => setIsGroup(false)}
                  disabled={isSubmitting}
                >
                  Индивидуальное
                </button>
                <button
                  className={`${styles.typeButton} ${isGroup ? styles.typeButtonActive : ""}`}
                  type="button"
                  onClick={() => setIsGroup(true)}
                  disabled={isSubmitting}
                >
                  Групповое
                </button>
              </div>
            </div>
          )}

          <div className={styles.field}>
            <div className={styles.fieldLabel}>Файл материала <span className={styles.fieldOptional}>(необязательно, до 20 МБ)</span></div>
            <FilePicker
              label="Выберите файл материала"
              accept={ACCEPTED_FILE_INPUT}
              hint={`Доступные форматы: ${ACCEPTED_FILE_TYPES_LABEL}`}
              file={materialFile ? { name: materialFile.name, size: materialFile.size } : null}
              onSelect={onMaterialFileChange}
              onRemove={onMaterialFileClear}
              error={materialFileError}
              disabled={isSubmitting}
            />
          </div>

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
                min={minDueAt}
                value={form.due_at}
                onChange={(e) => setField("due_at", e.target.value)}
                disabled={isSubmitting}
              />
              {dueAtError && <div className={styles.fieldError}>{dueAtError}</div>}
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

          {editingId === null && isGroup && (
            <>
              <div className={styles.field}>
                <div className={styles.fieldLabel}>Оценивание</div>
                <div className={styles.typeButtons}>
                  <button
                    className={`${styles.typeButton} ${gradingMode === "even" ? styles.typeButtonActive : ""}`}
                    type="button"
                    onClick={() => setGradingMode("even")}
                    disabled={isSubmitting}
                  >
                    Равномерное
                  </button>
                  <button
                    className={`${styles.typeButton} ${gradingMode === "individual" ? styles.typeButtonActive : ""}`}
                    type="button"
                    onClick={() => setGradingMode("individual")}
                    disabled={isSubmitting}
                  >
                    Индивидуальное
                  </button>
                </div>
                <div className={styles.hint}>
                  {gradingMode === "even"
                    ? "Оценка за решение — общая для всей команды."
                    : "После оценивания студенты сами распределяют командный балл между собой."}
                </div>
              </div>

              <div className={styles.field}>
                <div className={styles.fieldLabel}>Команды</div>
                <GroupEditor
                  groups={groupDrafts}
                  unassigned={unassignedStudents}
                  disabled={isSubmitting}
                  onAddGroup={addGroupDraft}
                  onRenameGroup={renameGroupDraft}
                  onDeleteGroup={deleteGroupDraft}
                  onAddMember={addMemberToDraft}
                  onRemoveMember={removeMemberFromDraft}
                  onAutoFill={autoFillDrafts}
                />
                {!hasFilledGroup && (
                  <div className={styles.hint}>Добавьте хотя бы одну группу с участниками.</div>
                )}
              </div>
            </>
          )}

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
