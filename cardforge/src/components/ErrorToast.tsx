import type { NormalizedToast, ToastType } from '../lib/toastBus'

interface ErrorToastProps {
  toast: NormalizedToast
  onDismiss: (id: string) => void
}

const TYPE_STYLES: Record<ToastType, string> = {
  error: 'border-red-400/60 bg-red-500/20 text-red-100',
  warning: 'border-amber-400/60 bg-amber-500/20 text-amber-50',
  info: 'border-sky-400/60 bg-sky-500/20 text-sky-50',
}

const ErrorToast = ({ toast, onDismiss }: ErrorToastProps) => {
  const style = TYPE_STYLES[toast.type]

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={`pointer-events-auto rounded-xl border px-4 py-3 shadow-lg backdrop-blur ${style}`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 text-sm">{toast.message}</div>
        <button
          type="button"
          onClick={() => onDismiss(toast.id)}
          className="text-xs uppercase tracking-wide text-current transition hover:opacity-80"
          aria-label="Cerrar notificación"
        >
          Cerrar
        </button>
      </div>
    </div>
  )
}

export default ErrorToast
