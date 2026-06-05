import { useEffect, useState } from "react"
import Modal from "../../../components/Modal/Modal"
import GroupEditor, { type EditorGroup } from "../../../components/GroupEditor/GroupEditor"
import { useToast } from "../../../components/Toast/useToast"
import { ApiError } from "../../../services/api"
import {
  addGroupMember,
  createGroup,
  deleteGroup,
  getGroups,
  removeGroupMember,
  renameGroup,
  type AssignmentGroupsDto,
  type GradingMode
} from "../AssignmentsPage/services/groups.api"
import styles from "./TeamSettingsModal.module.css"

type TeamSettingsModalProps = {
  classId: number
  assignmentId: number
  // режим оценивания для подписи; команды и лимит подтянем сами
  gradingMode: GradingMode | null
  onClose: () => void
}

// Отдельная модалка управления командами. Изменения применяются сразу на сервере
// (каждое действие валидируется отдельно), кнопка внизу просто закрывает окно.
// Переиспользуется и на странице задания, и в списке заданий.
export default function TeamSettingsModal({ classId, assignmentId, gradingMode, onClose }: TeamSettingsModalProps) {
  const showToast = useToast()

  // Команды задания (null — ещё грузим)
  const [groupsData, setGroupsData] = useState<AssignmentGroupsDto | null>(null)
  const [isBusy, setIsBusy] = useState(false)

  // Первичная загрузка команд
  useEffect(() => {
    async function load() {
      try {
        setGroupsData(await getGroups(classId, assignmentId))
      } catch (error) {
        if (error instanceof ApiError) {
          showToast({ type: "error", message: error.message })
          onClose()
          return
        }
        throw error
      }
    }

    void load()
  }, [classId, assignmentId])

  // Любая мутация возвращает свежий список команд — заменяем им состояние
  async function runMutation(fn: () => Promise<AssignmentGroupsDto>) {
    setIsBusy(true)
    try {
      setGroupsData(await fn())
    } catch (error) {
      if (error instanceof ApiError) {
        showToast({ type: "error", message: error.message })
        return
      }
      throw error
    } finally {
      setIsBusy(false)
    }
  }

  const editorGroups: EditorGroup[] = (groupsData?.groups ?? []).map((group) => ({
    key: String(group.id),
    title: group.title,
    members: group.members,
    // у команды есть решение ≠ draft → состав закреплён
    locked: group.submission_status !== null && group.submission_status !== "draft"
  }))

  return (
    <Modal title="Настройка команд" onClose={onClose} disabled={isBusy} size="lg">
      <div className={styles.hint}>
        Изменения применяются сразу. Режим оценивания:{" "}
        {gradingMode === "individual" ? "индивидуальное" : "равномерное"}
        {groupsData?.max_team_size != null && `, до ${groupsData.max_team_size} в команде`}.
      </div>

      {groupsData === null ? (
        <div className={styles.hint}>Загрузка команд...</div>
      ) : (
        <GroupEditor
          groups={editorGroups}
          unassigned={groupsData.unassigned_students}
          disabled={isBusy}
          maxTeamSize={groupsData.max_team_size}
          onAddGroup={() => void runMutation(() => createGroup(classId, assignmentId))}
          onRenameGroup={(key, title) => void runMutation(() => renameGroup(classId, assignmentId, Number(key), title))}
          onDeleteGroup={(key) => void runMutation(() => deleteGroup(classId, assignmentId, Number(key)))}
          onAddMember={(key, userId) => void runMutation(() => addGroupMember(classId, assignmentId, Number(key), userId))}
          onRemoveMember={(key, userId) => void runMutation(() => removeGroupMember(classId, assignmentId, Number(key), userId))}
        />
      )}
    </Modal>
  )
}
