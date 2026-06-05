import { useEffect, useState } from "react"
import { AnimatePresence } from "framer-motion"
import { useNavigate, useParams } from "react-router-dom"
import ArrowIcon from "../../../assets/icons/classes/arrow.svg?react"
import DeleteIcon from "../../../assets/icons/classes/delete.svg?react"
import EditIcon from "../../../assets/icons/classes/settings.svg?react"
import Modal from "../../../components/Modal/Modal"
import { useToast } from "../../../components/Toast/useToast"
import { useDelayedLoading } from "../../../hooks/useDelayedLoading"
import { ApiError } from "../../../services/api"
import {
  ACCEPTED_FILE_INPUT,
  ACCEPTED_FILE_TYPES_LABEL,
  downloadStoredFile,
  formatFileSize,
  type StoredFileDto,
  validateUploadFile
} from "../../../services/files.api"
import { formatDateTime } from "../../../services/helpers"
import FilePicker from "../../../components/FilePicker/FilePicker"
import {
  getAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  deleteAnnouncementMaterial,
  uploadAnnouncementMaterial,
  type AnnouncementDto
} from "../ClassAnnouncementsPage/services/announcement.api"
import SkeletonLoader from "./SkeletonLoader/SkeletonLoader"
import styles from "./AnnouncementPage.module.css"

type FormState = {
  title: string
  content: string
}

export default function AnnouncementPage() {
  const { classId, announcementId } = useParams<{ classId: string; announcementId: string }>()
  const navigate = useNavigate()
  const showToast = useToast()

  // Данные объявления
  const [announcement, setAnnouncement] = useState<AnnouncementDto | null>(null)

  // Лоадер страницы
  const [isLoading, setIsLoading] = useState(true)
  const [showSkeleton, setSkeletonLoading] = useDelayedLoading(350, false)

  // Активная модалка
  const [activeModal, setActiveModal] = useState<"edit" | "delete" | null>(null)

  // Флаг отправки запроса
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Поля формы редактирования и начальное состояние для сравнения
  const [form, setForm] = useState<FormState>({ title: "", content: "" })
  const [initialForm, setInitialForm] = useState<FormState>({ title: "", content: "" })

  // Файл объявления в окне редактирования
  const [materialFile, setMaterialFile] = useState<File | null>(null)
  const [shouldDeleteMaterialFile, setShouldDeleteMaterialFile] = useState(false)
  const [materialFileError, setMaterialFileError] = useState("")

  const parsedClassId = Number(classId)
  const parsedAnnouncementId = Number(announcementId)

  // Загрузка объявления по ID
  useEffect(() => {
    async function load() {
      if (!parsedClassId || !parsedAnnouncementId) {
        setIsLoading(false)
        setSkeletonLoading(false)
        return
      }

      setSkeletonLoading(true)
      try {
        const data = await getAnnouncement(parsedClassId, parsedAnnouncementId)
        setAnnouncement(data)
      } catch (error) {
        if (error instanceof ApiError) {
          showToast({ type: "error", message: error.message })
          navigate(`/classes/${classId}/announcements`, { replace: true })
          return
        }
        throw error
      } finally {
        setIsLoading(false)
        setSkeletonLoading(false)
      }
    }

    void load()
  }, [parsedClassId, parsedAnnouncementId])

  // Переход к списку объявлений
  function goBack() {
    navigate(`/classes/${classId}/announcements`)
  }

  // Закрытие активной модалки
  function closeModal() {
    if (isSubmitting) return
    setMaterialFile(null)
    setShouldDeleteMaterialFile(false)
    setMaterialFileError("")
    setActiveModal(null)
  }

  // Открытие модалки редактирования
  function openEditModal() {
    if (!announcement) return
    const saved = { title: announcement.title, content: announcement.content }
    setForm(saved)
    setInitialForm(saved)
    setMaterialFile(null)
    setShouldDeleteMaterialFile(false)
    setMaterialFileError("")
    setActiveModal("edit")
  }

  function onMaterialFileChange(file: File) {
    setMaterialFileError("")
    setMaterialFile(null)
    setShouldDeleteMaterialFile(false)

    const error = validateUploadFile(file)
    if (error) {
      setMaterialFileError(error)
      return
    }

    setMaterialFile(file)
  }

  function onRemoveMaterialFile() {
    if (materialFile) {
      setMaterialFile(null)
      setMaterialFileError("")
      return
    }

    setShouldDeleteMaterialFile(true)
    setMaterialFileError("")
  }

  async function onDownloadFile(file: StoredFileDto) {
    try {
      await downloadStoredFile(file)
    } catch (error) {
      if (error instanceof ApiError) {
        showToast({ type: "error", message: error.message })
        return
      }
      throw error
    }
  }

  // Редактирование: дожидаемся ответа сервера (нужно для операций с файлом)
  async function submitEdit() {
    if (!announcement || isSubmitting || materialFileError) return

    const nextTitle = form.title.trim()
    const nextContent = form.content.trim()
    if (!nextTitle || !nextContent) return

    setIsSubmitting(true)

    try {
      let uploadedMaterial: AnnouncementDto["material_file"] = null
      let isMaterialDeleted = false

      if (materialFile) {
        try {
          uploadedMaterial = await uploadAnnouncementMaterial(parsedClassId, parsedAnnouncementId, materialFile)
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
          await deleteAnnouncementMaterial(parsedClassId, parsedAnnouncementId)
          isMaterialDeleted = true
        } catch (error) {
          if (error instanceof ApiError) {
            setMaterialFileError(error.message)
            return
          }
          throw error
        }
      }

      let updated = await updateAnnouncement(parsedClassId, parsedAnnouncementId, { title: nextTitle, content: nextContent })
      if (uploadedMaterial) updated = { ...updated, material_file: uploadedMaterial }
      if (isMaterialDeleted) updated = { ...updated, material_file: null }
      setAnnouncement(updated)
      setMaterialFile(null)
      setShouldDeleteMaterialFile(false)
      setActiveModal(null)
      showToast({ type: "neutral", message: "Объявление обновлено" })
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

  // Удаление с навигацией назад при успехе
  async function submitDelete() {
    if (isSubmitting) return

    setIsSubmitting(true)

    try {
      await deleteAnnouncement(parsedClassId, parsedAnnouncementId)
      showToast({ type: "neutral", message: "Объявление удалено" })
      navigate(`/classes/${classId}/announcements`, { replace: true })
    } catch (error) {
      if (error instanceof ApiError) {
        showToast({ type: "error", message: error.message })
        setIsSubmitting(false)
        return
      }
      throw error
    }
  }

  const canEdit = announcement?.can_edit ?? false
  const canDelete = announcement?.can_delete ?? false
  const isFormChanged = form.title.trim() !== initialForm.title.trim() || form.content.trim() !== initialForm.content.trim()
  const displayedMaterialFile = materialFile
    ? { name: materialFile.name, size: materialFile.size }
    : announcement?.material_file && !shouldDeleteMaterialFile
      ? { name: announcement.material_file.name, size: announcement.material_file.size }
      : null
  const canSave =
    form.title.trim().length > 0 &&
    form.content.trim().length > 0 &&
    !materialFileError &&
    (isFormChanged || Boolean(materialFile) || shouldDeleteMaterialFile) &&
    !isSubmitting

  return (
    <div className={styles.page}>
      <div className={styles.pageHead}>
        <button className={styles.backButton} type="button" onClick={goBack}>
          <ArrowIcon className={styles.backIcon} />
          Все объявления
        </button>

        {!isLoading && announcement && (canEdit || canDelete) && (
          <div className={styles.pageActions}>
            {canEdit && (
              <button className={styles.secondaryButton} type="button" onClick={openEditModal}>
                <EditIcon className={styles.buttonIcon} />
                Редактировать
              </button>
            )}
            {canDelete && (
              <button className={styles.dangerButton} type="button" onClick={() => setActiveModal("delete")}>
                <DeleteIcon className={styles.buttonIcon} />
                Удалить
              </button>
            )}
          </div>
        )}
      </div>

      {showSkeleton && <SkeletonLoader />}

      {!isLoading && announcement && (
        <div className={styles.card}>
          <div className={styles.title}>{announcement.title}</div>

          <div className={styles.content}>{announcement.content}</div>

          {announcement.material_file && (
            <button
              className={styles.materialLink}
              type="button"
              onClick={() => void onDownloadFile(announcement.material_file!)}
            >
              Скачать {announcement.material_file.name} ({formatFileSize(announcement.material_file.size)})
            </button>
          )}

          <div className={styles.meta}>
            <div>{announcement.author.email}</div>
            <div>{formatDateTime(announcement.created_at)}</div>
            {announcement.updated_at && announcement.updated_at !== announcement.created_at && (
              <div>изменено {formatDateTime(announcement.updated_at)}</div>
            )}
          </div>
        </div>
      )}

      <AnimatePresence>
        {canEdit && activeModal === "edit" && (
        <Modal title="Редактировать объявление" onClose={closeModal} disabled={isSubmitting} size="lg">
          <label className={styles.field}>
            <div className={styles.fieldLabel}>Заголовок</div>
            <input
              className={styles.input}
              type="text"
              value={form.title}
              onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
              disabled={isSubmitting}
            />
          </label>

          <label className={styles.field}>
            <div className={styles.fieldLabel}>Текст объявления</div>
            <textarea
              className={styles.textarea}
              value={form.content}
              onChange={(e) => setForm((prev) => ({ ...prev, content: e.target.value }))}
              disabled={isSubmitting}
            />
          </label>

          <div className={styles.field}>
            <div className={styles.fieldLabel}>Файл <span className={styles.fieldOptional}>(необязательно, до 20 МБ)</span></div>
            <FilePicker
              label="Загрузить файл объявления"
              busy={isSubmitting && (Boolean(materialFile) || shouldDeleteMaterialFile)}
              accept={ACCEPTED_FILE_INPUT}
              hint={`Доступные форматы: ${ACCEPTED_FILE_TYPES_LABEL}`}
              file={displayedMaterialFile}
              onDownload={!materialFile && announcement?.material_file ? () => void onDownloadFile(announcement.material_file!) : undefined}
              onRemove={displayedMaterialFile ? onRemoveMaterialFile : undefined}
              removeTitle="Убрать файл объявления"
              onSelect={onMaterialFileChange}
              error={materialFileError}
              disabled={isSubmitting}
            />
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
        {canDelete && activeModal === "delete" && (
        <Modal title="Удалить объявление" onClose={closeModal} disabled={isSubmitting}>
          <div className={styles.modalText}>Вы точно хотите удалить объявление? Это действие нельзя отменить.</div>
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
    </div>
  )
}
