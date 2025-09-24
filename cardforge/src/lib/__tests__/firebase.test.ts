import { beforeEach, describe, expect, it, vi } from 'vitest'

const initializeAppMock = vi.fn()
const getAppsMock = vi.fn()
const getAppMock = vi.fn()
const getAuthMock = vi.fn(() => ({ currentUser: null }))
const getFirestoreMock = vi.fn()
const getStorageMock = vi.fn()
const enableIndexedDbPersistenceMock = vi.fn(() => Promise.resolve())
const signInAnonymouslyMock = vi.fn(() => Promise.resolve({}))
const pushToastMock = vi.fn()

vi.mock('firebase/app', () => ({
  initializeApp: initializeAppMock,
  getApps: getAppsMock,
  getApp: getAppMock,
}))

vi.mock('firebase/auth', () => ({
  getAuth: getAuthMock,
  signInAnonymously: signInAnonymouslyMock,
}))

vi.mock('firebase/firestore', () => ({
  getFirestore: getFirestoreMock,
  enableIndexedDbPersistence: enableIndexedDbPersistenceMock,
}))

vi.mock('firebase/storage', () => ({
  getStorage: getStorageMock,
}))

const requiredEnv = {
  VITE_FIREBASE_API_KEY: 'key',
  VITE_FIREBASE_AUTH_DOMAIN: 'auth.domain',
  VITE_FIREBASE_PROJECT_ID: 'project',
  VITE_FIREBASE_STORAGE_BUCKET: 'bucket',
  VITE_FIREBASE_MESSAGING_SENDER_ID: 'sender',
  VITE_FIREBASE_APP_ID: 'app',
}

const setEnv = (overrides: Partial<typeof requiredEnv> = {}) => {
  vi.unstubAllEnvs()
  Object.entries({ ...requiredEnv, ...overrides }).forEach(([key, value]) => {
    if (value !== undefined) {
      vi.stubEnv(key, value)
    }
  })
}

beforeEach(async () => {
  vi.resetModules()
  vi.clearAllMocks()
  setEnv()
  const toastModule = await import('../../lib/toastBus')
  vi.spyOn(toastModule, 'pushToast').mockImplementation(pushToastMock)
})

describe('firebase configuration', () => {
  it('initializes app with environment variables when none exists', async () => {
    getAppsMock.mockReturnValueOnce([])
    const fakeApp = { name: 'test-app' }
    initializeAppMock.mockReturnValueOnce(fakeApp)
    getFirestoreMock.mockReturnValueOnce({})
    getStorageMock.mockReturnValueOnce({})

    await import('../firebase')

    expect(initializeAppMock).toHaveBeenCalledWith({
      apiKey: requiredEnv.VITE_FIREBASE_API_KEY,
      authDomain: requiredEnv.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: requiredEnv.VITE_FIREBASE_PROJECT_ID,
      storageBucket: requiredEnv.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: requiredEnv.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: requiredEnv.VITE_FIREBASE_APP_ID,
    })
    expect(getAppMock).not.toHaveBeenCalled()
  })

  it('throws a descriptive error when environment variables are missing', async () => {
    getAppsMock.mockReturnValueOnce([])
    setEnv({ VITE_FIREBASE_PROJECT_ID: undefined })

    await expect(import('../firebase')).rejects.toThrow(/VITE_FIREBASE_PROJECT_ID/)
    expect(initializeAppMock).not.toHaveBeenCalled()
  })

  it('reuses an existing app instance when available', async () => {
    getAppsMock.mockReturnValueOnce([{}])
    getAppMock.mockReturnValueOnce({ name: 'existing' })

    await import('../firebase')

    expect(initializeAppMock).not.toHaveBeenCalled()
    expect(getAppMock).toHaveBeenCalled()
  })

  it('emits a warning toast when persistence fails', async () => {
    getAppsMock.mockReturnValueOnce([])
    enableIndexedDbPersistenceMock.mockImplementationOnce(() => Promise.reject(new Error('blocked')))

    const { indexedDbPersistencePromise } = await import('../firebase')
    await indexedDbPersistencePromise

    expect(pushToastMock).toHaveBeenCalled()
  })
})
