import { useEffect, useState } from "react"
import { useOutletContext } from "react-router-dom"
import SettingsIcon from "../../../assets/icons/classes/settings.svg?react"
import DeleteIcon from "../../../assets/icons/classes/delete.svg?react"
import Loading from "../../../components/Loading/Loading"
import Modal from "../../../components/Modal/Modal"
import { useToast } from "../../../components/Toast/ToastProvider"
import { ApiSilentError } from "../../../services/api"
import type { ClassRole } from "../../../types/class.types"
import type { ClassLayoutContext } from "../../../layouts/ClassLayout/ClassLayout"
import { getClassMembers, removeClassMember, updateClassMemberRole, type ClassMemberDto } from "./services/classMembers.api"
import styles from "./ClassMembersPage.module.css"

const roleLabels: Record<ClassRole, string> = {
  creator: "Создатель",
  teacher: "Преподаватель",
  student: "Студент"
}

// Имя участника или email, если имя не заполнено
function getMemberName(member: ClassMemberDto) {
  return `${member.first_name ?? ""} ${member.last_name ?? ""}`.trim() || member.email
}

type MemberCardProps = {
  member: ClassMemberDto
  badgeLabel?: string
  canManage: boolean
  onRoleChange: () => void
  onDelete: () => void
}

// Карточка участника курса
function MemberCard({ member, badgeLabel, canManage, onRoleChange, onDelete }: MemberCardProps) {
  const name = getMemberName(member)
  return (
    <div className={styles.memberCard}>
      <div className={styles.avatar}>{name[0]}</div>
      <div className={styles.memberInfo}>
        <div className={styles.memberName}>{name}</div>
        <div className={styles.memberEmail}>{member.email}</div>
      </div>
      <div className={styles.roleBadge}>{badgeLabel ?? roleLabels[member.role]}</div>
      {canManage && (
        <>
          <button className={styles.iconButton} type="button" aria-label="Изменить роль участника" onClick={onRoleChange}>
            <SettingsIcon className={styles.icon} />
          </button>
          <button className={styles.iconButton} type="button" aria-label="Удалить участника" onClick={onDelete}>
            <DeleteIcon className={styles.icon} />
          </button>
        </>
      )}
    </div>
  )
}

export default function ClassMembersPage() {
  const { classDetail } = useOutletContext<ClassLayoutContext>()
  const showToast = useToast()
  const canManageMembers = classDetail?.user_role === "creator"

  // Список участников курса
  const [members, setMembers] = useState<ClassMemberDto[]>([])

  // Лоадер страницы
  const [isLoading, setIsLoading] = useState(true)

  // Участник, для которого открыта модалка смены роли, и выбранная роль
  const [selectedMember, setSelectedMember] = useState<ClassMemberDto | null>(null)
  const [selectedRole, setSelectedRole] = useState<"teacher" | "student">("student")

  // Участник, выбранный для удаления
  const [memberToDelete, setMemberToDelete] = useState<ClassMemberDto | null>(null)

  // Флаг отправки запроса
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Загрузка участников курса
  useEffect(() => {
    async function loadMembers() {
      if (!classDetail?.id) {
        setIsLoading(false)
        return
      }

      try {
        const data = await getClassMembers(classDetail.id)
        setMembers(data.items)
      } catch (error) {
        if (error instanceof ApiSilentError) return
        showToast({ type: "error", message: (error as Error).message })
      } finally {
        setIsLoading(false)
      }
    }

    void loadMembers()
  }, [classDetail?.id, showToast])

  // Открытие модалки смены роли
  function openRoleModal(member: ClassMemberDto) {
    setSelectedMember(member)
    setSelectedRole(member.role === "teacher" ? "teacher" : "student")
  }

  // Изменение роли участника (оптимистично, с откатом при ошибке)
  async function submitRoleChange() {
    if (!classDetail?.id || !selectedMember || isSubmitting) return

    const prevMembers = members
    const memberId = selectedMember.user_id
    setSelectedMember(null)
    setIsSubmitting(true)
    setMembers((prev) => prev.map((item) => (item.user_id === memberId ? { ...item, role: selectedRole } : item)))

    try {
      await updateClassMemberRole(classDetail.id, memberId, selectedRole)
      showToast({ type: "neutral", message: "Роль участника обновлена" })
    } catch (error) {
      setMembers(prevMembers)
      showToast({ type: "error", message: (error as Error).message })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Удаление участника (оптимистично, с откатом при ошибке)
  async function submitDeleteMember() {
    if (!classDetail?.id || !memberToDelete || isSubmitting) return

    const prevMembers = members
    const memberId = memberToDelete.user_id
    setMemberToDelete(null)
    setIsSubmitting(true)
    setMembers((prev) => prev.filter((item) => item.user_id !== memberId))

    try {
      await removeClassMember(classDetail.id, memberId)
      showToast({ type: "neutral", message: "Участник удален из курса" })
    } catch (error) {
      setMembers(prevMembers)
      showToast({ type: "error", message: (error as Error).message })
    } finally {
      setIsSubmitting(false)
    }
  }

  const creators = members.filter((member) => member.role === "creator")
  const teachers = members.filter((member) => member.role === "teacher" || member.role === "creator")
  const students = members.filter((member) => member.role === "student")
  const hasMembers = members.length > 0

  return (
    <div className={styles.page}>
      <div className={styles.titleBlock}>
        <div className={styles.title}>Участники</div>
        <div className={styles.text}>Преподаватели и студенты, которые состоят в курсе.</div>
      </div>

      {isLoading && <Loading />}

      {!isLoading && hasMembers && (
        <>
          <div className={styles.group}>
            <div className={styles.groupTitle}>Создатель</div>
            <div className={styles.members}>
              {creators.map((member) => (
                <MemberCard key={member.user_id} member={member} canManage={false} onRoleChange={() => {}} onDelete={() => {}} />
              ))}
              {creators.length === 0 && <div className={styles.groupEmpty}>Пока никого нет</div>}
            </div>
          </div>

          <div className={styles.group}>
            <div className={styles.groupTitle}>Преподаватели</div>
            <div className={styles.members}>
              {teachers.map((member) => (
                <MemberCard
                  key={member.user_id}
                  member={member}
                  badgeLabel={member.role === "creator" ? "Преподаватель" : undefined}
                  canManage={canManageMembers && member.role !== "creator"}
                  onRoleChange={() => openRoleModal(member)}
                  onDelete={() => setMemberToDelete(member)}
                />
              ))}
              {teachers.length === 0 && <div className={styles.groupEmpty}>Пока никого нет</div>}
            </div>
          </div>

          <div className={styles.group}>
            <div className={styles.groupTitle}>Студенты</div>
            <div className={styles.members}>
              {students.map((member) => (
                <MemberCard
                  key={member.user_id}
                  member={member}
                  canManage={canManageMembers}
                  onRoleChange={() => openRoleModal(member)}
                  onDelete={() => setMemberToDelete(member)}
                />
              ))}
              {students.length === 0 && <div className={styles.groupEmpty}>Пока никого нет</div>}
            </div>
          </div>
        </>
      )}

      {!isLoading && !hasMembers && <div className={styles.emptyMessage}>Участников пока нет</div>}

      {selectedMember && (
        <Modal title="Изменить роль участника" onClose={() => !isSubmitting && setSelectedMember(null)} disabled={isSubmitting}>
          <div className={styles.modalText}>{getMemberName(selectedMember)}</div>

          <div className={styles.typeButtons}>
            <button
              className={`${styles.typeButton} ${selectedRole === "student" ? styles.typeButtonActive : ""}`}
              type="button"
              onClick={() => setSelectedRole("student")}
              disabled={isSubmitting}
            >
              Студент
            </button>
            <button
              className={`${styles.typeButton} ${selectedRole === "teacher" ? styles.typeButtonActive : ""}`}
              type="button"
              onClick={() => setSelectedRole("teacher")}
              disabled={isSubmitting}
            >
              Преподаватель
            </button>
          </div>

          <div className={styles.modalActions}>
            <button className={styles.secondaryButton} type="button" onClick={() => setSelectedMember(null)} disabled={isSubmitting}>
              Отмена
            </button>
            <button className={styles.primaryButton} type="button" onClick={() => void submitRoleChange()} disabled={isSubmitting || selectedRole === selectedMember.role}>
              {isSubmitting ? "Сохраняем..." : "Сохранить"}
            </button>
          </div>
        </Modal>
      )}

      {memberToDelete && (
        <Modal title="Удалить участника" onClose={() => !isSubmitting && setMemberToDelete(null)} disabled={isSubmitting}>
          <div className={styles.modalText}>Вы точно хотите удалить участника из курса?</div>
          <div className={styles.modalText}>{getMemberName(memberToDelete)}</div>
          <div className={styles.modalActions}>
            <button className={styles.secondaryButton} type="button" onClick={() => setMemberToDelete(null)} disabled={isSubmitting}>
              Отмена
            </button>
            <button className={styles.dangerButton} type="button" onClick={() => void submitDeleteMember()} disabled={isSubmitting}>
              {isSubmitting ? "Удаляем..." : "Удалить"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
