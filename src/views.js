// Screens. Each view returns a DOM node for <main>.
import * as M from './model.js';
import { store, ofType, get, commit, all } from './store.js';
import { h, icon, fmtDate, fmtRel, fmtStamp, toast, formDialog, stateChip, emptyState } from './ui.js';
import * as A from './actions.js';

const day = () => store.day;
function panel({ id, title, status, tone, cls = '', area, actions }, ...body) {
  return h('section', { class: `panel ${cls}`, 'data-tone': tone, style: area ? { gridArea: area } : null, 'aria-label': title },
    h('div', { class: 'panel__bar' },
      h('h2', { class: 'panel__id' }, id ? h('b', {}, id) : null, id ? ' // ' : null, title),
      h('span', { class: 'panel__right' }, status ? h('span', { class: 'panel__status' }, status) : null, actions ?? null)),
    body);
}
const addBtn = (label, onclick) => h('button', { class: 'btn btn--sm', type: 'button', onclick }, icon('plus'), h('span', {}, label));
function tabs(current, items, onpick) {
  return h('div', { class: 'tabs', role: 'tablist' }, items.map(([key, label, n]) =>
    h('button', { class: 'tab', role: 'tab', type: 'button', 'aria-selected': String(key === current), onclick: () => onpick(key) }, label, n != null ? h('span', { class: 'tab__n t-num' }, n) : null)));
}
function group(title, items, render, empty) {
  if (!items.length && !empty) return null;
  return h('div', { class: 'group' }, h('h3', { class: 'group__title t-label' }, title, h('span', { class: 't-num' }, ` ${items.length}`)), A.list(items, render, empty));
}
function seg(done, total, label) {
  const v = total ? Math.round((done / total) * 100) : 0;
  return h('div', { class: 'meter-wrap' },
    h('div', { class: 'meter', style: { '--value': v }, role: 'meter', 'aria-valuemin': 0, 'aria-valuemax': total, 'aria-valuenow': done, 'aria-label': label }),
    h('p', { class: 't-label' }, label));
}
function ringSvg(value) {
  const wrap = document.createElement('div');
  wrap.innerHTML = `<svg class="ring" viewBox="0 0 120 120" style="--value:${Number(value) || 0}" aria-hidden="true"><circle class="ring__track" cx="60" cy="60" r="52"/><circle class="ring__dash" cx="60" cy="60" r="42"/><circle class="ring__value" cx="60" cy="60" r="52"/></svg>`;
  return wrap.firstChild;
}
let rerender = () => {};
export function setRerender(fn) { rerender = fn; }

/* =================== TODAY =================== */
export function todayView() {
  const t = M.buildToday(all(), day());
  const openCount = t.appts.length + t.tasks.length + t.promises.length + t.occurrences.length;
  const doneN = t.doneToday.length;
  const backup = store.meta.lastBackup;
  const backupAge = backup ? M.daysBetween(M.toDateStr(new Date(backup.at)), day()) : null;
  const now = new Date();
  const priorities = t.morning?.status === 'finished' ? t.morning.priorities : [];

  const line = (ok, label, value) => h('span', { class: ok === 'warn' ? 'warn' : ok === 'dim' ? 'dim' : null }, `${ok === 'warn' ? '[WARN]' : ok === 'dim' ? '[--]' : '[OK]'} ${label.padEnd(10, '.')} ${value}\n`);
  const readout = panel({ id: '01', title: 'System readout', status: 'Local · this device', area: 'readout' },
    h('div', { class: 'terminal', 'data-type': store.firstPaint ? '8' : null },
      h('span', {}, '$ status --today\n'),
      h('span', { class: 'dim' }, `inbox....... `), h('span', {}, `${t.inbox.length} unprocessed\n`),
      h('span', { class: 'dim' }, `open today.. `), h('span', {}, `${openCount}\n\n`),
      line(backup ? (backupAge > 7 ? 'warn' : 'ok') : 'warn', 'backup', backup ? `verified ${backupAge === 0 ? 'today' : backupAge + 'd ago'}` : 'none yet'),
      line(store.meta.persisted ? 'ok' : 'warn', 'storage', store.meta.persisted ? 'persistent' : 'browser may clear it'),
      line(navigator.onLine ? 'ok' : 'warn', 'network', navigator.onLine ? 'online · not needed' : 'offline · all features work'),
      t.projectsNeedingAction.length ? line('warn', 'projects', `${t.projectsNeedingAction.length} need a next action`) : null,
      h('span', { class: 'cursor' }, '$ ')),
    h('div', { class: 'btn-row' }, h('a', { class: 'btn btn--sm', href: '#/inbox' }, 'Open inbox'), h('a', { class: 'btn btn--sm btn--ghost', href: '#/data' }, backup ? 'Back up' : 'Make first backup')));

  const core = h('section', { class: 'core', style: { gridArea: 'core' }, 'aria-label': 'Today overview' },
    h('p', { class: 'core__title' }, 'Personal navigation core'),
    h('div', { class: 'core__ring' },
      ringSvg(openCount + doneN ? Math.round((doneN / (openCount + doneN)) * 100) : 0),
      h('div', { class: 'core__center' },
        h('p', { class: 't-label t-accent' }, now.toLocaleDateString(undefined, { weekday: 'long' })),
        h('p', { class: 't-big', 'data-count': store.firstPaint ? String(now.getDate()) : null }, String(now.getDate())),
        h('p', { class: 't-label' }, now.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })))),
    h('p', { class: 'core__sum t-label' }, h('span', { class: 't-num' }, `${doneN} done`), ' · ', h('span', { class: 't-num' }, `${openCount} open`), ' today'),
    h('div', { class: 'core__checkins' },
      h('a', { class: `btn btn--sm ${t.morning?.status === 'finished' ? 'btn--ghost' : 'btn--primary'}`, href: '#/checkin/morning' }, t.morning?.status === 'finished' ? '✓ Morning check-in' : t.morning ? 'Continue morning check-in' : 'Morning check-in'),
      h('a', { class: `btn btn--sm ${t.evening?.status === 'finished' ? 'btn--ghost' : ''}`, href: '#/checkin/evening' }, t.evening?.status === 'finished' ? '✓ Evening check-in' : 'Evening check-in')));

  const prioPanel = panel({ id: '02', title: 'Priorities', status: priorities.length ? `${priorities.length} of 3` : 'Not set', tone: 'amber', area: 'prio' },
    priorities.length ? h('ol', { class: 'prio' }, priorities.map((p, i) => {
      const rec = p.ref ? get(p.ref) : null;
      const done = rec && ['done', 'fulfilled'].includes(rec.status);
      return h('li', { class: done ? 'is-dim' : null }, h('span', { class: 'prio__n t-num' }, String(i + 1).padStart(2, '0')),
        rec ? h('button', { class: 'linklike', type: 'button', onclick: () => A.openDetails(rec.id) }, p.label) : h('span', {}, p.label), done ? h('span', { class: 'chip', 'data-state': 'ok' }, 'Done') : null);
    })) : h('div', {}, emptyState(t.yesterdayEvening?.tomorrowOutcome ? `Last night you chose: “${t.yesterdayEvening.tomorrowOutcome}”. Confirm it in the morning check-in.` : 'Choose up to three priorities in the morning check-in.'),
      h('a', { class: 'btn btn--sm', href: '#/checkin/morning', style: { marginTop: '16px' } }, 'Set priorities')),
    t.morning?.intention ? h('p', { class: 'intention' }, h('span', { class: 't-label' }, 'Intention '), t.morning.intention) : null);

  const schedule = panel({ id: '03', title: 'Fixed today', status: `${t.appts.length} appointment${t.appts.length === 1 ? '' : 's'}`, area: 'sched', actions: addBtn('Add', () => A.appointmentDialog(null, { date: day() })) },
    A.list(t.appts, A.appointmentRow, 'Nothing fixed today.'));
  const promises = panel({ id: '04', title: 'Promises', status: t.promises.length ? `${t.promises.length} due` : 'None due', tone: 'violet', cls: t.promises.length ? 'is-hot' : '', area: 'prom', actions: addBtn('Add', () => A.promiseDialog()) },
    A.list(t.promises, A.promiseRow, 'No promises due today.'));
  const tasks = panel({ id: '05', title: 'Due & overdue', status: `${t.tasks.length} open`, area: 'tasks', actions: addBtn('Add', () => A.taskDialog(null, { due: day() })) },
    A.list(t.tasks, A.taskRow, 'No tasks due. Nice and clear.'));
  const doneOcc = ofType('occurrence').filter((o) => o.slot === day() && o.status !== 'open');
  const routines = panel({ id: '06', title: 'Routines', status: `${t.occurrences.length} due`, tone: 'green', area: 'rout', actions: addBtn('Add', () => A.routineDialog()) },
    t.occurrences.length + doneOcc.length ? h('div', { class: 'leds', role: 'img', 'aria-label': `${doneOcc.length} of ${doneOcc.length + t.occurrences.length} routines handled today` },
      [...doneOcc.map(() => h('i', { 'data-done': '' })), ...t.occurrences.map(() => h('i'))]) : null,
    A.list(t.occurrences, A.occurrenceRow, 'No routines due.'));

  return h('div', { class: 'today boot' }, readout, core, prioPanel, schedule, promises, tasks, routines);
}

/* =================== INBOX =================== */
let inboxTab = 'unprocessed';
export function inboxView() {
  const items = ofType('inbox').sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const un = items.filter((i) => i.status === 'unprocessed');
  const pr = items.filter((i) => i.status !== 'unprocessed');
  return h('div', { class: 'stack boot' },
    panel({ id: '01', title: 'Inbox', status: `${un.length} to clarify` },
      h('p', { class: 'lede' }, 'Everything you capture lands here. Tap an item to decide what it is.'),
      tabs(inboxTab, [['unprocessed', 'To clarify', un.length], ['processed', 'Processed', pr.length]], (k) => { inboxTab = k; rerender(); }),
      inboxTab === 'unprocessed'
        ? A.list(un, (i) => { const li = A.inboxRow(i); li.append(h('button', { class: 'btn btn--sm', type: 'button', onclick: () => A.clarifyDialog(i) }, 'Clarify')); return li; }, 'Inbox is empty. Use the capture bar at the top.')
        : A.list(pr, A.inboxRow, 'Nothing processed yet.')));
}

/* =================== TASKS =================== */
let taskTab = 'open';
export function tasksView() {
  const ts = ofType('task');
  const d = day();
  const open = ts.filter((t) => t.status === 'open' && !t.archived);
  const sortDue = (a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999') || (a.dueTime ?? '99').localeCompare(b.dueTime ?? '99');
  const sets = { done: ts.filter((t) => t.status === 'done' && !t.archived), cancelled: ts.filter((t) => t.status === 'cancelled' && !t.archived), archived: ts.filter((t) => t.archived) };
  const body = taskTab === 'open' ? [
    group('Overdue', open.filter((t) => t.due && t.due < d).sort(sortDue), A.taskRow),
    group('Today', open.filter((t) => t.due === d).sort(sortDue), A.taskRow),
    group('Upcoming', open.filter((t) => t.due && t.due > d).sort(sortDue), A.taskRow),
    group('No date', open.filter((t) => !t.due).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), A.taskRow),
    open.length ? null : emptyState('No open tasks. Add one, or clarify something from the inbox.'),
  ] : A.list(sets[taskTab].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), A.taskRow, 'Nothing here.');
  return h('div', { class: 'stack boot' }, panel({ id: '01', title: 'Tasks', status: `${open.length} open`, actions: addBtn('New task', () => A.taskDialog()) },
    tabs(taskTab, [['open', 'Open', open.length], ['done', 'Done', sets.done.length], ['cancelled', 'Cancelled', sets.cancelled.length], ['archived', 'Archive', sets.archived.length]], (k) => { taskTab = k; rerender(); }),
    body));
}

/* =================== PROMISES =================== */
let promTab = 'open';
export function promisesView() {
  const ps = ofType('promise');
  const open = ps.filter((p) => p.status === 'open' && !p.archived).sort((a, b) => (M.promiseAttentionDate(a) ?? '9999').localeCompare(M.promiseAttentionDate(b) ?? '9999'));
  const sets = { fulfilled: ps.filter((p) => p.status === 'fulfilled' && !p.archived), cancelled: ps.filter((p) => p.status === 'cancelled' && !p.archived), archived: ps.filter((p) => p.archived) };
  return h('div', { class: 'stack boot' }, panel({ id: '01', title: 'Promises', status: `${open.length} open`, tone: 'violet', actions: addBtn('New promise', () => A.promiseDialog()) },
    h('p', { class: 'lede' }, 'Things you told someone you would do. They stay separate from tasks, and only you mark them fulfilled.'),
    tabs(promTab, [['open', 'Open', open.length], ['fulfilled', 'Fulfilled', sets.fulfilled.length], ['cancelled', 'Cancelled', sets.cancelled.length], ['archived', 'Archive', sets.archived.length]], (k) => { promTab = k; rerender(); }),
    promTab === 'open' ? A.list(open, A.promiseRow, 'No open promises.') : A.list(sets[promTab].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), A.promiseRow, 'Nothing here.')));
}

/* =================== CALENDAR =================== */
let calTab = 'upcoming';
export function calendarView() {
  const d = day();
  const as = ofType('appointment').filter((a) => !a.archived);
  const byTime = (a, b) => a.date.localeCompare(b.date) || (a.start ?? '').localeCompare(b.start ?? '');
  const upcoming = as.filter((a) => a.date >= d).sort(byTime);
  const past = as.filter((a) => a.date < d).sort((a, b) => -byTime(a, b));
  const archived = ofType('appointment').filter((a) => a.archived);
  let body;
  if (calTab === 'upcoming') {
    const days = [...new Set(upcoming.map((a) => a.date))];
    body = days.length ? days.map((dd) => group(fmtRel(dd, d), upcoming.filter((a) => a.date === dd), A.appointmentRow)) : emptyState('No upcoming appointments.');
  } else body = A.list(calTab === 'past' ? past : archived, A.appointmentRow, 'Nothing here.');
  return h('div', { class: 'stack boot' }, panel({ id: '01', title: 'Appointments', status: 'Local entries', actions: addBtn('New appointment', () => A.appointmentDialog()) },
    h('p', { class: 'lede' }, 'Entered here by you. Google Calendar is not connected yet, so these are not on your Google Calendar.'),
    tabs(calTab, [['upcoming', 'Upcoming', upcoming.length], ['past', 'Past', past.length], ['archived', 'Archive', archived.length]], (k) => { calTab = k; rerender(); }), body));
}

/* =================== ROUTINES =================== */
export function routinesView() {
  const d = day();
  const rs = ofType('routine');
  const due = ofType('occurrence').filter((o) => o.status === 'open' && o.target <= d).sort((a, b) => a.target.localeCompare(b.target));
  const later = ofType('occurrence').filter((o) => o.status === 'open' && o.target > d);
  return h('div', { class: 'stack boot' },
    panel({ id: '01', title: 'Due now', status: `${due.length}`, tone: 'green' }, A.list(due, A.occurrenceRow, 'Nothing due right now.'), later.length ? group('Moved to later', later, A.occurrenceRow) : null),
    panel({ id: '02', title: 'Routines & chores', status: `${rs.filter((r) => !r.archived).length} active`, tone: 'green', actions: addBtn('New routine', () => A.routineDialog()) },
      A.list(rs.filter((r) => !r.archived).sort((a, b) => a.title.localeCompare(b.title)), A.routineRow, 'No routines yet. Add the chores you keep forgetting — bins, plants, filters.'),
      group('Archived', rs.filter((r) => r.archived), A.routineRow)));
}

/* =================== IDEAS & PROJECTS =================== */
export function ideasView() {
  const ideas = ofType('idea');
  const projects = ofType('project');
  const open = ideas.filter((i) => i.status === 'open' && !i.archived).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return h('div', { class: 'stack boot' },
    panel({ id: '01', title: 'Projects', status: `${projects.filter((p) => p.status === 'active').length} active`, tone: 'amber' },
      A.list(projects.filter((p) => p.status === 'active'), A.projectRow, 'No active projects. Turn an idea into one when you are ready to act.'),
      group('Completed & dropped', projects.filter((p) => p.status !== 'active'), A.projectRow)),
    panel({ id: '02', title: 'Ideas', status: `${open.length} open`, tone: 'amber', actions: addBtn('New idea', () => A.ideaDialog()) },
      A.list(open, A.ideaRow, 'No ideas saved yet.'),
      group('Promoted & archived', ideas.filter((i) => i.status !== 'open' || i.archived), A.ideaRow)));
}

/* =================== CHECK-INS =================== */
export function checkinsView() {
  const t = M.buildToday(all(), day());
  const past = ofType('checkin').filter((c) => c.status === 'finished').sort((a, b) => b.date.localeCompare(a.date) || a.kind.localeCompare(b.kind));
  return h('div', { class: 'stack boot' },
    panel({ id: '01', title: 'Check-ins', status: 'About 2 minutes each', tone: 'green' },
      h('p', { class: 'lede' }, 'A short look at your day in the morning and a short close-out in the evening. Both are optional.'),
      h('div', { class: 'btn-row' },
        h('a', { class: 'btn btn--primary', href: '#/checkin/morning' }, t.morning?.status === 'finished' ? 'Redo morning check-in' : 'Start morning check-in'),
        h('a', { class: 'btn', href: '#/checkin/evening' }, t.evening?.status === 'finished' ? 'Redo evening check-in' : 'Start evening check-in'))),
    panel({ id: '02', title: 'Earlier check-ins', status: `${past.length}` }, A.list(past.slice(0, 30), A.checkinRow, 'None yet.')));
}

let draftTimer;
function saveDraft(rec) { clearTimeout(draftTimer); draftTimer = setTimeout(() => commit(rec, { silent: true }).catch(() => {}), 0); }

export function morningView() {
  const d = day();
  const t = M.buildToday(all(), d);
  let rec = M.draftCheckin('morning', d, get(M.checkinId('morning', d)));
  if (rec.status === 'finished') rec = { ...rec, status: 'draft' }; // editing a finished one re-finishes it
  const candidates = [
    ...t.promises.map((p) => ({ ref: p.id, label: `${p.statement} (for ${p.counterparty})`, kind: 'Promise' })),
    ...t.tasks.map((x) => ({ ref: x.id, label: x.title, kind: 'Task' })),
    ...ofType('task').filter((x) => x.status === 'open' && !x.archived && x.priority === 'high' && !(x.due && x.due <= d)).map((x) => ({ ref: x.id, label: x.title, kind: 'Task' })),
  ];
  const chosen = new Map((rec.priorities ?? []).map((p) => [p.ref ?? `free:${p.label}`, p]));
  const err = h('p', { class: 'hud-msg', 'data-state': 'crit', role: 'alert' });
  const counter = h('span', { class: 'panel__status t-num' });
  const listEl = h('ul', { class: 'pick' });
  const update = () => {
    counter.textContent = `${chosen.size} of 3`;
    for (const cb of listEl.querySelectorAll('input')) cb.disabled = !cb.checked && chosen.size >= 3;
    if (!touched) return;
    rec = M.saveCheckinDraft(rec, { priorities: [...chosen.values()], intention: intention.value || null });
    saveDraft(rec);
  };
  let touched = false;
  const touch = () => { touched = true; };
  const addPick = (c) => {
    const key = c.ref ?? `free:${c.label}`;
    const cb = h('input', { type: 'checkbox', checked: chosen.has(key) });
    cb.addEventListener('change', () => { touch(); cb.checked ? chosen.set(key, { ref: c.ref ?? null, label: c.label }) : chosen.delete(key); update(); });
    listEl.append(h('li', {}, h('label', { class: 'check' }, cb, h('span', { class: 'check__label' }, c.label)), c.kind ? h('span', { class: 'chip' }, c.kind) : null));
  };
  const seen = new Set();
  for (const c of candidates) if (!seen.has(c.ref)) { seen.add(c.ref); addPick(c); }
  for (const p of rec.priorities ?? []) if (!p.ref) addPick({ label: p.label, kind: 'Own' });
  const sugg = t.yesterdayEvening?.tomorrowOutcome;
  if (sugg && !chosen.has(`free:${sugg}`)) addPick({ label: sugg, kind: 'From last night' });
  const free = h('input', { type: 'text', placeholder: 'Something else…', 'aria-label': 'Add your own priority' });
  const addFree = () => { touch(); const v = free.value.trim(); if (!v) return; if (chosen.size >= 3) { err.textContent = 'You already have three priorities.'; return; } chosen.set(`free:${v}`, { ref: null, label: v }); addPick({ label: v, kind: 'Own' }); listEl.lastChild.querySelector('input').checked = true; free.value = ''; update(); };
  free.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addFree(); } });
  const intention = h('textarea', { rows: 2, placeholder: 'Optional — one line about how you want today to go', 'aria-label': 'Daily intention' });
  intention.value = rec.intention ?? '';
  intention.addEventListener('input', () => { touch(); update(); });
  const finish = async () => {
    try {
      const f = M.finishMorning(rec, { priorities: [...chosen.values()], intention: intention.value });
      clearTimeout(draftTimer);
      await commit(f);
      toast('Morning check-in saved');
      location.hash = '#/today';
    } catch (e) { err.textContent = e.message; }
  };
  update();
  return h('div', { class: 'stack boot' },
    panel({ id: '01', title: 'Morning check-in', status: 'Step 1 of 2 · look', tone: 'green' },
      h('div', { class: 'brief' },
        group('Fixed today', t.appts, A.appointmentRow, 'Nothing fixed.'),
        group('Promises due', t.promises, A.promiseRow, 'None due.'),
        group('Due & overdue tasks', t.tasks, A.taskRow, 'None.'),
        group('Routines due', t.occurrences, A.occurrenceRow, 'None.'))),
    panel({ id: '02', title: 'Choose up to three priorities', status: null, tone: 'amber', actions: counter },
      listEl, h('div', { class: 'field', 'data-prefix': '+' }, free), h('button', { class: 'btn btn--sm', type: 'button', onclick: addFree, style: { marginTop: '8px' } }, 'Add'),
      h('label', { class: 't-label', style: { display: 'block', marginTop: '24px' } }, 'Intention'), h('div', { class: 'field' }, intention),
      err,
      h('div', { class: 'btn-row' }, h('button', { class: 'btn btn--primary', type: 'button', onclick: finish }, 'Finish check-in'), h('a', { class: 'btn btn--ghost', href: '#/today' }, 'Skip for now'))));
}

export function eveningView() {
  const d = day();
  const t = M.buildToday(all(), d);
  let rec = M.draftCheckin('evening', d, get(M.checkinId('evening', d)));
  const morning = t.morning;
  const freePrios = (morning?.priorities ?? []).filter((p) => !p.ref);
  const items = [
    ...t.tasks.map((x) => ({ ref: x.id, rec: x, label: x.title, kind: 'task' })),
    ...t.promises.map((p) => ({ ref: p.id, rec: p, label: `${p.statement} (for ${p.counterparty})`, kind: 'promise' })),
    ...t.occurrences.map((o) => ({ ref: o.id, rec: o, label: o.title, kind: 'occurrence' })),
    ...freePrios.map((p) => ({ ref: `free:${p.label}`, label: p.label, kind: 'free' })),
  ];
  const CHOICES = {
    task: [['done', 'Done'], ['tomorrow', 'Tomorrow'], ['date', 'Pick a date'], ['unschedule', 'Remove date'], ['leave', 'Leave as is']],
    promise: [['fulfilled', 'Fulfilled'], ['tomorrow', 'My target → tomorrow'], ['leave', 'Leave as is']],
    occurrence: [['done', 'Done'], ['skip', 'Skip'], ['tomorrow', 'Tomorrow']],
    free: [['done', 'Done'], ['notdone', 'Not done']],
  };
  const decisions = new Map((rec.decisions ?? []).map((x) => [x.ref, x]));
  const err = h('p', { class: 'hud-msg', 'data-state': 'crit', role: 'alert' });
  const persist = () => { rec = M.saveCheckinDraft(rec, { decisions: [...decisions.values()], tomorrowOutcome: outcome.value || null }); saveDraft(rec); };
  const rows = items.map((it) => {
    const name = `dec_${it.ref}`;
    const dateIn = h('input', { type: 'date', value: decisions.get(it.ref)?.date ?? M.addDays(d, 2), 'aria-label': `New date for ${it.label}` });
    const dateWrap = h('div', { class: 'field field--inline', hidden: decisions.get(it.ref)?.choice !== 'date' }, dateIn);
    const set = (choice, choiceLabel) => { decisions.set(it.ref, { ref: it.ref, kind: it.kind, label: it.label, choice, choiceLabel, date: choice === 'date' ? dateIn.value : undefined }); dateWrap.hidden = choice !== 'date'; persist(); };
    dateIn.addEventListener('change', () => { if (decisions.get(it.ref)?.choice === 'date') set('date', `Moved to ${dateIn.value}`); });
    return h('li', { class: 'decide' },
      h('div', { class: 'decide__label' }, h('span', { class: 'chip', 'data-tone': it.kind === 'promise' ? 'violet' : it.kind === 'occurrence' ? 'green' : null }, { task: 'Task', promise: 'Promise', occurrence: 'Routine', free: 'Priority' }[it.kind]), ' ', it.label),
      h('div', { class: 'seg', role: 'radiogroup', 'aria-label': `What happens to: ${it.label}` },
        CHOICES[it.kind].map(([v, l]) => h('label', { class: 'seg__opt' }, h('input', { type: 'radio', name, value: v, checked: decisions.get(it.ref)?.choice === v, onchange: () => set(v, l) }), h('span', {}, l)))),
      dateWrap);
  });
  const cap = h('input', { type: 'text', placeholder: 'Anything still on your mind?', 'aria-label': 'Capture to inbox' });
  const capBtn = h('button', { class: 'btn btn--sm', type: 'button', onclick: async () => {
    try { const i = M.createInbox(cap.value, { source: 'evening-check-in' }); await commit(i, { silent: true }); cap.value = ''; toast('Captured to inbox'); } catch (e) { err.textContent = e.message; }
  } }, 'Capture');
  const outcome = h('input', { type: 'text', placeholder: 'The one thing that would make tomorrow a good day', 'aria-label': "Tomorrow's most important outcome" });
  outcome.value = rec.tomorrowOutcome ?? '';
  outcome.addEventListener('input', persist);
  const finish = async () => {
    try {
      const ds = [...decisions.values()];
      const f = M.finishEvening(rec, { decisions: ds, unresolved: items.map((i) => i.ref), tomorrowOutcome: outcome.value });
      const tomorrow = M.addDays(d, 1);
      const changes = [];
      for (const x of ds) {
        const r = get(x.ref);
        if (!r) continue;
        if (x.kind === 'task') {
          if (x.choice === 'done') changes.push(M.completeTask(r));
          if (x.choice === 'tomorrow') changes.push(M.scheduleTask(r, tomorrow, r.dueTime));
          if (x.choice === 'date') changes.push(M.scheduleTask(r, x.date, r.dueTime));
          if (x.choice === 'unschedule') changes.push(M.unscheduleTask(r));
        } else if (x.kind === 'promise') {
          if (x.choice === 'fulfilled') changes.push(M.fulfillPromise(r));
          if (x.choice === 'tomorrow') changes.push(M.deferPromise(r, tomorrow));
        } else if (x.kind === 'occurrence') {
          if (x.choice === 'done') changes.push(M.completeOccurrence(r));
          if (x.choice === 'skip') changes.push(M.skipOccurrence(r));
          if (x.choice === 'tomorrow') changes.push(M.deferOccurrence(r, tomorrow));
        }
      }
      clearTimeout(draftTimer);
      await commit([...changes, f]);
      toast('Evening check-in saved. Good night.');
      location.hash = '#/today';
    } catch (e) { err.textContent = e.message; }
  };
  return h('div', { class: 'stack boot' },
    panel({ id: '01', title: 'Done today', status: `${t.doneToday.length}`, tone: 'green' }, A.list(t.doneToday, A.rowFor, 'Nothing marked done today — that is fine.')),
    panel({ id: '02', title: 'Still open', status: `${items.length} to decide`, tone: 'amber' },
      h('p', { class: 'lede' }, 'Pick what happens to each one. Nothing moves unless you choose it.'),
      items.length ? h('ul', { class: 'decide-list' }, rows) : emptyState('Nothing left open today.')),
    panel({ id: '03', title: 'Close out', status: null, tone: 'green' },
      h('label', { class: 't-label' }, 'Capture'), h('div', { class: 'row-inline' }, h('div', { class: 'field', 'data-prefix': '>' }, cap), capBtn),
      h('label', { class: 't-label', style: { display: 'block', marginTop: '24px' } }, "Tomorrow's most important outcome"), h('div', { class: 'field' }, outcome),
      err,
      h('div', { class: 'btn-row' }, h('button', { class: 'btn btn--primary', type: 'button', onclick: finish }, 'Finish check-in'), h('a', { class: 'btn btn--ghost', href: '#/today' }, 'Skip for now'))));
}

/* =================== SEARCH =================== */
let query = '';
export function searchView() {
  const results = h('div', { class: 'results', 'aria-live': 'polite' });
  const input = h('input', { type: 'search', placeholder: 'Search everything on this device', 'aria-label': 'Search', value: query, enterkeyhint: 'search' });
  const run = () => {
    query = input.value;
    results.replaceChildren();
    if (!query.trim()) { results.append(emptyState('Type to search tasks, promises, appointments, routines, ideas, projects, check-ins and the inbox — including finished and archived items.')); return; }
    let found;
    try { found = M.search(all(), query); } catch (e) { results.append(h('p', { class: 'hud-msg', 'data-state': 'crit' }, `Search failed: ${e.message}`)); return; }
    results.append(h('p', { class: 't-label' }, `${found.length} result${found.length === 1 ? '' : 's'}`),
      found.length ? h('ul', { class: 'items' }, found.map((f) => { const li = A.rowFor(f.record); li.querySelector('.item__body')?.prepend(h('span', { class: 'result__type' }, f.record.type === 'occurrence' ? 'routine' : f.record.type)); return li; })) : emptyState('No matches.'));
  };
  let tm; input.addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(run, 120); });
  run();
  requestAnimationFrame(() => input.focus());
  return h('div', { class: 'stack boot' }, panel({ id: '01', title: 'Search', status: 'Offline · nothing leaves this device' }, h('div', { class: 'field', 'data-prefix': '$' }, input), results));
}
