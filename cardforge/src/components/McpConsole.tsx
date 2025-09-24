import { FormEvent, useCallback, useMemo, useState } from 'react'
import { loadMcpPreferences, saveMcpPreferences } from '../lib/mcp'
import { closeMcpSession, openMcpSession, sendMcpCommand } from '../services/mcp'
import type {
  McpCommandContext,
  McpCommandLogEntry,
  McpCommandResponse,
  McpSessionState,
  TemplateCommandOperation,
} from '../types'
import { useErrorToasts } from './ErrorToastContext'

interface McpConsoleProps {
  disabled?: boolean
  context?: McpCommandContext | null
  suggestions?: string[]
  onOperations?: (
    operations: TemplateCommandOperation[],
    meta: { response: McpCommandResponse; autoApply: boolean; logId: string },
  ) => boolean | void
}

const MAX_HISTORY = 20

const defaultSuggestions: string[] = [
  'Distribuye títulos y subtítulos para un formato vertical de 63×88 mm.',
  'Añade un contenedor para la ilustración principal ocupando la mitad superior.',
  'Reordena los elementos para priorizar el coste en la esquina superior derecha.',
  'Crea un estilo alternativo con fondo oscuro y contadores resaltados.',
]

const formatTime = (timestamp: number) => new Date(timestamp).toLocaleTimeString()

const getStatusLabel = (session: McpSessionState | null, disabled?: boolean) => {
  if (disabled) {
    return 'Deshabilitado en modo de solo lectura'
  }
  if (!session) {
    return 'Sin conexión'
  }
  const elapsedMinutes = Math.round((Date.now() - session.connectedAt) / 60000)
  return elapsedMinutes > 0
    ? `Conectado · ${elapsedMinutes} min activos`
    : 'Conectado recientemente'
}

const McpConsole = ({ disabled, context, suggestions, onOperations }: McpConsoleProps) => {
  const { showError, showInfo } = useErrorToasts()
  const [preferences, setPreferences] = useState(() => loadMcpPreferences())
  const [session, setSession] = useState<McpSessionState | null>(null)
  const [history, setHistory] = useState<McpCommandLogEntry[]>([])
  const [commandDraft, setCommandDraft] = useState('')
  const [isConnecting, setIsConnecting] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [lastError, setLastError] = useState<string | null>(null)

  const availableSuggestions = useMemo(() => {
    if (suggestions && suggestions.length > 0) {
      return suggestions
    }
    return defaultSuggestions
  }, [suggestions])

  const updatePreferences = useCallback((changes: Partial<typeof preferences>) => {
    setPreferences((current) => {
      const next = { ...current, ...changes }
      saveMcpPreferences(next)
      return next
    })
  }, [])

  const handleConnect = useCallback(async () => {
    if (disabled || isConnecting) {
      return
    }
    setIsConnecting(true)
    setLastError(null)
    try {
      const nextSession = await openMcpSession({
        baseUrl: preferences.baseUrl,
        apiKey: preferences.apiKey,
        workspaceId: preferences.workspaceId,
      })
      setSession(nextSession)
      showInfo(`Sesión MCP iniciada en «${nextSession.workspaceId ?? 'por defecto'}».`)
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'No se pudo iniciar la sesión con el controlador MCP.'
      setLastError(message)
      showError(message)
    } finally {
      setIsConnecting(false)
    }
  }, [disabled, isConnecting, preferences.baseUrl, preferences.apiKey, preferences.workspaceId, showError, showInfo])

  const handleDisconnect = useCallback(async () => {
    if (!session) {
      return
    }
    setIsConnecting(true)
    try {
      await closeMcpSession({
        baseUrl: preferences.baseUrl,
        apiKey: preferences.apiKey,
        workspaceId: preferences.workspaceId,
        sessionId: session.sessionId,
      })
    } catch (error) {
      console.warn('Fallo cerrando sesión MCP', error)
    } finally {
      setSession(null)
      setIsConnecting(false)
      showInfo('Sesión MCP finalizada.')
    }
  }, [preferences.baseUrl, preferences.apiKey, preferences.workspaceId, session, showInfo])

  const appendHistory = useCallback((entry: McpCommandLogEntry) => {
    setHistory((current) => {
      const next = [entry, ...current]
      if (next.length > MAX_HISTORY) {
        return next.slice(0, MAX_HISTORY)
      }
      return next
    })
  }, [])

  const updateHistoryEntry = useCallback(
    (entryId: string, changes: Partial<McpCommandLogEntry>) => {
      setHistory((current) =>
        current.map((entry) =>
          entry.id === entryId
            ? { ...entry, ...changes }
            : entry,
        ),
      )
    },
    [],
  )

  const handleSendCommand = useCallback(async () => {
    if (disabled) {
      return
    }
    const trimmed = commandDraft.trim()
    if (!trimmed) {
      return
    }
    if (!session) {
      showError('Conecta primero con el servidor MCP antes de enviar instrucciones.')
      return
    }

    const entryId = `mcp_${Date.now()}`
    const createdAt = Date.now()
    appendHistory({
      id: entryId,
      prompt: trimmed,
      status: 'pending',
      createdAt,
    })
    setCommandDraft('')
    setIsSending(true)
    setLastError(null)

    const start = performance.now()

    try {
      const response = await sendMcpCommand({
        baseUrl: preferences.baseUrl,
        apiKey: preferences.apiKey,
        workspaceId: preferences.workspaceId,
        sessionId: session.sessionId,
        command: trimmed,
        context: preferences.sendTemplateContext ? context ?? undefined : undefined,
        timeoutMs: 45_000,
      })

      const duration = Math.round(performance.now() - start)
      updateHistoryEntry(entryId, {
        status: 'success',
        durationMs: duration,
        response,
        applied: false,
      })

      if (response.state) {
        setSession((currentSession) =>
          currentSession
            ? {
                ...currentSession,
                ...response.state,
                availableTools:
                  Array.isArray(response.state.availableTools) && response.state.availableTools.length
                    ? (response.state.availableTools as McpSessionState['availableTools'])
                    : currentSession.availableTools,
              }
            : currentSession,
        )
      }

      if (response.operations?.length && onOperations) {
        const applied = onOperations(response.operations, {
          response,
          autoApply: preferences.autoApplyOperations,
          logId: entryId,
        })
        updateHistoryEntry(entryId, { applied: Boolean(applied) && preferences.autoApplyOperations })
        if (!preferences.autoApplyOperations) {
          showInfo('Revisa el historial MCP para aplicar las operaciones sugeridas.')
        }
      } else if (!response.operations?.length && response.message) {
        showInfo(response.message)
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'No se pudo completar la solicitud con el MCP.'
      setLastError(message)
      updateHistoryEntry(entryId, {
        status: 'error',
        durationMs: Math.round(performance.now() - start),
        error: message,
      })
      showError(message)
    } finally {
      setIsSending(false)
    }
  }, [
    appendHistory,
    commandDraft,
    context,
    disabled,
    onOperations,
    preferences.autoApplyOperations,
    preferences.apiKey,
    preferences.baseUrl,
    preferences.sendTemplateContext,
    preferences.workspaceId,
    session,
    showError,
    showInfo,
    updateHistoryEntry,
  ])

  const handleApplyFromHistory = useCallback(
    (entryId: string) => {
      if (!onOperations || disabled) {
        return
      }
      const entry = history.find((item) => item.id === entryId)
      if (!entry?.response?.operations?.length) {
        return
      }
      const applied = onOperations(entry.response.operations, {
        response: entry.response,
        autoApply: true,
        logId: entryId,
      })
      if (applied) {
        updateHistoryEntry(entryId, { applied: true })
      }
    },
    [disabled, history, onOperations, updateHistoryEntry],
  )

  const statusLabel = useMemo(() => getStatusLabel(session, disabled), [session, disabled])

  const handlePromptKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault()
      void handleSendCommand()
    }
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    void handleSendCommand()
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h3 className="text-base font-semibold text-slate-100">Interfaz MCP / LLM</h3>
          <p className="text-xs text-slate-400">
            Controla el editor mediante comandos naturales compatibles con el protocolo MCP.
          </p>
        </div>
        <div className="text-xs text-slate-400">
          <p>{statusLabel}</p>
          {session ? (
            <p>Sesión: {session.sessionId.slice(0, 12)}…</p>
          ) : null}
        </div>
      </header>

      <section className="grid gap-3 rounded-xl border border-slate-800 bg-slate-900/70 p-4 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs">
          URL del gateway MCP
          <input
            type="url"
            value={preferences.baseUrl}
            onChange={(event) => updatePreferences({ baseUrl: event.target.value })}
            placeholder="https://tu-gateway-mcp.example.com"
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm disabled:opacity-60"
            disabled={isConnecting || disabled}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          Identificador de workspace
          <input
            type="text"
            value={preferences.workspaceId}
            onChange={(event) => updatePreferences({ workspaceId: event.target.value })}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm disabled:opacity-60"
            placeholder="cardforge"
            disabled={isConnecting || disabled}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs md:col-span-2">
          Token de acceso (opcional)
          <input
            type="password"
            value={preferences.apiKey ?? ''}
            onChange={(event) => updatePreferences({ apiKey: event.target.value })}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm disabled:opacity-60"
            placeholder="Bearer token"
            disabled={isConnecting || disabled}
          />
        </label>
        <div className="flex flex-wrap gap-4 text-xs text-slate-300 md:col-span-2">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={preferences.autoApplyOperations}
              onChange={(event) => updatePreferences({ autoApplyOperations: event.target.checked })}
              disabled={disabled}
            />
            Aplicar cambios automáticamente
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={preferences.sendTemplateContext}
              onChange={(event) => updatePreferences({ sendTemplateContext: event.target.checked })}
              disabled={disabled}
            />
            Incluir resumen del lienzo en cada comando
          </label>
        </div>
        <div className="flex flex-wrap gap-2 md:col-span-2">
          <button
            type="button"
            onClick={() => void handleConnect()}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            disabled={disabled || isConnecting}
          >
            {session ? 'Reconectar' : isConnecting ? 'Conectando…' : 'Conectar'}
          </button>
          <button
            type="button"
            onClick={() => void handleDisconnect()}
            className="rounded-lg bg-slate-800 px-4 py-2 text-sm text-slate-100 disabled:opacity-60"
            disabled={!session || disabled || isConnecting}
          >
            Desconectar
          </button>
        </div>
      </section>

      {lastError ? (
        <div className="rounded-lg border border-red-600/40 bg-red-900/20 p-3 text-xs text-red-200">
          {lastError}
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-2 text-sm">
          Comando natural
          <textarea
            rows={4}
            value={commandDraft}
            onChange={(event) => setCommandDraft(event.target.value)}
            onKeyDown={handlePromptKeyDown}
            placeholder="Ej. Crea una variante centrada para cartas de personaje con retrato circular."
            className="rounded-lg border border-slate-800 bg-slate-900/80 p-3 text-sm text-slate-100 disabled:opacity-60"
            disabled={disabled}
          />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            disabled={disabled || isSending || !commandDraft.trim()}
          >
            {isSending ? 'Enviando…' : 'Enviar comando'}
          </button>
          <span className="text-xs text-slate-400">Usa ⌘⏎ o Ctrl⏎ para enviar rápidamente.</span>
        </div>
      </form>

      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <h4 className="text-sm font-semibold text-slate-200">Sugerencias rápidas</h4>
        <div className="mt-3 flex flex-wrap gap-2">
          {availableSuggestions.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setCommandDraft((current) => (current ? `${current}\n${item}` : item))}
              className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-200 hover:border-primary disabled:opacity-60"
              disabled={disabled}
            >
              {item}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
        <header className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h4 className="text-sm font-semibold text-slate-200">Historial de órdenes</h4>
            <p className="text-xs text-slate-400">Registra resultados, advertencias y operaciones sugeridas.</p>
          </div>
          <span className="text-xs text-slate-500">
            {history.length ? `${history.length} entradas recientes` : 'Sin registros todavía'}
          </span>
        </header>
        <ul className="mt-3 flex flex-col gap-3 text-xs text-slate-300">
          {history.map((entry) => {
            const statusColor =
              entry.status === 'success'
                ? 'text-emerald-300'
                : entry.status === 'error'
                  ? 'text-red-300'
                  : 'text-slate-400'
            const operationsCount = entry.response?.operations?.length ?? 0
            return (
              <li key={entry.id} className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-col gap-0.5">
                    <span className="font-semibold text-slate-100">{formatTime(entry.createdAt)}</span>
                    <span className={`font-medium ${statusColor}`}>
                      {entry.status === 'success'
                        ? 'Completado'
                        : entry.status === 'error'
                          ? 'Error'
                          : 'En cola'}
                      {entry.durationMs ? ` · ${entry.durationMs} ms` : ''}
                    </span>
                  </div>
                  {operationsCount > 0 ? (
                    <span className="text-[11px] uppercase tracking-wide text-slate-500">
                      {operationsCount} operación{operationsCount === 1 ? '' : 'es'} propuestas
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 whitespace-pre-wrap text-slate-300">{entry.prompt}</p>
                {entry.response?.message ? (
                  <p className="mt-2 text-slate-400">{entry.response.message}</p>
                ) : null}
                {entry.response?.warnings?.length ? (
                  <ul className="mt-2 space-y-1">
                    {entry.response.warnings.map((warning) => (
                      <li key={warning} className="rounded border border-amber-500/30 bg-amber-500/10 p-2 text-amber-200">
                        ⚠️ {warning}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {entry.response?.toolCalls?.length ? (
                  <div className="mt-2 space-y-1">
                    {entry.response.toolCalls.map((toolCall, index) => (
                      <div key={`${toolCall.tool}-${index}`} className="rounded border border-slate-700/60 bg-slate-900/80 p-2">
                        <p className="font-medium text-slate-200">Herramienta: {toolCall.tool}</p>
                        {toolCall.arguments ? (
                          <pre className="mt-1 overflow-x-auto rounded bg-slate-950/60 p-2 text-[11px] text-slate-400">
                            {JSON.stringify(toolCall.arguments, null, 2)}
                          </pre>
                        ) : null}
                        {toolCall.result ? (
                          <pre className="mt-1 overflow-x-auto rounded bg-slate-950/40 p-2 text-[11px] text-slate-400">
                            {JSON.stringify(toolCall.result, null, 2)}
                          </pre>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}
                {entry.error ? (
                  <p className="mt-2 rounded border border-red-600/40 bg-red-900/20 p-2 text-red-200">{entry.error}</p>
                ) : null}
                {operationsCount > 0 && !entry.applied && !disabled ? (
                  <button
                    type="button"
                    onClick={() => handleApplyFromHistory(entry.id)}
                    className="mt-3 rounded border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/20"
                  >
                    Aplicar cambios sugeridos
                  </button>
                ) : null}
              </li>
            )
          })}
        </ul>
      </section>

      {session?.availableTools?.length ? (
        <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
          <h4 className="text-sm font-semibold text-slate-200">Herramientas disponibles</h4>
          <ul className="mt-2 space-y-2 text-xs text-slate-300">
            {session.availableTools.map((tool) => (
              <li key={tool.name} className="rounded border border-slate-800 bg-slate-900/60 p-2">
                <p className="font-medium text-slate-100">{tool.name}</p>
                {tool.description ? <p className="text-slate-400">{tool.description}</p> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}

export default McpConsole
