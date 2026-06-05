import { useState } from "react"
import AddIcon from "../../assets/icons/classes/add.svg?react"
import DeleteIcon from "../../assets/icons/classes/delete.svg?react"
import CloseIcon from "../../assets/icons/file/close.svg?react"
import { formatUserName } from "../../services/helpers"
import styles from "./GroupEditor.module.css"

export type EditorMember = {
  user_id: number
  email: string
  first_name: string | null
  last_name: string | null
  is_active?: boolean
}

export type EditorGroup = {
  key: string
  title: string
  members: EditorMember[]
  // у команды уже есть решение → состав менять нельзя
  locked?: boolean
}

type GroupEditorProps = {
  groups: EditorGroup[]
  unassigned: EditorMember[]
  disabled?: boolean
  // общий лимит участников на команду (null/undefined — без ограничения)
  maxTeamSize?: number | null
  onAddGroup: () => void
  onRenameGroup: (key: string, title: string) => void
  onDeleteGroup: (key: string) => void
  onAddMember: (key: string, userId: number) => void
  onRemoveMember: (key: string, userId: number) => void
  onAutoFill?: () => void
}

// Подпись участника: имя или email
function memberName(member: EditorMember): string {
  return formatUserName(member)
}

export default function GroupEditor({
  groups,
  unassigned,
  disabled = false,
  maxTeamSize = null,
  onAddGroup,
  onRenameGroup,
  onDeleteGroup,
  onAddMember,
  onRemoveMember,
  onAutoFill
}: GroupEditorProps) {
  // Для какой группы открыт поиск участников и строка запроса
  const [searchKey, setSearchKey] = useState<string | null>(null)
  const [query, setQuery] = useState("")

  // Черновик названий правим локально, отправляем наверх по blur — иначе в
  // серверном режиме был бы запрос на каждый символ. Ключ в драфте есть только
  // пока группу редактируют; после commit убираем — и снова показываем title из props.
  const [titleDraft, setTitleDraft] = useState<Record<string, string>>({})

  function setTitle(key: string, value: string) {
    setTitleDraft((prev) => ({ ...prev, [key]: value }))
  }

  function commitTitle(group: EditorGroup) {
    const draft = titleDraft[group.key]
    if (draft !== undefined && draft.trim() && draft.trim() !== group.title) {
      onRenameGroup(group.key, draft.trim())
    }
    setTitleDraft((prev) => {
      const next = { ...prev }
      delete next[group.key]
      return next
    })
  }

  const normalizedQuery = query.trim().toLowerCase()
  const matches = unassigned.filter(
    (member) =>
      memberName(member).toLowerCase().includes(normalizedQuery) ||
      member.email.toLowerCase().includes(normalizedQuery)
  )

  function selectMember(groupKey: string, userId: number) {
    onAddMember(groupKey, userId)
    setQuery("")
  }

  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <button className={styles.addGroupButton} type="button" onClick={onAddGroup} disabled={disabled}>
          <AddIcon className={styles.addIcon} />
          Добавить группу
        </button>
        {onAutoFill && (
          <button
            className={styles.autoButton}
            type="button"
            onClick={onAutoFill}
            disabled={disabled || groups.length === 0}
            title={groups.length === 0 ? "Сначала добавьте хотя бы одну группу" : undefined}
          >
            Распределить автоматически
          </button>
        )}
      </div>

      {groups.length === 0 ? (
        <div className={styles.empty}>Пока нет ни одной группы. Добавьте группу, чтобы распределить студентов.</div>
      ) : (
        <div className={styles.groups}>
          {groups.map((group) => {
            const isFull = maxTeamSize != null && group.members.length >= maxTeamSize
            const isSearchOpen = searchKey === group.key && !group.locked && !isFull
            return (
              <div key={group.key} className={styles.group}>
                <div className={styles.groupHead}>
                  <input
                    className={styles.titleInput}
                    type="text"
                    value={titleDraft[group.key] ?? group.title}
                    onChange={(e) => setTitle(group.key, e.target.value)}
                    onBlur={() => commitTitle(group)}
                    placeholder="Название группы"
                    disabled={disabled || group.locked}
                  />
                  {maxTeamSize != null && (
                    <span className={`${styles.capacity} ${isFull ? styles.capacityFull : ""}`}>
                      {group.members.length} / {maxTeamSize}
                    </span>
                  )}
                  <button
                    className={styles.iconButton}
                    type="button"
                    aria-label="Удалить группу"
                    title={group.locked ? "У команды уже есть решение" : "Удалить группу"}
                    onClick={() => onDeleteGroup(group.key)}
                    disabled={disabled || group.locked}
                  >
                    <DeleteIcon className={styles.icon} />
                  </button>
                </div>

                {group.members.length > 0 ? (
                  <div className={styles.members}>
                    {group.members.map((member) => (
                      <span key={member.user_id} className={`${styles.chip} ${member.is_active === false ? styles.chipInactive : ""}`}>
                        {memberName(member)}
                        {member.is_active === false && <span className={styles.chipNote}>вышел</span>}
                        {!group.locked && (
                          <button
                            className={styles.chipRemove}
                            type="button"
                            aria-label="Убрать из группы"
                            onClick={() => onRemoveMember(group.key, member.user_id)}
                            disabled={disabled}
                          >
                            <CloseIcon aria-hidden="true" />
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className={styles.membersEmpty}>В группе пока никого нет</div>
                )}

                {group.locked ? (
                  <div className={styles.lockedNote}>У команды есть решение — состав закреплён</div>
                ) : isFull ? (
                  <div className={styles.lockedNote}>Команда заполнена (макс. {maxTeamSize})</div>
                ) : (
                  <div className={styles.search}>
                    <input
                      className={styles.searchInput}
                      type="text"
                      value={isSearchOpen ? query : ""}
                      onFocus={() => {
                        setSearchKey(group.key)
                        setQuery("")
                      }}
                      onBlur={() => {
                        // клик по элементу дропдауна гасит blur через onMouseDown,
                        // поэтому здесь закрываем список только при уходе фокуса наружу
                        setSearchKey(null)
                        setQuery("")
                      }}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Добавить студента — введите имя или email"
                      disabled={disabled}
                    />
                    {isSearchOpen && (
                      <div className={styles.dropdown}>
                        {matches.length === 0 ? (
                          <div className={styles.dropdownEmpty}>Нет нераспределённых студентов</div>
                        ) : (
                          matches.slice(0, 8).map((member) => (
                            <button
                              key={member.user_id}
                              type="button"
                              className={styles.dropdownItem}
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => selectMember(group.key, member.user_id)}
                            >
                              <span className={styles.dropdownName}>{memberName(member)}</span>
                              <span className={styles.dropdownEmail}>{member.email}</span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {unassigned.length > 0 && (
        <div className={styles.unassigned}>
          <div className={styles.unassignedLabel}>Нераспределённые студенты ({unassigned.length})</div>
          <div className={styles.unassignedList}>
            {unassigned.map((member) => (
              <span key={member.user_id} className={styles.unassignedChip}>{memberName(member)}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
