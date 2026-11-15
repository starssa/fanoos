// IndexedDB: the equivalent of Kodi's userdata SQLite DBs (Addons, MyVideos) and
// CloudStream's SharedPreferences/DataStore.
const DB_NAME = 'fanoos';
const DB_VERSION = 1;
export type StoreName = 'addons' | 'kv' | 'history' | 'favorites';
const STORES: StoreName[] = ['addons', 'kv', 'history', 'favorites'];

let dbPromise: Promise<IDBDatabase> | null = null;

// When IndexedDB is unavailable (some Firefox private/strict modes, locked-down webviews) keep data
// in memory for this session instead of failing every read and write.
let memory: Record<string, Map<string, unknown>> | null = null;
function mem(s: StoreName): Map<string, unknown> {
  if (!memory) memory = {};
  return memory[s] || (memory[s] = new Map());
}
async function useMemory(): Promise<boolean> {
  if (memory) return true;
  try { await openDb(); return false; } catch {
    console.warn('IndexedDB unavailable: Fanoos data is kept in memory for this session only');
    mem('kv');
    return true;
  }
}

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') throw new Error('IndexedDB is not available');
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const d = req.result;
        STORES.forEach((s) => { if (!d.objectStoreNames.contains(s)) d.createObjectStore(s); });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function wrap<T>(req: IDBRequest): Promise<T> {
  return new Promise((res, rej) => {
    req.onsuccess = () => res(req.result as T);
    req.onerror = () => rej(req.error);
  });
}

async function store(name: StoreName, mode: IDBTransactionMode): Promise<IDBObjectStore> {
  return (await openDb()).transaction(name, mode).objectStore(name);
}

export const db = {
  async get<T>(s: StoreName, key: string): Promise<T | undefined> {
    if (await useMemory()) return mem(s).get(key) as T | undefined;
    return wrap<T | undefined>((await store(s, 'readonly')).get(key));
  },
  async put(s: StoreName, key: string, value: unknown): Promise<void> {
    if (await useMemory()) { mem(s).set(key, value); return; }
    await wrap((await store(s, 'readwrite')).put(value, key));
  },
  async del(s: StoreName, key: string): Promise<void> {
    if (await useMemory()) { mem(s).delete(key); return; }
    await wrap((await store(s, 'readwrite')).delete(key));
  },
  async clear(s: StoreName): Promise<void> {
    if (await useMemory()) { mem(s).clear(); return; }
    await wrap((await store(s, 'readwrite')).clear());
  },
  // Cursor instead of getAll(): getAll needs Chrome 48, Tizen 2017 is Chrome 47.
  async all<T>(s: StoreName): Promise<T[]> {
    if (await useMemory()) return Array.from(mem(s).values()) as T[];
    const os = await store(s, 'readonly');
    return new Promise((res, rej) => {
      const out: T[] = [];
      const req = os.openCursor();
      req.onsuccess = () => {
        const c = req.result;
        if (c) { out.push(c.value as T); c.continue(); } else res(out);
      };
      req.onerror = () => rej(req.error);
    });
  },
};

export const kv = {
  get: <T>(k: string) => db.get<T>('kv', k),
  set: (k: string, v: unknown) => db.put('kv', k, v),
  del: (k: string) => db.del('kv', k),
};

export async function deleteDatabase(): Promise<void> {
  if (dbPromise) { (await dbPromise).close(); dbPromise = null; }
  await new Promise<void>((res, rej) => {
    const r = indexedDB.deleteDatabase(DB_NAME);
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
    r.onblocked = () => res();
  });
}
