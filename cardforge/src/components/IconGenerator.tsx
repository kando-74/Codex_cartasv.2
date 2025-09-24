import { FormEvent, useMemo, useState } from 'react'
import { generateJSON, mapErrorToUiMessage } from '../services/ai'
import type { AiErrorKind, GameContext, JSONSchema } from '../types'
import { useErrorToasts } from './ErrorToastContext'

interface IconGeneratorProps {
  context: GameContext
  onInsertIcons?: (icons: string[]) => void
}

type IconCollectionIcon = {
  name: string
  description: string
  prompt?: string
  variantOf?: string
}

type IconCollectionResponse = {
  theme?: string
  sharedStyle: string
  palette?: string[]
  icons: IconCollectionIcon[]
}

const schema: JSONSchema = {
  title: 'CardforgeIconCollection',
  type: 'object',
  properties: {
    theme: {
      type: 'string',
    },
    sharedStyle: {
      type: 'string',
    },
    palette: {
      type: 'array',
      items: {
        type: 'string',
      },
    },
    icons: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          prompt: { type: 'string' },
          variantOf: { type: 'string' },
        },
        required: ['name', 'description'],
        additionalProperties: false,
      },
    },
  },
  required: ['icons', 'sharedStyle'],
  additionalProperties: false,
}

const IconGenerator = ({ context, onInsertIcons }: IconGeneratorProps) => {
  const [prompt, setPrompt] = useState(
    'Diseña una colección coherente de iconos para este juego. Define el estilo compartido, la paleta sugerida y los motivos visuales que se repetirán.',
  )
  const [iconListInput, setIconListInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<IconCollectionResponse | null>(null)
  const [provider, setProvider] = useState<string | null>(null)
  const { showError } = useErrorToasts()

  const isAiError = (error: unknown): error is { kind: AiErrorKind } =>
    typeof error === 'object' && error !== null && 'kind' in error

  const iconRequests = useMemo(() => {
    const tokens = iconListInput
      .split(/\r?\n|,/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
    const seen = new Set<string>()
    return tokens.filter((item) => {
      const key = item.toLowerCase()
      if (seen.has(key)) {
        return false
      }
      seen.add(key)
      return true
    })
  }, [iconListInput])

  const formatIconListForPrompt = (items: string[]) =>
    items
      .map((icon, index) => `${index + 1}. ${icon}`)
      .join('\n')

  const handleGenerate = async (event: FormEvent) => {
    event.preventDefault()
    if (!iconRequests.length) {
      showError('Añade al menos un icono a la lista para generar la colección.')
      return
    }
    setLoading(true)
    setResult(null)
    try {
      const contextSummary = `Descripción: ${context.description || 'sin descripción'}. Estilo: ${context.artStyle || 'libre'}.`
      const requestedIconsSummary = formatIconListForPrompt(iconRequests)
      const response = await generateJSON<IconCollectionResponse>(
        `${prompt}\nContexto del juego: ${contextSummary}\nLista de iconos requeridos (uno por línea, respeta nombres y variantes):\n${requestedIconsSummary}\nAsegúrate de que todos los iconos compartan un estilo visual coherente, una paleta compatible y elementos recurrentes. Identifica si alguno es una variante de otro e incluye un prompt de referencia para el artista o la IA de imagen.`,
        schema,
        {
          systemPrompt:
            'Eres un generador de colecciones de iconos para juegos de cartas. Devuelve únicamente JSON válido con un plan de iconografía consistente y descriptiva.',
          promptMetadata: { promptType: 'icon-suggestions' },
        },
      )
      setResult(response.data)
      setProvider(response.provider)
    } catch (err) {
      console.error(err)
      const message = isAiError(err)
        ? mapErrorToUiMessage(err)
        : err instanceof Error
          ? err.message
          : 'Error generando iconos'
      showError(message)
    } finally {
      setLoading(false)
    }
  }

  const handleInsert = (icons: string[]) => {
    if (!icons.length || !onInsertIcons) return
    const normalized = icons
      .map((icon) => icon.trim())
      .filter((icon) => icon.length > 0)
    if (!normalized.length) return
    const unique = Array.from(new Set(normalized))
    if (!unique.length) return
    onInsertIcons(unique)
  }

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-slate-800 bg-slate-800/60 p-4">
      <header className="flex flex-col gap-1">
        <h2 className="text-lg">Sugerencias de iconos (IA)</h2>
        <p className="text-sm text-slate-400">
          Genera una colección completa de iconos con un estilo compartido y coherente.
        </p>
      </header>
      <form onSubmit={handleGenerate} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span>Indicaciones generales</span>
          <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={3} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span>Iconos solicitados</span>
          <textarea
            value={iconListInput}
            onChange={(event) => setIconListInput(event.target.value)}
            rows={4}
            placeholder={'Un icono por línea. Ej:\nEspada legendaria\nEscudo ancestral\nEstrella con 1\nEstrella con 2\nEstrella roja con 1'}
          />
          <span className="text-xs text-slate-500">
            Se detectarán {iconRequests.length} iconos. Repite nombres con variaciones para mantener la coherencia.
          </span>
        </label>
        <button type="submit" disabled={loading}>
          {loading ? 'Generando...' : 'Generar colección'}
        </button>
      </form>
      {result ? (
        <div className="flex flex-col gap-3">
          {provider ? (
            <p className="text-xs text-slate-500">Proveedor: {provider}</p>
          ) : null}
          <div className="space-y-2 text-sm text-slate-300">
            {result.theme ? (
              <p>
                <span className="font-medium text-slate-100">Tema:</span> {result.theme}
              </p>
            ) : null}
            <p>
              <span className="font-medium text-slate-100">Estilo compartido:</span> {result.sharedStyle}
            </p>
            {result.palette?.length ? (
              <p>
                <span className="font-medium text-slate-100">Paleta sugerida:</span> {result.palette.join(', ')}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {result.icons.map((icon) => (
              <span key={icon.name} className="rounded-full bg-slate-700/70 px-2 py-1 text-xs text-slate-100">
                {icon.name}
              </span>
            ))}
          </div>
          <div className="flex flex-col gap-3">
            {result.icons.map((icon) => (
              <article key={`${icon.name}-${icon.variantOf ?? 'base'}`} className="rounded-lg border border-slate-700/60 bg-slate-900/60 p-3">
                <header className="mb-1 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-100">{icon.name}</h3>
                  {icon.variantOf ? (
                    <span className="text-xs text-slate-400">Variante de {icon.variantOf}</span>
                  ) : null}
                </header>
                <p className="text-sm text-slate-300">{icon.description}</p>
                {icon.prompt ? (
                  <p className="mt-2 text-xs text-slate-400">
                    <span className="font-medium text-slate-200">Prompt sugerido:</span> {icon.prompt}
                  </p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleInsert([icon.name])}
                    className="bg-primary/80 px-2 py-1 text-xs"
                  >
                    Insertar este icono
                  </button>
                </div>
              </article>
            ))}
          </div>
          <div>
            <button
              type="button"
              onClick={() => handleInsert(result.icons.map((icon) => icon.name))}
              className="bg-primary px-3 py-1"
            >
              Insertar toda la colección
            </button>
          </div>
        </div>
      ) : null}
    </section>
  )
}

export default IconGenerator
