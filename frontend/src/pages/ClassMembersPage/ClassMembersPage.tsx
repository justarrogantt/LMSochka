import { type ReactNode, useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { useOutletContext } from "react-router-dom"
import ActionsIcon from "../../assets/icons/classes/actions.svg?react"
import CloseIcon from "../../assets/icons/classes/close.svg?react"
import TrashIcon from "../../assets/icons/classes/trash.svg?react"
import Loading from "../../components/Loading/Loading"
import { useToast } from "../../components/Toast/ToastProvider"
import { ApiError, ApiSilentError } from "../../services/api"
import {
  getClassMembers,
  removeClassMember,
  updateClassMemberRole,
  type ClassMemberDto,
  type ClassMembersDto
} from "./services/classMembers.api"
import type { ClassLayoutContext } from "../ClassLayout/ClassLayout"
import styles from "./ClassMembersPage.module.css"

function getMemberName(member: ClassMemberDto) {
  const fullName = `${member.first_name ?? ""} ${member.last_name ?? ""}`.trim()
  return fullName || member.email
}

function normalizeMembersResponse(data: ClassMembersDto | ClassMemberDto[]): ClassMembersDto {
  if (Array.isArray(data)) {
    const studentsCount = data.filter((member) => member.role === "student").length
    const teachersCount = data.filter((member) => member.role === "teacher").length
    return {
      items: data,
      students_count: studentsCount,
      teachers_count: teachersCount
    }
  }

  const rawItems = (data as ClassMembersDto & { members?: ClassMemberDto[] }).items ?? (data as { members?: ClassMemberDto[] }).members ?? []
  const studentsCount = data.students_count ?? rawItems.filter((member) => member.role === "student").length
  const teachersCount = data.teachers_count ?? rawItems.filter((member) => member.role === "teacher").length

  return {
    items: rawItems,
    students_count: studentsCount,
    teachers_count: teachersCount
  }
}

type ModalShellProps = {
  title: string
  onClose: () => void
  children: ReactNode
  disabled?: boolean
}

// Базовая обертка модального окна
function ModalShell({ title, onClose, children, disabled }: ModalShellProps) {
  return createPortal(
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(event) => event.stopPropagation()}>
        <div className={styles.modalHead}>
          <div className={styles.modalTitle}>{title}</div>
          <button className={styles.closeButton} type="button" onClick={onClose} aria-label="Закрыть окно" disabled={disabled}>
            <CloseIcon className={styles.closeIcon} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  )
}

export default function ClassMembersPage() {
  const { classDetail } = useOutletContext<ClassLayoutContext>()
  const showToast = useToast()
  const canManageMembers = classDetail?.user_role === "creator"

  // Данные участников
  const [members, setMembers] = useState<ClassMembersDto>({
    items: [],
    students_count: 0,
    teachers_count: 0
  })

  // Лоадер страницы
  const [isLoading, setIsLoading] = useState(true)

  // Состояние модалки изменения роли
  const [selectedMember, setSelectedMember] = useState<ClassMemberDto | null>(null)
  const [selectedRole, setSelectedRole] = useState<"teacher" | "student">("student")
  const [memberToDelete, setMemberToDelete] = useState<ClassMemberDto | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Загрузка участников курса
  useEffect(() => {
    async function loadMembers() {
      if (!classDetail?.id) {
        setIsLoading(false)
        return
      }

      try {
        const nextMembers = await getClassMembers(classDetail.id)
        setMembers(normalizeMembersResponse(nextMembers))
      } catch (error) {
        if (error instanceof ApiSilentError) return
        showToast({
          type: "error",
          message: error instanceof ApiError ? error.message : "Не удалось загрузить участников"
        })
      } finally {
        setIsLoading(false)
      }
    }

    void loadMembers()
  }, [classDetail?.id, showToast])

  const creators = members.items.filter((member) => member.role === "creator")
  const teachers = members.items.filter((member) => member.role === "teacher" || member.role === "creator")
  const students = members.items.filter((member) => member.role === "student")
  const hasMembers = members.items.length > 0

  // Открытие модалки изменения роли
  function openRoleModal(member: ClassMemberDto) {
    if (!canManageMembers || member.role === "creator") return
    setSelectedMember(member)
    setSelectedRole(member.role === "teacher" ? "teacher" : "student")
  }

  // Закрытие модалки изменения роли
  function closeRoleModal() {
    if (isSubmitting) return
    setSelectedMember(null)
  }

  // Открытие модалки удаления участника
  function openDeleteMemberModal(member: ClassMemberDto) {
    if (!canManageMembers || member.role === "creator") return
    setMemberToDelete(member)
  }

  // Закрытие модалки удаления участника
  function closeDeleteMemberModal() {
    if (isSubmitting) return
    setMemberToDelete(null)
  }

  // Изменение роли участника
  async function submitRoleChange() {
    if (!classDetail?.id || !selectedMember || isSubmitting) return

    const prevMembers = members
    setIsSubmitting(true)
    setSelectedMember(null)

    // Оптимистичное обновление роли в текущем списке
    setMembers((prev) =>
      normalizeMembersResponse({
        ...prev,
        items: prev.items.map((item) => (item.user_id === selectedMember.user_id ? { ...item, role: selectedRole } : item))
      })
    )

    try {
      await updateClassMemberRole(classDetail.id, selectedMember.user_id, selectedRole)
      showToast({ type: "neutral", message: "Роль участника обновлена" })
    } catch (error) {
      setMembers(prevMembers)
      showToast({
        type: "error",
        message: error instanceof ApiError ? error.message : "Не удалось изменить роль участника"
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Удаление участника из курса
  async function submitDeleteMember() {
    if (!classDetail?.id || !memberToDelete || isSubmitting) return

    const prevMembers = members
    setIsSubmitting(true)
    setMemberToDelete(null)

    // Оптимистичное удаление участника из текущего списка
    setMembers((prev) =>
      normalizeMembersResponse({
        ...prev,
        items: prev.items.filter((item) => item.user_id !== memberToDelete.user_id)
      })
    )

    try {
      await removeClassMember(classDetail.id, memberToDelete.user_id)
      showToast({ type: "neutral", message: "Участник удален из курса" })
    } catch (error) {
      setMembers(prevMembers)
      showToast({
        type: "error",
        message: error instanceof ApiError ? error.message : "Не удалось удалить участника"
      })
    } finally {
      setIsSubmitting(false)
    }
  }

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
                <div className={styles.memberCard} key={member.user_id}>
                  <div className={styles.avatar}>{getMemberName(member)[0]}</div>
                  <div className={styles.memberInfo}>
                    <div className={styles.memberName}>{getMemberName(member)}</div>
                    <div className={styles.memberEmail}>{member.email}</div>
                  </div>
                  <div className={styles.roleBadge}>Создатель</div>
                </div>
              ))}
              {creators.length === 0 && <div className={styles.groupEmpty}>Пока никого нет</div>}
            </div>
          </div>

          <div className={styles.group}>
            <div className={styles.groupTitle}>Преподаватели</div>
            <div className={styles.members}>
              {teachers.map((member) => (
                <div className={styles.memberCard} key={member.user_id}>
                  <div className={styles.avatar}>{getMemberName(member)[0]}</div>
                  <div className={styles.memberInfo}>
                    <div className={styles.memberName}>{getMemberName(member)}</div>
                    <div className={styles.memberEmail}>{member.email}</div>
                  </div>
                  <div className={styles.roleBadge}>Преподаватель</div>
                  {canManageMembers && member.role !== "creator" && (
                    <button className={styles.iconButton} type="button" aria-label="Изменить роль участника" onClick={() => openRoleModal(member)}>
                      <ActionsIcon className={styles.icon} />
                    </button>
                  )}
                  {canManageMembers && member.role !== "creator" && (
                    <button className={styles.iconButton} type="button" aria-label="Удалить участника" onClick={() => openDeleteMemberModal(member)}>
                      <TrashIcon className={styles.icon} />
                    </button>
                  )}
                </div>
              ))}
              {teachers.length === 0 && <div className={styles.groupEmpty}>Пока никого нет</div>}
            </div>
          </div>

          <div className={styles.group}>
            <div className={styles.groupTitle}>Студенты</div>
            <div className={styles.members}>
              {students.map((member) => (
                <div className={styles.memberCard} key={member.user_id}>
                  <div className={styles.avatar}>{getMemberName(member)[0]}</div>
                  <div className={styles.memberInfo}>
                    <div className={styles.memberName}>{getMemberName(member)}</div>
                    <div className={styles.memberEmail}>{member.email}</div>
                  </div>
                  <div className={styles.roleBadge}>Студент</div>
                  {canManageMembers && (
                    <button className={styles.iconButton} type="button" aria-label="Изменить роль участника" onClick={() => openRoleModal(member)}>
                      <ActionsIcon className={styles.icon} />
                    </button>
                  )}
                  {canManageMembers && (
                    <button className={styles.iconButton} type="button" aria-label="Удалить участника" onClick={() => openDeleteMemberModal(member)}>
                      <TrashIcon className={styles.icon} />
                    </button>
                  )}
                </div>
              ))}
              {students.length === 0 && <div className={styles.groupEmpty}>Пока никого нет</div>}
            </div>
          </div>
        </>
      )}

      {!isLoading && !hasMembers && <div className={styles.emptyMessage}>Участников пока нет</div>}

      {selectedMember && (
        <ModalShell title="Изменить роль участника" onClose={closeRoleModal} disabled={isSubmitting}>
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
            <button className={styles.secondaryButton} type="button" onClick={closeRoleModal} disabled={isSubmitting}>
              Отмена
            </button>
            <button className={styles.primaryButton} type="button" onClick={() => void submitRoleChange()} disabled={isSubmitting}>
              {isSubmitting ? "Сохраняем..." : "Сохранить"}
            </button>
          </div>
        </ModalShell>
      )}

      {memberToDelete && (
        <ModalShell title="Удалить участника" onClose={closeDeleteMemberModal} disabled={isSubmitting}>
          <div className={styles.modalText}>Вы точно хотите удалить участника из курса?</div>
          <div className={styles.modalText}>{getMemberName(memberToDelete)}</div>
          <div className={styles.modalActions}>
            <button className={styles.secondaryButton} type="button" onClick={closeDeleteMemberModal} disabled={isSubmitting}>
              Отмена
            </button>
            <button className={styles.dangerButton} type="button" onClick={() => void submitDeleteMember()} disabled={isSubmitting}>
              {isSubmitting ? "Удаляем..." : "Удалить"}
            </button>
          </div>
        </ModalShell>
      )}
    </div>
  )
}
