export type ToastType = 'error' | 'warning' | 'info'
export type ToastVariant = 'toast' | 'banner'

export interface ToastOptions {
  durationMs?: number
  variant?: ToastVariant
}

export interface ToastPayload extends ToastOptions {
  id?: string
  message: string
  type?: ToastType
}

export interface NormalizedToast extends Required<Omit<ToastPayload, 'durationMs'>> {
  durationMs?: number
}

const DEFAULT_TOAST_DURATION = 6000

const listeners = new Set<(toast: NormalizedToast) => void>()
const pending: NormalizedToast[] = []

const createId = () => `toast-${Math.random().toString(36).slice(2)}-${Date.now()}`

export const normalizeToast = (payload: ToastPayload): NormalizedToast => ({
  id: payload.id ?? createId(),
  message: payload.message,
  type: payload.type ?? 'error',
  variant: payload.variant ?? 'toast',
  durationMs:
    (payload.variant ?? 'toast') === 'toast'
      ? payload.durationMs ?? DEFAULT_TOAST_DURATION
      : payload.durationMs,
})

export const pushToast = (payload: ToastPayload): string => {
  const toast = normalizeToast(payload)
  if (listeners.size === 0) {
    pending.push(toast)
  } else {
    listeners.forEach((listener) => listener(toast))
  }
  return toast.id
}

export const subscribeToToasts = (listener: (toast: NormalizedToast) => void) => {
  if (pending.length) {
    const buffered = pending.splice(0, pending.length)
    buffered.forEach((toast) => listener(toast))
  }
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
