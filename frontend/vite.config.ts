import { defineConfig, loadEnv } from "vite"
import react from "@vitejs/plugin-react"
import svgr from "vite-plugin-svgr"

// Конфиг в виде функции дает доступ к текущему mode (development/production).
// Через loadEnv подгружаем переменные окружения для динамической настройки прокси.
export default defineConfig(({ mode }) => {
  // Третий параметр "" означает: загрузить все переменные,
  // а не только те, что начинаются с VITE_.
  const env = loadEnv(mode, process.cwd(), "")

  return {
    // react(): React Fast Refresh + JSX-трансформация
    // svgr(): позволяет импортировать SVG как React-компоненты
    plugins: [react(), svgr()],
    server: {
      proxy: {
        // Пример: если VITE_API_PREFIX=/api и VITE_API_URL=http://localhost:8000,
        // то запросы /api/* с фронта будут проксироваться на backend.
        [env.VITE_API_PREFIX]: {
          target: env.VITE_API_URL,
          changeOrigin: true,
          secure: false
        }
      }
    }
  }
})
