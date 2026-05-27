import { useEffect, useState } from "react"
import { useOutletContext } from "react-router-dom"
import ActionsIcon from "../../assets/icons/classes/actions.svg?react"
import { useToast } from "../../components/Toast/ToastProvider"
import { ApiError, ApiSilentError } from "../../services/api"
import { getClassMembers, type ClassMemberDto } from "../../services/classes.api"
import type { ClassLayoutContext } from "../ClassLayout/ClassLayout"
import styles from "./ClassMembersPage.module.css"

type MembersState = {
  isLoading: boolean
  members: ClassMemberDto[]
}

function getMemberName(member: ClassMemberDto) {
  const fullName = `${member.first_name ?? ""} ${member.last_name ?? ""}`.trim()
  return fullName || member.email
}

export default function ClassMembersPage() {
  const { classDetail } = useOutletContext<ClassLayoutContext>()
  const showToast = useToast()
  const [state, setState] = useState<MembersState>({
    isLoading: true,
    members: []
  })

  useEffect(() => {
    async function loadMembers() {
      if (!classDetail?.id) {
        setState((prev) => ({ ...prev, isLoading: false }))
        return
      }

      try {
        const members = await getClassMembers(classDetail.id)
        setState({ members, isLoading: false })
      } catch (error) {
        setState((prev) => ({ ...prev, isLoading: false }))
        if (error instanceof ApiSilentError) return
        showToast({
          type: "error",
          message: error instanceof ApiError ? error.message : "Не удалось загрузить участников",
          offsetBottom: 30
        })
      }
    }

    void loadMembers()
  }, [classDetail?.id])

  const creators = state.members.filter((member) => member.role === "creator")
  const teachers = state.members.filter((member) => member.role === "teacher")
  const students = state.members.filter((member) => member.role === "student")

  return (
    <div className={styles.page}>
      <div className={styles.titleBlock}>
        <div className={styles.title}>Участники</div>
        <div className={styles.text}>Преподаватели и студенты, которые состоят в курсе.</div>
      </div>

      {!state.isLoading && (
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
                  <button className={styles.iconButton} type="button" aria-label="Действия с участником">
                    <ActionsIcon className={styles.icon} />
                  </button>
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
                  <button className={styles.iconButton} type="button" aria-label="Действия с участником">
                    <ActionsIcon className={styles.icon} />
                  </button>
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
                  <button className={styles.iconButton} type="button" aria-label="Действия с участником">
                    <ActionsIcon className={styles.icon} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
