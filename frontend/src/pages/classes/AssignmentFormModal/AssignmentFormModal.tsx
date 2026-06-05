import { type ReactNode } from "react"
import Modal from "../../../components/Modal/Modal"
import FilePicker from "../../../components/FilePicker/FilePicker"
import {
  ACCEPTED_FILE_INPUT,
  ACCEPTED_FILE_TYPES_LABEL
} from "../../../services/files.api"
import styles from "./AssignmentFormModal.module.css"

export type AssignmentFormState = {
  title: string
  description: string
  material_url: string
  due_at: string
  max_grade: string
}

type DisplayedFile = {
  name: string
  size?: number | null
}

type AssignmentFormModalProps = {
  mode: "create" | "edit"
  size?: "md" | "lg"
  form: AssignmentFormState
  isSubmitting: boolean
  canSubmit: boolean
  dueAtError: string
  minDueAt: string
  materialFile: File | null
  isMaterialFileBusy?: boolean
  currentMaterialFile: DisplayedFile | null
  materialFileError: string
  onClose: () => void
  onSubmit: () => void
  onFieldChange: <K extends keyof AssignmentFormState>(key: K, value: AssignmentFormState[K]) => void
  onMaterialFileChange: (file: File) => void
  onMaterialFileRemove: () => void
  children?: ReactNode
}

export const EMPTY_ASSIGNMENT_FORM: AssignmentFormState = {
  title: "",
  description: "",
  material_url: "",
  due_at: "",
  max_grade: "100"
}

export default function AssignmentFormModal({
  mode,
  size = "md",
  form,
  isSubmitting,
  canSubmit,
  dueAtError,
  minDueAt,
  materialFile,
  isMaterialFileBusy = false,
  currentMaterialFile,
  materialFileError,
  onClose,
  onSubmit,
  onFieldChange,
  onMaterialFileChange,
  onMaterialFileRemove,
  children
}: AssignmentFormModalProps) {
  const displayedMaterialFile = materialFile
    ? { name: materialFile.name, size: materialFile.size }
    : currentMaterialFile

  return (
    <Modal title={mode === "edit" ? "Редактировать задание" : "Создать задание"} onClose={onClose} disabled={isSubmitting} size={size}>
      <label className={styles.field}>
        <div className={styles.fieldLabel}>Название</div>
        <input
          className={styles.input}
          type="text"
          value={form.title}
          onChange={(e) => onFieldChange("title", e.target.value)}
          placeholder="Например, Домашнее задание №1"
          disabled={isSubmitting}
        />
      </label>

      <div className={styles.field}>
        <div className={styles.fieldLabel}>Файл материала <span className={styles.fieldOptional}>(необязательно, до 20 МБ)</span></div>
        <FilePicker
          label="Выберите файл материала"
          busy={isMaterialFileBusy}
          accept={ACCEPTED_FILE_INPUT}
          hint={`Доступные форматы: ${ACCEPTED_FILE_TYPES_LABEL}`}
          file={displayedMaterialFile}
          onSelect={onMaterialFileChange}
          onRemove={displayedMaterialFile ? onMaterialFileRemove : undefined}
          removeTitle="Убрать файл материала"
          error={materialFileError}
          disabled={isSubmitting}
        />
      </div>

      <label className={styles.field}>
        <div className={styles.fieldLabel}>Описание <span className={styles.fieldOptional}>(необязательно)</span></div>
        <textarea
          className={styles.textarea}
          value={form.description}
          onChange={(e) => onFieldChange("description", e.target.value)}
          placeholder="Условие задания, что нужно сделать..."
          disabled={isSubmitting}
        />
      </label>

      <label className={styles.field}>
        <div className={styles.fieldLabel}>Ссылка на материал <span className={styles.fieldOptional}>(необязательно)</span></div>
        <input
          className={styles.input}
          type="url"
          value={form.material_url}
          onChange={(e) => onFieldChange("material_url", e.target.value)}
          placeholder="https://..."
          disabled={isSubmitting}
        />
      </label>

      <div className={styles.fieldRow}>
        <label className={styles.field}>
          <div className={styles.fieldLabel}>Дедлайн <span className={styles.fieldOptional}>(необязательно)</span></div>
          <input
            className={styles.input}
            type="datetime-local"
            min={minDueAt}
            value={form.due_at}
            onChange={(e) => onFieldChange("due_at", e.target.value)}
            disabled={isSubmitting}
          />
          {dueAtError && <div className={styles.fieldError}>{dueAtError}</div>}
        </label>

        <label className={styles.field}>
          <div className={styles.fieldLabel}>Максимальный балл</div>
          <input
            className={styles.input}
            type="number"
            min="1"
            value={form.max_grade}
            onChange={(e) => onFieldChange("max_grade", e.target.value)}
            placeholder="100"
            disabled={isSubmitting}
          />
        </label>
      </div>

      {children}

      <div className={styles.modalActions}>
        <button className={styles.secondaryButton} type="button" onClick={onClose} disabled={isSubmitting}>
          Отмена
        </button>
        <button className={styles.primaryButton} type="button" onClick={onSubmit} disabled={!canSubmit}>
          {isSubmitting ? "Сохраняем..." : mode === "edit" ? "Сохранить" : "Создать"}
        </button>
      </div>
    </Modal>
  )
}
