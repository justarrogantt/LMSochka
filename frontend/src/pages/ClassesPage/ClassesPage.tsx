import { type ReactNode, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useLocation, useNavigate } from "react-router-dom"
import CloseIcon from "../../assets/icons/classes/close.svg?react"
import CreateCourseIcon from "../../assets/icons/classes/create-course.svg?react"
import FindCourseIcon from "../../assets/icons/classes/find-course.svg?react"
import KeyIcon from "../../assets/icons/classes/key.svg?react"
import Loading from "../../components/Loading/Loading"
import { useToast } from "../../components/Toast/ToastProvider"
import { ApiError, ApiSilentError } from "../../services/api"
import {
  createClass,
  deleteClass,
  getMyClasses,
  joinClassByCode,
  leaveClass,
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
type CreateFormState = {
  newClassName: string
  newClassType: ClassType
}

type JoinFormState = {
  joinCode: string
}

type ClassMutationAction = "delete" | "leave"

type ClassMutationState = {
  classMutation?: {
    action: ClassMutationAction
    item: MyClassDto
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
  isSubmitting: boolean
  onNameChange: (value: string) => void
  onTypeChange: (value: ClassType) => void
  onSubmit: () => void
  onClose: () => void
}

type JoinClassModalProps = {
  joinCode: string
  isSubmitting: boolean
  onCodeChange: (value: string) => void
  onSubmit: () => void
  onClose: () => void
}

type ClassCardProps = {
  item: MyClassDto
  onOpen: (classId: number) => void
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

// Модалка создания курса
function CreateClassModal({ newClassName, newClassType, isSubmitting, onNameChange, onTypeChange, onSubmit, onClose }: CreateClassModalProps) {
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
          disabled={isSubmitting}
        />
      </label>

      <div className={styles.field}>
        <div className={styles.fieldLabel}>Тип курса</div>
        <div className={styles.typeButtons}>
          <button
            className={`${styles.typeButton} ${newClassType === "closed" ? styles.typeButtonActive : ""}`}
            type="button"
            onClick={() => onTypeChange("closed")}
            disabled={isSubmitting}
          >
            Закрытый
          </button>
          <button
            className={`${styles.typeButton} ${newClassType === "open" ? styles.typeButtonActive : ""}`}
            type="button"
            onClick={() => onTypeChange("open")}
            disabled={isSubmitting}
          >
            Открытый
          </button>
        </div>
      </div>

      <div className={styles.modalActions}>
        <button className={styles.secondaryButton} type="button" onClick={onClose} disabled={isSubmitting}>
          Отмена
        </button>
        <button className={styles.primaryButton} type="button" onClick={onSubmit} disabled={isSubmitting || !newClassName.trim()}>
          {isSubmitting ? "Создаем..." : "Создать"}
        </button>
      </div>
    </ModalShell>
  )
}

// Модалка вступления в курс по коду
function JoinClassModal({ joinCode, isSubmitting, onCodeChange, onSubmit, onClose }: JoinClassModalProps) {
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
          disabled={isSubmitting}
        />
      </label>

      <div className={styles.modalHint}>Введите код, который преподаватель выдал для входа в закрытый курс.</div>

      <div className={styles.modalActions}>
        <button className={styles.secondaryButton} type="button" onClick={onClose} disabled={isSubmitting}>
          Отмена
        </button>
        <button className={styles.primaryButton} type="button" onClick={onSubmit} disabled={isSubmitting || !joinCode.trim()}>
          {isSubmitting ? "Вступаем..." : "Вступить"}
        </button>
      </div>
    </ModalShell>
  )
}

// Карточка курса в списке "Мои курсы"
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
  const location = useLocation()
  const navigate = useNavigate()
  const showToast = useToast()

  // Данные курсов с бэка
  const [classes, setClasses] = useState<MyClassDto[]>([])

  // Лоадер страницы
  const [isLoading, setIsLoading] = useState(true)

  // Состояние модалок
  const [activeModal, setActiveModal] = useState<ModalType>(null)

  // Флаги отправки
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Поля модалки создания
  const [createForm, setCreateForm] = useState<CreateFormState>({
    newClassName: "",
    newClassType: "closed"
  })

  // Поля модалки вступления
  const [joinForm, setJoinForm] = useState<JoinFormState>({
    joinCode: ""
  })

  // Действие после возврата с экрана курса
  const pendingClassMutationRef = useRef<ClassMutationState["classMutation"] | null>(
    (location.state as ClassMutationState | null | undefined)?.classMutation ?? null
  )

  // Загрузка списка курсов
  useEffect(() => {
    async function loadClasses() {
      try {
        const nextClasses = await getMyClasses()
        const classMutation = pendingClassMutationRef.current

        if (classMutation) {
          pendingClassMutationRef.current = null
          navigate("/classes", { replace: true, state: null })

          const optimisticClasses = nextClasses.filter((item) => item.id !== classMutation.item.id)
          setClasses(optimisticClasses)

          void (async () => {
            try {
              if (classMutation.action === "delete") {
                await deleteClass(classMutation.item.id)
                showToast({ type: "neutral", message: "Курс удален" })
              } else {
                await leaveClass(classMutation.item.id)
                showToast({ type: "neutral", message: "Вы покинули курс" })
              }
            } catch (error) {
              setClasses(nextClasses)
              showToast({
                type: "error",
                message:
                  error instanceof ApiError
                    ? error.message
                    : classMutation.action === "delete"
                      ? "Не удалось удалить курс"
                      : "Не удалось покинуть курс"
              })
            }
          })()

          return
        }

        setClasses(nextClasses)
      } catch (error) {
        if (error instanceof ApiSilentError) return
        showToast({
          type: "error",
          message: error instanceof Error ? error.message : "Не удалось загрузить мои курсы"
        })
      } finally {
        setIsLoading(false)
      }
    }

    void loadClasses()
  }, [navigate, showToast])

  // Закрытие модалок
  function closeModal() {
    if (isSubmitting) return
    setActiveModal(null)
    setCreateForm((prev) => ({ ...prev, newClassName: "" }))
    setJoinForm({ joinCode: "" })
  }

  // Создание курса
  async function submitCreateClass() {
    if (isSubmitting) return
    const name = createForm.newClassName.trim()
    if (!name) return

    setIsSubmitting(true)
    setActiveModal(null)

    try {
      const createdClass = await createClass({ name, type: createForm.newClassType })
      setClasses((prev) => [createdClass, ...prev])
      setCreateForm((prev) => ({ ...prev, newClassName: "" }))
      showToast({ type: "neutral", message: "Курс создан" })
    } catch (error) {
      showToast({
        type: "error",
        message: error instanceof Error ? error.message : "Не удалось создать курс"
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Вступление в курс по коду
  async function submitJoinByCode() {
    if (isSubmitting) return
    const code = joinForm.joinCode.trim()
    if (!code) return

    setIsSubmitting(true)
    setActiveModal(null)

    try {
      const joinedClass = await joinClassByCode(code)
      setClasses((prev) => [joinedClass, ...prev])
      setJoinForm({ joinCode: "" })
      showToast({ type: "neutral", message: "Вы вступили в курс" })
    } catch (error) {
      showToast({
        type: "error",
        message: error instanceof Error ? error.message : "Не удалось вступить по коду"
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const hasClasses = classes.length > 0

  return (
    <div className={styles.page}>
      <div className={styles.pageHead}>
        <div className={styles.titleBlock}>
          <div className={styles.title}>Мои курсы</div>
          <div className={styles.text}>Курсы, в которых вы состоите как создатель, преподаватель или студент.</div>
        </div>

        <div className={styles.actions}>
          <button className={styles.secondaryButton} type="button" onClick={() => setActiveModal("join")}>
            <KeyIcon className={`${styles.buttonIcon} ${styles.keyIcon}`} />
            Вступить по коду
          </button>
          <button className={styles.secondaryButton} type="button" onClick={() => navigate("/classes/public")}>
            <FindCourseIcon className={`${styles.buttonIcon} ${styles.searchIcon}`} />
            Найти курс
          </button>
          <button className={styles.primaryButton} type="button" onClick={() => setActiveModal("create")}>
            <CreateCourseIcon className={`${styles.buttonIcon} ${styles.addIcon}`} />
            Создать курс
          </button>
        </div>
      </div>

      {isLoading && <Loading />}

      {!isLoading && hasClasses && (
        <div className={styles.cards}>
          {classes.map((item) => (
            <ClassCard key={item.id} item={item} onOpen={(classId) => navigate(`/classes/${classId}`)} />
          ))}
        </div>
      )}

      {!isLoading && !hasClasses && <div className={styles.emptyMessage}>Вы пока не состоите ни в одном курсе</div>}

      {activeModal === "create" && (
        <CreateClassModal
          newClassName={createForm.newClassName}
          newClassType={createForm.newClassType}
          isSubmitting={isSubmitting}
          onNameChange={(value) => setCreateForm((prev) => ({ ...prev, newClassName: value }))}
          onTypeChange={(value) => setCreateForm((prev) => ({ ...prev, newClassType: value }))}
          onSubmit={submitCreateClass}
          onClose={closeModal}
        />
      )}

      {activeModal === "join" && (
        <JoinClassModal
          joinCode={joinForm.joinCode}
          isSubmitting={isSubmitting}
          onCodeChange={(value) => setJoinForm({ joinCode: value })}
          onSubmit={submitJoinByCode}
          onClose={closeModal}
        />
      )}
    </div>
  )
}
