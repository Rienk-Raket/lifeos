// LifeOS domain model — pure functions, no DOM, no storage.
// Every record: { id, type, createdAt, updatedAt, history: [{ at, kind, ...data }] }.
// Dates are local calendar dates as 'YYYY-MM-DD'; times as 'HH:MM'.

export const SCHEMA_VERSION = 1;
export const TYPES = ['inbox', 'task', 'promise', 'appointment', 'routine', 'occurrence', 'idea', 'project', 'checkin'];

/* ---------------- ids & dates ---------------- */
export function uid(prefix = 'r') {
  const rnd = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${rnd}`;
}
const pad = (n) => String(n).padStart(2, '0');
export function toDateStr(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
export function parseDate(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
export function today(now = new Date()) { return toDateStr(now); }
export function addDays(s, n) { const d = parseDate(s); d.setDate(d.getDate() + n); return toDateStr(d); }
export function daysBetween(a, b) { return Math.round((parseDate(b) - parseDate(a)) / 86400000); }
export function isValidDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return toDateStr(parseDate(s)) === s;
}
export function isValidTime(s) { return typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s); }
export function timeToMin(t) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }
export function minToTime(m) { const x = ((m % 1440) + 1440) % 1440; return `${pad(Math.floor(x / 60))}:${pad(x % 60)}`; }

function stamp(now) { return (now ?? new Date()).toISOString(); }
function base(type, now, prefix) {
  const at = stamp(now);
  return { id: uid(prefix ?? type.slice(0, 3)), type, createdAt: at, updatedAt: at, history: [{ at, kind: 'created' }] };
}
function evolve(rec, kind, patch = {}, data = {}, now) {
  const at = stamp(now);
  return { ...rec, ...patch, updatedAt: at, history: [...(rec.history ?? []), { at, kind, ...data }] };
}
function req(cond, msg) { if (!cond) throw new Error(msg); }
const clean = (s) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : '');
const opt = (s) => (typeof s === 'string' && s.trim() ? s.trim() : null);

/* ---------------- inbox ---------------- */
export function createInbox(text, { source = 'quick-capture', now } = {}) {
  const t = clean(text);
  req(t, 'Type something to capture.');
  req(t.length <= 2000, 'Keep a capture under 2000 characters.');
  return { ...base('inbox', now, 'inb'), text: t, source, status: 'unprocessed', processedInto: null };
}
export function processInbox(item, into, now) {
  return evolve(item, 'processed', { status: 'processed', processedInto: into ?? null }, { into: into ?? null }, now);
}
export function reopenInbox(item, now) { return evolve(item, 'reopened', { status: 'unprocessed', processedInto: null }, {}, now); }

/* ---------------- tasks (policy §4.3, §7.1) ---------------- */
export function createTask(f, now) {
  const title = clean(f.title);
  req(title, 'A task needs a title.');
  if (f.due) req(isValidDate(f.due), 'Due date is not a valid date.');
  if (f.dueTime) req(isValidTime(f.dueTime), 'Due time is not valid.');
  return {
    ...base('task', now, 'tsk'),
    title, notes: opt(f.notes), due: f.due || null, dueTime: f.due && f.dueTime ? f.dueTime : null,
    priority: f.priority === 'high' ? 'high' : 'normal',
    status: 'open', projectId: f.projectId ?? null, promiseId: f.promiseId ?? null,
    archived: false, cancelReason: null, completedAt: null,
  };
}
export function editTask(t, f, now) {
  const title = clean(f.title ?? t.title);
  req(title, 'A task needs a title.');
  // schedule changes go through defer/unschedule so history stays truthful
  return evolve(t, 'edited', {
    title, notes: f.notes !== undefined ? opt(f.notes) : t.notes,
    priority: f.priority ? (f.priority === 'high' ? 'high' : 'normal') : t.priority,
    projectId: f.projectId !== undefined ? f.projectId : t.projectId,
    promiseId: f.promiseId !== undefined ? f.promiseId : t.promiseId,
  }, {}, now);
}
const isOpen = (t) => t.status === 'open' && !t.archived;
export function completeTask(t, now) { req(isOpen(t), 'Only an open task can be completed.'); return evolve(t, 'completed', { status: 'done', completedAt: stamp(now) }, {}, now); }
export function reopenTask(t, now) { req(t.status !== 'open' && !t.archived, 'Restore it from the archive first.'); return evolve(t, 'reopened', { status: 'open', completedAt: null, cancelReason: null }, {}, now); }
export function cancelTask(t, reason, now) { req(isOpen(t), 'Only an open task can be cancelled.'); return evolve(t, 'cancelled', { status: 'cancelled', cancelReason: opt(reason) }, { reason: opt(reason) }, now); }
export function archiveTask(t, now) { req(t.status !== 'open', 'Complete or cancel a task before archiving it.'); req(!t.archived, 'Already archived.'); return evolve(t, 'archived', { archived: true }, {}, now); }
export function unarchiveTask(t, now) { req(t.archived, 'Not archived.'); return evolve(t, 'unarchived', { archived: false }, {}, now); }
/** Schedule or reschedule. Counts as a postponement only if moving a scheduled task to a later target. */
export function scheduleTask(t, due, dueTime, now) {
  req(isOpen(t), 'Only an open task can be rescheduled.');
  req(isValidDate(due), 'Pick a valid date.');
  if (dueTime) req(isValidTime(dueTime), 'Time is not valid.');
  const from = t.due ? `${t.due}${t.dueTime ? 'T' + t.dueTime : ''}` : null;
  const to = `${due}${dueTime ? 'T' + dueTime : ''}`;
  if (from === to) return t;
  const later = t.due ? (due > t.due || (due === t.due && (dueTime ?? '99:99') > (t.dueTime ?? '99:99'))) : false;
  return evolve(t, later ? 'postponed' : 'scheduled', { due, dueTime: dueTime || null }, { from, to, counted: later }, now);
}
export function unscheduleTask(t, now) {
  req(isOpen(t), 'Only an open task can be unscheduled.');
  if (!t.due) return t;
  return evolve(t, 'unscheduled', { due: null, dueTime: null }, { from: t.due }, now);
}
export function postponeCount(t) { return (t.history ?? []).filter((h) => h.kind === 'postponed' && h.counted).length; }
export function taskState(t, day) {
  if (t.archived) return 'archived';
  if (t.status !== 'open') return t.status;
  if (t.due && t.due < day) return 'overdue';
  if (t.due === day) return 'due-today';
  return t.due ? 'scheduled' : 'unscheduled';
}

/* ---------------- promises (policy §4.4, §7.2) ---------------- */
export function createPromise(f, now) {
  const statement = clean(f.statement);
  const counterparty = clean(f.counterparty);
  req(statement, 'Write down what you promised.');
  req(counterparty, 'Who did you promise this to?');
  for (const k of ['committedDate', 'targetDate']) if (f[k]) req(isValidDate(f[k]), 'Dates must be valid.');
  return {
    ...base('promise', now, 'prm'), statement, counterparty, notes: opt(f.notes),
    committedDate: f.committedDate || null, targetDate: f.targetDate || f.committedDate || null,
    status: 'open', archived: false, fulfilledAt: null, cancelReason: null, mutualRelease: false,
  };
}
export function editPromise(p, f, now) {
  const statement = clean(f.statement ?? p.statement);
  const counterparty = clean(f.counterparty ?? p.counterparty);
  req(statement && counterparty, 'A promise needs a statement and a person.');
  // committed date is NOT editable here — use renegotiate (explicit agreement)
  return evolve(p, 'edited', { statement, counterparty, notes: f.notes !== undefined ? opt(f.notes) : p.notes }, {}, now);
}
const pOpen = (p) => p.status === 'open' && !p.archived;
export function fulfillPromise(p, now) { req(pOpen(p), 'Only an open promise can be fulfilled.'); return evolve(p, 'fulfilled', { status: 'fulfilled', fulfilledAt: stamp(now) }, {}, now); }
export function reopenPromise(p, now) { req(p.status !== 'open' && !p.archived, 'Restore it from the archive first.'); return evolve(p, 'reopened', { status: 'open', fulfilledAt: null, cancelReason: null, mutualRelease: false }, {}, now); }
export function cancelPromise(p, { reason, mutualRelease = false } = {}, now) {
  req(pOpen(p), 'Only an open promise can be cancelled.');
  return evolve(p, 'cancelled', { status: 'cancelled', cancelReason: opt(reason), mutualRelease: !!mutualRelease }, { reason: opt(reason), mutualRelease: !!mutualRelease }, now);
}
/** Local defer: changes only the user's own target date. Never touches the committed date. */
export function deferPromise(p, targetDate, now) {
  req(pOpen(p), 'Only an open promise can be moved.');
  req(isValidDate(targetDate), 'Pick a valid date.');
  return evolve(p, 'local-target-changed', { targetDate }, { from: p.targetDate, to: targetDate }, now);
}
/** Renegotiation: only after the user confirms the other person agreed. */
export function renegotiatePromise(p, committedDate, { confirmed } = {}, now) {
  req(pOpen(p), 'Only an open promise can be renegotiated.');
  req(confirmed === true, 'Confirm that you agreed the new date with them.');
  req(isValidDate(committedDate), 'Pick a valid date.');
  return evolve(p, 'renegotiated', { committedDate, targetDate: p.targetDate && p.targetDate > committedDate ? committedDate : (p.targetDate ?? committedDate) }, { from: p.committedDate, to: committedDate }, now);
}
export function archivePromise(p, now) { req(p.status !== 'open', 'Fulfil or cancel a promise before archiving it.'); return evolve(p, 'archived', { archived: true }, {}, now); }
export function unarchivePromise(p, now) { req(p.archived, 'Not archived.'); return evolve(p, 'unarchived', { archived: false }, {}, now); }
/** The earliest of local target and committed date — the date the promise needs attention. */
export function promiseAttentionDate(p) {
  const ds = [p.targetDate, p.committedDate].filter(Boolean).sort();
  return ds[0] ?? null;
}
export function promiseState(p, day) {
  if (p.archived) return 'archived';
  if (p.status !== 'open') return p.status;
  if (p.committedDate && p.committedDate < day) return 'overdue';
  const d = promiseAttentionDate(p);
  if (d && d < day) return 'overdue';
  if (d === day) return 'due-today';
  return d ? 'upcoming' : 'no-date';
}

/* ---------------- appointments (policy §4.5) ---------------- */
export function createAppointment(f, now) {
  const title = clean(f.title);
  req(title, 'An appointment needs a title.');
  req(isValidDate(f.date), 'Pick a valid date.');
  const allDay = !!f.allDay;
  if (!allDay) { req(isValidTime(f.start), 'Pick a start time.'); if (f.end) req(isValidTime(f.end), 'End time is not valid.'); }
  const travel = f.travelMinutes === '' || f.travelMinutes == null ? null : Number(f.travelMinutes);
  const buffer = f.bufferMinutes === '' || f.bufferMinutes == null ? null : Number(f.bufferMinutes);
  if (travel != null) req(Number.isInteger(travel) && travel >= 0 && travel <= 1440, 'Travel time must be whole minutes (0–1440).');
  if (buffer != null) req(Number.isInteger(buffer) && buffer >= 0 && buffer <= 600, 'Buffer must be whole minutes (0–600).');
  const arriveBy = f.arriveBy ? f.arriveBy : null;
  if (arriveBy) req(isValidTime(arriveBy), 'Arrival time is not valid.');
  return {
    ...base('appointment', now, 'apt'), title, date: f.date, allDay,
    start: allDay ? null : f.start, end: allDay ? null : (f.end || null), arriveBy: allDay ? null : arriveBy,
    location: opt(f.location), travelMinutes: travel, bufferMinutes: buffer, notes: opt(f.notes),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    source: 'local', status: 'scheduled', archived: false,
  };
}
export function updateAppointment(a, f, now) {
  const next = createAppointment({ ...a, ...f }, now);
  return evolve(a, 'edited', { ...next, id: a.id, createdAt: a.createdAt, history: a.history, status: a.status, archived: a.archived }, {}, now);
}
export function cancelAppointment(a, now) { return evolve(a, 'cancelled', { status: 'cancelled' }, {}, now); }
export function reinstateAppointment(a, now) { return evolve(a, 'reinstated', { status: 'scheduled', archived: false }, {}, now); }
export function archiveAppointment(a, now) { return evolve(a, 'archived', { archived: true }, {}, now); }
/** leave-by = required arrival − travel − buffer. Unavailable unless travel time is known. */
export function leaveBy(a) {
  if (a.allDay || !a.start) return { available: false, reason: 'All-day appointment' };
  if (a.travelMinutes == null) return { available: false, reason: 'No travel time entered' };
  const arrival = a.arriveBy || a.start;
  const buffer = a.bufferMinutes ?? 0;
  const mins = timeToMin(arrival) - a.travelMinutes - buffer;
  return { available: true, time: minToTime(mins), previousDay: mins < 0, arrival, travel: a.travelMinutes, buffer };
}

/* ---------------- routines & occurrences (policy §4.6) ---------------- */
// rule: { freq: 'daily'|'weekly'|'monthly', interval: n>=1, weekdays?: [0..6], monthDay?: 1..31 }
export function validateRule(r) {
  req(['daily', 'weekly', 'monthly'].includes(r.freq), 'Pick how often it repeats.');
  const interval = Number(r.interval ?? 1);
  req(Number.isInteger(interval) && interval >= 1 && interval <= 365, 'Repeat interval must be 1–365.');
  const out = { freq: r.freq, interval };
  if (r.freq === 'weekly') {
    const w = [...new Set((r.weekdays ?? []).map(Number))].filter((x) => x >= 0 && x <= 6).sort();
    req(w.length, 'Pick at least one weekday.');
    out.weekdays = w;
  }
  if (r.freq === 'monthly') {
    const md = Number(r.monthDay);
    req(Number.isInteger(md) && md >= 1 && md <= 31, 'Day of month must be 1–31.');
    out.monthDay = md;
  }
  return out;
}
export function createRoutine(f, now) {
  const title = clean(f.title);
  req(title, 'A routine needs a title.');
  req(isValidDate(f.anchor), 'Pick a start date.');
  if (f.endDate) req(isValidDate(f.endDate) && f.endDate >= f.anchor, 'End date must be after the start date.');
  if (f.dueTime) req(isValidTime(f.dueTime), 'Time is not valid.');
  const rule = validateRule(f.rule ?? {});
  return {
    ...base('routine', now, 'rtn'), title, notes: opt(f.notes), anchor: f.anchor, endDate: f.endDate || null,
    dueTime: f.dueTime || null, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    revisions: [{ effectiveFrom: f.anchor, rule }], paused: false, pausedFrom: null, resumedFrom: null, archived: false,
  };
}
export function reviseRoutine(r, f, day, now) {
  const title = clean(f.title ?? r.title);
  req(title, 'A routine needs a title.');
  const patch = { title, notes: f.notes !== undefined ? opt(f.notes) : r.notes, dueTime: f.dueTime !== undefined ? (f.dueTime || null) : r.dueTime };
  if (patch.dueTime) req(isValidTime(patch.dueTime), 'Time is not valid.');
  if (f.endDate !== undefined) { if (f.endDate) req(isValidDate(f.endDate), 'End date is not valid.'); patch.endDate = f.endDate || null; }
  let data = {};
  if (f.rule) {
    const rule = validateRule(f.rule);
    const cur = currentRule(r, day);
    if (JSON.stringify(rule) !== JSON.stringify(cur)) {
      // affects only future, unmaterialised slots: effective from tomorrow
      const effectiveFrom = addDays(day, 1) > r.anchor ? addDays(day, 1) : r.anchor;
      patch.revisions = [...r.revisions.filter((v) => v.effectiveFrom < effectiveFrom), { effectiveFrom, rule }];
      data = { rule, effectiveFrom };
    }
  }
  return evolve(r, data.rule ? 'rule-revised' : 'edited', patch, data, now);
}
export function pauseRoutine(r, day, now) { req(!r.paused, 'Already paused.'); return evolve(r, 'paused', { paused: true, pausedFrom: day }, { from: day }, now); }
export function resumeRoutine(r, day, now) { req(r.paused, 'Not paused.'); return evolve(r, 'resumed', { paused: false, resumedFrom: day }, { from: day }, now); }
export function archiveRoutine(r, now) { return evolve(r, 'archived', { archived: true }, {}, now); }
export function unarchiveRoutine(r, now) { return evolve(r, 'unarchived', { archived: false }, {}, now); }

function ruleFor(r, day) {
  let cur = null;
  for (const v of r.revisions) if (v.effectiveFrom <= day) cur = v;
  return cur;
}
export function currentRule(r, day) { return (ruleFor(r, day) ?? r.revisions[0]).rule; }
function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }
/** Is `day` a slot of the routine (ignoring pause)? Recurrence counts from the routine anchor. */
export function isSlot(r, day) {
  if (day < r.anchor) return false;
  if (r.endDate && day > r.endDate) return false;
  const rev = ruleFor(r, day);
  if (!rev) return false;
  const { rule } = rev;
  const d = parseDate(day), a = parseDate(r.anchor);
  if (rule.freq === 'daily') return daysBetween(r.anchor, day) % rule.interval === 0;
  if (rule.freq === 'weekly') {
    if (!rule.weekdays.includes(d.getDay())) return false;
    const weekStart = (x) => { const c = new Date(x); c.setDate(c.getDate() - c.getDay()); return toDateStr(c); };
    const weeks = Math.round(daysBetween(weekStart(a), weekStart(d)) / 7);
    return weeks % rule.interval === 0;
  }
  if (rule.freq === 'monthly') {
    const months = (d.getFullYear() - a.getFullYear()) * 12 + (d.getMonth() - a.getMonth());
    if (months % rule.interval !== 0) return false;
    const target = Math.min(rule.monthDay, daysInMonth(d.getFullYear(), d.getMonth()));
    return d.getDate() === target;
  }
  return false;
}
/** Earliest date from which slots may materialise (pause/resume: no backfill). */
function eligibleFrom(r) {
  return r.resumedFrom && r.resumedFrom > r.anchor ? r.resumedFrom : r.anchor;
}
export function latestSlotOnOrBefore(r, day, maxBack = 400) {
  const from = eligibleFrom(r);
  for (let i = 0; i <= maxBack; i++) {
    const d = addDays(day, -i);
    if (d < from) return null;
    if (isSlot(r, d)) return d;
  }
  return null;
}
export function nextSlotAfter(r, day, maxAhead = 800) {
  for (let i = 1; i <= maxAhead; i++) {
    const d = addDays(day, i);
    if (r.endDate && d > r.endDate) return null;
    if (isSlot(r, d)) return d;
  }
  return null;
}
export const occurrenceId = (routineId, slot) => `occ_${routineId}_${slot}`;
/**
 * Idempotent materialisation: returns NEW occurrences to persist (never duplicates).
 * Only the latest due slot per routine is exposed — no long backlog of daily records.
 */
export function materializeOccurrences(routines, existing, day, now) {
  const have = new Set(existing.map((o) => o.id));
  const out = [];
  for (const r of routines) {
    if (r.archived || r.paused) continue;
    const slot = latestSlotOnOrBefore(r, day);
    if (!slot) continue;
    const id = occurrenceId(r.id, slot);
    if (have.has(id)) continue;
    const at = stamp(now);
    out.push({ id, type: 'occurrence', routineId: r.id, slot, target: slot, title: r.title, dueTime: r.dueTime,
      status: 'open', createdAt: at, updatedAt: at, history: [{ at, kind: 'materialized', slot }] });
  }
  return out;
}
export function completeOccurrence(o, now) { req(o.status === 'open', 'Already resolved.'); return evolve(o, 'completed', { status: 'done', resolvedAt: stamp(now) }, {}, now); }
export function skipOccurrence(o, now) { req(o.status === 'open', 'Already resolved.'); return evolve(o, 'skipped', { status: 'skipped', resolvedAt: stamp(now) }, {}, now); }
export function deferOccurrence(o, target, now) {
  req(o.status === 'open', 'Already resolved.');
  req(isValidDate(target), 'Pick a valid date.');
  return evolve(o, 'deferred', { target }, { from: o.target, to: target }, now); // slot stays the same
}
export function reopenOccurrence(o, now) { req(o.status !== 'open', 'Already open.'); return evolve(o, 'reopened', { status: 'open', resolvedAt: null }, {}, now); }
export function describeRule(rule) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const n = rule.interval;
  if (rule.freq === 'daily') return n === 1 ? 'Every day' : `Every ${n} days`;
  if (rule.freq === 'weekly') return `${n === 1 ? 'Every week' : `Every ${n} weeks`} on ${rule.weekdays.map((d) => days[d]).join(', ')}`;
  return `${n === 1 ? 'Every month' : `Every ${n} months`} on day ${rule.monthDay}`;
}

/* ---------------- ideas & projects (§4.11) ---------------- */
export function createIdea(f, now) {
  const title = clean(f.title);
  req(title, 'An idea needs a title.');
  return { ...base('idea', now, 'ida'), title, notes: opt(f.notes), status: 'open', promotedTo: null, archived: false };
}
export function editIdea(i, f, now) {
  const title = clean(f.title ?? i.title); req(title, 'An idea needs a title.');
  return evolve(i, 'edited', { title, notes: f.notes !== undefined ? opt(f.notes) : i.notes }, {}, now);
}
export function archiveIdea(i, now) { return evolve(i, 'archived', { archived: true }, {}, now); }
export function unarchiveIdea(i, now) { return evolve(i, 'unarchived', { archived: false }, {}, now); }
/** Returns { idea, project, task } — persist together in one transaction. Retry-safe via promotionKey. */
export function promoteIdea(idea, f, now) {
  req(idea.status === 'open', 'This idea was already promoted.');
  const name = clean(f.name), outcome = clean(f.outcome), reason = clean(f.reason), area = clean(f.area);
  req(name, 'Name the project.');
  req(outcome, 'Describe the outcome you want.');
  req(reason, 'Say why it matters.');
  req(area, 'Pick an area of life.');
  req(isValidDate(f.reviewDate), 'Pick a review date.');
  if (f.deadline) req(isValidDate(f.deadline), 'Deadline is not a valid date.');
  const project = { ...base('project', now, 'prj'), name, outcome, reason, area, owner: 'me', reviewDate: f.reviewDate,
    deadline: f.deadline || null, status: 'active', archived: false, sourceIdeaId: idea.id };
  const task = createTask({ title: f.nextAction, due: f.nextActionDue || null, projectId: project.id }, now);
  const promoted = evolve(idea, 'promoted', { status: 'promoted', promotedTo: project.id }, { projectId: project.id, taskId: task.id }, now);
  project.history[0] = { ...project.history[0], fromIdea: idea.id, nextActionId: task.id };
  return { idea: promoted, project, task };
}
export function editProject(p, f, now) {
  const patch = {};
  for (const k of ['name', 'outcome', 'reason', 'area']) if (f[k] !== undefined) { patch[k] = clean(f[k]); req(patch[k], 'Fields cannot be empty.'); }
  if (f.reviewDate !== undefined) { req(isValidDate(f.reviewDate), 'Review date is not valid.'); patch.reviewDate = f.reviewDate; }
  if (f.deadline !== undefined) { if (f.deadline) req(isValidDate(f.deadline), 'Deadline is not valid.'); patch.deadline = f.deadline || null; }
  return evolve(p, 'edited', patch, {}, now);
}
export function setProjectStatus(p, status, now) {
  req(['active', 'completed', 'dropped'].includes(status), 'Unknown status.');
  return evolve(p, `status-${status}`, { status }, {}, now);
}
export function projectNextActions(project, tasks) { return tasks.filter((t) => t.projectId === project.id && t.status === 'open' && !t.archived); }

/* ---------------- check-ins (§4.7, §4.8) ---------------- */
export function checkinId(kind, day) { return `chk_${kind}_${day}`; }
export function draftCheckin(kind, day, existing, now) {
  if (existing) return existing;
  const at = stamp(now);
  return { id: checkinId(kind, day), type: 'checkin', kind, date: day, status: 'draft', priorities: [], intention: null,
    decisions: [], tomorrowOutcome: null, createdAt: at, updatedAt: at, history: [{ at, kind: 'started' }] };
}
export function saveCheckinDraft(c, patch, now) { return { ...c, ...patch, updatedAt: stamp(now) }; }
export function finishMorning(c, { priorities, intention }, now) {
  req(Array.isArray(priorities) && priorities.length <= 3, 'Pick up to three priorities.');
  return evolve(c, 'finished', { status: 'finished', priorities, intention: opt(intention) }, { count: priorities.length }, now);
}
export function finishEvening(c, { decisions, tomorrowOutcome, unresolved }, now) {
  const missing = (unresolved ?? []).filter((u) => !decisions.find((d) => d.ref === u));
  req(missing.length === 0, 'Choose what happens to every unfinished item.');
  return evolve(c, 'finished', { status: 'finished', decisions, tomorrowOutcome: opt(tomorrowOutcome) }, { count: decisions.length }, now);
}

/* ---------------- Today ---------------- */
export function buildToday(all, day) {
  const by = (t) => all.filter((r) => r.type === t);
  const appts = by('appointment').filter((a) => a.date === day && a.status === 'scheduled' && !a.archived)
    .sort((a, b) => (a.allDay === b.allDay ? (a.start ?? '').localeCompare(b.start ?? '') : a.allDay ? -1 : 1));
  const tasks = by('task').filter((t) => t.status === 'open' && !t.archived && t.due && t.due <= day)
    .sort((a, b) => (a.due + (a.dueTime ?? '99')).localeCompare(b.due + (b.dueTime ?? '99')));
  const promises = by('promise').filter((p) => p.status === 'open' && !p.archived)
    .filter((p) => ['overdue', 'due-today'].includes(promiseState(p, day)))
    .sort((a, b) => (promiseAttentionDate(a) ?? '').localeCompare(promiseAttentionDate(b) ?? ''));
  const occurrences = by('occurrence').filter((o) => o.status === 'open' && o.target <= day)
    .sort((a, b) => a.target.localeCompare(b.target));
  const doneToday = all.filter((r) => {
    const h = (r.history ?? []).at(-1);
    return h && ['completed', 'fulfilled'].includes(h.kind) && toDateStr(new Date(h.at)) === day;
  });
  const morning = all.find((r) => r.id === checkinId('morning', day)) ?? null;
  const evening = all.find((r) => r.id === checkinId('evening', day)) ?? null;
  const yesterdayEvening = all.find((r) => r.id === checkinId('evening', addDays(day, -1))) ?? null;
  const inbox = by('inbox').filter((i) => i.status === 'unprocessed');
  const projectsNeedingAction = by('project').filter((p) => p.status === 'active' && !p.archived && projectNextActions(p, by('task')).length === 0);
  return { day, appts, tasks, promises, occurrences, doneToday, morning, evening, yesterdayEvening, inbox, projectsNeedingAction };
}

/* ---------------- search (§4.9) ---------------- */
const SEARCH_FIELDS = {
  inbox: ['text'], task: ['title', 'notes', 'cancelReason'], promise: ['statement', 'counterparty', 'notes', 'cancelReason'],
  appointment: ['title', 'location', 'notes'], routine: ['title', 'notes'], occurrence: ['title'],
  idea: ['title', 'notes'], project: ['name', 'outcome', 'reason', 'area'], checkin: ['intention', 'tomorrowOutcome'],
};
export function titleOf(r) {
  switch (r.type) {
    case 'inbox': return r.text;
    case 'promise': return r.statement;
    case 'project': return r.name;
    case 'checkin': return `${r.kind === 'morning' ? 'Morning' : 'Evening'} check-in · ${r.date}`;
    default: return r.title ?? r.id;
  }
}
function fold(s) { return s.toLocaleLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, ''); }
export function search(all, query, limit = 100) {
  const q = fold(query ?? '').trim();
  if (!q) return [];
  const terms = q.split(/\s+/);
  const results = [];
  for (const r of all) {
    const fields = SEARCH_FIELDS[r.type] ?? [];
    let text = fields.map((f) => r[f]).filter(Boolean).join(' · ');
    if (r.type === 'checkin') text += ' ' + (r.priorities ?? []).map((p) => p.label).join(' ');
    const hay = fold(text);
    if (!terms.every((t) => hay.includes(t))) continue;
    const i = hay.indexOf(terms[0]);
    const snippet = text.slice(Math.max(0, i - 40), i + 80);
    results.push({ record: r, snippet, score: (fold(titleOf(r)).includes(q) ? 2 : 0) + (r.archived ? -1 : 0) });
  }
  return results.sort((a, b) => b.score - a.score || b.record.updatedAt.localeCompare(a.record.updatedAt)).slice(0, limit);
}

/* ---------------- export envelope ---------------- */
export function buildExport(records, meta = {}, now) {
  const counts = Object.fromEntries(TYPES.map((t) => [t, records.filter((r) => r.type === t).length]));
  return { format: 'lifeos-export', schemaVersion: SCHEMA_VERSION, generatedAt: stamp(now), app: 'LifeOS prototype', counts, meta, records };
}
export function validateExport(obj) {
  req(obj && typeof obj === 'object', 'This file is not a LifeOS export.');
  req(obj.format === 'lifeos-export', 'This file is not a LifeOS export.');
  req(obj.schemaVersion === SCHEMA_VERSION, `Unsupported export version ${obj.schemaVersion}.`);
  req(Array.isArray(obj.records), 'Export has no records.');
  const ids = new Set();
  for (const r of obj.records) {
    req(r && typeof r.id === 'string' && TYPES.includes(r.type), 'Export contains an invalid record.');
    req(!ids.has(r.id), 'Export contains duplicate records.');
    ids.add(r.id);
  }
  for (const t of TYPES) req((obj.counts?.[t] ?? 0) === obj.records.filter((r) => r.type === t).length, 'Export record counts do not match — the file may be damaged.');
  return obj;
}
