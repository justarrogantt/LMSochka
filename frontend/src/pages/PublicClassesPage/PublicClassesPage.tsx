import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import ArrowIcon from "../../assets/icons/classes/arrow.svg?react"
import { useToast } from "../../components/Toast/ToastProvider"
import { ApiError, ApiSilentError } from "../../services/api"
import { getPublicClasses, joinOpenClass, type PublicClassDto } from "../../services/classes.api"
import styles from "./PublicClassesPage.module.css"

type PublicClassesState = {
  search: string
  isLoading: boolean
  classes: PublicClassDto[]
}

export default function PublicClassesPage() {
  const navigate = useNavigate()
  const showToast = useToast()
  const [state, setState] = useState<PublicClassesState>({
    search: "",
    isLoading: true,
    classes: []
  })

  useEffect(() => {
    async function loadPublicClasses() {
      try {
        const classes = await getPublicClasses()
        setState((prev) => ({ ...prev, classes, isLoading: false }))
      } catch (error) {
        setState((prev) => ({ ...prev, isLoading: false }))
        if (error instanceof ApiSilentError) return
        showToast({
          type: "error",
          message: error instanceof ApiError ? error.message : "Не удалось загрузить каталог",
          offsetBottom: 30
        })
      }
    }

    void loadPublicClasses()
  }, [])

  const filteredClasses = state.classes.filter((item) =>
    item.name.toLowerCase().includes(state.search.trim().toLowerCase())
  )

  async function joinById(classId: number) {
    const prevClasses = state.classes
    setState((prev) => ({
      ...prev,
      classes: prev.classes.map((item) => (item.id === classId ? { ...item, is_member: true } : item))
    }))

    try {
      await joinOpenClass(classId)
      showToast({ type: "neutral", message: "Вы вступили в курс", offsetBottom: 30 })
    } catch (error) {
      setState((prev) => ({ ...prev, classes: prevClasses }))
      if (error instanceof ApiSilentError) return
      showToast({
        type: "error",
        message: error instanceof ApiError ? error.message : "Не удалось вступить в курс",
        offsetBottom: 30
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
        <input
          className={styles.searchInput}
          placeholder="Например, Python"
          type="search"
          value={state.search}
          onChange={(event) => setState((prev) => ({ ...prev, search: event.target.value }))}
        />
      </label>

      <div className={styles.cards}>
        {!state.isLoading &&
          filteredClasses.map((item) => (
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
                <button className={styles.primaryButton} type="button" onClick={() => void joinById(item.id)}>
                  Присоединиться
                </button>
              )}
            </div>
          ))}

        {!state.isLoading && filteredClasses.length === 0 && <div className={styles.emptyMessage}>Тут пока пусто</div>}
      </div>
    </div>
  )
}
