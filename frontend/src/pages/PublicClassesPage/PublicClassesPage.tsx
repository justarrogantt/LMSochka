import { useNavigate } from "react-router-dom"
import ArrowIcon from "../../assets/icons/classes/arrow.svg?react"
import styles from "./PublicClassesPage.module.css"

type PublicClass = {
  id: number
  name: string
  created_at: string
  students_count: number
  is_member: boolean
}

const publicClasses: PublicClass[] = [
  {
    id: 18,
    name: "Основы Python",
    created_at: "10.05.2026",
    students_count: 19,
    is_member: true
  },
  {
    id: 31,
    name: "Web-разработка для начинающих",
    created_at: "18.05.2026",
    students_count: 14,
    is_member: false
  },
  {
    id: 44,
    name: "Базы данных ИСП-21",
    created_at: "21.05.2026",
    students_count: 22,
    is_member: false
  }
]

export default function PublicClassesPage() {
  const navigate = useNavigate()

  return (
    <div className={styles.page}>
      <button className={styles.backButton} type="button" onClick={() => navigate("/classes")}>
        <ArrowIcon className={styles.backIcon} />
        <div>Мои курсы</div>
      </button>

      <div className={styles.pageHead}>
        <div className={styles.titleBlock}>
          <div className={styles.title}>Каталог открытых курсов</div>
          <div className={styles.text}>Найдите курс по названию и присоединитесь без кода приглашения.</div>
        </div>
      </div>

      <label className={styles.search}>
        <div className={styles.searchLabel}>Поиск курса</div>
        <input className={styles.searchInput} placeholder="Например, Python" type="search" />
      </label>

      <div className={styles.cards}>
        {publicClasses.map((item) => (
          <div className={styles.card} key={item.id}>
            <div className={styles.cardInfo}>
              <div className={styles.cardTitle}>{item.name}</div>
              <div className={styles.cardMeta}>
                <div>{item.students_count} студентов</div>
                <div>Создан {item.created_at}</div>
              </div>
            </div>

            {item.is_member && (
              <button className={styles.secondaryButton} type="button" onClick={() => navigate(`/classes/${item.id}`)}>
                Вы уже участник
              </button>
            )}

            {!item.is_member && (
              <button className={styles.primaryButton} type="button">
                Присоединиться
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
