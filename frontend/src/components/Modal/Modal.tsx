import { type ReactNode } from "react"
import { createPortal } from "react-dom"
import { motion } from "framer-motion"
import CloseIcon from "../../assets/icons/classes/close.svg?react"
import { DURATION, EASE_OUT } from "../../shared/motion"
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
// Анимацию входа/выхода даёт framer-motion; за выход отвечает <AnimatePresence> на стороне вызова.
export default function Modal({ title, onClose, children, disabled, size = "md" }: ModalProps) {
  return createPortal(
    <motion.div
      className={styles.overlay}
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: DURATION.overlay, ease: EASE_OUT }}
    >
      <motion.div
        className={`${styles.modal} ${size === "lg" ? styles.modalLg : ""}`}
        onClick={(event) => event.stopPropagation()}
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.98 }}
        transition={{ duration: DURATION.panel, ease: EASE_OUT }}
      >
        <div className={styles.head}>
          <div className={styles.title}>{title}</div>
          <button className={styles.closeButton} type="button" onClick={onClose} aria-label="Закрыть окно" disabled={disabled}>
            <CloseIcon className={styles.closeIcon} />
          </button>
        </div>
        {children}
      </motion.div>
    </motion.div>,
    document.body
  )
}
