import { useEffect, useState } from 'react'
import { Route, Routes } from 'react-router-dom'
import ErrorBoundary from './components/ErrorBoundary'
import ErrorToastProvider, { useErrorToasts } from './components/ErrorToastContext'
import Loader from './components/Loader'
import { ensureUser } from './lib/firebase'
import Editor from './pages/Editor'
import ProjectsList from './pages/ProjectsList'
import TemplateEditor from './pages/TemplateEditor'

const AppContent = () => {
  const [isReady, setIsReady] = useState(false)
  const [fatalError, setFatalError] = useState<string | null>(null)
  const { showError } = useErrorToasts()

  useEffect(() => {
    let mounted = true
    ensureUser()
      .then(() => {
        if (mounted) {
          setIsReady(true)
        }
      })
      .catch((err) => {
        console.error('Error inicializando autenticación', err)
        showError('No se pudo iniciar la sesión anónima. Intenta recargar la página.')
        if (mounted) {
          setFatalError('No se pudo iniciar la sesión anónima.')
        }
      })
    return () => {
      mounted = false
    }
  }, [showError])

  if (fatalError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-900 p-6 text-center text-red-200">
        <p>{fatalError}</p>
        <button type="button" onClick={() => window.location.reload()} className="bg-red-600 px-4 py-2 text-sm">
          Recargar
        </button>
      </div>
    )
  }

  if (!isReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900 p-6">
        <Loader message="Cargando Cardforge..." />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-900">
      <ErrorBoundary>
        <Routes>
          <Route path="/" element={<ProjectsList />} />
          <Route path="/p/:projectId" element={<Editor />} />
          <Route path="/templates" element={<TemplateEditor />} />
        </Routes>
      </ErrorBoundary>
    </div>
  )
}

const App = () => (
  <ErrorToastProvider>
    <AppContent />
  </ErrorToastProvider>
)

export default App
