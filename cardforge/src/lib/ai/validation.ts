import type { Card, AiQualityScore, AiValidationIssue, AiValidationReport } from '../../types'
import { detectSensitiveContent } from './moderation'
import { computeAiQualityScore } from './quality'

const sanitizeText = (value?: string) =>
  value ? value.replace(/\s+/g, ' ').replace(/\s([,.!?])/g, '$1').trim() : value

const ensureSentencePeriod = (value?: string) => {
  if (!value) return value
  return /[.!?]$/.test(value.trim()) ? value.trim() : `${value.trim()}.`
}

const clampValue = (value?: string) => {
  if (!value) return value
  const numeric = Number.parseInt(value, 10)
  if (Number.isNaN(numeric)) return value
  if (numeric < 0) return '0'
  if (numeric > 999) return '999'
  return String(numeric)
}

const MIN_ACTION_LENGTH = 60
const MIN_CONTEXT_LENGTH = 30

export interface ValidationOutcome {
  sanitized: Partial<Card>
  report: AiValidationReport
  quality: AiQualityScore
}

export const validateCardCompletion = (
  base: Card,
  completion: Partial<Card>,
): ValidationOutcome => {
  const appliedFilters: string[] = []
  const sanitized: Partial<Card> = { ...completion }

  const trimFields: Array<keyof Card> = [
    'title',
    'type',
    'value',
    'action',
    'actionDescription',
    'context',
    'imageDescription',
  ]

  trimFields.forEach((field) => {
    const nextValue = sanitizeText(sanitized[field])
    if (nextValue !== sanitized[field]) {
      sanitized[field] = nextValue as Card[typeof field]
      appliedFilters.push(`Normalización de espacios en ${field}`)
    }
  })

  if (sanitized.actionDescription) {
    const value = ensureSentencePeriod(sanitized.actionDescription)
    if (value !== sanitized.actionDescription) {
      sanitized.actionDescription = value
      appliedFilters.push('Se añadieron signos de puntuación finales en la descripción de acción')
    }
  }

  if (sanitized.value) {
    const clamped = clampValue(sanitized.value)
    if (clamped !== sanitized.value) {
      sanitized.value = clamped
      appliedFilters.push('Valor numérico ajustado al rango permitido (0-999)')
    }
  }

  const icons = Array.from(
    new Set((sanitized.icons ?? base.icons ?? []).map((icon) => icon.trim()).filter(Boolean)),
  )
  if (icons.length !== (sanitized.icons ?? base.icons ?? []).length) {
    appliedFilters.push('Iconos duplicados eliminados')
  }
  sanitized.icons = icons

  const issues: AiValidationIssue[] = []
  const suggestions: string[] = []
  const businessRules: string[] = []

  const validatePresence = (field: keyof Card, label: string, minLength = 1) => {
    const value = sanitized[field] ?? base[field]
    if (!value || value.trim().length < minLength) {
      issues.push({
        field,
        type: 'error',
        message: `${label} es obligatorio.`,
        suggestion: `Aporta un ${label.toLowerCase()} con al menos ${minLength} caracteres.`,
      })
    }
  }

  validatePresence('title', 'Título', 3)
  validatePresence('actionDescription', 'Descripción de acción', MIN_ACTION_LENGTH)
  validatePresence('context', 'Contexto', MIN_CONTEXT_LENGTH)

  if ((sanitized.actionDescription ?? '').length < MIN_ACTION_LENGTH) {
    businessRules.push('La narrativa debe contener al menos 60 caracteres para garantizar inmersión.')
  }

  if (!sanitized.icons?.length) {
    suggestions.push('Añade al menos un icono para mejorar la lectura visual.')
  }

  if (sanitized.title && sanitized.context && !sanitized.context.includes(sanitized.title.split(' ')[0] ?? '')) {
    suggestions.push('Menciona el título dentro del contexto para reforzar la coherencia.')
  }

  if (sanitized.actionDescription && sanitized.action && !sanitized.actionDescription.includes(sanitized.action)) {
    suggestions.push('Integra el resumen corto dentro de la descripción para mantener consistencia.')
  }

  const moderation = detectSensitiveContent(sanitized)
  if (moderation.flagged) {
    issues.push({
      field: 'general',
      type: 'warning',
      message: 'El contenido parece sensible. Revisa las políticas antes de publicar.',
      suggestion: moderation.reasons.join(', '),
    })
  }

  const quality = computeAiQualityScore({ ...base, ...sanitized })

  if (quality.score < 60) {
    suggestions.push('Pide a la IA que amplíe la narrativa o refine los iconos para subir la puntuación de calidad.')
  }

  const report: AiValidationReport = {
    isValid: issues.filter((issue) => issue.type === 'error').length === 0,
    issues,
    suggestions,
    businessRules,
    appliedFilters,
    sensitiveContent: moderation.flagged,
  }

  return {
    sanitized,
    report,
    quality,
  }
}
