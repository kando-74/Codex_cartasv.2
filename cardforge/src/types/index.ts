export interface GameContext {
  description: string
  artStyle: string
  isStyleLocked: boolean
}

export interface CardSizeSetting {
  width: number
  height: number
  unit?: 'mm'
  presetId?: string
}

export interface AssetMeta {
  id: string
  name: string
  path: string
  url?: string
  description?: string
}

export interface ProjectAssets {
  referenceImages: AssetMeta[]
  availableIcons: AssetMeta[]
  /**
   * Estado auxiliar sincronizado con la colaboración asistida por IA. Permite que varias sesiones
   * continúen un flujo de generación sin perder los resultados pendientes.
   */
  aiState?: {
    pendingResults: PendingAiResult[]
    updatedAt: string
  }
}

export type TemplateElementType = 'text' | 'rectangle' | 'image'

export interface TemplateElementBase {
  id: string
  type: TemplateElementType
  name: string
  x: number
  y: number
  width: number
  height: number
  rotation: number
  visible: boolean
  locked: boolean
}

export interface TemplateTextElement extends TemplateElementBase {
  type: 'text'
  text: string
  fontFamily: string
  fontSize: number
  fontWeight: number
  color: string
  align: 'left' | 'center' | 'right'
}

export interface TemplateRectangleElement extends TemplateElementBase {
  type: 'rectangle'
  fill: string
  borderColor: string
  borderWidth: number
  borderRadius: number
  opacity: number
}

export interface TemplateImageElement extends TemplateElementBase {
  type: 'image'
  fit: 'cover' | 'contain' | 'fill'
  background: string
  strokeColor: string
  strokeWidth: number
  placeholder?: string
}

export type TemplateElement =
  | TemplateTextElement
  | TemplateRectangleElement
  | TemplateImageElement

export type TemplateVisibility = 'private' | 'public'

export interface Template {
  id: string
  ownerUid: string
  name: string
  width: number
  height: number
  background: string
  showGrid: boolean
  visibility: TemplateVisibility
  elements: TemplateElement[]
  createdAt?: Date
  updatedAt?: Date
}

export interface TemplateSummary {
  id: string
  name: string
  ownerUid: string
  visibility: TemplateVisibility
  isOwner: boolean
  updatedAt?: Date
}

export interface Card {
  id: string
  title: string
  type: string
  value: string
  action: string
  actionDescription: string
  context: string
  imageDescription: string
  icons: string[]
  imageUrl?: string
  imagePath?: string
  thumbPath?: string
  size?: CardSizeSetting
}

export interface Project {
  id: string
  ownerUid: string
  name: string
  gameContext: GameContext
  cards: Record<string, Card>
  assets: ProjectAssets
  createdAt?: Date
  updatedAt?: Date
  archivedAt?: Date | null
}

export interface ProjectListItem {
  id: string
  name: string
  updatedAt?: Date
  cardCount: number
  archivedAt?: Date | null
}

export interface JSONSchema {
  title?: string
  type: string
  properties?: Record<string, unknown>
  items?: unknown
  required?: string[]
  additionalProperties?: boolean
}

export type AiErrorKind =
  | 'timeout'
  | 'quota'
  | 'auth'
  | 'rate_limit'
  | 'network'
  | 'invalid_response'
  | 'aborted'
  | 'content_policy'
  | 'unknown'

export interface AiProviderConfig {
  name: string
  baseUrl: string
  apiKey: string
  model?: string
  imageModel?: string
  imageSize?: string
  priority?: number
  maxRetries?: number
  safeMode?: boolean
  /** Tiempo base en milisegundos para calcular el backoff exponencial. */
  retryDelayMs?: number
  /** Multiplicador aplicado en cada intento para el cálculo de backoff. */
  retryBackoffMultiplier?: number
  /** Límite máximo de espera entre reintentos en milisegundos. */
  maxRetryDelayMs?: number
  /** Porcentaje de jitter aplicado sobre el backoff para evitar thundering herd. */
  retryJitterRatio?: number
}

export interface AiRequestMetadata {
  promptType: string
  cardId?: string
  traceId?: string
  variant?: string
  priority?: 'low' | 'normal' | 'high'
  providerHint?: string
}

export interface AiValidationIssue {
  field: keyof Card | 'general'
  type: 'error' | 'warning'
  message: string
  suggestion?: string
}

export interface AiValidationReport {
  isValid: boolean
  issues: AiValidationIssue[]
  suggestions: string[]
  businessRules: string[]
  appliedFilters: string[]
  sensitiveContent?: boolean
}

export interface AiQualityScore {
  score: number
  reasons: string[]
  heuristics: Record<string, number>
}

export interface PendingAiResult {
  cardId: string
  completion: Partial<Card>
  validation: AiValidationReport
  quality: AiQualityScore
  prompt: string
  provider?: string
  promptTemplateId?: string
  traceId: string
  receivedAt: number
  promptType: string
  metadata?: Record<string, unknown>
}

export interface AiHistoryEntry {
  id: string
  cardId: string
  prompt: string
  result: PendingAiResult | null
  success: boolean
  error?: string
  createdAt: number
  provider?: string
  promptType: string
  retryCount: number
}

export interface AiPromptTemplate {
  id: string
  name: string
  description: string
  prompt: string
  recommendedFor?: string[]
}

export interface AiMetricsSnapshot {
  totals: {
    requests: number
    successes: number
    failures: number
  }
  byPromptType: Record<
    string,
    {
      successes: number
      failures: number
      averageLatencyMs: number
      lastError?: {
        kind: AiErrorKind
        message: string
        at: number
      }
    }
  >
  byProvider: Record<
    string,
    {
      successes: number
      failures: number
      averageLatencyMs: number
      lastLatencyMs?: number
      availability: 'online' | 'degraded' | 'offline'
    }
  >
  lastUpdatedAt: number
  rollingErrorRate: number
}

export interface AiStatusSnapshot {
  latencyMs: number
  provider: string
  availability: 'online' | 'degraded' | 'offline'
  updatedAt: number
}

export interface AiPromptRecord {
  id: string
  prompt: string
  promptType: string
  provider?: string
  successCount: number
  failureCount: number
  lastUsedAt: number
  lastQualityScore?: number
}

export interface AiCacheEntry<T> {
  key: string
  promptType: string
  data: T
  createdAt: number
  provider: string
  traceId: string
}

export interface McpToolDefinition {
  name: string
  description?: string
  inputSchema?: JSONSchema
  outputSchema?: JSONSchema
}

export interface McpSessionState {
  sessionId: string
  workspaceId?: string
  connectedAt: number
  expiresAt?: number
  availableTools: McpToolDefinition[]
  capabilities?: string[]
}

export type TemplateCommandOperation =
  | {
      type: 'add_element'
      element: TemplateElement
    }
  | {
      type: 'update_element'
      elementId: string
      changes: Partial<TemplateElement>
    }
  | {
      type: 'delete_element'
      elementId: string
    }
  | {
      type: 'reorder_element'
      elementId: string
      index: number
    }
  | {
      type: 'set_template'
      changes: Partial<
        Pick<Template, 'name' | 'width' | 'height' | 'background' | 'showGrid' | 'visibility'>
      >
    }
  | {
      type: 'focus_element'
      elementId: string
    }

export interface McpCommandResponse {
  message?: string
  operations?: TemplateCommandOperation[]
  toolCalls?: Array<{
    tool: string
    arguments?: Record<string, unknown> | null
    result?: unknown
  }>
  debug?: Record<string, unknown>
  warnings?: string[]
  state?: Partial<McpSessionState>
}

export interface McpCommandLogEntry {
  id: string
  prompt: string
  status: 'pending' | 'success' | 'error'
  createdAt: number
  durationMs?: number
  response?: McpCommandResponse
  error?: string
  provider?: string
  applied?: boolean
}

export interface McpCommandContext {
  template: {
    id: string
    name: string
    width: number
    height: number
    background: string
    showGrid: boolean
    visibility: TemplateVisibility
    elementCount: number
    elements: Array<
      Pick<TemplateElement, 'id' | 'type' | 'name' | 'x' | 'y' | 'width' | 'height' | 'rotation' | 'visible' | 'locked'> & {
        config: Record<string, unknown>
      }
    >
  }
  selectedElementId?: string | null
}

export interface McpPreferences {
  baseUrl: string
  apiKey?: string
  workspaceId: string
  autoApplyOperations: boolean
  sendTemplateContext: boolean
}
