import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import ArrowIcon from "../../../assets/icons/classes/arrow.svg?react"
import Loading from "../../../components/Loading/Loading"
import Pagination from "../../../components/Pagination/Pagination"
import { useToast } from "../../../components/Toast/ToastProvider"
import { ApiSilentError } from "../../../services/api"
import { formatDateTime, truncate } from "../../../services/helpers"
import { getPublicClasses, joinOpenClass, type PublicClassDto } from "./services/publicClasses.api"
import styles from "./PublicClassesPage.module.css"

const LIMIT = 3

type PublicClassCardProps = {
  item: PublicClassDto
  isJoining: boolean
  onOpen: () => void
  onJoin: () => void
}

// Карточка открытого курса в каталоге
function PublicClassCard({ item, isJoining, onOpen, onJoin }: PublicClassCardProps) {
  return (
    <div className={styles.card}>
      <div className={styles.cardInfo}>
        <div className={styles.cardTitle}>{truncate(item.name, 60)}</div>
        <div className={styles.cardMeta}>
          <div>{item.students_count} студентов</div>
          <div>Создан {formatDateTime(item.created_at)}</div>
        </div>
      </div>

      {item.is_member ? (
        <button className={styles.secondaryButton} type="button" onClick={onOpen}>
          Перейти в курс
        </button>
      ) : (
        <button className={styles.primaryButton} type="button" onClick={onJoin} disabled={isJoining}>
          {isJoining ? "Вступаем..." : "Присоединиться"}
        </button>
      )}
    </div>
  )
}

export default function PublicClassesPage() {
  const navigate = useNavigate()
  const showToast = useToast()

  // Курсы каталога
  const [classes, setClasses] = useState<PublicClassDto[]>([])

  // Лоадер страницы
  const [isLoading, setIsLoading] = useState(true)

  // Поисковая строка. Фильтрация идёт на бэке через query-параметр search.
  const [search, setSearch] = useState("")

  // Пагинация каталога открытых курсов
  const [currentPage, setCurrentPage] = useState(1)
  const [totalItems, setTotalItems] = useState(0)

  // Id курсов, в которые сейчас выполняется вступление
  const [submittingIds, setSubmittingIds] = useState<Set<number>>(new Set())

  // Загрузка страницы каталога открытых курсов
  async function loadPublicClasses(page: number, searchText: string) {
    setIsLoading(true)

    try {
      const data = await getPublicClasses(searchText, page, LIMIT)
      setClasses(data.items)
      setTotalItems(data.total)
      setCurrentPage(data.page)
    } catch (error) {
      if (error instanceof ApiSilentError) return
      showToast({ type: "error", message: (error as Error).message })
    } finally {
      setIsLoading(false)
    }
  }

  // При изменении поиска возвращаемся на первую страницу.
  useEffect(() => {
    void loadPublicClasses(1, search)
  }, [search])

  // Вступление в открытый курс (после успеха помечаем карточку как участник)
  async function joinById(classId: number) {
    if (submittingIds.has(classId)) return
    setSubmittingIds((prev) => new Set(prev).add(classId))

    try {
      await joinOpenClass(classId)
      setClasses((prev) => prev.map((item) => (item.id === classId ? { ...item, is_member: true } : item)))
      showToast({ type: "neutral", message: "Вы вступили в курс" })
    } catch (error) {
      showToast({ type: "error", message: (error as Error).message })
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
          classes.map((item) => (
            <PublicClassCard
              key={item.id}
              item={item}
              isJoining={submittingIds.has(item.id)}
              onOpen={() => navigate(`/classes/${item.id}`)}
              onJoin={() => void joinById(item.id)}
            />
          ))}

        {!isLoading && classes.length === 0 && <div className={styles.emptyMessage}>Тут пока пусто</div>}
      </div>

      <Pagination page={currentPage} total={totalItems} limit={LIMIT} onChange={(page) => void loadPublicClasses(page, search)} />
    </div>
  )
}
