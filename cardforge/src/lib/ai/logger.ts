import { useEffect, useState } from 'react'

export type AiLogLevel = 'info' | 'warn' | 'error'

export interface AiLogEntry {
  id: string
  level: AiLogLevel
  message: string
  timestamp: number
  data?: Record<string, unknown>
}

type LogListener = (logs: AiLogEntry[]) => void

const MAX_LOGS = 200
const logEntries: AiLogEntry[] = []
const listeners = new Set<LogListener>()

const emit = () => {
  const snapshot = [...logEntries]
  listeners.forEach((listener) => listener(snapshot))
}

const createId = () => `ai-log-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`

export const logAiEvent = (level: AiLogLevel, message: string, data?: Record<string, unknown>) => {
  const entry: AiLogEntry = {
    id: createId(),
    level,
    message,
    timestamp: Date.now(),
    data,
  }

  logEntries.push(entry)
  if (logEntries.length > MAX_LOGS) {
    logEntries.shift()
  }

  if (level === 'error') {
    console.error('[AI]', message, data)
  } else if (level === 'warn') {
    console.warn('[AI]', message, data)
  } else {
    console.info('[AI]', message, data)
  }

  emit()
}

export const subscribeToAiLogs = (listener: LogListener): (() => void) => {
  listeners.add(listener)
  listener([...logEntries])
  return () => listeners.delete(listener)
}

export const useAiLogs = (): AiLogEntry[] => {
  const [entries, setEntries] = useState<AiLogEntry[]>(() => [...logEntries])

  useEffect(() => subscribeToAiLogs(setEntries), [])

  return entries
}

export const getLatestAiError = (): AiLogEntry | undefined =>
  [...logEntries].reverse().find((entry) => entry.level === 'error')
