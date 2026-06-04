import { createContext, useContext } from "react"

export type ToastType = "neutral" | "success" | "error"

export type Toast = {
  message: string
  type?: ToastType
  duration?: number
}

export type ShowToast = (toast: Toast) => void

export const ToastContext = createContext<ShowToast | null>(null)

export function useToast() {
  const showToast = useContext(ToastContext)

  if (!showToast) {
    throw new Error("useToast должен использоваться внутри ToastProvider")
  }

  return showToast
}
