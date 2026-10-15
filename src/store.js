// App state: all records held in memory, written through to IndexedDB.
import { openDb, loadAll, putMany, deleteRecord, replaceAll, getMeta, setMeta, eraseEverything } from './db.js';
import { materializeOccurrences, today } from './model.js';

const listeners = new Set();
export const store = {
  db: null,
  records: [],
  byId: new Map(),
  day: today(),
  meta: { lastBackup: null, lastExport: null, persisted: null, onboarded: false },
};

function index() { store.byId = new Map(store.records.map((r) => [r.id, r])); }
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit(reason) { for (const fn of listeners) fn(reason); }

export const all = () => store.records;
export const ofType = (t) => store.records.filter((r) => r.type === t);
export const get = (id) => store.byId.get(id);

export async function init() {
  store.db = await openDb();
  store.records = await loadAll(store.db);
  index();
  for (const k of Object.keys(store.meta)) store.meta[k] = (await getMeta(store.db, k)) ?? store.meta[k];
  await rollDay(true);
  // day rollover while the app stays open (e.g. installed on a phone)
  const check = () => { if (today() !== store.day) rollDay(); };
  setInterval(check, 60_000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
}

async function rollDay(silent) {
  store.day = today();
  const fresh = materializeOccurrences(ofType('routine'), ofType('occurrence'), store.day);
  if (fresh.length) await commit(fresh, { silent: true });
  if (!silent) emit('day');
}
export async function rematerialize() { await rollDay(true); }

/** Persist records atomically, then update memory. Throws if the write fails (nothing shown as saved). */
export async function commit(records, { silent = false } = {}) {
  const list = (Array.isArray(records) ? records : [records]).filter(Boolean);
  if (!list.length) return;
  await putMany(store.db, list);
  for (const r of list) {
    const i = store.records.findIndex((x) => x.id === r.id);
    if (i >= 0) store.records[i] = r; else store.records.push(r);
    store.byId.set(r.id, r);
  }
  if (list.some((r) => r.type === 'routine')) {
    const fresh = materializeOccurrences(ofType('routine'), ofType('occurrence'), store.day);
    if (fresh.length) { await putMany(store.db, fresh); store.records.push(...fresh); index(); }
  }
  if (!silent) emit('commit');
  requestPersistence();
}

export async function remove(id) {
  await deleteRecord(store.db, id);
  store.records = store.records.filter((r) => r.id !== id);
  index();
  emit('commit');
}

/**
 * Replace all records in one transaction, then verify what was written.
 * If verification fails, the previous data is written back (rollback).
 */
export async function restoreRecords(records, verify) {
  const snapshot = store.records.slice();
  await replaceAll(store.db, records);
  const loaded = await loadAll(store.db);
  let ok = false;
  try { ok = await verify(loaded); } catch { ok = false; }
  if (!ok) {
    await replaceAll(store.db, snapshot);
    store.records = await loadAll(store.db); index(); emit('restore');
    throw new Error('Restore could not be verified — your previous data was put back unchanged.');
  }
  store.records = loaded; index();
  await rollDay(true);
  emit('restore');
  return loaded;
}

export async function setMetaValue(key, value) {
  await setMeta(store.db, key, value);
  store.meta[key] = value;
  emit('meta');
}

export async function eraseAll() {
  await eraseEverything(store.db);
  store.records = []; index();
  store.meta = { lastBackup: null, lastExport: null, persisted: null, onboarded: false };
  emit('restore');
}

let askedPersist = false;
/** Ask the browser not to evict our data (important on iPhone Safari). */
export async function requestPersistence() {
  if (askedPersist || !navigator.storage?.persist) return;
  askedPersist = true;
  try {
    const already = await navigator.storage.persisted();
    const granted = already || (await navigator.storage.persist());
    if (granted !== store.meta.persisted) await setMetaValue('persisted', granted);
  } catch { /* not supported */ }
}
