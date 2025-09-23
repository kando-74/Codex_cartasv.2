import { FormEvent, useState } from 'react'
import { generateJSON } from '../services/ai'
import type { GameContext, JSONSchema } from '../types'

interface IconGeneratorProps {
  context: GameContext
  onInsertIcons?: (icons: string[]) => void
}

type IconResponse = {
  icons: string[]
  descriptions?: string[]
}

const schema: JSONSchema = {
  title: 'CardforgeIconSuggestions',
  type: 'object',
  properties: {
    icons: {
      type: 'array',
      items: {
        type: 'string',
      },
    },
    descriptions: {
      type: 'array',
      items: {
        type: 'string',
      },
    },
  },
  required: ['icons'],
  additionalProperties: false,
}

const IconGenerator = ({ context, onInsertIcons }: IconGeneratorProps) => {
  const [prompt, setPrompt] = useState('Genera 5 iconos memorables relacionados con el tema actual.')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<IconResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleGenerate = async (event: FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const contextSummary = `Descripción: ${context.description || 'sin descripción'}. Estilo: ${context.artStyle || 'libre'}.`
      const response = await generateJSON<IconResponse>(
        `${prompt}\nContexto del juego: ${contextSummary}`,
        schema,
        {
          systemPrompt:
            'Eres un generador de ideas de iconografía para juegos de cartas. Devuelve únicamente JSON válido con iconos descriptivos.',
        },
      )
      setResult(response)
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'Error generando iconos')
    } finally {
      setLoading(false)
    }
  }

  const handleInsert = (icons: string[]) => {
    if (!icons.length || !onInsertIcons) return
    onInsertIcons(icons)
  }

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-slate-800 bg-slate-800/60 p-4">
      <header className="flex flex-col gap-1">
        <h2 className="text-lg">Sugerencias de iconos (IA)</h2>
        <p className="text-sm text-slate-400">Utiliza la IA para generar iconografía alineada al contexto.</p>
      </header>
      <form onSubmit={handleGenerate} className="flex flex-col gap-3">
        <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={3} />
        <button type="submit" disabled={loading}>
          {loading ? 'Generando...' : 'Generar iconos'}
        </button>
      </form>
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      {result ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            {result.icons.map((icon) => (
              <span key={icon} className="rounded-full bg-slate-700/70 px-2 py-1 text-xs text-slate-100">
                {icon}
              </span>
            ))}
          </div>
          {result.descriptions?.length ? (
            <ul className="list-disc space-y-1 pl-6 text-sm text-slate-300">
              {result.descriptions.map((description, index) => (
                <li key={index}>{description}</li>
              ))}
            </ul>
          ) : null}
          <div>
            <button type="button" onClick={() => handleInsert(result.icons)} className="bg-primary px-3 py-1">
              Insertar iconos en la carta
            </button>
          </div>
        </div>
      ) : null}
    </section>
  )
}

export default IconGenerator
