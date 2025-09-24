import type { HTMLAttributes } from 'react'

export interface LoaderProps extends HTMLAttributes<HTMLDivElement> {
  message?: string
}

const Loader = ({ message, className, ...props }: LoaderProps) => {
  const classes = ['flex flex-col items-center gap-3 text-slate-200']
  if (className) {
    classes.push(className)
  }

  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className={classes.join(' ')}
      {...props}
    >
      <span className="inline-flex h-10 w-10 animate-spin rounded-full border-4 border-slate-700 border-t-primary" />
      {message ? <span className="text-sm text-slate-300">{message}</span> : null}
    </div>
  )
}

export default Loader
