import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import CardForm from '../components/CardForm'
import CardPreview from '../components/CardPreview'
import GameContextForm from '../components/GameContextForm'
import IconGenerator from '../components/IconGenerator'
import Loader from '../components/Loader'
import ProjectActions from '../components/ProjectActions'
import DataImportDialog from '../components/DataImportDialog'
import { useErrorToasts } from '../components/ErrorToastContext'
import AiControlPanel from '../components/AiControlPanel'
import AiPendingReview from '../components/AiPendingReview'
import { generateImageBase64, generateJSON, mapErrorToUiMessage } from '../services/ai'
import {
  addCard,
  createEmptyCard,
  deleteProject,
  getDefaultAssets,
  getDefaultContext,
  loadProject,
  removeCard,
  sanitizeId,
  updateProject,
  uploadImage,
} from '../services/projects'
// IA
import { getDefaultPromptTemplates, useAiMetrics, validateCardCompletion } from '../lib/ai';

// Card sizes / settings (de main)
import { cloneCardSize, CUSTOM_CARD_SIZE_ID, findMatchingPresetId } from '../lib/cardSizes';
import { getDefaultCardSizeSetting } from '../lib/settings';
import type { DataImportResult, ImportedCardSize } from '../lib/dataImport'

// Tipos (unificados en una sola línea de import type)
import type {
  AiHistoryEntry,
  AiPromptTemplate,
  Card,
  JSONSchema,
  PendingAiResult,
  Project,
} from '../types';


const cardSchema: JSONSchema = {
  title: 'CardforgeCard',
  type: 'object',
  properties: {
    title: { type: 'string' },
    type: { type: 'string' },
    value: { type: 'string' },
    action: { type: 'string' },
    actionDescription: { type: 'string' },
    context: { type: 'string' },
    imageDescription: { type: 'string' },
    icons: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  required: ['title', 'actionDescription'],
  additionalProperties: false,
}

type CardCompletion = {
  title?: string
  type?: string
  value?: string
  action?: string
  actionDescription?: string
  context?: string
  imageDescription?: string
  icons?: string[]
}

const normalizeCard = (card: Card, fallbackSize?: Card['size']): Card => {
  const baseFallback = fallbackSize ? cloneCardSize(fallbackSize) : getDefaultCardSizeSetting()
  const rawSize = card.size
  let normalizedSize = baseFallback

  if (rawSize) {
    const width = Number(rawSize.width)
    const height = Number(rawSize.height)
    if (Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0) {
      const matchedPreset = findMatchingPresetId(width, height)
      let presetId: string | undefined
      if (rawSize.presetId === CUSTOM_CARD_SIZE_ID) {
        presetId = CUSTOM_CARD_SIZE_ID
      } else if (rawSize.presetId && matchedPreset === rawSize.presetId) {
        presetId = rawSize.presetId
      } else if (matchedPreset) {
        presetId = matchedPreset
      } else {
        presetId = CUSTOM_CARD_SIZE_ID
      }
      normalizedSize = {
        presetId,
        width,
        height,
        unit: rawSize.unit ?? 'mm',
      }
    }
  }

  return {
    ...card,
    size: normalizedSize,
  }
}

const ensureUniqueCardId = (desiredId: string, usedIds: Set<string>): string => {
  const base = desiredId.length > 0 ? desiredId : 'card'
  let candidate = base
  let counter = 1
  while (usedIds.has(candidate)) {
    candidate = `${base}_${counter}`
    counter += 1
  }
  return candidate
}

const resolveImportedSizeSetting = (
  imported: ImportedCardSize | undefined,
  fallback?: Card['size'],
): Card['size'] => {
  const base = fallback ? cloneCardSize(fallback) : getDefaultCardSizeSetting()
  if (imported?.width !== undefined && Number.isFinite(imported.width) && imported.width > 0) {
    base.width = imported.width
  }
  if (imported?.height !== undefined && Number.isFinite(imported.height) && imported.height > 0) {
    base.height = imported.height
  }
  if (imported?.presetId) {
    base.presetId = imported.presetId
  } else if (imported?.width !== undefined && imported?.height !== undefined) {
    base.presetId = findMatchingPresetId(base.width, base.height) ?? CUSTOM_CARD_SIZE_ID
  }
  if (imported?.unit === 'mm') {
    base.unit = 'mm'
  }
  return base
}

const Editor = () => {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const [project, setProject] = useState<Project | null>(null)
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isGeneratingText, setIsGeneratingText] = useState(false)
  const [isGeneratingImage, setIsGeneratingImage] = useState(false)
  const [dirty, setDirty] = useState(false)
  const { showError, showInfo, showWarning } = useErrorToasts()
  const aiMetrics = useAiMetrics()
  const promptTemplates = useMemo<AiPromptTemplate[]>(() => getDefaultPromptTemplates(), [])
  const [aiPromptDraft, setAiPromptDraft] = useState('')
  const [aiPromptTemplateId, setAiPromptTemplateId] = useState<string>('')
  const [aiSafeMode, setAiSafeMode] = useState(false)
  const [aiOfflineMode, setAiOfflineMode] = useState(false)
  const [aiTemperature, setAiTemperature] = useState(0.7)
  const [aiPriority, setAiPriority] = useState<'low' | 'normal' | 'high'>('normal')
  const [aiProviderHint, setAiProviderHint] = useState<string | undefined>(undefined)
  const [aiVariant, setAiVariant] = useState<'A' | 'B'>('A')
  const [aiPendingResults, setAiPendingResults] = useState<Record<string, PendingAiResult>>({})
  const [aiHistory, setAiHistory] = useState<AiHistoryEntry[]>([])
  const [aiActiveController, setAiActiveController] = useState<AbortController | null>(null)
  const [aiFeedback, setAiFeedback] = useState<Record<string, 'like' | 'dislike' | undefined>>({})
  const [cardVersions, setCardVersions] = useState<Record<string, Card[]>>({})
  const [aiAutoSavePending, setAiAutoSavePending] = useState(false)
  const [aiAlerted, setAiAlerted] = useState(false)
  const [aiPromptTouched, setAiPromptTouched] = useState(false)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const providerOptions = useMemo(() => {
    const raw = import.meta.env.VITE_AI_PROVIDERS
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Array<{ name?: string }>
        const names = parsed
          .map((item) => item?.name)
          .filter((name): name is string => typeof name === 'string' && name.length > 0)
        if (names.length) {
          return names
        }
      } catch (error) {
        console.warn('No se pudo interpretar VITE_AI_PROVIDERS', error)
      }
    }
    if (import.meta.env.VITE_AI_BASE_URL) {
      return ['principal']
    }
    return []
  }, [])

  const isAiError = (error: unknown): error is { kind: AiErrorKind } =>
    typeof error === 'object' && error !== null && 'kind' in error

  const basePromptSuggestion = useMemo(() => {
    if (!project || !selectedCard) {
      return ''
    }
    const segments: string[] = []
    segments.push(`Proyecto: ${project.name}.`)
    segments.push(
      `Contexto del mundo: ${project.gameContext.description || 'sin descripción'}. Estilo: ${project.gameContext.artStyle || 'sin definir'}.`,
    )
    segments.push(
      `Carta actual: ${JSON.stringify({
        title: selectedCard.title,
        type: selectedCard.type,
        value: selectedCard.value,
        action: selectedCard.action,
        actionDescription: selectedCard.actionDescription,
        context: selectedCard.context,
        imageDescription: selectedCard.imageDescription,
        icons: selectedCard.icons,
      })}.`,
    )
    segments.push('Objetivo: optimiza claridad narrativa, equilibrio mecánico y consistencia temática sin romper reglas existentes.')
    segments.push('Valida reglas internas: longitud mínima de la narrativa (60 caracteres), unicidad de iconos y coherencia con el título.')
    if (aiVariant === 'B') {
      segments.push('Variante B activa: prioriza originalidad controlada y propuestas alternativas para pruebas A/B.')
    }
    if (aiPriority === 'high') {
      segments.push('Prioridad alta: evita ambigüedades y devuelve contenido listo para producción sin huecos.')
    }
    const feedbackState = selectedCard ? aiFeedback[selectedCard.id] : undefined
    if (feedbackState === 'dislike') {
      segments.push('El usuario no quedó conforme anteriormente. Evita redundancias y aporta matices nuevos en tono y mecánicas.')
    }
    return segments.join(' ')
  }, [aiFeedback, aiPriority, aiVariant, project, selectedCard])

  useEffect(() => {
    setAiPromptTouched(false)
  }, [selectedCard?.id])

  useEffect(() => {
    if (!selectedCard) return
    setAiPromptDraft((prev) => {
      if (aiPromptTouched && prev.trim().length > 0) {
        return prev
      }
      return basePromptSuggestion
    })
  }, [aiPromptTouched, basePromptSuggestion, selectedCard])

  const cards = useMemo(() => {
    if (!project) return []
    return Object.values(project.cards ?? {})
      .filter((card): card is Card => Boolean(card))
      .sort((a, b) => a.title.localeCompare(b.title || '', undefined, { sensitivity: 'base' }))
  }, [project])

  const selectedCard = useMemo(() => {
    if (!project || !selectedCardId) return null
    return project.cards[selectedCardId] ?? null
  }, [project, selectedCardId])

  const pendingForSelected = selectedCard ? aiPendingResults[selectedCard.id] ?? null : null

  const recommendedPrompts = useMemo(() => {
    if (!selectedCard) return []
    const prompts: string[] = []
    const typeLower = selectedCard.type.toLowerCase()
    if (typeLower.includes('hechizo') || typeLower.includes('magia')) {
      prompts.push('Refuerza la sensación arcana destacando consecuencias y riesgos del hechizo.')
    }
    if (typeLower.includes('personaje') || typeLower.includes('héroe')) {
      prompts.push('Describe motivaciones del personaje y cómo su acción impacta a aliados y enemigos.')
    }
    if (!selectedCard.icons.length) {
      prompts.push('Sugiere iconografía distintiva que facilite la lectura en mesa sin sobrecargar la carta.')
    }
    if (project?.gameContext.isStyleLocked) {
      prompts.push('Mantén estrictamente el estilo artístico y terminología oficial del proyecto.')
    }
    return prompts.slice(0, 3)
  }, [project, selectedCard])

  const tokenEstimate = useMemo(() => {
    const words = aiPromptDraft.trim().split(/\s+/).filter(Boolean).length
    return Math.max(20, Math.round(words * 1.3))
  }, [aiPromptDraft])

  const quotaHint = useMemo(() => {
    const usage = tokenEstimate > 700 ? 'alto' : tokenEstimate > 300 ? 'moderado' : 'bajo'
    const priorityNote = aiPriority === 'high' ? 'Prioridad alta: reserva cuota premium.' : ''
    return `${priorityNote} Consumo estimado ${usage}.`
  }, [aiPriority, tokenEstimate])

  useEffect(() => {
    if (!projectId) return

    let active = true

    const fetchProject = async () => {
      if (!active) {
        return
      }
      setLoading(true)
      try {
        const data = await loadProject(projectId)
        const normalizedAssets = {
          ...getDefaultAssets(),
          ...(data.assets ?? {}),
        }
        const pendingFromProject = normalizedAssets.aiState?.pendingResults ?? []
        const pendingMap = pendingFromProject.reduce<Record<string, PendingAiResult>>((acc, item) => {
          acc[item.cardId] = item
          return acc
        }, {})
        setAiPendingResults(pendingMap)
        if (!active) {
          return
        }
        const defaultCardSize = getDefaultCardSizeSetting()
        const normalizedCards = Object.entries(data.cards ?? {}).reduce<Record<string, Card>>(
          (accumulator, [cardId, rawCard]) => {
            if (!rawCard) {
              return accumulator
            }
            accumulator[cardId] = normalizeCard(rawCard, defaultCardSize)
            return accumulator
          },
          {},
        )
        setProject({
          ...data,
          gameContext: data.gameContext ?? getDefaultContext(),
gameContext: data.gameContext ?? getDefaultContext(),
assets: normalizedAssets ?? (data.assets ?? getDefaultAssets()),
cards: normalizedCards,


        })
        if (!active) {
          return
        }
        const cardIds = Object.keys(data.cards ?? {})
        setSelectedCardId(cardIds[0] ?? null)
        if (!active) {
          return
        }
        setLoadError(null)
      } catch (err) {
        console.error(err)
        if (!active) {
          return
        }
        setLoadError('No se pudo cargar el proyecto.')
        showError('No se pudo cargar el proyecto. Comprueba tu conexión e inténtalo de nuevo.')
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    fetchProject().catch(console.error)

    return () => {
      active = false
    }
  }, [projectId, showError])

  const handleSave = useCallback(async () => {
    if (!projectId || !project || isSaving) return
    setIsSaving(true)
    try {
      await updateProject(projectId, {
        name: project.name,
        gameContext: project.gameContext,
        cards: project.cards,
        assets: project.assets,
      })
      setDirty(false)
      setProject((prev) => (prev ? { ...prev, updatedAt: new Date() } : prev))
    } catch (err) {
      console.error(err)
      showError('No se pudo guardar el proyecto.')
    } finally {
      setIsSaving(false)
    }
  }, [isSaving, project, projectId, showError])

  useEffect(() => {
    if (!project || !projectId) return
    const interval = setInterval(() => {
      if (dirty && !isSaving) {
        handleSave().catch(console.error)
      }
    }, 30_000)
    return () => clearInterval(interval)
  }, [dirty, handleSave, isSaving, project, projectId])

  useEffect(() => {
    if (!aiAutoSavePending) return
    handleSave().catch(console.error)
    setAiAutoSavePending(false)
  }, [aiAutoSavePending, handleSave])

  useEffect(() => {
    if (aiMetrics.rollingErrorRate > 0.4 && !aiAlerted) {
      showError('Alerta: la tasa de error de la IA es elevada. Activa el modo seguro o espera unos minutos.')
      setAiAlerted(true)
    } else if (aiMetrics.rollingErrorRate < 0.2 && aiAlerted) {
      setAiAlerted(false)
    }
  }, [aiAlerted, aiMetrics.rollingErrorRate, showError])

  const updateCardState = (card: Card) => {
    const normalized = normalizeCard(card)
    setProject((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        cards: {
          ...prev.cards,
          [card.id]: normalized,
        },
      }
    })
    setDirty(true)
  }

  const syncPendingResults = useCallback((next: Record<string, PendingAiResult>) => {
    setAiPendingResults(next)
    setProject((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        assets: {
          ...prev.assets,
          aiState: {
            pendingResults: Object.values(next),
            updatedAt: new Date().toISOString(),
          },
        },
      }
    })
    setDirty(true)
  }, [])

  const handleContextChange = (nextContext: Project['gameContext']) => {
    setProject((prev) => (prev ? { ...prev, gameContext: nextContext } : prev))
    setDirty(true)
  }

  const handleAddCard = async () => {
    if (!projectId) return
    try {
      const defaultCardSize = getDefaultCardSizeSetting()
      const newCard = await addCard(
        projectId,
        createEmptyCard(cloneCardSize(defaultCardSize)),
      )
      const normalizedCard = normalizeCard(newCard, defaultCardSize)
      setProject((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          cards: {
            ...prev.cards,
            [normalizedCard.id]: normalizedCard,
          },
        }
      })
      setSelectedCardId(normalizedCard.id)
    } catch (err) {
      console.error(err)
      showError('No se pudo crear la carta.')
    }
  }

  const handleDeleteCard = async (cardId: string) => {
    if (!projectId) return
    if (!confirm('¿Eliminar esta carta?')) return
    try {
      await removeCard(projectId, cardId)
      setProject((prev) => {
        if (!prev) return prev
        const updatedCards = { ...prev.cards }
        delete updatedCards[cardId]
        return { ...prev, cards: updatedCards }
      })
      if (selectedCardId === cardId) {
        setSelectedCardId(null)
      }
      showInfo('La carta se eliminó correctamente.')
    } catch (err) {
      console.error(err)
      showError('No se pudo eliminar la carta.')
    }
  }

  const handleRenameProject = async (newName: string) => {
    if (!projectId) return
    setProject((prev) => (prev ? { ...prev, name: newName } : prev))
    try {
      await updateProject(projectId, { name: newName })
    } catch (err) {
      console.error(err)
      showError('No se pudo renombrar el proyecto.')
    }
  }

  const handleGenerateText = useCallback(
    async (options?: { retry?: boolean; focusFields?: Array<keyof Card> }) => {
      if (!selectedCard || !project) return
      if (aiOfflineMode) {
        showInfo('El modo offline está activo. Desactívalo para usar la IA.')
        return
      }

      const controller = new AbortController()
      setAiActiveController(controller)
      setIsGeneratingText(true)

      const focusFields = options?.focusFields ?? []
      const template = promptTemplates.find((item) => item.id === aiPromptTemplateId)
      const focusInstruction =
        focusFields.length > 0
          ? `Prioriza los campos: ${focusFields.join(', ')}. Los demás solo se ajustan si es imprescindible.`
          : 'Revisa todos los campos asegurando consistencia general.'
      const retryInstruction = options?.retry
        ? 'Esta es una reejecución manual, evita repetir texto literal y propone variaciones útiles.'
        : ''
      const priorityInstruction =
        aiPriority === 'high'
          ? 'Responde con mensajes concisos listos para producción, sin notas adicionales.'
          : aiPriority === 'low'
            ? 'Puedes proponer ideas alternativas o ganchos narrativos opcionales.'
            : 'Mantén un equilibrio entre claridad y creatividad.'

      const prompt = [
        aiPromptDraft.trim() || basePromptSuggestion,
        focusInstruction,
        retryInstruction,
        priorityInstruction,
      ]
        .filter(Boolean)
        .join('\n')

      const historyId = `history_${Date.now()}`
      const traceId = (typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `trace_${Date.now()}`)
      const promptType = aiSafeMode ? 'card-json-safe' : 'card-json'
      const baseRetryCount = aiHistory.find((entry) => entry.cardId === selectedCard.id)?.retryCount ?? 0
      const newHistoryEntry: AiHistoryEntry = {
        id: historyId,
        cardId: selectedCard.id,
        prompt,
        result: null,
        success: false,
        error: undefined,
        createdAt: Date.now(),
        provider: undefined,
        promptType,
        retryCount: options?.retry ? baseRetryCount + 1 : 0,
      }
      setAiHistory((prev) => [newHistoryEntry, ...prev].slice(0, 20))

      try {
        const timeout = aiPriority === 'high' ? 25_000 : aiPriority === 'low' ? 45_000 : undefined
        const response = await generateJSON<CardCompletion>(prompt, cardSchema, {
          systemPrompt:
            'Eres un diseñador de juegos que devuelve exclusivamente JSON válido, equilibrado y coherente para cartas de Cardforge.',
          signal: controller.signal,
          safeMode: aiSafeMode,
          temperature: aiTemperature,
          providerHint: aiProviderHint,
          promptTemplate: template?.prompt,
          promptTemplateId: aiPromptTemplateId || undefined,
          allowCache: !options?.retry,
          timeoutMs: timeout,
          promptMetadata: {
            promptType,
            cardId: selectedCard.id,
            traceId,
            variant: aiVariant,
            priority: aiPriority,
          },
        })

        const { sanitized, report, quality } = validateCardCompletion(selectedCard, response.data)

        const pending: PendingAiResult = {
          cardId: selectedCard.id,
          completion: sanitized,
          validation: report,
          quality,
          prompt,
          provider: response.provider,
          promptTemplateId: aiPromptTemplateId || undefined,
          traceId,
          receivedAt: Date.now(),
          promptType,
          metadata: {
            focusFields,
            priority: aiPriority,
            variant: aiVariant,
          },
        }

        const nextPending = { ...aiPendingResults, [selectedCard.id]: pending }
        syncPendingResults(nextPending)
        setAiHistory((prev) =>
          prev.map((entry) =>
            entry.id === historyId
              ? { ...entry, success: true, result: pending, provider: response.provider }
              : entry,
          ),
        )
        setAiFeedback((prev) => ({ ...prev, [selectedCard.id]: undefined }))
        showInfo('Revisa la vista previa antes de aplicar los cambios generados por la IA.')
      } catch (err) {
        console.error(err)
        const message = isAiError(err)
          ? mapErrorToUiMessage(err)
          : err instanceof Error
            ? err.message
            : 'No se pudo generar contenido con IA.'
        showError(message)
        setAiHistory((prev) =>
          prev.map((entry) =>
            entry.id === historyId
              ? { ...entry, error: message, success: false }
              : entry,
          ),
        )
      } finally {
        setIsGeneratingText(false)
        setAiActiveController(null)
      }
    },
    [
      aiHistory,
      aiOfflineMode,
      aiPendingResults,
      aiPriority,
      aiPromptDraft,
      aiPromptTemplateId,
      aiSafeMode,
      aiTemperature,
      aiVariant,
      basePromptSuggestion,
      promptTemplates,
      project,
      selectedCard,
      showError,
      showInfo,
      syncPendingResults,
      aiProviderHint,
    ],
  )

  const handleGenerateImage = async () => {
    if (!selectedCard || !project) return
    if (aiOfflineMode) {
      showInfo('El modo offline está activo. Desactívalo para generar imágenes con IA.')
      return
    }
    setIsGeneratingImage(true)
    const controller = new AbortController()
    setAiActiveController(controller)
    try {
      const promptSegments: string[] = []

      promptSegments.push(
        `Genera una ilustración para una carta de juego de mesa del proyecto "${project.name}".`,
      )

      if (project.gameContext?.description) {
        promptSegments.push(`Contexto del mundo: ${project.gameContext.description}.`)
      }

      if (project.gameContext?.artStyle) {
        promptSegments.push(`Estilo artístico deseado: ${project.gameContext.artStyle}.`)
      }

      if (selectedCard.imageDescription?.trim()) {
        promptSegments.push(`Descripción específica de la carta: ${selectedCard.imageDescription}.`)
      } else if (selectedCard.actionDescription?.trim()) {
        promptSegments.push(`Acción principal de la carta: ${selectedCard.actionDescription}.`)
      } else if (selectedCard.context?.trim()) {
        promptSegments.push(`Contexto narrativo de la carta: ${selectedCard.context}.`)
      }

      if (selectedCard.icons?.length) {
        promptSegments.push(`Elementos o iconografía sugerida: ${selectedCard.icons.join(', ')}.`)
      }

      const prompt = promptSegments.join(' ')

      const response = await generateImageBase64(prompt, {
        signal: controller.signal,
        providerHint: aiProviderHint,
        promptMetadata: {
          promptType: 'card-image',
          cardId: selectedCard.id,
          priority: aiPriority,
        },
        timeoutMs: aiPriority === 'high' ? 35_000 : undefined,
      })
      const base64 = response.data
      updateCardState({ ...selectedCard, imageUrl: base64 })
    } catch (err) {
      console.error(err)
      const message = isAiError(err)
        ? `No se pudo generar la imagen: ${mapErrorToUiMessage(err)}`
        : err instanceof Error
          ? `No se pudo generar la imagen: ${err.message}`
          : 'No se pudo generar la imagen.'
      showError(message)
    } finally {
      setIsGeneratingImage(false)
      setAiActiveController(null)
    }
  }

  const handleCancelAi = () => {
    if (aiActiveController) {
      aiActiveController.abort()
      setAiActiveController(null)
      showInfo('Operación de IA cancelada por el usuario.')
    }
  }

  const handleManualRetry = () => {
    handleGenerateText({ retry: true }).catch(console.error)
  }

  const handleApplyAiResult = (fields: Array<keyof Card>, overrides: Partial<Card>) => {
    if (!selectedCard) return
    const pending = aiPendingResults[selectedCard.id]
    if (!pending) return

    const previousCard: Card = { ...selectedCard }
    const sanitized = { ...pending.completion, ...overrides }

    const nextCard: Card = { ...selectedCard }

    fields.forEach((field) => {
      if (field === 'icons') {
        const value = sanitized.icons ?? selectedCard.icons
        nextCard.icons = Array.isArray(value)
          ? value
          : typeof value === 'string'
            ? value
                .split(',')
                .map((token) => token.trim())
                .filter(Boolean)
            : selectedCard.icons
      } else if (typeof sanitized[field] === 'string') {
        nextCard[field] = sanitized[field] as string
      }
    })

    if (!fields.includes('icons')) {
      nextCard.icons = sanitized.icons ?? selectedCard.icons
    }

    setCardVersions((prev) => {
      const history = prev[selectedCard.id] ?? []
      return {
        ...prev,
        [selectedCard.id]: [previousCard, ...history].slice(0, 5),
      }
    })

    updateCardState(nextCard)

    const nextPending = { ...aiPendingResults }
    delete nextPending[selectedCard.id]
    syncPendingResults(nextPending)
    setAiAutoSavePending(true)
    showInfo('Los cambios se aplicaron correctamente. Guardaremos automáticamente en unos segundos.')
  }

  const handleDiscardAiResult = () => {
    if (!selectedCard) return
    const nextPending = { ...aiPendingResults }
    delete nextPending[selectedCard.id]
    syncPendingResults(nextPending)
  }

  const handleFeedback = (feedback: 'like' | 'dislike') => {
    if (!selectedCard) return
    setAiFeedback((prev) => ({ ...prev, [selectedCard.id]: feedback }))
    if (feedback === 'dislike') {
      setAiPromptDraft((prev) =>
        `${prev}\nObservación del usuario: evita redundancias y refuerza la coherencia temática.`,
      )
      setAiPromptTouched(true)
    }
  }

  const handleContinueGeneration = (fields: Array<keyof Card>) => {
    handleGenerateText({ retry: true, focusFields: fields }).catch(console.error)
  }

  const handleRevertCard = () => {
    if (!selectedCard) return
    const history = cardVersions[selectedCard.id]
    if (!history?.length) return
    const [previous, ...rest] = history
    updateCardState(previous)
    setCardVersions((prev) => ({ ...prev, [selectedCard.id]: rest }))
    showInfo('Se restauró la versión anterior de la carta.')
  }

  const handleUploadCardImage = async (file: File) => {
    if (!projectId || !selectedCard) {
      return { url: selectedCard?.imageUrl ?? '', path: selectedCard?.imagePath ?? '' }
    }
    const result = await uploadImage(projectId, file, { folder: 'cards' })
    const updated: Card = { ...selectedCard, imageUrl: result.url, imagePath: result.path }
    updateCardState(updated)
    return result
  }

  const handleInsertIcons = (icons: string[]) => {
    if (!selectedCard) return
    const mergedIcons = Array.from(new Set([...selectedCard.icons, ...icons]))
    updateCardState({ ...selectedCard, icons: mergedIcons })
  }

  const handleImportResult = useCallback(
    (result: DataImportResult) => {
      if (!project) {
        showError('Debes cargar un proyecto antes de importar datos.')
        return
      }

      const fallbackSize = selectedCard?.size ? cloneCardSize(selectedCard.size) : getDefaultCardSizeSetting()
      const usedIds = new Set(Object.keys(project.cards ?? {}))
      const nextCards: Record<string, Card> = { ...project.cards }
      const nextVersions: Record<string, Card[]> = { ...cardVersions }
      const generatedWarnings: string[] = []
      const createdIds: string[] = []
      let createdCount = 0
      let updatedCount = 0

      result.entries.forEach((entry) => {
        const rawId = entry.id ? sanitizeId(entry.id) : ''
        const candidateId = rawId.length > 0 ? rawId : undefined
        const existing = candidateId ? nextCards[candidateId] : undefined

        if (existing && result.updateExisting) {
          const resolvedSize = resolveImportedSizeSetting(entry.size, existing.size ?? fallbackSize)
          const previousCard = existing
          const updatedCard: Card = { ...existing }

          if (entry.title !== undefined) updatedCard.title = entry.title
          if (entry.type !== undefined) updatedCard.type = entry.type
          if (entry.value !== undefined) updatedCard.value = entry.value
          if (entry.action !== undefined) updatedCard.action = entry.action
          if (entry.actionDescription !== undefined) updatedCard.actionDescription = entry.actionDescription
          if (entry.context !== undefined) updatedCard.context = entry.context
          if (entry.imageDescription !== undefined) updatedCard.imageDescription = entry.imageDescription
          if (entry.icons !== undefined) updatedCard.icons = entry.icons
          if (entry.imageUrl !== undefined) {
            updatedCard.imageUrl = entry.imageUrl.trim().length > 0 ? entry.imageUrl : undefined
          }
          updatedCard.size = cloneCardSize(resolvedSize)

          nextCards[existing.id] = normalizeCard(updatedCard, resolvedSize)
          usedIds.add(existing.id)
          updatedCount += 1
          nextVersions[existing.id] = [previousCard, ...(nextVersions[existing.id] ?? [])].slice(0, 5)
          return
        }

        const resolvedSize = resolveImportedSizeSetting(entry.size, fallbackSize)
        const baseCard = createEmptyCard(cloneCardSize(resolvedSize))
        let newId = candidateId ?? baseCard.id

        if (candidateId && existing && !result.updateExisting) {
          const uniqueId = ensureUniqueCardId(candidateId, usedIds)
          if (uniqueId !== candidateId) {
            generatedWarnings.push(`El ID ${candidateId} ya existía. Se utilizó ${uniqueId} para la nueva carta.`)
          }
          newId = uniqueId
        } else if (usedIds.has(newId)) {
          const uniqueId = ensureUniqueCardId(newId, usedIds)
          if (uniqueId !== newId) {
            generatedWarnings.push(`Se detectó un identificador duplicado (${newId}). Se asignó ${uniqueId}.`)
          }
          newId = uniqueId
        }

        const newCard: Card = {
          ...baseCard,
          id: newId,
          title: entry.title ?? '',
          type: entry.type ?? '',
          value: entry.value ?? '',
          action: entry.action ?? '',
          actionDescription: entry.actionDescription ?? '',
          context: entry.context ?? '',
          imageDescription: entry.imageDescription ?? '',
          icons: entry.icons ?? [],
          imageUrl: entry.imageUrl && entry.imageUrl.trim().length > 0 ? entry.imageUrl : undefined,
          size: cloneCardSize(resolvedSize),
        }

        nextCards[newId] = normalizeCard(newCard, resolvedSize)
        usedIds.add(newId)
        createdIds.push(newId)
        createdCount += 1
      })

      setProject({ ...project, cards: nextCards })
      setCardVersions(nextVersions)
      setDirty(true)

      if (!selectedCardId && createdIds.length > 0) {
        setSelectedCardId(createdIds[0])
      }

      const summary: string[] = []
      if (createdCount > 0) {
        summary.push(`${createdCount} nuevas`)
      }
      if (updatedCount > 0) {
        summary.push(`${updatedCount} actualizadas`)
      }

      if (summary.length > 0) {
        const sourceLabel = result.sourceName ? ` (${result.sourceName})` : ''
        const skippedLabel = result.skipped > 0 ? ` Se omitieron ${result.skipped} filas sin datos.` : ''
        showInfo(`Importación completada${sourceLabel}: ${summary.join(', ')}.${skippedLabel}`)
      } else if (result.skipped > 0) {
        showWarning(`No se generaron cartas nuevas. Se omitieron ${result.skipped} filas sin datos relevantes.`)
      } else {
        showInfo('Los datos importados no generaron cambios en las cartas.')
      }

      const allWarnings = [...generatedWarnings, ...result.warnings]
      if (allWarnings.length > 0) {
        const displayed = allWarnings.slice(0, 3).join(' ')
        const suffix = allWarnings.length > 3 ? ` (+${allWarnings.length - 3} avisos adicionales)` : ''
        showWarning(`Avisos durante la importación: ${displayed}${suffix}`)
      }

      setImportDialogOpen(false)
    },
    [cardVersions, project, selectedCard, selectedCardId, showError, showInfo, showWarning],
  )

  const handleDeleteProject = async () => {
    if (!projectId) return
    if (!confirm('¿Eliminar este proyecto y todas sus cartas?')) return
    try {
      await deleteProject(projectId)
      navigate('/')
      showInfo('Proyecto eliminado correctamente.')
    } catch (err) {
      console.error(err)
      showError('No se pudo eliminar el proyecto.')
    }
  }

  const handleReferenceUpload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!projectId || !project) return
    const form = event.currentTarget
    const fileInput = form.elements.namedItem('reference-image') as HTMLInputElement | null
    const descriptionInput = form.elements.namedItem('reference-description') as HTMLInputElement | null
    const file = fileInput?.files?.[0]
    if (!file) return
    try {
      const result = await uploadImage(projectId, file, { folder: 'reference' })
      setProject((prev) => {
        if (!prev) return prev
        const asset = {
          id: `ref_${Date.now()}`,
          name: file.name,
          path: result.path,
          url: result.url,
          description: descriptionInput?.value ?? '',
        }
        return {
          ...prev,
          assets: {
            ...prev.assets,
            referenceImages: [...(prev.assets.referenceImages ?? []), asset],
          },
        }
      })
      setDirty(true)
      form.reset()
    } catch (err) {
      console.error(err)
      showError('No se pudo subir la referencia.')
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900 p-6">
        <Loader message="Cargando editor..." />
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-900 p-6 text-center text-red-400">
        <p>{loadError}</p>
        <button type="button" onClick={() => navigate('/')}>Volver</button>
      </div>
    )
  }

  if (!project) {
    return null
  }

  return (
    <>
      <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 p-6">
        <ProjectActions
          name={project.name}
          onRename={handleRenameProject}
          onSave={handleSave}
          onNewCard={handleAddCard}
        onImportData={() => setImportDialogOpen(true)}
        onGenerateText={() => handleGenerateText().catch(console.error)}
        onGenerateImage={handleGenerateImage}
        onDelete={handleDeleteProject}
        disableGenerate={!selectedCard || aiOfflineMode}
        isSaving={isSaving}
        isGeneratingText={isGeneratingText}
        isGeneratingImage={isGeneratingImage}
        onCancelAi={handleCancelAi}
        onManualRetry={handleManualRetry}
        canCancel={Boolean(aiActiveController)}
      />

      <AiControlPanel
        promptDraft={aiPromptDraft}
        onPromptChange={(value) => {
          setAiPromptDraft(value)
          setAiPromptTouched(true)
        }}
        onGenerateText={() => handleGenerateText().catch(console.error)}
        onGenerateImage={handleGenerateImage}
        onCancel={handleCancelAi}
        onManualRetry={handleManualRetry}
        isGeneratingText={isGeneratingText}
        isGeneratingImage={isGeneratingImage}
        hasOngoingRequest={Boolean(aiActiveController)}
        safeMode={aiSafeMode}
        onSafeModeChange={setAiSafeMode}
        offlineMode={aiOfflineMode}
        onOfflineModeChange={setAiOfflineMode}
        temperature={aiTemperature}
        onTemperatureChange={setAiTemperature}
        tokenEstimate={tokenEstimate}
        quotaHint={quotaHint}
        promptTemplates={promptTemplates}
        selectedTemplateId={aiPromptTemplateId}
        onSelectTemplate={setAiPromptTemplateId}
        recommendedPrompts={recommendedPrompts}
        hasPendingReview={Boolean(pendingForSelected)}
        onApplyTemplatePrompt={(prompt) => {
          setAiPromptDraft(prompt)
          setAiPromptTouched(true)
        }}
        history={aiHistory}
        priority={aiPriority}
        onPriorityChange={setAiPriority}
        providerOptions={providerOptions}
        providerHint={aiProviderHint}
        onProviderHintChange={setAiProviderHint}
        variant={aiVariant}
        onVariantChange={setAiVariant}
      />

      <section className="grid gap-6 lg:grid-cols-[300px_1fr]">
        <aside className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-800/60 p-4">
          <h2 className="text-lg text-white">Cartas</h2>
          <ul className="flex max-h-[480px] flex-col gap-2 overflow-y-auto pr-2">
            {cards.map((card) => (
              <li key={card.id}>
                <button
                  type="button"
                  onClick={() => setSelectedCardId(card.id)}
                  className={`flex w-full flex-col items-start gap-1 rounded-lg border px-3 py-2 text-left transition ${
                    selectedCardId === card.id
                      ? 'border-primary bg-primary/20 text-white'
                      : 'border-slate-700 bg-slate-800/70 text-slate-200 hover:border-primary'
                  }`}
                >
                  <span className="text-sm font-semibold">{card.title || 'Sin título'}</span>
                  <span className="text-xs text-slate-400">{card.type || 'Tipo indefinido'}</span>
                </button>
              </li>
            ))}
            {!cards.length ? <p className="text-sm text-slate-400">No hay cartas todavía.</p> : null}
          </ul>
        </aside>

        <section className="flex flex-col gap-6">
          <GameContextForm context={project.gameContext} onChange={handleContextChange} />

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-800 bg-slate-800/60 p-4">
              {selectedCard ? (
                <CardForm
                  card={selectedCard}
                  onChange={updateCardState}
                  onDelete={() => handleDeleteCard(selectedCard.id)}
                  onUploadImage={handleUploadCardImage}
                  onRevert={handleRevertCard}
                  canRevert={(cardVersions[selectedCard.id] ?? []).length > 0}
                />
              ) : (
                <p className="text-sm text-slate-400">Selecciona una carta para editarla.</p>
              )}
            </div>
            <div className="flex flex-col gap-4">
              <CardPreview card={selectedCard ?? undefined} context={project.gameContext} />
              <IconGenerator context={project.gameContext} onInsertIcons={handleInsertIcons} />
            </div>
          </div>

          <AiPendingReview
            pending={pendingForSelected}
            currentCard={selectedCard}
            onApply={handleApplyAiResult}
            onDiscard={handleDiscardAiResult}
            onFeedback={handleFeedback}
            feedback={selectedCard ? aiFeedback[selectedCard.id] : undefined}
            onContinueGeneration={handleContinueGeneration}
            history={aiHistory}
            context={project.gameContext}
          />

          <section className="rounded-xl border border-slate-800 bg-slate-800/60 p-4">
            <header className="mb-4">
              <h2 className="text-lg">Assets de referencia</h2>
              <p className="text-sm text-slate-400">
                Sube imágenes de referencia para inspirar la creación de cartas o iconos.
              </p>
            </header>
            <form onSubmit={handleReferenceUpload} className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <label className="flex flex-1 flex-col gap-1 text-sm">
                Archivo
                <input type="file" name="reference-image" accept="image/*" />
              </label>
              <label className="flex flex-1 flex-col gap-1 text-sm">
                Descripción
                <input name="reference-description" placeholder="Opcional" />
              </label>
              <button type="submit" className="sm:w-auto">
                Añadir referencia
              </button>
            </form>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {project.assets.referenceImages?.map((asset) => (
                <li key={asset.id} className="flex flex-col gap-2 rounded-lg border border-slate-700 bg-slate-900/60 p-3">
                  {asset.url ? (
                    <img src={asset.url} alt={asset.name} className="h-32 w-full rounded-lg object-cover" />
                  ) : null}
                  <div>
                    <p className="text-sm font-semibold text-slate-200">{asset.name}</p>
                    {asset.description ? (
                      <p className="text-xs text-slate-400">{asset.description}</p>
                    ) : null}
                    <p className="break-all text-xs text-slate-500">{asset.path}</p>
                  </div>
                </li>
              ))}
              {!project.assets.referenceImages?.length ? (
                <li className="rounded-lg border border-dashed border-slate-700 p-3 text-sm text-slate-500">
                  Sin referencias cargadas.
                </li>
              ) : null}
            </ul>
          </section>
        </section>
      </section>
      </main>
      <DataImportDialog
        open={importDialogOpen}
        onClose={() => setImportDialogOpen(false)}
        onImport={handleImportResult}
      />
    </>
  )
}

export default Editor
