import { useEffect, useState } from "react"
import { useOutletContext } from "react-router-dom"
import CreatorIcon from "../../../assets/icons/classes/creator.svg?react"
import DeleteIcon from "../../../assets/icons/classes/delete.svg?react"
import MemberIcon from "../../../assets/icons/classes/member.svg?react"
import SettingsIcon from "../../../assets/icons/classes/settings.svg?react"
import CoursesIcon from "../../../assets/icons/layout/courses.svg?react"
import SearchIcon from "../../../assets/icons/layout/search.svg?react"
import Modal from "../../../components/Modal/Modal"
import Loading from "../../../components/Loading/Loading"
import { useToast } from "../../../components/Toast/ToastProvider"
import type { ClassLayoutContext } from "../../../layouts/ClassLayout/ClassLayout"
import { transferOwnership } from "../../../layouts/ClassLayout/services/class.api"
import { ApiSilentError } from "../../../services/api"
import { formatUserName } from "../../../services/helpers"
import type { ClassRole } from "../../../types/class.types"
import {
  getClassMembers,
  removeClassMember,
  updateClassMemberRole,
  type ClassMemberDto
} from "./services/classMembers.api"
import styles from "./ClassMembersPage.module.css"

const roleBadge: Record<ClassRole, { label: string; className: string; Icon: typeof CreatorIcon }> = {
  creator: { label: "Создатель", className: styles.badgeCreator, Icon: CreatorIcon },
  teacher: { label: "Преподаватель", className: styles.badgeTeacher, Icon: CoursesIcon },
  student: { label: "Студент", className: styles.badgeStudent, Icon: MemberIcon }
}

function getMemberName(member: ClassMemberDto) {
  return formatUserName(member)
}

type MemberCardProps = {
  member: ClassMemberDto
  badgeRole?: ClassRole
  canManage: boolean
  onRoleChange: () => void
  onDelete: () => void
}

function MemberCard({ member, badgeRole, canManage, onRoleChange, onDelete }: MemberCardProps) {
  const name = getMemberName(member)
  const badge = roleBadge[badgeRole ?? member.role]
  const BadgeIcon = badge.Icon

  return (
    <div className={styles.memberCard}>
      <div className={styles.avatar}>{name[0]}</div>
      <div className={styles.memberInfo}>
        <div className={styles.memberName}>{name}</div>
        <div className={styles.memberEmail}>{member.email}</div>
      </div>
      <div className={`${styles.roleBadge} ${badge.className}`}>
        <BadgeIcon className={styles.badgeIcon} />
        {badge.label}
      </div>
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
  const { classDetail, setClassDetail } = useOutletContext<ClassLayoutContext>()
  const showToast = useToast()
  const canManageMembers = classDetail?.permissions.can_manage_members ?? false

  const [members, setMembers] = useState<ClassMemberDto[]>([])
  const [search, setSearch] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [selectedMember, setSelectedMember] = useState<ClassMemberDto | null>(null)
  const [selectedRole, setSelectedRole] = useState<"teacher" | "student">("student")
  const [memberToDelete, setMemberToDelete] = useState<ClassMemberDto | null>(null)
  const [memberToTransfer, setMemberToTransfer] = useState<ClassMemberDto | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

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
  }, [classDetail?.id])

  function openRoleModal(member: ClassMemberDto) {
    setSelectedMember(member)
    setSelectedRole(member.role === "teacher" ? "teacher" : "student")
  }

  async function submitRoleChange() {
    if (!classDetail?.id || !selectedMember || isSubmitting) return

    const prevMembers = members
    const memberId = selectedMember.user_id
    setSelectedMember(null)
    setIsSubmitting(true)
    setMembers((prev) => prev.map((item) => (item.user_id === memberId ? { ...item, role: selectedRole } : item)))

    try {
      const updated = await updateClassMemberRole(classDetail.id, memberId, selectedRole)
      setMembers(updated.items)
      showToast({ type: "neutral", message: "Роль участника обновлена" })
    } catch (error) {
      setMembers(prevMembers)
      showToast({ type: "error", message: (error as Error).message })
    } finally {
      setIsSubmitting(false)
    }
  }

  async function submitDeleteMember() {
    if (!classDetail?.id || !memberToDelete || isSubmitting) return

    const prevMembers = members
    const memberId = memberToDelete.user_id
    setMemberToDelete(null)
    setIsSubmitting(true)
    setMembers((prev) => prev.filter((item) => item.user_id !== memberId))

    try {
      const updated = await removeClassMember(classDetail.id, memberId)
      setMembers(updated.items)
      showToast({ type: "neutral", message: "Участник удален из курса" })
    } catch (error) {
      setMembers(prevMembers)
      showToast({ type: "error", message: (error as Error).message })
    } finally {
      setIsSubmitting(false)
    }
  }

  async function submitTransfer() {
    if (!classDetail?.id || !memberToTransfer || isSubmitting) return

    const target = memberToTransfer
    setIsSubmitting(true)

    try {
      const updated = await transferOwnership(classDetail.id, target.user_id)
      setClassDetail(updated)
      const data = await getClassMembers(classDetail.id)
      setMembers(data.items)
      setMemberToTransfer(null)
      setSelectedMember(null)
      showToast({ type: "neutral", message: `Курс передан: ${getMemberName(target)}` })
    } catch (error) {
      showToast({ type: "error", message: (error as Error).message })
    } finally {
      setIsSubmitting(false)
    }
  }

  const query = search.trim().toLowerCase()
  const filteredMembers = query
    ? members.filter((member) => getMemberName(member).toLowerCase().includes(query) || member.email.toLowerCase().includes(query))
    : members

  const creators = filteredMembers.filter((member) => member.role === "creator")
  const teachers = filteredMembers.filter((member) => member.role === "teacher" || member.role === "creator")
  const students = filteredMembers.filter((member) => member.role === "student")
  const hasMembers = members.length > 0
  const hasFiltered = filteredMembers.length > 0

  return (
    <div className={styles.page}>
      <div className={styles.pageHead}>
        <div className={styles.titleBlock}>
          <div className={styles.title}>Участники</div>
          <div className={styles.text}>Преподаватели и студенты, которые состоят в курсе.</div>
        </div>

        {hasMembers && (
          <label className={styles.search}>
            <div className={styles.searchControl}>
              <SearchIcon className={styles.searchFieldIcon} />
              <input
                className={styles.searchInput}
                type="search"
                placeholder="Поиск по имени или почте"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </label>
        )}
      </div>

      {isLoading && <Loading />}

      {!isLoading && hasMembers && hasFiltered && (
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
                  badgeRole={member.role === "creator" ? "teacher" : undefined}
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
      {!isLoading && hasMembers && !hasFiltered && <div className={styles.emptyMessage}>Участники не найдены</div>}

      {selectedMember && !memberToTransfer && (
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
            {selectedMember.role !== "creator" && (
              <button
                className={styles.typeButton}
                type="button"
                onClick={() => setMemberToTransfer(selectedMember)}
                disabled={isSubmitting}
              >
                Владелец
              </button>
            )}
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

      {memberToTransfer && (
        <Modal title="Передать владение курсом" onClose={() => !isSubmitting && setMemberToTransfer(null)} disabled={isSubmitting}>
          <div className={styles.modalText}>
            Сделать владельцем курса участника {getMemberName(memberToTransfer)}?
          </div>
          <div className={styles.modalHint}>
            Вы станете преподавателем и потеряете права владельца: управление участниками, передачу прав и удаление курса.
          </div>
          <div className={styles.modalActions}>
            <button className={styles.secondaryButton} type="button" onClick={() => setMemberToTransfer(null)} disabled={isSubmitting}>
              Отмена
            </button>
            <button className={styles.dangerButton} type="button" onClick={() => void submitTransfer()} disabled={isSubmitting}>
              {isSubmitting ? "Передаём..." : "Передать владение"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
