import type { AiCacheEntry } from '../../types'

const cache = new Map<string, AiCacheEntry<unknown>>()
const TTL_MS = 2 * 60 * 1000

export const buildCacheKey = (prompt: string, promptType: string, provider: string) =>
  `${provider}:${promptType}:${prompt.trim()}`

export const getCachedResponse = <T>(key: string): T | undefined => {
  const entry = cache.get(key)
  if (!entry) return undefined
  if (Date.now() - entry.createdAt > TTL_MS) {
    cache.delete(key)
    return undefined
  }
  return entry.data as T
}

export const setCachedResponse = <T>(entry: AiCacheEntry<T>) => {
  cache.set(entry.key, entry)
}

export const clearExpiredCache = () => {
  const now = Date.now()
  for (const [key, entry] of cache.entries()) {
    if (now - entry.createdAt > TTL_MS) {
      cache.delete(key)
    }
  }
}
