import { FormEvent, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  createProject,
  deleteProject,
  listProjects,
  renameProject,
} from '../services/projects'
import type { ProjectListItem } from '../types'
import { useErrorToasts } from '../components/ErrorToastContext'
import Loader from '../components/Loader'
import SettingsPanel from '../components/SettingsPanel'
import TemplateLibraryPanel from '../components/TemplateLibraryPanel'

const formatDate = (date?: Date) =>
  date ? new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short' }).format(date) : 'Sin fecha'

const DEFAULT_PROJECT_NAME = 'Nuevo proyecto'
const MIN_PROJECT_NAME_LENGTH = 3

type ProjectsListTab = 'projects' | 'templates'

const ProjectsList = () => {
  const [projects, setProjects] = useState<ProjectListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [nameTouched, setNameTouched] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [renamingValue, setRenamingValue] = useState('')
  const [activeTab, setActiveTab] = useState<ProjectsListTab>('projects')
  const { showError, showInfo } = useErrorToasts()
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
      } catch (err) {
        console.error(err)
        if (isActive()) {
          showError('No se pudieron cargar los proyectos. Intenta de nuevo en unos segundos.')
        }
      } finally {
        if (isActive()) {
          setLoading(false)
        }
      }
    },
    [showError],
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
        showError('No se pudo crear el proyecto. Verifica tu conexión e inténtalo nuevamente.')
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
        showError('No se pudo renombrar el proyecto.')
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
      showInfo('El proyecto se eliminó correctamente.')
    } catch (err) {
      console.error(err)
      if (isActiveRef.current) {
        showError('No se pudo eliminar el proyecto.')
      }
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 p-6">
      <header className="rounded-xl border border-slate-800 bg-slate-800/60 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl text-white">Cardforge</h1>
            <p className="text-slate-400">
              Gestiona tus proyectos de cartas y explora la biblioteca de plantillas reutilizables.
            </p>
          </div>
          <div
            className="flex flex-wrap gap-2"
            role="tablist"
            aria-label="Secciones principales de Cardforge"
          >
            <button
              type="button"
              role="tab"
              value="projects"
              aria-selected={activeTab === 'projects'}
              onClick={() => setActiveTab('projects')}
              className={
                activeTab === 'projects'
                  ? 'rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white'
                  : 'rounded-lg bg-slate-700 px-3 py-2 text-sm text-slate-200'
              }
            >
              Proyectos
            </button>
            <button
              type="button"
              role="tab"
              value="templates"
              aria-selected={activeTab === 'templates'}
              onClick={() => setActiveTab('templates')}
              className={
                activeTab === 'templates'
                  ? 'rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white'
                  : 'rounded-lg bg-slate-700 px-3 py-2 text-sm text-slate-200'
              }
            >
              Biblioteca de plantillas
            </button>
          </div>
        </div>
      </header>

      {activeTab === 'projects' ? (
        <>
          <section className="rounded-xl border border-slate-800 bg-slate-800/60 p-6">
            <header className="mb-4">
              <h2 className="text-2xl text-white">Crear nuevo proyecto</h2>
              <p className="text-sm text-slate-400">
                Organiza tus cartas en proyectos independientes para cada juego o colección.
              </p>
            </header>
            <form
              onSubmit={handleCreate}
              className="flex flex-col gap-3 sm:flex-row sm:items-end"
            >
              <label className="flex flex-1 flex-col gap-1 text-sm text-slate-200">
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
                  className="w-full rounded-md border border-slate-700 bg-slate-900/60 px-3 py-2"
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
              <button
                type="submit"
                disabled={!canCreateProject}
                className="rounded-md bg-primary px-3 py-2 text-sm text-white hover:bg-primary/90 sm:w-auto"
              >
                {creating ? 'Creando...' : 'Crear proyecto'}
              </button>
            </form>
          </section>

          <SettingsPanel />

          <section className="flex flex-1 flex-col gap-4">
            <h2 className="text-xl text-slate-200">Tus proyectos</h2>
            {loading ? (
              <div className="flex min-h-[160px] items-center justify-center rounded-lg border border-slate-800 bg-slate-800/40">
                <Loader message="Cargando proyectos..." />
              </div>
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
                              className="w-full rounded border border-slate-700 bg-slate-900/60 px-2 py-1"
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
                          className="rounded-md bg-slate-700 px-3 py-1 text-sm text-slate-100 hover:bg-slate-600"
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
                              className="rounded-md bg-primary px-3 py-1 text-white hover:bg-primary/90"
                            >
                              Guardar nombre
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingId(null)
                                setRenamingValue('')
                              }}
                              className="rounded-md bg-slate-700 px-3 py-1 text-slate-100 hover:bg-slate-600"
                            >
                              Cancelar
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => startRename(project)}
                            className="rounded-md bg-slate-700 px-3 py-1 text-slate-100 hover:bg-slate-600"
                          >
                            Renombrar
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDelete(project.id)}
                          className="rounded-md bg-red-600 px-3 py-1 text-slate-100 hover:bg-red-700"
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
        </>
      ) : (
        <TemplateLibraryPanel />
      )}
    </main>
  )
}

export default ProjectsList
