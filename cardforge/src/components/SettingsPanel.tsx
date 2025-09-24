import { ChangeEvent, FormEvent, useMemo, useState } from 'react'
import {
  CARD_SIZE_OPTIONS,
  CUSTOM_CARD_SIZE_ID,
  DEFAULT_CARD_SIZE_ID,
  createCardSizeFromPreset,
  findMatchingPresetId,
  formatCardSize,
} from '../lib/cardSizes'
import { getDefaultCardSizeSetting, setDefaultCardSizeSetting } from '../lib/settings'
import type { CardSizeSetting } from '../types'
import { useErrorToasts } from './ErrorToastContext'

const isSameSize = (a: CardSizeSetting, b: CardSizeSetting): boolean => {
  return Math.abs(a.width - b.width) < 0.0001 && Math.abs(a.height - b.height) < 0.0001
}

const derivePresetId = (size: CardSizeSetting): string => {
  if (size.presetId === CUSTOM_CARD_SIZE_ID) {
    return CUSTOM_CARD_SIZE_ID
  }
  if (size.presetId) {
    return size.presetId
  }
  return findMatchingPresetId(size.width, size.height) ?? CUSTOM_CARD_SIZE_ID
}

const SettingsPanel = () => {
  const initialSize = useMemo(() => getDefaultCardSizeSetting(), [])
  const [storedSize, setStoredSize] = useState(initialSize)
  const { showInfo, showError } = useErrorToasts()
  const [presetId, setPresetId] = useState(() => derivePresetId(initialSize))
  const [customWidth, setCustomWidth] = useState(() => initialSize.width.toString())
  const [customHeight, setCustomHeight] = useState(() => initialSize.height.toString())
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const previewSize = useMemo<CardSizeSetting>(() => {
    if (presetId === CUSTOM_CARD_SIZE_ID) {
      const width = parseFloat(customWidth)
      const height = parseFloat(customHeight)
      return {
        presetId: CUSTOM_CARD_SIZE_ID,
        width: Number.isFinite(width) ? width : 0,
        height: Number.isFinite(height) ? height : 0,
        unit: 'mm',
      }
    }
    const preset = createCardSizeFromPreset(presetId)
    return preset
  }, [customHeight, customWidth, presetId])

  const customWidthValue = parseFloat(customWidth)
  const customHeightValue = parseFloat(customHeight)
  const isCustomValid =
    presetId !== CUSTOM_CARD_SIZE_ID ||
    (Number.isFinite(customWidthValue) && customWidthValue > 0 && Number.isFinite(customHeightValue) && customHeightValue > 0)

  const handlePresetChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextPreset = event.target.value
    setPresetId(nextPreset)
    setErrorMessage(null)
    setStatusMessage(null)
    if (nextPreset !== CUSTOM_CARD_SIZE_ID) {
      const preset = createCardSizeFromPreset(nextPreset)
      setCustomWidth(preset.width.toString())
      setCustomHeight(preset.height.toString())
    }
  }

  const handleWidthChange = (event: ChangeEvent<HTMLInputElement>) => {
    setCustomWidth(event.target.value)
    setErrorMessage(null)
    setStatusMessage(null)
  }

  const handleHeightChange = (event: ChangeEvent<HTMLInputElement>) => {
    setCustomHeight(event.target.value)
    setErrorMessage(null)
    setStatusMessage(null)
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setErrorMessage(null)

    let nextSize: CardSizeSetting

    if (presetId === CUSTOM_CARD_SIZE_ID) {
      const width = parseFloat(customWidth)
      const height = parseFloat(customHeight)
      if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
        setErrorMessage('Indica un ancho y alto válidos en milímetros.')
        return
      }
      nextSize = {
        presetId: CUSTOM_CARD_SIZE_ID,
        width,
        height,
        unit: 'mm',
      }
    } else {
      nextSize = createCardSizeFromPreset(presetId)
    }

    try {
      setDefaultCardSizeSetting(nextSize)
      setStoredSize(nextSize)
      setPresetId(derivePresetId(nextSize))
      setCustomWidth(nextSize.width.toString())
      setCustomHeight(nextSize.height.toString())
      setStatusMessage(`Tamaño por defecto actualizado a ${formatCardSize(nextSize)}.`)
      showInfo('Se guardó el tamaño de carta por defecto.')
    } catch (error) {
      console.error(error)
      showError('No se pudo guardar la configuración.')
      return
    }
  }

  const handleReset = () => {
    const defaultSize = createCardSizeFromPreset(DEFAULT_CARD_SIZE_ID)
    try {
      setDefaultCardSizeSetting(defaultSize)
      setStoredSize(defaultSize)
      setPresetId(derivePresetId(defaultSize))
      setCustomWidth(defaultSize.width.toString())
      setCustomHeight(defaultSize.height.toString())
      setStatusMessage(`Se restableció el tamaño por defecto a ${formatCardSize(defaultSize)}.`)
      setErrorMessage(null)
      showInfo('Se restableció el tamaño de carta a Poker.')
    } catch (error) {
      console.error(error)
      showError('No se pudo restablecer el tamaño de carta.')
    }
  }

  const isDirty = !isSameSize(previewSize, storedSize)

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-800/60 p-4">
      <header className="mb-4">
        <h2 className="text-lg text-white">Configuración</h2>
        <p className="text-sm text-slate-400">Define el tamaño de carta usado por defecto al crear nuevas cartas.</p>
      </header>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm text-slate-100">
          Formato por defecto
          <select value={presetId} onChange={handlePresetChange}>
            {CARD_SIZE_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name} — {option.width} × {option.height} mm
              </option>
            ))}
            <option value={CUSTOM_CARD_SIZE_ID}>Personalizado</option>
          </select>
        </label>
        {presetId === CUSTOM_CARD_SIZE_ID ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm text-slate-100">
              Ancho (mm)
              <input
                type="number"
                min={1}
                step={0.1}
                value={customWidth}
                onChange={handleWidthChange}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-slate-100">
              Alto (mm)
              <input
                type="number"
                min={1}
                step={0.1}
                value={customHeight}
                onChange={handleHeightChange}
              />
            </label>
          </div>
        ) : null}
        <p className="text-xs text-slate-400">Vista previa: {formatCardSize(previewSize)}</p>
        <div className="flex flex-wrap gap-2 text-sm">
          <button type="submit" disabled={!isCustomValid || !isDirty} className="bg-primary px-3 py-2 text-sm">
            Guardar tamaño
          </button>
          <button type="button" onClick={handleReset} className="bg-slate-700 px-3 py-2 text-sm">
            Restablecer a Poker
          </button>
        </div>
      </form>
      {statusMessage ? <p className="mt-2 text-xs text-emerald-300">{statusMessage}</p> : null}
      {errorMessage ? <p className="mt-2 text-xs text-red-300">{errorMessage}</p> : null}
    </section>
  )
}

export default SettingsPanel
