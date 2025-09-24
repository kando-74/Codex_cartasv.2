import { ChangeEvent, useEffect, useMemo, useState } from 'react'
import { CARD_SIZE_OPTIONS, CUSTOM_CARD_SIZE_ID, createCardSizeFromPreset, findMatchingPresetId } from '../lib/cardSizes'
import { getDefaultCardSizeSetting } from '../lib/settings'
import type { Card, CardSizeSetting } from '../types'

export interface CardFormProps {
  card: Card
  onChange: (card: Card) => void
  onDelete?: () => void
  onUploadImage?: (file: File) => Promise<{ url: string; path: string }>
  onRevert?: () => void
  canRevert?: boolean
}

const CardForm = ({ card, onChange, onDelete, onUploadImage, onRevert, canRevert }: CardFormProps) => {
  const [iconsValue, setIconsValue] = useState(card.icons.join(', '))
  const [uploading, setUploading] = useState(false)

  const currentSize = useMemo<CardSizeSetting>(() => {
    return card.size ?? getDefaultCardSizeSetting()
  }, [card.size])

  const matchedPresetId = useMemo(() => {
    if (currentSize.presetId === CUSTOM_CARD_SIZE_ID) {
      return CUSTOM_CARD_SIZE_ID
    }
    if (currentSize.presetId && findMatchingPresetId(currentSize.width, currentSize.height) === currentSize.presetId) {
      return currentSize.presetId
    }
    return findMatchingPresetId(currentSize.width, currentSize.height) ?? CUSTOM_CARD_SIZE_ID
  }, [currentSize])

  const isCustomSize = matchedPresetId === CUSTOM_CARD_SIZE_ID

  useEffect(() => {
    setIconsValue(card.icons.join(', '))
  }, [card.icons])

  const handleFieldChange = (field: keyof Card) =>
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const value = event.target.value
      onChange({ ...card, [field]: value })
    }

  const handleIconsChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value
    setIconsValue(value)
    const icons = value
      .split(',')
      .map((token) => token.trim())
      .filter(Boolean)
    onChange({ ...card, icons })
  }

  const handleSizePresetChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const presetId = event.target.value
    if (presetId === CUSTOM_CARD_SIZE_ID) {
      onChange({
        ...card,
        size: {
          presetId: CUSTOM_CARD_SIZE_ID,
          width: currentSize.width,
          height: currentSize.height,
          unit: 'mm',
        },
      })
      return
    }

    const preset = createCardSizeFromPreset(presetId)
    onChange({
      ...card,
      size: preset,
    })
  }

  const handleCustomSizeChange = (dimension: 'width' | 'height') =>
    (event: ChangeEvent<HTMLInputElement>) => {
      const value = parseFloat(event.target.value)
      if (!Number.isFinite(value) || value <= 0) {
        return
      }
      const nextSize: CardSizeSetting = {
        presetId: CUSTOM_CARD_SIZE_ID,
        width: dimension === 'width' ? value : currentSize.width,
        height: dimension === 'height' ? value : currentSize.height,
        unit: 'mm',
      }
      onChange({ ...card, size: nextSize })
    }

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !onUploadImage) {
      return
    }
    setUploading(true)
    try {
      const result = await onUploadImage(file)
      onChange({ ...card, imageUrl: result.url, imagePath: result.path })
    } catch (error) {
      console.error('Error subiendo imagen', error)
    } finally {
      setUploading(false)
      event.target.value = ''
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-slate-700 bg-slate-800/40 p-3">
        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-slate-200">Tamaño de la carta</span>
          <label className="flex flex-col gap-1 text-sm text-slate-100">
            Formato
            <select value={matchedPresetId} onChange={handleSizePresetChange}>
              {CARD_SIZE_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name} — {option.width} × {option.height} mm
                </option>
              ))}
              <option value={CUSTOM_CARD_SIZE_ID}>Personalizado</option>
            </select>
          </label>
          {isCustomSize ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm text-slate-100">
                Ancho (mm)
                <input
                  type="number"
                  min={1}
                  step={0.1}
                  value={Number.isFinite(currentSize.width) ? currentSize.width : ''}
                  onChange={handleCustomSizeChange('width')}
                  placeholder="Ej. 63"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-slate-100">
                Alto (mm)
                <input
                  type="number"
                  min={1}
                  step={0.1}
                  value={Number.isFinite(currentSize.height) ? currentSize.height : ''}
                  onChange={handleCustomSizeChange('height')}
                  placeholder="Ej. 88"
                />
              </label>
            </div>
          ) : null}
          <p className="text-xs text-slate-400">
            Dimensiones actuales: {currentSize.width} × {currentSize.height} mm.
          </p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          Título
          <input value={card.title} onChange={handleFieldChange('title')} placeholder="Nombre de la carta" />
        </label>
        <label className="flex flex-col gap-1">
          Tipo
          <input value={card.type} onChange={handleFieldChange('type')} placeholder="Tipo o categoría" />
        </label>
        <label className="flex flex-col gap-1">
          Valor
          <input value={card.value} onChange={handleFieldChange('value')} placeholder="Poder, coste, etc." />
        </label>
        <label className="flex flex-col gap-1">
          Acción corta
          <input value={card.action} onChange={handleFieldChange('action')} placeholder="Resumen de la acción" />
        </label>
      </div>
      <label className="flex flex-col gap-1">
        Descripción de la acción
        <textarea
          value={card.actionDescription}
          onChange={handleFieldChange('actionDescription')}
          rows={3}
          placeholder="Detalle narrativo o reglas de la acción"
        />
      </label>
      <label className="flex flex-col gap-1">
        Contexto específico
        <textarea
          value={card.context}
          onChange={handleFieldChange('context')}
          rows={2}
          placeholder="Cómo encaja en la historia o escenario"
        />
      </label>
      <label className="flex flex-col gap-1">
        Descripción de imagen
        <textarea
          value={card.imageDescription}
          onChange={handleFieldChange('imageDescription')}
          rows={2}
          placeholder="Prompt visual recomendado"
        />
      </label>
      <label className="flex flex-col gap-1">
        Iconos (separados por coma)
        <input value={iconsValue} onChange={handleIconsChange} placeholder="espada, fuego, magia" />
      </label>
      <div className="flex flex-col gap-2">
        <span className="text-sm font-semibold text-slate-300">Imagen de la carta</span>
        {card.imageUrl ? (
          <img
            src={card.imageUrl}
            alt={card.title || 'Imagen de carta'}
            className="h-40 w-full rounded-lg object-cover"
          />
        ) : (
          <div className="flex h-40 w-full items-center justify-center rounded-lg border border-dashed border-slate-700 text-slate-500">
            Sin imagen
          </div>
        )}
        <label className="flex w-full flex-col gap-2 text-sm text-slate-200">
          <span>Subir imagen</span>
          <input type="file" accept="image/*" onChange={handleUpload} disabled={uploading} />
        </label>
        {uploading ? <p className="text-sm text-slate-400">Subiendo imagen...</p> : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {onDelete ? (
          <button type="button" onClick={onDelete} className="bg-red-600 hover:bg-red-700">
            Eliminar carta
          </button>
        ) : null}
        {onRevert ? (
          <button
            type="button"
            onClick={onRevert}
            disabled={!canRevert}
            className="bg-slate-700 px-3 py-2 text-sm text-white hover:bg-slate-600 disabled:opacity-50"
          >
            Revertir a versión previa
          </button>
        ) : null}
      </div>
    </div>
  )
}

export default CardForm
