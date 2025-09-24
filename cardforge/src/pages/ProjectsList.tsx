import { FormEvent, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  archiveProject,
  createProject,
  deleteProject,
  duplicateProject,
  listProjects,
  renameProject,
  restoreProject,
} from '../services/projects'
import type { ProjectListItem } from '../types'
import { useErrorToasts } from '../components/ErrorToastContext'
import Loader from '../components/Loader'
import SettingsPanel from '../components/SettingsPanel'

const formatDate = (date?: Date) =>
  date ? new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short' }).format(date) : 'Sin fecha'

const DEFAULT_PROJECT_NAME = 'Nuevo proyecto'
const MIN_PROJECT_NAME_LENGTH = 3

const ProjectsList = () => {
  const [projects, setProjects] = useState<ProjectListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [nameTouched, setNameTouched] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [renamingValue, setRenamingValue] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'archived'>('all')
  const [minCards, setMinCards] = useState('')
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null)
  const [statusAction, setStatusAction] = useState<
    { id: string; type: 'archive' | 'restore' } | null
  >(null)
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
  const trimmedSearchTerm = useMemo(
    () => searchTerm.trim().toLocaleLowerCase('es-ES'),
    [searchTerm],
  )
  const minCardsNumber = useMemo(() => {
    const value = Number(minCards)
    if (Number.isNaN(value) || value <= 0) {
      return 0
    }
    return Math.floor(value)
  }, [minCards])
  const hasActiveFilters = useMemo(
    () => trimmedSearchTerm.length > 0 || statusFilter !== 'all' || minCardsNumber > 0,
    [trimmedSearchTerm, statusFilter, minCardsNumber],
  )
  const filteredProjects = useMemo(
    () =>
      projects.filter((project) => {
        const matchesSearch =
          trimmedSearchTerm.length === 0 ||
          project.name.toLocaleLowerCase('es-ES').includes(trimmedSearchTerm)
        const matchesStatus =
          statusFilter === 'all'
            ? true
            : statusFilter === 'archived'
            ? Boolean(project.archivedAt)
            : !project.archivedAt
        const matchesCardCount = project.cardCount >= minCardsNumber
        return matchesSearch && matchesStatus && matchesCardCount
      }),
    [projects, trimmedSearchTerm, statusFilter, minCardsNumber],
  )
  const hasFilteredProjects = filteredProjects.length > 0
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

  const resetFilters = useCallback(() => {
    setSearchTerm('')
    setStatusFilter('all')
    setMinCards('')
  }, [])

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

  const handleDuplicate = useCallback(
    async (project: ProjectListItem) => {
      const projectName = project.name
      try {
        setDuplicatingId(project.id)
        const copy = await duplicateProject(project.id)
        if (!isActiveRef.current) {
          return
        }
        await loadProjects()
        if (!isActiveRef.current) {
          return
        }
        showInfo(`Se duplicó "${projectName}" como "${copy.name}".`)
        navigate(`/p/${copy.id}`)
      } catch (err) {
        console.error(err)
        if (isActiveRef.current) {
          showError('No se pudo duplicar el proyecto.')
        }
      } finally {
        if (isActiveRef.current) {
          setDuplicatingId(null)
        }
      }
    },
    [loadProjects, navigate, showError, showInfo],
  )

  const handleArchive = useCallback(
    async (project: ProjectListItem) => {
      const projectName = project.name
      if (
        !confirm(
          '¿Archivar este proyecto? Podrás restaurarlo cuando quieras desde esta pantalla.',
        )
      ) {
        return
      }
      try {
        setStatusAction({ id: project.id, type: 'archive' })
        await archiveProject(project.id)
        if (!isActiveRef.current) {
          return
        }
        await loadProjects()
        if (!isActiveRef.current) {
          return
        }
        showInfo(`"${projectName}" se archivó correctamente.`)
      } catch (err) {
        console.error(err)
        if (isActiveRef.current) {
          showError('No se pudo archivar el proyecto.')
        }
      } finally {
        if (isActiveRef.current) {
          setStatusAction(null)
        }
      }
    },
    [loadProjects, showError, showInfo],
  )

  const handleRestore = useCallback(
    async (project: ProjectListItem) => {
      const projectName = project.name
      try {
        setStatusAction({ id: project.id, type: 'restore' })
        await restoreProject(project.id)
        if (!isActiveRef.current) {
          return
        }
        await loadProjects()
        if (!isActiveRef.current) {
          return
        }
        showInfo(`"${projectName}" se restauró correctamente.`)
      } catch (err) {
        console.error(err)
        if (isActiveRef.current) {
          showError('No se pudo restaurar el proyecto.')
        }
      } finally {
        if (isActiveRef.current) {
          setStatusAction(null)
        }
      }
    },
    [loadProjects, showError, showInfo],
  )

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
      <header className="flex flex-col gap-4 rounded-xl border border-slate-800 bg-slate-800/60 p-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl">Cardforge</h1>
            <p className="text-slate-400">Gestiona tus proyectos de cartas y entra al editor.</p>
          </div>
          <Link
            to="/templates"
            className="inline-flex items-center justify-center rounded-lg border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/20"
          >
            Abrir editor de plantillas
          </Link>
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

      <SettingsPanel />

      <section className="flex flex-col gap-4 rounded-lg border border-slate-800 bg-slate-800/40 p-4">
        <h2 className="text-lg font-semibold text-slate-200">Buscar y filtrar proyectos</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-300">Buscar por nombre</span>
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Ej. Mazmorra Arcana"
              aria-label="Buscar proyectos por nombre"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-300">Estado</span>
            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as 'all' | 'active' | 'archived')
              }
            >
              <option value="all">Todos</option>
              <option value="active">Solo activos</option>
              <option value="archived">Archivados</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-300">Cartas mínimas</span>
            <input
              type="number"
              min={0}
              inputMode="numeric"
              value={minCards}
              onChange={(event) => setMinCards(event.target.value)}
              placeholder="0"
            />
            <span className="text-xs text-slate-400">
              Muestra proyectos con al menos esta cantidad de cartas.
            </span>
          </label>
        </div>
        {hasActiveFilters ? (
          <button
            type="button"
            onClick={resetFilters}
            className="self-start text-sm font-medium text-primary hover:underline"
          >
            Limpiar filtros
          </button>
        ) : null}
      </section>

      <section className="flex flex-1 flex-col gap-4">
        <h2 className="text-xl text-slate-200">Tus proyectos</h2>
        {loading ? (
          <div className="flex min-h-[160px] items-center justify-center rounded-lg border border-slate-800 bg-slate-800/40">
            <Loader message="Cargando proyectos..." />
          </div>
        ) : hasProjects ? (
          hasFilteredProjects ? (
            <ul className="grid gap-4 sm:grid-cols-2">
              {filteredProjects.map((project) => {
                const isEditing = editingId === project.id
                const isDuplicating = duplicatingId === project.id
                const isStatusUpdating = statusAction?.id === project.id
                const isArchiving = isStatusUpdating && statusAction?.type === 'archive'
                const isRestoring = isStatusUpdating && statusAction?.type === 'restore'
                const isArchived = Boolean(project.archivedAt)
                const cardCountLabel = project.cardCount === 1 ? 'carta' : 'cartas'
                return (
                  <li
                    key={project.id}
                    className={`flex flex-col gap-3 rounded-lg border p-4 shadow-lg transition ${
                      isArchived
                        ? 'border-amber-600/60 bg-slate-800/40'
                        : 'border-slate-800 bg-slate-800/60'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {isEditing ? (
                            <input
                              autoFocus
                              value={renamingValue}
                              onChange={(event) => setRenamingValue(event.target.value)}
                              className="w-full sm:w-auto"
                            />
                          ) : (
                            <h3 className="text-lg text-white">{project.name}</h3>
                          )}
                          {isArchived ? (
                            <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-300">
                              Archivado
                            </span>
                          ) : null}
                        </div>
                        <p className="text-sm text-slate-400">
                          Última edición: {formatDate(project.updatedAt)} · {project.cardCount}{' '}
                          {cardCountLabel}
                        </p>
                        {isArchived ? (
                          <p className="text-xs text-amber-200">
                            Archivado el {formatDate(project.archivedAt ?? undefined)}
                          </p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        className="bg-slate-700 px-3 py-1 text-sm hover:bg-slate-600"
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
                            className="bg-primary px-3 py-1 disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={isStatusUpdating || isDuplicating}
                          >
                            Guardar nombre
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(null)
                              setRenamingValue('')
                            }}
                            className="bg-slate-700 px-3 py-1 disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={isStatusUpdating || isDuplicating}
                          >
                            Cancelar
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => startRename(project)}
                          className="bg-slate-700 px-3 py-1 hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={isStatusUpdating || isDuplicating}
                        >
                          Renombrar
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDuplicate(project)}
                        className="bg-slate-700 px-3 py-1 hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={isDuplicating || isStatusUpdating}
                      >
                        {isDuplicating ? 'Duplicando...' : 'Duplicar'}
                      </button>
                      {isArchived ? (
                        <button
                          type="button"
                          onClick={() => handleRestore(project)}
                          className="bg-emerald-600 px-3 py-1 hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={isDuplicating || isStatusUpdating}
                        >
                          {isRestoring ? 'Restaurando...' : 'Restaurar'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleArchive(project)}
                          className="bg-amber-600 px-3 py-1 hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={isDuplicating || isStatusUpdating}
                        >
                          {isArchiving ? 'Archivando...' : 'Archivar'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDelete(project.id)}
                        className="bg-red-600 px-3 py-1 hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={isDuplicating || isStatusUpdating}
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
              No hay proyectos que coincidan con los filtros actuales.
            </div>
          )
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
