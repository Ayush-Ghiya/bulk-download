export interface RunRecord {
  id?: number;
  at: number;
  assetIds: string[];
  zipName: string;
  checksum: string;
  cacheHit: boolean;
  downloadUrl: string;
  expiresAt: string;
}

const DB_NAME = "bulk-download-demo";
const STORE = "runs";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function addRun(record: Omit<RunRecord, "id">): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).add(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function listRuns(): Promise<RunRecord[]> {
  const db = await openDb();
  const rows = await new Promise<RunRecord[]>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result as RunRecord[]);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return rows.sort((a, b) => b.at - a.at);
}

export async function clearRuns(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
