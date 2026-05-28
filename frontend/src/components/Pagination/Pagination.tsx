import ChevronLeftIcon from "../../assets/icons/pagination/chevron-left.svg?react"
import ChevronRightIcon from "../../assets/icons/pagination/chevron-right.svg?react"
import styles from "./Pagination.module.css"

type PaginationProps = {
  page: number
  total: number
  limit: number
  onChange: (page: number) => void
}

function getPageNumbers(current: number, totalPages: number): (number | "...")[] {
  if (totalPages <= 9) {
    return Array.from({ length: totalPages }, (_, i) => i + 1)
  }

  if (current <= 6) {
    return [1, 2, 3, 4, 5, 6, 7, 8, "...", totalPages]
  }

  if (current >= totalPages - 5) {
    return [1, "...", totalPages - 7, totalPages - 6, totalPages - 5, totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages]
  }

  return [1, "...", current - 3, current - 2, current - 1, current, current + 1, current + 2, current + 3, "...", totalPages]
}

export default function Pagination({ page, total, limit, onChange }: PaginationProps) {
  const totalPages = Math.ceil(total / limit)

  if (totalPages <= 1) return null

  const pages = getPageNumbers(page, totalPages)

  return (
    <div className={styles.pagination}>
      <button
        className={styles.navButton}
        type="button"
        onClick={() => onChange(page - 1)}
        disabled={page === 1}
        aria-label="Предыдущая страница"
      >
        <ChevronLeftIcon />
      </button>

      {pages.map((p, i) =>
        p === "..." ? (
          <span key={`dots-${i}`} className={styles.dots}>…</span>
        ) : (
          <button
            key={p}
            className={`${styles.pageButton} ${p === page ? styles.pageButtonActive : ""}`}
            type="button"
            onClick={() => onChange(p)}
            aria-label={`Страница ${p}`}
            aria-current={p === page ? "page" : undefined}
          >
            {p}
          </button>
        )
      )}

      <button
        className={styles.navButton}
        type="button"
        onClick={() => onChange(page + 1)}
        disabled={page === totalPages}
        aria-label="Следующая страница"
      >
        <ChevronRightIcon />
      </button>
    </div>
  )
}
