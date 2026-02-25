import { openDB, IDBPDatabase } from 'idb';

const DB_NAME = 'journey-photos';
const STORE_NAME = 'photos';

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      },
    });
  }
  return dbPromise;
}

export async function savePhoto(id: string, blob: Blob): Promise<void> {
  const db = await getDb();
  await db.put(STORE_NAME, blob, id);
}

export async function getPhoto(id: string): Promise<Blob | undefined> {
  const db = await getDb();
  return db.get(STORE_NAME, id);
}

export async function deletePhoto(id: string): Promise<void> {
  const db = await getDb();
  await db.delete(STORE_NAME, id);
}

export async function getPhotoUrl(id: string): Promise<string | null> {
  const blob = await getPhoto(id);
  if (!blob) return null;
  return URL.createObjectURL(blob);
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
