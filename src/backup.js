// Export, encrypted backup and verification. Works in browsers and Node (WebCrypto).
// Backup format (JSON): { format:'lifeos-backup', version:1, kdf:{name:'PBKDF2',hash:'SHA-256',iterations,salt},
//   cipher:{name:'AES-GCM',iv}, createdAt, ciphertext } — all binary fields base64.
// The passphrase is never stored; losing it means the backup cannot be opened.
import { buildExport, validateExport } from './model.js';

const ITERATIONS = 310000;
const enc = new TextEncoder();
const dec = new TextDecoder();

function b64(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function unb64(s) { const bin = atob(s); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }

export function cryptoAvailable() { return !!globalThis.crypto?.subtle; }

async function deriveKey(passphrase, salt, iterations) {
  const material = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function digest(text) { return b64(await crypto.subtle.digest('SHA-256', enc.encode(text))); }

/** Fingerprint of a record set: sorted ids + content hash. Used to verify backup/restore. */
export async function fingerprint(records) {
  const sorted = [...records].sort((a, b) => a.id.localeCompare(b.id));
  return { count: sorted.length, hash: await digest(JSON.stringify(sorted)) };
}

export async function encryptBackup(records, passphrase, meta = {}, now) {
  if (!cryptoAvailable()) throw new Error('Encryption needs a secure (https) connection in this browser.');
  if (typeof passphrase !== 'string' || passphrase.length < 10) throw new Error('Use a passphrase of at least 10 characters.');
  const payload = JSON.stringify(buildExport(records, meta, now));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, ITERATIONS);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(payload));
  return JSON.stringify({
    format: 'lifeos-backup', version: 1, createdAt: new Date(now ?? Date.now()).toISOString(),
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: ITERATIONS, salt: b64(salt) },
    cipher: { name: 'AES-GCM', iv: b64(iv) }, ciphertext: b64(ct),
  });
}

/** Parse any supported file: encrypted backup (needs passphrase) or plain export. Never mutates anything. */
export async function openBackupFile(text, passphrase) {
  let outer;
  try { outer = JSON.parse(text); } catch { throw new Error('This file is not valid LifeOS data (damaged or wrong file).'); }
  if (outer?.format === 'lifeos-export') return { encrypted: false, data: validateExport(outer) };
  if (outer?.format !== 'lifeos-backup') throw new Error('This file is not a LifeOS backup or export.');
  if (outer.version !== 1) throw new Error(`Unsupported backup version ${outer.version}.`);
  if (!cryptoAvailable()) throw new Error('Decryption needs a secure (https) connection in this browser.');
  if (!passphrase) throw new Error('Enter the passphrase for this backup.');
  let plain;
  try {
    const key = await deriveKey(passphrase, unb64(outer.kdf.salt), outer.kdf.iterations);
    plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(outer.cipher.iv) }, key, unb64(outer.ciphertext));
  } catch {
    throw new Error('Could not open the backup: wrong passphrase, or the file is damaged.');
  }
  let data;
  try { data = JSON.parse(dec.decode(plain)); } catch { throw new Error('Backup content is damaged.'); }
  return { encrypted: true, createdAt: outer.createdAt, data: validateExport(data) };
}

/** Create a backup and prove it can be opened again with the same passphrase before handing it out. */
export async function createVerifiedBackup(records, passphrase, meta, now) {
  const text = await encryptBackup(records, passphrase, meta, now);
  const reopened = await openBackupFile(text, passphrase);
  const [a, b] = await Promise.all([fingerprint(records), fingerprint(reopened.data.records)]);
  if (a.count !== b.count || a.hash !== b.hash) throw new Error('Backup verification failed — the file does not match your data.');
  return { text, fingerprint: a, counts: reopened.data.counts };
}
