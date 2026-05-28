import { type ReactNode, useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { NavLink, Outlet, useNavigate, useParams } from "react-router-dom"
import ArrowIcon from "../../assets/icons/classes/arrow.svg?react"
import CloseIcon from "../../assets/icons/classes/close.svg?react"
import Loading from "../../components/Loading/Loading"
import { useToast } from "../../components/Toast/ToastProvider"
import { ApiSilentError } from "../../services/api"
import { getClassDetail, updateClass, type ClassDetailDto, type ClassType } from "../../services/classes.api"
import styles from "./ClassLayout.module.css"

const tabs = [
  { title: "Обзор", path: "" },
  { title: "Участники", path: "members" },
  { title: "Задания", path: "assignments" },
  { title: "Оценки", path: "grades" },
  { title: "Объявления", path: "announcements" }
]

type EditFormState = {
  name: string
  type: ClassType
}

type ModalShellProps = {
  title: string
  onClose: () => void
  children: ReactNode
}

export type ClassLayoutContext = {
  classDetail: ClassDetailDto | null
}

// Базовая обертка модального окна
function ModalShell({ title, onClose, children }: ModalShellProps) {
  return createPortal(
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(event) => event.stopPropagation()}>
        <div className={styles.modalHead}>
          <div className={styles.modalTitle}>{title}</div>
          <button className={styles.closeButton} type="button" onClick={onClose} aria-label="Закрыть окно">
            <CloseIcon className={styles.closeIcon} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  )
}

export default function ClassLayout() {
  const { classId } = useParams<{ classId: string }>()
  const parsedClassId = Number(classId)
  const navigate = useNavigate()
  const showToast = useToast()
  const basePath = `/classes/${classId}`

  // Данные курса
  const [classDetail, setClassDetail] = useState<ClassDetailDto | null>(null)

  // Лоадер страницы
  const [isLoading, setIsLoading] = useState(true)

  // Состояние модалок
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)

  // Флаг отправки мутаций
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Поля формы редактирования
  const [editForm, setEditForm] = useState<EditFormState>({
    name: "",
    type: "closed"
  })

  // Загрузка данных курса
  useEffect(() => {
    async function loadClass() {
      if (!Number.isFinite(parsedClassId)) {
        setIsLoading(false)
        return
      }

      try {
        const detail = await getClassDetail(parsedClassId)
        setClassDetail(detail)
        setEditForm({ name: detail.name, type: detail.type })
      } catch (error) {
        if (error instanceof ApiSilentError) return
        showToast({ type: "error", message: error instanceof Error ? error.message : "Не удалось загрузить курс" })
      } finally {
        setIsLoading(false)
      }
    }

    void loadClass()
  }, [parsedClassId, showToast])

  // Копирование кода приглашения
  async function copyJoinCode() {
    if (!classDetail?.join_code) return

    try {
      await navigator.clipboard.writeText(classDetail.join_code)
      showToast({ type: "neutral", message: "Код скопирован" })
    } catch {
      showToast({ type: "error", message: "Не удалось скопировать код" })
    }
  }

  // Открытие модалки редактирования
  function openEditModal() {
    if (!classDetail) return
    setEditForm({ name: classDetail.name, type: classDetail.type })
    setIsEditModalOpen(true)
  }

  // Редактирование курса
  async function submitEditClass() {
    if (!classDetail || isSubmitting) return

    const nextName = editForm.name.trim()
    const nextType = editForm.type
    const isNameChanged = !!nextName && nextName !== classDetail.name
    const isTypeChanged = nextType !== classDetail.type

    if (!isNameChanged && !isTypeChanged) {
      setIsEditModalOpen(false)
      return
    }

    const prevDetail = classDetail
    const optimisticDetail: ClassDetailDto = {
      ...classDetail,
      name: isNameChanged ? nextName : classDetail.name,
      type: isTypeChanged ? nextType : classDetail.type
    }
    setIsSubmitting(true)
    setIsEditModalOpen(false)
    setClassDetail(optimisticDetail)
    setEditForm({ name: optimisticDetail.name, type: optimisticDetail.type })

    try {
      const updated = await updateClass(prevDetail.id, {
        ...(isNameChanged ? { name: nextName } : {}),
        ...(isTypeChanged ? { type: nextType } : {})
      })
      setClassDetail(updated)
      setEditForm({ name: updated.name, type: updated.type })
      showToast({ type: "neutral", message: "Курс обновлен" })
    } catch (error) {
      setClassDetail(prevDetail)
      setEditForm({ name: prevDetail.name, type: prevDetail.type })
      showToast({ type: "error", message: error instanceof Error ? error.message : "Не удалось обновить курс" })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Удаление курса (для создателя)
  async function submitDeleteClass() {
    if (!classDetail || isSubmitting) return

    setIsSubmitting(true)
    navigate("/classes", {
      replace: true,
      state: {
        classMutation: {
          action: "delete",
          item: {
            id: classDetail.id,
            name: classDetail.name,
            type: classDetail.type,
            role: classDetail.user_role,
            students_count: classDetail.students_count,
            teachers_count: classDetail.teachers_count,
            join_code: classDetail.join_code
          }
        }
      }
    })
  }

  // Выход из курса (для не-создателя)
  async function submitLeaveClass() {
    if (!classDetail || isSubmitting) return

    setIsSubmitting(true)
    navigate("/classes", {
      replace: true,
      state: {
        classMutation: {
          action: "leave",
          item: {
            id: classDetail.id,
            name: classDetail.name,
            type: classDetail.type,
            role: classDetail.user_role,
            students_count: classDetail.students_count,
            teachers_count: classDetail.teachers_count,
            join_code: classDetail.join_code
          }
        }
      }
    })
  }

  const isCreator = classDetail?.user_role === "creator"

  return (
    <div className={styles.page}>
      <div className={styles.classHead}>
        <div className={styles.titleBlock}>
          <button className={styles.backButton} type="button" onClick={() => navigate("/classes")}>
            <ArrowIcon className={styles.backIcon} />
            <div>Мои курсы</div>
          </button>
          <div className={styles.title}>{classDetail?.name ?? "Курс"}</div>
        </div>

        {!isLoading && (
          <div className={styles.actions}>
            {isCreator && classDetail?.type === "closed" && classDetail?.join_code && (
              <button className={styles.secondaryButton} type="button" onClick={copyJoinCode}>
                Код приглашения: {classDetail.join_code}
              </button>
            )}

            {isCreator && (
              <button className={styles.secondaryButton} type="button" onClick={openEditModal}>
                Редактировать
              </button>
            )}

            {isCreator && (
              <button className={styles.dangerButton} type="button" onClick={() => setIsDeleteModalOpen(true)}>
                Удалить
              </button>
            )}

            {!isCreator && (
              <button className={styles.dangerButton} type="button" onClick={() => setIsDeleteModalOpen(true)}>
                Покинуть курс
              </button>
            )}
          </div>
        )}
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

      {isLoading && <Loading />}
      {!isLoading && <Outlet context={{ classDetail } satisfies ClassLayoutContext} />}

      {isDeleteModalOpen && (
        <ModalShell title={isCreator ? "Удалить курс" : "Покинуть курс"} onClose={() => !isSubmitting && setIsDeleteModalOpen(false)}>
          <div className={styles.modalText}>
            {isCreator ? "Вы точно хотите удалить курс? Это действие нельзя отменить." : "Вы точно хотите покинуть курс?"}
          </div>
          <div className={styles.modalActions}>
            <button className={styles.secondaryButton} type="button" onClick={() => setIsDeleteModalOpen(false)} disabled={isSubmitting}>
              Отмена
            </button>
            {isCreator && (
              <button className={styles.dangerButton} type="button" onClick={() => void submitDeleteClass()} disabled={isSubmitting}>
                {isSubmitting ? "Удаляем..." : "Да, удалить"}
              </button>
            )}
            {!isCreator && (
              <button className={styles.dangerButton} type="button" onClick={() => void submitLeaveClass()} disabled={isSubmitting}>
                {isSubmitting ? "Выходим..." : "Да, покинуть"}
              </button>
            )}
          </div>
        </ModalShell>
      )}

      {isEditModalOpen && (
        <ModalShell title="Редактировать курс" onClose={() => !isSubmitting && setIsEditModalOpen(false)}>
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
            <button className={styles.primaryButton} type="button" onClick={() => void submitEditClass()} disabled={isSubmitting}>
              {isSubmitting ? "Сохраняем..." : "Сохранить"}
            </button>
          </div>
        </ModalShell>
      )}
    </div>
  )
}
