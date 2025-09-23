import { FormEvent, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
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

const DEFAULT_PROJECT_NAME = 'Nuevo proyecto'
const MIN_PROJECT_NAME_LENGTH = 3

const ProjectsList = () => {
  const [projects, setProjects] = useState<ProjectListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [nameTouched, setNameTouched] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [renamingValue, setRenamingValue] = useState('')
  const navigate = useNavigate()
  const isActiveRef = useRef(true)
  const projectNameInputRef = useRef<HTMLInputElement | null>(null)
  const projectNameHintId = useId()

  const hasProjects = useMemo(() => projects.length > 0, [projects])
  const normalizedDefaultProjectName = useMemo(
    () => DEFAULT_PROJECT_NAME.toLocaleLowerCase('es-ES'),
    [],
  )
  const trimmedProjectName = useMemo(() => newName.trim(), [newName])
  const normalizedProjectName = useMemo(
    () => trimmedProjectName.toLocaleLowerCase('es-ES'),
    [trimmedProjectName],
  )
  const isProjectNameEmpty = trimmedProjectName.length === 0
  const isProjectNameTooShort =
    trimmedProjectName.length > 0 && trimmedProjectName.length < MIN_PROJECT_NAME_LENGTH
  const isProjectNameDefault =
    trimmedProjectName.length > 0 && normalizedProjectName === normalizedDefaultProjectName
  const showProjectNameValidation = nameTouched
  const projectNameError = showProjectNameValidation
    ? isProjectNameEmpty
      ? 'Escribe un nombre para tu proyecto.'
      : isProjectNameTooShort
      ? `Usa al menos ${MIN_PROJECT_NAME_LENGTH} caracteres.`
      : isProjectNameDefault
      ? 'Elige un nombre distinto a "Nuevo proyecto".'
      : null
    : null
  const canCreateProject = !(
    isProjectNameEmpty || isProjectNameTooShort || isProjectNameDefault || creating
  )

  const loadProjects = useCallback(
    async (options?: { isActive?: () => boolean }) => {
      const isActive = options?.isActive ?? (() => isActiveRef.current)

      if (!isActive()) {
        return
      }

      setLoading(true)

      try {
        const data = await listProjects()
        if (!isActive()) {
          return
        }
        setProjects(data)
        if (!isActive()) {
          return
        }
        setError(null)
      } catch (err) {
        console.error(err)
        if (!isActive()) {
          return
        }
        setError('No se pudieron cargar los proyectos.')
      } finally {
        if (isActive()) {
          setLoading(false)
        }
      }
    },
    [],
  )

  useEffect(() => {
    let active = true
    isActiveRef.current = true

    loadProjects({ isActive: () => active }).catch(console.error)

    return () => {
      active = false
      isActiveRef.current = false
    }
  }, [loadProjects])

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault()
    setNameTouched(true)
    const name = newName.trim()
    const normalizedName = name.toLocaleLowerCase('es-ES')
    if (
      name.length < MIN_PROJECT_NAME_LENGTH ||
      normalizedName === normalizedDefaultProjectName
    ) {
      projectNameInputRef.current?.focus()
      return
    }
    try {
      setCreating(true)
      const project = await createProject(name)
      if (!isActiveRef.current) {
        return
      }
      setNewName('')
      setNameTouched(false)
      await loadProjects()
      if (!isActiveRef.current) {
        return
      }
      navigate(`/p/${project.id}`)
    } catch (err) {
      console.error(err)
      if (isActiveRef.current) {
        setError('No se pudo crear el proyecto.')
      }
    } finally {
      if (isActiveRef.current) {
        setCreating(false)
      }
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
      if (!isActiveRef.current) {
        return
      }
      setEditingId(null)
      setRenamingValue('')
      await loadProjects()
    } catch (err) {
      console.error(err)
      if (isActiveRef.current) {
        setError('No se pudo renombrar el proyecto.')
      }
    }
  }

  const handleDelete = async (projectId: string) => {
    if (!confirm('¿Eliminar este proyecto? Esta acción no se puede deshacer.')) {
      return
    }
    try {
      await deleteProject(projectId)
      if (!isActiveRef.current) {
        return
      }
      await loadProjects()
    } catch (err) {
      console.error(err)
      if (isActiveRef.current) {
        setError('No se pudo eliminar el proyecto.')
      }
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
              ref={projectNameInputRef}
              value={newName}
              onChange={(event) => {
                setNewName(event.target.value)
                setNameTouched(true)
              }}
              onBlur={() => setNameTouched(true)}
              placeholder="Ej. Mazmorra Arcana"
              aria-invalid={projectNameError ? 'true' : 'false'}
              aria-describedby={projectNameHintId}
              className="w-full"
            />
            <span
              id={projectNameHintId}
              className={
                projectNameError
                  ? 'text-sm text-red-300'
                  : 'text-sm text-slate-400'
              }
            >
              {projectNameError ??
                `Elige un nombre descriptivo con al menos ${MIN_PROJECT_NAME_LENGTH} caracteres.`}
            </span>
          </label>
          <button type="submit" disabled={!canCreateProject} className="sm:w-auto">
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
