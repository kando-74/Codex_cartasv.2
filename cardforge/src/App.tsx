import { useEffect, useState } from 'react'
import { Route, Routes } from 'react-router-dom'
import { ensureUser } from './lib/firebase'
import ProjectsList from './pages/ProjectsList'
import Editor from './pages/Editor'

function App() {
  const [isReady, setIsReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
        if (mounted) {
          setError('No se pudo iniciar la sesión anónima.')
        }
      })
    return () => {
      mounted = false
    }
  }, [])

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900 p-6 text-center text-red-400">
        {error}
      </div>
    )
  }

  if (!isReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900 p-6 text-slate-300">
        Cargando Cardforge...
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-900">
      <Routes>
        <Route path="/" element={<ProjectsList />} />
        <Route path="/p/:projectId" element={<Editor />} />
      </Routes>
    </div>
  )
}

export default App
