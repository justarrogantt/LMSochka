import { type ReactNode } from "react"
import { createPortal } from "react-dom"
import CloseIcon from "../../assets/icons/classes/close.svg?react"
import styles from "./Modal.module.css"

type ModalProps = {
  title: string
  onClose: () => void
  children: ReactNode
  disabled?: boolean
  // Размер окна: "md" по умолчанию, "lg" — пошире (для форм объявлений/заданий)
  size?: "md" | "lg"
}

// Общая обёртка модального окна: затемнение, заголовок и кнопка закрытия.
// Содержимое (поля, кнопки действий) передаётся через children.
export default function Modal({ title, onClose, children, disabled, size = "md" }: ModalProps) {
  return createPortal(
    <div className={styles.overlay} onClick={onClose}>
      <div className={`${styles.modal} ${size === "lg" ? styles.modalLg : ""}`} onClick={(event) => event.stopPropagation()}>
        <div className={styles.head}>
          <div className={styles.title}>{title}</div>
          <button className={styles.closeButton} type="button" onClick={onClose} aria-label="Закрыть окно" disabled={disabled}>
            <CloseIcon className={styles.closeIcon} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  )
}
