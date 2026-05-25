import { motion } from "framer-motion"
import styles from "./TopLoader.module.css"

export default function TopLoader() {
  return (
    <motion.div
      className={styles.loaderWrapper}
      initial={{ x: "-50%", y: -64, opacity: 0, scale: 0.96 }}
      animate={{ x: "-50%", y: 0, opacity: 1, scale: 1 }}
      exit={{ x: "-50%", y: -64, opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
    >
      <svg className={styles.spinner} viewBox="0 0 50 50" aria-hidden="true">
        <circle className={styles.spinnerCircle} cx="25" cy="25" r="20" fill="none" />
      </svg>
    </motion.div>
  )
}
