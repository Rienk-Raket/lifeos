// Rows, detail sheets and dialogs for every record type.
import * as M from './model.js';
import { store, commit, remove, get, ofType } from './store.js';
import { h, icon, fmtDate, fmtRel, fmtStamp, stateChip, typeChip, toast, openModal, confirmDialog, formDialog, emptyState } from './ui.js';

const day = () => store.day;
async function save(records, msg) {
  try { await commit(records); if (msg) toast(msg); return true; }
  catch (e) { toast(`Not saved: ${e.message || 'storage error'}`, { tone: 'crit', ms: 6000 }); return false; }
}
function act(fn, msg) {
  return async () => {
    try { const out = fn(); const recs = out instanceof Promise ? await out : out; if (recs) await save(recs, msg); }
    catch (e) { toast(e.message, { tone: 'crit', ms: 5000 }); }
  };
}
function btn(label, onclick, cls = '') { return h('button', { class: `btn ${cls}`, type: 'button', onclick }, label); }

/* =================== row primitives =================== */
function checkBtn({ checked, label, onclick, tone }) {
  return h('button', { class: `tick${checked ? ' is-on' : ''}`, type: 'button', 'aria-pressed': String(!!checked), 'aria-label': label, title: label, 'data-tone': tone, onclick }, icon('check', 'tick__mark'));
}
function row({ rec, tick, title, meta = [], chips = [], tone, dim }) {
  return h('li', { class: `item${dim ? ' is-dim' : ''}`, 'data-tone': tone, 'data-id': rec.id },
    tick ?? h('span', { class: 'item__icon' }, icon(iconFor(rec.type))),
    h('button', { class: 'item__body', type: 'button', onclick: () => openDetails(rec.id) },
      h('span', { class: 'item__title' }, title),
      meta.length ? h('span', { class: 'item__meta' }, meta.filter(Boolean).map((m, i) => [i ? h('span', { class: 'sep', 'aria-hidden': 'true' }, ' · ') : null, m])) : null),
    chips.length ? h('span', { class: 'item__chips' }, chips.filter(Boolean)) : null);
}
function iconFor(t) { return { task: 'tasks', promise: 'promise', appointment: 'calendar', routine: 'routine', occurrence: 'routine', idea: 'idea', project: 'project', inbox: 'inbox', checkin: 'checkin' }[t] ?? 'tasks'; }
export function list(items, render, empty) {
  return items.length ? h('ul', { class: 'items' }, items.map(render)) : emptyState(empty);
}

/* =================== rows per type =================== */
export function taskRow(t) {
  const st = M.taskState(t, day());
  const pc = M.postponeCount(t);
  const proj = t.projectId ? get(t.projectId) : null;
  const prm = t.promiseId ? get(t.promiseId) : null;
  return row({
    rec: t, dim: t.status !== 'open',
    tick: t.archived ? null : checkBtn({ checked: t.status === 'done', label: t.status === 'done' ? `Reopen: ${t.title}` : `Complete: ${t.title}`,
      onclick: act(() => (t.status === 'done' ? M.reopenTask(t) : t.status === 'open' ? M.completeTask(t) : M.reopenTask(t)), t.status === 'open' ? 'Task completed' : 'Task reopened') }),
    title: t.title,
    meta: [t.due ? `${fmtRel(t.due, day())}${t.dueTime ? ' ' + t.dueTime : ''}` : null, proj ? `Project: ${proj.name}` : null, prm ? `For ${prm.counterparty}` : null],
    chips: [['overdue', 'due-today'].includes(st) || t.status !== 'open' ? stateChip(st) : null, t.priority === 'high' && t.status === 'open' ? h('span', { class: 'chip', 'data-tone': 'amber' }, 'Priority') : null,
      pc >= 3 && t.status === 'open' ? h('span', { class: 'chip' }, `Postponed ${pc}×`) : null],
  });
}
export function promiseRow(p) {
  const st = M.promiseState(p, day());
  return row({
    rec: p, tone: 'violet', dim: p.status !== 'open',
    tick: p.archived ? null : checkBtn({ tone: 'violet', checked: p.status === 'fulfilled', label: p.status === 'fulfilled' ? `Reopen promise: ${p.statement}` : `Mark fulfilled: ${p.statement}`,
      onclick: act(() => (p.status === 'open' ? M.fulfillPromise(p) : M.reopenPromise(p)), p.status === 'open' ? `Promise to ${p.counterparty} fulfilled` : 'Promise reopened') }),
    title: p.statement,
    meta: [h('span', { class: 'who' }, icon('person'), ` ${p.counterparty}`), p.committedDate ? `Promised ${fmtRel(p.committedDate, day())}` : 'No date promised',
      p.targetDate && p.targetDate !== p.committedDate ? `My target ${fmtRel(p.targetDate, day())}` : null],
    chips: [h('span', { class: 'chip', 'data-tone': 'violet' }, 'Promise'), ['overdue', 'due-today'].includes(st) || p.status !== 'open' ? stateChip(st) : null],
  });
}
export function appointmentRow(a) {
  const lb = M.leaveBy(a);
  return row({
    rec: a, dim: a.status !== 'scheduled',
    tick: h('span', { class: 'item__time t-num' }, a.allDay ? 'All day' : a.start, !a.allDay && a.end ? h('small', {}, a.end) : null),
    title: a.title,
    meta: [a.date !== day() ? fmtRel(a.date, day()) : null, a.location ? h('span', { class: 'who' }, icon('pin'), ` ${a.location}`) : null,
      a.status === 'scheduled' && !a.allDay ? (lb.available ? h('strong', { class: 'leave' }, `Leave by ${lb.time}${lb.previousDay ? ' (day before)' : ''}`) : h('span', { class: 'muted' }, 'Leave-by unavailable')) : null],
    chips: [a.status === 'cancelled' ? stateChip('cancelled') : null, h('span', { class: 'chip', title: 'Entered here — not on Google Calendar' }, 'Local')],
  });
}
export function occurrenceRow(o) {
  const r = get(o.routineId);
  return row({
    rec: o, tone: 'green', dim: o.status !== 'open',
    tick: checkBtn({ tone: 'green', checked: o.status === 'done', label: o.status === 'done' ? `Reopen: ${o.title}` : `Done: ${o.title}`,
      onclick: act(() => (o.status === 'open' ? M.completeOccurrence(o) : M.reopenOccurrence(o)), o.status === 'open' ? 'Routine done' : 'Reopened') }),
    title: r?.title ?? o.title,
    meta: [o.target < day() ? `Due ${fmtRel(o.target, day())}` : o.dueTime ? `Today ${o.dueTime}` : 'Today', o.target !== o.slot ? `Moved from ${fmtDate(o.slot)}` : null, r ? M.describeRule(M.currentRule(r, day())) : null],
    chips: [o.status === 'skipped' ? stateChip('skipped') : null],
  });
}
export function inboxRow(i) {
  return row({
    rec: i, dim: i.status !== 'unprocessed',
    title: i.text,
    meta: [fmtStamp(i.createdAt), i.processedInto ? `→ ${i.processedInto.type}` : null],
    chips: [stateChip(i.status)],
  });
}
export function routineRow(r) {
  const next = M.nextSlotAfter(r, day());
  return row({ rec: r, tone: 'green', dim: r.archived || r.paused, title: r.title,
    meta: [M.describeRule(M.currentRule(r, day())), r.paused ? 'Paused' : next ? `Next ${fmtRel(next, day())}` : 'No further dates'],
    chips: [r.paused ? stateChip('paused') : null, r.archived ? stateChip('archived') : null] });
}
export function ideaRow(i) {
  return row({ rec: i, tone: 'amber', dim: i.archived || i.status !== 'open', title: i.title, meta: [i.notes ? i.notes.slice(0, 80) : null, fmtStamp(i.createdAt)],
    chips: [i.status === 'promoted' ? stateChip('promoted') : null, i.archived ? stateChip('archived') : null] });
}
export function projectRow(p) {
  const next = M.projectNextActions(p, ofType('task'));
  return row({ rec: p, tone: 'amber', dim: p.status !== 'active', title: p.name,
    meta: [p.area, next.length ? `Next: ${next[0].title}` : h('strong', { class: 'warn-text' }, 'Needs a next action'), `Review ${fmtRel(p.reviewDate, day())}`],
    chips: [stateChip(p.status)] });
}
export function checkinRow(c) {
  return row({ rec: c, tone: 'green', title: M.titleOf(c), meta: [c.kind === 'morning' ? `${c.priorities.length} priorities` : `${c.decisions.length} decisions`], chips: [stateChip(c.status)] });
}
export function rowFor(r) {
  return ({ task: taskRow, promise: promiseRow, appointment: appointmentRow, occurrence: occurrenceRow, inbox: inboxRow, routine: routineRow, idea: ideaRow, project: projectRow, checkin: checkinRow })[r.type]?.(r) ?? h('li', {}, r.id);
}

/* =================== dialogs =================== */
const PRIORITY = [['normal', 'Normal'], ['high', 'Priority']];
export function taskDialog(t, preset = {}, { also } = {}) {
  const isNew = !t;
  const projects = ofType('project').filter((p) => p.status === 'active');
  const promises = ofType('promise').filter((p) => p.status === 'open' && !p.archived);
  return formDialog({
    title: isNew ? 'New task' : 'Edit task',
    fields: [
      { name: 'title', label: 'What needs doing', required: true, value: t?.title ?? preset.title, autofocus: true },
      ...(isNew ? [{ name: 'due', label: 'Due / scheduled date', type: 'date', value: preset.due ?? '' }, { name: 'dueTime', label: 'Time (optional)', type: 'time', show: (v) => !!v.due }] : []),
      { name: 'priority', label: 'Priority', type: 'select', options: PRIORITY, value: t?.priority ?? 'normal' },
      projects.length ? { name: 'projectId', label: 'Project', type: 'select', options: [['', 'None'], ...projects.map((p) => [p.id, p.name])], value: t?.projectId ?? preset.projectId ?? '' } : null,
      promises.length ? { name: 'promiseId', label: 'Supports a promise', type: 'select', options: [['', 'None'], ...promises.map((p) => [p.id, `${p.statement} — ${p.counterparty}`])], value: t?.promiseId ?? preset.promiseId ?? '', hint: 'Completing the task does not fulfil the promise.' } : null,
      { name: 'notes', label: 'Notes', type: 'textarea', value: t?.notes ?? preset.notes },
    ].filter(Boolean),
    submitLabel: isNew ? 'Add task' : 'Save',
    onSubmit: async (v) => {
      const f = { ...v, projectId: v.projectId || null, promiseId: v.promiseId || null };
      const rec = isNew ? M.createTask(f) : M.editTask(t, f);
      if (!(await save([rec, ...(also?.(rec) ?? [])], isNew ? 'Task added' : 'Task saved'))) throw new Error('Could not save locally.');
    },
  });
}
function scheduleDialog(t) {
  return formDialog({
    title: t.due ? 'Reschedule' : 'Schedule', intro: t.due ? `Currently ${fmtDate(t.due)}${t.dueTime ? ' ' + t.dueTime : ''}.` : null,
    fields: [{ name: 'due', label: 'New date', type: 'date', required: true, value: t.due ?? day() }, { name: 'dueTime', label: 'Time (optional)', type: 'time', value: t.dueTime ?? '' }],
    submitLabel: 'Move it',
    onSubmit: async (v) => { await save(M.scheduleTask(t, v.due, v.dueTime || null), 'Rescheduled'); },
  });
}
function reasonDialog(title, label, onSubmit, extraFields = []) {
  return formDialog({ title, fields: [{ name: 'reason', label, type: 'textarea' }, ...extraFields], submitLabel: title, onSubmit });
}
export function promiseDialog(p, preset = {}, { also } = {}) {
  const isNew = !p;
  return formDialog({
    title: isNew ? 'New promise' : 'Edit promise', tone: 'violet',
    intro: isNew ? 'A promise is something you told someone you would do. It stays separate from your tasks.' : null,
    fields: [
      { name: 'statement', label: 'What you promised', required: true, value: p?.statement ?? preset.statement, autofocus: true },
      { name: 'counterparty', label: 'To whom', required: true, value: p?.counterparty ?? preset.counterparty },
      ...(isNew ? [
        { name: 'committedDate', label: 'Date you promised', type: 'date', hint: 'The date the other person expects.' },
        { name: 'targetDate', label: 'Your own target date', type: 'date', hint: 'Optional. Defaults to the promised date.' },
      ] : []),
      { name: 'notes', label: 'Notes', type: 'textarea', value: p?.notes },
    ],
    submitLabel: isNew ? 'Add promise' : 'Save',
    onSubmit: async (v) => {
      const rec = isNew ? M.createPromise(v) : M.editPromise(p, v);
      if (!(await save([rec, ...(also?.(rec) ?? [])], isNew ? 'Promise recorded' : 'Promise saved'))) throw new Error('Could not save locally.');
    },
  });
}
export function appointmentDialog(a, preset = {}, { also } = {}) {
  const isNew = !a;
  return formDialog({
    title: isNew ? 'New appointment' : 'Edit appointment',
    intro: 'Stored only in this app — it is not added to Google Calendar.',
    fields: [
      { name: 'title', label: 'What', required: true, value: a?.title ?? preset.title, autofocus: true },
      { name: 'date', label: 'Date', type: 'date', required: true, value: a?.date ?? preset.date ?? day() },
      { name: 'allDay', label: 'All day', type: 'checkbox', value: a?.allDay },
      { name: 'start', label: 'Starts', type: 'time', value: a?.start, show: (v) => !v.allDay },
      { name: 'end', label: 'Ends', type: 'time', value: a?.end, show: (v) => !v.allDay },
      { name: 'location', label: 'Where', value: a?.location },
      { name: 'travelMinutes', label: 'Travel time (minutes)', type: 'number', min: 0, max: 1440, inputmode: 'numeric', value: a?.travelMinutes ?? '', show: (v) => !v.allDay, hint: 'Needed for a leave-by time. Leave empty if unknown.' },
      { name: 'bufferMinutes', label: 'Extra buffer (minutes)', type: 'number', min: 0, max: 600, inputmode: 'numeric', value: a?.bufferMinutes ?? '', show: (v) => !v.allDay },
      { name: 'arriveBy', label: 'Need to arrive by (optional)', type: 'time', value: a?.arriveBy, show: (v) => !v.allDay, hint: 'Defaults to the start time.' },
      { name: 'notes', label: 'Notes', type: 'textarea', value: a?.notes },
    ],
    submitLabel: isNew ? 'Add appointment' : 'Save',
    onSubmit: async (v) => {
      const rec = isNew ? M.createAppointment(v) : M.updateAppointment(a, v);
      if (!(await save([rec, ...(also?.(rec) ?? [])], isNew ? 'Appointment added' : 'Appointment saved'))) throw new Error('Could not save locally.');
    },
  });
}
export function routineDialog(r, preset = {}, { also } = {}) {
  const isNew = !r;
  const rule = r ? M.currentRule(r, day()) : { freq: 'weekly', interval: 1, weekdays: [new Date().getDay()], monthDay: new Date().getDate() };
  return formDialog({
    title: isNew ? 'New routine or chore' : 'Edit routine', tone: 'green',
    intro: isNew ? 'Only the next due time shows up on Today — no long lists of future chores.' : 'Changes to how often it repeats apply from tomorrow; past and open items stay as they are.',
    fields: [
      { name: 'title', label: 'What', required: true, value: r?.title ?? preset.title, autofocus: true },
      { name: 'freq', label: 'Repeats', type: 'select', options: [['daily', 'Every N days'], ['weekly', 'Weekly'], ['monthly', 'Monthly']], value: rule.freq },
      { name: 'interval', label: 'Every how many (days / weeks / months)', type: 'number', min: 1, max: 365, inputmode: 'numeric', value: rule.interval },
      { name: 'weekdays', label: 'On', type: 'weekdays', value: rule.weekdays ?? [new Date().getDay()], show: (v) => v.freq === 'weekly' },
      { name: 'monthDay', label: 'Day of month', type: 'number', min: 1, max: 31, inputmode: 'numeric', value: rule.monthDay ?? new Date().getDate(), show: (v) => v.freq === 'monthly', hint: 'Short months use their last day.' },
      ...(isNew ? [{ name: 'anchor', label: 'Starting from', type: 'date', required: true, value: day() }] : []),
      { name: 'dueTime', label: 'Time (optional)', type: 'time', value: r?.dueTime },
      { name: 'endDate', label: 'Ends on (optional)', type: 'date', value: r?.endDate },
      { name: 'notes', label: 'Notes', type: 'textarea', value: r?.notes },
    ],
    submitLabel: isNew ? 'Add routine' : 'Save',
    onSubmit: async (v) => {
      const ruleIn = { freq: v.freq, interval: Number(v.interval), weekdays: v.weekdays, monthDay: Number(v.monthDay) };
      const rec = isNew ? M.createRoutine({ ...v, rule: ruleIn }) : M.reviseRoutine(r, { ...v, rule: ruleIn }, day());
      if (!(await save([rec, ...(also?.(rec) ?? [])], isNew ? 'Routine added' : 'Routine saved'))) throw new Error('Could not save locally.');
    },
  });
}
export function ideaDialog(i, preset = {}, { also } = {}) {
  const isNew = !i;
  return formDialog({
    title: isNew ? 'New idea' : 'Edit idea', tone: 'amber',
    fields: [{ name: 'title', label: 'Idea', required: true, value: i?.title ?? preset.title, autofocus: true }, { name: 'notes', label: 'Notes', type: 'textarea', value: i?.notes ?? preset.notes }],
    submitLabel: isNew ? 'Save idea' : 'Save',
    onSubmit: async (v) => {
      const rec = isNew ? M.createIdea(v) : M.editIdea(i, v);
      if (!(await save([rec, ...(also?.(rec) ?? [])], 'Idea saved'))) throw new Error('Could not save locally.');
    },
  });
}
export function promoteDialog(idea) {
  return formDialog({
    title: 'Turn into a project', tone: 'amber', intro: `“${idea.title}” stays in your ideas, marked as promoted.`,
    fields: [
      { name: 'name', label: 'Project name', required: true, value: idea.title, autofocus: true },
      { name: 'outcome', label: 'Done looks like…', required: true },
      { name: 'reason', label: 'Why it matters', required: true },
      { name: 'area', label: 'Area of life', required: true, placeholder: 'Home, work, health…' },
      { name: 'reviewDate', label: 'Review on', type: 'date', required: true, value: M.addDays(day(), 7) },
      { name: 'deadline', label: 'Deadline (optional)', type: 'date' },
      { name: 'nextAction', label: 'First concrete next action', required: true, hint: 'One visible step you can actually do.' },
      { name: 'nextActionDue', label: 'When (optional)', type: 'date' },
    ],
    submitLabel: 'Create project',
    onSubmit: async (v) => {
      const fresh = get(idea.id); // retry-safe: re-read before promoting
      const { idea: i2, project, task } = M.promoteIdea(fresh, v);
      if (!(await save([i2, project, task], 'Project created with its next action'))) throw new Error('Could not save locally.');
    },
  });
}
function projectDialog(p) {
  return formDialog({
    title: 'Edit project', tone: 'amber',
    fields: [
      { name: 'name', label: 'Project name', required: true, value: p.name },
      { name: 'outcome', label: 'Done looks like…', required: true, value: p.outcome },
      { name: 'reason', label: 'Why it matters', required: true, value: p.reason },
      { name: 'area', label: 'Area of life', required: true, value: p.area },
      { name: 'reviewDate', label: 'Review on', type: 'date', required: true, value: p.reviewDate },
      { name: 'deadline', label: 'Deadline (optional)', type: 'date', value: p.deadline },
    ],
    onSubmit: async (v) => { await save(M.editProject(p, v), 'Project saved'); },
  });
}

/* =================== inbox clarify =================== */
export function clarifyDialog(item) {
  const done = (into) => [M.processInbox(get(item.id), into)];
  const choose = (fn) => async () => { m.close(); await fn(); };
  const opts = [
    ['Task', 'Something I need to do', () => taskDialog(null, { title: item.text }, { also: (r) => done({ type: 'task', id: r.id }) })],
    ['Promise', 'Something I told someone I would do', () => promiseDialog(null, { statement: item.text }, { also: (r) => done({ type: 'promise', id: r.id }) })],
    ['Appointment', 'A fixed time and place', () => appointmentDialog(null, { title: item.text }, { also: (r) => done({ type: 'appointment', id: r.id }) })],
    ['Routine / chore', 'Something that repeats', () => routineDialog(null, { title: item.text }, { also: (r) => done({ type: 'routine', id: r.id }) })],
    ['Idea', 'Worth keeping, not an action yet', () => ideaDialog(null, { title: item.text }, { also: (r) => done({ type: 'idea', id: r.id }) })],
  ];
  const m = openModal({
    title: 'What is this?', body: h('div', {},
      h('blockquote', { class: 'quote' }, item.text),
      h('div', { class: 'choice-grid' }, opts.map(([t, d, fn]) => h('button', { class: 'choice', type: 'button', onclick: choose(fn) }, h('strong', {}, t), h('span', {}, d)))),
      h('div', { class: 'modal__actions' },
        btn('Nothing to do — mark processed', act(() => { m.close(); return done(null); }, 'Marked processed'), 'btn--ghost'))),
  });
}

/* =================== details sheet =================== */
function field(label, value) { return value ? h('div', { class: 'kv' }, h('dt', { class: 't-label' }, label), h('dd', {}, value)) : null; }
function historyList(rec) {
  const names = { created: 'Created', edited: 'Edited', completed: 'Completed', reopened: 'Reopened', cancelled: 'Cancelled', archived: 'Archived', unarchived: 'Restored from archive',
    scheduled: 'Scheduled', postponed: 'Postponed', unscheduled: 'Date removed', fulfilled: 'Fulfilled', 'local-target-changed': 'Own target moved', renegotiated: 'New date agreed',
    processed: 'Processed', materialized: 'Became due', skipped: 'Skipped', deferred: 'Moved', paused: 'Paused', resumed: 'Resumed', 'rule-revised': 'Repeat changed',
    promoted: 'Promoted to project', started: 'Started', finished: 'Finished', reinstated: 'Reinstated', 'status-active': 'Active', 'status-completed': 'Completed', 'status-dropped': 'Dropped' };
  return h('details', { class: 'history' }, h('summary', { class: 't-label' }, `History (${rec.history?.length ?? 0})`),
    h('ol', { class: 'history__list' }, [...(rec.history ?? [])].reverse().map((e) =>
      h('li', {}, h('span', { class: 't-num' }, fmtStamp(e.at)), ' ', names[e.kind] ?? e.kind, e.from || e.to ? h('span', { class: 'muted' }, ` ${e.from ?? '—'} → ${e.to ?? '—'}`) : null, e.reason ? h('span', { class: 'muted' }, ` · ${e.reason}`) : null))));
}
async function hardDelete(rec, then) {
  const ok = await confirmDialog({ title: 'Delete permanently?', danger: true, confirmLabel: 'Delete permanently',
    message: 'This removes it from this device for good. It will not appear in search, exports or future backups.' });
  if (!ok) return;
  try { await remove(rec.id); toast('Deleted'); then?.(); } catch (e) { toast(e.message, { tone: 'crit' }); }
}

export function openDetails(id) {
  const rec = get(id);
  if (!rec) return toast('That item no longer exists.', { tone: 'crit' });
  let m;
  const run = (fn, msg) => async () => { m.close(); await act(fn, msg)(); };
  const then = (fn) => async () => { m.close(); await fn(); };
  const A = [];
  const info = [];
  const d = day();
  switch (rec.type) {
    case 'task': {
      const st = M.taskState(rec, d), pc = M.postponeCount(rec);
      info.push(field('Status', stateChip(st)), field('Due / scheduled', rec.due ? `${fmtDate(rec.due)}${rec.dueTime ? ' ' + rec.dueTime : ''}` : 'No date'),
        field('Project', rec.projectId ? get(rec.projectId)?.name : null), field('Supports promise', rec.promiseId ? `${get(rec.promiseId)?.statement} — ${get(rec.promiseId)?.counterparty}` : null),
        field('Notes', rec.notes), field('Cancelled because', rec.cancelReason));
      if (pc >= 3 && rec.status === 'open') info.push(h('div', { class: 'notice' }, h('p', {}, `Postponed ${pc} times. What would help?`),
        h('div', { class: 'btn-row' }, btn('Keep this date', () => m.close(), 'btn--ghost'), btn('Remove the date', run(() => M.unscheduleTask(rec), 'Date removed'), 'btn--ghost'),
          btn('Clarify the next step', then(() => taskDialog(rec)), 'btn--ghost'), btn('Let it go', then(() => reasonDialog('Cancel task', 'Why (optional)', async (v) => save(M.cancelTask(rec, v.reason), 'Task cancelled'))), 'btn--ghost'))));
      if (rec.archived) A.push(btn('Restore from archive', run(() => M.unarchiveTask(rec), 'Restored')), btn('Delete permanently', () => { m.close(); hardDelete(rec); }, 'btn--danger'));
      else if (rec.status === 'open') A.push(btn('Complete', run(() => M.completeTask(rec), 'Task completed'), 'btn--primary'), btn(rec.due ? 'Reschedule' : 'Schedule', then(() => scheduleDialog(rec))),
        rec.due ? btn('Remove date', run(() => M.unscheduleTask(rec), 'Date removed')) : null, btn('Edit', then(() => taskDialog(rec))),
        btn('Cancel task', then(() => reasonDialog('Cancel task', 'Why (optional)', async (v) => save(M.cancelTask(rec, v.reason), 'Task cancelled'))), 'btn--ghost'));
      else A.push(btn('Reopen', run(() => M.reopenTask(rec), 'Reopened')), btn('Archive', run(() => M.archiveTask(rec), 'Archived'), 'btn--ghost'));
      break;
    }
    case 'promise': {
      const st = M.promiseState(rec, d);
      const support = ofType('task').filter((t) => t.promiseId === rec.id);
      info.push(field('To', rec.counterparty), field('Status', stateChip(st)), field('Date promised', rec.committedDate ? fmtDate(rec.committedDate) : 'None'),
        field('My target date', rec.targetDate ? fmtDate(rec.targetDate) : null), field('Notes', rec.notes),
        rec.status === 'cancelled' ? field('Cancelled', `${rec.cancelReason ?? 'No reason given'}${rec.mutualRelease ? ' · they agreed' : ''}`) : null,
        support.length ? h('div', { class: 'kv' }, h('dt', { class: 't-label' }, 'Supporting tasks'), h('dd', {}, list(support, taskRow, ''))) : null);
      if (rec.archived) A.push(btn('Restore from archive', run(() => M.unarchivePromise(rec), 'Restored')), btn('Delete permanently', () => { m.close(); hardDelete(rec); }, 'btn--danger'));
      else if (rec.status === 'open') A.push(
        btn('Mark fulfilled', run(() => M.fulfillPromise(rec), `Promise to ${rec.counterparty} fulfilled`), 'btn--primary'),
        btn('Move my target date', then(() => formDialog({ title: 'Move my target date', tone: 'violet',
          intro: `This only changes your own planning. ${rec.counterparty} still expects ${rec.committedDate ? fmtDate(rec.committedDate) : 'it as promised'}. Do they need to hear from you?`,
          fields: [{ name: 'targetDate', label: 'New target date', type: 'date', required: true, value: rec.targetDate ?? d }], submitLabel: 'Move target',
          onSubmit: async (v) => save(M.deferPromise(rec, v.targetDate), 'Target moved') }))),
        btn('New date agreed', then(() => formDialog({ title: 'Record a new agreed date', tone: 'violet', intro: `Only use this after ${rec.counterparty} agreed to the new date.`,
          fields: [{ name: 'committedDate', label: 'New agreed date', type: 'date', required: true, value: rec.committedDate ?? d }, { name: 'confirmed', label: `${rec.counterparty} agreed to this date`, type: 'checkbox' }],
          submitLabel: 'Record agreement', onSubmit: async (v) => save(M.renegotiatePromise(rec, v.committedDate, { confirmed: v.confirmed }), 'New date recorded') }))),
        btn('Add supporting task', then(() => taskDialog(null, { promiseId: rec.id }))), btn('Edit', then(() => promiseDialog(rec))),
        btn('Cancel promise', then(() => reasonDialog('Cancel promise', 'Why (optional)', async (v) => save(M.cancelPromise(rec, { reason: v.reason, mutualRelease: v.mutual }), 'Promise cancelled'),
          [{ name: 'mutual', label: `${rec.counterparty} agreed to release me`, type: 'checkbox' }])), 'btn--ghost'));
      else A.push(btn('Reopen', run(() => M.reopenPromise(rec), 'Reopened')), btn('Archive', run(() => M.archivePromise(rec), 'Archived'), 'btn--ghost'));
      break;
    }
    case 'appointment': {
      const lb = M.leaveBy(rec);
      info.push(field('When', `${fmtDate(rec.date)} · ${rec.allDay ? 'All day' : `${rec.start}${rec.end ? '–' + rec.end : ''}`}`), field('Where', rec.location),
        field('Leave by', rec.allDay ? null : lb.available ? `${lb.time} = arrive ${lb.arrival} − ${lb.travel} min travel − ${lb.buffer} min buffer` : `Unavailable — ${lb.reason.toLowerCase()}`),
        field('Time zone', rec.timeZone), field('Source', 'Entered in this app · not on Google Calendar'), field('Notes', rec.notes), field('Status', stateChip(rec.status === 'scheduled' ? 'open' : rec.status)));
      A.push(btn('Edit', then(() => appointmentDialog(rec)), 'btn--primary'),
        rec.status === 'scheduled' ? btn('Cancel appointment', run(() => M.cancelAppointment(rec), 'Appointment cancelled'), 'btn--ghost') : btn('Reinstate', run(() => M.reinstateAppointment(rec), 'Reinstated')),
        rec.archived ? null : btn('Archive', run(() => M.archiveAppointment(rec), 'Archived'), 'btn--ghost'),
        btn('Delete permanently', () => { m.close(); hardDelete(rec); }, 'btn--danger'));
      break;
    }
    case 'routine': {
      const next = M.nextSlotAfter(rec, d);
      info.push(field('Repeats', M.describeRule(M.currentRule(rec, d))), field('Started', fmtDate(rec.anchor)), field('Next', rec.paused ? 'Paused' : next ? fmtDate(next) : 'No further dates'),
        field('Time', rec.dueTime), field('Ends', rec.endDate ? fmtDate(rec.endDate) : null), field('Notes', rec.notes));
      A.push(btn('Edit', then(() => routineDialog(rec)), 'btn--primary'),
        rec.paused ? btn('Resume', run(() => M.resumeRoutine(rec, d), 'Resumed — missed dates are not added back')) : btn('Pause', run(() => M.pauseRoutine(rec, d), 'Paused')),
        rec.archived ? btn('Restore', run(() => M.unarchiveRoutine(rec), 'Restored')) : btn('Archive', run(() => M.archiveRoutine(rec), 'Archived'), 'btn--ghost'),
        btn('Delete permanently', () => { m.close(); hardDelete(rec); }, 'btn--danger'));
      break;
    }
    case 'occurrence': {
      const r = get(rec.routineId);
      info.push(field('Routine', r?.title ?? rec.title), field('Was due', fmtDate(rec.slot)), rec.target !== rec.slot ? field('Moved to', fmtDate(rec.target)) : null, field('Status', stateChip(rec.status)));
      if (rec.status === 'open') A.push(btn('Done', run(() => M.completeOccurrence(rec), 'Routine done'), 'btn--primary'), btn('Skip this time', run(() => M.skipOccurrence(rec), 'Skipped')),
        btn('Move to another day', then(() => formDialog({ title: 'Move to another day', tone: 'green', intro: 'Only this time moves. The schedule stays the same.',
          fields: [{ name: 'target', label: 'Do it on', type: 'date', required: true, value: M.addDays(d, 1) }], submitLabel: 'Move', onSubmit: async (v) => save(M.deferOccurrence(rec, v.target), 'Moved') }))));
      else A.push(btn('Reopen', run(() => M.reopenOccurrence(rec), 'Reopened')));
      if (r) A.push(btn('Open routine', then(() => openDetails(r.id)), 'btn--ghost'));
      break;
    }
    case 'inbox':
      info.push(field('Captured', fmtStamp(rec.createdAt)), field('Status', stateChip(rec.status)), rec.processedInto ? field('Became', h('button', { class: 'linklike', type: 'button', onclick: then(() => openDetails(rec.processedInto.id)) }, `${rec.processedInto.type} →`)) : null);
      if (rec.status === 'unprocessed') A.push(btn('Clarify', then(() => clarifyDialog(rec)), 'btn--primary'));
      else A.push(btn('Back to inbox', run(() => M.reopenInbox(rec), 'Back in inbox')));
      A.push(btn('Delete permanently', () => { m.close(); hardDelete(rec); }, 'btn--danger'));
      break;
    case 'idea':
      info.push(field('Notes', rec.notes), field('Status', stateChip(rec.archived ? 'archived' : rec.status)), rec.promotedTo ? field('Project', h('button', { class: 'linklike', type: 'button', onclick: then(() => openDetails(rec.promotedTo)) }, `${get(rec.promotedTo)?.name ?? 'project'} →`)) : null);
      if (rec.status === 'open' && !rec.archived) A.push(btn('Turn into a project', then(() => promoteDialog(rec)), 'btn--primary'));
      A.push(btn('Edit', then(() => ideaDialog(rec))), rec.archived ? btn('Restore', run(() => M.unarchiveIdea(rec), 'Restored')) : btn('Archive', run(() => M.archiveIdea(rec), 'Archived'), 'btn--ghost'));
      break;
    case 'project': {
      const next = M.projectNextActions(rec, ofType('task'));
      const allTasks = ofType('task').filter((t) => t.projectId === rec.id);
      info.push(field('Done looks like', rec.outcome), field('Why', rec.reason), field('Area', rec.area), field('Review', fmtDate(rec.reviewDate)), field('Deadline', rec.deadline ? fmtDate(rec.deadline) : null),
        field('Status', stateChip(rec.status)), rec.status === 'active' && !next.length ? h('p', { class: 'notice' }, 'This project has no open next action. Add one so it can move.') : null,
        h('div', { class: 'kv' }, h('dt', { class: 't-label' }, 'Actions'), h('dd', {}, list(allTasks, taskRow, 'No actions yet.'))));
      A.push(btn('Add next action', then(() => taskDialog(null, { projectId: rec.id })), 'btn--primary'), btn('Edit', then(() => projectDialog(rec))),
        rec.status === 'active' ? btn('Mark completed', run(() => M.setProjectStatus(rec, 'completed'), 'Project completed')) : btn('Make active', run(() => M.setProjectStatus(rec, 'active'), 'Project active')),
        rec.status === 'active' ? btn('Drop project', run(() => M.setProjectStatus(rec, 'dropped'), 'Project dropped'), 'btn--ghost') : null);
      break;
    }
    case 'checkin':
      info.push(field('Date', fmtDate(rec.date)), field('Status', stateChip(rec.status)),
        rec.priorities?.length ? field('Priorities', h('ol', {}, rec.priorities.map((p) => h('li', {}, p.label)))) : null, field('Intention', rec.intention),
        rec.decisions?.length ? field('Decisions', h('ul', {}, rec.decisions.map((x) => h('li', {}, `${x.label}: ${x.choiceLabel ?? x.choice}`)))) : null,
        field("Tomorrow's most important outcome", rec.tomorrowOutcome));
      break;
  }
  m = openModal({
    title: M.titleOf(rec), tone: { promise: 'violet', routine: 'green', occurrence: 'green', idea: 'amber', project: 'amber', checkin: 'green' }[rec.type],
    body: h('div', { class: 'details' }, h('div', { class: 'details__type' }, typeChip(rec.type)), h('dl', { class: 'kv-list' }, info.filter(Boolean)), historyList(rec)),
    actions: A.filter(Boolean),
  });
}
