import styles from "./Loading.module.css"

export default function Loading() {
  return (
    <div className={styles.loadingBlock}>
      <div className={styles.spinner}></div>
    </div>
  )
}
