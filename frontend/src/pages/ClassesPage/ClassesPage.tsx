import { type ReactNode, useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { useNavigate } from "react-router-dom"
import CloseIcon from "../../assets/icons/classes/close.svg?react"
import CreateCourseIcon from "../../assets/icons/classes/create-course.svg?react"
import FindCourseIcon from "../../assets/icons/classes/find-course.svg?react"
import KeyIcon from "../../assets/icons/classes/key.svg?react"
import { useToast } from "../../components/Toast/ToastProvider"
import { ApiError, ApiSilentError } from "../../services/api"
import {
  createClass,
  getMyClasses,
  joinClassByCode,
  type ClassType,
  type MyClassDto
} from "../../services/classes.api"
import styles from "./ClassesPage.module.css"

const classTypeLabels = {
  open: "Открытый",
  closed: "Закрытый"
}

const roleLabels = {
  creator: "Создатель",
  teacher: "Преподаватель",
  student: "Студент"
}

type ModalType = "create" | "join" | null

type ClassesPageState = {
  classes: MyClassDto[]
  isLoading: boolean
  activeModal: ModalType
  form: {
    newClassName: string
    newClassType: ClassType
    joinCode: string
  }
}

type ModalShellProps = {
  title: string
  onClose: () => void
  children: ReactNode
}

type CreateClassModalProps = {
  newClassName: string
  newClassType: ClassType
  onNameChange: (value: string) => void
  onTypeChange: (value: ClassType) => void
  onSubmit: () => void
  onClose: () => void
}

type JoinClassModalProps = {
  joinCode: string
  onCodeChange: (value: string) => void
  onSubmit: () => void
  onClose: () => void
}

type ClassCardProps = {
  item: MyClassDto
  onOpen: (classId: number) => void
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

function CreateClassModal({ newClassName, newClassType, onNameChange, onTypeChange, onSubmit, onClose }: CreateClassModalProps) {
  return (
    <ModalShell title="Создать курс" onClose={onClose}>
      <label className={styles.field}>
        <div className={styles.fieldLabel}>Название курса</div>
        <input
          className={styles.input}
          type="text"
          value={newClassName}
          onChange={(event) => onNameChange(event.target.value)}
          placeholder="Например, Математика 10А"
        />
      </label>

      <div className={styles.field}>
        <div className={styles.fieldLabel}>Тип курса</div>
        <div className={styles.typeButtons}>
          <button
            className={`${styles.typeButton} ${newClassType === "closed" ? styles.typeButtonActive : ""}`}
            type="button"
            onClick={() => onTypeChange("closed")}
          >
            Закрытый
          </button>
          <button
            className={`${styles.typeButton} ${newClassType === "open" ? styles.typeButtonActive : ""}`}
            type="button"
            onClick={() => onTypeChange("open")}
          >
            Открытый
          </button>
        </div>
      </div>

      <div className={styles.modalActions}>
        <button className={styles.secondaryButton} type="button" onClick={onClose}>
          Отмена
        </button>
        <button className={styles.primaryButton} type="button" onClick={onSubmit}>
          Создать
        </button>
      </div>
    </ModalShell>
  )
}

function JoinClassModal({ joinCode, onCodeChange, onSubmit, onClose }: JoinClassModalProps) {
  return (
    <ModalShell title="Вступить по коду" onClose={onClose}>
      <label className={styles.field}>
        <div className={styles.fieldLabel}>Код приглашения</div>
        <input
          className={styles.input}
          type="text"
          value={joinCode}
          onChange={(event) => onCodeChange(event.target.value.toUpperCase())}
          placeholder="AB12CD34"
        />
      </label>

      <div className={styles.modalHint}>Введите код, который преподаватель выдал для входа в закрытый курс.</div>

      <div className={styles.modalActions}>
        <button className={styles.secondaryButton} type="button" onClick={onClose}>
          Отмена
        </button>
        <button className={styles.primaryButton} type="button" onClick={onSubmit}>
          Вступить
        </button>
      </div>
    </ModalShell>
  )
}

function ClassCard({ item, onOpen }: ClassCardProps) {
  return (
    <button className={styles.card} type="button" onClick={() => onOpen(item.id)}>
      <div className={styles.cardTop}>
        <div className={styles.cardTitle}>{item.name}</div>
        <div className={styles.badges}>
          <div className={styles.badge}>{classTypeLabels[item.type]}</div>
          <div className={styles.badge}>{roleLabels[item.role]}</div>
        </div>
      </div>

      <div className={styles.cardStats}>
        <div className={styles.statItem}>
          <div className={styles.statValue}>{item.students_count}</div>
          <div className={styles.statLabel}>студентов</div>
        </div>
        <div className={styles.statItem}>
          <div className={styles.statValue}>{item.teachers_count}</div>
          <div className={styles.statLabel}>преподавателей</div>
        </div>
      </div>
    </button>
  )
}

export default function ClassesPage() {
  const navigate = useNavigate()
  const showToast = useToast()
  const [state, setState] = useState<ClassesPageState>({
    classes: [],
    isLoading: true,
    activeModal: null,
    form: {
      newClassName: "",
      newClassType: "closed",
      joinCode: ""
    }
  })

  useEffect(() => {
    async function loadClasses() {
      try {
        const classes = await getMyClasses()
        setState((prev) => ({ ...prev, classes, isLoading: false }))
      } catch (error) {
        setState((prev) => ({ ...prev, isLoading: false }))
        if (error instanceof ApiSilentError) return
        showToast({
          type: "error",
          message: error instanceof ApiError ? error.message : "Не удалось загрузить мои курсы",
          offsetBottom: 30
        })
      }
    }

    void loadClasses()
  }, [])

  function closeModal() {
    setState((prev) => ({
      ...prev,
      activeModal: null,
      form: { ...prev.form, newClassName: "", joinCode: "" }
    }))
  }

  async function submitCreateClass() {
    const name = state.form.newClassName.trim()
    if (!name) return

    const tempId = -Date.now()
    const optimisticClass: MyClassDto = {
      id: tempId,
      name,
      type: state.form.newClassType,
      role: "creator",
      students_count: 0,
      teachers_count: 1
    }
    const prevClasses = state.classes

    setState((prev) => ({
      ...prev,
      classes: [optimisticClass, ...prev.classes],
      activeModal: null,
      form: { ...prev.form, newClassName: "" }
    }))

    try {
      const created = await createClass({ name, type: state.form.newClassType })
      setState((prev) => ({
        ...prev,
        classes: prev.classes.map((item) =>
          item.id === tempId
            ? {
                id: created.id,
                name: created.name,
                type: created.type,
                role: created.user_role,
                students_count: created.students_count,
                teachers_count: created.teachers_count
              }
            : item
        )
      }))
      showToast({ type: "neutral", message: "Курс создан", offsetBottom: 30 })
    } catch (error) {
      setState((prev) => ({ ...prev, classes: prevClasses }))
      if (error instanceof ApiSilentError) return
      showToast({
        type: "error",
        message: error instanceof ApiError ? error.message : "Не удалось создать курс",
        offsetBottom: 30
      })
    }
  }

  async function submitJoinByCode() {
    const code = state.form.joinCode.trim()
    if (!code) return

    try {
      await joinClassByCode(code)
      closeModal()
      const classes = await getMyClasses()
      setState((prev) => ({ ...prev, classes }))
      showToast({ type: "neutral", message: "Вы вступили в курс", offsetBottom: 30 })
    } catch (error) {
      if (error instanceof ApiSilentError) return
      showToast({
        type: "error",
        message: error instanceof ApiError ? error.message : "Не удалось вступить по коду",
        offsetBottom: 30
      })
    }
  }

  const hasClasses = state.classes.length > 0

  return (
    <div className={styles.page}>
      <div className={styles.pageHead}>
        <div className={styles.titleBlock}>
          <div className={styles.title}>Мои курсы</div>
          <div className={styles.text}>Курсы, в которых вы состоите как создатель, преподаватель или студент.</div>
        </div>

        <div className={styles.actions}>
          <button className={styles.secondaryButton} type="button" onClick={() => setState((prev) => ({ ...prev, activeModal: "join" }))}>
            <KeyIcon className={`${styles.buttonIcon} ${styles.keyIcon}`} />
            Вступить по коду
          </button>
          <button className={styles.secondaryButton} type="button" onClick={() => navigate("/classes/public")}>
            <FindCourseIcon className={`${styles.buttonIcon} ${styles.searchIcon}`} />
            Найти курс
          </button>
          <button className={styles.primaryButton} type="button" onClick={() => setState((prev) => ({ ...prev, activeModal: "create" }))}>
            <CreateCourseIcon className={`${styles.buttonIcon} ${styles.addIcon}`} />
            Создать курс
          </button>
        </div>
      </div>

      {!state.isLoading && hasClasses && (
        <div className={styles.cards}>
          {state.classes.map((item) => (
            <ClassCard key={item.id} item={item} onOpen={(classId) => navigate(`/classes/${classId}`)} />
          ))}
        </div>
      )}

      {!state.isLoading && !hasClasses && (
        <div className={styles.emptyMessage}>
          Вы пока не состоите ни в одном курсе
        </div>
      )}

      {state.activeModal === "create" && (
        <CreateClassModal
          newClassName={state.form.newClassName}
          newClassType={state.form.newClassType}
          onNameChange={(value) => setState((prev) => ({ ...prev, form: { ...prev.form, newClassName: value } }))}
          onTypeChange={(value) => setState((prev) => ({ ...prev, form: { ...prev.form, newClassType: value } }))}
          onSubmit={submitCreateClass}
          onClose={closeModal}
        />
      )}

      {state.activeModal === "join" && (
        <JoinClassModal
          joinCode={state.form.joinCode}
          onCodeChange={(value) => setState((prev) => ({ ...prev, form: { ...prev.form, joinCode: value } }))}
          onSubmit={submitJoinByCode}
          onClose={closeModal}
        />
      )}
    </div>
  )
}
