import type { Variants } from "framer-motion"

export const DURATION = {
  overlay: 0.16,
  panel: 0.22,
  sidebar: 0.22,
  card: 0.24
} as const

export const EASE_OUT = [0.16, 1, 0.3, 1] as const

export const listContainer: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.045
    }
  }
}

export const listItem: Variants = {
  hidden: {
    opacity: 0,
    y: 10
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: DURATION.card,
      ease: EASE_OUT
    }
  }
}
