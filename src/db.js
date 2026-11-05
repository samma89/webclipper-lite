// Minimal IndexedDB wrapper. Shared by the service worker, popup and library page.
// Keep the original database name so existing clips survive the Clipfolio rename.
const DB_NAME = 'clipper-lite';
const DB_VERSION = 2;
const STORE = 'clips';
const FOLDERS = 'folders';

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      const txn = req.transaction;
      let clips;
      if (event.oldVersion < 1) {
        clips = db.createObjectStore(STORE, { keyPath: 'id' });
        clips.createIndex('createdAt', 'createdAt');
      } else {
        clips = txn.objectStore(STORE);
      }
      if (event.oldVersion < 2) {
        // Existing clips need no rewrite: all v2 fields are optional.
        db.createObjectStore(FOLDERS, { keyPath: 'id' });
        if (!clips.indexNames.contains('folderId')) clips.createIndex('folderId', 'folderId');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Runs fn(stores) in one transaction over the given store names. fn returns a
// value or an IDBRequest; the resolved value is the request result (or value).
async function run(storeNames, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    let t;
    let out;
    try {
      t = db.transaction(storeNames, mode);
      out = fn(...storeNames.map((n) => t.objectStore(n)), t);
    } catch (err) {
      db.close();
      reject(err);
      return;
    }
    t.oncomplete = () => {
      db.close();
      resolve(out !== null && typeof out === 'object' && 'result' in out ? out.result : out);
    };
    t.onerror = () => { db.close(); reject(t.error); };
    t.onabort = () => { db.close(); reject(t.error); };
  });
}

const tx = (mode, fn) => run([STORE], mode, (s) => fn(s));

export const putClip = (clip) => tx('readwrite', (s) => s.put(clip));
export const getClip = (id) => tx('readonly', (s) => s.get(id));
export const deleteClip = (id) => tx('readwrite', (s) => s.delete(id));
export const countClips = () => tx('readonly', (s) => s.count());

export async function listClips() {
  const all = await tx('readonly', (s) => s.getAll());
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function listFolders() {
  const all = await run([FOLDERS], 'readonly', (s) => s.getAll());
  return all.sort((a, b) => a.name.localeCompare(b.name) || a.createdAt - b.createdAt);
}

export const putFolder = (folder) => run([FOLDERS], 'readwrite', (s) => s.put(folder));

// Deletes the folder and unfiles its clips in a single transaction.
export const deleteFolder = (id) =>
  run([FOLDERS, STORE], 'readwrite', (folders, clips) => {
    const cur = clips.index('folderId').openCursor(IDBKeyRange.only(id));
    cur.onsuccess = () => {
      const c = cur.result;
      if (!c) return;
      c.update({ ...c.value, folderId: null, updatedAt: Date.now() });
      c.continue();
    };
    folders.delete(id);
    return undefined;
  });

// Merges patch into the stored clip, stamps updatedAt, returns the new clip.
export async function updateClip(id, patch) {
  return run([STORE], 'readwrite', (s) => {
    let merged = null;
    const get = s.get(id);
    get.onsuccess = () => {
      if (!get.result) return;
      merged = { ...get.result, ...patch, id, updatedAt: Date.now() };
      s.put(merged);
    };
    return { get result() { return merged; } };
  });
}

// Bulk insert/overwrite in a single transaction.
export const putClips = (clips) =>
  run([STORE], 'readwrite', (s) => {
    for (const c of clips) s.put(c);
    return clips.length;
  });
