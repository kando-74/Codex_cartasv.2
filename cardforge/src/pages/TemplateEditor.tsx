import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import TemplateCanvas from '../components/template/TemplateCanvas'
import TemplatePreview from '../components/template/TemplatePreview'
import Loader from '../components/Loader'
import { useErrorToasts } from '../components/ErrorToastContext'
import {
  createTemplate,
  listTemplates,
  loadTemplate,
  updateTemplate,
  type UpdateTemplateInput,
} from '../services/templates'
import type {
  Template,
  TemplateElement,
  TemplateElementType,
  TemplateSummary,
} from '../types'

const clampNumber = (value: number, min: number, max: number): number => {
  if (!Number.isFinite(value)) {
    return min
  }
  if (max < min) {
    return min
  }
  if (value < min) {
    return min
  }
  if (value > max) {
    return max
  }
  return value
}

const generateElementId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `element_${Math.random().toString(36).slice(2, 10)}`

const normalizeElement = (element: TemplateElement, width: number, height: number): TemplateElement => {
  const minSize = 20
  const normalizedWidth = clampNumber(element.width, minSize, width)
  const normalizedHeight = clampNumber(element.height, minSize, height)
  const maxX = Math.max(width - normalizedWidth, 0)
  const maxY = Math.max(height - normalizedHeight, 0)
  const normalizedX = clampNumber(element.x, 0, maxX)
  const normalizedY = clampNumber(element.y, 0, maxY)

  return {
    ...element,
    width: normalizedWidth,
    height: normalizedHeight,
    x: normalizedX,
    y: normalizedY,
  }
}

const createDefaultElement = (type: TemplateElementType, template: Template): TemplateElement => {
  const baseWidth = Math.min(280, template.width - 80)
  const baseHeight = type === 'image' ? Math.min(360, template.height - 80) : Math.min(140, template.height - 80)
  const baseX = clampNumber(Math.round((template.width - baseWidth) / 2), 20, template.width - baseWidth)
  const baseY = clampNumber(Math.round((template.height - baseHeight) / 2), 20, template.height - baseHeight)

  const base = {
    id: generateElementId(),
    type,
    name: `${type === 'text' ? 'Texto' : type === 'rectangle' ? 'Rectángulo' : 'Imagen'} ${template.elements.length + 1}`,
    x: baseX,
    y: baseY,
    width: baseWidth,
    height: baseHeight,
    rotation: 0,
    visible: true,
    locked: false,
  }

  if (type === 'text') {
    return {
      ...base,
      type: 'text',
      text: 'Nuevo texto',
      fontFamily: 'Inter',
      fontSize: 32,
      fontWeight: 600,
      color: '#f1f5f9',
      align: 'center',
    }
  }

  if (type === 'rectangle') {
    return {
      ...base,
      type: 'rectangle',
      fill: '#1d4ed8',
      borderColor: 'rgba(30, 64, 175, 0.7)',
      borderWidth: 0,
      borderRadius: 16,
      opacity: 0.9,
    }
  }

  return {
    ...base,
    type: 'image',
    fit: 'cover',
    background: '#0f172a',
    strokeColor: 'rgba(59, 130, 246, 0.6)',
    strokeWidth: 2,
    placeholder: 'Área de imagen',
  }
}

const formatUpdatedAt = (date?: Date) =>
  date ? new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short' }).format(date) : 'Sin fecha'

const TemplateEditor = () => {
  const { showError, showInfo } = useErrorToasts()
  const [templates, setTemplates] = useState<TemplateSummary[]>([])
  const [currentTemplate, setCurrentTemplate] = useState<Template | null>(null)
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null)
  const [loadingList, setLoadingList] = useState(true)
  const [loadingTemplate, setLoadingTemplate] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [zoom, setZoom] = useState(0.75)

  const selectedElement = useMemo(() => {
    if (!currentTemplate || !selectedElementId) {
      return null
    }
    return currentTemplate.elements.find((element) => element.id === selectedElementId) ?? null
  }, [currentTemplate, selectedElementId])

  const loadTemplatesList = useCallback(async () => {
    setLoadingList(true)
    try {
      const items = await listTemplates()
      setTemplates(items)
    } catch (error) {
      console.error(error)
      showError('No se pudieron cargar las plantillas. Intenta nuevamente.')
    } finally {
      setLoadingList(false)
    }
  }, [showError])

  useEffect(() => {
    loadTemplatesList().catch(console.error)
  }, [loadTemplatesList])

  useEffect(() => {
    if (!currentTemplate || !selectedElementId) {
      return
    }
    const stillExists = currentTemplate.elements.some((element) => element.id === selectedElementId)
    if (!stillExists) {
      setSelectedElementId(null)
    }
  }, [currentTemplate, selectedElementId])

  const handleSelectTemplate = async (templateId: string) => {
    setLoadingTemplate(true)
    try {
      const template = await loadTemplate(templateId)
      setCurrentTemplate({
        ...template,
        elements: template.elements.map((element) => normalizeElement(element, template.width, template.height)) as TemplateElement[],
      })
      setSelectedElementId(null)
      setDirty(false)
    } catch (error) {
      console.error(error)
      showError('No se pudo cargar la plantilla seleccionada.')
    } finally {
      setLoadingTemplate(false)
    }
  }

  const handleCreateTemplate = async () => {
    setLoadingTemplate(true)
    try {
      const template = await createTemplate('Nueva plantilla')
      setCurrentTemplate(template)
      setSelectedElementId(null)
      setDirty(false)
      await loadTemplatesList()
    } catch (error) {
      console.error(error)
      showError('No se pudo crear la plantilla. Verifica tu conexión e inténtalo nuevamente.')
    } finally {
      setLoadingTemplate(false)
    }
  }

  const applyTemplateUpdate = (updater: (template: Template) => Template | null) => {
    let updated = false
    setCurrentTemplate((prev) => {
      if (!prev) {
        return prev
      }
      const next = updater(prev)
      if (!next) {
        return prev
      }
      updated = true
      return next
    })
    if (updated) {
      setDirty(true)
    }
  }

  const applyElementChanges = (elementId: string, changes: Partial<TemplateElement>) => {
    applyTemplateUpdate((template) => {
      const nextElements = template.elements.map((element) => {
        if (element.id !== elementId) {
          return element
        }
        const merged = { ...element, ...changes } as TemplateElement
        return normalizeElement(merged, template.width, template.height)
      })
      if (nextElements === template.elements) {
        return template
      }
      return { ...template, elements: nextElements }
    })
  }

  const handleCanvasUpdate = (elementId: string, changes: Partial<TemplateElement>) => {
    applyElementChanges(elementId, changes)
  }

  const handleAddElement = (type: TemplateElementType) => {
    if (!currentTemplate) {
      return
    }
    const nextElement = normalizeElement(createDefaultElement(type, currentTemplate), currentTemplate.width, currentTemplate.height)
    setCurrentTemplate((prev) => {
      if (!prev) {
        return prev
      }
      const elements = [...prev.elements, nextElement]
      setDirty(true)
      return { ...prev, elements }
    })
    setSelectedElementId(nextElement.id)
  }

  const handleDeleteElement = () => {
    if (!currentTemplate || !selectedElementId) {
      return
    }
    let removed = false
    setCurrentTemplate((prev) => {
      if (!prev) {
        return prev
      }
      const nextElements = prev.elements.filter((element) => {
        if (element.id === selectedElementId) {
          removed = true
          return false
        }
        return true
      })
      if (!removed) {
        return prev
      }
      setDirty(true)
      return { ...prev, elements: nextElements }
    })
    if (removed) {
      setSelectedElementId(null)
    }
  }

  const handleTemplateFieldChange = (field: keyof UpdateTemplateInput, value: string | number | boolean) => {
    if (!currentTemplate) {
      return
    }
    let shouldMarkDirty = false
    setCurrentTemplate((prev) => {
      if (!prev) {
        return prev
      }
      switch (field) {
        case 'name': {
          const nextName = value as string
          if (prev.name === nextName) {
            return prev
          }
          shouldMarkDirty = true
          return { ...prev, name: nextName }
        }
        case 'background': {
          const nextBackground = value as string
          if (prev.background === nextBackground) {
            return prev
          }
          shouldMarkDirty = true
          return { ...prev, background: nextBackground }
        }
        case 'showGrid': {
          const nextShowGrid = Boolean(value)
          if (prev.showGrid === nextShowGrid) {
            return prev
          }
          shouldMarkDirty = true
          return { ...prev, showGrid: nextShowGrid }
        }
        case 'width':
        case 'height': {
          const sizeValue = value as number
          const currentSize = field === 'width' ? prev.width : prev.height
          if (currentSize === sizeValue) {
            return prev
          }
          const width = field === 'width' ? sizeValue : prev.width
          const height = field === 'height' ? sizeValue : prev.height
          const nextElements = prev.elements.map((element) => normalizeElement(element, width, height))
          shouldMarkDirty = true
          return { ...prev, width, height, elements: nextElements }
        }
        default:
          return prev
      }
    })
    if (shouldMarkDirty) {
      setDirty(true)
    }
  }

  const handleTemplateSizeChange = (field: 'width' | 'height') => (event: ChangeEvent<HTMLInputElement>) => {
    const rawValue = Number(event.target.value)
    if (!Number.isFinite(rawValue)) {
      return
    }
    const value = clampNumber(rawValue, 200, 1600)
    handleTemplateFieldChange(field, value)
  }

  const handleBackgroundChange = (event: ChangeEvent<HTMLInputElement>) => {
    handleTemplateFieldChange('background', event.target.value)
  }

  const handleGridToggle = (event: ChangeEvent<HTMLInputElement>) => {
    handleTemplateFieldChange('showGrid', event.target.checked)
  }

  const handleTemplateNameChange = (event: ChangeEvent<HTMLInputElement>) => {
    handleTemplateFieldChange('name', event.target.value)
  }

  const handleElementNameChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (!selectedElementId) {
      return
    }
    applyElementChanges(selectedElementId, { name: event.target.value })
  }

  const handleElementNumberChange = (field: 'x' | 'y' | 'width' | 'height') => (event: ChangeEvent<HTMLInputElement>) => {
    if (!selectedElementId) {
      return
    }
    const parsed = Number(event.target.value)
    if (!Number.isFinite(parsed)) {
      return
    }
    applyElementChanges(selectedElementId, { [field]: parsed } as Partial<TemplateElement>)
  }

  const handleTextContentChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    if (!selectedElementId) {
      return
    }
    applyElementChanges(selectedElementId, { text: event.target.value })
  }

  const handleTextFontChange = (field: 'fontFamily' | 'fontSize' | 'fontWeight' | 'color' | 'align') =>
    (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      if (!selectedElementId) {
        return
      }
      if (field === 'fontSize' || field === 'fontWeight') {
        const parsed = Number(event.target.value)
        if (!Number.isFinite(parsed)) {
          return
        }
        applyElementChanges(selectedElementId, { [field]: parsed } as Partial<TemplateElement>)
        return
      }
      applyElementChanges(selectedElementId, { [field]: event.target.value } as Partial<TemplateElement>)
    }

  const handleRectangleFieldChange = (field: 'fill' | 'borderColor') => (event: ChangeEvent<HTMLInputElement>) => {
    if (!selectedElementId) {
      return
    }
    applyElementChanges(selectedElementId, { [field]: event.target.value } as Partial<TemplateElement>)
  }

  const handleRectangleNumberChange = (field: 'borderWidth' | 'borderRadius' | 'opacity') =>
    (event: ChangeEvent<HTMLInputElement>) => {
      if (!selectedElementId) {
        return
      }
      const parsed = Number(event.target.value)
      if (!Number.isFinite(parsed)) {
        return
      }
      const value = field === 'opacity' ? clampNumber(parsed, 0.05, 1) : clampNumber(parsed, 0, 200)
      applyElementChanges(selectedElementId, { [field]: value } as Partial<TemplateElement>)
    }

  const handleImageFieldChange = (field: 'background' | 'strokeColor') => (event: ChangeEvent<HTMLInputElement>) => {
    if (!selectedElementId) {
      return
    }
    applyElementChanges(selectedElementId, { [field]: event.target.value } as Partial<TemplateElement>)
  }

  const handleImageStrokeWidthChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (!selectedElementId) {
      return
    }
    const parsed = Number(event.target.value)
    if (!Number.isFinite(parsed)) {
      return
    }
    applyElementChanges(selectedElementId, { strokeWidth: clampNumber(parsed, 0, 12) } as Partial<TemplateElement>)
  }

  const handleElementVisibilityToggle = (event: ChangeEvent<HTMLInputElement>) => {
    if (!selectedElementId) {
      return
    }
    applyElementChanges(selectedElementId, { visible: event.target.checked })
  }

  const handleElementLockToggle = (event: ChangeEvent<HTMLInputElement>) => {
    if (!selectedElementId) {
      return
    }
    applyElementChanges(selectedElementId, { locked: event.target.checked })
  }

  const handleSaveTemplate = async (event: FormEvent) => {
    event.preventDefault()
    if (!currentTemplate || saving) {
      return
    }
    setSaving(true)
    try {
      const payload: UpdateTemplateInput = {
        name: currentTemplate.name,
        width: Math.round(currentTemplate.width),
        height: Math.round(currentTemplate.height),
        background: currentTemplate.background,
        showGrid: currentTemplate.showGrid,
        elements: currentTemplate.elements,
      }
      await updateTemplate(currentTemplate.id, payload)
      setDirty(false)
      setTemplates((items) =>
        items.map((item) =>
          item.id === currentTemplate.id
            ? { ...item, name: currentTemplate.name, updatedAt: new Date() }
            : item,
        ),
      )
      showInfo('Plantilla guardada correctamente.')
    } catch (error) {
      console.error(error)
      showError('No se pudo guardar la plantilla. Intenta nuevamente.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="flex min-h-screen flex-col gap-6 bg-slate-900 p-6 lg:flex-row">
      <aside className="flex w-full max-w-xs flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
        <header className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Plantillas</h2>
          <button type="button" onClick={handleCreateTemplate} className="rounded-lg bg-primary px-3 py-2 text-sm">
            Nueva
          </button>
        </header>
        {loadingList ? (
          <Loader message="Cargando plantillas" />
        ) : templates.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-700/70 bg-slate-900/40 p-4 text-sm text-slate-400">
            Crea tu primera plantilla para comenzar a diseñar.
          </p>
        ) : (
          <ul className="flex flex-col gap-2 overflow-y-auto pr-1">
            {templates.map((template) => {
              const isActive = currentTemplate?.id === template.id
              return (
                <li key={template.id}>
                  <button
                    type="button"
                    onClick={() => handleSelectTemplate(template.id)}
                    className={`flex w-full flex-col gap-1 rounded-xl border px-3 py-2 text-left transition ${
                      isActive
                        ? 'border-primary bg-primary/15 text-slate-100'
                        : 'border-slate-800 bg-slate-900/40 hover:border-slate-700'
                    }`}
                  >
                    <span className="text-sm font-semibold">{template.name}</span>
                    <span className="text-xs text-slate-400">{formatUpdatedAt(template.updatedAt)}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </aside>
      <section className="flex w-full flex-1 flex-col gap-5">
        {currentTemplate ? (
          <form onSubmit={handleSaveTemplate} className="flex flex-col gap-5">
            <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <label className="flex flex-1 flex-col gap-2 text-sm">
                  Nombre de la plantilla
                  <input
                    value={currentTemplate.name}
                    onChange={handleTemplateNameChange}
                    placeholder="Plantilla personalizada"
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-base"
                  />
                </label>
                <div className="flex items-center gap-3">
                  <span className={`text-xs ${dirty ? 'text-amber-400' : 'text-slate-500'}`}>
                    {dirty ? 'Cambios sin guardar' : 'Sin cambios pendientes'}
                  </span>
                  <button
                    type="submit"
                    disabled={!dirty || saving}
                    className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold disabled:opacity-60"
                  >
                    {saving ? 'Guardando…' : 'Guardar'}
                  </button>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
                <label className="flex flex-col gap-1 text-xs">
                  Ancho (px)
                  <input
                    type="number"
                    min={200}
                    max={1600}
                    step={1}
                    value={Math.round(currentTemplate.width)}
                    onChange={handleTemplateSizeChange('width')}
                    className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  Alto (px)
                  <input
                    type="number"
                    min={200}
                    max={1600}
                    step={1}
                    value={Math.round(currentTemplate.height)}
                    onChange={handleTemplateSizeChange('height')}
                    className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  Fondo
                  <input
                    type="color"
                    value={currentTemplate.background}
                    onChange={handleBackgroundChange}
                    className="h-10 w-full cursor-pointer rounded-lg border border-slate-700 bg-slate-900"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span>Cuadrícula</span>
                  <span className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={currentTemplate.showGrid}
                      onChange={handleGridToggle}
                    />
                    <span>Mostrar</span>
                  </span>
                </label>
              </div>
            </section>

            <section className="flex flex-col gap-4 xl:flex-row">
              <div className="flex flex-1 flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-slate-300">Zoom</span>
                    <input
                      type="range"
                      min={0.4}
                      max={2}
                      step={0.1}
                      value={zoom}
                      onChange={(event) => setZoom(Number(event.target.value))}
                    />
                    <span className="w-16 text-xs text-slate-400">{Math.round(zoom * 100)}%</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleAddElement('text')}
                      className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                    >
                      + Texto
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAddElement('rectangle')}
                      className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                    >
                      + Rectángulo
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAddElement('image')}
                      className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                    >
                      + Imagen
                    </button>
                  </div>
                </div>
                <div className="relative flex min-h-[420px] flex-1">
                  {loadingTemplate ? (
                    <div className="absolute inset-0 z-20 flex items-center justify-center rounded-2xl border border-slate-800 bg-slate-900/80">
                      <Loader message="Cargando plantilla" />
                    </div>
                  ) : null}
                  <TemplateCanvas
                    width={Math.round(currentTemplate.width)}
                    height={Math.round(currentTemplate.height)}
                    background={currentTemplate.background}
                    showGrid={currentTemplate.showGrid}
                    elements={currentTemplate.elements}
                    selectedElementId={selectedElementId}
                    zoom={zoom}
                    onSelectElement={setSelectedElementId}
                    onUpdateElement={handleCanvasUpdate}
                  />
                </div>
              </div>
              <aside className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
                <header className="flex items-center justify-between">
                  <h3 className="text-base font-semibold">Inspector</h3>
                  {selectedElement ? (
                    <span className="rounded-full bg-slate-800 px-3 py-1 text-xs uppercase tracking-widest text-slate-400">
                      {selectedElement.type}
                    </span>
                  ) : null}
                </header>
                {selectedElement ? (
                  <div className="mt-4 flex flex-col gap-4 text-sm">
                    <label className="flex flex-col gap-2 text-xs">
                      Nombre
                      <input
                        value={selectedElement.name}
                        onChange={handleElementNameChange}
                        className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                      />
                    </label>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <label className="flex flex-col gap-1">
                        Posición X
                        <input
                          type="number"
                          value={Math.round(selectedElement.x)}
                          onChange={handleElementNumberChange('x')}
                          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        Posición Y
                        <input
                          type="number"
                          value={Math.round(selectedElement.y)}
                          onChange={handleElementNumberChange('y')}
                          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        Ancho
                        <input
                          type="number"
                          value={Math.round(selectedElement.width)}
                          onChange={handleElementNumberChange('width')}
                          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        Alto
                        <input
                          type="number"
                          value={Math.round(selectedElement.height)}
                          onChange={handleElementNumberChange('height')}
                          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                        />
                      </label>
                    </div>
                    <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selectedElement.visible !== false}
                          onChange={handleElementVisibilityToggle}
                        />
                        <span>Visible</span>
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selectedElement.locked}
                          onChange={handleElementLockToggle}
                        />
                        <span>Bloquear</span>
                      </label>
                    </div>

                    {selectedElement.type === 'text' ? (
                      <div className="flex flex-col gap-3">
                        <label className="flex flex-col gap-2 text-xs">
                          Contenido
                          <textarea
                            value={selectedElement.text}
                            onChange={handleTextContentChange}
                            rows={4}
                            className="min-h-[100px] rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                          />
                        </label>
                        <label className="flex flex-col gap-2 text-xs">
                          Familia tipográfica
                          <input
                            value={selectedElement.fontFamily}
                            onChange={handleTextFontChange('fontFamily')}
                            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                          />
                        </label>
                        <div className="grid grid-cols-2 gap-3 text-xs">
                          <label className="flex flex-col gap-1">
                            Tamaño
                            <input
                              type="number"
                              value={Math.round(selectedElement.fontSize)}
                              onChange={handleTextFontChange('fontSize')}
                              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                            />
                          </label>
                          <label className="flex flex-col gap-1">
                            Peso
                            <input
                              type="number"
                              value={Math.round(selectedElement.fontWeight)}
                              onChange={handleTextFontChange('fontWeight')}
                              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                            />
                          </label>
                        </div>
                        <label className="flex flex-col gap-1 text-xs">
                          Color
                          <input
                            type="color"
                            value={selectedElement.color}
                            onChange={handleTextFontChange('color') as (event: ChangeEvent<HTMLInputElement>) => void}
                            className="h-10 w-full cursor-pointer rounded-lg border border-slate-700 bg-slate-900"
                          />
                        </label>
                        <label className="flex flex-col gap-1 text-xs">
                          Alineación
                          <select
                            value={selectedElement.align}
                            onChange={handleTextFontChange('align') as (event: ChangeEvent<HTMLSelectElement>) => void}
                            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                          >
                            <option value="left">Izquierda</option>
                            <option value="center">Centro</option>
                            <option value="right">Derecha</option>
                          </select>
                        </label>
                      </div>
                    ) : null}

                    {selectedElement.type === 'rectangle' ? (
                      <div className="flex flex-col gap-3 text-xs">
                        <label className="flex flex-col gap-1">
                          Color de relleno
                          <input
                            type="color"
                            value={selectedElement.fill}
                            onChange={handleRectangleFieldChange('fill')}
                            className="h-10 w-full cursor-pointer rounded-lg border border-slate-700 bg-slate-900"
                          />
                        </label>
                        <label className="flex flex-col gap-1">
                          Color del borde
                          <input
                            type="color"
                            value={selectedElement.borderColor}
                            onChange={handleRectangleFieldChange('borderColor')}
                            className="h-10 w-full cursor-pointer rounded-lg border border-slate-700 bg-slate-900"
                          />
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                          <label className="flex flex-col gap-1">
                            Grosor borde
                            <input
                              type="number"
                              value={Math.round(selectedElement.borderWidth)}
                              onChange={handleRectangleNumberChange('borderWidth')}
                              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                            />
                          </label>
                          <label className="flex flex-col gap-1">
                            Radio
                            <input
                              type="number"
                              value={Math.round(selectedElement.borderRadius)}
                              onChange={handleRectangleNumberChange('borderRadius')}
                              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                            />
                          </label>
                        </div>
                        <label className="flex flex-col gap-1">
                          Opacidad
                          <input
                            type="number"
                            min={0}
                            max={1}
                            step={0.05}
                            value={Number(selectedElement.opacity.toFixed(2))}
                            onChange={handleRectangleNumberChange('opacity')}
                            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                          />
                        </label>
                      </div>
                    ) : null}

                    {selectedElement.type === 'image' ? (
                      <div className="flex flex-col gap-3 text-xs">
                        <label className="flex flex-col gap-1">
                          Fondo
                          <input
                            type="color"
                            value={selectedElement.background}
                            onChange={handleImageFieldChange('background')}
                            className="h-10 w-full cursor-pointer rounded-lg border border-slate-700 bg-slate-900"
                          />
                        </label>
                        <label className="flex flex-col gap-1">
                          Borde
                          <input
                            type="color"
                            value={selectedElement.strokeColor}
                            onChange={handleImageFieldChange('strokeColor')}
                            className="h-10 w-full cursor-pointer rounded-lg border border-slate-700 bg-slate-900"
                          />
                        </label>
                        <label className="flex flex-col gap-1">
                          Grosor borde
                          <input
                            type="number"
                            min={0}
                            max={12}
                            value={Math.round(selectedElement.strokeWidth)}
                            onChange={handleImageStrokeWidthChange}
                            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                          />
                        </label>
                      </div>
                    ) : null}

                    <button
                      type="button"
                      onClick={handleDeleteElement}
                      className="mt-4 rounded-lg border border-red-600/60 bg-red-600/20 px-4 py-2 text-sm text-red-200 hover:bg-red-600/30"
                    >
                      Eliminar elemento
                    </button>
                  </div>
                ) : (
                  <p className="mt-6 rounded-xl border border-dashed border-slate-700/70 bg-slate-900/50 p-4 text-sm text-slate-400">
                    Selecciona un elemento del lienzo para editar sus propiedades.
                  </p>
                )}
              </aside>
            </section>

            <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
              <header className="flex items-center justify-between">
                <h3 className="text-base font-semibold">Vista previa responsive</h3>
                <span className="text-xs text-slate-400">Ajusta automáticamente al contenedor</span>
              </header>
              <div className="mt-4">
                <TemplatePreview template={currentTemplate} />
              </div>
            </section>
          </form>
        ) : (
          <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-slate-800 bg-slate-900/60 p-10 text-center text-slate-400">
            {loadingTemplate ? <Loader message="Preparando editor" /> : 'Selecciona o crea una plantilla para comenzar.'}
          </div>
        )}
      </section>
    </main>
  )
}

export default TemplateEditor
