import type {
  McpCommandContext,
  McpCommandResponse,
  McpSessionState,
} from '../types'

interface McpClientConfig {
  baseUrl?: string
  apiKey?: string
  workspaceId?: string
  clientId?: string
}

const defaultClientId = import.meta.env.VITE_MCP_CLIENT_ID?.trim() || 'cardforge-app'

const sanitizeBaseUrl = (url: string) => url.replace(/\/+$/, '')

const resolveConfig = (config: McpClientConfig) => {
  const baseUrl = (config.baseUrl ?? import.meta.env.VITE_MCP_GATEWAY_URL ?? '').trim()
  if (!baseUrl) {
    throw new Error(
      'Configura la variable VITE_MCP_GATEWAY_URL o especifica manualmente la URL del servicio MCP.',
    )
  }

  const apiKey = (config.apiKey ?? import.meta.env.VITE_MCP_API_KEY ?? '').trim()
  const workspaceId =
    (config.workspaceId ?? import.meta.env.VITE_MCP_WORKSPACE ?? 'cardforge').trim() || 'cardforge'
  const clientId = (config.clientId ?? defaultClientId).trim() || defaultClientId

  return {
    baseUrl: sanitizeBaseUrl(baseUrl),
    apiKey: apiKey.length > 0 ? apiKey : undefined,
    workspaceId,
    clientId,
  }
}

const buildHeaders = (apiKey?: string) => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`
  }
  return headers
}

const parseErrorPayload = async (response: Response): Promise<string> => {
  const contentType = response.headers.get('content-type') || ''
  try {
    if (contentType.includes('application/json')) {
      const payload = await response.json()
      if (payload && typeof payload === 'object') {
        const message =
          'error' in payload && typeof payload.error === 'string'
            ? payload.error
            : 'message' in payload && typeof payload.message === 'string'
              ? payload.message
              : undefined
        if (message) {
          return message
        }
      }
      return JSON.stringify(payload)
    }
    const text = await response.text()
    if (text.trim().length > 0) {
      return text
    }
  } catch (error) {
    console.warn('No se pudo interpretar la respuesta de error MCP', error)
  }
  return response.statusText
}

interface OpenSessionInput extends McpClientConfig {
  metadata?: Record<string, unknown>
}

export const openMcpSession = async (input: OpenSessionInput = {}): Promise<McpSessionState> => {
  const config = resolveConfig(input)
  const response = await fetch(`${config.baseUrl}/mcp/sessions`, {
    method: 'POST',
    headers: buildHeaders(config.apiKey),
    body: JSON.stringify({
      workspaceId: config.workspaceId,
      clientId: config.clientId,
      metadata: input.metadata ?? {},
    }),
  })

  if (!response.ok) {
    const message = await parseErrorPayload(response)
    throw new Error(`No se pudo iniciar la sesión MCP (${response.status}): ${message}`)
  }

  const data = (await response.json()) as Partial<McpSessionState>

  if (!data || typeof data.sessionId !== 'string' || data.sessionId.length === 0) {
    throw new Error('La API MCP no devolvió un identificador de sesión válido.')
  }

  return {
    sessionId: data.sessionId,
    workspaceId: data.workspaceId ?? config.workspaceId,
    connectedAt: data.connectedAt ?? Date.now(),
    expiresAt: data.expiresAt,
    availableTools: Array.isArray(data.availableTools) ? data.availableTools : [],
    capabilities: Array.isArray(data.capabilities) ? data.capabilities : undefined,
  }
}

interface CloseSessionInput extends McpClientConfig {
  sessionId: string
}

export const closeMcpSession = async (input: CloseSessionInput): Promise<void> => {
  if (!input.sessionId) {
    return
  }
  const config = resolveConfig(input)
  try {
    const response = await fetch(
      `${config.baseUrl}/mcp/sessions/${encodeURIComponent(input.sessionId)}`,
      {
        method: 'DELETE',
        headers: buildHeaders(config.apiKey),
      },
    )
    if (!response.ok && response.status !== 404) {
      const message = await parseErrorPayload(response)
      throw new Error(message)
    }
  } catch (error) {
    console.warn('No se pudo cerrar la sesión MCP correctamente.', error)
  }
}

const composeSignal = (signal?: AbortSignal, timeoutMs?: number) => {
  const controller = new AbortController()
  const upstream = signal
  const cleanup: Array<() => void> = []

  if (upstream) {
    if (upstream.aborted) {
      controller.abort(upstream.reason)
    } else {
      const onAbort = () => {
        controller.abort(upstream.reason)
      }
      upstream.addEventListener('abort', onAbort)
      cleanup.push(() => upstream.removeEventListener('abort', onAbort))
    }
  }

  let timeoutId: ReturnType<typeof setTimeout> | undefined
  if (timeoutMs && timeoutMs > 0) {
    timeoutId = setTimeout(() => {
      controller.abort(new DOMException('Timeout exceeded', 'TimeoutError'))
    }, timeoutMs)
    cleanup.push(() => {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId)
      }
    })
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      cleanup.forEach((fn) => {
        try {
          fn()
        } catch (error) {
          console.warn('Error limpiando controladores MCP', error)
        }
      })
    },
  }
}

interface SendCommandInput extends McpClientConfig {
  sessionId: string
  command: string
  context?: McpCommandContext | Record<string, unknown>
  metadata?: Record<string, unknown>
  signal?: AbortSignal
  timeoutMs?: number
}

export const sendMcpCommand = async (input: SendCommandInput): Promise<McpCommandResponse> => {
  if (!input.sessionId) {
    throw new Error('No hay sesión MCP activa. Conecta antes de enviar comandos.')
  }
  const config = resolveConfig(input)
  const { signal, cleanup } = composeSignal(input.signal, input.timeoutMs)

  try {
    const response = await fetch(`${config.baseUrl}/mcp/commands`, {
      method: 'POST',
      headers: buildHeaders(config.apiKey),
      body: JSON.stringify({
        sessionId: input.sessionId,
        command: input.command,
        workspaceId: config.workspaceId,
        metadata: input.metadata ?? {},
        context: input.context ?? null,
      }),
      signal,
    })

    if (!response.ok) {
      const message = await parseErrorPayload(response)
      throw new Error(`Fallo al ejecutar el comando MCP (${response.status}): ${message}`)
    }

    const payload = (await response.json()) as Partial<McpCommandResponse>
    const operations = Array.isArray(payload.operations) ? payload.operations : []

    return {
      message: typeof payload.message === 'string' ? payload.message : undefined,
      operations,
      toolCalls: Array.isArray(payload.toolCalls) ? payload.toolCalls : undefined,
      debug: payload.debug && typeof payload.debug === 'object' ? payload.debug : undefined,
      warnings: Array.isArray(payload.warnings) ? payload.warnings : undefined,
      state: payload.state && typeof payload.state === 'object' ? payload.state : undefined,
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('La solicitud MCP fue cancelada o excedió el tiempo de espera.')
    }
    throw error
  } finally {
    cleanup()
  }
}
