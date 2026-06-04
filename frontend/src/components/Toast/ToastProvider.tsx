import { createContext, useContext, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion } from "framer-motion"
import styles from "./ToastProvider.module.css"

type ToastType = "neutral" | "success" | "error"

type Toast = {
  message: string
  type?: ToastType
  duration?: number
}

type ShowToast = (toast: Toast) => void

const ToastContext = createContext<ShowToast | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null)
  const closeTimerRef = useRef<number | null>(null)

function showToast(nextToast: Toast) {
    const duration = nextToast.duration ?? 3000

    setToast(nextToast)

    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current)
    }

    closeTimerRef.current = window.setTimeout(() => {
      setToast(null)
    }, duration)
  }

  return (
    <ToastContext.Provider value={showToast}>
      {children}

      {createPortal(
        <div className={styles.viewport} style={{ bottom: 30 }}>
          <AnimatePresence mode="wait">
            {toast && (
              <motion.div
                key={toast.message}
                className={`${styles.toast} ${styles[toast.type ?? "neutral"]}`}
                initial={{ opacity: 0, y: 15, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 15, scale: 0.96 }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              >
                {toast.message}
              </motion.div>
            )}
          </AnimatePresence>
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  )
}

export function useToast() {
  const showToast = useContext(ToastContext)

  if (!showToast) {
    throw new Error("useToast должен использоваться внутри ToastProvider")
  }

  return showToast
}
