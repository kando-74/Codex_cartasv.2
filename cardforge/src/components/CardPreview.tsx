import type { Card, GameContext } from '../types'

interface CardPreviewProps {
  card?: Card
  context: GameContext
}

const CardPreview = ({ card, context }: CardPreviewProps) => {
  if (!card) {
    return (
      <div className="flex h-96 w-full items-center justify-center rounded-xl border border-dashed border-slate-700 bg-slate-800/60 text-slate-500">
        Selecciona una carta para ver la vista previa.
      </div>
    )
  }

  return (
    <article className="relative h-96 w-full overflow-hidden rounded-xl border border-slate-700 bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 shadow-xl">
      {card.imageUrl ? (
        <img src={card.imageUrl} alt={card.title} className="absolute inset-0 h-full w-full object-cover opacity-60" />
      ) : null}
      <div className="relative flex h-full flex-col justify-between p-6">
        <header className="flex items-center justify-between">
          <h3 className="text-2xl font-bold text-white drop-shadow">{card.title || 'Sin título'}</h3>
          <span className="rounded-full bg-black/50 px-3 py-1 text-sm font-semibold text-white">{card.value || '0'}</span>
        </header>
        <div className="flex flex-col gap-2">
          <p className="text-sm uppercase tracking-wide text-slate-200">{card.type || 'Tipo'}</p>
          <p className="text-base text-slate-100">{card.action || 'Acción por definir'}</p>
          <p className="text-sm text-slate-200/90">{card.actionDescription || 'Describe el efecto de la carta.'}</p>
          <p className="text-xs text-slate-300/70">Contexto: {card.context || context.description || 'Sin contexto'}</p>
          <div className="flex flex-wrap gap-1 text-xs text-slate-200">
            {card.icons.length ? card.icons.map((icon) => (
              <span key={icon} className="rounded-full bg-black/40 px-2 py-0.5">
                {icon}
              </span>
            )) : (
              <span className="text-slate-400">Sin iconos</span>
            )}
          </div>
        </div>
        <footer className="text-xs text-slate-300/60">
          Estilo: {context.artStyle || 'Sin estilo definido'}
          {context.isStyleLocked ? ' (bloqueado)' : ''}
        </footer>
      </div>
    </article>
  )
}

export default CardPreview
