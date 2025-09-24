import { FormEvent } from 'react'
import {
  useAiLogs,
  useAiMetrics,
  useAiStatus,
  usePromptRepository,
} from '../lib/ai'
import type { AiPromptTemplate, AiHistoryEntry } from '../types'

interface AiControlPanelProps {
  promptDraft: string
  onPromptChange: (value: string) => void
  onGenerateText: () => void
  onGenerateImage: () => void
  onCancel: () => void
  onManualRetry: () => void
  isGeneratingText: boolean
  isGeneratingImage: boolean
  hasOngoingRequest: boolean
  safeMode: boolean
  onSafeModeChange: (value: boolean) => void
  offlineMode: boolean
  onOfflineModeChange: (value: boolean) => void
  temperature: number
  onTemperatureChange: (value: number) => void
  tokenEstimate: number
  quotaHint: string
  promptTemplates: AiPromptTemplate[]
  selectedTemplateId?: string
  onSelectTemplate: (id: string) => void
  recommendedPrompts: string[]
  hasPendingReview: boolean
  onApplyTemplatePrompt: (prompt: string) => void
  history: AiHistoryEntry[]
  priority: 'low' | 'normal' | 'high'
  onPriorityChange: (value: 'low' | 'normal' | 'high') => void
  providerOptions: string[]
  providerHint?: string
  onProviderHintChange: (value: string | undefined) => void
  variant: 'A' | 'B'
  onVariantChange: (variant: 'A' | 'B') => void
}

const AiControlPanel = ({
  promptDraft,
  onPromptChange,
  onGenerateText,
  onGenerateImage,
  onCancel,
  onManualRetry,
  isGeneratingText,
  isGeneratingImage,
  hasOngoingRequest,
  safeMode,
  onSafeModeChange,
  offlineMode,
  onOfflineModeChange,
  temperature,
  onTemperatureChange,
  tokenEstimate,
  quotaHint,
  promptTemplates,
  selectedTemplateId,
  onSelectTemplate,
  recommendedPrompts,
  hasPendingReview,
  onApplyTemplatePrompt,
  history,
  priority,
  onPriorityChange,
  providerOptions,
  providerHint,
  onProviderHintChange,
  variant,
  onVariantChange,
}: AiControlPanelProps) => {
  const metrics = useAiMetrics()
  const status = useAiStatus()
  const logs = useAiLogs()
  const promptRepository = usePromptRepository()

  const latestError = logs.find((entry) => entry.level === 'error')

  const handleTemplateChange = (event: FormEvent<HTMLSelectElement>) => {
    const value = event.currentTarget.value
    onSelectTemplate(value)
    const template = promptTemplates.find((item) => item.id === value)
    if (template) {
      onApplyTemplatePrompt(template.prompt)
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-slate-800 bg-slate-900/70 p-4">
      <header className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Asistente creativo de IA</h2>
          <p className="text-sm text-slate-400">
            Ajusta el prompt base, monitorea el estado del servicio y lanza generaciones controladas.
          </p>
        </div>
        <div className="text-xs text-slate-400">
          <p>
            Estado: <span className="font-semibold text-emerald-400">{status.availability}</span> ·{' '}
            proveedor activo: {status.provider}
          </p>
          <p>Latencia media: {status.latencyMs ? `${status.latencyMs} ms` : 'sin datos'}</p>
        </div>
      </header>

      <div className="grid gap-3 md:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-2 text-sm">
            Prompt base editable
            <textarea
              value={promptDraft}
              onChange={(event) => onPromptChange(event.target.value)}
              rows={6}
              className="rounded border border-slate-700 bg-slate-800/80 p-2 text-sm text-slate-200"
            />
          </label>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
            <span className="rounded-full bg-slate-800 px-2 py-1">≈ {tokenEstimate} tokens</span>
            <span className="rounded-full bg-slate-800 px-2 py-1">{quotaHint}</span>
            {hasPendingReview ? (
              <span className="rounded-full bg-amber-600/30 px-2 py-1 text-amber-300">
                Revisión pendiente antes de guardar
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Plantilla guía
            <select value={selectedTemplateId} onChange={handleTemplateChange} className="rounded border border-slate-700 bg-slate-800/80 p-2 text-sm">
              <option value="">Sin plantilla</option>
              {promptTemplates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Prioridad de la solicitud
            <select
              value={priority}
              onChange={(event) => onPriorityChange(event.target.value as 'low' | 'normal' | 'high')}
              className="rounded border border-slate-700 bg-slate-800/80 p-2 text-sm"
            >
              <option value="low">Baja (experimentación)</option>
              <option value="normal">Normal</option>
              <option value="high">Alta (usuarios premium)</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Variante de prompt (A/B)
            <select
              value={variant}
              onChange={(event) => onVariantChange(event.target.value as 'A' | 'B')}
              className="rounded border border-slate-700 bg-slate-800/80 p-2 text-sm"
            >
              <option value="A">Variante A (baseline)</option>
              <option value="B">Variante B (experimental)</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Proveedor preferido
            <select
              value={providerHint ?? ''}
              onChange={(event) =>
                onProviderHintChange(event.target.value ? event.target.value : undefined)
              }
              className="rounded border border-slate-700 bg-slate-800/80 p-2 text-sm"
            >
              <option value="">Automático</option>
              {providerOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Temperatura
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={temperature}
              onChange={(event) => onTemperatureChange(Number.parseFloat(event.target.value))}
            />
            <span className="text-xs text-slate-400">
              {temperature < 0.5 ? 'Resultados conservadores' : 'Exploración creativa'}
            </span>
          </label>
          <div className="flex flex-wrap gap-2 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={safeMode}
                onChange={(event) => onSafeModeChange(event.target.checked)}
              />
              Modo seguro (ajustes mínimos)
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={offlineMode}
                onChange={(event) => onOfflineModeChange(event.target.checked)}
              />
              Modo offline (sin IA)
            </label>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onGenerateText}
          disabled={offlineMode || isGeneratingText}
          className="bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {isGeneratingText ? 'Generando texto...' : 'Generar texto con IA'}
        </button>
        <button
          type="button"
          onClick={onGenerateImage}
          disabled={offlineMode || isGeneratingImage}
          className="bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {isGeneratingImage ? 'Generando imagen...' : 'Generar imagen con IA'}
        </button>
        <button
          type="button"
          onClick={onManualRetry}
          disabled={offlineMode || hasOngoingRequest}
          className="bg-slate-700 px-4 py-2 text-sm text-white hover:bg-slate-600 disabled:opacity-60"
        >
          Reintentar manualmente
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={!hasOngoingRequest}
          className="bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-60"
        >
          Cancelar generación
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="flex flex-col gap-2 rounded border border-slate-800 bg-slate-950/40 p-3 text-sm">
          <h3 className="text-sm font-semibold text-white">Métricas por tipo de prompt</h3>
          <ul className="space-y-1 text-xs text-slate-300">
            {Object.entries(metrics.byPromptType).map(([key, value]) => (
              <li key={key} className="flex justify-between">
                <span>{key}</span>
                <span>
                  ✅ {value.successes} · ❌ {value.failures} · {value.averageLatencyMs || 0} ms
                </span>
              </li>
            ))}
            {!Object.keys(metrics.byPromptType).length ? (
              <li>No hay métricas registradas todavía.</li>
            ) : null}
          </ul>
          <p className="text-xs text-slate-400">
            Tasa de error reciente: {(metrics.rollingErrorRate * 100).toFixed(1)}%
          </p>
        </section>
        <section className="flex flex-col gap-2 rounded border border-slate-800 bg-slate-950/40 p-3 text-sm">
          <h3 className="text-sm font-semibold text-white">Prompts reutilizables</h3>
          <div className="flex flex-wrap gap-2">
            {recommendedPrompts.map((recommendation) => (
              <button
                key={recommendation}
                type="button"
                onClick={() => onApplyTemplatePrompt(recommendation)}
                className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:border-primary"
              >
                {recommendation}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-2 text-xs text-slate-300">
            {promptRepository.slice(0, 3).map((record) => (
              <button
                key={record.id}
                type="button"
                onClick={() => onApplyTemplatePrompt(record.prompt)}
                className="rounded border border-slate-800 bg-slate-900/70 p-2 text-left hover:border-primary"
              >
                <p className="font-semibold text-slate-100">{record.promptType}</p>
                <p className="line-clamp-2 text-xs text-slate-300">{record.prompt}</p>
                <p className="text-xs text-slate-500">
                  Éxitos: {record.successCount} · Fallos: {record.failureCount}
                </p>
              </button>
            ))}
            {!promptRepository.length ? <p>No hay historial documentado todavía.</p> : null}
          </div>
        </section>
      </div>

      <section className="rounded border border-slate-800 bg-slate-950/50 p-3 text-xs text-slate-300">
        <h3 className="mb-2 text-sm font-semibold text-white">Historial reciente</h3>
        <ul className="space-y-1">
          {history.slice(0, 5).map((entry) => (
            <li key={entry.id} className="flex flex-col gap-0.5">
              <span className="font-semibold text-slate-200">
                {new Date(entry.createdAt).toLocaleTimeString()} · {entry.success ? '✅' : '❌'} · {entry.promptType}
              </span>
              <span className="text-slate-400 line-clamp-2">{entry.prompt}</span>
              {entry.error ? <span className="text-red-400">{entry.error}</span> : null}
            </li>
          ))}
          {!history.length ? <li>No hay ejecuciones registradas.</li> : null}
        </ul>
      </section>

      {latestError ? (
        <div className="rounded border border-red-600/40 bg-red-900/20 p-3 text-xs text-red-200">
          <p className="font-semibold">Último error reportado</p>
          <p>{latestError.message}</p>
        </div>
      ) : null}

      <footer className="text-xs text-slate-400">
        <p>
          Consejo: si la disponibilidad baja, activa el modo seguro o reduce la temperatura. Consulta la documentación contextual
          para interpretar los errores más comunes.
        </p>
      </footer>
    </section>
  )
}

export default AiControlPanel
