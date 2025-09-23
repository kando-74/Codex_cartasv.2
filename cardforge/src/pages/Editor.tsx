import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import CardForm from '../components/CardForm'
import CardPreview from '../components/CardPreview'
import GameContextForm from '../components/GameContextForm'
import IconGenerator from '../components/IconGenerator'
import ProjectActions from '../components/ProjectActions'
import { generateImageBase64, generateJSON } from '../services/ai'
import {
  addCard,
  createEmptyCard,
  deleteProject,
  getDefaultAssets,
  getDefaultContext,
  loadProject,
  removeCard,
  updateProject,
  uploadImage,
} from '../services/projects'
import type { Card, JSONSchema, Project } from '../types'

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

const Editor = () => {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const [project, setProject] = useState<Project | null>(null)
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isGeneratingText, setIsGeneratingText] = useState(false)
  const [isGeneratingImage, setIsGeneratingImage] = useState(false)
  const [dirty, setDirty] = useState(false)

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
        if (!active) {
          return
        }
        setProject({
          ...data,
          gameContext: data.gameContext ?? getDefaultContext(),
          assets: data.assets ?? getDefaultAssets(),
        })
        if (!active) {
          return
        }
        const cardIds = Object.keys(data.cards ?? {})
        setSelectedCardId(cardIds[0] ?? null)
        if (!active) {
          return
        }
        setError(null)
      } catch (err) {
        console.error(err)
        if (!active) {
          return
        }
        setError('No se pudo cargar el proyecto.')
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
  }, [projectId])

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
      setError('No se pudo guardar el proyecto.')
    } finally {
      setIsSaving(false)
    }
  }, [isSaving, project, projectId])

  useEffect(() => {
    if (!project || !projectId) return
    const interval = setInterval(() => {
      if (dirty && !isSaving) {
        handleSave().catch(console.error)
      }
    }, 30_000)
    return () => clearInterval(interval)
  }, [dirty, handleSave, isSaving, project, projectId])

  const updateCardState = (card: Card) => {
    setProject((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        cards: {
          ...prev.cards,
          [card.id]: card,
        },
      }
    })
    setDirty(true)
  }

  const handleContextChange = (nextContext: Project['gameContext']) => {
    setProject((prev) => (prev ? { ...prev, gameContext: nextContext } : prev))
    setDirty(true)
  }

  const handleAddCard = async () => {
    if (!projectId) return
    try {
      const newCard = await addCard(projectId, createEmptyCard())
      setProject((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          cards: {
            ...prev.cards,
            [newCard.id]: newCard,
          },
        }
      })
      setSelectedCardId(newCard.id)
    } catch (err) {
      console.error(err)
      setError('No se pudo crear la carta.')
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
    } catch (err) {
      console.error(err)
      setError('No se pudo eliminar la carta.')
    }
  }

  const handleRenameProject = async (newName: string) => {
    if (!projectId) return
    setProject((prev) => (prev ? { ...prev, name: newName } : prev))
    try {
      await updateProject(projectId, { name: newName })
    } catch (err) {
      console.error(err)
      setError('No se pudo renombrar el proyecto.')
    }
  }

  const handleGenerateText = async () => {
    if (!selectedCard || !project) return
    setIsGeneratingText(true)
    try {
      const contextSummary = `Proyecto: ${project.name}. Contexto: ${project.gameContext.description}. Estilo: ${project.gameContext.artStyle}. Carta actual: ${JSON.stringify({ ...selectedCard, icons: selectedCard.icons })}`
      const completion = await generateJSON<CardCompletion>(
        `${contextSummary}\nGenera o ajusta los campos de la carta manteniendo coherencia temática y balance. Devuelve solo JSON válido.`,
        cardSchema,
        {
          systemPrompt:
            'Eres un diseñador de juegos que redacta cartas equilibradas y temáticas. Mantén coherencia narrativa y devuelve solo JSON.',
        },
      )
      const merged: Card = {
        ...selectedCard,
        ...completion,
        icons: completion.icons ?? selectedCard.icons,
      }
      updateCardState(merged)
    } catch (err) {
      console.error(err)
      setError('No se pudo generar contenido con IA.')
    } finally {
      setIsGeneratingText(false)
    }
  }

  const handleGenerateImage = async () => {
    if (!selectedCard) return
    setIsGeneratingImage(true)
    try {
      const base64 = await generateImageBase64()
      updateCardState({ ...selectedCard, imageUrl: base64 })
    } catch (err) {
      console.error(err)
      setError('No se pudo generar la imagen.')
    } finally {
      setIsGeneratingImage(false)
    }
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

  const handleDeleteProject = async () => {
    if (!projectId) return
    if (!confirm('¿Eliminar este proyecto y todas sus cartas?')) return
    try {
      await deleteProject(projectId)
      navigate('/')
    } catch (err) {
      console.error(err)
      setError('No se pudo eliminar el proyecto.')
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
      setError('No se pudo subir la referencia.')
    }
  }

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-slate-300">Cargando editor...</div>
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-900 p-6 text-center text-red-400">
        <p>{error}</p>
        <button type="button" onClick={() => navigate('/')}>Volver</button>
      </div>
    )
  }

  if (!project) {
    return null
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 p-6">
      <ProjectActions
        name={project.name}
        onRename={handleRenameProject}
        onSave={handleSave}
        onNewCard={handleAddCard}
        onGenerateText={handleGenerateText}
        onGenerateImage={handleGenerateImage}
        onDelete={handleDeleteProject}
        disableGenerate={!selectedCard}
        isSaving={isSaving}
        isGeneratingText={isGeneratingText}
        isGeneratingImage={isGeneratingImage}
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
  )
}

export default Editor
