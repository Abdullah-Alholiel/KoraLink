/**
 * Zero-dependency IndexedDB key/value wrapper for the persisted query cache
 * (P2-45). ~60 lines replacing `idb-keyval` — identical contract, one fewer
 * supply-chain dependency.
 *
 * Design notes:
 * - One database, one object store. Keys are strings, values are structured-
 *   cloneable objects (dehydrated React Query state).
 * - Every failure mode REJECTS — callers (query-persister.ts) own the catch,
 *   because only they can decide whether a failed persist/restore is fatal
 *   (it never is: worst case the app behaves exactly as before this feature).
 * - `indexedDB` unavailable (SSR, private-mode Safari edge cases, old shells)
 *   → rejects immediately with a descriptive error; never hangs.
 */

const DB_NAME = 'koralink-query-cache';
const DB_VERSION = 1;
const STORE_NAME = 'clients';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB unavailable in this environment'));
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
      request.onblocked = () => reject(new Error('IndexedDB open blocked'));
    });
    // A failed open must not poison every later call — allow a fresh attempt.
    dbPromise.catch(() => {
      dbPromise = null;
    });
  }
  return dbPromise;
}

function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode);
        const request = run(tx.objectStore(STORE_NAME));
        tx.oncomplete = () => resolve(request.result);
        tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
        tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
      })
  );
}

export async function idbGet<T>(key: string): Promise<T | undefined> {
  return withStore<T>('readonly', (store) => store.get(key) as IDBRequest<T>);
}

export async function idbSet(key: string, value: unknown): Promise<void> {
  await withStore('readwrite', (store) => store.put(value, key));
}

export async function idbRemove(key: string): Promise<void> {
  await withStore('readwrite', (store) => store.delete(key));
}
