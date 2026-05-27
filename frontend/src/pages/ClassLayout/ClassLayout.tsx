import { type ReactNode, useState } from "react"
import { createPortal } from "react-dom"
import { NavLink, Outlet, useNavigate, useParams } from "react-router-dom"
import ArrowIcon from "../../assets/icons/classes/arrow.svg?react"
import CloseIcon from "../../assets/icons/classes/close.svg?react"
import { useToast } from "../../components/Toast/ToastProvider"
import styles from "./ClassLayout.module.css"

const classInfo = {
  name: "Математика 10А",
  join_code: "AB12CD34"
}

const tabs = [
  {
    title: "Обзор",
    path: ""
  },
  {
    title: "Участники",
    path: "members"
  },
  {
    title: "Задания",
    path: "assignments"
  },
  {
    title: "Оцени",
    path: "grades"
  },
  {
    title: "Объявления",
    path: "announcements"
  }
]

type ModalShellProps = {
  title: string
  onClose: () => void
  children: ReactNode
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
  const navigate = useNavigate()
  const showToast = useToast()
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [editedClassName, setEditedClassName] = useState(classInfo.name)
  const basePath = `/classes/${classId}`

  async function copyJoinCode() {
    try {
      await navigator.clipboard.writeText(classInfo.join_code)
      showToast({ type: "neutral", message: "Код скопирован", offsetBottom: 30 })
    } catch {
      showToast({ type: "error", message: "Не удалось скопировать код", offsetBottom: 30 })
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
          <div className={styles.title}>{classInfo.name}</div>
        </div>

        <div className={styles.actions}>
          <button className={styles.secondaryButton} type="button" onClick={copyJoinCode}>
            Код приглашения: {classInfo.join_code}
          </button>
          <button className={styles.secondaryButton} type="button" onClick={() => setIsEditModalOpen(true)}>
            Редактировать
          </button>
          <button className={styles.dangerButton} type="button" onClick={() => setIsDeleteModalOpen(true)}>
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

      <Outlet />

      {isDeleteModalOpen && (
        <ModalShell title="Удалить курс" onClose={() => setIsDeleteModalOpen(false)}>
          <div className={styles.modalText}>Вы точно хотите удалить курс? Это действие нельзя отменить.</div>
          <div className={styles.modalActions}>
            <button className={styles.secondaryButton} type="button" onClick={() => setIsDeleteModalOpen(false)}>
              Отмена
            </button>
            <button className={styles.dangerButton} type="button" onClick={() => setIsDeleteModalOpen(false)}>
              Да, удалить
            </button>
          </div>
        </ModalShell>
      )}

      {isEditModalOpen && (
        <ModalShell title="Редактировать курс" onClose={() => setIsEditModalOpen(false)}>
          <label className={styles.field}>
            <div className={styles.fieldLabel}>Название курса</div>
            <input
              className={styles.input}
              type="text"
              value={editedClassName}
              onChange={(event) => setEditedClassName(event.target.value)}
            />
          </label>
          <div className={styles.modalActions}>
            <button className={styles.secondaryButton} type="button" onClick={() => setIsEditModalOpen(false)}>
              Отмена
            </button>
            <button className={styles.primaryButton} type="button" onClick={() => setIsEditModalOpen(false)}>
              Сохранить
            </button>
          </div>
        </ModalShell>
      )}
    </div>
  )
}
