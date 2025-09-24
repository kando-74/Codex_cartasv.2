import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type DocumentData,
  type DocumentSnapshot,
} from 'firebase/firestore'
import { ensureUser, db } from '../lib/firebase'
import type {
  TemplateDefinition,
  TemplateDocument,
  TemplateSummary,
  TemplateVersion,
  TemplateVisibility,
} from '../types'

const COLLECTION = 'templates'

const generateId = (prefix: string): string =>
  `${prefix}_${Math.random().toString(36).slice(2, 10)}`

const defaultDefinition: TemplateDefinition = {
  canvas: {
    width: 0,
    height: 0,
    unit: 'px',
  },
  elements: [],
  slots: [],
  metadata: {},
}

const toDate = (value: unknown): Date | undefined => {
  if (!value) {
    return undefined
  }
  if (value instanceof Date) {
    return value
  }
  if (typeof (value as { toDate?: () => Date })?.toDate === 'function') {
    try {
      return (value as { toDate: () => Date }).toDate()
    } catch (error) {
      console.warn('No se pudo convertir un Timestamp de Firestore a Date', error)
      return undefined
    }
  }
  return undefined
}

const deepClone = <T>(value: T): T => {
  if (value === undefined || value === null) {
    return value as T
  }
  if (typeof structuredClone === 'function') {
    return structuredClone(value)
  }
  return JSON.parse(JSON.stringify(value)) as T
}

const sanitizeTags = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return []
  }
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

const normalizeVisibility = (value: unknown): TemplateVisibility =>
  value === 'public' ? 'public' : 'private'

const mapVersion = (input: unknown): TemplateVersion => {
  const data = (input ?? {}) as Record<string, unknown>
  const versionNumber = typeof data.versionNumber === 'number' ? data.versionNumber : 1
  const definition = deepClone(
    (data.definition as TemplateDefinition | undefined) ?? defaultDefinition,
  )
  return {
    id:
      typeof data.id === 'string' && data.id.length > 0
        ? (data.id as string)
        : generateId('ver'),
    versionNumber,
    label:
      typeof data.label === 'string' && data.label.length > 0
        ? (data.label as string)
        : `Versión ${versionNumber}`,
    changelog:
      typeof data.changelog === 'string' && data.changelog.length > 0
        ? (data.changelog as string)
        : undefined,
    createdAt: toDate(data.createdAt),
    createdBy: typeof data.createdBy === 'string' ? (data.createdBy as string) : '',
    sourceVersionId:
      typeof data.sourceVersionId === 'string' && data.sourceVersionId.length > 0
        ? (data.sourceVersionId as string)
        : undefined,
    definition,
  }
}

const serializeVersion = (version: TemplateVersion): Record<string, unknown> => ({
  id: version.id,
  versionNumber: version.versionNumber,
  label: version.label,
  changelog: version.changelog ?? null,
  createdAt: version.createdAt ?? null,
  createdBy: version.createdBy,
  sourceVersionId: version.sourceVersionId ?? null,
  definition: version.definition,
})

const mergeVersionHistory = (
  current: TemplateVersion,
  history: TemplateVersion[],
  previousCurrent?: TemplateVersion,
): TemplateVersion[] => {
  const items = [...history]
  if (previousCurrent) {
    items.push(previousCurrent)
  }
  items.push(current)

  const map = new Map<string, TemplateVersion>()
  for (const version of items) {
    map.set(version.id, version)
  }

  const merged = Array.from(map.values())
  merged.sort((a, b) => {
    if (a.versionNumber !== b.versionNumber) {
      return a.versionNumber - b.versionNumber
    }
    return (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0)
  })

  return merged
}

const mapTemplateDoc = (snapshot: DocumentSnapshot<DocumentData>): TemplateDocument => {
  const data = snapshot.data()

  if (!data) {
    throw new Error('Documento de plantilla sin datos')
  }

  const currentVersion = mapVersion(data.currentVersion)
  const historyRaw = Array.isArray(data.versionHistory) ? data.versionHistory : []
  const history = historyRaw.map((item) => mapVersion(item))
  const versionHistory = mergeVersionHistory(currentVersion, history)

  const tags = sanitizeTags(data.tags)

  const createdAt = toDate(data.createdAt)
  const updatedAt = toDate(data.updatedAt)

  return {
    id: snapshot.id,
    ownerUid: typeof data.ownerUid === 'string' ? (data.ownerUid as string) : '',
    name: typeof data.name === 'string' && data.name.length > 0 ? (data.name as string) : 'Plantilla sin nombre',
    description:
      typeof data.description === 'string' && data.description.length > 0
        ? (data.description as string)
        : undefined,
    visibility: normalizeVisibility(data.visibility),
    tags,
    category:
      typeof data.category === 'string' && data.category.length > 0
        ? (data.category as string)
        : undefined,
    createdAt,
    updatedAt,
    versionNumber: currentVersion.versionNumber,
    currentVersionLabel: currentVersion.label,
    previewUrl:
      typeof data.previewUrl === 'string' && data.previewUrl.length > 0
        ? (data.previewUrl as string)
        : undefined,
    forkedFrom:
      typeof data.forkedFrom === 'string' && data.forkedFrom.length > 0
        ? (data.forkedFrom as string)
        : undefined,
    forkedFromOwnerUid:
      typeof data.forkedFromOwnerUid === 'string' && data.forkedFromOwnerUid.length > 0
        ? (data.forkedFromOwnerUid as string)
        : undefined,
    forkedFromVersionId:
      typeof data.forkedFromVersionId === 'string' && data.forkedFromVersionId.length > 0
        ? (data.forkedFromVersionId as string)
        : undefined,
    currentVersion,
    versionHistory,
  }
}

const toSummary = (template: TemplateDocument): TemplateSummary => ({
  id: template.id,
  ownerUid: template.ownerUid,
  name: template.name,
  description: template.description,
  visibility: template.visibility,
  tags: [...template.tags],
  category: template.category,
  createdAt: template.createdAt,
  updatedAt: template.updatedAt,
  versionNumber: template.versionNumber,
  currentVersionLabel: template.currentVersionLabel,
  previewUrl: template.previewUrl,
  forkedFrom: template.forkedFrom,
  forkedFromOwnerUid: template.forkedFromOwnerUid,
  forkedFromVersionId: template.forkedFromVersionId,
})

export async function listTemplates(scope: TemplateVisibility): Promise<TemplateSummary[]> {
  const user = await ensureUser()

  const constraints =
    scope === 'private'
      ? [where('ownerUid', '==', user.uid)]
      : [where('visibility', '==', 'public')]

  const q = query(collection(db, COLLECTION), ...constraints)
  const snapshots = await getDocs(q)
  const templates = snapshots.docs.map((docSnap) => mapTemplateDoc(docSnap))

  return templates
    .sort((a, b) => (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0))
    .map((template) => toSummary(template))
}

export async function loadTemplate(templateId: string): Promise<TemplateDocument> {
  const docRef = doc(db, COLLECTION, templateId)
  const snapshot = await getDoc(docRef)

  if (!snapshot.exists()) {
    throw new Error('Plantilla no encontrada')
  }

  return mapTemplateDoc(snapshot)
}

export interface CloneTemplateOptions {
  name?: string
}

export async function cloneTemplate(
  templateId: string,
  options: CloneTemplateOptions = {},
): Promise<TemplateDocument> {
  const user = await ensureUser()
  const docRef = doc(db, COLLECTION, templateId)
  const snapshot = await getDoc(docRef)

  if (!snapshot.exists()) {
    throw new Error('Plantilla no encontrada')
  }

  const source = mapTemplateDoc(snapshot)

  const baseName = options.name?.trim().length ? options.name.trim() : `${source.name} (copia)`
  const now = new Date()

  const clonedVersion: TemplateVersion = {
    ...source.currentVersion,
    id: generateId('ver'),
    versionNumber: 1,
    label: source.currentVersion.label ?? 'Versión 1',
    changelog: `Clonada de ${source.name}`,
    createdAt: now,
    createdBy: user.uid,
    sourceVersionId: source.currentVersion.id,
    definition: deepClone(source.currentVersion.definition ?? defaultDefinition),
  }

  const newDocRef = doc(collection(db, COLLECTION))

  await setDoc(newDocRef, {
    ownerUid: user.uid,
    name: baseName,
    description: source.description ?? '',
    visibility: 'private',
    tags: source.tags,
    category: source.category ?? null,
    previewUrl: source.previewUrl ?? null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    currentVersion: serializeVersion(clonedVersion),
    versionHistory: [serializeVersion(clonedVersion)],
    forkedFrom: source.id,
    forkedFromOwnerUid: source.ownerUid,
    forkedFromVersionId: source.currentVersion.id,
  })

  return {
    id: newDocRef.id,
    ownerUid: user.uid,
    name: baseName,
    description: source.description,
    visibility: 'private',
    tags: [...source.tags],
    category: source.category,
    createdAt: now,
    updatedAt: now,
    versionNumber: clonedVersion.versionNumber,
    currentVersionLabel: clonedVersion.label,
    previewUrl: source.previewUrl,
    forkedFrom: source.id,
    forkedFromOwnerUid: source.ownerUid,
    forkedFromVersionId: source.currentVersion.id,
    currentVersion: clonedVersion,
    versionHistory: [clonedVersion],
  }
}

export interface RestoreTemplateVersionOptions {
  label?: string
  changelog?: string
}

export async function restoreTemplateVersion(
  templateId: string,
  versionId: string,
  options: RestoreTemplateVersionOptions = {},
): Promise<TemplateDocument> {
  const user = await ensureUser()
  const docRef = doc(db, COLLECTION, templateId)
  const snapshot = await getDoc(docRef)

  if (!snapshot.exists()) {
    throw new Error('Plantilla no encontrada')
  }

  const template = mapTemplateDoc(snapshot)

  if (template.ownerUid !== user.uid) {
    throw new Error('No autorizado para modificar esta plantilla')
  }

  const targetVersion =
    template.versionHistory.find((version) => version.id === versionId) ??
    (template.currentVersion.id === versionId ? template.currentVersion : undefined)

  if (!targetVersion) {
    throw new Error('Versión no encontrada')
  }

  const nextVersionNumber = template.currentVersion.versionNumber + 1
  const now = new Date()

  const restoredVersion: TemplateVersion = {
    ...targetVersion,
    id: generateId('ver'),
    versionNumber: nextVersionNumber,
    label:
      options.label && options.label.trim().length > 0
        ? options.label.trim()
        : `Restauración ${nextVersionNumber}`,
    changelog:
      options.changelog && options.changelog.trim().length > 0
        ? options.changelog.trim()
        : `Restaurado a partir de ${targetVersion.label ?? `versión ${targetVersion.versionNumber}`}`,
    createdAt: now,
    createdBy: user.uid,
    sourceVersionId: targetVersion.id,
    definition: deepClone(targetVersion.definition ?? defaultDefinition),
  }

  const history = mergeVersionHistory(restoredVersion, template.versionHistory, template.currentVersion)

  await updateDoc(docRef, {
    currentVersion: serializeVersion(restoredVersion),
    versionHistory: history.map((version) => serializeVersion(version)),
    updatedAt: serverTimestamp(),
  })

  return {
    ...template,
    updatedAt: now,
    versionNumber: restoredVersion.versionNumber,
    currentVersionLabel: restoredVersion.label,
    currentVersion: restoredVersion,
    versionHistory: history,
  }
}
