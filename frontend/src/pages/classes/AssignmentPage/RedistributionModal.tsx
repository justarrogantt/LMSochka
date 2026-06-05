import { useEffect, useState } from "react"
import Modal from "../../../components/Modal/Modal"
import { useToast } from "../../../components/Toast/useToast"
import { ApiError } from "../../../services/api"
import { formatUserName } from "../../../services/helpers"
import {
  getMemberGrades,
  saveMemberGrades,
  type SubmissionMemberGradesDto
} from "./services/grades.api"
import styles from "./RedistributionModal.module.css"

const EPSILON = 1e-6

type RedistributionModalProps = {
  submissionId: number
  onClose: () => void
  onSaved: () => void
}

// Окно распределения командной оценки между членами команды (individual).
export default function RedistributionModal({ submissionId, onClose, onSaved }: RedistributionModalProps) {
  const showToast = useToast()

  const [data, setData] = useState<SubmissionMemberGradesDto | null>(null)
  const [values, setValues] = useState<Record<number, string>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    async function load() {
      setIsLoading(true)
      try {
        const result = await getMemberGrades(submissionId)
        setData(result)
        // подставляем текущее распределение, иначе пусто
        const existing: Record<number, string> = {}
        for (const member of result.members) {
          const current = result.grades.find((g) => g.user_id === member.user_id)
          existing[member.user_id] = current ? String(current.value) : ""
        }
        setValues(existing)
      } catch (error) {
        if (error instanceof ApiError) {
          showToast({ type: "error", message: error.message })
          onClose()
          return
        }
        throw error
      } finally {
        setIsLoading(false)
      }
    }

    void load()
  }, [submissionId])

  const members = data?.members ?? []
  const teamValue = data?.team_value ?? 0
  const maxGrade = data?.max_grade ?? 0
  const target = teamValue * members.length

  const numericValues = members.map((member) => Number(values[member.user_id]))
  const allFilled = members.every((member) => values[member.user_id]?.trim() !== "" && values[member.user_id] !== undefined)
  const allValid = numericValues.every((value) => Number.isFinite(value) && value >= 0 && value <= maxGrade)
  const sum = numericValues.reduce((acc, value) => acc + (Number.isFinite(value) ? value : 0), 0)
  const remaining = Math.round((target - sum) * 100) / 100
  const canSave = !isLoading && !isSaving && allFilled && allValid && Math.abs(sum - target) < EPSILON

  function setValue(userId: number, value: string) {
    setValues((prev) => ({ ...prev, [userId]: value }))
  }

  async function onSave() {
    if (!data || !canSave) return
    setIsSaving(true)
    try {
      await saveMemberGrades(
        submissionId,
        members.map((member) => ({ user_id: member.user_id, value: Number(values[member.user_id]) }))
      )
      showToast({ type: "neutral", message: "Оценка распределена" })
      onSaved()
    } catch (error) {
      if (error instanceof ApiError) {
        showToast({ type: "error", message: error.message })
        return
      }
      throw error
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Modal title="Распределить оценку" onClose={onClose} disabled={isSaving}>
      {isLoading ? (
        <div className={styles.loading}>Загрузка...</div>
      ) : (
        <>
          <div className={styles.summary}>
            <div>Командная оценка: <b>{teamValue}</b></div>
            <div>Среднее по команде должно быть равно <b>{teamValue}</b> (сумма {target}).</div>
            <div className={Math.abs(remaining) < EPSILON ? styles.remainingOk : styles.remaining}>
              {Math.abs(remaining) < EPSILON ? "Распределено верно" : `Осталось распределить: ${remaining}`}
            </div>
          </div>

          <div className={styles.rows}>
            {members.map((member) => (
              <label key={member.user_id} className={styles.row}>
                <div className={styles.name}>
                  <div className={styles.nameMain}>{formatUserName(member)}</div>
                  <div className={styles.nameEmail}>{member.email}</div>
                </div>
                <input
                  className={styles.input}
                  type="number"
                  min="0"
                  max={maxGrade}
                  value={values[member.user_id] ?? ""}
                  onChange={(e) => setValue(member.user_id, e.target.value)}
                  placeholder="0"
                  disabled={isSaving}
                />
              </label>
            ))}
          </div>

          <div className={styles.actions}>
            <button className={styles.secondaryButton} type="button" onClick={onClose} disabled={isSaving}>
              Отмена
            </button>
            <button className={styles.primaryButton} type="button" onClick={() => void onSave()} disabled={!canSave}>
              {isSaving ? "Сохраняем..." : "Сохранить"}
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}
