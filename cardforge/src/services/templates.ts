import {
  collection,
  deleteDoc,
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
import type { Template, TemplateElement, TemplateSummary } from '../types'

const COLLECTION = 'templates'

const DEFAULT_WIDTH = 750
const DEFAULT_HEIGHT = 1050
const DEFAULT_BACKGROUND = '#1f2937'

const emptyTemplateElements: TemplateElement[] = []

const mapTemplateDoc = (snapshot: DocumentSnapshot<DocumentData>): Template => {
  const data = snapshot.data()

  if (!data) {
    throw new Error('Documento de plantilla sin datos')
  }

  const createdAt =
    typeof data.createdAt?.toDate === 'function' ? (data.createdAt.toDate() as Date) : undefined
  const updatedAt =
    typeof data.updatedAt?.toDate === 'function' ? (data.updatedAt.toDate() as Date) : undefined

  return {
    id: snapshot.id,
    ownerUid: (data.ownerUid as string) ?? '',
    name: (data.name as string) ?? 'Plantilla sin nombre',
    width: Number(data.width) || DEFAULT_WIDTH,
    height: Number(data.height) || DEFAULT_HEIGHT,
    background: (data.background as string) ?? DEFAULT_BACKGROUND,
    showGrid: Boolean(data.showGrid ?? true),
    elements: Array.isArray(data.elements)
      ? (data.elements as TemplateElement[])
      : [...emptyTemplateElements],
    createdAt,
    updatedAt,
  }
}

export const createTemplate = async (
  name: string,
  overrides?: Partial<Omit<Template, 'id' | 'ownerUid' | 'createdAt' | 'updatedAt'>>,
): Promise<Template> => {
  const user = await ensureUser()
  const colRef = collection(db, COLLECTION)
  const docRef = doc(colRef)
  const now = new Date()

  const width = overrides?.width ?? DEFAULT_WIDTH
  const height = overrides?.height ?? DEFAULT_HEIGHT

  const payload = {
    ownerUid: user.uid,
    name,
    width,
    height,
    background: overrides?.background ?? DEFAULT_BACKGROUND,
    showGrid: overrides?.showGrid ?? true,
    elements: overrides?.elements ?? [...emptyTemplateElements],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }

  await setDoc(docRef, payload)

  return {
    id: docRef.id,
    ownerUid: user.uid,
    name,
    width,
    height,
    background: payload.background,
    showGrid: payload.showGrid,
    elements: [...payload.elements],
    createdAt: now,
    updatedAt: now,
  }
}

export const listTemplates = async (): Promise<TemplateSummary[]> => {
  const user = await ensureUser()
  const q = query(collection(db, COLLECTION), where('ownerUid', '==', user.uid))
  const snapshots = await getDocs(q)
  const templates = snapshots.docs.map((docSnap) => mapTemplateDoc(docSnap))

  return templates
    .sort((a, b) => (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0))
    .map((template) => ({
      id: template.id,
      name: template.name,
      updatedAt: template.updatedAt,
    }))
}

export const loadTemplate = async (templateId: string): Promise<Template> => {
  const user = await ensureUser()
  const docRef = doc(db, COLLECTION, templateId)
  const snapshot = await getDoc(docRef)

  if (!snapshot.exists()) {
    throw new Error('Plantilla no encontrada')
  }

  const template = mapTemplateDoc(snapshot)

  if (template.ownerUid !== user.uid) {
    throw new Error('No autorizado para acceder a esta plantilla')
  }

  return template
}

export type UpdateTemplateInput = Partial<Omit<Template, 'id' | 'ownerUid' | 'createdAt' | 'updatedAt'>>

export const updateTemplate = async (
  templateId: string,
  data: UpdateTemplateInput,
): Promise<void> => {
  const docRef = doc(db, COLLECTION, templateId)
  const payload: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  }

  if (data.name !== undefined) payload.name = data.name
  if (data.width !== undefined) payload.width = data.width
  if (data.height !== undefined) payload.height = data.height
  if (data.background !== undefined) payload.background = data.background
  if (data.showGrid !== undefined) payload.showGrid = data.showGrid
  if (data.elements !== undefined) payload.elements = data.elements

  await updateDoc(docRef, payload)
}

export const deleteTemplate = async (templateId: string): Promise<void> => {
  const docRef = doc(db, COLLECTION, templateId)
  await deleteDoc(docRef)
}
