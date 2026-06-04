import { AnimatePresence, motion } from "framer-motion"
import type { ReactNode } from "react"
import { DURATION, EASE_OUT } from "../../shared/motion"
import styles from "./LoadingSwap.module.css"

type LoadingSwapProps = {
  isLoading: boolean
  skeleton: ReactNode
  children: ReactNode
  // Отступ между секциями контента (если их несколько) — чтобы обёртка не «съедала» gap страницы
  gap?: number
}

// Контент рендерится сразу, а скелетон лежит поверх отдельным слоем и просто гаснет по opacity.
// Слой скелетона с overflow:hidden — не скроллится, лишнее обрезается.
export default function LoadingSwap({ isLoading, skeleton, children, gap }: LoadingSwapProps) {
  return (
    <div className={styles.wrap} style={gap !== undefined ? { gap } : undefined}>
      {children}

      <AnimatePresence initial={false}>
        {isLoading && (
          <motion.div
            className={styles.overlay}
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DURATION.fade, ease: EASE_OUT }}
          >
            {skeleton}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
