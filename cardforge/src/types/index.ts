export interface GameContext {
  description: string
  artStyle: string
  isStyleLocked: boolean
}

export interface CardSizeSetting {
  width: number
  height: number
  unit?: 'mm'
  presetId?: string
}

export interface AssetMeta {
  id: string
  name: string
  path: string
  url?: string
  description?: string
}

export interface ProjectAssets {
  referenceImages: AssetMeta[]
  availableIcons: AssetMeta[]
}

export interface Card {
  id: string
  title: string
  type: string
  value: string
  action: string
  actionDescription: string
  context: string
  imageDescription: string
  icons: string[]
  imageUrl?: string
  imagePath?: string
  thumbPath?: string
  size?: CardSizeSetting
}

export interface Project {
  id: string
  ownerUid: string
  name: string
  gameContext: GameContext
  cards: Record<string, Card>
  assets: ProjectAssets
  createdAt?: Date
  updatedAt?: Date
}

export interface ProjectListItem {
  id: string
  name: string
  updatedAt?: Date
  cardCount: number
}

export interface JSONSchema {
  title?: string
  type: string
  properties?: Record<string, unknown>
  items?: unknown
  required?: string[]
  additionalProperties?: boolean
}
