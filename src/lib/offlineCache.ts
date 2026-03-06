import { openDB } from 'idb';

const DB_NAME = 'command_center_cache';
const STORE = 'dashboard';

const dbPromise = openDB(DB_NAME, 1, {
  upgrade(db) {
    if (!db.objectStoreNames.contains(STORE)) {
      db.createObjectStore(STORE);
    }
  }
});

export async function setDashboardCache(key: string, payload: unknown) {
  const db = await dbPromise;
  await db.put(STORE, payload, key);
}

export async function getDashboardCache<T>(key: string): Promise<T | null> {
  const db = await dbPromise;
  return (await db.get(STORE, key)) ?? null;
}
