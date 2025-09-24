import { describe, expect, it } from 'vitest'
import { computeAiQualityScore, validateCardCompletion } from '../../ai'
import type { Card } from '../../../types'

const baseCard: Card = {
  id: 'card_1',
  title: 'Espada de Lumen',
  type: 'Hechizo',
  value: '3',
  action: 'Canaliza luz',
  actionDescription: 'Proyecta un haz de luz purificadora sobre un enemigo corrupto, debilitándolo.',
  context: 'Artefacto sagrado usado por los templarios.',
  imageDescription: 'Una espada envuelta en halos dorados.',
  icons: ['luz', 'templario'],
}

describe('validateCardCompletion', () => {
  it('detecta campos obligatorios faltantes y sugiere correcciones', () => {
    const completion = {
      title: '',
      actionDescription: 'Breve',
      context: '',
      icons: ['luz', 'luz'],
    }

    const { report, sanitized } = validateCardCompletion(baseCard, completion)

    const errorFields = report.issues.filter((issue) => issue.type === 'error').map((issue) => issue.field)
    expect(errorFields).toContain('title')
    expect(errorFields).toContain('actionDescription')
    expect(report.appliedFilters).toContain('Iconos duplicados eliminados')
    expect(sanitized.icons).toEqual(['luz'])
  })

  it('aplica reglas de negocio de longitud mínima', () => {
    const completion = {
      actionDescription: 'Texto demasiado corto.',
      context: 'Contexto insuficiente.',
    }

    const { report } = validateCardCompletion(baseCard, completion)

    expect(report.businessRules).toContain(
      'La narrativa debe contener al menos 60 caracteres para garantizar inmersión.',
    )
  })
})

describe('computeAiQualityScore', () => {
  it('otorga una puntuación mayor cuando la carta está completa y coherente', () => {
    const enriched = {
      ...baseCard,
      actionDescription:
        'Proyecta un haz de luz purificadora que reduce a la mitad la fuerza del objetivo durante dos turnos.',
      context: 'Forjada en el monasterio de Lumen, la espada brilla cuando detecta corrupción.',
      icons: ['luz', 'templario', 'purificación'],
    }
    const weak = {
      ...baseCard,
      actionDescription: 'Golpea fuerte.',
      context: '',
      icons: [],
    }

    const enrichedScore = computeAiQualityScore(enriched)
    const weakScore = computeAiQualityScore(weak)

    expect(enrichedScore.score).toBeGreaterThan(weakScore.score)
    expect(enrichedScore.reasons.length).toBeLessThan(weakScore.reasons.length)
  })
})
