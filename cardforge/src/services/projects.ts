import {
  collection,
  deleteDoc,
  deleteField,
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
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { ensureUser, db, storage } from '../lib/firebase'
import type { Card, GameContext, Project, ProjectAssets, ProjectListItem } from '../types'

const COLLECTION = 'projects'

const generateId = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 10)}`

const defaultGameContext: GameContext = {
  description: '',
  artStyle: '',
  isStyleLocked: false,
}

const defaultAssets: ProjectAssets = {
  referenceImages: [],
  availableIcons: [],
  aiState: {
    pendingResults: [],
    updatedAt: new Date(0).toISOString(),
  },
}

const deleteStorageAssets = async (paths: Array<string | undefined>): Promise<void> => {
  const uniquePaths = Array.from(
    new Set(paths.filter((path): path is string => typeof path === 'string' && path.length > 0)),
  )

  if (uniquePaths.length === 0) {
    return
  }

  const deletions = uniquePaths.map((path) => ({
    path,
    promise: deleteObject(ref(storage, path)),
  }))

  const results = await Promise.allSettled(deletions.map((item) => item.promise))

  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      const { path } = deletions[index]
      console.error(
        `No se pudo eliminar el archivo de Storage en la ruta ${path}:`,
        result.reason,
      )
    }
  })
}

const createBaseCard = (): Card => ({
  id: generateId('card'),
  title: '',
  type: '',
  value: '',
  action: '',
  actionDescription: '',
  context: '',
  imageDescription: '',
  icons: [],
  imageUrl: undefined,
  imagePath: undefined,
  thumbPath: undefined,
  size: undefined,
})

const mapProjectDoc = (snapshot: DocumentSnapshot<DocumentData>): Project => {
  const data = snapshot.data()

  if (!data) {
    throw new Error('Documento de proyecto sin datos')
  }

  const createdAt =
    typeof data.createdAt?.toDate === 'function' ? (data.createdAt.toDate() as Date) : undefined
  const updatedAt =
    typeof data.updatedAt?.toDate === 'function' ? (data.updatedAt.toDate() as Date) : undefined

  return {
    id: snapshot.id,
    ownerUid: data.ownerUid as string,
    name: (data.name as string) ?? 'Proyecto sin nombre',
    gameContext: (data.gameContext as GameContext) ?? { ...defaultGameContext },
    cards: (data.cards as Record<string, Card>) ?? {},
    assets: (data.assets as ProjectAssets) ?? { ...defaultAssets },
    createdAt,
    updatedAt,
  }
}

export const sanitizeId = (value: string): string => value.replace(/[^a-zA-Z0-9_]/g, '_')

export const createEmptyCard = (size?: Card['size']): Card => ({
  ...createBaseCard(),
  id: generateId('card'),
  size,
})

export const getDefaultContext = (): GameContext => ({ ...defaultGameContext })

export const getDefaultAssets = (): ProjectAssets => ({
  referenceImages: [...defaultAssets.referenceImages],
  availableIcons: [...defaultAssets.availableIcons],
  aiState: {
    pendingResults: [...(defaultAssets.aiState?.pendingResults ?? [])],
    updatedAt: new Date().toISOString(),
  },
})

export async function createProject(name: string): Promise<Project> {
  const user = await ensureUser()
  const colRef = collection(db, COLLECTION)
  const docRef = doc(colRef)
  const now = new Date()
  const payload = {
    ownerUid: user.uid,
    name,
    gameContext: { ...defaultGameContext },
    cards: {},
    assets: getDefaultAssets(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }
  await setDoc(docRef, payload)
  return {
    id: docRef.id,
    ownerUid: user.uid,
    name,
    gameContext: { ...defaultGameContext },
    cards: {},
    assets: getDefaultAssets(),
    createdAt: now,
    updatedAt: now,
  }
}

export async function listProjects(): Promise<ProjectListItem[]> {
  const user = await ensureUser()
  const q = query(collection(db, COLLECTION), where('ownerUid', '==', user.uid))
  const snapshots = await getDocs(q)
  const projects = snapshots.docs.map((docSnap) => mapProjectDoc(docSnap))
  return projects
    .sort((a, b) => (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0))
    .map((project) => ({
      id: project.id,
      name: project.name,
      updatedAt: project.updatedAt,
      cardCount: Object.keys(project.cards ?? {}).length,
    }))
}

export async function loadProject(projectId: string): Promise<Project> {
  const user = await ensureUser()
  const docRef = doc(db, COLLECTION, projectId)
  const snapshot = await getDoc(docRef)
  if (!snapshot.exists()) {
    throw new Error('Proyecto no encontrado')
  }
  const project = mapProjectDoc(snapshot)
  if (project.ownerUid !== user.uid) {
    throw new Error('No autorizado para acceder a este proyecto')
  }
  return project
}

export interface UpdateProjectInput {
  name?: string
  gameContext?: GameContext
  cards?: Record<string, Card>
  assets?: ProjectAssets
}

export async function updateProject(projectId: string, data: UpdateProjectInput): Promise<void> {
  const docRef = doc(db, COLLECTION, projectId)
  const payload: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  }
  if (data.name !== undefined) payload.name = data.name
  if (data.gameContext !== undefined) payload.gameContext = data.gameContext
  if (data.cards !== undefined) payload.cards = data.cards
  if (data.assets !== undefined) payload.assets = data.assets
  await updateDoc(docRef, payload)
}

export async function renameProject(projectId: string, name: string): Promise<void> {
  await updateProject(projectId, { name })
}

/**
 * Elimina un proyecto y todos sus recursos asociados en Firebase Storage.
 * Para evitar archivos huérfanos, se obtiene primero el documento del proyecto,
 * se intentan borrar todas las rutas encontradas y solo después se elimina el
 * documento de Firestore.
 */
export async function deleteProject(projectId: string): Promise<void> {
  const docRef = doc(db, COLLECTION, projectId)
  const snapshot = await getDoc(docRef)
  const pathsToDelete: Array<string | undefined> = []

  if (snapshot.exists()) {
    const data = snapshot.data()
    const cards = (data?.cards as Record<string, Card> | undefined) ?? {}
    const assets = (data?.assets as ProjectAssets | undefined) ?? {
      referenceImages: [],
      availableIcons: [],
    }

    for (const card of Object.values(cards)) {
      if (card) {
        pathsToDelete.push(card.imagePath, card.thumbPath)
      }
    }

    assets.referenceImages.forEach((asset) => {
      if (asset?.path) {
        pathsToDelete.push(asset.path)
      }
    })
    assets.availableIcons.forEach((asset) => {
      if (asset?.path) {
        pathsToDelete.push(asset.path)
      }
    })
  }

  await deleteStorageAssets(pathsToDelete)
  await deleteDoc(docRef)
}

export interface AddCardInput extends Partial<Card> {
  id?: string
}

export async function addCard(projectId: string, input: AddCardInput = {}): Promise<Card> {
  const docRef = doc(db, COLLECTION, projectId)
  const cardId = sanitizeId(input.id ?? generateId('card'))
  const base = createBaseCard()
  const newCard: Card = {
    ...base,
    ...input,
    id: cardId,
    icons: input.icons ?? [],
  }
  await updateDoc(docRef, {
    [`cards.${cardId}`]: newCard,
    updatedAt: serverTimestamp(),
  })
  return newCard
}

export async function updateCard(projectId: string, cardId: string, data: Partial<Card>): Promise<void> {
  const docRef = doc(db, COLLECTION, projectId)
  const sanitizedId = sanitizeId(cardId)
  const payload: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data)) {
    payload[`cards.${sanitizedId}.${key}`] = value
  }
  payload.updatedAt = serverTimestamp()
  await updateDoc(docRef, payload)
}

export async function removeCard(projectId: string, cardId: string): Promise<void> {
  const docRef = doc(db, COLLECTION, projectId)
  const sanitizedId = sanitizeId(cardId)
  const snapshot = await getDoc(docRef)

  if (snapshot.exists()) {
    const data = snapshot.data()
    const cards = data?.cards as Record<string, Card> | undefined
    const card = cards?.[sanitizedId]

    if (card) {
      await deleteStorageAssets([card.imagePath, card.thumbPath])
    }
  }

  await updateDoc(docRef, {
    [`cards.${sanitizedId}`]: deleteField(),
    updatedAt: serverTimestamp(),
  })
}

export interface UploadImageOptions {
  folder?: 'cards' | 'assets' | 'reference'
}

export interface UploadImageResult {
  url: string
  path: string
}

export async function uploadImage(
  projectId: string,
  file: File,
  options: UploadImageOptions = {},
): Promise<UploadImageResult> {
  const user = await ensureUser()
  const folder = options.folder ?? 'cards'
  const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')
  const path = `projects/${user.uid}/${projectId}/${folder}/${Date.now()}_${safeName}`
  const storageRef = ref(storage, path)
  await uploadBytes(storageRef, file, {
    contentType: file.type,
  })
  const url = await getDownloadURL(storageRef)
  return { url, path }
}
