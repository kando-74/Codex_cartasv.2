import { initializeApp } from 'firebase/app'
import { getAuth, signInAnonymously, type User } from 'firebase/auth'
import { enableIndexedDbPersistence, getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const app = initializeApp(firebaseConfig)
const auth = getAuth(app)
const db = getFirestore(app)
const storage = getStorage(app)

enableIndexedDbPersistence(db).catch((err) => {
  if (process.env.NODE_ENV !== 'production') {
    console.warn('IndexedDb persistence no disponible', err)
  }
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
