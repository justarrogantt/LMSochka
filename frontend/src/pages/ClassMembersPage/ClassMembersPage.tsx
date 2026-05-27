import styles from "./ClassMembersPage.module.css"
import ActionsIcon from "../../assets/icons/classes/actions.svg?react"

const members = [
  {
    id: 1,
    name: "Анна Иванова",
    email: "anna@example.com",
    role: "Создатель",
    group: "Преподаватели"
  },
  {
    id: 2,
    name: "Петр Смирнов",
    email: "petr@example.com",
    role: "Преподаватель",
    group: "Преподаватели"
  },
  {
    id: 3,
    name: "student@example.com",
    email: "student@example.com",
    role: "Студент",
    group: "Студенты"
  }
]

export default function ClassMembersPage() {
  const creators = members.filter((member) => member.role === "Создатель")
  const teachers = members.filter((member) => member.group === "Преподаватели" && member.role !== "Создатель")
  const students = members.filter((member) => member.group === "Студенты")

  return (
    <div className={styles.page}>
      <div className={styles.titleBlock}>
        <div className={styles.title}>Участники</div>
        <div className={styles.text}>Преподаватели и студенты, которые состоят в курсе.</div>
      </div>

      <div className={styles.group}>
        <div className={styles.groupTitle}>Создатель</div>
        <div className={styles.members}>
          {creators.map((member) => (
            <div className={styles.memberCard} key={member.id}>
              <div className={styles.avatar}>{member.name[0]}</div>
              <div className={styles.memberInfo}>
                <div className={styles.memberName}>{member.name}</div>
                <div className={styles.memberEmail}>{member.email}</div>
              </div>
              <div className={styles.roleBadge}>{member.role}</div>
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
            <div className={styles.memberCard} key={member.id}>
              <div className={styles.avatar}>{member.name[0]}</div>
              <div className={styles.memberInfo}>
                <div className={styles.memberName}>{member.name}</div>
                <div className={styles.memberEmail}>{member.email}</div>
              </div>
              <div className={styles.roleBadge}>{member.role}</div>
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
            <div className={styles.memberCard} key={member.id}>
              <div className={styles.avatar}>{member.name[0]}</div>
              <div className={styles.memberInfo}>
                <div className={styles.memberName}>{member.name}</div>
                <div className={styles.memberEmail}>{member.email}</div>
              </div>
              <div className={styles.roleBadge}>{member.role}</div>
              <button className={styles.iconButton} type="button" aria-label="Действия с участником">
                <ActionsIcon className={styles.icon} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
