// Data screen: storage status, export, encrypted backup, verified restore, erase, install help, effects.
import * as M from './model.js';
import { store, all, restoreRecords, setMetaValue, eraseAll, requestPersistence } from './store.js';
import { createVerifiedBackup, openBackupFile, fingerprint, cryptoAvailable } from './backup.js';
import { h, toast, formDialog, confirmDialog, openModal, fmtStamp } from './ui.js';

function download(text, filename, mime) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename, style: { display: 'none' } });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 4000);
}
const stampName = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
const isIOS = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

function countsTable(counts) {
  const names = { inbox: 'Inbox items', task: 'Tasks', promise: 'Promises', appointment: 'Appointments', routine: 'Routines', occurrence: 'Routine dates', idea: 'Ideas', project: 'Projects', checkin: 'Check-ins' };
  return h('table', { class: 'counts' }, h('tbody', {}, Object.entries(names).map(([k, l]) => h('tr', {}, h('th', { scope: 'row' }, l), h('td', { class: 't-num' }, String(counts[k] ?? 0))))));
}
const currentCounts = () => Object.fromEntries(M.TYPES.map((t) => [t, all().filter((r) => r.type === t).length]));

async function backupFlow() {
  if (!cryptoAvailable()) { toast('Encrypted backup needs the app to be opened over https.', { tone: 'crit', ms: 6000 }); return; }
  await formDialog({
    title: 'Create encrypted backup',
    intro: 'Choose a passphrase. It is never stored — without it the backup cannot be opened. Write it down somewhere safe (not in this app).',
    fields: [
      { name: 'p1', label: 'Passphrase (at least 10 characters)', type: 'password', required: true, autofocus: true },
      { name: 'p2', label: 'Repeat passphrase', type: 'password', required: true },
    ],
    submitLabel: 'Create & verify',
    onSubmit: async (v) => {
      if (v.p1 !== v.p2) throw new Error('The passphrases do not match.');
      const { text, counts, fingerprint: fp } = await createVerifiedBackup(all(), v.p1, { device: navigator.userAgent.slice(0, 80) });
      const name = `lifeos-backup-${stampName()}.lifeos`;
      const info = { at: new Date().toISOString(), file: name, count: fp.count, hash: fp.hash.slice(0, 12), counts };
      const status = h('p', { class: 'hud-msg', role: 'status' });
      const mark = async (how) => { await setMetaValue('lastBackup', { ...info, handedTo: how }); status.textContent = how === 'share' ? 'Handed to the share sheet. Make sure you saved it.' : 'Handed to your browser to save.'; };
      const fileObj = typeof File === 'function' ? new File([text], name, { type: 'application/octet-stream' }) : null;
      const canShare = !!(fileObj && navigator.canShare?.({ files: [fileObj] }));
      // open on next tick so this form dialog closes first
      setTimeout(() => openModal({ title: 'Backup verified', tone: 'green', body: h('div', {},
        h('p', { class: 't-body' }, `The backup was encrypted, opened again with your passphrase and checked against your data: ${fp.count} records match.`),
        h('p', { class: 't-body' }, 'Now save the file somewhere off this device. On iPhone, use Share → “Save to Files”.'),
        countsTable(counts), status),
        actions: [
          h('button', { class: 'btn btn--primary', type: 'button', onclick: () => { download(text, name, 'application/octet-stream'); mark('download'); } }, 'Save backup file'),
          canShare ? h('button', { class: 'btn', type: 'button', onclick: async () => { try { await navigator.share({ files: [fileObj], title: 'LifeOS backup' }); mark('share'); } catch { /* user cancelled */ } } }, 'Share…') : null,
        ].filter(Boolean) }), 0);
    },
  });
}

async function exportFlow() {
  const ok = await confirmDialog({ title: 'Export unencrypted data?', confirmLabel: 'Export readable file',
    message: 'This creates a readable JSON file with everything you entered. Anyone who gets the file can read it. Use an encrypted backup to keep data private.' });
  if (!ok) return;
  const ex = M.buildExport(all(), { note: 'Unencrypted LifeOS export' });
  download(JSON.stringify(ex, null, 2), `lifeos-export-${stampName()}.json`, 'application/json');
  await setMetaValue('lastExport', { at: new Date().toISOString(), count: ex.records.length });
  toast(`Exported ${ex.records.length} records`);
}

async function restoreFlow(file) {
  const text = await file.text();
  let opened;
  let needsPass = false;
  try { const o = JSON.parse(text); needsPass = o?.format === 'lifeos-backup'; } catch { /* handled below */ }
  const doOpen = async (pass) => { opened = await openBackupFile(text, pass); };
  try {
    if (needsPass) {
      const r = await formDialog({ title: 'Open backup', intro: `${file.name}`, fields: [{ name: 'pass', label: 'Backup passphrase', type: 'password', required: true, autofocus: true }],
        submitLabel: 'Open', onSubmit: async (v) => { await doOpen(v.pass); } });
      if (!r) return;
    } else await doOpen();
  } catch (e) { toast(e.message, { tone: 'crit', ms: 6000 }); return; }
  const incoming = opened.data;
  const go = await new Promise((resolve) => {
    let res = false;
    const m = openModal({ title: 'Replace data on this device?', tone: 'amber', onClose: () => resolve(res), body: h('div', {},
      h('p', { class: 't-body' }, `${opened.encrypted ? 'Encrypted backup' : 'Unencrypted export'} from ${fmtStamp(incoming.generatedAt)}. Restoring replaces everything currently on this device with the file's contents.`),
      h('div', { class: 'compare' }, h('div', {}, h('p', { class: 't-label' }, 'On this device now'), countsTable(currentCounts())), h('div', {}, h('p', { class: 't-label' }, 'In the file'), countsTable(incoming.counts))),
      h('p', { class: 'hint' }, 'Tip: make a backup of the current data first if you might need it.')),
      actions: [h('button', { class: 'btn btn--danger', type: 'button', onclick: () => { res = true; m.close(); } }, 'Replace with file'), h('button', { class: 'btn btn--ghost', type: 'button', onclick: () => m.close() }, 'Cancel')] });
  });
  if (!go) return;
  try {
    const expected = await fingerprint(incoming.records);
    await restoreRecords(incoming.records, async (loaded) => { const got = await fingerprint(loaded); return got.count === expected.count && got.hash === expected.hash; });
    openModal({ title: 'Restore verified', tone: 'green', body: h('div', {},
      h('p', { class: 't-body' }, `All ${expected.count} records were written and read back; contents and identities match the file.`), countsTable(incoming.counts)) });
  } catch (e) {
    openModal({ title: 'Restore failed', tone: 'amber', body: h('p', { class: 't-body' }, e.message) });
  }
}

async function eraseFlow() {
  await formDialog({ title: 'Erase everything on this device', tone: 'amber', intro: 'This permanently deletes all your LifeOS data in this browser. Backups you saved elsewhere are not affected.',
    fields: [{ name: 'word', label: 'Type ERASE to confirm', required: true, autofocus: true }], submitLabel: 'Erase all data',
    onSubmit: async (v) => { if (v.word.trim() !== 'ERASE') throw new Error('Type ERASE in capitals to confirm.'); await eraseAll(); toast('All data erased'); location.hash = '#/today'; } });
}

export function dataView() {
  const lb = store.meta.lastBackup;
  const n = all().length;
  const file = h('input', { type: 'file', accept: '.lifeos,.json,application/json,application/octet-stream', class: 'sr-only', id: 'restore-file', onchange: (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) restoreFlow(f); } });
  const persisted = store.meta.persisted;
  return h('div', { class: 'stack boot' },
    h('section', { class: 'panel', 'aria-label': 'Storage' },
      h('div', { class: 'panel__bar' }, h('h2', { class: 'panel__id' }, h('b', {}, '01'), ' // Your data'), h('span', { class: 'panel__status' }, 'Stored only on this device')),
      h('dl', { class: 'kv-list' },
        h('div', { class: 'kv' }, h('dt', { class: 't-label' }, 'Records'), h('dd', { class: 't-num' }, String(n))),
        h('div', { class: 'kv' }, h('dt', { class: 't-label' }, 'Last verified backup'), h('dd', {}, lb ? `${fmtStamp(lb.at)} · ${lb.count} records · ${lb.file}` : h('span', { class: 'warn-text' }, 'None yet'))),
        h('div', { class: 'kv' }, h('dt', { class: 't-label' }, 'Storage'), h('dd', {}, persisted ? h('span', { class: 'led', 'data-state': 'ok' }, 'Persistent — the browser will keep it') :
          h('span', { class: 'led', 'data-state': 'offline' }, 'Not guaranteed — the browser may clear it if space runs low'))),
        h('div', { class: 'kv' }, h('dt', { class: 't-label' }, 'Encryption'), h('dd', {}, cryptoAvailable() ? 'Available' : h('span', { class: 'warn-text' }, 'Unavailable — open the app over https')))),
      persisted ? null : h('button', { class: 'btn btn--sm', type: 'button', onclick: async () => { await requestPersistence(); toast(store.meta.persisted ? 'Storage is now persistent' : 'The browser did not allow it yet. Installing the app usually helps.'); } }, 'Ask browser to keep data')),
    h('section', { class: 'panel', 'data-tone': 'green', 'aria-label': 'Backup and restore' },
      h('div', { class: 'panel__bar' }, h('h2', { class: 'panel__id' }, h('b', {}, '02'), ' // Backup & restore'), h('span', { class: 'panel__status' }, 'Nothing is uploaded')),
      h('p', { class: 'lede' }, 'There is no cloud copy. Make an encrypted backup regularly and keep the file somewhere safe, like a USB stick or your own cloud drive.'),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn btn--primary', type: 'button', onclick: backupFlow }, 'Create encrypted backup'),
        h('label', { class: 'btn', for: 'restore-file', tabindex: '0', onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); file.click(); } } }, 'Restore from file…'), file,
        h('button', { class: 'btn btn--ghost', type: 'button', onclick: exportFlow }, 'Export readable JSON'))),
    h('section', { class: 'panel', 'data-tone': 'cyan', 'aria-label': 'Install' },
      h('div', { class: 'panel__bar' }, h('h2', { class: 'panel__id' }, h('b', {}, '03'), ' // Install & offline'), h('span', { class: 'panel__status' }, standalone() ? 'Installed' : 'In browser')),
      isIOS() ? h('ol', { class: 'steps' }, h('li', {}, 'Tap the Share button in Safari.'), h('li', {}, 'Choose “Add to Home Screen”.'), h('li', {}, 'Open LifeOS from the new icon. iPhone keeps data of installed apps much more reliably.'))
        : h('ol', { class: 'steps' }, h('li', {}, 'In Chrome, click the install icon at the right of the address bar (or menu ⋮ → Cast, save and share → Install).'), h('li', {}, 'LifeOS then opens in its own window and works offline.')),
      h('p', { class: 'hint' }, 'After the first visit everything works without internet.')),
    h('section', { class: 'panel', 'data-tone': 'amber', 'aria-label': 'Display and danger zone' },
      h('div', { class: 'panel__bar' }, h('h2', { class: 'panel__id' }, h('b', {}, '04'), ' // Display & reset')),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn', type: 'button', 'data-fx-toggle': '', 'aria-pressed': String(document.documentElement.dataset.fx === 'low') }, document.documentElement.dataset.fx === 'low' ? 'Effects: low' : 'Effects: full'),
        h('button', { class: 'btn btn--danger', type: 'button', onclick: eraseFlow }, 'Erase all data…')),
      h('p', { class: 'hint' }, 'Low effects turns off the code rain, blur and glow — useful on older phones or to save battery.')));
}
