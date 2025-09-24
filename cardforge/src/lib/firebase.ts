import { getApp, getApps, initializeApp, type FirebaseOptions } from 'firebase/app'
import { getAuth, signInAnonymously, type User } from 'firebase/auth'
import { enableIndexedDbPersistence, getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'
import { pushToast } from '../lib/toastBus'

const REQUIRED_FIREBASE_ENV_VARS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
] as const

type FirebaseEnvKey = (typeof REQUIRED_FIREBASE_ENV_VARS)[number]

const readEnvValue = (key: FirebaseEnvKey): string | undefined => {
  const value = import.meta.env?.[key]
  return typeof value === 'string' ? value : undefined
}

const validateFirebaseConfig = (): FirebaseOptions => {
  const missingKeys = REQUIRED_FIREBASE_ENV_VARS.filter((key) => {
    const value = readEnvValue(key)
    return !value || value.trim().length === 0
  })

  if (missingKeys.length > 0) {
    const message = `Faltan variables de entorno de Firebase: ${missingKeys.join(', ')}`
    if (import.meta.env.DEV) {
      console.error(message)
    }
    throw new Error(message)
  }

  return {
    apiKey: readEnvValue('VITE_FIREBASE_API_KEY')!,
    authDomain: readEnvValue('VITE_FIREBASE_AUTH_DOMAIN')!,
    projectId: readEnvValue('VITE_FIREBASE_PROJECT_ID')!,
    storageBucket: readEnvValue('VITE_FIREBASE_STORAGE_BUCKET')!,
    messagingSenderId: readEnvValue('VITE_FIREBASE_MESSAGING_SENDER_ID')!,
    appId: readEnvValue('VITE_FIREBASE_APP_ID')!,
  }
}

const app = getApps().length > 0 ? getApp() : initializeApp(validateFirebaseConfig())
const auth = getAuth(app)
const db = getFirestore(app)
const storage = getStorage(app)

export const indexedDbPersistencePromise = enableIndexedDbPersistence(db).catch((error) => {
  if (import.meta.env.DEV) {
    console.warn('IndexedDb persistence no disponible', error)
  }
  pushToast({
    type: 'warning',
    variant: 'banner',
    durationMs: 0,
    message:
      'La persistencia sin conexión de Firebase no está disponible. Necesitarás conexión activa para ver los últimos datos.',
  })
})

let authPromise: Promise<User> | null = null

export const ensureUser = async (): Promise<User> => {
  if (auth.currentUser) {
    return auth.currentUser
  }
  if (!authPromise) {
    authPromise = signInAnonymously(auth)
      .then(() => {
        if (!auth.currentUser) {
          throw new Error('No se obtuvo el usuario anónimo')
        }
        return auth.currentUser
      })
      .catch((error) => {
        authPromise = null
        throw error
      })
  }
  return authPromise
}

export { app, auth, db, storage }
