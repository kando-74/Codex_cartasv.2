import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  errorMessage?: string
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, errorMessage: error.message }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Error capturado por ErrorBoundary', error, errorInfo)
  }

  handleReload = () => {
    window.location.reload()
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-900 p-6 text-center text-red-200">
          <h1 className="text-2xl font-semibold">Algo no funcionó como esperábamos</h1>
          <p className="max-w-lg text-sm text-red-100">
            {this.state.errorMessage ?? 'Se produjo un error inesperado. Intenta recargar la página.'}
          </p>
          <button type="button" onClick={this.handleReload} className="bg-red-600 px-4 py-2 text-sm">
            Recargar
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
