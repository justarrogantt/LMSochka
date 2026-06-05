import { useId, type ChangeEvent } from "react"
import UploadIcon from "../../assets/icons/file/upload.svg?react"
import DocumentIcon from "../../assets/icons/file/document.svg?react"
import CloseIcon from "../../assets/icons/file/close.svg?react"
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
          <UploadIcon />
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
            <DocumentIcon />
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
              <CloseIcon aria-hidden="true" />
            </button>
          )}
        </div>
      )}

      {hint && <div className={styles.hint}>{hint}</div>}
      {error && <div className={styles.error}>{error}</div>}
    </div>
  )
}
