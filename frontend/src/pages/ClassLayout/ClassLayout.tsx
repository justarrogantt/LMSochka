import { type ReactNode, useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { NavLink, Outlet, useNavigate, useParams } from "react-router-dom"
import ArrowIcon from "../../assets/icons/classes/arrow.svg?react"
import CloseIcon from "../../assets/icons/classes/close.svg?react"
import { useToast } from "../../components/Toast/ToastProvider"
import { ApiError, ApiSilentError } from "../../services/api"
import { deleteClass, getClassDetail, updateClass, type ClassDetailDto } from "../../services/classes.api"
import styles from "./ClassLayout.module.css"

const tabs = [
  { title: "Обзор", path: "" },
  { title: "Участники", path: "members" },
  { title: "Задания", path: "assignments" },
  { title: "Оцени", path: "grades" },
  { title: "Объявления", path: "announcements" }
]

type ClassLayoutState = {
  detail: ClassDetailDto | null
  isLoading: boolean
  isDeleteModalOpen: boolean
  isEditModalOpen: boolean
  editedClassName: string
}

type ModalShellProps = {
  title: string
  onClose: () => void
  children: ReactNode
}

export type ClassLayoutContext = {
  classDetail: ClassDetailDto | null
}

function ModalShell({ title, onClose, children }: ModalShellProps) {
  return createPortal(
    <div className={styles.modalOverlay}>
      <div className={styles.modal}>
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
  const [state, setState] = useState<ClassLayoutState>({
    detail: null,
    isLoading: true,
    isDeleteModalOpen: false,
    isEditModalOpen: false,
    editedClassName: ""
  })
  const basePath = `/classes/${classId}`

  useEffect(() => {
    async function loadClass() {
      if (!Number.isFinite(parsedClassId)) {
        setState((prev) => ({ ...prev, isLoading: false }))
        return
      }

      try {
        const detail = await getClassDetail(parsedClassId)
        setState((prev) => ({
          ...prev,
          detail,
          editedClassName: detail.name,
          isLoading: false
        }))
      } catch (error) {
        setState((prev) => ({ ...prev, isLoading: false }))
        if (error instanceof ApiSilentError) return
        showToast({
          type: "error",
          message: error instanceof ApiError ? error.message : "Не удалось загрузить курс",
          offsetBottom: 30
        })
      }
    }

    void loadClass()
  }, [classId])

  async function copyJoinCode() {
    if (!state.detail?.join_code) return

    try {
      await navigator.clipboard.writeText(state.detail.join_code)
      showToast({ type: "neutral", message: "Код скопирован", offsetBottom: 30 })
    } catch {
      showToast({ type: "error", message: "Не удалось скопировать код", offsetBottom: 30 })
    }
  }

  async function submitEditClass() {
    if (!state.detail) return
    const nextName = state.editedClassName.trim()
    if (!nextName || nextName === state.detail.name) {
      setState((prev) => ({ ...prev, isEditModalOpen: false }))
      return
    }

    const prevDetail = state.detail
    setState((prev) => ({
      ...prev,
      detail: prev.detail ? { ...prev.detail, name: nextName } : prev.detail,
      isEditModalOpen: false
    }))

    try {
      const updated = await updateClass(state.detail.id, { name: nextName })
      setState((prev) => ({ ...prev, detail: updated, editedClassName: updated.name }))
      showToast({ type: "neutral", message: "Курс обновлен", offsetBottom: 30 })
    } catch (error) {
      setState((prev) => ({ ...prev, detail: prevDetail, editedClassName: prevDetail.name }))
      if (error instanceof ApiSilentError) return
      showToast({
        type: "error",
        message: error instanceof ApiError ? error.message : "Не удалось обновить курс",
        offsetBottom: 30
      })
    }
  }

  async function submitDeleteClass() {
    if (!state.detail) return
    const deletedClassId = state.detail.id

    try {
      await deleteClass(deletedClassId)
      showToast({ type: "neutral", message: "Курс удален", offsetBottom: 30 })
      navigate("/classes", { replace: true })
    } catch (error) {
      if (error instanceof ApiSilentError) return
      showToast({
        type: "error",
        message: error instanceof ApiError ? error.message : "Не удалось удалить курс",
        offsetBottom: 30
      })
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.classHead}>
        <div className={styles.titleBlock}>
          <button className={styles.backButton} type="button" onClick={() => navigate("/classes")}>
            <ArrowIcon className={styles.backIcon} />
            <div>Мои курсы</div>
          </button>
          <div className={styles.title}>{state.detail?.name ?? "Курс"}</div>
        </div>

        <div className={styles.actions}>
          <button className={styles.secondaryButton} type="button" onClick={copyJoinCode}>
            Код приглашения: {state.detail?.join_code ?? "—"}
          </button>
          <button className={styles.secondaryButton} type="button" onClick={() => setState((prev) => ({ ...prev, isEditModalOpen: true }))}>
            Редактировать
          </button>
          <button className={styles.dangerButton} type="button" onClick={() => setState((prev) => ({ ...prev, isDeleteModalOpen: true }))}>
            Удалить
          </button>
        </div>
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

      {!state.isLoading && <Outlet context={{ classDetail: state.detail } satisfies ClassLayoutContext} />}

      {state.isDeleteModalOpen && (
        <ModalShell title="Удалить курс" onClose={() => setState((prev) => ({ ...prev, isDeleteModalOpen: false }))}>
          <div className={styles.modalText}>Вы точно хотите удалить курс? Это действие нельзя отменить.</div>
          <div className={styles.modalActions}>
            <button className={styles.secondaryButton} type="button" onClick={() => setState((prev) => ({ ...prev, isDeleteModalOpen: false }))}>
              Отмена
            </button>
            <button className={styles.dangerButton} type="button" onClick={() => void submitDeleteClass()}>
              Да, удалить
            </button>
          </div>
        </ModalShell>
      )}

      {state.isEditModalOpen && (
        <ModalShell title="Редактировать курс" onClose={() => setState((prev) => ({ ...prev, isEditModalOpen: false }))}>
          <label className={styles.field}>
            <div className={styles.fieldLabel}>Название курса</div>
            <input
              className={styles.input}
              type="text"
              value={state.editedClassName}
              onChange={(event) => setState((prev) => ({ ...prev, editedClassName: event.target.value }))}
            />
          </label>
          <div className={styles.modalActions}>
            <button className={styles.secondaryButton} type="button" onClick={() => setState((prev) => ({ ...prev, isEditModalOpen: false }))}>
              Отмена
            </button>
            <button className={styles.primaryButton} type="button" onClick={() => void submitEditClass()}>
              Сохранить
            </button>
          </div>
        </ModalShell>
      )}
    </div>
  )
}
