import { useEffect, useState } from "react"
import { AnimatePresence } from "framer-motion"
import { useNavigate, useOutletContext, useParams } from "react-router-dom"
import ArrowIcon from "../../../assets/icons/classes/arrow.svg?react"
import DeleteIcon from "../../../assets/icons/classes/delete.svg?react"
import Modal from "../../../components/Modal/Modal"
import { useToast } from "../../../components/Toast/useToast"
import type { ClassLayoutContext } from "../../../layouts/ClassLayout/ClassLayout"
import { ApiError } from "../../../services/api"
import { formatDateTime, formatPoints, truncate } from "../../../services/helpers"
import { deleteAssignment, getAssignment, type AssignmentDto } from "../AssignmentsPage/services/assignments.api"
import {
  createQuestion,
  getQuestions,
  type QuestionListItem,
  type QuestionType
} from "./services/questions.api"
import {
  addQuestionToQuiz,
  deleteQuizQuestion,
  getQuizAttemptResult,
  getQuizQuestionsForTeacher,
  saveQuizAnswer,
  startQuizAttempt,
  submitQuizAttempt,
  type QuizAssignmentDetails,
  type QuizAttempt,
  type QuizAttemptResult
} from "./services/quizzes.api"
import styles from "./QuizAssignmentPage.module.css"

type QuestionFormState = {
  title: string
  question_text: string
  type: QuestionType
  default_points: string
  explanation: string
  status: "ready"
  options: Array<{ text: string; is_correct: boolean }>
  text_answers: Array<{ answer: string; is_case_sensitive: boolean }>
}

const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  single_choice: "Один вариант",
  multiple_choice: "Несколько вариантов",
  text_input: "Короткий ответ"
}

// Русский плюрал для слова «попытка».
function attemptsWord(count: number): string {
  const mod10 = count % 10
  const mod100 = count % 100
  if (mod10 === 1 && mod100 !== 11) return "попытка"
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "попытки"
  return "попыток"
}

function createEmptyQuestionForm(): QuestionFormState {
  return {
    title: "",
    question_text: "",
    type: "single_choice",
    default_points: "1",
    explanation: "",
    status: "ready",
    options: [
      { text: "", is_correct: true },
      { text: "", is_correct: false }
    ],
    text_answers: [{ answer: "", is_case_sensitive: false }]
  }
}

export default function QuizAssignmentPage() {
  const { classId, assignmentId } = useParams<{ classId: string; assignmentId: string }>()
  const parsedClassId = Number(classId)
  const parsedAssignmentId = Number(assignmentId)
  const { classDetail } = useOutletContext<ClassLayoutContext>()
  const navigate = useNavigate()
  const showToast = useToast()

  const canManage = classDetail?.permissions.can_create_assignment ?? false
  const canSubmit = classDetail?.permissions.can_submit_solution ?? false

  const [assignment, setAssignment] = useState<AssignmentDto | null>(null)
  const [quizDetails, setQuizDetails] = useState<QuizAssignmentDetails | null>(null)
  const [questionBank, setQuestionBank] = useState<QuestionListItem[]>([])
  const [attempt, setAttempt] = useState<QuizAttempt | null>(null)
  const [result, setResult] = useState<QuizAttemptResult | null>(null)
  const [answers, setAnswers] = useState<Record<number, { selected_option_ids?: number[]; text_answer?: string }>>({})
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [isBusy, setIsBusy] = useState(false)
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [questionForm, setQuestionForm] = useState<QuestionFormState>(createEmptyQuestionForm)

  const attemptsLimit = assignment?.quiz_settings?.attempts_limit ?? 1
  const attemptsUsed = assignment?.my_quiz_attempt?.attempts_used ?? 0
  const attemptsLeft = Math.max(attemptsLimit - attemptsUsed, 0)

  async function loadAssignment() {
    const data = await getAssignment(parsedClassId, parsedAssignmentId)
    setAssignment(data)
    if (data.type !== "quiz") {
      navigate(`/classes/${classId}/assignments/${assignmentId}`, { replace: true })
      return null
    }
    return data
  }

  async function loadTeacherData() {
    const [details, bank] = await Promise.all([
      getQuizQuestionsForTeacher(parsedAssignmentId),
      getQuestions(parsedClassId, { status: "ready", search })
    ])
    setQuizDetails(details)
    setQuestionBank(bank.items)
  }

  useEffect(() => {
    async function load() {
      if (!parsedClassId || !parsedAssignmentId) return
      setIsLoading(true)
      try {
        const data = await loadAssignment()
        if (!data) return
        if (canManage) {
          await loadTeacherData()
        }
        const latestAttempt = data.my_quiz_attempt
        if (latestAttempt?.status === "submitted") {
          // Просмотр результата не должен ломать страницу: ошибку показываем тостом,
          // но со страницы не выкидываем — иначе нельзя повторно зайти за результатами.
          try {
            const loadedResult = await getQuizAttemptResult(latestAttempt.attempt_id)
            setResult(loadedResult)
          } catch (resultError) {
            if (resultError instanceof ApiError) {
              showToast({ type: "error", message: resultError.message })
            } else {
              throw resultError
            }
          }
        }
      } catch (error) {
        if (error instanceof ApiError) {
          showToast({ type: "error", message: error.message })
          navigate(`/classes/${classId}/assignments`, { replace: true })
          return
        }
        throw error
      } finally {
        setIsLoading(false)
      }
    }

    void load()
  }, [parsedClassId, parsedAssignmentId, canManage])

  useEffect(() => {
    if (!addModalOpen || !canManage) return
    void (async () => {
      try {
        const bank = await getQuestions(parsedClassId, { status: "ready", search })
        setQuestionBank(bank.items)
      } catch (error) {
        if (error instanceof ApiError) {
          showToast({ type: "error", message: error.message })
          return
        }
        throw error
      }
    })()
  }, [addModalOpen, search, canManage, parsedClassId])

  async function refreshTeacherData() {
    if (!canManage) return
    const [updatedAssignment] = await Promise.all([
      getAssignment(parsedClassId, parsedAssignmentId),
      loadTeacherData(),
    ])
    setAssignment(updatedAssignment)
  }

  function resetQuestionForm() {
    setQuestionForm(createEmptyQuestionForm())
  }

  function updateOption(index: number, patch: Partial<{ text: string; is_correct: boolean }>) {
    setQuestionForm((prev) => ({
      ...prev,
      options: prev.options.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item))
    }))
  }

  function updateTextAnswer(index: number, patch: Partial<{ answer: string; is_case_sensitive: boolean }>) {
    setQuestionForm((prev) => ({
      ...prev,
      text_answers: prev.text_answers.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item))
    }))
  }

  async function onCreateQuestion() {
    setIsBusy(true)
    try {
      const created = await createQuestion(parsedClassId, {
        title: questionForm.title.trim(),
        question_text: questionForm.question_text.trim(),
        type: questionForm.type,
        default_points: Number(questionForm.default_points),
        explanation: questionForm.explanation.trim() || null,
        status: questionForm.status,
        options: questionForm.type === "text_input"
          ? []
          : questionForm.options.map((item, index) => ({
              text: item.text.trim(),
              is_correct: item.is_correct,
              position: index + 1
            })),
        text_answers: questionForm.type === "text_input"
          ? questionForm.text_answers.map((item) => ({
              answer: item.answer.trim(),
              is_case_sensitive: item.is_case_sensitive
            }))
          : []
      })
      showToast({ type: "neutral", message: "Вопрос создан" })
      setCreateModalOpen(false)
      resetQuestionForm()
      await refreshTeacherData()
      if (created.status === "ready") {
        await addQuestionToQuiz(parsedAssignmentId, {
          question_id: created.id,
          points: created.default_points,
          position: (quizDetails?.questions.length ?? 0) + 1
        })
        await refreshTeacherData()
      }
    } catch (error) {
      if (error instanceof ApiError) {
        showToast({ type: "error", message: error.message })
        return
      }
      throw error
    } finally {
      setIsBusy(false)
    }
  }

  async function onAddQuestion(question: QuestionListItem) {
    setIsBusy(true)
    try {
      await addQuestionToQuiz(parsedAssignmentId, {
        question_id: question.id,
        points: question.default_points,
        position: (quizDetails?.questions.length ?? 0) + 1
      })
      showToast({ type: "neutral", message: "Вопрос добавлен в тест" })
      setAddModalOpen(false)
      await refreshTeacherData()
    } catch (error) {
      if (error instanceof ApiError) {
        showToast({ type: "error", message: error.message })
        return
      }
      throw error
    } finally {
      setIsBusy(false)
    }
  }

  async function onDeleteQuizQuestion(quizQuestionId: number) {
    setIsBusy(true)
    try {
      await deleteQuizQuestion(parsedAssignmentId, quizQuestionId)
      showToast({ type: "neutral", message: "Вопрос удалён из теста" })
      await refreshTeacherData()
    } catch (error) {
      if (error instanceof ApiError) {
        showToast({ type: "error", message: error.message })
        return
      }
      throw error
    } finally {
      setIsBusy(false)
    }
  }

  async function onDeleteAssignment() {
    setIsBusy(true)
    try {
      await deleteAssignment(parsedClassId, parsedAssignmentId)
      showToast({ type: "neutral", message: "Тест удалён" })
      navigate(`/classes/${classId}/assignments`, { replace: true })
    } catch (error) {
      if (error instanceof ApiError) {
        showToast({ type: "error", message: error.message })
        setIsBusy(false)
        return
      }
      throw error
    }
  }

  async function onStartAttempt() {
    setIsBusy(true)
    try {
      const started = await startQuizAttempt(parsedAssignmentId)
      setAttempt(started)
      setResult(null)
      setCurrentQuestionIndex(0)
      setAnswers({})
    } catch (error) {
      if (error instanceof ApiError) {
        showToast({ type: "error", message: error.message })
        return
      }
      throw error
    } finally {
      setIsBusy(false)
    }
  }

  async function onSaveCurrentAnswer() {
    if (!attempt) return
    const current = attempt.questions[currentQuestionIndex]
    const payload = answers[current.question_id] ?? {}
    setIsBusy(true)
    try {
      await saveQuizAnswer(attempt.attempt_id, current.question_id, payload)
      showToast({ type: "neutral", message: "Ответ сохранён" })
    } catch (error) {
      if (error instanceof ApiError) {
        showToast({ type: "error", message: error.message })
        return
      }
      throw error
    } finally {
      setIsBusy(false)
    }
  }

  async function onSubmitAttempt() {
    if (!attempt) return
    setIsBusy(true)
    try {
      const submitted = await submitQuizAttempt(attempt.attempt_id)
      setResult(submitted)
      setAttempt(null)
      const refreshed = await getAssignment(parsedClassId, parsedAssignmentId)
      setAssignment(refreshed)
      showToast({ type: "neutral", message: "Тест завершён" })
    } catch (error) {
      if (error instanceof ApiError) {
        showToast({ type: "error", message: error.message })
        return
      }
      throw error
    } finally {
      setIsBusy(false)
    }
  }

  function renderQuestionForm() {
    const isText = questionForm.type === "text_input"
    const isSingle = questionForm.type === "single_choice"

    return (
      <div className={styles.formGrid}>
        <label className={styles.field}>
          <span>Внутреннее название</span>
          <input value={questionForm.title} onChange={(event) => setQuestionForm((prev) => ({ ...prev, title: event.target.value }))} />
        </label>
        <label className={styles.field}>
          <span>Баллы по умолчанию</span>
          <input
            type="number"
            min="1"
            value={questionForm.default_points}
            onChange={(event) => setQuestionForm((prev) => ({ ...prev, default_points: event.target.value }))}
          />
        </label>
        <label className={styles.field}>
          <span>Тип вопроса</span>
          <select value={questionForm.type} onChange={(event) => setQuestionForm((prev) => ({ ...prev, type: event.target.value as QuestionType }))}>
            <option value="single_choice">Один вариант</option>
            <option value="multiple_choice">Несколько вариантов</option>
            <option value="text_input">Короткий ответ</option>
          </select>
        </label>
        <label className={`${styles.field} ${styles.full}`}>
          <span>Текст вопроса</span>
          <textarea value={questionForm.question_text} onChange={(event) => setQuestionForm((prev) => ({ ...prev, question_text: event.target.value }))} />
        </label>
        <label className={`${styles.field} ${styles.full}`}>
          <span>Пояснение</span>
          <textarea value={questionForm.explanation} onChange={(event) => setQuestionForm((prev) => ({ ...prev, explanation: event.target.value }))} />
        </label>

        {!isText && (
          <div className={`${styles.field} ${styles.full}`}>
            <span>Варианты ответа</span>
            <div className={styles.stack}>
              {questionForm.options.map((option, index) => (
                <div key={`option-${index}`} className={styles.optionRow}>
                  <input
                    type={isSingle ? "radio" : "checkbox"}
                    checked={option.is_correct}
                    onChange={() => {
                      if (isSingle) {
                        setQuestionForm((prev) => ({
                          ...prev,
                          options: prev.options.map((item, itemIndex) => ({ ...item, is_correct: itemIndex === index }))
                        }))
                        return
                      }
                      updateOption(index, { is_correct: !option.is_correct })
                    }}
                  />
                  <input
                    value={option.text}
                    onChange={(event) => updateOption(index, { text: event.target.value })}
                    placeholder={`Вариант ${index + 1}`}
                  />
                </div>
              ))}
            </div>
            <button className={styles.secondaryButton} type="button" onClick={() => setQuestionForm((prev) => ({ ...prev, options: [...prev.options, { text: "", is_correct: false }] }))}>
              Добавить вариант
            </button>
          </div>
        )}

        {isText && (
          <div className={`${styles.field} ${styles.full}`}>
            <span>Допустимые ответы</span>
            <div className={styles.stack}>
              {questionForm.text_answers.map((item, index) => (
                <div key={`answer-${index}`} className={styles.answerRow}>
                  <input
                    value={item.answer}
                    onChange={(event) => updateTextAnswer(index, { answer: event.target.value })}
                    placeholder={`Ответ ${index + 1}`}
                  />
                  <label className={styles.checkboxInline}>
                    <input
                      type="checkbox"
                      checked={item.is_case_sensitive}
                      onChange={() => updateTextAnswer(index, { is_case_sensitive: !item.is_case_sensitive })}
                    />
                    Учитывать регистр
                  </label>
                </div>
              ))}
            </div>
            <button className={styles.secondaryButton} type="button" onClick={() => setQuestionForm((prev) => ({ ...prev, text_answers: [...prev.text_answers, { answer: "", is_case_sensitive: false }] }))}>
              Добавить ответ
            </button>
          </div>
        )}
      </div>
    )
  }

  function renderAttempt() {
    if (!attempt) return null
    const total = attempt.questions.length
    const current = attempt.questions[currentQuestionIndex]
    const currentAnswer = answers[current.question_id] ?? {}
    const progress = total > 0 ? ((currentQuestionIndex + 1) / total) * 100 : 0
    const isLast = currentQuestionIndex >= total - 1

    return (
      <section className={styles.quizCard}>
        <div className={styles.quizHead}>
          <div className={styles.quizHeadText}>
            <div className={styles.eyebrow}>Вопрос {currentQuestionIndex + 1} из {total}</div>
            <div className={styles.progressTrack}>
              <div className={styles.progressFill} style={{ width: `${progress}%` }} />
            </div>
          </div>
          <span className={styles.pointsBadge}>Баллов: {formatPoints(current.points)}</span>
        </div>

        <div className={styles.questionText}>{current.question_text}</div>

        {current.type !== "text_input" && (
          <div className={styles.stack}>
            {current.options.map((option) => {
              const selected = currentAnswer.selected_option_ids ?? []
              const isChecked = selected.includes(option.id)
              return (
                <label key={option.id} className={`${styles.optionCard} ${isChecked ? styles.optionCardActive : ""}`}>
                  <input
                    type={current.type === "single_choice" ? "radio" : "checkbox"}
                    checked={isChecked}
                    onChange={() => {
                      if (current.type === "single_choice") {
                        setAnswers((prev) => ({
                          ...prev,
                          [current.question_id]: { selected_option_ids: [option.id] }
                        }))
                        return
                      }
                      setAnswers((prev) => {
                        const previous = prev[current.question_id]?.selected_option_ids ?? []
                        return {
                          ...prev,
                          [current.question_id]: {
                            selected_option_ids: isChecked
                              ? previous.filter((item) => item !== option.id)
                              : [...previous, option.id]
                          }
                        }
                      })
                    }}
                  />
                  <span>{option.text}</span>
                </label>
              )
            })}
          </div>
        )}

        {current.type === "text_input" && (
          <textarea
            className={styles.answerInput}
            value={currentAnswer.text_answer ?? ""}
            onChange={(event) =>
              setAnswers((prev) => ({
                ...prev,
                [current.question_id]: { text_answer: event.target.value }
              }))
            }
            placeholder="Введите короткий ответ"
          />
        )}

        <div className={styles.attemptActions}>
          <div className={styles.attemptNav}>
            <button className={styles.secondaryButton} type="button" disabled={currentQuestionIndex === 0 || isBusy} onClick={() => setCurrentQuestionIndex((prev) => prev - 1)}>
              Назад
            </button>
            <button className={styles.secondaryButton} type="button" disabled={isLast || isBusy} onClick={() => setCurrentQuestionIndex((prev) => prev + 1)}>
              Следующий
            </button>
          </div>
          <div className={styles.attemptNav}>
            <button className={styles.secondaryButton} type="button" disabled={isBusy} onClick={() => void onSaveCurrentAnswer()}>
              Сохранить ответ
            </button>
            <button className={styles.primaryButton} type="button" disabled={isBusy} onClick={() => setSubmitConfirmOpen(true)}>
              Завершить тест
            </button>
          </div>
        </div>
      </section>
    )
  }

  if (isLoading || !assignment) {
    return <div className={styles.page}>Загрузка...</div>
  }

  const showStartPanel = canSubmit && !attempt && !result
  const inProgress = assignment.my_quiz_attempt?.status === "in_progress"

  return (
    <div className={styles.page}>
      <div className={styles.pageHead}>
        <button className={styles.backButton} type="button" onClick={() => navigate(`/classes/${classId}/assignments`)}>
          <ArrowIcon className={styles.backIcon} />
          Все задания
        </button>

        {canManage && (
          <button className={styles.dangerButton} type="button" disabled={isBusy} onClick={() => setDeleteModalOpen(true)}>
            <DeleteIcon className={styles.buttonIcon} />
            Удалить
          </button>
        )}
      </div>

      <section className={styles.hero}>
        <div className={styles.heroText}>
          <div className={styles.eyebrow}>Тест</div>
          <h1>{assignment.title}</h1>
          {assignment.description && <p>{assignment.description}</p>}
        </div>
        <div className={styles.metaGrid}>
          <div className={styles.metaCard}>
            <span>Дедлайн</span>
            <strong>{assignment.due_at ? formatDateTime(assignment.due_at) : "Без срока"}</strong>
          </div>
          <div className={styles.metaCard}>
            <span>Макс. балл</span>
            <strong>{formatPoints(assignment.max_grade)}</strong>
          </div>
          <div className={styles.metaCard}>
            <span>Вопросов</span>
            <strong>{assignment.quiz_question_count ?? 0}</strong>
          </div>
          <div className={styles.metaCard}>
            <span>Попыток</span>
            <strong>{attemptsLimit}</strong>
          </div>
        </div>
      </section>

      {canManage && (
        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <div className={styles.panelHeadText}>
              <h2>Вопросы теста</h2>
              <p>Готовые вопросы можно переиспользовать из банка этого курса.</p>
            </div>
            <div className={styles.panelActions}>
              <button className={styles.secondaryButton} type="button" onClick={() => setAddModalOpen(true)}>
                Добавить из банка
              </button>
              <button className={styles.primaryButton} type="button" onClick={() => setCreateModalOpen(true)}>
                Создать вопрос
              </button>
            </div>
          </div>

          <div className={styles.stack}>
            {quizDetails?.questions.length ? quizDetails.questions.map((question, index) => (
              <article key={question.id} className={styles.questionCard}>
                <div className={styles.questionCardHead}>
                  <div className={styles.questionCardInfo}>
                    <div className={styles.questionMeta}>
                      <span className={styles.numberBadge}>№{index + 1}</span>
                      <span className={styles.metaBadge}>{QUESTION_TYPE_LABELS[question.type]}</span>
                      <span className={styles.metaBadge}>Баллов: {formatPoints(question.points)}</span>
                    </div>
                    <h3>{question.title}</h3>
                  </div>
                  <button className={styles.iconDangerButton} type="button" disabled={isBusy} aria-label="Удалить вопрос" onClick={() => void onDeleteQuizQuestion(question.id)}>
                    <DeleteIcon className={styles.buttonIcon} />
                  </button>
                </div>
                <p>{truncate(question.question_text, 200)}</p>
              </article>
            )) : <div className={styles.emptyState}>В тест ещё не добавлены вопросы.</div>}
          </div>
        </section>
      )}

      {showStartPanel && (
        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <div className={styles.panelHeadText}>
              <h2>Прохождение теста</h2>
              <p>
                Система проверит ответы автоматически после завершения попытки.
                {!inProgress && attemptsLimit > 1 && ` Доступно ${attemptsLeft} ${attemptsWord(attemptsLeft)} из ${attemptsLimit}.`}
              </p>
            </div>
            <button
              className={styles.primaryButton}
              type="button"
              disabled={isBusy || (!inProgress && attemptsLeft <= 0)}
              onClick={() => void onStartAttempt()}
            >
              {inProgress ? "Продолжить тест" : "Начать тест"}
            </button>
          </div>
        </section>
      )}

      {attempt && renderAttempt()}

      {result && (
        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <div className={styles.panelHeadText}>
              <div className={styles.eyebrow}>Результат</div>
              <h2>Тест пройден</h2>
              <p>Попытка завершена {result.submitted_at ? formatDateTime(result.submitted_at) : ""}</p>
            </div>
            {result.score != null && result.max_score != null && (
              <div className={styles.scoreCard}>
                <span>Баллов</span>
                <strong>{formatPoints(result.score)} / {formatPoints(result.max_score)}</strong>
              </div>
            )}
          </div>

          <div className={styles.stack}>
            {result.answers.map((answer, index) => {
              const status = answer.is_correct == null ? "neutral" : answer.is_correct ? "correct" : "wrong"
              return (
                <div key={answer.question_id} className={`${styles.resultRow} ${styles[`result_${status}`]}`}>
                  <div className={styles.resultRowHead}>
                    <span className={styles.numberBadge}>Вопрос {index + 1}</span>
                    <span className={styles.resultScore}>Баллов: {formatPoints(answer.score)}</span>
                  </div>
                  {answer.text_answer && (
                    <div className={styles.resultAnswer}>Ваш ответ: {answer.text_answer}</div>
                  )}
                  {answer.correct_text_answers && answer.correct_text_answers.length > 0 && (
                    <div className={styles.resultCorrect}>Верные ответы: {answer.correct_text_answers.join(", ")}</div>
                  )}
                  {answer.explanation && <p>{answer.explanation}</p>}
                </div>
              )
            })}
          </div>

          {canSubmit && (
            <div className={styles.resultFooter}>
              {attemptsLeft > 0 ? (
                <>
                  <span className={styles.resultHint}>Осталось {attemptsLeft} {attemptsWord(attemptsLeft)} из {attemptsLimit}. Новая попытка перезапишет баллы за тест.</span>
                  <button className={styles.primaryButton} type="button" disabled={isBusy} onClick={() => void onStartAttempt()}>
                    Пройти заново
                  </button>
                </>
              ) : (
                <span className={styles.resultHint}>Попытки исчерпаны ({attemptsLimit} из {attemptsLimit}).</span>
              )}
            </div>
          )}
        </section>
      )}

      <AnimatePresence>
        {submitConfirmOpen && attempt && (
          <Modal title="Завершить тест" onClose={() => !isBusy && setSubmitConfirmOpen(false)} disabled={isBusy}>
            <div className={styles.confirmText}>Вы уверены, что хотите завершить попытку?</div>
            <div className={styles.confirmHint}>После отправки ответы будут проверены, а незавершённые изменения уже нельзя будет продолжить в этой попытке.</div>
            <div className={styles.modalActions}>
              <button className={styles.secondaryButton} type="button" disabled={isBusy} onClick={() => setSubmitConfirmOpen(false)}>
                Отмена
              </button>
              <button
                className={styles.primaryButton}
                type="button"
                disabled={isBusy}
                onClick={() => void (async () => {
                  await onSubmitAttempt()
                  setSubmitConfirmOpen(false)
                })()}
              >
                {isBusy ? "Завершаем..." : "Завершить тест"}
              </button>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {deleteModalOpen && canManage && (
          <Modal title="Удалить тест" onClose={() => !isBusy && setDeleteModalOpen(false)} disabled={isBusy}>
            <div className={styles.confirmText}>Вы точно хотите удалить этот тест? Это действие нельзя отменить.</div>
            <div className={styles.modalActions}>
              <button className={styles.secondaryButton} type="button" disabled={isBusy} onClick={() => setDeleteModalOpen(false)}>
                Отмена
              </button>
              <button className={styles.dangerButton} type="button" disabled={isBusy} onClick={() => void onDeleteAssignment()}>
                {isBusy ? "Удаляем..." : "Удалить"}
              </button>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {addModalOpen && (
          <Modal title="Добавить вопрос из банка" onClose={() => setAddModalOpen(false)} size="lg">
            <label className={styles.field}>
              <span>Поиск</span>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Найти вопрос" />
            </label>
            <div className={styles.stack}>
              {questionBank.length ? questionBank.map((question) => (
                <article key={question.id} className={styles.questionCard}>
                  <div className={styles.questionCardHead}>
                    <div className={styles.questionCardInfo}>
                      <div className={styles.questionMeta}>
                        <span className={styles.metaBadge}>{QUESTION_TYPE_LABELS[question.type]}</span>
                        <span className={styles.metaBadge}>Баллов: {formatPoints(question.default_points)}</span>
                      </div>
                      <h3>{question.title}</h3>
                    </div>
                    <button className={styles.primaryButton} type="button" disabled={isBusy} onClick={() => void onAddQuestion(question)}>
                      Добавить
                    </button>
                  </div>
                  <p>{truncate(question.question_text, 180)}</p>
                </article>
              )) : <div className={styles.emptyState}>Подходящих вопросов не найдено.</div>}
            </div>
          </Modal>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {createModalOpen && (
          <Modal title="Создать вопрос" onClose={() => setCreateModalOpen(false)} size="lg">
            {renderQuestionForm()}
            <div className={styles.modalActions}>
              <button className={styles.secondaryButton} type="button" onClick={() => setCreateModalOpen(false)}>
                Отмена
              </button>
              <button className={styles.primaryButton} type="button" disabled={isBusy} onClick={() => void onCreateQuestion()}>
                Создать вопрос
              </button>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  )
}
