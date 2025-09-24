import {
  ChangeEvent,
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { ensureUser } from '../lib/firebase'
import {
  cloneTemplate,
  listTemplates,
  loadTemplate,
  restoreTemplateVersion,
} from '../services/templates'
import type {
  TemplateDocument,
  TemplateSummary,
  TemplateVersion,
  TemplateVisibility,
} from '../types'
import Loader from './Loader'
import { useErrorToasts } from './ErrorToastContext'

const formatDateTime = (date?: Date) =>
  date
    ? new Intl.DateTimeFormat('es-ES', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(date)
    : 'Sin fecha'

const sortVersions = (versions: TemplateVersion[]): TemplateVersion[] =>
  [...versions].sort((a, b) => {
    if (a.versionNumber !== b.versionNumber) {
      return b.versionNumber - a.versionNumber
    }
    return (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0)
  })

const normalizeSearch = (value: string): string => value.trim().toLocaleLowerCase('es-ES')

const TemplateLibraryPanel = () => {
  const [scope, setScope] = useState<TemplateVisibility>('private')
  const [searchTerm, setSearchTerm] = useState('')
  const [templates, setTemplates] = useState<TemplateSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateDocument | null>(null)
  const [loadingDetails, setLoadingDetails] = useState(false)
  const [cloningTemplateId, setCloningTemplateId] = useState<string | null>(null)
  const [restoringVersionId, setRestoringVersionId] = useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const { showError, showInfo } = useErrorToasts()

  useEffect(() => {
    let active = true
    ensureUser()
      .then((user) => {
        if (!active) {
          return
        }
        setCurrentUserId(user.uid)
      })
      .catch((error) => {
        console.error('No se pudo obtener el usuario para la biblioteca de plantillas', error)
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true
    setLoading(true)
    listTemplates(scope)
      .then((items) => {
        if (!active) {
          return
        }
        setTemplates(items)
        setSelectedTemplateId(null)
        setSelectedTemplate(null)
      })
      .catch((error) => {
        if (!active) {
          return
        }
        console.error(error)
        showError('No se pudieron cargar las plantillas. Intenta de nuevo más tarde.')
      })
      .finally(() => {
        if (!active) {
          return
        }
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [scope, showError])

  useEffect(() => {
    if (!selectedTemplateId) {
      return
    }
    const stillExists = templates.some((item) => item.id === selectedTemplateId)
    if (!stillExists) {
      setSelectedTemplateId(null)
      setSelectedTemplate(null)
    }
  }, [templates, selectedTemplateId])

  const filteredTemplates = useMemo(() => {
    const normalized = normalizeSearch(searchTerm)
    if (!normalized) {
      return templates
    }
    return templates.filter((template) => {
      const name = template.name.toLocaleLowerCase('es-ES')
      const description = (template.description ?? '').toLocaleLowerCase('es-ES')
      const label = (template.currentVersionLabel ?? '').toLocaleLowerCase('es-ES')
      const matchesName = name.includes(normalized)
      const matchesDescription = description.includes(normalized)
      const matchesLabel = label.includes(normalized)
      const matchesTags = template.tags.some((tag) =>
        tag.toLocaleLowerCase('es-ES').includes(normalized),
      )
      return matchesName || matchesDescription || matchesLabel || matchesTags
    })
  }, [searchTerm, templates])

  const sortedVersions = useMemo(
    () => (selectedTemplate ? sortVersions(selectedTemplate.versionHistory) : []),
    [selectedTemplate],
  )

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value)
  }

  const handleScopeChange = (event: FormEvent<HTMLButtonElement>) => {
    const value = event.currentTarget.value as TemplateVisibility
    if (value === scope) {
      return
    }
    setScope(value)
  }

  const handleSelectTemplate = useCallback(
    async (templateId: string) => {
      setSelectedTemplateId(templateId)
      setSelectedTemplate(null)
      setLoadingDetails(true)
      try {
        const template = await loadTemplate(templateId)
        setSelectedTemplate(template)
      } catch (error) {
        console.error(error)
        showError('No se pudo cargar la plantilla seleccionada.')
      } finally {
        setLoadingDetails(false)
      }
    },
    [showError],
  )

  const handleClone = useCallback(
    async (templateId: string) => {
      setCloningTemplateId(templateId)
      try {
        await cloneTemplate(templateId)
        showInfo('La plantilla se clonó en tu biblioteca privada.')
        if (scope === 'private') {
          listTemplates(scope)
            .then((items) => {
              setTemplates(items)
            })
            .catch((error) => {
              console.error(error)
              showError('No se pudo actualizar la lista de plantillas.')
            })
        }
      } catch (error) {
        console.error(error)
        showError('No se pudo clonar la plantilla seleccionada.')
      } finally {
        setCloningTemplateId(null)
      }
    },
    [scope, showError, showInfo],
  )

  const handleRefresh = useCallback(
    async () => {
      setLoading(true)
      try {
        const items = await listTemplates(scope)
        setTemplates(items)
        if (selectedTemplateId) {
          const exists = items.some((item) => item.id === selectedTemplateId)
          if (!exists) {
            setSelectedTemplateId(null)
            setSelectedTemplate(null)
          }
        }
      } catch (error) {
        console.error(error)
        showError('No se pudieron actualizar las plantillas.')
      } finally {
        setLoading(false)
      }
    },
    [scope, selectedTemplateId, showError],
  )

  const handleRestoreVersion = useCallback(
    async (versionId: string) => {
      if (!selectedTemplate) {
        return
      }
      if (selectedTemplate.ownerUid !== currentUserId) {
        showError('Solo el propietario puede restaurar versiones de esta plantilla.')
        return
      }
      const confirmed = window.confirm(
        '¿Restaurar esta versión? Se creará una nueva versión basada en la seleccionada.',
      )
      if (!confirmed) {
        return
      }
      setRestoringVersionId(versionId)
      try {
        const updated = await restoreTemplateVersion(selectedTemplate.id, versionId)
        setSelectedTemplate(updated)
        setTemplates((prev) => {
          const next = prev.map((item) =>
            item.id === updated.id
              ? {
                  ...item,
                  versionNumber: updated.versionNumber,
                  currentVersionLabel: updated.currentVersionLabel,
                  updatedAt: updated.updatedAt,
                }
              : item,
          )
          return next.sort(
            (a, b) => (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0),
          )
        })
        showInfo('Se restauró la versión correctamente.')
      } catch (error) {
        console.error(error)
        showError('No se pudo restaurar la versión seleccionada.')
      } finally {
        setRestoringVersionId(null)
      }
    },
    [currentUserId, selectedTemplate, showError, showInfo],
  )

  const isOwner = selectedTemplate?.ownerUid === currentUserId

  return (
    <section className="flex flex-col gap-6">
      <header className="rounded-xl border border-slate-800 bg-slate-800/60 p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-2xl text-white">Biblioteca de plantillas</h2>
            <p className="text-sm text-slate-400">
              Explora plantillas públicas o gestiona tus propias plantillas para clonarlas y
              versionarlas.
            </p>
          </div>
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Ámbito de plantillas">
            <button
              type="button"
              role="tab"
              aria-selected={scope === 'private'}
              value="private"
              onClick={handleScopeChange}
              className={
                scope === 'private'
                  ? 'rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white'
                  : 'rounded-lg bg-slate-700 px-3 py-2 text-sm text-slate-200'
              }
            >
              Mis plantillas
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={scope === 'public'}
              value="public"
              onClick={handleScopeChange}
              className={
                scope === 'public'
                  ? 'rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white'
                  : 'rounded-lg bg-slate-700 px-3 py-2 text-sm text-slate-200'
              }
            >
              Plantillas públicas
            </button>
          </div>
        </div>
        <form
          className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(event: FormEvent) => event.preventDefault()}
        >
          <label className="flex flex-1 flex-col gap-1 text-sm text-slate-200">
            Buscar
            <input
              type="search"
              value={searchTerm}
              onChange={handleSearchChange}
              placeholder="Nombre, etiqueta o descripción"
              className="rounded-md border border-slate-700 bg-slate-900/60 px-3 py-2"
            />
          </label>
          <button
            type="button"
            onClick={handleRefresh}
            className="rounded-md bg-slate-700 px-3 py-2 text-sm text-slate-100 hover:bg-slate-600"
          >
            Actualizar listado
          </button>
        </form>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,400px)]">
        <section className="flex flex-col gap-4">
          {loading ? (
            <div className="flex min-h-[200px] items-center justify-center rounded-xl border border-slate-800 bg-slate-800/40">
              <Loader message="Cargando plantillas..." />
            </div>
          ) : filteredTemplates.length > 0 ? (
            <ul className="grid gap-4">
              {filteredTemplates.map((template) => {
                const isSelected = template.id === selectedTemplateId
                return (
                  <li
                    key={template.id}
                    className={`rounded-xl border bg-slate-800/60 p-4 transition-shadow ${
                      isSelected
                        ? 'border-primary shadow-lg shadow-primary/30'
                        : 'border-slate-800 hover:border-primary/60 hover:shadow-lg hover:shadow-primary/10'
                    }`}
                  >
                    <div className="flex flex-col gap-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <h3 className="text-lg text-white">{template.name}</h3>
                          <p className="text-xs text-slate-400">
                            Versión {template.versionNumber}
                            {template.currentVersionLabel
                              ? ` · ${template.currentVersionLabel}`
                              : ''}
                            {' · '}Última actualización: {formatDateTime(template.updatedAt)}
                          </p>
                          {template.visibility === 'public' ? (
                            <p className="text-xs text-emerald-300">Plantilla pública</p>
                          ) : null}
                          {template.forkedFrom ? (
                            <p className="text-xs text-slate-400">
                              Clonada de {template.forkedFrom}
                            </p>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          className="rounded-md bg-primary px-3 py-1 text-sm text-white hover:bg-primary/90"
                          onClick={() => handleClone(template.id)}
                          disabled={cloningTemplateId === template.id}
                        >
                          {cloningTemplateId === template.id ? 'Clonando...' : 'Clonar'}
                        </button>
                      </div>
                      {template.description ? (
                        <p className="text-sm text-slate-300 line-clamp-3">{template.description}</p>
                      ) : null}
                      {template.tags.length > 0 ? (
                        <ul className="flex flex-wrap gap-2 text-xs text-slate-200">
                          {template.tags.map((tag) => (
                            <li
                              key={tag}
                              className="rounded-full bg-slate-700 px-3 py-1 text-xs uppercase tracking-wide"
                            >
                              {tag}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      <div className="flex flex-wrap gap-2 text-xs">
                        <button
                          type="button"
                          onClick={() => handleSelectTemplate(template.id)}
                          className={
                            isSelected
                              ? 'rounded-md bg-primary/20 px-3 py-1 text-primary'
                              : 'rounded-md bg-slate-700 px-3 py-1 text-slate-100 hover:bg-slate-600'
                          }
                        >
                          {isSelected ? 'Seleccionada' : 'Ver detalles'}
                        </button>
                        <span className="rounded-md bg-slate-900/70 px-3 py-1 text-slate-400">
                          {scope === 'private' ? 'Privada' : 'Pública'}
                        </span>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          ) : (
            <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-6 text-sm text-slate-300">
              No se encontraron plantillas con los criterios actuales.
            </div>
          )}
        </section>

        <aside className="rounded-xl border border-slate-800 bg-slate-800/60 p-4">
          {loadingDetails ? (
            <Loader message="Cargando detalles de la plantilla..." />
          ) : selectedTemplate ? (
            <div className="flex flex-col gap-4">
              <header>
                <h3 className="text-xl text-white">{selectedTemplate.name}</h3>
                <p className="text-sm text-slate-300">
                  Versión actual: {selectedTemplate.versionNumber}
                  {selectedTemplate.currentVersionLabel
                    ? ` · ${selectedTemplate.currentVersionLabel}`
                    : ''}
                </p>
                <p className="text-xs text-slate-400">
                  Última edición: {formatDateTime(selectedTemplate.updatedAt)}
                </p>
                <p className="text-xs text-slate-400">
                  Propietario: {selectedTemplate.ownerUid || 'Desconocido'}
                </p>
                {isOwner ? (
                  <p className="text-xs text-emerald-300">
                    Eres el propietario. Puedes restaurar versiones anteriores.
                  </p>
                ) : (
                  <p className="text-xs text-slate-500">
                    Solo el propietario puede restaurar versiones.
                  </p>
                )}
              </header>

              {selectedTemplate.description ? (
                <div>
                  <h4 className="text-sm font-semibold text-slate-200">Descripción</h4>
                  <p className="text-sm text-slate-300">{selectedTemplate.description}</p>
                </div>
              ) : null}

              {selectedTemplate.tags.length > 0 ? (
                <div>
                  <h4 className="text-sm font-semibold text-slate-200">Etiquetas</h4>
                  <ul className="flex flex-wrap gap-2 text-xs text-slate-200">
                    {selectedTemplate.tags.map((tag) => (
                      <li key={tag} className="rounded-full bg-slate-700 px-3 py-1 uppercase tracking-wide">
                        {tag}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div>
                <h4 className="text-sm font-semibold text-slate-200">Historial de versiones</h4>
                {sortedVersions.length > 0 ? (
                  <ul className="mt-2 flex flex-col gap-3">
                    {sortedVersions.map((version) => {
                      const isCurrent = version.id === selectedTemplate.currentVersion.id
                      return (
                        <li
                          key={version.id}
                          className={`rounded-lg border p-3 text-sm ${
                            isCurrent
                              ? 'border-primary/70 bg-primary/10'
                              : 'border-slate-700 bg-slate-900/60'
                          }`}
                        >
                          <div className="flex flex-col gap-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <p className="font-semibold text-slate-100">{version.label}</p>
                                <p className="text-xs text-slate-400">
                                  v{version.versionNumber} · {formatDateTime(version.createdAt)}
                                </p>
                              </div>
                              {isCurrent ? (
                                <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs text-emerald-300">
                                  Versión activa
                                </span>
                              ) : isOwner ? (
                                <button
                                  type="button"
                                  className="rounded-md bg-slate-700 px-3 py-1 text-xs text-slate-100 hover:bg-slate-600"
                                  onClick={() => handleRestoreVersion(version.id)}
                                  disabled={restoringVersionId === version.id}
                                >
                                  {restoringVersionId === version.id
                                    ? 'Restaurando...'
                                    : 'Restaurar'}
                                </button>
                              ) : null}
                            </div>
                            {version.changelog ? (
                              <p className="text-xs text-slate-300">{version.changelog}</p>
                            ) : null}
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                ) : (
                  <p className="text-xs text-slate-400">Esta plantilla no tiene versiones registradas.</p>
                )}
              </div>
            </div>
          ) : (
            <div className="flex min-h-[200px] items-center justify-center text-sm text-slate-300">
              Selecciona una plantilla para ver sus detalles y su historial de versiones.
            </div>
          )}
        </aside>
      </div>
    </section>
  )
}

export default TemplateLibraryPanel
