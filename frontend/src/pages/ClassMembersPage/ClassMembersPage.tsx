import { useEffect, useState } from "react"
import { useOutletContext } from "react-router-dom"
import ActionsIcon from "../../assets/icons/classes/actions.svg?react"
import Loading from "../../components/Loading/Loading"
import { useToast } from "../../components/Toast/ToastProvider"
import { ApiSilentError } from "../../services/api"
import { getClassMembers, type ClassMemberDto, type ClassMembersDto } from "../../services/classes.api"
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

  return {
    items: data.items ?? [],
    students_count: data.students_count ?? 0,
    teachers_count: data.teachers_count ?? 0
  }
}

export default function ClassMembersPage() {
  const { classDetail } = useOutletContext<ClassLayoutContext>()
  const showToast = useToast()
  const canManageMembers = classDetail?.user_role !== "student"

  // Данные участников
  const [members, setMembers] = useState<ClassMembersDto>({
    items: [],
    students_count: 0,
    teachers_count: 0
  })

  // Лоадер страницы
  const [isLoading, setIsLoading] = useState(true)

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
          message: error instanceof Error ? error.message : "Не удалось загрузить участников"
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
                  {canManageMembers && (
                    <button className={styles.iconButton} type="button" aria-label="Действия с участником">
                      <ActionsIcon className={styles.icon} />
                    </button>
                  )}
                </div>
              ))}
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
                  {canManageMembers && (
                    <button className={styles.iconButton} type="button" aria-label="Действия с участником">
                      <ActionsIcon className={styles.icon} />
                    </button>
                  )}
                </div>
              ))}
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
                    <button className={styles.iconButton} type="button" aria-label="Действия с участником">
                      <ActionsIcon className={styles.icon} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {!isLoading && !hasMembers && <div className={styles.emptyMessage}>Участников пока нет</div>}
    </div>
  )
}
