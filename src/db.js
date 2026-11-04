// Minimal IndexedDB wrapper. Shared by the service worker, popup and library page.
// Keep the original database name so existing clips survive the Clipfolio rename.
const DB_NAME = 'clipper-lite';
const STORE = 'clips';

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const store = req.result.createObjectStore(STORE, { keyPath: 'id' });
      store.createIndex('createdAt', 'createdAt');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const result = fn(t.objectStore(STORE));
    t.oncomplete = () => { db.close(); resolve(result.result); };
    t.onerror = () => { db.close(); reject(t.error); };
    t.onabort = () => { db.close(); reject(t.error); };
  });
}

export const putClip = (clip) => tx('readwrite', (s) => s.put(clip));
export const getClip = (id) => tx('readonly', (s) => s.get(id));
export const deleteClip = (id) => tx('readwrite', (s) => s.delete(id));
export const countClips = () => tx('readonly', (s) => s.count());

export async function listClips() {
  const all = await tx('readonly', (s) => s.getAll());
  return all.sort((a, b) => b.createdAt - a.createdAt);
}
