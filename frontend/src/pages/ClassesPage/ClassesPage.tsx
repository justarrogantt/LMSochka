import { type ReactNode, useState } from "react"
import { createPortal } from "react-dom"
import { useNavigate } from "react-router-dom"
import CloseIcon from "../../assets/icons/classes/close.svg?react"
import CreateCourseIcon from "../../assets/icons/classes/create-course.svg?react"
import FindCourseIcon from "../../assets/icons/classes/find-course.svg?react"
import KeyIcon from "../../assets/icons/classes/key.svg?react"
import styles from "./ClassesPage.module.css"

type MyClass = {
  id: number
  name: string
  type: "open" | "closed"
  role: "creator" | "teacher" | "student"
  students_count: number
  teachers_count: number
}

const classes: MyClass[] = [
  {
    id: 12,
    name: "Математика 10А",
    type: "closed",
    role: "creator",
    students_count: 27,
    teachers_count: 2
  },
  {
    id: 18,
    name: "Основы Python",
    type: "open",
    role: "teacher",
    students_count: 19,
    teachers_count: 1
  },
  {
    id: 24,
    name: "Английский язык",
    type: "open",
    role: "student",
    students_count: 31,
    teachers_count: 3
  },
  {
    id: 26,
    name: "Английский язык",
    type: "open",
    role: "student",
    students_count: 31,
    teachers_count: 3
  },
  {
    id: 27,
    name: "Английский язык",
    type: "open",
    role: "student",
    students_count: 31,
    teachers_count: 3
  }
]

const classTypeLabels = {
  open: "Открытый",
  closed: "Закрытый"
}

const roleLabels = {
  creator: "Создатель",
  teacher: "Преподаватель",
  student: "Студент"
}

type ModalShellProps = {
  title: string
  onClose: () => void
  children: ReactNode
}

type CreateClassModalProps = {
  newClassName: string
  newClassType: "open" | "closed"
  onNameChange: (value: string) => void
  onTypeChange: (value: "open" | "closed") => void
  onClose: () => void
}

type JoinClassModalProps = {
  joinCode: string
  onCodeChange: (value: string) => void
  onClose: () => void
}

type ClassCardProps = {
  item: MyClass
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

function CreateClassModal({ newClassName, newClassType, onNameChange, onTypeChange, onClose }: CreateClassModalProps) {
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
        <button className={styles.primaryButton} type="button" onClick={onClose}>
          Создать
        </button>
      </div>
    </ModalShell>
  )
}

function JoinClassModal({ joinCode, onCodeChange, onClose }: JoinClassModalProps) {
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
        <button className={styles.primaryButton} type="button" onClick={onClose}>
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
  const [activeModal, setActiveModal] = useState<"create" | "join" | null>(null)
  const [newClassName, setNewClassName] = useState("")
  const [newClassType, setNewClassType] = useState<"open" | "closed">("closed")
  const [joinCode, setJoinCode] = useState("")
  const hasClasses = classes.length > 0

  // Пока бэка нет, закрываем модалку так, будто действие успешно подготовлено.
  function closeModal() {
    setActiveModal(null)
  }

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

      {hasClasses && (
        <div className={styles.cards}>
          {classes.map((item) => <ClassCard key={item.id} item={item} onOpen={(classId) => navigate(`/classes/${classId}`)} />)}
        </div>
      )}

      {!hasClasses && (
        <div className={styles.emptyState}>
          <div className={styles.emptyTitle}>Вы пока ни в одном курсе</div>
          <div className={styles.emptyText}>Найдите открытый курс или создайте новый учебный класс.</div>
          <div className={styles.emptyActions}>
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
      )}

      {activeModal === "create" && (
        <CreateClassModal
          newClassName={newClassName}
          newClassType={newClassType}
          onNameChange={setNewClassName}
          onTypeChange={setNewClassType}
          onClose={closeModal}
        />
      )}

      {activeModal === "join" && <JoinClassModal joinCode={joinCode} onCodeChange={setJoinCode} onClose={closeModal} />}
    </div>
  )
}
