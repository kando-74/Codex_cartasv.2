import { useEffect, useState } from 'react'
import type { AiPromptRecord, AiPromptTemplate } from '../../types'

const promptRecords = new Map<string, AiPromptRecord>()
const listeners = new Set<(records: AiPromptRecord[]) => void>()

const emit = () => {
  const snapshot = Array.from(promptRecords.values()).sort(
    (a, b) => b.lastUsedAt - a.lastUsedAt,
  )
  listeners.forEach((listener) => listener(snapshot))
}

const ensureRecord = (prompt: string, promptType: string, provider?: string) => {
  const key = `${promptType}:${prompt.trim().slice(0, 120)}:${provider ?? 'default'}`
  let record = promptRecords.get(key)
  if (!record) {
    record = {
      id: key,
      prompt,
      promptType,
      provider,
      successCount: 0,
      failureCount: 0,
      lastUsedAt: Date.now(),
    }
    promptRecords.set(key, record)
  }
  return record
}

export interface PromptUsageInput {
  prompt: string
  promptType: string
  provider?: string
  success: boolean
  qualityScore?: number
}

export const recordPromptUsage = ({ prompt, promptType, provider, success, qualityScore }: PromptUsageInput) => {
  const record = ensureRecord(prompt, promptType, provider)
  record.lastUsedAt = Date.now()
  if (success) {
    record.successCount += 1
    record.lastQualityScore = qualityScore
  } else {
    record.failureCount += 1
  }
  emit()
}

export const getPromptRepository = (): AiPromptRecord[] =>
  Array.from(promptRecords.values()).sort((a, b) => b.lastUsedAt - a.lastUsedAt)

export const subscribeToPromptRepository = (
  listener: (records: AiPromptRecord[]) => void,
): (() => void) => {
  listeners.add(listener)
  listener(getPromptRepository())
  return () => listeners.delete(listener)
}

export const usePromptRepository = (): AiPromptRecord[] => {
  const [records, setRecords] = useState<AiPromptRecord[]>(() => getPromptRepository())
  useEffect(() => subscribeToPromptRepository(setRecords), [])
  return records
}

export const getDefaultPromptTemplates = (): AiPromptTemplate[] => [
  {
    id: 'balanced-designer',
    name: 'Diseñador equilibrado',
    description:
      'Optimiza narrativa y balance numérico con un tono aventurero. Perfecto para cartas principales.',
    prompt:
      'Analiza el contexto del juego y refina la carta asegurando equilibrio mecánico, coherencia narrativa y tono épico moderado.',
    recommendedFor: ['heroica', 'aventura'],
  },
  {
    id: 'fast-polish',
    name: 'Pulido rápido',
    description: 'Ajusta textos existentes corrigiendo gramática y consistencia sin cambiar la intención.',
    prompt:
      'Revisa ortografía, gramática y consistencia terminológica. Solo corrige errores sin modificar el significado base.',
    recommendedFor: ['ajustes menores'],
  },
  {
    id: 'lore-master',
    name: 'Maestro de lore',
    description: 'Expande descripciones para universos ricos en historia y referencias.',
    prompt:
      'Enriquece la narrativa conectándola con eventos históricos del mundo del juego, manteniendo claridad y longitud controlada.',
    recommendedFor: ['narrativa'],
  },
  {
    id: 'rule-strict',
    name: 'Reglas estrictas',
    description: 'Aplica reglas de negocio rígidas y validaciones de unicidad.',
    prompt:
      'Verifica costes mínimos, unicidad de iconos y coherencia con restricciones de torneo. Ajusta cualquier incumplimiento.',
    recommendedFor: ['competitivo'],
  },
]
