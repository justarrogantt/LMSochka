import { useEffect, useRef, useState } from "react"

// Переиспользуемый хук для отложенного показа лоадера.
// Зачем:
// - очень быстрые запросы не должны мигать спиннером (лучше UX),
// - долгие запросы должны показывать пользователю, что идет процесс.
//
// Возвращает tuple [isLoading, onLoadingChange]:
// - isLoading: текущее состояние видимости лоадера,
// - onLoadingChange(true/false): вызываем при старте/завершении async-операции.
export function useDelayedLoading(
  delay: number,
  initialIsLoading: boolean
): [boolean, (nextIsLoading: boolean) => void] {
  const [isLoading, setIsLoading] = useState(initialIsLoading)
  // Храним id таймера между рендерами, чтобы корректно его отменять.
  const loadingTimeoutRef = useRef<number | null>(null)

  function onLoadingChange(nextIsLoading: boolean) {
    // Перед новой операцией всегда очищаем предыдущий таймер.
    // Это защищает от устаревших срабатываний и мерцания лоадера.
    if (loadingTimeoutRef.current !== null) {
      window.clearTimeout(loadingTimeoutRef.current)
      loadingTimeoutRef.current = null
    }

    if (nextIsLoading) {
      // delay <= 0 означает "показываем сразу".
      if (delay <= 0) {
        setIsLoading(true)
        return
      }

      // Показываем лоадер только если операция все еще идет после задержки.
      loadingTimeoutRef.current = window.setTimeout(() => {
        setIsLoading(true)
        loadingTimeoutRef.current = null
      }, delay)
      return
    }

    // Операция завершилась: скрываем лоадер сразу.
    setIsLoading(false)
  }

  useEffect(() => {
    return () => {
      // Очистка при размонтировании: не оставляем висящий таймер.
      if (loadingTimeoutRef.current !== null) {
        window.clearTimeout(loadingTimeoutRef.current)
      }
    }
  }, [])

  return [isLoading, onLoadingChange]
}
