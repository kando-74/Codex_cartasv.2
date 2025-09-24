import { useEffect, useMemo, useState } from 'react'
import CardPreview from './CardPreview'
import type { Card, PendingAiResult, AiHistoryEntry, GameContext } from '../types'

const FIELD_DEFINITIONS: Array<{ key: keyof Card; label: string; textarea?: boolean }> = [
  { key: 'title', label: 'Título' },
  { key: 'type', label: 'Tipo' },
  { key: 'value', label: 'Valor' },
  { key: 'action', label: 'Acción corta' },
  { key: 'actionDescription', label: 'Descripción de la acción', textarea: true },
  { key: 'context', label: 'Contexto', textarea: true },
  { key: 'imageDescription', label: 'Descripción de imagen', textarea: true },
]

interface AiPendingReviewProps {
  pending: PendingAiResult | null
  currentCard: Card | null
  onApply: (fields: Array<keyof Card>, overrides: Partial<Card>) => void
  onDiscard: () => void
  onFeedback: (feedback: 'like' | 'dislike') => void
  feedback?: 'like' | 'dislike'
  onContinueGeneration: (fields: Array<keyof Card>) => void
  history: AiHistoryEntry[]
  context: GameContext
}

const AiPendingReview = ({
  pending,
  currentCard,
  onApply,
  onDiscard,
  onFeedback,
  feedback,
  onContinueGeneration,
  history,
  context,
}: AiPendingReviewProps) => {
  const [selectedFields, setSelectedFields] = useState<Array<keyof Card>>([
    ...FIELD_DEFINITIONS.map((field) => field.key),
    'icons',
  ])

  const [draft, setDraft] = useState<Partial<Card>>({})

  const mergedCard = useMemo(() => {
    if (!currentCard) return null
    if (!pending) return currentCard
    return {
      ...currentCard,
      ...pending.completion,
      ...draft,
      icons: pending.completion.icons ?? currentCard.icons,
    }
  }, [currentCard, pending, draft])

  const handleToggleField = (key: keyof Card) => {
    setSelectedFields((prev) =>
      prev.includes(key) ? prev.filter((field) => field !== key) : [...prev, key],
    )
  }

  const handleFieldChange = (key: keyof Card, value: string | string[]) => {
    setDraft((prev) => ({ ...prev, [key]: value }))
  }

  useEffect(() => {
    setSelectedFields([...FIELD_DEFINITIONS.map((field) => field.key), 'icons'])
    setDraft({})
  }, [pending?.traceId, currentCard?.id])

  if (!pending || !currentCard) {
    return (
      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-300">
        <p>No hay resultados pendientes de revisión. Genera contenido con la IA para evaluar antes de aplicar.</p>
        {history.length ? (
          <ul className="mt-3 space-y-1 text-xs text-slate-500">
            {history.slice(0, 3).map((entry) => (
              <li key={entry.id}>
                {new Date(entry.createdAt).toLocaleTimeString()} · {entry.success ? '✅' : '❌'} {entry.promptType}
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    )
  }

  const effectiveDraft: Partial<Card> = { ...pending.completion, ...draft }

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-slate-800 bg-slate-900/70 p-4">
      <header className="flex flex-col gap-1 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Revisión asistida antes de aplicar</h2>
          <p className="text-sm text-slate-400">
            Valida los campos generados, aplica correcciones manuales y decide qué partes incorporar a la carta.
          </p>
        </div>
        <div className="text-xs text-slate-400">
          <p>Proveedor: {pending.provider ?? 'desconocido'}</p>
          <p>Calidad estimada: {pending.quality.score}/100</p>
          <p>Trace: {pending.traceId}</p>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <div className="flex flex-col gap-3">
          {FIELD_DEFINITIONS.map(({ key, label, textarea }) => {
            const value = (effectiveDraft[key] ?? currentCard[key]) as string
            const checked = selectedFields.includes(key)
            return (
              <label key={key} className="flex flex-col gap-1 text-sm text-slate-200">
                <div className="flex items-center justify-between">
                  <span>{label}</span>
                  <label className="flex items-center gap-1 text-xs text-slate-400">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => handleToggleField(key)}
                    />
                    Aplicar
                  </label>
                </div>
                {textarea ? (
                  <textarea
                    value={value ?? ''}
                    onChange={(event) => handleFieldChange(key, event.target.value)}
                    rows={3}
                    className="rounded border border-slate-700 bg-slate-800/80 p-2 text-sm"
                  />
                ) : (
                  <input
                    value={value ?? ''}
                    onChange={(event) => handleFieldChange(key, event.target.value)}
                    className="rounded border border-slate-700 bg-slate-800/80 p-2 text-sm"
                  />
                )}
              </label>
            )
          })}
          <label className="flex flex-col gap-1 text-sm text-slate-200">
            <div className="flex items-center justify-between">
              <span>Iconos</span>
              <label className="flex items-center gap-1 text-xs text-slate-400">
                <input
                  type="checkbox"
                  checked={selectedFields.includes('icons')}
                  onChange={() => handleToggleField('icons')}
                />
                Aplicar
              </label>
            </div>
            <input
              value={(effectiveDraft.icons ?? currentCard.icons).join(', ')}
              onChange={(event) => {
                const parsed = event.target.value
                  .split(',')
                  .map((token) => token.trim())
                  .filter(Boolean)
                handleFieldChange('icons', parsed)
              }}
              className="rounded border border-slate-700 bg-slate-800/80 p-2 text-sm"
            />
          </label>
        </div>
        <div className="flex flex-col gap-3">
          {mergedCard ? <CardPreview card={mergedCard} context={context} /> : null}
          <section className="rounded border border-slate-800 bg-slate-950/50 p-3 text-xs text-slate-300">
            <h3 className="text-sm font-semibold text-white">Validaciones y recomendaciones</h3>
            <ul className="mt-2 space-y-1">
              {pending.validation.issues.map((issue) => (
                <li key={`${issue.field}-${issue.message}`} className={issue.type === 'error' ? 'text-red-300' : 'text-amber-300'}>
                  {issue.field !== 'general' ? `${issue.field}: ` : ''}
                  {issue.message}
                  {issue.suggestion ? ` · ${issue.suggestion}` : ''}
                </li>
              ))}
              {!pending.validation.issues.length ? <li>No se detectaron problemas críticos.</li> : null}
            </ul>
            {pending.validation.suggestions.length ? (
              <div className="mt-2">
                <p className="font-semibold text-slate-200">Sugerencias</p>
                <ul className="list-disc space-y-1 pl-5 text-slate-400">
                  {pending.validation.suggestions.map((suggestion, index) => (
                    <li key={index}>{suggestion}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {pending.validation.businessRules.length ? (
              <div className="mt-2 text-slate-400">
                <p className="font-semibold text-slate-200">Reglas de negocio</p>
                <ul className="list-disc space-y-1 pl-5">
                  {pending.validation.businessRules.map((rule, index) => (
                    <li key={index}>{rule}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {pending.validation.appliedFilters.length ? (
              <p className="mt-2 text-slate-500">
                Filtros aplicados: {pending.validation.appliedFilters.join(', ')}
              </p>
            ) : null}
          </section>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        <button
          type="button"
          onClick={() => onApply(selectedFields, effectiveDraft)}
          className="bg-primary px-4 py-2 font-semibold text-white hover:bg-primary/80"
        >
          Aplicar selección
        </button>
        <button
          type="button"
          onClick={onDiscard}
          className="bg-slate-700 px-4 py-2 text-white hover:bg-slate-600"
        >
          Descartar resultado
        </button>
        <button
          type="button"
          onClick={() => onContinueGeneration(selectedFields)}
          className="bg-emerald-700 px-4 py-2 text-white hover:bg-emerald-600"
        >
          Regenerar campos seleccionados
        </button>
        <div className="ml-auto flex items-center gap-2 text-xs text-slate-300">
          <span>Feedback:</span>
          <button
            type="button"
            onClick={() => onFeedback('like')}
            className={`rounded px-2 py-1 ${feedback === 'like' ? 'bg-emerald-600 text-white' : 'bg-slate-800'}`}
          >
            Me gusta
          </button>
          <button
            type="button"
            onClick={() => onFeedback('dislike')}
            className={`rounded px-2 py-1 ${feedback === 'dislike' ? 'bg-red-600 text-white' : 'bg-slate-800'}`}
          >
            No me convence
          </button>
        </div>
      </div>
    </section>
  )
}

export default AiPendingReview
