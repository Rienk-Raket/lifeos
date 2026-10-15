// Small DOM toolkit: element builder, icons, modal forms, confirm, toasts, formatting.

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

const ICONS = {
  today: '<rect x="2.5" y="3.5" width="11" height="10" rx="1"/><path d="M2.5 6.5h11M5.5 2v3M10.5 2v3"/>',
  inbox: '<path d="M2.5 9.5l1.6-6h7.8l1.6 6v4h-11z"/><path d="M2.5 9.5h3l1 1.5h3l1-1.5h3"/>',
  tasks: '<rect x="2.5" y="2.5" width="11" height="11" rx="1"/><path d="M5 8l2 2 4-4"/>',
  promise: '<path d="M8 13.5S2.5 10.2 2.5 6.2A2.8 2.8 0 0 1 8 5a2.8 2.8 0 0 1 5.5 1.2c0 4-5.5 7.3-5.5 7.3z"/>',
  calendar: '<circle cx="8" cy="8" r="5.5"/><path d="M8 5v3.2l2.2 1.4"/>',
  routine: '<path d="M13 8a5 5 0 1 1-1.5-3.6"/><path d="M13 2.5v2.5h-2.5"/>',
  idea: '<path d="M6 12.5h4M6.5 14.5h3M8 1.5a4.5 4.5 0 0 0-2.5 8.2V11h5V9.7A4.5 4.5 0 0 0 8 1.5z"/>',
  checkin: '<path d="M2.5 8h2l1.5-4 2.5 8 1.5-4h3.5"/>',
  search: '<circle cx="7" cy="7" r="4.5"/><path d="M10.3 10.3l3.2 3.2"/>',
  data: '<ellipse cx="8" cy="4" rx="5" ry="1.8"/><path d="M3 4v8c0 1 2.2 1.8 5 1.8s5-.8 5-1.8V4M3 8c0 1 2.2 1.8 5 1.8s5-.8 5-1.8"/>',
  more: '<circle cx="3.5" cy="8" r="1"/><circle cx="8" cy="8" r="1"/><circle cx="12.5" cy="8" r="1"/>',
  plus: '<path d="M8 3v10M3 8h10"/>',
  close: '<path d="M4 4l8 8M12 4l-8 8"/>',
  check: '<path d="M3.5 8.5l3 3 6-7"/>',
  clock: '<circle cx="8" cy="8" r="5.5"/><path d="M8 5v3h2.5"/>',
  pin: '<path d="M8 14s4.5-4.2 4.5-7.5a4.5 4.5 0 0 0-9 0C3.5 9.8 8 14 8 14z"/><circle cx="8" cy="6.5" r="1.5"/>',
  person: '<circle cx="8" cy="5.5" r="2.5"/><path d="M3 13.5c.7-2.5 2.6-3.8 5-3.8s4.3 1.3 5 3.8"/>',
  project: '<path d="M2.5 4.5h4l1.5 1.5h5.5v7h-11z"/>',
};
export function icon(name, cls = 'icon') {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 16 16');
  s.setAttribute('class', cls);
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = ICONS[name] ?? '';
  return s;
}

/* ---------- formatting ---------- */
const locale = undefined; // user's browser locale
export function fmtDate(s, { weekday = true } = {}) {
  if (!s) return '';
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(locale, { weekday: weekday ? 'short' : undefined, day: 'numeric', month: 'short', year: y === new Date().getFullYear() ? undefined : 'numeric' });
}
export function fmtRel(s, day) {
  if (!s) return 'No date';
  const [a, b] = [s, day].map((x) => { const [y, m, d] = x.split('-').map(Number); return new Date(y, m - 1, d); });
  const diff = Math.round((a - b) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff < 0) return `${-diff} days ago · ${fmtDate(s)}`;
  if (diff < 7) return fmtDate(s);
  return fmtDate(s, { weekday: false });
}
export function fmtStamp(iso) {
  const d = new Date(iso);
  return d.toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
export function fmtTime(iso) { return new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }); }

/* ---------- chips ---------- */
const STATE_CHIP = {
  overdue: ['Overdue', 'crit'], 'due-today': ['Today', 'warn'], scheduled: ['Scheduled', null], unscheduled: ['No date', null],
  upcoming: ['Upcoming', null], 'no-date': ['No date', null], done: ['Done', 'ok'], fulfilled: ['Fulfilled', 'ok'],
  cancelled: ['Cancelled', null], archived: ['Archived', null], skipped: ['Skipped', null], open: ['Open', null],
  unprocessed: ['Unprocessed', 'warn'], processed: ['Processed', 'ok'], promoted: ['Promoted', 'ok'], active: ['Active', 'ok'],
  completed: ['Completed', 'ok'], dropped: ['Dropped', null], paused: ['Paused', 'warn'], draft: ['In progress', 'warn'], finished: ['Saved', 'ok'],
};
export function stateChip(state) {
  const [label, tone] = STATE_CHIP[state] ?? [state, null];
  return h('span', { class: 'chip', 'data-state': tone }, label);
}
export function typeChip(type) {
  const map = { inbox: ['Inbox', null], task: ['Task', 'cyan'], promise: ['Promise', 'violet'], appointment: ['Appointment', 'cyan'],
    routine: ['Routine', 'green'], occurrence: ['Routine', 'green'], idea: ['Idea', 'amber'], project: ['Project', 'amber'], checkin: ['Check-in', 'green'] };
  const [label, tone] = map[type] ?? [type, null];
  return h('span', { class: 'chip', 'data-tone': tone }, label);
}

/* ---------- toasts ---------- */
let stack;
export function toast(message, { tone = 'ok', ms = 3200 } = {}) {
  stack ??= document.querySelector('.toast-stack') ?? document.body.appendChild(h('div', { class: 'toast-stack', role: 'status', 'aria-live': 'polite' }));
  const el = h('div', { class: 'panel toast hud-msg', 'data-state': tone === 'crit' ? 'crit' : null, 'data-tone': tone === 'crit' ? null : 'green' }, message);
  stack.append(el);
  setTimeout(() => el.remove(), ms);
}

/* ---------- modal ---------- */
let lastFocus = null;
export function openModal({ title, tone, body, actions = [], onClose, label = 'Dialog' }) {
  lastFocus = document.activeElement;
  const close = () => { backdrop.remove(); document.body.classList.remove('has-modal'); onClose?.(); lastFocus?.focus?.(); };
  const panel = h('div', { class: 'panel modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title ?? label, 'data-tone': tone },
    h('span', { class: 'scan', 'aria-hidden': 'true' }),
    h('div', { class: 'panel__bar' },
      h('h2', { class: 'modal__title' }, title ?? ''),
      h('button', { class: 'btn btn--ghost btn--icon', type: 'button', 'aria-label': 'Close', onclick: close }, icon('close'))),
    body,
    actions.length ? h('div', { class: 'modal__actions' }, actions) : null);
  const backdrop = h('div', { class: 'modal-backdrop', onmousedown: (e) => { if (e.target === backdrop) close(); } }, panel);
  backdrop.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    if (e.key === 'Tab') { // simple focus trap
      const f = [...panel.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((x) => !x.disabled && x.offsetParent !== null);
      if (!f.length) return;
      const [first, last] = [f[0], f.at(-1)];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  document.body.append(backdrop);
  document.body.classList.add('has-modal');
  requestAnimationFrame(() => (panel.querySelector('[autofocus]') ?? panel.querySelector('input, select, textarea, .modal__actions button') ?? panel).focus?.());
  return { close, panel };
}

export function confirmDialog({ title, message, confirmLabel = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    let result = false;
    const m = openModal({
      title, tone: danger ? 'amber' : null, onClose: () => resolve(result),
      body: h('p', { class: 't-body' }, message),
      actions: [
        h('button', { class: `btn ${danger ? 'btn--danger' : 'btn--primary'}`, type: 'button', onclick: () => { result = true; m.close(); } }, confirmLabel),
        h('button', { class: 'btn btn--ghost', type: 'button', onclick: () => m.close() }, 'Cancel'),
      ],
    });
  });
}

/**
 * Form dialog. fields: [{ name, label, type, value, required, options:[[value,label]], hint, placeholder, min, max, show(values) }]
 * onSubmit(values) may throw an Error → message shown inline, dialog stays open.
 */
export function formDialog({ title, tone, intro, fields, submitLabel = 'Save', onSubmit, extra }) {
  return new Promise((resolve) => {
    let saved = null;
    const err = h('p', { class: 'hud-msg', 'data-state': 'crit', role: 'alert' });
    const inputs = {};
    const rows = [];
    const values = () => {
      const v = {};
      for (const [n, el] of Object.entries(inputs)) {
        if (el.dataset.kind === 'weekdays') v[n] = [...el.querySelectorAll('input:checked')].map((x) => Number(x.value));
        else if (el.type === 'checkbox') v[n] = el.checked;
        else v[n] = el.value;
      }
      return v;
    };
    const refresh = () => { const v = values(); for (const r of rows) if (r.show) r.el.hidden = !r.show(v); };
    for (const f of fields) {
      const id = `f_${f.name}_${Math.random().toString(36).slice(2, 7)}`;
      let control;
      if (f.type === 'textarea') control = h('textarea', { id, name: f.name, rows: 3, placeholder: f.placeholder, required: f.required });
      else if (f.type === 'select') control = h('select', { id, name: f.name }, (f.options ?? []).map(([val, lab]) => h('option', { value: val }, lab)));
      else if (f.type === 'checkbox') control = h('input', { id, name: f.name, type: 'checkbox' });
      else if (f.type === 'weekdays') {
        control = h('div', { class: 'weekdays', 'data-kind': 'weekdays', role: 'group', 'aria-labelledby': `${id}_l` },
          ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => h('label', { class: 'weekday' }, h('input', { type: 'checkbox', value: i, checked: (f.value ?? []).includes(i) }), h('span', {}, d))));
      } else control = h('input', { id, name: f.name, type: f.type ?? 'text', placeholder: f.placeholder, required: f.required, min: f.min, max: f.max, step: f.step, inputmode: f.inputmode, autocomplete: 'off' });
      if (f.type === 'checkbox') control.checked = !!f.value;
      else if (f.type !== 'weekdays' && f.value != null) control.value = f.value;
      if (f.autofocus) control.setAttribute('autofocus', '');
      control.addEventListener('input', refresh);
      control.addEventListener('change', refresh);
      inputs[f.name] = control;
      const label = h('label', { for: f.type === 'weekdays' ? null : id, id: `${id}_l`, class: 't-label' }, f.label, f.required ? h('span', { 'aria-hidden': 'true', class: 'req' }, ' *') : null);
      const wrap = f.type === 'checkbox'
        ? h('div', { class: 'form-row form-row--check' }, h('label', { class: 'check' }, control, h('span', { class: 'check__label' }, f.label)), f.hint ? h('p', { class: 'hint' }, f.hint) : null)
        : h('div', { class: 'form-row' }, label, f.type === 'weekdays' ? control : h('div', { class: 'field' }, control), f.hint ? h('p', { class: 'hint' }, f.hint) : null);
      rows.push({ el: wrap, show: f.show });
    }
    const submit = h('button', { class: 'btn btn--primary', type: 'submit' }, submitLabel);
    const form = h('form', { class: 'form', novalidate: true },
      intro ? h('p', { class: 't-body form__intro' }, intro) : null,
      rows.map((r) => r.el), extra ?? null, err,
      h('div', { class: 'modal__actions' }, submit, h('button', { class: 'btn btn--ghost', type: 'button', onclick: () => m.close() }, 'Cancel')));
    let busy = false;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (busy) return; // duplicate-submission guard
      busy = true; submit.disabled = true; err.textContent = '';
      try {
        const v = values();
        for (const f of fields) if (f.required && !(rows.find((r) => r.el.contains(inputs[f.name]))?.el.hidden) && !String(v[f.name] ?? '').trim()) throw new Error(`${f.label} is required.`);
        const out = await onSubmit(v);
        if (out === false) throw new Error('Could not save locally.');
        saved = out ?? v;
        m.close();
      } catch (ex) {
        err.textContent = ex.message || 'Something went wrong.';
        err.closest('.modal')?.querySelector('.glitch-target')?.classList.add('glitch-once');
      } finally { busy = false; submit.disabled = false; }
    });
    const m = openModal({ title, tone, body: form, onClose: () => resolve(saved) });
    refresh();
  });
}

export function emptyState(text) { return h('p', { class: 'empty-state' }, text); }
