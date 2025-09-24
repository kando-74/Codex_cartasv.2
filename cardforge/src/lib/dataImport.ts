import { CUSTOM_CARD_SIZE_ID, findMatchingPresetId } from './cardSizes'

export type CardImportField =
  | 'id'
  | 'title'
  | 'type'
  | 'value'
  | 'action'
  | 'actionDescription'
  | 'context'
  | 'imageDescription'
  | 'icons'
  | 'imageUrl'
  | 'sizePresetId'
  | 'sizeWidth'
  | 'sizeHeight'
  | 'sizeUnit'

export interface ImportFieldDefinition {
  field: CardImportField
  label: string
  description?: string
  synonyms: string[]
}

export const CARD_IMPORT_FIELDS: ImportFieldDefinition[] = [
  {
    field: 'id',
    label: 'ID',
    description: 'Identificador único opcional. Si coincide con una carta existente puede actualizarla.',
    synonyms: ['id', 'identificador', 'codigo', 'code', 'cardid'],
  },
  {
    field: 'title',
    label: 'Título',
    synonyms: ['titulo', 'title', 'nombre', 'name'],
  },
  {
    field: 'type',
    label: 'Tipo',
    synonyms: ['tipo', 'type', 'category', 'categoria'],
  },
  {
    field: 'value',
    label: 'Valor',
    synonyms: ['valor', 'value', 'coste', 'cost', 'poder', 'power'],
  },
  {
    field: 'action',
    label: 'Acción corta',
    synonyms: ['accion', 'action', 'resumen', 'summary', 'subtitle'],
  },
  {
    field: 'actionDescription',
    label: 'Descripción de la acción',
    synonyms: ['descripcion', 'description', 'textolargo', 'rules', 'actiondescription', 'effect', 'ability'],
  },
  {
    field: 'context',
    label: 'Contexto',
    synonyms: ['contexto', 'context', 'lore', 'ambientacion', 'setting'],
  },
  {
    field: 'imageDescription',
    label: 'Descripción de imagen',
    synonyms: ['imagedescription', 'prompt', 'imagen', 'arte', 'imageprompt', 'artprompt'],
  },
  {
    field: 'icons',
    label: 'Iconos',
    description: 'Lista separada por comas o múltiples valores.',
    synonyms: ['iconos', 'icons', 'simbolos', 'tags'],
  },
  {
    field: 'imageUrl',
    label: 'URL de imagen',
    synonyms: ['image', 'imageurl', 'urlimagen', 'arturl'],
  },
  {
    field: 'sizePresetId',
    label: 'Formato/tamaño',
    description: 'ID del preset de tamaño (p. ej. poker, tarot).',
    synonyms: ['formato', 'preset', 'size', 'sizepreset', 'tamano'],
  },
  {
    field: 'sizeWidth',
    label: 'Ancho (mm)',
    synonyms: ['ancho', 'width', 'anchomm', 'sizewidth'],
  },
  {
    field: 'sizeHeight',
    label: 'Alto (mm)',
    synonyms: ['alto', 'height', 'altomm', 'sizeheight'],
  },
  {
    field: 'sizeUnit',
    label: 'Unidad tamaño',
    description: 'Unidad opcional (solo mm soportado actualmente).',
    synonyms: ['unidad', 'unit', 'sizeunit'],
  },
]

export interface DatasetRecord {
  rowNumber: number
  values: Record<string, unknown>
}

export interface DatasetParseResult {
  records: DatasetRecord[]
  columns: string[]
  warnings: string[]
  delimiter?: string
}

export interface ImportedCardSize {
  presetId?: string
  width?: number
  height?: number
  unit?: 'mm'
}

export interface ImportedCardData {
  id?: string
  title?: string
  type?: string
  value?: string
  action?: string
  actionDescription?: string
  context?: string
  imageDescription?: string
  icons?: string[]
  imageUrl?: string
  size?: ImportedCardSize
}

export type ImportFieldMapping = Partial<Record<CardImportField, string>>

export interface RecordsConversionResult {
  entries: ImportedCardData[]
  skipped: number
  warnings: string[]
}

export interface DataImportResult extends RecordsConversionResult {
  updateExisting: boolean
  sourceName?: string
}

const normalizeToken = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '')

const detectDelimiter = (line: string): string => {
  const candidates = [',', ';', '\t', '|']
  let best = ','
  let bestCount = -1
  candidates.forEach((delimiter) => {
    const count = line.split(delimiter).length
    if (count > bestCount) {
      best = delimiter
      bestCount = count
    }
  })
  return best
}

const parseCsvLine = (line: string, delimiter: string): string[] => {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (char === '"') {
      const nextChar = line[index + 1]
      if (inQuotes && nextChar === '"') {
        current += '"'
        index += 1
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += char
    }
  }

  result.push(current)
  return result
}

const trimBom = (value: string) => value.replace(/^\ufeff/, '')

export const parseCsvDataset = (raw: string, forcedDelimiter?: string): DatasetParseResult => {
  const normalizedInput = trimBom(raw ?? '')
  const lines = normalizedInput
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line, index, array) => line.length > 0 || index === 0 || index === array.length - 1)
    .filter((line) => line.length > 0)

  if (!lines.length) {
    return { records: [], columns: [], warnings: [], delimiter: forcedDelimiter }
  }

  const delimiter = forcedDelimiter ?? detectDelimiter(lines[0])
  const headerTokens = parseCsvLine(lines[0], delimiter).map((token, index) =>
    token.trim() || `columna_${index + 1}`,
  )
  const columns = Array.from(new Set(headerTokens))
  const warnings: string[] = []
  const records: DatasetRecord[] = []

  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i]
    if (!line.trim()) {
      continue
    }
    const tokens = parseCsvLine(line, delimiter)
    if (tokens.length !== headerTokens.length) {
      warnings.push(
        `Fila ${i + 1}: se esperaban ${headerTokens.length} columnas y se recibieron ${tokens.length}. Se ajustó automáticamente.`,
      )
    }

    const normalizedTokens = [...tokens]
    if (tokens.length > headerTokens.length) {
      const extras = normalizedTokens.splice(headerTokens.length - 1)
      normalizedTokens[headerTokens.length - 1] = `${normalizedTokens[headerTokens.length - 1] ?? ''}${delimiter}${extras.join(delimiter)}`
    } else if (tokens.length < headerTokens.length) {
      while (normalizedTokens.length < headerTokens.length) {
        normalizedTokens.push('')
      }
    }

    const values: Record<string, unknown> = {}
    headerTokens.forEach((key, index) => {
      const rawValue = normalizedTokens[index] ?? ''
      const trimmed = rawValue.trim()
      values[key] = trimmed
    })

    const hasData = Object.values(values).some((value) =>
      typeof value === 'string' ? value.trim().length > 0 : value !== undefined && value !== null,
    )
    if (!hasData) {
      continue
    }

    records.push({ rowNumber: i + 1, values })
  }

  return { records, columns, warnings, delimiter }
}

export const parseJsonDataset = (raw: string): DatasetParseResult => {
  const input = trimBom(raw ?? '')
  if (!input.trim()) {
    return { records: [], columns: [], warnings: [] }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(input)
  } catch (error) {
    throw new Error('No se pudo interpretar el contenido como JSON válido.')
  }

  const warnings: string[] = []
  let candidates: unknown[] = []

  if (Array.isArray(parsed)) {
    candidates = parsed
  } else if (parsed && typeof parsed === 'object') {
    const container = parsed as Record<string, unknown>
    const preferredKeys = ['records', 'data', 'items', 'cards', 'rows']
    for (const key of preferredKeys) {
      const value = container[key]
      if (Array.isArray(value)) {
        candidates = value
        break
      }
    }
    if (!candidates.length) {
      candidates = Object.values(container)
    }
  } else {
    throw new Error('El JSON debe ser un arreglo de objetos o contener un arreglo en una propiedad de alto nivel.')
  }

  const records: DatasetRecord[] = []
  const columnsSet = new Set<string>()
  let discarded = 0

  candidates.forEach((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      discarded += 1
      return
    }
    const values = item as Record<string, unknown>
    Object.keys(values).forEach((key) => columnsSet.add(key))
    records.push({ rowNumber: index + 1, values })
  })

  if (discarded > 0) {
    warnings.push(`Se omitieron ${discarded} registros que no tenían formato de objeto.`)
  }

  return { records, columns: Array.from(columnsSet), warnings }
}

export const sanitizeFieldMapping = (
  mapping: ImportFieldMapping,
  columns: string[],
): ImportFieldMapping => {
  const validColumns = new Set(columns)
  const sanitized: ImportFieldMapping = {}
  Object.entries(mapping).forEach(([field, column]) => {
    if (column && validColumns.has(column)) {
      sanitized[field as CardImportField] = column
    }
  })
  return sanitized
}

export const autoMapImportFields = (columns: string[]): ImportFieldMapping => {
  const normalizedColumns = columns.map((column) => ({
    original: column,
    normalized: normalizeToken(column),
  }))

  const mapping: ImportFieldMapping = {}
  const usedColumns = new Set<string>()

  const pickColumn = (synonyms: string[]): string | undefined => {
    const normalizedSynonyms = synonyms.map(normalizeToken)
    for (const synonym of normalizedSynonyms) {
      const match = normalizedColumns.find(
        (column) => !usedColumns.has(column.original) && column.normalized === synonym,
      )
      if (match) {
        return match.original
      }
    }
    for (const synonym of normalizedSynonyms) {
      const match = normalizedColumns.find(
        (column) => !usedColumns.has(column.original) && column.normalized.includes(synonym),
      )
      if (match) {
        return match.original
      }
    }
    return undefined
  }

  CARD_IMPORT_FIELDS.forEach((definition) => {
    const column = pickColumn(definition.synonyms)
    if (column) {
      mapping[definition.field] = column
      usedColumns.add(column)
    }
  })

  return mapping
}

const coerceText = (value: unknown): string | undefined => {
  if (value === undefined || value === null) {
    return undefined
  }
  if (typeof value === 'string') {
    return value.trim()
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  return undefined
}

const parseNumberValue = (value: unknown): number | undefined => {
  if (value === undefined || value === null) {
    return undefined
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string') {
    const normalized = value.replace(/,/g, '.').trim()
    if (!normalized) {
      return undefined
    }
    const parsed = Number(normalized)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  return undefined
}

const mapRecordToCard = (
  record: DatasetRecord,
  mapping: ImportFieldMapping,
  options: { iconSeparator?: string },
): { card: ImportedCardData | null; warnings: string[] } => {
  const warnings: string[] = []
  const values = record.values

  const getValue = (field: CardImportField) => {
    const column = mapping[field]
    if (!column) {
      return undefined
    }
    return values[column]
  }

  const id = coerceText(getValue('id'))
  const title = coerceText(getValue('title'))
  const type = coerceText(getValue('type'))
  const value = coerceText(getValue('value'))
  const action = coerceText(getValue('action'))
  const actionDescription = coerceText(getValue('actionDescription'))
  const context = coerceText(getValue('context'))
  const imageDescription = coerceText(getValue('imageDescription'))
  const imageUrl = coerceText(getValue('imageUrl'))

  const rawIcons = getValue('icons')
  let icons: string[] | undefined

  if (Array.isArray(rawIcons)) {
    icons = rawIcons
      .map((item) => coerceText(item) ?? '')
      .map((token) => token.trim())
      .filter((token) => token.length > 0)
  } else {
    const textIcons = coerceText(rawIcons)
    if (textIcons && textIcons.length > 0) {
      const separator = options.iconSeparator ?? ','
      icons = textIcons
        .split(separator)
        .map((token) => token.trim())
        .filter((token) => token.length > 0)
    } else if (rawIcons !== undefined && rawIcons !== null) {
      icons = []
    }
  }

  const presetIdRaw = coerceText(getValue('sizePresetId'))
  const widthRaw = getValue('sizeWidth')
  const heightRaw = getValue('sizeHeight')
  const unitRaw = coerceText(getValue('sizeUnit'))

  const width = parseNumberValue(widthRaw)
  if (widthRaw !== undefined && widthRaw !== null && width === undefined) {
    warnings.push(`Fila ${record.rowNumber}: el valor de ancho "${widthRaw}" no es válido.`)
  }
  const height = parseNumberValue(heightRaw)
  if (heightRaw !== undefined && heightRaw !== null && height === undefined) {
    warnings.push(`Fila ${record.rowNumber}: el valor de alto "${heightRaw}" no es válido.`)
  }

  let presetId = presetIdRaw
  if (!presetId && width !== undefined && height !== undefined) {
    presetId = findMatchingPresetId(width, height) ?? CUSTOM_CARD_SIZE_ID
  }

  const size: ImportedCardSize | undefined =
    presetId || width !== undefined || height !== undefined || unitRaw
      ? {
          presetId: presetId ?? undefined,
          width: width ?? undefined,
          height: height ?? undefined,
          unit: unitRaw === 'mm' ? 'mm' : undefined,
        }
      : undefined

  const hasContent =
    Boolean(id) ||
    Boolean(title) ||
    Boolean(type) ||
    Boolean(value) ||
    Boolean(action) ||
    Boolean(actionDescription) ||
    Boolean(context) ||
    Boolean(imageDescription) ||
    Boolean(imageUrl) ||
    (icons && icons.length > 0) ||
    Boolean(size)

  if (!hasContent) {
    return { card: null, warnings }
  }

  const card: ImportedCardData = {}
  if (id) card.id = id
  if (title !== undefined) card.title = title
  if (type !== undefined) card.type = type
  if (value !== undefined) card.value = value
  if (action !== undefined) card.action = action
  if (actionDescription !== undefined) card.actionDescription = actionDescription
  if (context !== undefined) card.context = context
  if (imageDescription !== undefined) card.imageDescription = imageDescription
  if (icons !== undefined) card.icons = icons
  if (imageUrl !== undefined) card.imageUrl = imageUrl
  if (size) card.size = size

  return { card, warnings }
}

export const convertRecordsToImportedCards = (
  records: DatasetRecord[],
  mapping: ImportFieldMapping,
  options: { iconSeparator?: string } = {},
): RecordsConversionResult => {
  const entries: ImportedCardData[] = []
  const warnings: string[] = []
  let skipped = 0

  records.forEach((record) => {
    const { card, warnings: rowWarnings } = mapRecordToCard(record, mapping, options)
    warnings.push(...rowWarnings)
    if (card) {
      entries.push(card)
    } else {
      skipped += 1
    }
  })

  return { entries, skipped, warnings }
}
