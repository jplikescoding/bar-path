import { sortByNewest, type SavedAnalysis } from './librarySupport'

// Minimal IndexedDB wrapper (no external deps) for persisting completed analyses.
// DB `bar-path`, object store `analyses` keyed by `id`. Videos are stored as Blobs,
// which IndexedDB handles natively (unlike localStorage).

const DB_NAME = 'bar-path'
const STORE = 'analyses'
const VERSION = 1

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function tx(db: IDBDatabase, mode: IDBTransactionMode): IDBObjectStore {
  return db.transaction(STORE, mode).objectStore(STORE)
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function saveAnalysis(a: SavedAnalysis): Promise<void> {
  const db = await openDB()
  try {
    await wrap(tx(db, 'readwrite').put(a))
  } finally {
    db.close()
  }
}

export async function listAnalyses(): Promise<SavedAnalysis[]> {
  const db = await openDB()
  try {
    const all = await wrap(tx(db, 'readonly').getAll() as IDBRequest<SavedAnalysis[]>)
    return sortByNewest(all)
  } finally {
    db.close()
  }
}

export async function getAnalysis(id: string): Promise<SavedAnalysis | undefined> {
  const db = await openDB()
  try {
    return await wrap(tx(db, 'readonly').get(id) as IDBRequest<SavedAnalysis | undefined>)
  } finally {
    db.close()
  }
}

export async function deleteAnalysis(id: string): Promise<void> {
  const db = await openDB()
  try {
    await wrap(tx(db, 'readwrite').delete(id))
  } finally {
    db.close()
  }
}
