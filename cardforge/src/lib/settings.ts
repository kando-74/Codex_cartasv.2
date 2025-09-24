import {
  CUSTOM_CARD_SIZE_ID,
  DEFAULT_CARD_SIZE_ID,
  CardSizeSetting,
  cloneCardSize,
  createCardSizeFromPreset,
  ensureValidDimensions,
  getCardSizeOption,
} from './cardSizes'

const STORAGE_KEY = 'cardforge:settings'

interface StoredSettings {
  defaultCardSize: CardSizeSetting
}

const DEFAULT_SETTINGS: StoredSettings = {
  defaultCardSize: createCardSizeFromPreset(DEFAULT_CARD_SIZE_ID),
}

const getStorage = (): Storage | null => {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return null
  }
  return window.localStorage
}

const parseSettings = (value: string | null): StoredSettings | null => {
  if (!value) {
    return null
  }
  try {
    const parsed = JSON.parse(value) as Partial<StoredSettings>
    if (parsed && typeof parsed === 'object' && parsed.defaultCardSize) {
      const normalized = ensureValidDimensions(parsed.defaultCardSize)
      if (normalized.presetId && !getCardSizeOption(normalized.presetId)) {
        normalized.presetId = CUSTOM_CARD_SIZE_ID
      }
      return { defaultCardSize: normalized }
    }
  } catch (error) {
    console.warn('No se pudieron leer las preferencias guardadas, se usarán valores por defecto.', error)
  }
  return null
}

const serializeSettings = (settings: StoredSettings): string => JSON.stringify(settings)

const getDefaultSettings = (): StoredSettings => ({
  defaultCardSize: cloneCardSize(DEFAULT_SETTINGS.defaultCardSize),
})

export const loadSettings = (): StoredSettings => {
  const storage = getStorage()
  if (!storage) {
    return getDefaultSettings()
  }
  const stored = parseSettings(storage.getItem(STORAGE_KEY))
  if (!stored) {
    return getDefaultSettings()
  }
  return {
    defaultCardSize: cloneCardSize(stored.defaultCardSize),
  }
}

export const saveSettings = (settings: StoredSettings): void => {
  const storage = getStorage()
  if (!storage) {
    return
  }
  storage.setItem(STORAGE_KEY, serializeSettings(settings))
}

export const getDefaultCardSizeSetting = (): CardSizeSetting => cloneCardSize(loadSettings().defaultCardSize)

export const setDefaultCardSizeSetting = (size: CardSizeSetting): void => {
  const normalized = ensureValidDimensions(size)
  const presetExists = normalized.presetId && getCardSizeOption(normalized.presetId)
  const presetId = presetExists ? normalized.presetId : CUSTOM_CARD_SIZE_ID
  saveSettings({
    defaultCardSize: {
      presetId,
      width: normalized.width,
      height: normalized.height,
      unit: 'mm',
    },
  })
}
