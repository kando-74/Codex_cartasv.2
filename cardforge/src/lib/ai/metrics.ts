import { useEffect, useState } from 'react'
import type { AiErrorKind, AiMetricsSnapshot } from '../../types'

type MetricsListener = (snapshot: AiMetricsSnapshot) => void

interface RecordInput {
  promptType: string
  provider: string
  latencyMs: number
  success: boolean
  errorKind?: AiErrorKind
  errorMessage?: string
  timestamp?: number
}

const listeners = new Set<MetricsListener>()

const EMPTY_SNAPSHOT: AiMetricsSnapshot = {
  totals: {
    requests: 0,
    successes: 0,
    failures: 0,
  },
  byPromptType: {},
  byProvider: {},
  lastUpdatedAt: Date.now(),
  rollingErrorRate: 0,
}

let snapshot: AiMetricsSnapshot = { ...EMPTY_SNAPSHOT }
const recentOutcomes: Array<{ success: boolean; timestamp: number }> = []
const MAX_HISTORY = 50

const cloneSnapshot = (): AiMetricsSnapshot => ({
  totals: { ...snapshot.totals },
  byPromptType: Object.fromEntries(
    Object.entries(snapshot.byPromptType).map(([key, value]) => [key, { ...value }]),
  ),
  byProvider: Object.fromEntries(
    Object.entries(snapshot.byProvider).map(([key, value]) => [key, { ...value }]),
  ),
  lastUpdatedAt: snapshot.lastUpdatedAt,
  rollingErrorRate: snapshot.rollingErrorRate,
})

const emit = () => {
  const data = cloneSnapshot()
  listeners.forEach((listener) => listener(data))
}

const updateRollingErrorRate = () => {
  const now = Date.now()
  while (recentOutcomes.length > MAX_HISTORY) {
    recentOutcomes.shift()
  }
  const windowStart = now - 5 * 60 * 1000
  const inWindow = recentOutcomes.filter((item) => item.timestamp >= windowStart)
  if (!inWindow.length) {
    snapshot.rollingErrorRate = 0
    return
  }
  const failures = inWindow.filter((item) => !item.success).length
  snapshot.rollingErrorRate = failures / inWindow.length
}

export const recordAiAttempt = ({
  promptType,
  provider,
  latencyMs,
  success,
  errorKind,
  errorMessage,
  timestamp,
}: RecordInput) => {
  snapshot.totals.requests += 1
  const providerBucket = (snapshot.byProvider[provider] ||= {
    successes: 0,
    failures: 0,
    averageLatencyMs: 0,
    availability: 'online',
  })
  const promptBucket = (snapshot.byPromptType[promptType] ||= {
    successes: 0,
    failures: 0,
    averageLatencyMs: 0,
  })

  const updatedAt = timestamp ?? Date.now()
  snapshot.lastUpdatedAt = updatedAt

  const updateAverage = (current: number, count: number, value: number) =>
    Math.round(((current * (count - 1) + value) / count) * 100) / 100

  if (success) {
    snapshot.totals.successes += 1
    providerBucket.successes += 1
    promptBucket.successes += 1
    providerBucket.lastLatencyMs = latencyMs
    providerBucket.averageLatencyMs = updateAverage(
      providerBucket.averageLatencyMs,
      providerBucket.successes,
      latencyMs,
    )
    promptBucket.averageLatencyMs = updateAverage(
      promptBucket.averageLatencyMs,
      promptBucket.successes,
      latencyMs,
    )
  } else {
    snapshot.totals.failures += 1
    providerBucket.failures += 1
    promptBucket.failures += 1
    promptBucket.lastError = {
      kind: errorKind ?? 'unknown',
      message: errorMessage ?? 'Error desconocido',
      at: updatedAt,
    }
    providerBucket.availability = providerBucket.failures > providerBucket.successes ? 'degraded' : 'online'
    if (errorKind === 'timeout' || errorKind === 'network') {
      providerBucket.availability = 'offline'
    }
  }

  recentOutcomes.push({ success, timestamp: updatedAt })
  updateRollingErrorRate()
  emit()
}

export const markProviderAvailability = (
  provider: string,
  availability: 'online' | 'degraded' | 'offline',
) => {
  const providerBucket = (snapshot.byProvider[provider] ||= {
    successes: 0,
    failures: 0,
    averageLatencyMs: 0,
    availability: 'online',
  })
  providerBucket.availability = availability
  snapshot.lastUpdatedAt = Date.now()
  emit()
}

export const getAiMetricsSnapshot = (): AiMetricsSnapshot => cloneSnapshot()

export const subscribeToAiMetrics = (listener: MetricsListener): (() => void) => {
  listeners.add(listener)
  listener(cloneSnapshot())
  return () => {
    listeners.delete(listener)
  }
}

export const useAiMetrics = (): AiMetricsSnapshot => {
  const [state, setState] = useState<AiMetricsSnapshot>(() => getAiMetricsSnapshot())

  useEffect(() => subscribeToAiMetrics(setState), [])

  return state
}

export const shouldTriggerAiAlert = (): boolean => snapshot.rollingErrorRate > 0.4

export const resetMetrics = () => {
  snapshot = { ...EMPTY_SNAPSHOT, lastUpdatedAt: Date.now() }
  recentOutcomes.splice(0, recentOutcomes.length)
  emit()
}
