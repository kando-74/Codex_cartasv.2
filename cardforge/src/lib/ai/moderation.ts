import type { Card } from '../../types'

const SENSITIVE_PATTERNS = [
  /armas\s+de\s+fuego/i,
  /discurso\s+de\s+odio/i,
  /contenido\s+sexual/i,
  /autolesi[oó]n/i,
]

export interface ModerationResult {
  flagged: boolean
  reasons: string[]
}

export const detectSensitiveContent = (card: Partial<Card>): ModerationResult => {
  const haystack = [card.title, card.actionDescription, card.context, card.imageDescription]
    .filter(Boolean)
    .join(' ')
  const reasons = SENSITIVE_PATTERNS.filter((pattern) => pattern.test(haystack)).map((pattern) =>
    pattern.toString(),
  )
  return {
    flagged: reasons.length > 0,
    reasons,
  }
}
