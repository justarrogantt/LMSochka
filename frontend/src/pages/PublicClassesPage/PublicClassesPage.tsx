import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import ArrowIcon from "../../assets/icons/classes/arrow.svg?react"
import Loading from "../../components/Loading/Loading"
import { useToast } from "../../components/Toast/ToastProvider"
import { ApiSilentError } from "../../services/api"
import { getPublicClasses, joinOpenClass, type PublicClassDto } from "./services/publicClasses.api"
import { formatDateTime, truncate } from "../../services/helpers"
import styles from "./PublicClassesPage.module.css"

export default function PublicClassesPage() {
  const navigate = useNavigate()
  const showToast = useToast()

  // Данные каталога с бэка
  const [classes, setClasses] = useState<PublicClassDto[]>([])

  // Лоадер страницы
  const [isLoading, setIsLoading] = useState(true)

  // Поисковая строка
  const [search, setSearch] = useState("")

  // Id курсов, в которые сейчас выполняется вступление
  const [submittingIds, setSubmittingIds] = useState<Set<number>>(new Set())

  // Загрузка публичных курсов
  useEffect(() => {
    async function loadPublicClasses() {
      try {
        const nextClasses = await getPublicClasses()
        setClasses(nextClasses)
      } catch (error) {
        if (error instanceof ApiSilentError) return
        showToast({
          type: "error",
          message: (error as Error).message
        })
      } finally {
        setIsLoading(false)
      }
    }

    void loadPublicClasses()
  }, [])

  const filteredClasses = classes.filter((item) => item.name.toLowerCase().includes(search.trim().toLowerCase()))

  // Вступление в открытый курс
  async function joinById(classId: number) {
    if (submittingIds.has(classId)) return
    setSubmittingIds((prev) => new Set(prev).add(classId))

    try {
      await joinOpenClass(classId)
      setClasses((prev) => prev.map((item) => (item.id === classId ? { ...item, is_member: true } : item)))
      showToast({ type: "neutral", message: "Вы вступили в курс" })
    } catch (error) {
      showToast({
        type: "error",
        message: (error as Error).message
      })
    } finally {
      setSubmittingIds((prev) => {
        const next = new Set(prev)
        next.delete(classId)
        return next
      })
    }
  }

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
        <input className={styles.searchInput} placeholder="Например, Python" type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
      </label>

      {isLoading && <Loading />}

      <div className={styles.cards}>
        {!isLoading &&
          filteredClasses.map((item) => (
            <div className={styles.card} key={item.id}>
              <div className={styles.cardInfo}>
                <div className={styles.cardTitle}>{truncate(item.name, 60)}</div>
                <div className={styles.cardMeta}>
                  <div>{item.students_count} студентов</div>
                  <div>Создан {formatDateTime(item.created_at)}</div>
                </div>
              </div>

              {item.is_member && (
                <button className={styles.secondaryButton} type="button" onClick={() => navigate(`/classes/${item.id}`)}>
                  Вы уже участник
                </button>
              )}

              {!item.is_member && (
                <button
                  className={styles.primaryButton}
                  type="button"
                  onClick={() => void joinById(item.id)}
                  disabled={submittingIds.has(item.id)}
                >
                  {submittingIds.has(item.id) ? "Вступаем..." : "Присоединиться"}
                </button>
              )}
            </div>
          ))}

        {!isLoading && filteredClasses.length === 0 && <div className={styles.emptyMessage}>Тут пока пусто</div>}
      </div>
    </div>
  )
}
