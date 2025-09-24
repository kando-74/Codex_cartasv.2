import type { Card, AiQualityScore } from '../../types'

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

const lengthScore = (text?: string, min = 20, max = 180) => {
  if (!text) return 0
  const length = text.trim().length
  if (length < min) return (length / min) * 30
  if (length > max) return clamp(30 - (length - max) * 0.1, 0, 30)
  return 30
}

const varietyScore = (icons?: string[]) => {
  if (!icons || icons.length === 0) return 0
  const unique = new Set(icons.map((icon) => icon.trim().toLowerCase())).size
  return clamp(unique * 10, 0, 20)
}

const narrativeConsistencyScore = (card: Partial<Card>) => {
  const titleTokens = (card.title ?? '').toLowerCase().split(/\s+/).filter(Boolean)
  const context = (card.context ?? '').toLowerCase()
  const hits = titleTokens.filter((token) => context.includes(token)).length
  return clamp((hits / Math.max(titleTokens.length, 1)) * 20, 0, 20)
}

export const computeAiQualityScore = (card: Partial<Card>): AiQualityScore => {
  const heuristics = {
    title: lengthScore(card.title, 5, 60),
    actionDescription: lengthScore(card.actionDescription, 60, 260),
    context: lengthScore(card.context, 30, 220),
    icons: varietyScore(card.icons),
    narrative: narrativeConsistencyScore(card),
  }

  const score = clamp(
    Object.values(heuristics).reduce((acc, value) => acc + value, 0),
    0,
    100,
  )

  const reasons = Object.entries(heuristics)
    .filter(([, value]) => value < 10)
    .map(([key]) => `Revisar ${key} para mejorar la calidad`)

  return {
    score: Math.round(score),
    reasons,
    heuristics,
  }
}
