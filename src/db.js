// IndexedDB storage. One store for all records (indexed by type) + a meta store.
const DB_NAME = 'lifeos';
const DB_VERSION = 1;

function req(r) { return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
function done(tx) {
  return new Promise((res, rej) => {
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error ?? new Error('Storage transaction failed.'));
    tx.onabort = () => rej(tx.error ?? new Error('Storage transaction was aborted.'));
  });
}

export async function openDb() {
  if (!('indexedDB' in globalThis)) throw new Error('This browser has no local database (IndexedDB).');
  const open = indexedDB.open(DB_NAME, DB_VERSION);
  open.onupgradeneeded = () => {
    const db = open.result;
    if (!db.objectStoreNames.contains('records')) db.createObjectStore('records', { keyPath: 'id' }).createIndex('type', 'type');
    if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
  };
  const db = await req(open);
  db.onversionchange = () => { db.close(); location.reload(); };
  return db;
}

export async function loadAll(db) {
  const tx = db.transaction(['records'], 'readonly');
  return req(tx.objectStore('records').getAll());
}

/** Write several records atomically: all succeed or none do. */
export async function putMany(db, records) {
  const tx = db.transaction(['records'], 'readwrite');
  const store = tx.objectStore('records');
  for (const r of records) store.put(r);
  await done(tx);
}

export async function deleteRecord(db, id) {
  const tx = db.transaction(['records'], 'readwrite');
  tx.objectStore('records').delete(id);
  await done(tx);
}

/** Replace everything in one transaction (restore). Rolls back automatically on failure. */
export async function replaceAll(db, records) {
  const tx = db.transaction(['records'], 'readwrite');
  const store = tx.objectStore('records');
  store.clear();
  for (const r of records) store.put(r);
  await done(tx);
}

export async function getMeta(db, key) {
  const tx = db.transaction(['meta'], 'readonly');
  const row = await req(tx.objectStore('meta').get(key));
  return row?.value ?? null;
}
export async function setMeta(db, key, value) {
  const tx = db.transaction(['meta'], 'readwrite');
  tx.objectStore('meta').put({ key, value });
  await done(tx);
}

export async function eraseEverything(db) {
  const tx = db.transaction(['records', 'meta'], 'readwrite');
  tx.objectStore('records').clear();
  tx.objectStore('meta').clear();
  await done(tx);
}
