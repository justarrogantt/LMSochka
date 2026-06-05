import { useEffect, useState } from "react"
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

  // Черновик названий: правим локально, отправляем наверх по blur — иначе в
  // серверном режиме был бы запрос на каждый символ.
  const [titleDraft, setTitleDraft] = useState<Record<string, string>>({})
  useEffect(() => {
    setTitleDraft((prev) => {
      const next: Record<string, string> = {}
      for (const group of groups) {
        next[group.key] = group.key in prev ? prev[group.key] : group.title
      }
      return next
    })
  }, [groups])

  function commitTitle(group: EditorGroup) {
    const value = (titleDraft[group.key] ?? group.title).trim()
    if (value && value !== group.title) {
      onRenameGroup(group.key, value)
    }
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
          <button className={styles.autoButton} type="button" onClick={onAutoFill} disabled={disabled}>
            Распределить автоматически
          </button>
        )}
      </div>

      {groups.length === 0 ? (
        <div className={styles.empty}>Пока нет ни одной группы. Добавьте группу, чтобы распределить студентов.</div>
      ) : (
        <div className={styles.groups}>
          {groups.map((group) => {
            const isSearchOpen = searchKey === group.key && !group.locked
            return (
              <div key={group.key} className={styles.group}>
                <div className={styles.groupHead}>
                  <input
                    className={styles.titleInput}
                    type="text"
                    value={titleDraft[group.key] ?? group.title}
                    onChange={(e) => setTitleDraft((prev) => ({ ...prev, [group.key]: e.target.value }))}
                    onBlur={() => commitTitle(group)}
                    placeholder="Название группы"
                    disabled={disabled || group.locked}
                  />
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
