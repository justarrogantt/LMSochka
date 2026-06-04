import { useId, type ChangeEvent } from "react"
import { formatFileSize } from "../../services/files.api"
import styles from "./FilePicker.module.css"

type SelectedFile = {
  name: string
  size?: number | null
}

type FilePickerProps = {
  label?: string
  busy?: boolean
  busyLabel?: string
  disabled?: boolean
  accept?: string
  hint?: string
  error?: string
  file?: SelectedFile | null
  onDownload?: () => void
  onRemove?: () => void
  removeTitle?: string
  onSelect: (file: File) => void
}

export default function FilePicker({
  label = "Выберите файл",
  busy = false,
  busyLabel = "Загрузка...",
  disabled = false,
  accept,
  hint,
  error,
  file,
  onDownload,
  onRemove,
  removeTitle = "Убрать файл",
  onSelect
}: FilePickerProps) {
  const inputId = useId()
  const isLocked = disabled || busy

  function onChange(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0]
    event.target.value = ""
    if (selected) onSelect(selected)
  }

  return (
    <div className={styles.root}>
      <label
        className={`${styles.dropzone} ${isLocked ? styles.dropzoneLocked : ""}`}
        htmlFor={inputId}
        aria-disabled={isLocked}
      >
        <span className={styles.icon} aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 16V4" />
            <path d="m7 9 5-5 5 5" />
            <path d="M5 16v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" />
          </svg>
        </span>
        <span className={styles.label}>{busy ? busyLabel : label}</span>
        <input
          id={inputId}
          className={styles.input}
          type="file"
          accept={accept}
          onChange={onChange}
          disabled={isLocked}
        />
      </label>

      {file && (
        <div className={styles.chip}>
          <span className={styles.chipIcon} aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <path d="M14 2v6h6" />
            </svg>
          </span>

          {onDownload ? (
            <button type="button" className={styles.chipName} onClick={onDownload} title={`Скачать ${file.name}`}>
              {file.name}
            </button>
          ) : (
            <span className={styles.chipName} title={file.name}>{file.name}</span>
          )}

          {typeof file.size === "number" && <span className={styles.chipSize}>{formatFileSize(file.size)}</span>}

          {onRemove && (
            <button
              type="button"
              className={styles.chipRemove}
              onClick={onRemove}
              disabled={isLocked}
              aria-label={removeTitle}
              title={removeTitle}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          )}
        </div>
      )}

      {hint && <div className={styles.hint}>{hint}</div>}
      {error && <div className={styles.error}>{error}</div>}
    </div>
  )
}
