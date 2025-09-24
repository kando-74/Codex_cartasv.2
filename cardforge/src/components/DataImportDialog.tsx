import {
  ChangeEvent,
  useEffect,
  useMemo,
  useState,
} from 'react'
import {
  CARD_IMPORT_FIELDS,
  autoMapImportFields,
  convertRecordsToImportedCards,
  parseCsvDataset,
  parseJsonDataset,
  sanitizeFieldMapping,
  type DataImportResult,
  type DatasetParseResult,
  type ImportFieldMapping,
} from '../lib/dataImport'

interface DataImportDialogProps {
  open: boolean
  onClose: () => void
  onImport: (result: DataImportResult) => void
}

type CsvDelimiterOption = 'auto' | ',' | ';' | '\t' | '|'

const formatIconSeparator = (value: string): string => {
  if (!value) {
    return ','
  }
  return value.slice(0, 3)
}

const PREVIEW_FIELDS: Array<{ key: keyof DataImportResult['entries'][number]; label: string }> = [
  { key: 'id', label: 'ID' },
  { key: 'title', label: 'Título' },
  { key: 'type', label: 'Tipo' },
  { key: 'value', label: 'Valor' },
  { key: 'action', label: 'Acción' },
  { key: 'actionDescription', label: 'Descripción' },
  { key: 'context', label: 'Contexto' },
  { key: 'imageDescription', label: 'Imagen' },
  { key: 'icons', label: 'Iconos' },
  { key: 'imageUrl', label: 'URL de imagen' },
]

const DataImportDialog = ({ open, onClose, onImport }: DataImportDialogProps) => {
  const [rawInput, setRawInput] = useState('')
  const [format, setFormat] = useState<'csv' | 'json'>('csv')
  const [delimiter, setDelimiter] = useState<CsvDelimiterOption>('auto')
  const [dataset, setDataset] = useState<DatasetParseResult | null>(null)
  const [mapping, setMapping] = useState<ImportFieldMapping>({})
  const [parseError, setParseError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [iconSeparator, setIconSeparator] = useState(',')
  const [updateExisting, setUpdateExisting] = useState(true)
  const [sourceName, setSourceName] = useState<string | undefined>(undefined)

  useEffect(() => {
    if (!open) {
      return
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, onClose])

  useEffect(() => {
    if (!open) {
      return
    }
    setRawInput('')
    setDataset(null)
    setMapping({})
    setParseError(null)
    setSubmitError(null)
    setIconSeparator(',')
    setUpdateExisting(true)
    setSourceName(undefined)
    setFormat('csv')
    setDelimiter('auto')
  }, [open])

  useEffect(() => {
    if (!open) {
      return
    }
    if (!rawInput.trim()) {
      setDataset(null)
      setParseError(null)
      return
    }

    try {
      const nextDataset =
        format === 'csv'
          ? parseCsvDataset(rawInput, delimiter === 'auto' ? undefined : delimiter)
          : parseJsonDataset(rawInput)
      setDataset(nextDataset)
      setParseError(null)
      setMapping((current) => {
        const sanitized = sanitizeFieldMapping(current, nextDataset.columns)
        const hasSelection = Object.values(sanitized).some(Boolean)
        if (hasSelection) {
          return sanitized
        }
        return autoMapImportFields(nextDataset.columns)
      })
    } catch (error) {
      setDataset(null)
      setParseError(error instanceof Error ? error.message : 'No se pudo interpretar el contenido.')
    }
  }, [delimiter, format, open, rawInput])

  const mappedColumnsCount = useMemo(
    () => Object.values(mapping).filter((value) => Boolean(value)).length,
    [mapping],
  )

  const conversionSummary = useMemo(() => {
    if (!dataset || mappedColumnsCount === 0) {
      return null
    }
    return convertRecordsToImportedCards(dataset.records, mapping, { iconSeparator })
  }, [dataset, iconSeparator, mappedColumnsCount, mapping])

  const combinedWarnings = useMemo(() => {
    const warnings: string[] = []
    if (dataset?.warnings) {
      warnings.push(...dataset.warnings)
    }
    if (conversionSummary?.warnings) {
      warnings.push(...conversionSummary.warnings)
    }
    return warnings
  }, [conversionSummary?.warnings, dataset?.warnings])

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }
    setSourceName(file.name)
    const reader = new FileReader()
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : ''
      setRawInput(text)
      const extension = file.name.toLowerCase().split('.').pop()
      if (extension === 'json') {
        setFormat('json')
      } else if (extension === 'csv' || extension === 'txt') {
        setFormat('csv')
      }
    }
    reader.readAsText(file)
  }

  const handleImport = () => {
    setSubmitError(null)
    if (!dataset) {
      setSubmitError('No hay datos que importar. Verifica el contenido proporcionado.')
      return
    }
    if (!conversionSummary || conversionSummary.entries.length === 0) {
      setSubmitError('Asigna al menos una columna válida para generar cartas.')
      return
    }

    onImport({
      ...conversionSummary,
      warnings: combinedWarnings,
      updateExisting,
      sourceName,
    })
    onClose()
  }

  const previewEntries = conversionSummary ? conversionSummary.entries.slice(0, 5) : []

  if (!open) {
    return null
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 text-slate-100 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <header className="flex items-start justify-between border-b border-slate-800 bg-slate-900/80 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Importar datos estructurados</h2>
            <p className="text-sm text-slate-400">
              Automatiza la creación de cartas a partir de archivos CSV o JSON. Ajusta el mapeo de campos antes de aplicar los
              cambios.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-700 px-3 py-1 text-sm text-slate-200 hover:bg-slate-800"
          >
            Cerrar
          </button>
        </header>
        <div className="flex max-h-[70vh] flex-col gap-6 overflow-y-auto px-6 py-6 text-sm">
          <section className="flex flex-col gap-4">
            <h3 className="text-base font-semibold text-white">Origen de datos</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-2 text-sm text-slate-200">
                <span>Archivo CSV o JSON</span>
                <input type="file" accept=".csv,.json,.txt" onChange={handleFileChange} />
                {sourceName ? <span className="text-xs text-slate-400">Archivo seleccionado: {sourceName}</span> : null}
              </label>
              <label className="flex flex-col gap-2 text-sm text-slate-200">
                <span>Formato</span>
                <select
                  value={format}
                  onChange={(event) => setFormat(event.target.value === 'json' ? 'json' : 'csv')}
                  className="rounded border border-slate-700 bg-slate-800/60 px-2 py-1"
                >
                  <option value="csv">CSV</option>
                  <option value="json">JSON</option>
                </select>
              </label>
              {format === 'csv' ? (
                <label className="flex flex-col gap-2 text-sm text-slate-200">
                  <span>Delimitador</span>
                  <select
                    value={delimiter}
                    onChange={(event) => setDelimiter(event.target.value as CsvDelimiterOption)}
                    className="rounded border border-slate-700 bg-slate-800/60 px-2 py-1"
                  >
                    <option value="auto">Detección automática</option>
                    <option value=",">Coma (,)</option>
                    <option value=";">Punto y coma (;)</option>
                    <option value="\t">Tabulación</option>
                    <option value="|">Barra vertical (|)</option>
                  </select>
                  {dataset?.delimiter ? (
                    <span className="text-xs text-slate-400">Delimitador detectado: “{dataset.delimiter}”.</span>
                  ) : null}
                </label>
              ) : null}
              <label className="flex flex-col gap-2 text-sm text-slate-200">
                <span>Separador de iconos</span>
                <input
                  value={iconSeparator}
                  onChange={(event) => setIconSeparator(formatIconSeparator(event.target.value))}
                  maxLength={3}
                  className="rounded border border-slate-700 bg-slate-800/60 px-2 py-1"
                />
                <span className="text-xs text-slate-400">Separa múltiples iconos dentro de la misma celda.</span>
              </label>
            </div>
            <label className="flex flex-col gap-2 text-sm text-slate-200">
              <span>Contenido</span>
              <textarea
                value={rawInput}
                onChange={(event) => setRawInput(event.target.value)}
                rows={8}
                className="min-h-[180px] rounded-lg border border-slate-800 bg-slate-950/60 p-3 font-mono text-xs text-slate-200"
                placeholder="Pega aquí datos CSV o JSON si no deseas usar un archivo."
              />
            </label>
            {parseError ? <p className="text-sm text-red-400">{parseError}</p> : null}
          </section>
          {dataset ? (
            <section className="flex flex-col gap-4">
              <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-base font-semibold text-white">Mapeo de campos</h3>
                  <p className="text-xs text-slate-400">
                    Asocia las columnas del archivo con los campos de la plantilla. Las columnas no asignadas se ignorarán.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setMapping(autoMapImportFields(dataset.columns))}
                  className="self-start rounded-md border border-slate-700 px-3 py-1 text-xs text-slate-200 hover:bg-slate-800"
                >
                  Reasignar automáticamente
                </button>
              </header>
              <div className="grid gap-3 md:grid-cols-2">
                {CARD_IMPORT_FIELDS.map((field) => (
                  <label key={field.field} className="flex flex-col gap-1 text-sm text-slate-200">
                    <span className="font-medium text-slate-100">{field.label}</span>
                    <select
                      value={mapping[field.field] ?? ''}
                      onChange={(event) =>
                        setMapping((current) => ({
                          ...current,
                          [field.field]: event.target.value || undefined,
                        }))
                      }
                      className="rounded border border-slate-700 bg-slate-800/60 px-2 py-1 text-sm"
                    >
                      <option value="">No importar</option>
                      {dataset.columns.map((column) => (
                        <option key={column} value={column}>
                          {column}
                        </option>
                      ))}
                    </select>
                    {field.description ? (
                      <span className="text-xs text-slate-400">{field.description}</span>
                    ) : null}
                  </label>
                ))}
              </div>
              <label className="inline-flex items-center gap-2 text-sm text-slate-200">
                <input
                  type="checkbox"
                  checked={updateExisting}
                  onChange={(event) => setUpdateExisting(event.target.checked)}
                />
                <span>Actualizar cartas existentes si coincide el ID</span>
              </label>
              <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-xs text-slate-300">
                <p>Columnas detectadas: {dataset.columns.length || 0}.</p>
                <p>Registros analizados: {dataset.records.length}.</p>
                {conversionSummary ? (
                  <p>
                    Cartas listas para importar: {conversionSummary.entries.length}. Filas omitidas: {conversionSummary.skipped}.
                  </p>
                ) : (
                  <p>Selecciona al menos una columna para habilitar la importación.</p>
                )}
              </div>
              {combinedWarnings.length ? (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
                  <p className="font-semibold">Avisos</p>
                  <ul className="list-disc pl-5">
                    {combinedWarnings.slice(0, 4).map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                    {combinedWarnings.length > 4 ? (
                      <li>Se omitieron {combinedWarnings.length - 4} avisos adicionales.</li>
                    ) : null}
                  </ul>
                </div>
              ) : null}
              {previewEntries.length ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-800 text-xs text-slate-200">
                    <thead>
                      <tr>
                        {PREVIEW_FIELDS.map((field) => (
                          <th key={field.key as string} className="px-3 py-2 text-left font-semibold">
                            {field.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {previewEntries.map((entry, index) => (
                        <tr key={`${entry.id ?? 'fila'}_${index}`} className="odd:bg-slate-900/40">
                          {PREVIEW_FIELDS.map((field) => {
                            const value = entry[field.key]
                            if (Array.isArray(value)) {
                              return (
                                <td key={field.key as string} className="px-3 py-2">
                                  {value.join(', ')}
                                </td>
                              )
                            }
                            return (
                              <td key={field.key as string} className="px-3 py-2">
                                {value ?? '—'}
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </section>
          ) : null}
        </div>
        <footer className="flex flex-col gap-3 border-t border-slate-800 bg-slate-900/80 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-slate-400">
            {submitError ? <p className="text-red-400">{submitError}</p> : <p>Revisa el resumen antes de importar.</p>}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleImport}
              disabled={!conversionSummary || conversionSummary.entries.length === 0}
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              Importar datos
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}

export default DataImportDialog
