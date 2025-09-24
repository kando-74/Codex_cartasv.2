import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react'
import {
  type NormalizedToast,
  type ToastOptions,
  type ToastType,
  pushToast,
  subscribeToToasts,
} from '../lib/toastBus'
import ErrorToast from './ErrorToast'
import NotificationBanner from './NotificationBanner'

interface ErrorToastContextValue {
  showError: (message: string, options?: ToastOptions) => string
  showWarning: (message: string, options?: ToastOptions) => string
  showInfo: (message: string, options?: ToastOptions) => string
}

const ErrorToastContext = createContext<ErrorToastContextValue | undefined>(undefined)

const ErrorToastProvider = ({ children }: PropsWithChildren) => {
  const [toasts, setToasts] = useState<NormalizedToast[]>([])
  const [banners, setBanners] = useState<NormalizedToast[]>([])
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const removeToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const removeBanner = useCallback((id: string) => {
    setBanners((current) => current.filter((banner) => banner.id !== id))
  }, [])

  useEffect(() => {
    return subscribeToToasts((toast) => {
      if (toast.variant === 'banner') {
        setBanners((current) => {
          if (current.some((item) => item.message === toast.message && item.type === toast.type)) {
            return current
          }
          return [...current, toast]
        })
        return
      }

      setToasts((current) => [...current, toast])
      if (toast.durationMs && toast.durationMs > 0) {
        const timeout = setTimeout(() => removeToast(toast.id), toast.durationMs)
        timers.current.set(toast.id, timeout)
      }
    })
  }, [removeToast])

  useEffect(() => {
    const timersMap = timers.current
    return () => {
      timersMap.forEach((timer) => clearTimeout(timer))
      timersMap.clear()
    }
  }, [])

  const notify = useCallback((message: string, type: ToastType, options?: ToastOptions) => {
    return pushToast({ message, type, ...options })
  }, [])

  const value = useMemo<ErrorToastContextValue>(
    () => ({
      showError: (message, options) => notify(message, 'error', options),
      showWarning: (message, options) => notify(message, 'warning', options),
      showInfo: (message, options) => notify(message, 'info', options),
    }),
    [notify],
  )

  return (
    <ErrorToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-40 flex flex-col items-center gap-2 p-4">
        {banners.map((banner) => (
          <NotificationBanner key={banner.id} banner={banner} onDismiss={removeBanner} />
        ))}
      </div>
      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2">
        {toasts.map((toast) => (
          <ErrorToast key={toast.id} toast={toast} onDismiss={removeToast} />
        ))}
      </div>
    </ErrorToastContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useErrorToasts = (): ErrorToastContextValue => {
  const context = useContext(ErrorToastContext)
  if (!context) {
    throw new Error('useErrorToasts debe usarse dentro de ErrorToastProvider')
  }
  return context
}

export default ErrorToastProvider
