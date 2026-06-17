import { useEffect, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { useNavigate, useOutletContext, useParams } from "react-router-dom"
import AddIcon from "../../../assets/icons/classes/add.svg?react"
import DeleteIcon from "../../../assets/icons/classes/delete.svg?react"
import EditIcon from "../../../assets/icons/classes/settings.svg?react"
import UsersIcon from "../../../assets/icons/classes/users.svg?react"
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
import GroupEditor, { type EditorMember } from "../../../components/GroupEditor/GroupEditor"
import { listContainer, listItem } from "../../../shared/motion"
import type { ClassLayoutContext } from "../../../layouts/ClassLayout/ClassLayout"
import { getClassMembers } from "../ClassMembersPage/services/classMembers.api"
import AssignmentFormModal, {
  EMPTY_ASSIGNMENT_FORM,
  type AssignmentFormState
} from "../AssignmentFormModal/AssignmentFormModal"
import TeamSettingsModal from "../TeamSettingsModal/TeamSettingsModal"
import {
  createAssignment,
  deleteAssignmentMaterial,
  deleteAssignment,
  uploadAssignmentMaterial,
  listAssignments,
  updateAssignment,
  type AssignmentDto,
  type AssignmentType,
  type CreateGroupPayload
} from "./services/assignments.api"
import type { GradingMode } from "./services/groups.api"
import SkeletonLoader from "./SkeletonLoader/SkeletonLoader"
import styles from "./AssignmentsPage.module.css"

const LIMIT = 10

const QUIZ_SETTING_LABELS = {
  shuffle_questions: "Перемешивать вопросы",
  shuffle_options: "Перемешивать варианты ответов",
  show_result_after_submit: "Показывать результат после отправки",
  show_correct_answers_after_submit: "Показывать правильные ответы после отправки"
} as const

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
  onTeamSettings: () => void
  onDelete: () => void
}

function AssignmentCard({ item, showStats, onOpen, onEdit, onTeamSettings, onDelete }: AssignmentCardProps) {
  const pendingCount = item.stats?.pending_review_count ?? 0

  return (
    <div className={styles.card} onClick={onOpen}>
      <div className={styles.cardHead}>
        <div className={styles.cardTitle}>{truncate(item.title, 80)}</div>
        {(item.can_edit || item.can_delete) && (
          <div className={styles.cardActions} onClick={(e) => e.stopPropagation()}>
            {item.can_edit && item.is_group && (
              <button className={styles.iconButton} type="button" aria-label="Настройка команд" onClick={onTeamSettings}>
                <UsersIcon className={styles.icon} />
              </button>
            )}
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

  // Групповое задание: тип, режим оценивания, локальные черновики групп и список студентов
  const [isGroup, setIsGroup] = useState(false)
  const [assignmentType, setAssignmentType] = useState<AssignmentType>("regular")
  const [gradingMode, setGradingMode] = useState<GradingMode>("even")
  const [quizSettings, setQuizSettings] = useState({
    shuffle_questions: false,
    shuffle_options: false,
    show_result_after_submit: false,
    show_correct_answers_after_submit: false,
    attempts_limit: 1
  })
  const [groupDrafts, setGroupDrafts] = useState<GroupDraft[]>([])
  const [students, setStudents] = useState<EditorMember[]>([])
  // Общий лимит участников на команду (текст инпута, пусто — без лимита)
  const [maxTeamSize, setMaxTeamSize] = useState("")

  // Задание, для которого открыта модалка настройки команд
  const [teamSettingsFor, setTeamSettingsFor] = useState<AssignmentDto | null>(null)

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
    setForm(EMPTY_ASSIGNMENT_FORM)
    setInitialForm(EMPTY_ASSIGNMENT_FORM)
    setMaterialFile(null)
    setShouldDeleteMaterialFile(false)
    setMaterialFileError("")
    setAssignmentType("regular")
    setIsGroup(false)
    setGradingMode("even")
    setQuizSettings({
      shuffle_questions: false,
      shuffle_options: false,
      show_result_after_submit: false,
      show_correct_answers_after_submit: false,
      attempts_limit: 1
    })
    setGroupDrafts([])
    setStudents([])
    setMaxTeamSize("")
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
    setForm(EMPTY_ASSIGNMENT_FORM)
    setInitialForm(EMPTY_ASSIGNMENT_FORM)
    setEditingId(null)
    setMaterialFile(null)
    setShouldDeleteMaterialFile(false)
    setMaterialFileError("")
    setAssignmentType("regular")
    setIsGroup(false)
    setGradingMode("even")
    setQuizSettings({
      shuffle_questions: false,
      shuffle_options: false,
      show_result_after_submit: false,
      show_correct_answers_after_submit: false,
      attempts_limit: 1
    })
    setGroupDrafts([])
    setMaxTeamSize("")
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

  // Раскидать нераспределённых студентов по существующим группам по порядку списка
  function autoFillDrafts() {
    if (groupDrafts.length === 0) return
    const limit = maxTeamSize.trim() ? Number(maxTeamSize) : null
    setGroupDrafts((prev) => {
      const next = prev.map((g) => ({ ...g, members: [...g.members] }))
      const pool = [...unassignedStudents] // уже отсортированы по фамилии
      if (limit != null) {
        // заполняем команды по очереди до лимита
        let gi = 0
        for (const student of pool) {
          while (gi < next.length && next[gi].members.length >= limit) gi++
          if (gi >= next.length) break // свободных мест больше нет
          next[gi].members.push(student)
        }
      } else {
        // без лимита — ровными последовательными блоками по группам
        const per = Math.ceil(pool.length / next.length)
        pool.forEach((student, index) => {
          next[Math.min(next.length - 1, Math.floor(index / per))].members.push(student)
        })
      }
      return next
    })
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
    setAssignmentType(item.type)
    setQuizSettings({
      shuffle_questions: item.quiz_settings?.shuffle_questions ?? false,
      shuffle_options: item.quiz_settings?.shuffle_options ?? true,
      show_result_after_submit: item.quiz_settings?.show_result_after_submit ?? true,
      show_correct_answers_after_submit: item.quiz_settings?.show_correct_answers_after_submit ?? false,
      attempts_limit: item.quiz_settings?.attempts_limit ?? 1
    })
    setIsFormOpen(true)
  }

  function setField<K extends keyof AssignmentFormState>(key: K, value: AssignmentFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function buildBody() {
    const body: {
      title: string
      description?: string
      material_url: string | null
      due_at: string | null
      max_grade: number
      type: AssignmentType
      group?: CreateGroupPayload
      quiz_settings?: {
        shuffle_questions: boolean
        shuffle_options: boolean
        show_result_after_submit: boolean
        show_correct_answers_after_submit: boolean
        attempts_limit: number
      }
    } = {
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      material_url: form.material_url.trim() || null,
      due_at: toApiDateTime(form.due_at),
      max_grade: assignmentType === "quiz" ? 0 : Number(form.max_grade),
      type: assignmentType
    }
    if (assignmentType === "quiz") {
      body.quiz_settings = quizSettings
    }
    if (assignmentType === "regular" && isGroup) {
      const limit = maxTeamSize.trim() ? Number(maxTeamSize) : undefined
      body.group = {
        grading_mode: gradingMode,
        ...(limit ? { max_team_size: limit } : {}),
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
      if (created.type === "quiz") {
        finishFormModal()
        navigate(`/classes/${classId}/assignments/${created.id}/quiz`)
        return
      }
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

  const isQuizAssignment = assignmentType === "quiz"
  const isFilled = form.title.trim().length > 0 && (isQuizAssignment || Number(form.max_grade) > 0)
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
  const groupValid = assignmentType !== "regular" || !isGroup || hasFilledGroup
  const quizBehaviorSelected = quizSettings.shuffle_questions || quizSettings.shuffle_options
  const quizPostSubmitSelected = quizSettings.show_result_after_submit || quizSettings.show_correct_answers_after_submit
  const quizValid = assignmentType !== "quiz" || (quizBehaviorSelected && quizPostSubmitSelected)
  const editingItem = editingId === null ? null : items.find((item) => item.id === editingId) ?? null
  const currentMaterialFile = editingItem?.material_file && !shouldDeleteMaterialFile
    ? { name: editingItem.material_file.name, size: editingItem.material_file.size }
    : null
  const canSubmit =
    !isSubmitting &&
    !materialFileError &&
    !dueAtError &&
    isFilled &&
    groupValid &&
    quizValid &&
    (editingId === null || isChanged || materialFile !== null || shouldDeleteMaterialFile)
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
                  onOpen={() => navigate(`/classes/${classId}/assignments/${item.id}${item.type === "quiz" ? "/quiz" : ""}`)}
                  onEdit={() => openEditModal(item)}
                  onTeamSettings={() => setTeamSettingsFor(item)}
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
            size="lg"
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
            isMaxGradeDerived={assignmentType === "quiz"}
            maxGradeHint={assignmentType === "quiz" ? "После добавления вопросов сумма баллов пересчитается автоматически." : undefined}
          >
            {editingId === null && (
              <div className={styles.field}>
                <div className={styles.fieldLabel}>Формат задания</div>
                <div className={styles.typeButtons}>
                  <button
                    className={`${styles.typeButton} ${assignmentType === "regular" ? styles.typeButtonActive : ""}`}
                    type="button"
                    onClick={() => setAssignmentType("regular")}
                    disabled={isSubmitting}
                  >
                    Обычное
                  </button>
                  <button
                    className={`${styles.typeButton} ${assignmentType === "quiz" ? styles.typeButtonActive : ""}`}
                    type="button"
                    onClick={() => {
                      setAssignmentType("quiz")
                      setIsGroup(false)
                    }}
                    disabled={isSubmitting}
                  >
                    Тест
                  </button>
                </div>
              </div>
            )}

            {editingId === null && assignmentType === "quiz" && (
              <>
                <div className={styles.field}>
                  <div className={styles.fieldLabel}>Настройки теста</div>
                  <div className={styles.checkboxGrid}>
                    <label className={`${styles.checkboxCard} ${quizSettings.shuffle_questions ? styles.checkboxCardActive : ""}`}>
                      <input
                        type="checkbox"
                        checked={quizSettings.shuffle_questions}
                        onChange={() => setQuizSettings((prev) => ({ ...prev, shuffle_questions: !prev.shuffle_questions }))}
                        disabled={isSubmitting}
                      />
                      <span>{QUIZ_SETTING_LABELS.shuffle_questions}</span>
                    </label>
                    <label className={`${styles.checkboxCard} ${quizSettings.shuffle_options ? styles.checkboxCardActive : ""}`}>
                      <input
                        type="checkbox"
                        checked={quizSettings.shuffle_options}
                        onChange={() => setQuizSettings((prev) => ({ ...prev, shuffle_options: !prev.shuffle_options }))}
                        disabled={isSubmitting}
                      />
                      <span>{QUIZ_SETTING_LABELS.shuffle_options}</span>
                    </label>
                    <label className={`${styles.checkboxCard} ${quizSettings.show_result_after_submit ? styles.checkboxCardActive : ""}`}>
                      <input
                        type="checkbox"
                        checked={quizSettings.show_result_after_submit}
                        onChange={() => setQuizSettings((prev) => ({ ...prev, show_result_after_submit: !prev.show_result_after_submit }))}
                        disabled={isSubmitting}
                      />
                      <span>{QUIZ_SETTING_LABELS.show_result_after_submit}</span>
                    </label>
                    <label className={`${styles.checkboxCard} ${quizSettings.show_correct_answers_after_submit ? styles.checkboxCardActive : ""}`}>
                      <input
                        type="checkbox"
                        checked={quizSettings.show_correct_answers_after_submit}
                        onChange={() => setQuizSettings((prev) => ({ ...prev, show_correct_answers_after_submit: !prev.show_correct_answers_after_submit }))}
                        disabled={isSubmitting}
                      />
                      <span>{QUIZ_SETTING_LABELS.show_correct_answers_after_submit}</span>
                    </label>
                  </div>
                  <div className={styles.hint}>Можно включить сразу все нужные опции.</div>
                  {!quizBehaviorSelected && <div className={styles.validationHint}>Выберите хотя бы одну настройку теста.</div>}
                  {!quizPostSubmitSelected && <div className={styles.validationHint}>Выберите хотя бы одно действие после отправки.</div>}
                </div>

                <label className={styles.field}>
                  <div className={styles.fieldLabel}>Лимит попыток</div>
                  <input
                    className={styles.input}
                    type="number"
                    min="1"
                    value={quizSettings.attempts_limit}
                    onChange={(e) => setQuizSettings((prev) => ({ ...prev, attempts_limit: Number(e.target.value) || 1 }))}
                    disabled={isSubmitting}
                  />
                </label>
              </>
            )}

            {editingId === null && assignmentType === "regular" && isGroup && (
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

                <label className={styles.field}>
                  <div className={styles.fieldLabel}>
                    Лимит участников в команде <span className={styles.fieldOptional}>(необязательно, общий для всех команд)</span>
                  </div>
                  <input
                    className={styles.input}
                    type="number"
                    min="1"
                    value={maxTeamSize}
                    onChange={(e) => setMaxTeamSize(e.target.value)}
                    placeholder="Без ограничения"
                    disabled={isSubmitting}
                  />
                </label>

                <div className={styles.field}>
                  <div className={styles.fieldLabel}>Команды</div>
                  <GroupEditor
                    groups={groupDrafts}
                    unassigned={unassignedStudents}
                    disabled={isSubmitting}
                    maxTeamSize={maxTeamSize.trim() ? Number(maxTeamSize) : null}
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

            {editingId === null && assignmentType === "regular" && (
              <div className={styles.field}>
                <div className={styles.fieldLabel}>Режим обычного задания</div>
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

          </AssignmentFormModal>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {canManage && teamSettingsFor && (
          <TeamSettingsModal
            classId={classDetail!.id}
            assignmentId={teamSettingsFor.id}
            gradingMode={teamSettingsFor.grading_mode}
            onClose={() => setTeamSettingsFor(null)}
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
