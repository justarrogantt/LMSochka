import type { Variants } from "framer-motion"

// Общие токены анимаций, чтобы не хардкодить значения по всему проекту.
// Фирменная кривая мягкого торможения — как в kampus_front.
export const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1]

// Длительности под разные сценарии (в секундах)
export const DURATION = {
  fade: 0.3,
  card: 0.35,
  overlay: 0.2,
  panel: 0.24,
  sidebar: 0.25
} as const

// Задержка появления элемента в списке по индексу.
// Потолок 0.3s — чтобы низ длинного списка не «висел».
export function staggerDelay(index: number): number {
  return Math.min(index * 0.06, 0.3)
}

// Контейнер списка: дети появляются по очереди (stagger), задержку считает сам framer.
export const listContainer: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.06 }
  }
}

// Элемент списка/карточка: всплывает снизу с затуханием.
export const listItem: Variants = {
  hidden: { opacity: 0, y: 14 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: DURATION.card, ease: EASE_OUT }
  }
}
