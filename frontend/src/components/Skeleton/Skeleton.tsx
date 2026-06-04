import type { CSSProperties } from "react"
import styles from "./Skeleton.module.css"

type SkeletonProps = {
  width?: string | number
  height?: string | number
  radius?: string | number
  className?: string
}

// Базовый блок-заглушка с переливающимся шиммером.
// Размеры передаются динамически — это допустимый случай инлайна.
export default function Skeleton({ width, height, radius, className = "" }: SkeletonProps) {
  const style: CSSProperties = { width, height, borderRadius: radius }
  return <span className={`${styles.skeleton} ${className}`} style={style} aria-hidden="true" />
}
