import { motion } from "framer-motion"
import { NavLink } from "react-router-dom"
import ChevronRightIcon from "../../assets/icons/pagination/chevron-right.svg?react"
import { useAuth } from "../../contexts/AuthContext"
import { formatUserName } from "../../services/helpers"
import { DURATION, EASE_OUT, listContainer, listItem } from "../../shared/motion"
import styles from "./HomePage.module.css"

// Приветствие в зависимости от времени суток
function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 6) return "Доброй ночи"
  if (hour < 12) return "Доброе утро"
  if (hour < 18) return "Добрый день"
  return "Добрый вечер"
}

type Step = {
  path: string
  title: string
  text: string
}

// Шаги онбординга — с чего начать в платформе
const steps: Step[] = [
  {
    path: "/classes/public",
    title: "Вступите в курс или создайте свой",
    text: "Найдите курс в каталоге, вступите по коду приглашения или создайте собственный."
  },
  {
    path: "/classes",
    title: "Откройте курсы, задания и объявления",
    text: "Все ваши курсы собраны в одном месте — задания, материалы и важные новости."
  },
  {
    path: "/grades",
    title: "Следите за оценками",
    text: "Сводка успеваемости по всем курсам, где вы учитесь и преподаёте."
  }
]

type Feature = {
  title: string
  text: string
}

// Возможности платформы — короткое описание без лишней воды
const features: Feature[] = [
  {
    title: "Курсы и роли",
    text: "Открытые и закрытые курсы, приглашение по коду, роли участников внутри каждого курса."
  },
  {
    title: "Объявления",
    text: "Публикуйте новости курса — их увидят все участники."
  },
  {
    title: "Задания и решения",
    text: "Выдавайте задания с дедлайнами и принимайте решения студентов."
  },
  {
    title: "Оценки",
    text: "Проверяйте работы, выставляйте баллы и следите за прогрессом."
  }
]

export default function HomePage() {
  // Текущий пользователь (гарантированно есть внутри защищённых маршрутов)
  const { user } = useAuth()
  const userName = user ? formatUserName(user) : ""
  // Для приветствия берём имя — оно теплее, чем полное ФИО или email
  const greetingName = user?.first_name?.trim() || userName || "друг"

  return (
    <div className={styles.page}>
      <motion.div
        className={styles.hero}
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: DURATION.card, ease: EASE_OUT }}
      >
        <div className={styles.heroText}>
          <div className={styles.greeting}>{getGreeting()}, {greetingName}</div>
          <div className={styles.subtitle}>
            Это ваша учебная платформа: курсы, задания, объявления и оценки — всё в одном месте.
          </div>
        </div>
      </motion.div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>С чего начать</div>

        <motion.div className={styles.steps} variants={listContainer} initial="hidden" animate="visible">
          {steps.map((step, index) => (
            <motion.div key={step.path} variants={listItem}>
              <NavLink className={styles.step} to={step.path}>
                <div className={styles.stepNumber}>{index + 1}</div>

                <div className={styles.stepBody}>
                  <div className={styles.stepTitle}>{step.title}</div>
                  <div className={styles.stepText}>{step.text}</div>
                </div>

                <ChevronRightIcon className={styles.stepArrow} />
              </NavLink>
            </motion.div>
          ))}
        </motion.div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Что умеет платформа</div>

        <motion.div className={styles.features} variants={listContainer} initial="hidden" animate="visible">
          {features.map((feature) => (
            <motion.div key={feature.title} className={styles.feature} variants={listItem}>
              <div className={styles.featureTitle}>{feature.title}</div>
              <div className={styles.featureText}>{feature.text}</div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </div>
  )
}
