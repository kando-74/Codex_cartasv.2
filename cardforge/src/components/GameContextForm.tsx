import { ChangeEvent } from 'react'
import type { GameContext } from '../types'

interface GameContextFormProps {
  context: GameContext
  onChange: (context: GameContext) => void
}

const GameContextForm = ({ context, onChange }: GameContextFormProps) => {
  const handleChange = (field: keyof GameContext) =>
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const value =
        event.target instanceof HTMLInputElement && event.target.type === 'checkbox'
          ? event.target.checked
          : event.target.value
      onChange({ ...context, [field]: value })
    }

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-800/60 p-4">
      <header>
        <h2 className="text-lg">Contexto del juego</h2>
        <p className="text-sm text-slate-400">Establece el tono general que guiará las cartas.</p>
      </header>
      <label className="flex flex-col gap-1">
        Descripción general
        <textarea
          value={context.description}
          onChange={handleChange('description')}
          rows={3}
          placeholder="Describe la ambientación, narrativa o mecánicas principales"
        />
      </label>
      <label className="flex flex-col gap-1">
        Estilo artístico preferido
        <input
          value={context.artStyle}
          onChange={handleChange('artStyle')}
          placeholder="Ej. ilustración digital oscura, pixel art, acuarela"
        />
      </label>
      <label className="flex items-center gap-2 text-sm text-slate-300">
        <input
          type="checkbox"
          checked={context.isStyleLocked}
          onChange={handleChange('isStyleLocked') as (event: ChangeEvent<HTMLInputElement>) => void}
        />
        Bloquear estilo para todas las cartas
      </label>
    </section>
  )
}

export default GameContextForm
