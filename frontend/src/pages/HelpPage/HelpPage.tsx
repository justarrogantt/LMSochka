import styles from "./HelpPage.module.css"

// Заглушка раздела «Помощь». Наполнение добавим позже.
export default function HelpPage() {
  return (
    <div className={styles.page}>
      <div className={styles.titleBlock}>
        <div className={styles.title}>Помощь</div>
        <div className={styles.text}>Здесь появятся ответы на частые вопросы и инструкции по работе с платформой.</div>
      </div>

      <div className={styles.placeholder}>
        <div className={styles.placeholderTitle}>Раздел в разработке</div>
        <div className={styles.placeholderText}>Скоро тут будет справка и поддержка.</div>
      </div>
    </div>
  )
}
