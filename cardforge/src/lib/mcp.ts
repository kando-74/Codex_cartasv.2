import type { McpPreferences } from '../types'

const STORAGE_KEY = 'cardforge:mcp:preferences'

const defaultPreferences = (): McpPreferences => ({
  baseUrl: import.meta.env.VITE_MCP_GATEWAY_URL?.trim() ?? '',
  apiKey: import.meta.env.VITE_MCP_API_KEY?.trim() || undefined,
  workspaceId: import.meta.env.VITE_MCP_WORKSPACE?.trim() || 'cardforge',
  autoApplyOperations: true,
  sendTemplateContext: true,
})

const getStorage = (): Storage | null => {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return null
  }
  return window.localStorage
}

const parsePreferences = (raw: string | null): McpPreferences | null => {
  if (!raw) {
    return null
  }
  try {
    const parsed = JSON.parse(raw) as Partial<McpPreferences>
    const defaults = defaultPreferences()
    return {
      baseUrl: typeof parsed.baseUrl === 'string' ? parsed.baseUrl : defaults.baseUrl,
      apiKey: typeof parsed.apiKey === 'string' && parsed.apiKey.trim().length > 0 ? parsed.apiKey : defaults.apiKey,
      workspaceId:
        typeof parsed.workspaceId === 'string' && parsed.workspaceId.trim().length > 0
          ? parsed.workspaceId
          : defaults.workspaceId,
      autoApplyOperations:
        typeof parsed.autoApplyOperations === 'boolean' ? parsed.autoApplyOperations : defaults.autoApplyOperations,
      sendTemplateContext:
        typeof parsed.sendTemplateContext === 'boolean' ? parsed.sendTemplateContext : defaults.sendTemplateContext,
    }
  } catch (error) {
    console.warn('No se pudieron leer las preferencias MCP guardadas. Se usarán valores por defecto.', error)
    return null
  }
}

export const loadMcpPreferences = (): McpPreferences => {
  const storage = getStorage()
  const defaults = defaultPreferences()
  if (!storage) {
    return { ...defaults }
  }
  const stored = parsePreferences(storage.getItem(STORAGE_KEY))
  if (!stored) {
    return { ...defaults }
  }
  return { ...stored }
}

export const saveMcpPreferences = (preferences: McpPreferences): void => {
  const storage = getStorage()
  if (!storage) {
    return
  }
  const payload: McpPreferences = {
    baseUrl: preferences.baseUrl?.trim() ?? '',
    apiKey: preferences.apiKey?.trim() || undefined,
    workspaceId: preferences.workspaceId?.trim() || 'cardforge',
    autoApplyOperations: preferences.autoApplyOperations,
    sendTemplateContext: preferences.sendTemplateContext,
  }
  storage.setItem(STORAGE_KEY, JSON.stringify(payload))
}

export const updateMcpPreferences = (partial: Partial<McpPreferences>): McpPreferences => {
  const current = loadMcpPreferences()
  const next: McpPreferences = {
    baseUrl: partial.baseUrl?.trim() ?? current.baseUrl,
    apiKey: partial.apiKey?.trim() || current.apiKey,
    workspaceId: partial.workspaceId?.trim() || current.workspaceId,
    autoApplyOperations:
      typeof partial.autoApplyOperations === 'boolean' ? partial.autoApplyOperations : current.autoApplyOperations,
    sendTemplateContext:
      typeof partial.sendTemplateContext === 'boolean' ? partial.sendTemplateContext : current.sendTemplateContext,
  }
  saveMcpPreferences(next)
  return next
}
