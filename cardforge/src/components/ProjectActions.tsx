import { FormEvent, useEffect, useState } from 'react'

interface ProjectActionsProps {
  name: string
  onRename: (newName: string) => Promise<void> | void
  onSave: () => void
  onNewCard: () => void
  onGenerateText: () => void
  onGenerateImage: () => void
  onDelete: () => void
  disableGenerate?: boolean
  isSaving?: boolean
  isGeneratingText?: boolean
  isGeneratingImage?: boolean
}

const ProjectActions = ({
  name,
  onRename,
  onSave,
  onNewCard,
  onGenerateText,
  onGenerateImage,
  onDelete,
  disableGenerate,
  isSaving,
  isGeneratingText,
  isGeneratingImage,
}: ProjectActionsProps) => {
  const [tempName, setTempName] = useState(name)
  const [renaming, setRenaming] = useState(false)

  useEffect(() => {
    setTempName(name)
  }, [name])

  const handleRename = async (event: FormEvent) => {
    event.preventDefault()
    const trimmed = tempName.trim()
    if (!trimmed || trimmed === name) {
      setRenaming(false)
      return
    }
    await onRename(trimmed)
    setRenaming(false)
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-800/70 p-4">
      <header className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        {renaming ? (
          <form onSubmit={handleRename} className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input value={tempName} onChange={(event) => setTempName(event.target.value)} className="w-64" autoFocus />
            <div className="flex gap-2">
              <button type="submit" className="bg-primary px-3 py-1 text-sm">
                Guardar nombre
              </button>
              <button
                type="button"
                onClick={() => {
                  setRenaming(false)
                  setTempName(name)
                }}
                className="bg-slate-700 px-3 py-1 text-sm"
              >
                Cancelar
              </button>
            </div>
          </form>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
            <h1 className="text-2xl font-semibold text-white">{name}</h1>
            <button type="button" onClick={() => setRenaming(true)} className="bg-slate-700 px-3 py-1 text-sm">
              Renombrar
            </button>
          </div>
        )}
        <button type="button" onClick={onDelete} className="bg-red-600 px-3 py-1 text-sm hover:bg-red-700">
          Eliminar proyecto
        </button>
      </header>
      <div className="flex flex-wrap gap-2 text-sm">
        <button type="button" onClick={onNewCard} className="bg-primary px-4 py-2">
          Nueva carta
        </button>
        <button type="button" onClick={onSave} disabled={isSaving} className="bg-slate-700 px-4 py-2">
          {isSaving ? 'Guardando...' : 'Guardar'}
        </button>
        <button
          type="button"
          onClick={onGenerateText}
          disabled={disableGenerate || isGeneratingText}
          className="bg-emerald-600 px-4 py-2 hover:bg-emerald-700 disabled:opacity-60"
        >
          {isGeneratingText ? 'Generando...' : 'Generar texto (IA)'}
        </button>
        <button
          type="button"
          onClick={onGenerateImage}
          disabled={disableGenerate || isGeneratingImage}
          className="bg-indigo-600 px-4 py-2 hover:bg-indigo-700 disabled:opacity-60"
        >
          {isGeneratingImage ? 'Generando...' : 'Generar imagen (IA)'}
        </button>
      </div>
    </section>
  )
}

export default ProjectActions
