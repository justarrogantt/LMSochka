// Сводная таблица оценок класса. Параметр classId из URL.
import { useParams } from "react-router-dom"
import styles from "./GradesPage.module.css"

export default function GradesPage() {
  const { classId } = useParams<{ classId: string }>()
  return <div className={styles.page}>Оценки класса: {classId}</div>
}
