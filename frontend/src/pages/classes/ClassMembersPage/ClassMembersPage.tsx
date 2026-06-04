import { useEffect, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { useOutletContext } from "react-router-dom"
import CreatorIcon from "../../../assets/icons/classes/creator.svg?react"
import DeleteIcon from "../../../assets/icons/classes/delete.svg?react"
import MemberIcon from "../../../assets/icons/classes/member.svg?react"
import SettingsIcon from "../../../assets/icons/classes/settings.svg?react"
import CoursesIcon from "../../../assets/icons/layout/courses.svg?react"
import SearchIcon from "../../../assets/icons/layout/search.svg?react"
import Modal from "../../../components/Modal/Modal"
import { useToast } from "../../../components/Toast/ToastProvider"
import type { ClassLayoutContext } from "../../../layouts/ClassLayout/ClassLayout"
import { transferOwnership } from "../../../layouts/ClassLayout/services/class.api"
import { ApiError } from "../../../services/api"
import { formatUserName } from "../../../services/helpers"
import { listContainer, listItem } from "../../../shared/motion"
import type { ClassRole } from "../../../types/class.types"
import {
  getClassMembers,
  getRemovedClassMembers,
  removeClassMember,
  restoreClassMember,
  updateClassMemberRole,
  type ClassMemberDto
} from "./services/classMembers.api"
import SkeletonLoader from "./SkeletonLoader/SkeletonLoader"
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
  onRoleChange?: () => void
  onDelete?: () => void
  onRestore?: () => void
}

function MemberCard({ member, badgeRole, canManage, onRoleChange, onDelete, onRestore }: MemberCardProps) {
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
      {onRestore && (
        <button className={styles.primaryButton} type="button" onClick={onRestore}>
          Восстановить
        </button>
      )}
    </div>
  )
}

export default function ClassMembersPage() {
  const { classDetail, setClassDetail } = useOutletContext<ClassLayoutContext>()
  const showToast = useToast()
  const canManageMembers = classDetail?.permissions.can_manage_members ?? false

  // Активные участники курса
  const [members, setMembers] = useState<ClassMemberDto[]>([])

  // Исключённые участники, доступные для восстановления владельцу/преподавателю
  const [removedMembers, setRemovedMembers] = useState<ClassMemberDto[]>([])

  // Локальный поиск по участникам
  const [search, setSearch] = useState("")

  // Первичная загрузка вкладки
  const [isLoading, setIsLoading] = useState(true)

  // Участник и новая роль в модалке смены роли
  const [selectedMember, setSelectedMember] = useState<ClassMemberDto | null>(null)
  const [selectedRole, setSelectedRole] = useState<"teacher" | "student">("student")

  // Участник, выбранный для удаления или передачи владения
  const [memberToDelete, setMemberToDelete] = useState<ClassMemberDto | null>(null)
  const [memberToTransfer, setMemberToTransfer] = useState<ClassMemberDto | null>(null)

  // Идет ли запрос из модалок управления участниками
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
        if (canManageMembers) {
          const removed = await getRemovedClassMembers(classDetail.id)
          setRemovedMembers(removed.items)
        } else {
          setRemovedMembers([])
        }
      } catch (error) {
        if (error instanceof ApiError) {
          showToast({ type: "error", message: error.message })
          return
        }
        throw error
      } finally {
        setIsLoading(false)
      }
    }

    void loadMembers()
  }, [classDetail?.id, canManageMembers])

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
      if (error instanceof ApiError) {
        showToast({ type: "error", message: error.message })
        return
      }
      throw error
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
      const removed = await getRemovedClassMembers(classDetail.id)
      setRemovedMembers(removed.items)
      showToast({ type: "neutral", message: "Участник удален из курса" })
    } catch (error) {
      setMembers(prevMembers)
      if (error instanceof ApiError) {
        showToast({ type: "error", message: error.message })
        return
      }
      throw error
    } finally {
      setIsSubmitting(false)
    }
  }

  async function submitRestoreMember(member: ClassMemberDto) {
    if (!classDetail?.id || isSubmitting) return
    setIsSubmitting(true)
    try {
      const updated = await restoreClassMember(classDetail.id, member.user_id)
      setMembers(updated.items)
      setRemovedMembers((prev) => prev.filter((item) => item.user_id !== member.user_id))
      showToast({ type: "neutral", message: "Участник восстановлен как студент" })
    } catch (error) {
      if (error instanceof ApiError) {
        showToast({ type: "error", message: error.message })
        return
      }
      throw error
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
      if (error instanceof ApiError) {
        showToast({ type: "error", message: error.message })
        return
      }
      throw error
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

        {(isLoading || hasMembers) && (
          <label className={styles.search}>
            <div className={styles.searchControl}>
              <SearchIcon className={styles.searchFieldIcon} />
              <input
                className={styles.searchInput}
                type="search"
                placeholder="Поиск по имени или почте"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                disabled={isLoading}
              />
            </div>
          </label>
        )}
      </div>

      {isLoading && <SkeletonLoader />}

      {!isLoading && (
        <>
      {hasMembers && hasFiltered && (
        <>
          <div className={styles.group}>
            <div className={styles.groupTitle}>Создатель</div>
            <motion.div className={styles.members} variants={listContainer} initial="hidden" animate="visible">
              {creators.map((member) => (
                <motion.div key={member.user_id} variants={listItem}>
                  <MemberCard member={member} canManage={false} />
                </motion.div>
              ))}
              {creators.length === 0 && <div className={styles.groupEmpty}>Пока никого нет</div>}
            </motion.div>
          </div>

          <div className={styles.group}>
            <div className={styles.groupTitle}>Преподаватели</div>
            <motion.div className={styles.members} variants={listContainer} initial="hidden" animate="visible">
              {teachers.map((member) => (
                <motion.div key={member.user_id} variants={listItem}>
                  <MemberCard
                    member={member}
                    badgeRole={member.role === "creator" ? "teacher" : undefined}
                    canManage={canManageMembers && member.role !== "creator"}
                    onRoleChange={() => openRoleModal(member)}
                    onDelete={() => setMemberToDelete(member)}
                  />
                </motion.div>
              ))}
              {teachers.length === 0 && <div className={styles.groupEmpty}>Пока никого нет</div>}
            </motion.div>
          </div>

          <div className={styles.group}>
            <div className={styles.groupTitle}>Студенты</div>
            <motion.div className={styles.members} variants={listContainer} initial="hidden" animate="visible">
              {students.map((member) => (
                <motion.div key={member.user_id} variants={listItem}>
                  <MemberCard
                    member={member}
                    canManage={canManageMembers}
                    onRoleChange={() => openRoleModal(member)}
                    onDelete={() => setMemberToDelete(member)}
                  />
                </motion.div>
              ))}
              {students.length === 0 && <div className={styles.groupEmpty}>Пока никого нет</div>}
            </motion.div>
          </div>
        </>
      )}

      {canManageMembers && removedMembers.length > 0 && (
        <div className={styles.group}>
          <div className={styles.groupTitle}>Исключённые</div>
          <div className={styles.members}>
            {removedMembers.map((member) => (
              <MemberCard
                key={member.user_id}
                member={member}
                canManage={false}
                onRestore={() => void submitRestoreMember(member)}
              />
            ))}
          </div>
        </div>
      )}

      {!hasMembers && <div className={styles.emptyMessage}>Участников пока нет</div>}
      {hasMembers && !hasFiltered && <div className={styles.emptyMessage}>Участники не найдены</div>}
        </>
      )}

      <AnimatePresence>
        {selectedMember && (
        <Modal
          title={memberToTransfer ? "Передать владение курсом" : "Изменить роль участника"}
          onClose={() => {
            if (isSubmitting) return
            setMemberToTransfer(null)
            setSelectedMember(null)
          }}
          disabled={isSubmitting}
        >
          {memberToTransfer ? (
            <>
              <div className={styles.modalText}>
                Сделать владельцем курса участника {getMemberName(memberToTransfer)}?
              </div>
              <div className={styles.modalHint}>
                Вы станете преподавателем и потеряете права владельца: управление участниками, передачу прав и удаление курса.
              </div>
              <div className={styles.modalActions}>
                <button className={styles.secondaryButton} type="button" onClick={() => setMemberToTransfer(null)} disabled={isSubmitting}>
                  Назад
                </button>
                <button className={styles.dangerButton} type="button" onClick={() => void submitTransfer()} disabled={isSubmitting}>
                  {isSubmitting ? "Передаём..." : "Передать владение"}
                </button>
              </div>
            </>
          ) : (
            <>
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
            </>
          )}
        </Modal>
        )}
      </AnimatePresence>

      <AnimatePresence>
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
      </AnimatePresence>

    </div>
  )
}
