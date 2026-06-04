import type { CSSProperties } from "react"
import styles from "./SkeletonBlock.module.css"

type SkeletonBlockProps = {
  width?: string | number
  height?: string | number
  radius?: string | number
  className?: string
}

// Базовый shimmer-блок. Конкретные силуэты лежат рядом со страницами.
export default function SkeletonBlock({ width, height, radius, className = "" }: SkeletonBlockProps) {
  const style: CSSProperties = { width, height, borderRadius: radius }
  return <span className={`${styles.skeleton} ${className}`} style={style} aria-hidden="true" />
}
