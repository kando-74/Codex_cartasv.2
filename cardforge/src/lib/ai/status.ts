import { useEffect, useState } from 'react'
import type { AiStatusSnapshot } from '../../types'
import { getAiMetricsSnapshot, subscribeToAiMetrics } from './metrics'

const listeners = new Set<(status: AiStatusSnapshot) => void>()
let current: AiStatusSnapshot = {
  provider: 'desconocido',
  availability: 'degraded',
  latencyMs: 0,
  updatedAt: Date.now(),
}

const deriveStatus = (): AiStatusSnapshot => {
  const metrics = getAiMetricsSnapshot()
  const provider = Object.entries(metrics.byProvider).sort((a, b) => {
    const priorityA = a[1].availability === 'online' ? 0 : 1
    const priorityB = b[1].availability === 'online' ? 0 : 1
    return priorityA - priorityB || (a[1].averageLatencyMs ?? 9999) - (b[1].averageLatencyMs ?? 9999)
  })[0]

  if (!provider) {
    return {
      provider: 'sin datos',
      availability: 'degraded',
      latencyMs: 0,
      updatedAt: Date.now(),
    }
  }

  return {
    provider: provider[0],
    availability: provider[1].availability,
    latencyMs: provider[1].averageLatencyMs,
    updatedAt: metrics.lastUpdatedAt,
  }
}

const emit = () => {
  current = deriveStatus()
  listeners.forEach((listener) => listener(current))
}

subscribeToAiMetrics(() => emit())

export const getAiStatus = (): AiStatusSnapshot => ({ ...current })

export const subscribeToAiStatus = (listener: (status: AiStatusSnapshot) => void): (() => void) => {
  listeners.add(listener)
  listener(getAiStatus())
  return () => listeners.delete(listener)
}

export const useAiStatus = (): AiStatusSnapshot => {
  const [status, setStatus] = useState<AiStatusSnapshot>(() => getAiStatus())
  useEffect(() => subscribeToAiStatus(setStatus), [])
  return status
}
