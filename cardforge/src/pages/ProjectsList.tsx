import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  createProject,
  deleteProject,
  listProjects,
  renameProject,
} from '../services/projects'
import type { ProjectListItem } from '../types'

const formatDate = (date?: Date) =>
  date ? new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short' }).format(date) : 'Sin fecha'

const ProjectsList = () => {
  const [projects, setProjects] = useState<ProjectListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [renamingValue, setRenamingValue] = useState('')
  const navigate = useNavigate()

  const hasProjects = useMemo(() => projects.length > 0, [projects])

  const loadProjects = useCallback(async () => {
    setLoading(true)
    try {
      const data = await listProjects()
      setProjects(data)
      setError(null)
    } catch (err) {
      console.error(err)
      setError('No se pudieron cargar los proyectos.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadProjects().catch(console.error)
  }, [loadProjects])

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault()
    const name = newName.trim() || 'Nuevo proyecto'
    try {
      setCreating(true)
      const project = await createProject(name)
      setNewName('')
      await loadProjects()
      navigate(`/p/${project.id}`)
    } catch (err) {
      console.error(err)
      setError('No se pudo crear el proyecto.')
    } finally {
      setCreating(false)
    }
  }

  const startRename = (project: ProjectListItem) => {
    setEditingId(project.id)
    setRenamingValue(project.name)
  }

  const confirmRename = async (projectId: string) => {
    if (!renamingValue.trim()) {
      return
    }
    try {
      await renameProject(projectId, renamingValue.trim())
      setEditingId(null)
      setRenamingValue('')
      await loadProjects()
    } catch (err) {
      console.error(err)
      setError('No se pudo renombrar el proyecto.')
    }
  }

  const handleDelete = async (projectId: string) => {
    if (!confirm('¿Eliminar este proyecto? Esta acción no se puede deshacer.')) {
      return
    }
    try {
      await deleteProject(projectId)
      await loadProjects()
    } catch (err) {
      console.error(err)
      setError('No se pudo eliminar el proyecto.')
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-800/60 p-6">
        <div>
          <h1 className="text-3xl">Cardforge</h1>
          <p className="text-slate-400">Gestiona tus proyectos de cartas y entra al editor.</p>
        </div>
        <form onSubmit={handleCreate} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex flex-1 flex-col gap-1">
            Nombre del proyecto
            <input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="Ej. Mazmorra Arcana"
              className="w-full"
            />
          </label>
          <button type="submit" disabled={creating} className="sm:w-auto">
            {creating ? 'Creando...' : 'Crear proyecto'}
          </button>
        </form>
      </header>

      {error ? (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-red-300">{error}</div>
      ) : null}

      <section className="flex flex-1 flex-col gap-4">
        <h2 className="text-xl text-slate-200">Tus proyectos</h2>
        {loading ? (
          <div className="rounded-lg border border-slate-800 bg-slate-800/40 p-6 text-slate-400">Cargando proyectos...</div>
        ) : hasProjects ? (
          <ul className="grid gap-4 sm:grid-cols-2">
            {projects.map((project) => {
              const isEditing = editingId === project.id
              return (
                <li
                  key={project.id}
                  className="flex flex-col gap-3 rounded-lg border border-slate-800 bg-slate-800/60 p-4 shadow-lg"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      {isEditing ? (
                        <input
                          autoFocus
                          value={renamingValue}
                          onChange={(event) => setRenamingValue(event.target.value)}
                          className="w-full"
                        />
                      ) : (
                        <h3 className="text-lg text-white">{project.name}</h3>
                      )}
                      <p className="text-sm text-slate-400">
                        Última edición: {formatDate(project.updatedAt)} · {project.cardCount} cartas
                      </p>
                    </div>
                    <button
                      type="button"
                      className="bg-slate-700 px-3 py-1 text-sm"
                      onClick={() => navigate(`/p/${project.id}`)}
                    >
                      Abrir
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2 text-sm">
                    {isEditing ? (
                      <>
                        <button
                          type="button"
                          onClick={() => confirmRename(project.id)}
                          className="bg-primary px-3 py-1"
                        >
                          Guardar nombre
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(null)
                            setRenamingValue('')
                          }}
                          className="bg-slate-700 px-3 py-1"
                        >
                          Cancelar
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => startRename(project)}
                        className="bg-slate-700 px-3 py-1"
                      >
                        Renombrar
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDelete(project.id)}
                      className="bg-red-600 px-3 py-1 hover:bg-red-700"
                    >
                      Eliminar
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        ) : (
          <div className="rounded-lg border border-slate-800 bg-slate-800/40 p-6 text-slate-400">
            No tienes proyectos aún. ¡Crea el primero!
          </div>
        )}
      </section>
    </main>
  )
}

export default ProjectsList
