export type PasswordStrengthLevel = "easy" | "medium" | "hard"

export type PasswordStrength = {
  score: number
  level: PasswordStrengthLevel
  label: string
  hint: string
}

const PASSWORD_MIN_LENGTH = 8

export function getPasswordStrength(password: string): PasswordStrength {
  const passwordChars = Array.from(password)
  const passwordLength = passwordChars.length
  const uniqueChars = new Set(passwordChars).size
  const hasLower = /[a-zа-яё]/.test(password)
  const hasUpper = /[A-ZА-ЯЁ]/.test(password)
  const hasDigit = /\d/.test(password)
  const hasSpecial = /[^A-Za-zА-Яа-яЁё0-9]/.test(password)

  let score = 0
  if (passwordLength >= PASSWORD_MIN_LENGTH) score += 1
  if (passwordLength >= 12) score += 1
  if (passwordLength >= 16) score += 1

  score += Number(hasLower) + Number(hasUpper) + Number(hasDigit) + Number(hasSpecial)

  if (uniqueChars >= 6) score += 1

  if (score <= 3) {
    return {
      score,
      level: "easy",
      label: "легкий",
      hint: "Слишком слабый вариант. Добавьте длину и смешайте буквы в разных регистрах, цифры или спецсимволы."
    }
  }

  if (score <= 6) {
    return {
      score,
      level: "medium",
      label: "средний",
      hint: "Нормальный минимум. Чтобы усилить пароль, увеличьте длину или добавьте еще один тип символов."
    }
  }

  return {
    score,
    level: "hard",
    label: "сложный",
    hint: "Сильный пароль: хорошая длина и разнообразный набор символов."
  }
}
