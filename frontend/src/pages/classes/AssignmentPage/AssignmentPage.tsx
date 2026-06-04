import { useEffect, useState } from "react"
import { AnimatePresence } from "framer-motion"
import { useNavigate, useOutletContext, useParams } from "react-router-dom"
import ArrowIcon from "../../../assets/icons/classes/arrow.svg?react"
import DeleteIcon from "../../../assets/icons/classes/delete.svg?react"
import EditIcon from "../../../assets/icons/classes/settings.svg?react"
import Modal from "../../../components/Modal/Modal"
import Pagination from "../../../components/Pagination/Pagination"
import { useToast } from "../../../components/Toast/ToastProvider"
import { ApiError } from "../../../services/api"
import {
  ACCEPTED_FILE_INPUT,
  ACCEPTED_FILE_TYPES_LABEL,
  downloadStoredFile,
  formatFileSize,
  validateUploadFile
} from "../../../services/files.api"
import {
  currentDateTimeInputValue,
  formatDateTime,
  formatDateTimeInputValue,
  isPastDateTimeInputValue,
  toApiDateTime
} from "../../../services/helpers"
import FilePicker from "../../../components/FilePicker/FilePicker"
import type { ClassLayoutContext } from "../../../layouts/ClassLayout/ClassLayout"
import {
  deleteAssignmentMaterial,
  deleteAssignment,
  getAssignment,
  updateAssignment,
  uploadAssignmentMaterial,
  type AssignmentDto
} from "../AssignmentsPage/services/assignments.api"
import {
  deleteSubmissionAttachment,
  getMySubmission,
  listSubmissions,
  returnSubmission,
  saveMySubmission,
  submitMySubmission,
  uploadSubmissionAttachment,
  type SaveSubmissionBody,
  type SubmissionDto,
  type SubmissionStatus,
  type SubmissionStudent
} from "./services/submissions.api"
import { deleteGrade, upsertGrade } from "./services/grades.api"
import {
  AssignmentSkeletonLoader,
  MySubmissionSkeletonLoader,
  StudentSubmissionsSkeletonLoader
} from "./SkeletonLoader/SkeletonLoader"
import styles from "./AssignmentPage.module.css"

type FormState = {
  title: string
  description: string
  material_url: string
  due_at: string
  max_grade: string
}

type SubmissionFormState = {
  answer_text: string
  attachment_url: string
}

type ReviewFormState = {
  gradeValue: string
  gradeComment: string
  returnMode: boolean
  returnComment: string
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

  // Данные текущего задания
  const [assignment, setAssignment] = useState<AssignmentDto | null>(null)

  // Первичная загрузка страницы задания
  const [isLoading, setIsLoading] = useState(true)

  // Какая модалка задания сейчас открыта
  const [activeModal, setActiveModal] = useState<"edit" | "delete" | null>(null)

  // Идет ли запрос из модалки задания
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Текущие поля формы редактирования задания
  const [form, setForm] = useState<FormState>({ title: "", description: "", material_url: "", due_at: "", max_grade: "" })

  // Исходные поля формы редактирования для проверки изменений
  const [initialForm, setInitialForm] = useState<FormState>({ title: "", description: "", material_url: "", due_at: "", max_grade: "" })

  // Мое решение как студента
  const [mySubmission, setMySubmission] = useState<SubmissionDto | null>(null)

  // Первичная загрузка моего решения
  const [isMyLoading, setIsMyLoading] = useState(true)

  // Поля формы моего решения
  const [submissionForm, setSubmissionForm] = useState<SubmissionFormState>({ answer_text: "", attachment_url: "" })

  // Идет ли сохранение черновика
  const [isSavingDraft, setIsSavingDraft] = useState(false)

  // Идет ли отправка решения на проверку
  const [isSendingWork, setIsSendingWork] = useState(false)

  // Идет ли операция с файлом решения
  const [isAttachmentBusy, setIsAttachmentBusy] = useState(false)
  const [attachmentFileError, setAttachmentFileError] = useState("")

  // Идет ли операция с файлом материала задания
  const [isMaterialBusy, setIsMaterialBusy] = useState(false)
  const [materialFileError, setMaterialFileError] = useState("")

  // Текущий список решений студентов
  const [submissions, setSubmissions] = useState<SubmissionDto[]>([])

  // Первичная загрузка списка решений
  const [isSubsLoading, setIsSubsLoading] = useState(true)

  // Текущая страница списка решений
  const [subsPage, setSubsPage] = useState(1)

  // Общее число решений для пагинации
  const [subsTotal, setSubsTotal] = useState(0)

  // Активный фильтр списка решений по статусу
  const [statusFilter, setStatusFilter] = useState<SubmissionStatus | null>(null)

  // Решение, открытое преподавателем для проверки
  const [selected, setSelected] = useState<SubmissionDto | null>(null)

  // Поля формы оценки и возврата на доработку
  const [reviewForm, setReviewForm] = useState<ReviewFormState>({
    gradeValue: "",
    gradeComment: "",
    returnMode: false,
    returnComment: ""
  })

  // Идет ли сохранение оценки
  const [isGrading, setIsGrading] = useState(false)

  // Идет ли снятие оценки
  const [isRemovingGrade, setIsRemovingGrade] = useState(false)

  // Идет ли возврат решения на доработку
  const [isReturning, setIsReturning] = useState(false)

  const parsedClassId = Number(classId)
  const parsedAssignmentId = Number(assignmentId)

  const canEditAssignment = assignment?.can_edit ?? false
  const canDeleteAssignment = assignment?.can_delete ?? false
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
        if (error instanceof ApiError) {
          showToast({ type: "error", message: error.message })
          navigate(`/classes/${classId}/assignments`, { replace: true })
          return
        }
        throw error
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
        setSubmissionForm({
          answer_text: data?.answer_text ?? "",
          attachment_url: data?.attachment_url ?? ""
        })
      } catch (error) {
        if (error instanceof ApiError) {
          showToast({ type: "error", message: error.message })
          return
        }
        throw error
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
      if (error instanceof ApiError) {
        showToast({ type: "error", message: error.message })
        return
      }
      throw error
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
      due_at: formatDateTimeInputValue(assignment.due_at),
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

  // Редактирование задания: ждём ответ сервера и только потом закрываем модалку
  async function submitEdit() {
    if (!assignment || isSubmitting) return

    const title = form.title.trim()
    const maxGrade = Number(form.max_grade)
    if (!title || maxGrade <= 0) return

    setIsSubmitting(true)

    try {
      const updated = await updateAssignment(parsedClassId, parsedAssignmentId, {
        title,
        description: form.description.trim() || undefined,
        material_url: form.material_url.trim() || null,
        due_at: toApiDateTime(form.due_at),
        max_grade: maxGrade
      })
      setAssignment(updated)
      setActiveModal(null)
      showToast({ type: "neutral", message: "Задание обновлено" })
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

  // Удаление задания с навигацией назад при успехе
  async function submitDelete() {
    if (isSubmitting) return

    setIsSubmitting(true)

    try {
      await deleteAssignment(parsedClassId, parsedAssignmentId)
      showToast({ type: "neutral", message: "Задание удалено" })
      navigate(`/classes/${classId}/assignments`, { replace: true })
    } catch (error) {
      if (error instanceof ApiError) {
        showToast({ type: "error", message: error.message })
        setIsSubmitting(false)
        return
      }
      throw error
    }
  }

  // ── Действия студента ──

  // Тело сохранения/отправки из полей формы
  function buildSubmissionBody(): SaveSubmissionBody {
    return {
      answer_text: submissionForm.answer_text.trim(),
      attachment_url: submissionForm.attachment_url.trim() || null
    }
  }

  // Сохранить черновик решения
  async function onSaveDraft() {
    if (isStudentBusy || attachmentFileError) return
    setIsSavingDraft(true)
    try {
      const saved = await saveMySubmission(parsedAssignmentId, buildSubmissionBody())
      setMySubmission(saved)
      showToast({ type: "neutral", message: "Черновик сохранён" })
    } catch (error) {
      if (error instanceof ApiError) {
        showToast({ type: "error", message: error.message })
        return
      }
      throw error
    } finally {
      setIsSavingDraft(false)
    }
  }

  // Отправить решение на проверку
  async function onSubmitWork() {
    if (isStudentBusy || attachmentFileError) return
    setIsSendingWork(true)
    try {
      await saveMySubmission(parsedAssignmentId, buildSubmissionBody())
      const sent = await submitMySubmission(parsedAssignmentId)
      setMySubmission(sent)
      showToast({ type: "neutral", message: "Решение отправлено на проверку" })
    } catch (error) {
      if (error instanceof ApiError) {
        showToast({ type: "error", message: error.message })
        return
      }
      throw error
    } finally {
      setIsSendingWork(false)
    }
  }

  async function onUploadAttachment(file: File) {
    if (isStudentBusy || isAttachmentBusy) return
    setAttachmentFileError("")
    setIsAttachmentBusy(true)
    try {
      await uploadSubmissionAttachment(parsedAssignmentId, file)
      const updated = await getMySubmission(parsedAssignmentId)
      setMySubmission(updated)
      showToast({ type: "neutral", message: "Файл решения загружен" })
    } catch (error) {
      if (error instanceof ApiError) {
        setAttachmentFileError(error.message)
        return
      }
      throw error
    } finally {
      setIsAttachmentBusy(false)
    }
  }

  async function onDeleteAttachment() {
    if (isStudentBusy || isAttachmentBusy) return
    setIsAttachmentBusy(true)
    try {
      await deleteSubmissionAttachment(parsedAssignmentId)
      setMySubmission((prev) => (prev ? { ...prev, attachment_file: null } : prev))
      setAttachmentFileError("")
      showToast({ type: "neutral", message: "Файл решения удалён" })
    } catch (error) {
      if (error instanceof ApiError) {
        showToast({ type: "error", message: error.message })
        return
      }
      throw error
    } finally {
      setIsAttachmentBusy(false)
    }
  }

  async function onUploadMaterial(file: File) {
    if (!assignment || isMaterialBusy) return
    setMaterialFileError("")
    setIsMaterialBusy(true)
    try {
      const uploaded = await uploadAssignmentMaterial(parsedClassId, assignment.id, file)
      setAssignment({ ...assignment, material_file: uploaded })
      showToast({ type: "neutral", message: "Файл материала загружен" })
    } catch (error) {
      if (error instanceof ApiError) {
        setMaterialFileError(error.message)
        return
      }
      throw error
    } finally {
      setIsMaterialBusy(false)
    }
  }

  async function onDeleteMaterial() {
    if (!assignment || isMaterialBusy) return
    setIsMaterialBusy(true)
    try {
      await deleteAssignmentMaterial(parsedClassId, assignment.id)
      setAssignment({ ...assignment, material_file: null })
      setMaterialFileError("")
      showToast({ type: "neutral", message: "Файл материала удалён" })
    } catch (error) {
      if (error instanceof ApiError) {
        showToast({ type: "error", message: error.message })
        return
      }
      throw error
    } finally {
      setIsMaterialBusy(false)
    }
  }

  // Выбор файла материала задания
  function onMaterialFileChange(file: File) {
    setMaterialFileError("")

    const error = validateUploadFile(file)
    if (error) {
      setMaterialFileError(error)
      return
    }

    void onUploadMaterial(file)
  }

  // Выбор файла решения студента
  function onSubmissionFileChange(file: File) {
    setAttachmentFileError("")

    const error = validateUploadFile(file)
    if (error) {
      setAttachmentFileError(error)
      return
    }

    void onUploadAttachment(file)
  }

  // ── Действия преподавателя ──

  // Открыть решение на проверку и заполнить поля формы оценки
  function openReview(submission: SubmissionDto) {
    setSelected(submission)
    setReviewForm({
      gradeValue: submission.grade ? String(submission.grade.value) : "",
      gradeComment: submission.grade?.comment ?? "",
      returnMode: false,
      returnComment: ""
    })
  }

  // Закрыть окно проверки
  function closeReview() {
    if (isReviewBusy) return
    setSelected(null)
    setReviewForm((prev) => ({ ...prev, returnMode: false }))
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
      const grade = await upsertGrade(selected.id, {
        value: Number(reviewForm.gradeValue),
        comment: reviewForm.gradeComment.trim() || null
      })
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
      if (error instanceof ApiError) {
        showToast({ type: "error", message: error.message })
        return
      }
      throw error
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
      setReviewForm((prev) => ({ ...prev, gradeValue: "", gradeComment: "" }))
      showToast({ type: "neutral", message: "Оценка снята" })
      void loadSubmissions(subsPage, statusFilter)
    } catch (error) {
      if (error instanceof ApiError) {
        showToast({ type: "error", message: error.message })
        return
      }
      throw error
    } finally {
      setIsRemovingGrade(false)
    }
  }

  // Вернуть решение на доработку
  async function onReturn() {
    if (!selected || isReviewBusy) return
    setIsReturning(true)
    try {
      const updated = await returnSubmission(selected.id, reviewForm.returnComment.trim() || null)
      updateInList(updated)
      setReviewForm((prev) => ({ ...prev, returnMode: false }))
      showToast({ type: "neutral", message: "Решение возвращено на доработку" })
      void loadSubmissions(subsPage, statusFilter)
    } catch (error) {
      if (error instanceof ApiError) {
        showToast({ type: "error", message: error.message })
        return
      }
      throw error
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
  const dueAtError = isPastDateTimeInputValue(form.due_at) ? "Дедлайн не может быть в прошлом" : ""
  const minDueAt = currentDateTimeInputValue()
  const canSave = form.title.trim().length > 0 && Number(form.max_grade) > 0 && !dueAtError && isFormChanged && !isSubmitting

  const isStudentBusy = isSavingDraft || isSendingWork
  const myStatus = mySubmission?.status ?? null
  // Редактировать можно только черновик, возвращённое или ещё не начатое решение
  const isMyEditable = myStatus === null || myStatus === "draft" || myStatus === "returned"
  const canSendWork = (
    submissionForm.answer_text.trim().length > 0 ||
    submissionForm.attachment_url.trim().length > 0 ||
    Boolean(mySubmission?.attachment_file)
  ) && !attachmentFileError && !isStudentBusy && !isAttachmentBusy

  const isReviewBusy = isGrading || isRemovingGrade || isReturning
  const gradeNum = Number(reviewForm.gradeValue)
  const maxGrade = assignment?.max_grade ?? 0
  const canSaveGrade =
    reviewForm.gradeValue.trim() !== "" &&
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

        {!isLoading && assignment && (canEditAssignment || canDeleteAssignment) && (
          <div className={styles.pageActions}>
            {canEditAssignment && (
              <button className={styles.secondaryButton} type="button" onClick={openEditModal}>
                <EditIcon className={styles.buttonIcon} />
                Редактировать
              </button>
            )}
            {canDeleteAssignment && (
              <button className={styles.dangerButton} type="button" onClick={() => setActiveModal("delete")}>
                <DeleteIcon className={styles.buttonIcon} />
                Удалить
              </button>
            )}
          </div>
        )}
      </div>

      {isLoading && <AssignmentSkeletonLoader />}

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

          {assignment.material_file && (
            <button
              className={styles.materialLink}
              type="button"
              onClick={() => void downloadStoredFile(assignment.material_file!)}
            >
              Скачать {assignment.material_file.name} ({formatFileSize(assignment.material_file.size)})
            </button>
          )}

          {canEditAssignment && (
            <FilePicker
              label="Загрузить файл материала"
              busy={isMaterialBusy}
              accept={ACCEPTED_FILE_INPUT}
              hint={`Доступные форматы: ${ACCEPTED_FILE_TYPES_LABEL}`}
              file={assignment.material_file ? { name: assignment.material_file.name, size: assignment.material_file.size } : null}
              onRemove={() => void onDeleteMaterial()}
              removeTitle="Удалить файл материала"
              onSelect={onMaterialFileChange}
              error={materialFileError}
            />
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

          {isMyLoading && <MySubmissionSkeletonLoader />}

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
                      value={submissionForm.answer_text}
                      onChange={(e) => setSubmissionForm((prev) => ({ ...prev, answer_text: e.target.value }))}
                      placeholder="Введите ответ или прикрепите ссылку на файл ниже"
                      disabled={isStudentBusy}
                    />
                  </label>

                  <FilePicker
                    label="Загрузить файл решения"
                    busy={isAttachmentBusy}
                    accept={ACCEPTED_FILE_INPUT}
                    hint={`Доступные форматы: ${ACCEPTED_FILE_TYPES_LABEL}`}
                    file={mySubmission?.attachment_file ? { name: mySubmission.attachment_file.name, size: mySubmission.attachment_file.size } : null}
                    onDownload={() => void downloadStoredFile(mySubmission!.attachment_file!)}
                    onRemove={() => void onDeleteAttachment()}
                    removeTitle="Удалить файл решения"
                    onSelect={onSubmissionFileChange}
                    error={attachmentFileError}
                    disabled={isStudentBusy}
                  />

                  <label className={styles.field}>
                    <div className={styles.fieldLabel}>Ссылка на файл <span className={styles.fieldOptional}>(необязательно)</span></div>
                    <input
                      className={styles.input}
                      type="url"
                      value={submissionForm.attachment_url}
                      onChange={(e) => setSubmissionForm((prev) => ({ ...prev, attachment_url: e.target.value }))}
                      placeholder="https://..."
                      disabled={isStudentBusy}
                    />
                  </label>

                  <div className={styles.submissionActions}>
                    <button className={styles.secondaryButton} type="button" onClick={() => void onSaveDraft()} disabled={isStudentBusy || Boolean(attachmentFileError)}>
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

                  {mySubmission?.attachment_file && (
                    <button className={styles.submissionLink} type="button" onClick={() => void downloadStoredFile(mySubmission.attachment_file!)}>
                      Скачать {mySubmission.attachment_file.name} ({formatFileSize(mySubmission.attachment_file.size)})
                    </button>
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

          {isSubsLoading && <StudentSubmissionsSkeletonLoader />}

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
        {canEditAssignment && activeModal === "edit" && (
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
        {canDeleteAssignment && activeModal === "delete" && (
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

          {selected.attachment_file && (
            <button className={styles.submissionLink} type="button" onClick={() => void downloadStoredFile(selected.attachment_file!)}>
              Скачать {selected.attachment_file.name} ({formatFileSize(selected.attachment_file.size)})
            </button>
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

          {reviewForm.returnMode ? (
            <>
              <label className={styles.field}>
                <div className={styles.fieldLabel}>Комментарий к возврату <span className={styles.fieldOptional}>(необязательно)</span></div>
                <textarea
                  className={styles.textarea}
                  value={reviewForm.returnComment}
                  onChange={(e) => setReviewForm((prev) => ({ ...prev, returnComment: e.target.value }))}
                  placeholder="Что нужно доработать..."
                  disabled={isReviewBusy}
                />
              </label>
              <div className={styles.modalActions}>
                <button
                  className={styles.secondaryButton}
                  type="button"
                  onClick={() => setReviewForm((prev) => ({ ...prev, returnMode: false }))}
                  disabled={isReviewBusy}
                >
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
                  value={reviewForm.gradeValue}
                  onChange={(e) => setReviewForm((prev) => ({ ...prev, gradeValue: e.target.value }))}
                  placeholder="0"
                  disabled={isReviewBusy}
                />
              </label>

              <label className={styles.field}>
                <div className={styles.fieldLabel}>Комментарий <span className={styles.fieldOptional}>(необязательно)</span></div>
                <textarea
                  className={styles.textarea}
                  value={reviewForm.gradeComment}
                  onChange={(e) => setReviewForm((prev) => ({ ...prev, gradeComment: e.target.value }))}
                  disabled={isReviewBusy}
                />
              </label>

              <div className={styles.reviewActions}>
                <button
                  className={styles.secondaryButton}
                  type="button"
                  onClick={() => setReviewForm((prev) => ({ ...prev, returnMode: true }))}
                  disabled={isReviewBusy}
                >
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
