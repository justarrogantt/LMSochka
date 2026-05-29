import { useEffect, useState } from "react"
import { NavLink, Outlet, useNavigate, useParams } from "react-router-dom"
import ArrowIcon from "../../assets/icons/classes/arrow.svg?react"
import Loading from "../../components/Loading/Loading"
import Modal from "../../components/Modal/Modal"
import { useToast } from "../../components/Toast/ToastProvider"
import { ApiSilentError } from "../../services/api"
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

type EditFormState = {
  name: string
  type: ClassType
}

// Контекст для вложенных вкладок курса
export type ClassLayoutContext = {
  classDetail: ClassDetailDto | null
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
        return
      }

      try {
        const detail = await getClassDetail(parsedClassId)
        setClassDetail(detail)
        setEditForm({ name: detail.name, type: detail.type })
      } catch (error) {
        if (error instanceof ApiSilentError) return
        showToast({ type: "error", message: (error as Error).message })
      } finally {
        setIsLoading(false)
      }
    }

    void loadClass()
  }, [parsedClassId, showToast])

  // Копирование кода приглашения в буфер обмена
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
      showToast({ type: "error", message: (error as Error).message })
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
      showToast({ type: "error", message: (error as Error).message })
      setIsSubmitting(false)
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
      showToast({ type: "error", message: (error as Error).message })
      setIsSubmitting(false)
    }
  }

  const isCreator = classDetail?.user_role === "creator"
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
        <Modal title={isCreator ? "Удалить курс" : "Покинуть курс"} onClose={() => !isSubmitting && setIsDeleteModalOpen(false)} disabled={isSubmitting}>
          <div className={styles.modalText}>
            {isCreator ? "Вы точно хотите удалить курс? Это действие нельзя отменить." : "Вы точно хотите покинуть курс?"}
          </div>
          <div className={styles.modalActions}>
            <button className={styles.secondaryButton} type="button" onClick={() => setIsDeleteModalOpen(false)} disabled={isSubmitting}>
              Отмена
            </button>
            {isCreator ? (
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
    </div>
  )
}
