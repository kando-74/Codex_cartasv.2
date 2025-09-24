import type { NormalizedToast, ToastType } from '../lib/toastBus'

interface NotificationBannerProps {
  banner: NormalizedToast
  onDismiss: (id: string) => void
}

const TYPE_STYLES: Record<ToastType, string> = {
  error: 'border-red-500/40 bg-red-500/20 text-red-100',
  warning: 'border-amber-500/40 bg-amber-500/20 text-amber-50',
  info: 'border-sky-500/40 bg-sky-500/20 text-sky-50',
}

const NotificationBanner = ({ banner, onDismiss }: NotificationBannerProps) => {
  const style = TYPE_STYLES[banner.type]

  return (
    <div
      role="alert"
      aria-live="polite"
      className={`pointer-events-auto flex w-full max-w-3xl items-start gap-3 rounded-xl border px-4 py-3 shadow-lg backdrop-blur ${style}`}
    >
      <div className="flex-1 text-sm">{banner.message}</div>
      <button
        type="button"
        onClick={() => onDismiss(banner.id)}
        className="text-xs uppercase tracking-wide text-current transition hover:opacity-80"
        aria-label="Cerrar aviso"
      >
        Cerrar
      </button>
    </div>
  )
}

export default NotificationBanner
