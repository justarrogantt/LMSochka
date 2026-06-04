import { useEffect, useState, type FormEvent } from "react"
import { motion } from "framer-motion"
import { useNavigate } from "react-router-dom"
import ArrowIcon from "../../../assets/icons/classes/arrow.svg?react"
import SearchIcon from "../../../assets/icons/layout/search.svg?react"
import Pagination from "../../../components/Pagination/Pagination"
import { useToast } from "../../../components/Toast/ToastProvider"
import { ApiError } from "../../../services/api"
import { formatDateTime, truncate } from "../../../services/helpers"
import { listContainer, listItem } from "../../../shared/motion"
import { getPublicClasses, joinOpenClass, type PublicClassDto } from "./services/publicClasses.api"
import SkeletonLoader from "./SkeletonLoader/SkeletonLoader"
import styles from "./PublicClassesPage.module.css"

const LIMIT = 3

type PublicClassCardProps = {
  item: PublicClassDto
  isJoining: boolean
  onOpen: () => void
  onJoin: () => void
}

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

  const [classes, setClasses] = useState<PublicClassDto[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [appliedSearch, setAppliedSearch] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const [totalItems, setTotalItems] = useState(0)
  const [submittingIds, setSubmittingIds] = useState<Set<number>>(new Set())

  async function loadPublicClasses(page: number, searchText: string) {
    setIsLoading(true)

    try {
      const data = await getPublicClasses(searchText, page, LIMIT)
      setClasses(data.items)
      setTotalItems(data.total)
      setCurrentPage(data.page)
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

  useEffect(() => {
    void loadPublicClasses(1, "")
  }, [])

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const nextSearch = search.trim()
    setAppliedSearch(nextSearch)
    void loadPublicClasses(1, nextSearch)
  }

  async function joinById(classId: number) {
    if (submittingIds.has(classId)) return
    setSubmittingIds((prev) => new Set(prev).add(classId))

    try {
      await joinOpenClass(classId)
      setClasses((prev) => prev.map((item) => (item.id === classId ? { ...item, is_member: true } : item)))
      showToast({ type: "neutral", message: "Вы вступили в курс" })
    } catch (error) {
      if (error instanceof ApiError) {
        showToast({ type: "error", message: error.message })
        return
      }
      throw error
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

      <form className={styles.search} onSubmit={submitSearch}>
        <label className={styles.searchField}>
          <div className={styles.searchLabel}>Поиск курса</div>
          <div className={styles.searchControl}>
            <SearchIcon className={styles.searchFieldIcon} />
            <input
              className={styles.searchInput}
              placeholder="Например, Python"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              disabled={isLoading}
            />
          </div>
        </label>
        <button className={styles.searchSubmit} type="submit" disabled={isLoading}>
          Найти
        </button>
      </form>

      {isLoading && <SkeletonLoader />}

      {!isLoading && (
        <>
        {classes.length === 0 ? (
          <div className={styles.emptyMessage}>Тут пока пусто</div>
        ) : (
          <motion.div className={styles.cards} variants={listContainer} initial="hidden" animate="visible">
            {classes.map((item) => (
              <motion.div key={item.id} variants={listItem}>
                <PublicClassCard
                  item={item}
                  isJoining={submittingIds.has(item.id)}
                  onOpen={() => navigate(`/classes/${item.id}`)}
                  onJoin={() => void joinById(item.id)}
                />
              </motion.div>
            ))}
          </motion.div>
        )}
        </>
      )}

      <Pagination page={currentPage} total={totalItems} limit={LIMIT} onChange={(page) => void loadPublicClasses(page, appliedSearch)} />
    </div>
  )
}
