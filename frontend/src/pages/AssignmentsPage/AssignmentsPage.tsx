// Страница заданий класса. Параметр classId из URL.
import { useParams } from "react-router-dom"
import styles from "./AssignmentsPage.module.css"

export default function AssignmentsPage() {
  const { classId } = useParams<{ classId: string }>()
  return <div className={styles.page}>Задания класса: {classId}</div>
}
