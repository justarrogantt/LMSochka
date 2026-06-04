import { useEffect, useState } from "react"
import { AnimatePresence } from "framer-motion"
import { useNavigate, useOutletContext, useParams } from "react-router-dom"
import ArrowIcon from "../../../assets/icons/classes/arrow.svg?react"
import DeleteIcon from "../../../assets/icons/classes/delete.svg?react"
import EditIcon from "../../../assets/icons/classes/settings.svg?react"
import Modal from "../../../components/Modal/Modal"
import Pagination from "../../../components/Pagination/Pagination"
import CardsSkeleton from "../../../components/Skeleton/CardsSkeleton"
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
import {
  getMySubmission,
  listSubmissions,
  returnSubmission,
  saveMySubmission,
  submitMySubmission,
  type SaveSubmissionBody,
  type SubmissionDto,
  type SubmissionStatus,
  type SubmissionStudent
} from "./services/submissions.api"
import { deleteGrade, upsertGrade } from "./services/grades.api"
import styles from "./AssignmentPage.module.css"

type FormState = {
  title: string
  description: string
  material_url: string
  due_at: string
  max_grade: string
}

// Сколько решений студентов показываем на странице у преподавателя
const SUBS_LIMIT = 8

// Подписи и цветовые классы статусов решения
const STATUS_LABELS: Record<SubmissionStatus, string> = {
  draft: "Черновик",
  submitted: "Отправлено",
  returned: "Возвращено",
  graded: "Оценено"
}

const STATUS_CLASS: Record<SubmissionStatus, string> = {
  draft: styles.badgeDraft,
  submitted: styles.badgeSubmitted,
  returned: styles.badgeReturned,
  graded: styles.badgeGraded
}

// Фильтры списка решений у преподавателя
const FILTERS: Array<{ label: string; value: SubmissionStatus | null }> = [
  { label: "Все", value: null },
  { label: "Отправленные", value: "submitted" },
  { label: "Возвращённые", value: "returned" },
  { label: "Оценённые", value: "graded" }
]

// Бейдж статуса решения
function StatusBadge({ status }: { status: SubmissionStatus }) {
  return <span className={`${styles.badge} ${STATUS_CLASS[status]}`}>{STATUS_LABELS[status]}</span>
}

// Имя студента или email, если имя не заполнено
function studentName(student: SubmissionStudent) {
  return `${student.first_name ?? ""} ${student.last_name ?? ""}`.trim() || student.email
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

  // Флаг отправки запроса (для модалок задания)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Поля формы редактирования и начальное состояние для сравнения
  const [form, setForm] = useState<FormState>({ title: "", description: "", material_url: "", due_at: "", max_grade: "" })
  const [initialForm, setInitialForm] = useState<FormState>({ title: "", description: "", material_url: "", due_at: "", max_grade: "" })

  // ── Состояние студента: моё решение ──
  const [mySubmission, setMySubmission] = useState<SubmissionDto | null>(null)
  const [isMyLoading, setIsMyLoading] = useState(true)
  const [answerText, setAnswerText] = useState("")
  const [attachmentUrl, setAttachmentUrl] = useState("")
  const [isSavingDraft, setIsSavingDraft] = useState(false)
  const [isSendingWork, setIsSendingWork] = useState(false)

  // ── Состояние преподавателя: список решений ──
  const [submissions, setSubmissions] = useState<SubmissionDto[]>([])
  const [isSubsLoading, setIsSubsLoading] = useState(true)
  const [subsPage, setSubsPage] = useState(1)
  const [subsTotal, setSubsTotal] = useState(0)
  const [statusFilter, setStatusFilter] = useState<SubmissionStatus | null>(null)

  // Решение, открытое для проверки, и поля формы оценки/возврата
  const [selected, setSelected] = useState<SubmissionDto | null>(null)
  const [gradeValue, setGradeValue] = useState("")
  const [gradeComment, setGradeComment] = useState("")
  const [returnMode, setReturnMode] = useState(false)
  const [returnComment, setReturnComment] = useState("")
  const [isGrading, setIsGrading] = useState(false)
  const [isRemovingGrade, setIsRemovingGrade] = useState(false)
  const [isReturning, setIsReturning] = useState(false)

  const parsedClassId = Number(classId)
  const parsedAssignmentId = Number(assignmentId)

  const canManage = classDetail?.permissions.can_create_assignment ?? false
  const canSubmit = classDetail?.permissions.can_submit_solution ?? false
  const canGrade = classDetail?.permissions.can_grade_submissions ?? false

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

  // Загрузка своего решения (только у студента)
  useEffect(() => {
    if (!canSubmit || !parsedAssignmentId) {
      setIsMyLoading(false)
      return
    }

    async function load() {
      setIsMyLoading(true)
      try {
        const data = await getMySubmission(parsedAssignmentId)
        setMySubmission(data)
        setAnswerText(data?.answer_text ?? "")
        setAttachmentUrl(data?.attachment_url ?? "")
      } catch (error) {
        if (error instanceof ApiSilentError) return
        showToast({ type: "error", message: (error as Error).message })
      } finally {
        setIsMyLoading(false)
      }
    }

    void load()
  }, [canSubmit, parsedAssignmentId])

  // Загрузка списка решений (только у преподавателя), реагирует на фильтр
  useEffect(() => {
    if (!canGrade || !parsedAssignmentId) {
      setIsSubsLoading(false)
      return
    }

    void loadSubmissions(1, statusFilter)
  }, [canGrade, parsedAssignmentId, statusFilter])

  // Загрузка страницы решений с учётом фильтра по статусу
  async function loadSubmissions(page: number, status: SubmissionStatus | null) {
    setIsSubsLoading(true)
    try {
      const data = await listSubmissions(parsedAssignmentId, page, SUBS_LIMIT, status)
      setSubmissions(data.items)
      setSubsTotal(data.total)
      setSubsPage(page)
    } catch (error) {
      if (error instanceof ApiSilentError) return
      showToast({ type: "error", message: (error as Error).message })
    } finally {
      setIsSubsLoading(false)
    }
  }

  // Переход к списку заданий
  function goBack() {
    navigate(`/classes/${classId}/assignments`)
  }

  // Закрытие активной модалки задания
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

  // Обновление одного поля формы задания
  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  // Оптимистичное редактирование задания с роллбэком при ошибке
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

  // Удаление задания с навигацией назад при успехе
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

  // ── Действия студента ──

  // Тело сохранения/отправки из полей формы
  function buildSubmissionBody(): SaveSubmissionBody {
    return { answer_text: answerText.trim(), attachment_url: attachmentUrl.trim() || null }
  }

  // Сохранить черновик решения
  async function onSaveDraft() {
    if (isStudentBusy) return
    setIsSavingDraft(true)
    try {
      const saved = await saveMySubmission(parsedAssignmentId, buildSubmissionBody())
      setMySubmission(saved)
      showToast({ type: "neutral", message: "Черновик сохранён" })
    } catch (error) {
      showToast({ type: "error", message: (error as Error).message })
    } finally {
      setIsSavingDraft(false)
    }
  }

  // Отправить решение на проверку
  async function onSubmitWork() {
    if (isStudentBusy) return
    setIsSendingWork(true)
    try {
      await saveMySubmission(parsedAssignmentId, buildSubmissionBody())
      const sent = await submitMySubmission(parsedAssignmentId)
      setMySubmission(sent)
      showToast({ type: "neutral", message: "Решение отправлено на проверку" })
    } catch (error) {
      showToast({ type: "error", message: (error as Error).message })
    } finally {
      setIsSendingWork(false)
    }
  }

  // ── Действия преподавателя ──

  // Открыть решение на проверку и заполнить поля формы оценки
  function openReview(submission: SubmissionDto) {
    setSelected(submission)
    setGradeValue(submission.grade ? String(submission.grade.value) : "")
    setGradeComment(submission.grade?.comment ?? "")
    setReturnMode(false)
    setReturnComment("")
  }

  // Закрыть окно проверки
  function closeReview() {
    if (isReviewBusy) return
    setSelected(null)
    setReturnMode(false)
  }

  // Обновить решение в списке и в открытом окне
  function updateInList(updated: SubmissionDto) {
    setSubmissions((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
    setSelected(updated)
  }

  // Выставить/обновить оценку
  async function onSaveGrade() {
    if (!selected || !canSaveGrade) return
    setIsGrading(true)
    try {
      const grade = await upsertGrade(selected.id, { value: Number(gradeValue), comment: gradeComment.trim() || null })
      const updated: SubmissionDto = {
        ...selected,
        status: "graded",
        return_comment: null,
        grade: { value: grade.value, comment: grade.comment, graded_at: grade.graded_at, updated_at: grade.updated_at }
      }
      updateInList(updated)
      showToast({ type: "neutral", message: "Оценка сохранена" })
      void loadSubmissions(subsPage, statusFilter)
    } catch (error) {
      showToast({ type: "error", message: (error as Error).message })
    } finally {
      setIsGrading(false)
    }
  }

  // Снять оценку
  async function onRemoveGrade() {
    if (!selected || isReviewBusy) return
    setIsRemovingGrade(true)
    try {
      const updated = await deleteGrade(selected.id)
      updateInList(updated)
      setGradeValue("")
      setGradeComment("")
      showToast({ type: "neutral", message: "Оценка снята" })
      void loadSubmissions(subsPage, statusFilter)
    } catch (error) {
      showToast({ type: "error", message: (error as Error).message })
    } finally {
      setIsRemovingGrade(false)
    }
  }

  // Вернуть решение на доработку
  async function onReturn() {
    if (!selected || isReviewBusy) return
    setIsReturning(true)
    try {
      const updated = await returnSubmission(selected.id, returnComment.trim() || null)
      updateInList(updated)
      setReturnMode(false)
      showToast({ type: "neutral", message: "Решение возвращено на доработку" })
      void loadSubmissions(subsPage, statusFilter)
    } catch (error) {
      showToast({ type: "error", message: (error as Error).message })
    } finally {
      setIsReturning(false)
    }
  }

  // Производные флаги
  const isFormChanged =
    form.title.trim() !== initialForm.title.trim() ||
    form.description.trim() !== initialForm.description.trim() ||
    form.material_url.trim() !== initialForm.material_url.trim() ||
    form.due_at !== initialForm.due_at ||
    form.max_grade !== initialForm.max_grade
  const canSave = form.title.trim().length > 0 && Number(form.max_grade) > 0 && isFormChanged && !isSubmitting

  const isStudentBusy = isSavingDraft || isSendingWork
  const myStatus = mySubmission?.status ?? null
  // Редактировать можно только черновик, возвращённое или ещё не начатое решение
  const isMyEditable = myStatus === null || myStatus === "draft" || myStatus === "returned"
  const canSendWork = (answerText.trim().length > 0 || attachmentUrl.trim().length > 0) && !isStudentBusy

  const isReviewBusy = isGrading || isRemovingGrade || isReturning
  const gradeNum = Number(gradeValue)
  const maxGrade = assignment?.max_grade ?? 0
  const canSaveGrade =
    gradeValue.trim() !== "" &&
    Number.isFinite(gradeNum) &&
    gradeNum >= 0 &&
    gradeNum <= maxGrade &&
    !isReviewBusy

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

      {isLoading && <CardsSkeleton count={2} variant="feed" />}

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

      {/* ── Блок студента: моё решение ── */}
      {!isLoading && assignment && canSubmit && (
        <div className={styles.section}>
          <div className={styles.sectionHead}>
            <div className={styles.sectionTitle}>Моё решение</div>
            {mySubmission && <StatusBadge status={mySubmission.status} />}
          </div>

          {isMyLoading && <CardsSkeleton count={1} variant="feed" />}

          {!isMyLoading && (
            <div className={styles.submissionBox}>
              {/* Комментарий преподавателя при возврате на доработку */}
              {myStatus === "returned" && mySubmission?.return_comment && (
                <div className={styles.returnNote}>
                  <div className={styles.returnNoteLabel}>Возвращено на доработку</div>
                  <div>{mySubmission.return_comment}</div>
                </div>
              )}

              {isMyEditable ? (
                <>
                  <label className={styles.field}>
                    <div className={styles.fieldLabel}>Ответ <span className={styles.fieldOptional}>(текст решения)</span></div>
                    <textarea
                      className={styles.textarea}
                      value={answerText}
                      onChange={(e) => setAnswerText(e.target.value)}
                      placeholder="Введите ответ или прикрепите ссылку на файл ниже"
                      disabled={isStudentBusy}
                    />
                  </label>

                  <label className={styles.field}>
                    <div className={styles.fieldLabel}>Ссылка на файл <span className={styles.fieldOptional}>(необязательно)</span></div>
                    <input
                      className={styles.input}
                      type="url"
                      value={attachmentUrl}
                      onChange={(e) => setAttachmentUrl(e.target.value)}
                      placeholder="https://..."
                      disabled={isStudentBusy}
                    />
                  </label>

                  <div className={styles.submissionActions}>
                    <button className={styles.secondaryButton} type="button" onClick={() => void onSaveDraft()} disabled={isStudentBusy}>
                      {isSavingDraft ? "Сохраняем..." : "Сохранить черновик"}
                    </button>
                    <button className={styles.primaryButton} type="button" onClick={() => void onSubmitWork()} disabled={!canSendWork}>
                      {isSendingWork ? "Отправляем..." : "Отправить на проверку"}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  {mySubmission?.answer_text && <div className={styles.readonlyAnswer}>{mySubmission.answer_text}</div>}

                  {mySubmission?.attachment_url && (
                    <a className={styles.submissionLink} href={mySubmission.attachment_url} target="_blank" rel="noopener noreferrer">
                      Прикреплённый файл →
                    </a>
                  )}

                  <div className={styles.meta}>
                    {mySubmission?.submitted_at && <div>Отправлено: {formatDateTime(mySubmission.submitted_at)}</div>}
                    {mySubmission?.is_late && <span className={styles.lateTag}>С опозданием</span>}
                  </div>

                  {myStatus === "submitted" && (
                    <div className={styles.sectionHint}>
                      Решение отправлено и ожидает проверки. Чтобы изменить ответ, попросите преподавателя вернуть его на доработку.
                    </div>
                  )}

                  {myStatus === "graded" && mySubmission?.grade && (
                    <div className={styles.gradeBox}>
                      <div className={styles.gradeValue}>{mySubmission.grade.value} / {assignment.max_grade} баллов</div>
                      {mySubmission.grade.comment && <div className={styles.gradeComment}>{mySubmission.grade.comment}</div>}
                      <div className={styles.gradeMeta}>Оценено: {formatDateTime(mySubmission.grade.graded_at)}</div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Блок преподавателя: решения студентов ── */}
      {!isLoading && assignment && canGrade && (
        <div className={styles.section}>
          <div className={styles.sectionHead}>
            <div className={styles.sectionTitle}>Решения студентов</div>
          </div>

          <div className={styles.filters}>
            {FILTERS.map((filter) => (
              <button
                key={filter.label}
                type="button"
                className={`${styles.filterChip} ${statusFilter === filter.value ? styles.filterChipActive : ""}`}
                onClick={() => setStatusFilter(filter.value)}
              >
                {filter.label}
              </button>
            ))}
          </div>

          {isSubsLoading && <CardsSkeleton count={2} variant="member" />}

          {!isSubsLoading && submissions.length > 0 && (
            <div className={styles.subList}>
              {submissions.map((submission) => (
                <button key={submission.id} type="button" className={styles.subCard} onClick={() => openReview(submission)}>
                  <div className={styles.subAvatar}>{studentName(submission.student)[0]}</div>
                  <div className={styles.subInfo}>
                    <div className={styles.subName}>{studentName(submission.student)}</div>
                    <div className={styles.subEmail}>{submission.student.email}</div>
                  </div>
                  <div className={styles.subMetaRow}>
                    {submission.is_late && <span className={styles.lateTag}>Опоздание</span>}
                    {submission.status === "graded" && submission.grade && (
                      <span className={styles.subGrade}>{submission.grade.value} / {assignment.max_grade}</span>
                    )}
                    <StatusBadge status={submission.status} />
                  </div>
                </button>
              ))}
            </div>
          )}

          {!isSubsLoading && submissions.length === 0 && <div className={styles.emptyMessage}>Решений пока нет</div>}

          <Pagination page={subsPage} total={subsTotal} limit={SUBS_LIMIT} onChange={(p) => void loadSubmissions(p, statusFilter)} />
        </div>
      )}

      <AnimatePresence>
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
      </AnimatePresence>

      <AnimatePresence>
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
      </AnimatePresence>

      {/* Окно проверки решения студента */}
      <AnimatePresence>
        {canGrade && selected && (
        <Modal title="Решение студента" onClose={closeReview} disabled={isReviewBusy}>
          <div className={styles.reviewHead}>
            <div className={styles.subName}>{studentName(selected.student)}</div>
            <StatusBadge status={selected.status} />
          </div>

          <div className={styles.reviewBlock}>
            <div className={styles.reviewLabel}>Ответ</div>
            {selected.answer_text ? (
              <div className={styles.readonlyAnswer}>{selected.answer_text}</div>
            ) : (
              <div className={styles.reviewMuted}>Текст не приложен</div>
            )}
          </div>

          {selected.attachment_url && (
            <a className={styles.submissionLink} href={selected.attachment_url} target="_blank" rel="noopener noreferrer">
              Прикреплённый файл →
            </a>
          )}

          <div className={styles.meta}>
            {selected.submitted_at && <div>Отправлено: {formatDateTime(selected.submitted_at)}</div>}
            {selected.is_late && <span className={styles.lateTag}>С опозданием</span>}
          </div>

          {/* Оценивать и возвращать можно только отправленное или оценённое решение */}
          {selected.status === "returned" && (
            <div className={styles.reviewNote}>Решение возвращено студенту на доработку. Дождитесь повторной отправки.</div>
          )}
          {selected.status === "draft" && (
            <div className={styles.reviewNote}>Студент ещё не отправил решение — это черновик.</div>
          )}

          {returnMode ? (
            <>
              <label className={styles.field}>
                <div className={styles.fieldLabel}>Комментарий к возврату <span className={styles.fieldOptional}>(необязательно)</span></div>
                <textarea
                  className={styles.textarea}
                  value={returnComment}
                  onChange={(e) => setReturnComment(e.target.value)}
                  placeholder="Что нужно доработать..."
                  disabled={isReviewBusy}
                />
              </label>
              <div className={styles.modalActions}>
                <button className={styles.secondaryButton} type="button" onClick={() => setReturnMode(false)} disabled={isReviewBusy}>
                  Отмена
                </button>
                <button className={styles.dangerButton} type="button" onClick={() => void onReturn()} disabled={isReviewBusy}>
                  {isReturning ? "Возвращаем..." : "Вернуть на доработку"}
                </button>
              </div>
            </>
          ) : (selected.status === "submitted" || selected.status === "graded") && (
            <>
              <label className={styles.field}>
                <div className={styles.fieldLabel}>Оценка <span className={styles.fieldOptional}>(макс. {assignment?.max_grade})</span></div>
                <input
                  className={styles.input}
                  type="number"
                  min="0"
                  max={assignment?.max_grade}
                  value={gradeValue}
                  onChange={(e) => setGradeValue(e.target.value)}
                  placeholder="0"
                  disabled={isReviewBusy}
                />
              </label>

              <label className={styles.field}>
                <div className={styles.fieldLabel}>Комментарий <span className={styles.fieldOptional}>(необязательно)</span></div>
                <textarea
                  className={styles.textarea}
                  value={gradeComment}
                  onChange={(e) => setGradeComment(e.target.value)}
                  disabled={isReviewBusy}
                />
              </label>

              <div className={styles.reviewActions}>
                <button className={styles.secondaryButton} type="button" onClick={() => setReturnMode(true)} disabled={isReviewBusy}>
                  Вернуть на доработку
                </button>
                <div className={styles.reviewActionsRight}>
                  {selected.status === "graded" && (
                    <button className={styles.dangerButton} type="button" onClick={() => void onRemoveGrade()} disabled={isReviewBusy}>
                      {isRemovingGrade ? "Снимаем..." : "Снять оценку"}
                    </button>
                  )}
                  <button className={styles.primaryButton} type="button" onClick={() => void onSaveGrade()} disabled={!canSaveGrade}>
                    {isGrading ? "Сохраняем..." : "Сохранить оценку"}
                  </button>
                </div>
              </div>
            </>
          )}
        </Modal>
        )}
      </AnimatePresence>
    </div>
  )
}
