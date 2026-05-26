import styles from "./BottomLoader.module.css"

export default function BottomLoader() {
  return (
    <div className={styles.loaderArea}>
      <div className={styles.loaderShell}>
        <svg className={styles.spinner} viewBox="0 0 50 50" aria-hidden="true">
          <circle className={styles.spinnerCircle} cx="25" cy="25" r="20" fill="none" />
        </svg>
      </div>
    </div>
  )
}
