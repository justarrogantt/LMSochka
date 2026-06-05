import { useEffect, useState, type CSSProperties } from "react"
import { AnimatePresence } from "framer-motion"
import { NavLink, Outlet, useLocation, useNavigate, useParams } from "react-router-dom"
import ArrowIcon from "../../assets/icons/classes/arrow.svg?react"
import DeleteIcon from "../../assets/icons/classes/delete.svg?react"
import EditIcon from "../../assets/icons/classes/settings.svg?react"
import ExitIcon from "../../assets/icons/layout/exit.svg?react"
import Modal from "../../components/Modal/Modal"
import { useToast } from "../../components/Toast/useToast"
import { useDelayedLoading } from "../../hooks/useDelayedLoading"
import OverviewSkeletonLoader from "../../pages/classes/ClassPage/SkeletonLoader/SkeletonLoader"
import MembersSkeletonLoader from "../../pages/classes/ClassMembersPage/SkeletonLoader/SkeletonLoader"
import AssignmentsSkeletonLoader from "../../pages/classes/AssignmentsPage/SkeletonLoader/SkeletonLoader"
import AnnouncementsSkeletonLoader from "../../pages/classes/ClassAnnouncementsPage/SkeletonLoader/SkeletonLoader"
import GradesSkeletonLoader from "../../pages/classes/GradesPage/SkeletonLoader/SkeletonLoader"
import copy from "copy-to-clipboard"
import { ApiError } from "../../services/api"
import { deleteClass, getClassDetail, leaveClass, updateClass, type ClassDetailDto, type ClassType } from "./services/class.api"
import styles from "./ClassLayout.module.css"

// Вкладки курса
const tabs = [
  { title: "Обзор", path: "" },
  { title: "Участники", path: "members" },
  { title: "Задания", path: "assignments" },
  { title: "Оценки", path: "grades" },
  { title: "Объявления", path: "announcements" }
]

// Скелетон под активную вкладку, пока грузятся данные курса
function classTabSkeleton(tabPath: string) {
  switch (tabPath) {
    case "members":
      return <MembersSkeletonLoader />
    case "assignments":
      return <AssignmentsSkeletonLoader />
    case "grades":
      return <GradesSkeletonLoader />
    case "announcements":
      return <AnnouncementsSkeletonLoader />
    default:
      return <OverviewSkeletonLoader />
  }
}

// Овал-скелетон для шапки курса, пока грузятся данные (заголовок, кнопки, код).
function Skeleton({ width, height, radius }: { width?: string | number; height?: string | number; radius?: string | number }) {
  const style: CSSProperties = { width, height, borderRadius: radius }
  return <span className={styles.skeleton} style={style} aria-hidden="true" />
}

type EditFormState = {
  name: string
  type: ClassType
}

// Контекст для вложенных вкладок курса
export type ClassLayoutContext = {
  classDetail: ClassDetailDto | null
  // Позволяет вкладкам обновить данные курса (например, после передачи прав владельца),
  // чтобы permissions и роль пересчитались без перезагрузки страницы.
  setClassDetail: (detail: ClassDetailDto) => void
}

export default function ClassLayout() {
  const { classId } = useParams<{ classId: string }>()
  const parsedClassId = Number(classId)
  const navigate = useNavigate()
  const showToast = useToast()
  const basePath = `/classes/${classId}`

  // Активная вкладка (по URL) — чтобы показать соответствующий скелетон при загрузке
  const { pathname } = useLocation()
  const activeTabPath = pathname.startsWith(basePath)
    ? pathname.slice(basePath.length).replace(/^\//, "")
    : ""

  // Данные курса
  const [classDetail, setClassDetail] = useState<ClassDetailDto | null>(null)

  // Лоадер страницы
  const [isLoading, setIsLoading] = useState(true)
  const [showSkeleton, setSkeletonLoading] = useDelayedLoading(350, false)

  // Открыта ли модалка удаления/выхода
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)

  // Открыта ли модалка редактирования
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)

  // Флаг отправки мутаций
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Поля формы редактирования
  const [editForm, setEditForm] = useState<EditFormState>({ name: "", type: "closed" })

  // Загрузка данных курса
  useEffect(() => {
    async function loadClass() {
      if (!Number.isFinite(parsedClassId)) {
        setIsLoading(false)
        setSkeletonLoading(false)
        return
      }

      setSkeletonLoading(true)
      try {
        const detail = await getClassDetail(parsedClassId)
        setClassDetail(detail)
        setEditForm({ name: detail.name, type: detail.type })
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

    void loadClass()
  }, [parsedClassId])

  // Копирование кода приглашения в буфер обмена
  function copyJoinCode() {
    if (!classDetail?.join_code) return
    copy(classDetail.join_code)
    showToast({ type: "neutral", message: "Код скопирован" })
  }

  // Открытие модалки редактирования
  function openEditModal() {
    if (!classDetail) return
    setEditForm({ name: classDetail.name, type: classDetail.type })
    setIsEditModalOpen(true)
  }

  // Редактирование курса с оптимистичным обновлением и роллбэком
  async function submitEditClass() {
    if (!classDetail || isSubmitting) return

    const nextName = editForm.name.trim()
    const nextType = editForm.type

    const prevDetail = classDetail
    setIsSubmitting(true)
    setIsEditModalOpen(false)
    setClassDetail({ ...classDetail, name: nextName, type: nextType })

    try {
      const updated = await updateClass(prevDetail.id, { name: nextName, type: nextType })
      setClassDetail(updated)
      setEditForm({ name: updated.name, type: updated.type })
      showToast({ type: "neutral", message: "Курс обновлен" })
    } catch (error) {
      setClassDetail(prevDetail)
      setEditForm({ name: prevDetail.name, type: prevDetail.type })
      if (error instanceof ApiError) {
        showToast({ type: "error", message: error.message })
        return
      }
      throw error
    } finally {
      setIsSubmitting(false)
    }
  }

  // Удаление курса (только создатель)
  async function submitDeleteClass() {
    if (!classDetail || isSubmitting) return
    setIsSubmitting(true)

    try {
      await deleteClass(classDetail.id)
      navigate("/classes", { replace: true })
    } catch (error) {
      if (error instanceof ApiError) {
        showToast({ type: "error", message: error.message })
        setIsSubmitting(false)
        return
      }
      throw error
    }
  }

  // Выход из курса (не создатель)
  async function submitLeaveClass() {
    if (!classDetail || isSubmitting) return
    setIsSubmitting(true)

    try {
      await leaveClass(classDetail.id)
      navigate("/classes", { replace: true })
    } catch (error) {
      if (error instanceof ApiError) {
        showToast({ type: "error", message: error.message })
        setIsSubmitting(false)
        return
      }
      throw error
    }
  }

  const canEditClass = classDetail?.permissions.can_edit_class ?? false
  const canDeleteClass = classDetail?.permissions.can_delete_class ?? false
  const canManageMembers = classDetail?.permissions.can_manage_members ?? false
  const isEditChanged = editForm.name.trim() !== (classDetail?.name ?? "").trim() || editForm.type !== classDetail?.type
  const canSaveEdit = editForm.name.trim().length > 0 && isEditChanged && !isSubmitting

  return (
    <div className={styles.page}>
      <div className={styles.classHead}>
        <div className={styles.titleBlock}>
          <button className={styles.backButton} type="button" onClick={() => navigate("/classes")}>
            <ArrowIcon className={styles.backIcon} />
            <div>Мои курсы</div>
          </button>
          {showSkeleton ? (
            <Skeleton width={240} height={32} radius={999} />
          ) : !isLoading ? (
            <div className={styles.title}>{classDetail?.name ?? "Курс"}</div>
          ) : null}
        </div>

        {showSkeleton ? (
          <div className={styles.actions}>
            {/* код приглашения и кнопки управления курсом — пока грузятся данные */}
            <Skeleton width={210} height={40} radius={10} />
            <Skeleton width={150} height={40} radius={10} />
            <Skeleton width={120} height={40} radius={10} />
          </div>
        ) : !isLoading ? (
          <div className={styles.actions}>
            {canManageMembers && classDetail?.type === "closed" && classDetail?.join_code && (
              <button className={styles.secondaryButton} type="button" onClick={copyJoinCode}>
                Код приглашения: {classDetail.join_code}
              </button>
            )}

            {canEditClass && (
              <button className={styles.secondaryButton} type="button" onClick={openEditModal}>
                <EditIcon className={styles.buttonIcon} />
                Редактировать
              </button>
            )}

            {canDeleteClass && (
              <button className={styles.dangerButton} type="button" onClick={() => setIsDeleteModalOpen(true)}>
                <DeleteIcon className={styles.buttonIcon} />
                Удалить
              </button>
            )}

            {!canDeleteClass && (
              <button className={styles.dangerButton} type="button" onClick={() => setIsDeleteModalOpen(true)}>
                <ExitIcon className={styles.buttonIcon} />
                Покинуть курс
              </button>
            )}
          </div>
        ) : null}
      </div>

      <div className={styles.tabs}>
        {tabs.map((tab) => (
          <NavLink
            className={({ isActive }) => `${styles.tab} ${isActive ? styles.tabActive : ""}`}
            to={tab.path ? `${basePath}/${tab.path}` : basePath}
            end={!tab.path}
            key={tab.title}
          >
            <div>{tab.title}</div>
          </NavLink>
        ))}
      </div>

      {showSkeleton ? (
        classTabSkeleton(activeTabPath)
      ) : !isLoading ? (
        <Outlet context={{ classDetail, setClassDetail } satisfies ClassLayoutContext} />
      ) : null}

      <AnimatePresence>
        {isDeleteModalOpen && (
        <Modal title={canDeleteClass ? "Удалить курс" : "Покинуть курс"} onClose={() => !isSubmitting && setIsDeleteModalOpen(false)} disabled={isSubmitting}>
          <div className={styles.modalText}>
            {canDeleteClass ? "Вы точно хотите удалить курс? Это действие нельзя отменить." : "Вы точно хотите покинуть курс?"}
          </div>
          <div className={styles.modalActions}>
            <button className={styles.secondaryButton} type="button" onClick={() => setIsDeleteModalOpen(false)} disabled={isSubmitting}>
              Отмена
            </button>
            {canDeleteClass ? (
              <button className={styles.dangerButton} type="button" onClick={() => void submitDeleteClass()} disabled={isSubmitting}>
                {isSubmitting ? "Удаляем..." : "Да, удалить"}
              </button>
            ) : (
              <button className={styles.dangerButton} type="button" onClick={() => void submitLeaveClass()} disabled={isSubmitting}>
                {isSubmitting ? "Выходим..." : "Да, покинуть"}
              </button>
            )}
          </div>
        </Modal>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isEditModalOpen && (
        <Modal title="Редактировать курс" onClose={() => !isSubmitting && setIsEditModalOpen(false)} disabled={isSubmitting}>
          <label className={styles.field}>
            <div className={styles.fieldLabel}>Название курса</div>
            <input
              className={styles.input}
              type="text"
              value={editForm.name}
              onChange={(event) => setEditForm((prev) => ({ ...prev, name: event.target.value }))}
              disabled={isSubmitting}
            />
          </label>

          <div className={styles.field}>
            <div className={styles.fieldLabel}>Тип курса</div>
            <div className={styles.typeButtons}>
              <button
                className={`${styles.typeButton} ${editForm.type === "closed" ? styles.typeButtonActive : ""}`}
                type="button"
                onClick={() => setEditForm((prev) => ({ ...prev, type: "closed" }))}
                disabled={isSubmitting}
              >
                Закрытый
              </button>
              <button
                className={`${styles.typeButton} ${editForm.type === "open" ? styles.typeButtonActive : ""}`}
                type="button"
                onClick={() => setEditForm((prev) => ({ ...prev, type: "open" }))}
                disabled={isSubmitting}
              >
                Открытый
              </button>
            </div>
          </div>

          <div className={styles.modalActions}>
            <button className={styles.secondaryButton} type="button" onClick={() => setIsEditModalOpen(false)} disabled={isSubmitting}>
              Отмена
            </button>
            <button className={styles.primaryButton} type="button" onClick={() => void submitEditClass()} disabled={!canSaveEdit}>
              {isSubmitting ? "Сохраняем..." : "Сохранить"}
            </button>
          </div>
        </Modal>
        )}
      </AnimatePresence>
    </div>
  )
}
