// Страница конкретного задания. Параметры classId и assignmentId из URL.
import { useParams } from "react-router-dom"
import styles from "./AssignmentPage.module.css"

export default function AssignmentPage() {
  const { classId, assignmentId } = useParams<{ classId: string; assignmentId: string }>()
  return <div className={styles.page}>Задание {assignmentId} класса {classId}</div>
}
