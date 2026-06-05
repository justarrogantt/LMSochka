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
import {
  ACCEPTED_FILE_INPUT,
  ACCEPTED_FILE_TYPES_LABEL,
  validateUploadFile
} from "../../../services/files.api"
import { formatDateTime, truncate } from "../../../services/helpers"
import { listContainer, listItem } from "../../../shared/motion"
import FilePicker from "../../../components/FilePicker/FilePicker"
import type { ClassLayoutContext } from "../../../layouts/ClassLayout/ClassLayout"
import {
  createAnnouncement,
  deleteAnnouncement,
  deleteAnnouncementMaterial,
  listAnnouncements,
  updateAnnouncement,
  uploadAnnouncementMaterial,
  type AnnouncementDto
} from "./services/announcement.api"
import SkeletonLoader from "./SkeletonLoader/SkeletonLoader"
import styles from "./ClassAnnouncementsPage.module.css"

const LIMIT = 10

type FormState = {
  title: string
  content: string
}

const EMPTY_FORM: FormState = { title: "", content: "" }

type AnnouncementCardProps = {
  item: AnnouncementDto
  onOpen: () => void
  onEdit: () => void
  onDelete: () => void
}

// Карточка-превью объявления в списке
function AnnouncementCard({ item, onOpen, onEdit, onDelete }: AnnouncementCardProps) {
  return (
    <div className={styles.card} onClick={onOpen}>
      <div className={styles.cardHead}>
        <div className={styles.cardTitle}>{truncate(item.title, 80)}</div>
        {(item.can_edit || item.can_delete) && (
          <div className={styles.cardActions} onClick={(e) => e.stopPropagation()}>
            {item.can_edit && (
              <button className={styles.iconButton} type="button" aria-label="Редактировать объявление" onClick={onEdit}>
                <EditIcon className={styles.icon} />
              </button>
            )}
            {item.can_delete && (
              <button className={styles.iconButton} type="button" aria-label="Удалить объявление" onClick={onDelete}>
                <DeleteIcon className={styles.icon} />
              </button>
            )}
          </div>
        )}
      </div>

      <div className={styles.content}>{truncate(item.content, 200)}</div>

      <div className={styles.meta}>
        <div>{item.author.email}</div>
        <div>{formatDateTime(item.created_at)}</div>
      </div>
    </div>
  )
}

export default function ClassAnnouncementsPage() {
  const { classDetail } = useOutletContext<ClassLayoutContext>()
  const { classId } = useParams<{ classId: string }>()
  const navigate = useNavigate()
  const showToast = useToast()

  // Объявления текущей страницы
  const [items, setItems] = useState<AnnouncementDto[]>([])

  // Лоадер страницы
  const [isLoading, setIsLoading] = useState(true)
  const [showSkeleton, setSkeletonLoading] = useDelayedLoading(350, false)

  // Пагинация: текущая страница и общее число объявлений
  const [currentPage, setCurrentPage] = useState(1)
  const [totalItems, setTotalItems] = useState(0)

  // Id редактируемого объявления (null — режим создания)
  const [editingId, setEditingId] = useState<number | null>(null)

  // Открыта ли модалка формы (создание/редактирование)
  const [isFormOpen, setIsFormOpen] = useState(false)

  // Id объявления, выбранного для удаления
  const [deletingId, setDeletingId] = useState<number | null>(null)

  // Флаг отправки запроса
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Поля формы и их исходное состояние (для блокировки кнопки до изменений)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [initialForm, setInitialForm] = useState<FormState>(EMPTY_FORM)

  // Файл объявления, выбранный в модалке
  const [materialFile, setMaterialFile] = useState<File | null>(null)
  const [shouldDeleteMaterialFile, setShouldDeleteMaterialFile] = useState(false)
  const [materialFileError, setMaterialFileError] = useState("")

  const editingItem = editingId === null ? null : items.find((item) => item.id === editingId) ?? null
  const currentMaterialFile = editingItem?.material_file && !shouldDeleteMaterialFile
    ? { name: editingItem.material_file.name, size: editingItem.material_file.size }
    : null
  const displayedMaterialFile = materialFile
    ? { name: materialFile.name, size: materialFile.size }
    : currentMaterialFile

  // Загрузка страницы объявлений
  async function loadPage(page: number) {
    if (!classDetail?.id) return
    setIsLoading(true)
    setSkeletonLoading(true)
    try {
      const data = await listAnnouncements(classDetail.id, page, LIMIT)
      setItems(data.items)
      setTotalItems(data.total)
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

  // Начальная загрузка при смене класса
  useEffect(() => {
    void loadPage(1)
  }, [classDetail?.id])

  function resetFormState() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setInitialForm(EMPTY_FORM)
    setMaterialFile(null)
    setShouldDeleteMaterialFile(false)
    setMaterialFileError("")
  }

  // Закрытие модалки формы
  function closeFormModal() {
    if (isSubmitting) return
    setIsFormOpen(false)
    resetFormState()
  }

  function finishFormModal() {
    setIsFormOpen(false)
    resetFormState()
  }

  // Закрытие модалки удаления
  function closeDeleteModal() {
    if (isSubmitting) return
    setDeletingId(null)
  }

  // Открытие модалки создания
  function openCreateModal() {
    resetFormState()
    setIsFormOpen(true)
  }

  // Открытие модалки редактирования
  function openEditModal(item: AnnouncementDto) {
    const saved = { title: item.title, content: item.content }
    setForm(saved)
    setInitialForm(saved)
    setEditingId(item.id)
    setMaterialFile(null)
    setShouldDeleteMaterialFile(false)
    setMaterialFileError("")
    setIsFormOpen(true)
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

  function onMaterialFileRemove() {
    if (materialFile) {
      setMaterialFile(null)
      setMaterialFileError("")
      return
    }

    setShouldDeleteMaterialFile(true)
    setMaterialFileError("")
  }

  async function deleteCreatedAnnouncementAfterFileError(announcementId: number) {
    if (!classDetail?.id) return
    try {
      await deleteAnnouncement(classDetail.id, announcementId)
    } catch (error) {
      if (error instanceof ApiError) {
        showToast({ type: "error", message: error.message })
        return
      }
      throw error
    }
  }

  // Создание объявления — перезагружаем первую страницу (меняется пагинация)
  async function submitCreate() {
    if (!classDetail?.id || materialFileError) return

    const title = form.title.trim()
    const content = form.content.trim()
    setIsSubmitting(true)
    let created: AnnouncementDto | null = null

    try {
      created = await createAnnouncement(classDetail.id, { title, content })
      if (materialFile) {
        try {
          await uploadAnnouncementMaterial(classDetail.id, created.id, materialFile)
        } catch (error) {
          await deleteCreatedAnnouncementAfterFileError(created.id)
          if (error instanceof ApiError) {
            setMaterialFileError(error.message)
            return
          }
          throw error
        }
      }
      showToast({ type: "neutral", message: "Объявление создано" })
      finishFormModal()
      void loadPage(1)
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

  // Редактирование — дожидаемся ответа сервера (нужно для операций с файлом)
  async function submitEdit() {
    if (!classDetail?.id || !editingId || materialFileError) return

    const id = editingId
    const nextTitle = form.title.trim()
    const nextContent = form.content.trim()
    setIsSubmitting(true)

    try {
      let uploadedMaterial: AnnouncementDto["material_file"] = null
      let isMaterialDeleted = false

      if (materialFile) {
        try {
          uploadedMaterial = await uploadAnnouncementMaterial(classDetail.id, id, materialFile)
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
          await deleteAnnouncementMaterial(classDetail.id, id)
          isMaterialDeleted = true
        } catch (error) {
          if (error instanceof ApiError) {
            setMaterialFileError(error.message)
            return
          }
          throw error
        }
      }

      let updated = await updateAnnouncement(classDetail.id, id, { title: nextTitle, content: nextContent })
      if (uploadedMaterial) updated = { ...updated, material_file: uploadedMaterial }
      if (isMaterialDeleted) updated = { ...updated, material_file: null }
      setItems((prev) => prev.map((it) => (it.id === updated.id ? updated : it)))
      showToast({ type: "neutral", message: "Объявление обновлено" })
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

  // Удаление объявления — перезагружаем страницу (меняется пагинация)
  async function submitDelete() {
    if (!classDetail?.id || !deletingId || isSubmitting) return
    setIsSubmitting(true)

    try {
      await deleteAnnouncement(classDetail.id, deletingId)
      setDeletingId(null)
      showToast({ type: "neutral", message: "Объявление удалено" })
      const nextPage = items.length === 1 && currentPage > 1 ? currentPage - 1 : currentPage
      void loadPage(nextPage)
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

  const isFilled = form.title.trim().length > 0 && form.content.trim().length > 0
  const isChanged = form.title.trim() !== initialForm.title.trim() || form.content.trim() !== initialForm.content.trim()
  const canSubmit =
    !isSubmitting &&
    !materialFileError &&
    isFilled &&
    (editingId === null || isChanged || materialFile !== null || shouldDeleteMaterialFile)
  const canManage = classDetail?.permissions.can_create_announcement ?? false

  return (
    <div className={styles.page}>
      <div className={styles.pageHead}>
        <div className={styles.titleBlock}>
          <div className={styles.title}>Объявления</div>
          <div className={styles.text}>Новости и важные сообщения для участников курса.</div>
        </div>

        {canManage && (
          <button className={styles.primaryButton} type="button" onClick={openCreateModal}>
            <AddIcon className={styles.buttonIcon} />
            Создать объявление
          </button>
        )}
      </div>

      {showSkeleton && <SkeletonLoader showActions={canManage} />}

      {!isLoading && (
        <>
        {items.length === 0 ? (
          <div className={styles.emptyMessage}>Объявлений пока нет</div>
        ) : (
          <motion.div className={styles.cards} variants={listContainer} initial="hidden" animate="visible">
            {items.map((item) => (
              <motion.div key={item.id} variants={listItem}>
                <AnnouncementCard
                  item={item}
                  onOpen={() => navigate(`/classes/${classId}/announcements/${item.id}`)}
                  onEdit={() => openEditModal(item)}
                  onDelete={() => setDeletingId(item.id)}
                />
              </motion.div>
            ))}
          </motion.div>
        )}
        </>
      )}

      <Pagination page={currentPage} total={totalItems} limit={LIMIT} onChange={(p) => void loadPage(p)} />

      <AnimatePresence>
        {canManage && isFormOpen && (
        <Modal title={editingId ? "Редактировать объявление" : "Создать объявление"} onClose={closeFormModal} disabled={isSubmitting} size="lg">
          <label className={styles.field}>
            <div className={styles.fieldLabel}>Заголовок</div>
            <input
              className={styles.input}
              type="text"
              value={form.title}
              onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
              placeholder="Например, Изменение дедлайна"
              disabled={isSubmitting}
            />
          </label>

          <label className={styles.field}>
            <div className={styles.fieldLabel}>Текст объявления</div>
            <textarea
              className={styles.textarea}
              value={form.content}
              onChange={(e) => setForm((prev) => ({ ...prev, content: e.target.value }))}
              placeholder="Текст объявления для участников курса"
              disabled={isSubmitting}
            />
          </label>

          <div className={styles.field}>
            <div className={styles.fieldLabel}>Файл <span className={styles.fieldOptional}>(необязательно, до 20 МБ)</span></div>
            <FilePicker
              label="Выберите файл объявления"
              busy={isSubmitting && (Boolean(materialFile) || shouldDeleteMaterialFile)}
              accept={ACCEPTED_FILE_INPUT}
              hint={`Доступные форматы: ${ACCEPTED_FILE_TYPES_LABEL}`}
              file={displayedMaterialFile}
              onSelect={onMaterialFileChange}
              onRemove={displayedMaterialFile ? onMaterialFileRemove : undefined}
              removeTitle="Убрать файл объявления"
              error={materialFileError}
              disabled={isSubmitting}
            />
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
              {isSubmitting ? "Сохраняем..." : editingId ? "Сохранить" : "Опубликовать"}
            </button>
          </div>
        </Modal>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {canManage && deletingId && (
        <Modal title="Удалить объявление" onClose={closeDeleteModal} disabled={isSubmitting}>
          <div className={styles.modalText}>Вы точно хотите удалить объявление? Это действие нельзя отменить.</div>
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
