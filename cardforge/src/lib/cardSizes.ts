import type { CardSizeSetting } from '../types'

export interface CardSizeOption {
  id: string
  name: string
  width: number
  height: number
}

export const CUSTOM_CARD_SIZE_ID = 'custom'

export const CARD_SIZE_OPTIONS: CardSizeOption[] = [
  { id: 'mini-usa', name: 'Mini USA', width: 40, height: 62 },
  { id: 'mini-chimera', name: 'Mini Chimera', width: 42, height: 64 },
  { id: 'mini-euro', name: 'Mini Euro', width: 44, height: 67 },
  { id: 'tribune', name: 'Tribune', width: 48, height: 92 },
  { id: 'standard-usa', name: 'Standard USA', width: 55, height: 86 },
  { id: 'chimera-ffg', name: 'Chimera (FFG)', width: 56, height: 88 },
  { id: 'euro', name: 'Euro', width: 58, height: 91 },
  { id: 'poker', name: 'Poker', width: 63, height: 88 },
  { id: '7wonders', name: '7 Wonders', width: 64, height: 99 },
  { id: 'tarot-french', name: 'Tarot (French)', width: 60, height: 111 },
  { id: 'tarot-large', name: 'Tarot grande', width: 69, height: 119 },
  { id: 'dixit', name: 'Dixit', width: 80, height: 120 },
  { id: 'oversize', name: 'Oversize', width: 87, height: 124 },
]

export const DEFAULT_CARD_SIZE_ID = 'poker'

const optionById = new Map(CARD_SIZE_OPTIONS.map((option) => [option.id, option]))

export const getCardSizeOption = (id: string): CardSizeOption | undefined => optionById.get(id)

export const isCustomCardSize = (size?: CardSizeSetting | null): boolean => {
  if (!size) {
    return true
  }
  return !size.presetId || size.presetId === CUSTOM_CARD_SIZE_ID
}

export const findMatchingPresetId = (width: number, height: number): string | undefined => {
  return CARD_SIZE_OPTIONS.find((option) => option.width === width && option.height === height)?.id
}

export const createCardSizeFromPreset = (presetId: string): CardSizeSetting => {
  const option = getCardSizeOption(presetId) ?? getCardSizeOption(DEFAULT_CARD_SIZE_ID)
  const target = option ?? CARD_SIZE_OPTIONS[0]
  return {
    presetId: target.id,
    width: target.width,
    height: target.height,
    unit: 'mm',
  }
}

export const cloneCardSize = (size: CardSizeSetting): CardSizeSetting => ({
  presetId: size.presetId,
  width: size.width,
  height: size.height,
  unit: size.unit ?? 'mm',
})

export const formatCardSize = (size: CardSizeSetting | CardSizeOption): string => {
  const width = Number.isFinite(size.width) ? size.width : 0
  const height = Number.isFinite(size.height) ? size.height : 0
  const suffix = 'mm'
  if ('name' in size) {
    return `${size.name} — ${width} × ${height} ${suffix}`
  }
  if (size.presetId) {
    const preset = getCardSizeOption(size.presetId)
    if (preset) {
      return `${preset.name} — ${width} × ${height} ${suffix}`
    }
  }
  return `${width} × ${height} ${suffix}`
}

export const ensureValidDimensions = (size: CardSizeSetting): CardSizeSetting => {
  const fallback = createCardSizeFromPreset(DEFAULT_CARD_SIZE_ID)
  const width = Number.isFinite(size.width) && size.width > 0 ? size.width : fallback.width
  const height = Number.isFinite(size.height) && size.height > 0 ? size.height : fallback.height
  return {
    presetId: size.presetId,
    width,
    height,
    unit: size.unit ?? 'mm',
  }
}
