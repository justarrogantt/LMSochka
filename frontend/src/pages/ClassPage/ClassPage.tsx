// Страница конкретного класса. Параметр classId из URL.
import { useParams } from "react-router-dom"
import styles from "./ClassPage.module.css"

export default function ClassPage() {
  const { classId } = useParams<{ classId: string }>()
  return <div className={styles.page}>Класс: {classId}</div>
}
