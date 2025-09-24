import {
  buildCacheKey,
  clearExpiredCache,
  getCachedResponse,
  logAiEvent,
  markProviderAvailability,
  recordAiAttempt,
  recordPromptUsage,
  setCachedResponse,
  shouldTriggerAiAlert,
} from '../lib/ai'
import type {
  AiErrorKind,
  AiProviderConfig,
  AiRequestMetadata,
  JSONSchema,
} from '../types'

const fallbackBaseUrl = import.meta.env.VITE_AI_BASE_URL
const fallbackApiKey = import.meta.env.VITE_AI_API_KEY
const fallbackModel = import.meta.env.VITE_AI_MODEL ?? 'qwen-plus'
const fallbackImageModel = import.meta.env.VITE_AI_IMAGE_MODEL ?? 'wanx-v1'
const fallbackImageSize = import.meta.env.VITE_AI_IMAGE_SIZE ?? '1024x1024'
const providersEnv = import.meta.env.VITE_AI_PROVIDERS

const DEFAULT_JSON_TIMEOUT = 35_000
const DEFAULT_IMAGE_TIMEOUT = 50_000

const parseProviders = (): AiProviderConfig[] => {
  if (providersEnv) {
    try {
      const parsed = JSON.parse(providersEnv) as AiProviderConfig[]
      if (Array.isArray(parsed) && parsed.length) {
        return parsed
      }
    } catch (error) {
      logAiEvent('warn', 'No se pudo parsear VITE_AI_PROVIDERS, se usará el proveedor por defecto.', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  if (fallbackBaseUrl && fallbackApiKey) {
    return [
      {
        name: 'principal',
        baseUrl: fallbackBaseUrl,
        apiKey: fallbackApiKey,
        model: fallbackModel,
        imageModel: fallbackImageModel,
        imageSize: fallbackImageSize,
        priority: 1,
        maxRetries: 3,
        retryDelayMs: 600,
        retryBackoffMultiplier: 2,
        maxRetryDelayMs: 15_000,
        retryJitterRatio: 0.25,
      },
    ]
  }
  return []
}

const providers = parseProviders().sort((a, b) => (a.priority ?? 1) - (b.priority ?? 1))

const waitForBackoff = (delayMs: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (delayMs <= 0) {
      resolve()
      return
    }

    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'))
      return
    }

    let timeoutId: ReturnType<typeof setTimeout> | undefined

    const onAbort = () => {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId)
        timeoutId = undefined
      }
      if (signal) {
        signal.removeEventListener('abort', onAbort)
      }
      reject(new DOMException('Aborted', 'AbortError'))
    }

    timeoutId = setTimeout(() => {
      if (signal) {
        signal.removeEventListener('abort', onAbort)
      }
      timeoutId = undefined
      resolve()
    }, delayMs)

    if (signal) {
      signal.addEventListener('abort', onAbort)
    }
  })

const computeBackoffDelay = (attempt: number, provider: AiProviderConfig): number => {
  const baseDelay = provider.retryDelayMs ?? 600
  const multiplier = provider.retryBackoffMultiplier ?? 2
  const maxDelay = provider.maxRetryDelayMs ?? 15_000
  const jitterRatio = provider.retryJitterRatio ?? 0.25
  const exponential = baseDelay * Math.max(1, multiplier) ** Math.max(0, attempt - 1)
  const jitter = exponential * Math.max(0, jitterRatio)
  const delayWithJitter = exponential + Math.random() * jitter
  return Math.min(delayWithJitter, maxDelay)
}

const sanitizeBaseUrl = (url: string) => url.replace(/\/$/, '')

const createHeaders = (provider: AiProviderConfig, traceId: string) => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${provider.apiKey}`,
  'X-Trace-Id': traceId,
})

const createUrl = (provider: AiProviderConfig, path: string) =>
  `${sanitizeBaseUrl(provider.baseUrl)}${path}`

const createTraceId = () =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `trace_${Date.now()}`)

export interface AiBaseOptions {
  systemPrompt?: string
  basePromptOverride?: string
  signal?: AbortSignal
  timeoutMs?: number
  temperature?: number
  topP?: number
  providerHint?: string
  promptMetadata?: AiRequestMetadata
  allowCache?: boolean
  safeMode?: boolean
  promptTemplateId?: string
}

export interface GenerateJSONOptions extends AiBaseOptions {
  promptTemplate?: string
}

export interface GenerateImageOptions extends AiBaseOptions {
  sizeOverride?: string
}

type MessageContentItem = {
  type?: string
  text?: string
  value?: string
  data?: unknown
}

class AIError extends Error {
  kind: AiErrorKind
  provider?: string
  status?: number
  retriable: boolean
  metadata?: AiRequestMetadata

  constructor(message: string, kind: AiErrorKind, options: {
    provider?: string
    status?: number
    retriable?: boolean
    cause?: unknown
    metadata?: AiRequestMetadata
  } = {}) {
    super(message)
    this.name = 'AIError'
    this.kind = kind
    this.provider = options.provider
    this.status = options.status
    this.retriable = options.retriable ?? false
    this.metadata = options.metadata
    if (options.cause) {
      this.cause = options.cause
    }
  }
}

const classifyStatus = (status: number): AiErrorKind => {
  if (status === 401 || status === 403) return 'auth'
  if (status === 408 || status === 504) return 'timeout'
  if (status === 429) return 'quota'
  if (status >= 500) return 'network'
  return 'unknown'
}

const composeSignal = (signal?: AbortSignal, timeoutMs?: number) => {
  const controller = new AbortController()
  const upstream = signal
  const cleanup: Array<() => void> = []

  if (upstream) {
    if (upstream.aborted) {
      controller.abort(upstream.reason)
    } else {
      const onAbort = () => controller.abort(upstream.reason)
      upstream.addEventListener('abort', onAbort)
      cleanup.push(() => upstream.removeEventListener('abort', onAbort))
    }
  }

  let timeoutId: ReturnType<typeof setTimeout> | undefined
  if (timeoutMs) {
    timeoutId = setTimeout(() => {
      controller.abort(new DOMException('timeout', 'AbortError'))
    }, timeoutMs)
    cleanup.push(() => {
      if (timeoutId) clearTimeout(timeoutId)
    })
  }

  const clear = () => {
    cleanup.forEach((fn) => fn())
    cleanup.length = 0
  }

  return { signal: controller.signal, cleanup: clear }
}

interface RequestExecutor<T> {
  (
    provider: AiProviderConfig,
    composedSignal: AbortSignal,
    attempt: number,
    traceId: string,
  ): Promise<T>
}

interface PerformRequestOptions<T> {
  promptType: string
  executor: RequestExecutor<T>
  metadata: AiRequestMetadata
  timeoutMs: number
  allowCache: boolean
  signal?: AbortSignal
  buildCacheKey?: (provider: AiProviderConfig) => string
  onSuccess?: (provider: AiProviderConfig, data: T) => void
  onFailure?: (error: AIError) => void
  providerHint?: string
}

const performRequestWithFailover = async <T>({
  promptType,
  executor,
  metadata,
  timeoutMs,
  allowCache,
  signal,
  buildCacheKey,
  onSuccess,
  onFailure,
  providerHint,
}: PerformRequestOptions<T>): Promise<{ data: T; provider: AiProviderConfig }> => {
  if (!providers.length) {
    throw new AIError(
      'No se ha configurado ningún proveedor de IA. Revisa las variables VITE_AI_*.',
      'unknown',
    )
  }

  clearExpiredCache()
  const providerOrder = providers.slice().sort((a, b) => (a.priority ?? 1) - (b.priority ?? 1))

  if (providerHint) {
    const hintedIndex = providerOrder.findIndex(
      (provider) => provider.name.toLowerCase() === providerHint.toLowerCase(),
    )
    if (hintedIndex > 0) {
      const [preferred] = providerOrder.splice(hintedIndex, 1)
      providerOrder.unshift(preferred)
      logAiEvent('info', 'Se priorizó el proveedor solicitado por el usuario.', {
        provider: preferred.name,
        promptType,
        traceId: metadata.traceId,
      })
    }
  }

  let lastError: AIError | null = null

  for (const provider of providerOrder) {
    const maxRetries = provider.maxRetries ?? 2
    const cacheKey = buildCacheKey?.(provider)
    if (allowCache && cacheKey) {
      const cached = getCachedResponse<T>(cacheKey)
      if (cached !== undefined) {
        recordAiAttempt({
          promptType,
          provider: provider.name,
          latencyMs: 0,
          success: true,
          timestamp: Date.now(),
        })
        return { data: cached, provider }
      }
    }

    for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
      const traceId = metadata.traceId ?? createTraceId()
      const start = performance.now()
      const { signal: composedSignal, cleanup } = composeSignal(signal, timeoutMs)
      try {
        const data = await executor(provider, composedSignal, attempt, traceId)
        cleanup()
        const latency = Math.round(performance.now() - start)
        recordAiAttempt({
          promptType,
          provider: provider.name,
          latencyMs: latency,
          success: true,
          timestamp: Date.now(),
        })
        markProviderAvailability(provider.name, 'online')
        if (allowCache && cacheKey) {
          setCachedResponse({
            key: cacheKey,
            promptType,
            data,
            createdAt: Date.now(),
            provider: provider.name,
            traceId,
          })
        }
        onSuccess?.(provider, data)
        return { data, provider }
      } catch (error) {
        cleanup()
        const aiError = normalizeError(error, provider, metadata)
        lastError = aiError
        recordAiAttempt({
          promptType,
          provider: provider.name,
          latencyMs: Math.round(performance.now() - start),
          success: false,
          errorKind: aiError.kind,
          errorMessage: aiError.message,
          timestamp: Date.now(),
        })
        onFailure?.(aiError)
        const shouldRetry = aiError.retriable && attempt < maxRetries
        if (!shouldRetry) {
          const availability = aiError.kind === 'timeout' || aiError.kind === 'network' ? 'offline' : 'degraded'
          markProviderAvailability(provider.name, availability)
          break
        } else {
          const backoffMs = computeBackoffDelay(attempt, provider)
          logAiEvent('warn', 'Fallo temporal al invocar la IA, se reintentará con backoff exponencial.', {
            provider: provider.name,
            attempt,
            nextAttemptInMs: Math.round(backoffMs),
            errorKind: aiError.kind,
            status: aiError.status,
            traceId,
            promptType,
          })

          try {
            await waitForBackoff(backoffMs, signal)
          } catch (waitError) {
            const abortError = normalizeError(waitError, provider, metadata)
            lastError = abortError
            throw abortError
          }
        }
      }
    }
  }

  throw lastError ?? new AIError('No se pudo completar la solicitud de IA.', 'unknown', { metadata })
}

const normalizeError = (
  error: unknown,
  provider: AiProviderConfig,
  metadata: AiRequestMetadata,
): AIError => {
  if (error instanceof AIError) {
    return error
  }

  if (error instanceof DOMException && error.name === 'AbortError') {
    const reason = (error as DOMException & { message?: string }).message
    const kind = reason === 'timeout' ? 'timeout' : 'aborted'
    return new AIError(
      kind === 'timeout' ? 'La solicitud a la IA superó el tiempo máximo.' : 'La operación de IA fue cancelada.',
      kind,
      {
        provider: provider.name,
        retriable: kind === 'timeout',
        metadata,
        cause: error,
      },
    )
  }

  if (error && typeof error === 'object' && 'status' in error) {
    const candidate = error as { status?: unknown; body?: unknown }
    if (typeof candidate.status === 'number') {
      const status = candidate.status
      const body = candidate.body
      const kind = classifyStatus(status)
      const retriable = kind === 'quota' || kind === 'timeout' || kind === 'network'
      return new AIError(`Error del proveedor (${status})`, kind, {
        provider: provider.name,
        status,
        retriable,
        metadata,
        cause: body,
      })
    }
  }

  if (error instanceof Error) {
    return new AIError(error.message, 'unknown', {
      provider: provider.name,
      retriable: false,
      metadata,
      cause: error,
    })
  }

  return new AIError('Error desconocido al invocar a la IA.', 'unknown', {
    provider: provider.name,
    retriable: false,
    metadata,
  })
}

const repairOptionalFields = <T extends Record<string, unknown>>(value: T, schema: JSONSchema) => {
  const result: Record<string, unknown> = { ...value }
  const properties = schema.properties ?? {}
  Object.entries(properties).forEach(([key, property]) => {
    if (result[key] !== undefined) return
    if (!property || typeof property !== 'object') return
    const propertyType = (property as { type?: string }).type
    if (!propertyType) return
    if (propertyType === 'array') {
      result[key] = []
    } else if (propertyType === 'object') {
      result[key] = {}
    } else {
      result[key] = ''
    }
  })
  return result as T
}

export interface AiResponse<T> {
  data: T
  provider: string
}

export async function generateJSON<T>(
  prompt: string,
  schema: JSONSchema,
  options: GenerateJSONOptions = {},
): Promise<AiResponse<T>> {
  const metadata: AiRequestMetadata = {
    promptType: options.promptMetadata?.promptType ?? 'card-json',
    cardId: options.promptMetadata?.cardId,
    traceId: options.promptMetadata?.traceId ?? createTraceId(),
    variant: options.promptMetadata?.variant,
    priority: options.promptMetadata?.priority ?? 'normal',
    providerHint: options.providerHint,
  }

  const allowCache = options.allowCache ?? true
  const timeoutMs = options.timeoutMs ?? DEFAULT_JSON_TIMEOUT

  const { data, provider } = await performRequestWithFailover({
    promptType: metadata.promptType,
    metadata,
    timeoutMs,
    allowCache,
    signal: options.signal,
    buildCacheKey: (provider) => buildCacheKey(prompt, metadata.promptType, provider.name),
    providerHint: options.providerHint ?? metadata.providerHint,
    executor: async (provider, composedSignal, attempt, traceId) => {
      const systemPrompt =
        options.systemPrompt ??
        'Eres un diseñador de juegos que responde únicamente con JSON válido y balanceado para cardforge.'
      const payload = {
        model: provider.model ?? fallbackModel,
        messages: [
          {
            role: 'system',
            content: options.safeMode
              ? `${systemPrompt} Responde con cambios mínimos y marca campos dudosos.`
              : systemPrompt,
          },
          {
            role: 'user',
            content:
              options.basePromptOverride ??
              `${prompt}\nInstrucciones adicionales: ${options.promptTemplate ?? ''}`.trim(),
          },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: schema.title ?? 'cardforge_schema',
            schema,
          },
        },
        temperature: options.temperature ?? (options.safeMode ? 0.4 : 0.7),
        top_p: options.topP ?? 0.9,
        metadata: {
          attempt,
          traceId,
          cardId: metadata.cardId,
          promptType: metadata.promptType,
          template: options.promptTemplateId,
        },
      }

      const response = await fetch(createUrl(provider, '/v1/chat/completions'), {
        method: 'POST',
        headers: createHeaders(provider, traceId),
        body: JSON.stringify(payload),
        signal: composedSignal,
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new AIError(`Error al generar JSON (${response.status})`, classifyStatus(response.status), {
          provider: provider.name,
          status: response.status,
          retriable: response.status >= 500 || response.status === 429,
          metadata,
          cause: errorText,
        })
      }

      const json = await response.json()
      const message = json.choices?.[0]?.message
      if (!message) {
        throw new AIError('La respuesta de la IA no contiene mensaje interpretable.', 'invalid_response', {
          provider: provider.name,
          metadata,
        })
      }

      let rawContent: string | undefined

      if (Array.isArray(message.content)) {
        const jsonPart = (message.content as MessageContentItem[]).find((part) =>
          ['json', 'json_schema', 'text', 'output_text'].includes(part?.type ?? ''),
        )
        rawContent = jsonPart?.text ?? jsonPart?.value
        if (!rawContent && jsonPart?.data) {
          rawContent =
            typeof jsonPart.data === 'string' ? jsonPart.data : JSON.stringify(jsonPart.data)
        }
      } else if (typeof message.content === 'string') {
        rawContent = message.content
      }

      if (!rawContent && message?.tool_calls?.[0]?.function?.arguments) {
        rawContent = message.tool_calls[0].function.arguments
      }

      if (!rawContent) {
        throw new AIError('La IA no devolvió contenido interpretable.', 'invalid_response', {
          provider: provider.name,
          metadata,
        })
      }

      try {
        const parsed = JSON.parse(rawContent) as T
        return repairOptionalFields(parsed, schema)
      } catch (error) {
        logAiEvent('error', 'No se pudo parsear la respuesta JSON de la IA.', {
          rawContent,
          provider: provider.name,
        })
        throw new AIError('No se pudo parsear la respuesta JSON de la IA.', 'invalid_response', {
          provider: provider.name,
          metadata,
          cause: error,
          retriable: true,
        })
      }
    },
    onSuccess: (provider) => {
      recordPromptUsage({
        prompt,
        promptType: metadata.promptType,
        provider: provider.name,
        success: true,
      })
    },
    onFailure: (error) => {
      recordPromptUsage({
        prompt,
        promptType: metadata.promptType,
        provider: error.provider,
        success: false,
      })
      const uiMessage = mapErrorToUiMessage(error)
      logAiEvent('error', uiMessage, {
        provider: error.provider,
        status: error.status,
        kind: error.kind,
        metadata,
      })
    },
  })

  if (shouldTriggerAiAlert()) {
    logAiEvent('warn', 'La tasa de error de la IA supera el umbral configurado.', { promptType: metadata.promptType })
  }

  return { data, provider: provider.name }
}

export async function generateImageBase64(
  prompt: string,
  options: GenerateImageOptions = {},
): Promise<AiResponse<string>> {
  const metadata: AiRequestMetadata = {
    promptType: options.promptMetadata?.promptType ?? 'card-image',
    cardId: options.promptMetadata?.cardId,
    traceId: options.promptMetadata?.traceId ?? createTraceId(),
    variant: options.promptMetadata?.variant,
    priority: options.promptMetadata?.priority ?? 'normal',
    providerHint: options.providerHint,
  }

  if (!prompt.trim()) {
    throw new AIError('Proporciona una descripción para generar la imagen.', 'invalid_response', {
      metadata,
    })
  }

  const allowCache = options.allowCache ?? false
  const timeoutMs = options.timeoutMs ?? DEFAULT_IMAGE_TIMEOUT

  const { data, provider } = await performRequestWithFailover({
    promptType: metadata.promptType,
    metadata,
    timeoutMs,
    allowCache,
    signal: options.signal,
    buildCacheKey: (provider) => buildCacheKey(prompt, metadata.promptType, provider.name),
    providerHint: options.providerHint ?? metadata.providerHint,
    executor: async (provider, composedSignal, attempt, traceId) => {
      const response = await fetch(createUrl(provider, '/v1/images/generations'), {
        method: 'POST',
        headers: createHeaders(provider, traceId),
        body: JSON.stringify({
          model: provider.imageModel ?? fallbackImageModel,
          prompt,
          size: options.sizeOverride ?? provider.imageSize ?? fallbackImageSize,
          response_format: 'b64_json',
          metadata: {
            attempt,
            traceId,
            cardId: metadata.cardId,
            promptType: metadata.promptType,
          },
        }),
        signal: composedSignal,
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new AIError(`Error al generar imagen (${response.status})`, classifyStatus(response.status), {
          provider: provider.name,
          status: response.status,
          retriable: response.status >= 500 || response.status === 429,
          metadata,
          cause: errorText,
        })
      }

      const payload = await response.json()

      const base64Content: string | undefined =
        payload?.data?.[0]?.b64_json ??
        payload?.data?.[0]?.base64 ??
        payload?.data?.[0]?.content ??
        payload?.image_base64 ??
        payload?.base64 ??
        payload?.b64_json

      if (!base64Content) {
        throw new AIError('El servicio de imágenes no devolvió datos válidos.', 'invalid_response', {
          provider: provider.name,
          metadata,
        })
      }

      return base64Content.startsWith('data:')
        ? base64Content
        : `data:image/png;base64,${base64Content}`
    },
    onFailure: (error) => {
      const uiMessage = mapErrorToUiMessage(error)
      logAiEvent('error', uiMessage, {
        provider: error.provider,
        status: error.status,
        kind: error.kind,
        metadata,
      })
    },
  })

  return { data, provider: provider.name }
}

export const mapErrorToUiMessage = (error: { kind: AiErrorKind }): string => {
  switch (error.kind) {
    case 'timeout':
      return 'El servicio de IA tardó demasiado en responder. Intenta nuevamente más tarde o ajusta el prompt.'
    case 'quota':
      return 'Se alcanzó la cuota del proveedor de IA. Espera unos minutos o cambia de proveedor.'
    case 'auth':
      return 'Las credenciales de la IA no son válidas. Verifica tu configuración.'
    case 'rate_limit':
      return 'Demasiadas solicitudes simultáneas. Reduce la frecuencia o aplica reintentos escalonados.'
    case 'network':
      return 'El proveedor de IA no está disponible. Se activó el plan de contingencia.'
    case 'aborted':
      return 'La operación de IA fue cancelada por el usuario.'
    case 'invalid_response':
      return 'La IA devolvió una respuesta inesperada. Ajusta el prompt o aplica el modo seguro.'
    default:
      return 'Ocurrió un error al usar la IA. Revisa los detalles y vuelve a intentarlo.'
  }
}
