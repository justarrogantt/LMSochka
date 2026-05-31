import { createContext, useContext, useEffect, useState, type ReactNode } from "react"

type Theme = "light" | "dark"

type ThemeContextValue = {
  theme: Theme
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

// Выбирает стартовую тему: сохранённую пользователем, тему браузера или светлую по умолчанию.
function getInitialTheme(): Theme {
  const savedTheme = localStorage.getItem("theme")

  if (savedTheme === "dark" || savedTheme === "light") {
    return savedTheme
  }

  if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) {
    return "dark"
  }

  return "light"
}

// Применяет тему к корневому элементу через data-атрибут.
function applyThemeToRoot(theme: Theme) {
  if (theme === "dark") {
    document.documentElement.dataset.theme = "dark"
  } else {
    delete document.documentElement.dataset.theme
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Текущая цветовая тема интерфейса: light или dark.
  const [theme, setTheme] = useState<Theme>(getInitialTheme)

  // Применяет уже выбранную тему при первом рендере приложения.
  useEffect(() => {
    applyThemeToRoot(theme)
  }, [])

  // Переключает тему, сразу применяет её к root и сохраняет выбор пользователя.
  function toggleTheme() {
    setTheme((prev) => {
      const nextTheme: Theme = prev === "dark" ? "light" : "dark"
      applyThemeToRoot(nextTheme)
      localStorage.setItem("theme", nextTheme)
      return nextTheme
    })
  }

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)

  if (!context) {
    throw new Error("useTheme должен использоваться внутри ThemeProvider")
  }

  return context
}
