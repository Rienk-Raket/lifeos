import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/model.js';
import { createVerifiedBackup, openBackupFile, encryptBackup } from '../src/backup.js';

const D = '2026-10-15'; // Thursday

test('inbox rejects empty and keeps original text', () => {
  assert.throws(() => M.createInbox('   '));
  const i = M.createInbox('  call   mum ');
  assert.equal(i.text, 'call mum');
  assert.equal(i.status, 'unprocessed');
  const p = M.processInbox(i, { type: 'task', id: 't1' });
  assert.equal(p.status, 'processed');
  assert.equal(p.text, 'call mum');
});

test('task postponement counts only later moves of a scheduled task', () => {
  let t = M.createTask({ title: 'File taxes' });
  t = M.scheduleTask(t, '2026-10-16'); // first schedule: not counted
  t = M.scheduleTask(t, '2026-10-18'); // later: counted
  t = M.scheduleTask(t, '2026-10-17'); // earlier: not counted
  t = M.unscheduleTask(t);             // not counted
  t = M.scheduleTask(t, '2026-10-20'); // from unscheduled: not counted
  t = M.scheduleTask(t, '2026-10-21'); // counted
  t = M.scheduleTask(t, '2026-10-22'); // counted
  assert.equal(M.postponeCount(t), 3);
  assert.equal(M.taskState(t, '2026-10-23'), 'overdue');
});

test('task lifecycle: archive requires resolution', () => {
  let t = M.createTask({ title: 'x', due: D });
  assert.throws(() => M.archiveTask(t));
  t = M.completeTask(t);
  t = M.archiveTask(t);
  assert.equal(M.taskState(t, D), 'archived');
  assert.throws(() => M.reopenTask(t));
  t = M.reopenTask(M.unarchiveTask(t));
  assert.equal(t.status, 'open');
});

test('promise local defer never changes committed date; renegotiation needs confirmation', () => {
  let p = M.createPromise({ statement: 'Send photos', counterparty: 'Sam', committedDate: '2026-10-14' });
  assert.equal(M.promiseState(p, D), 'overdue');
  p = M.deferPromise(p, '2026-10-20');
  assert.equal(p.committedDate, '2026-10-14');
  assert.equal(M.promiseState(p, D), 'overdue'); // still overdue vs committed date
  assert.throws(() => M.renegotiatePromise(p, '2026-10-21', {}));
  p = M.renegotiatePromise(p, '2026-10-21', { confirmed: true });
  assert.equal(p.committedDate, '2026-10-21');
  assert.equal(M.promiseState(p, D), 'upcoming');
  p = M.cancelPromise(p, { reason: 'plans changed' });
  assert.equal(p.status, 'cancelled');
  assert.equal(p.mutualRelease, false);
});

test('leave-by uses arrival − travel − buffer and is unavailable without travel', () => {
  const a = M.createAppointment({ title: 'Dentist', date: D, start: '09:30', travelMinutes: 25, bufferMinutes: 10 });
  assert.deepEqual(M.leaveBy(a).time, '08:55');
  const b = M.createAppointment({ title: 'Call', date: D, start: '09:30' });
  assert.equal(M.leaveBy(b).available, false);
  const c = M.createAppointment({ title: 'Train', date: D, start: '10:00', arriveBy: '09:45', travelMinutes: 15 });
  assert.equal(M.leaveBy(c).time, '09:30');
});

test('routine slots: weekly, monthly clamp, interval days', () => {
  const w = M.createRoutine({ title: 'Bins', anchor: '2026-10-01', rule: { freq: 'weekly', interval: 1, weekdays: [4] } });
  assert.ok(M.isSlot(w, D));
  assert.equal(M.nextSlotAfter(w, D), '2026-10-22');
  const m = M.createRoutine({ title: 'Rent', anchor: '2026-01-31', rule: { freq: 'monthly', interval: 1, monthDay: 31 } });
  assert.ok(M.isSlot(m, '2026-02-28'));
  const d = M.createRoutine({ title: 'Plants', anchor: '2026-10-10', rule: { freq: 'daily', interval: 3 } });
  assert.ok(M.isSlot(d, '2026-10-13'));
  assert.ok(!M.isSlot(d, D));
});

test('materialisation is idempotent and exposes only latest slot', () => {
  const r = M.createRoutine({ title: 'Water plants', anchor: '2026-10-01', rule: { freq: 'daily', interval: 1 } });
  const first = M.materializeOccurrences([r], [], D);
  assert.equal(first.length, 1);
  assert.equal(first[0].slot, D);
  assert.equal(M.materializeOccurrences([r], first, D).length, 0);
  const done = M.completeOccurrence(first[0]);
  assert.equal(M.materializeOccurrences([r], [done], D).length, 0); // completed slot does not regenerate
  // defer keeps slot; next day new slot is separate
  const deferred = M.deferOccurrence(first[0], '2026-10-17');
  assert.equal(deferred.slot, D);
  const next = M.materializeOccurrences([r], [deferred], '2026-10-16');
  assert.equal(next.length, 1);
  assert.notEqual(next[0].id, deferred.id);
});

test('pause suppresses, resume does not backfill', () => {
  let r = M.createRoutine({ title: 'Run', anchor: '2026-10-01', rule: { freq: 'weekly', interval: 1, weekdays: [1] } }); // Mondays
  r = M.pauseRoutine(r, '2026-10-02');
  assert.equal(M.materializeOccurrences([r], [], D).length, 0);
  r = M.resumeRoutine(r, D); // missed Mon 5th & 12th not backfilled
  assert.equal(M.materializeOccurrences([r], [], D).length, 0);
  assert.equal(M.materializeOccurrences([r], [], '2026-10-19')[0].slot, '2026-10-19');
});

test('rule revision only affects future slots', () => {
  let r = M.createRoutine({ title: 'Laundry', anchor: '2026-10-01', rule: { freq: 'daily', interval: 1 } });
  r = M.reviseRoutine(r, { rule: { freq: 'daily', interval: 7 } }, D);
  assert.ok(M.isSlot(r, D)); // today still under the old rule
  assert.ok(M.isSlot(r, '2026-10-22'));   // 21 days after anchor
  assert.ok(!M.isSlot(r, '2026-10-20'));  // new 7-day rule applies after today
  assert.equal(M.currentRule(r, '2026-10-16').interval, 7);
});

test('idea promotion creates project with exactly one next action', () => {
  const i = M.createIdea({ title: 'Garden shed' });
  const { idea, project, task } = M.promoteIdea(i, { name: 'Build shed', outcome: 'Tools stored dry', reason: 'Garage is full', area: 'Home', reviewDate: '2026-11-01', nextAction: 'Measure the corner' });
  assert.equal(idea.status, 'promoted');
  assert.equal(task.projectId, project.id);
  assert.equal(M.projectNextActions(project, [task]).length, 1);
  assert.throws(() => M.promoteIdea(idea, {}));
});

test('evening check-in requires a decision for every unfinished item', () => {
  const c = M.draftCheckin('evening', D, null);
  assert.throws(() => M.finishEvening(c, { decisions: [], unresolved: ['t1'] }));
  const f = M.finishEvening(c, { decisions: [{ ref: 't1', choice: 'tomorrow' }], unresolved: ['t1'], tomorrowOutcome: 'Ship it' });
  assert.equal(f.status, 'finished');
});

test('today groups and search', () => {
  const all = [
    M.createTask({ title: 'Overdue thing', due: '2026-10-10' }),
    M.createTask({ title: 'Future thing', due: '2026-10-30' }),
    M.createPromise({ statement: 'Return drill', counterparty: 'Ana', targetDate: D }),
    M.createAppointment({ title: 'Dentist', date: D, start: '14:00' }),
    M.createAppointment({ title: 'Lunch', date: D, start: '12:00' }),
  ];
  const t = M.buildToday(all, D);
  assert.deepEqual(t.tasks.map((x) => x.title), ['Overdue thing']);
  assert.equal(t.promises.length, 1);
  assert.deepEqual(t.appts.map((a) => a.title), ['Lunch', 'Dentist']);
  assert.equal(M.search(all, 'ana')[0].record.type, 'promise');
  assert.equal(M.search(all, '').length, 0);
});

test('encrypted backup round-trips, verifies, and rejects wrong passphrase / tampering', async () => {
  const recs = [M.createTask({ title: 'Secret task' }), M.createInbox('note')];
  const { text, counts } = await createVerifiedBackup(recs, 'correct horse battery');
  assert.equal(counts.task, 1);
  assert.ok(!text.includes('Secret task'));
  const ok = await openBackupFile(text, 'correct horse battery');
  assert.equal(ok.data.records.length, 2);
  await assert.rejects(openBackupFile(text, 'wrong passphrase!!'));
  const obj = JSON.parse(text); obj.ciphertext = obj.ciphertext.slice(0, -8) + 'AAAAAAAA';
  await assert.rejects(openBackupFile(JSON.stringify(obj), 'correct horse battery'));
  await assert.rejects(encryptBackup(recs, 'short'));
  await assert.rejects(openBackupFile('{"format":"nope"}'));
});

test('plain export validates counts', () => {
  const ex = M.buildExport([M.createTask({ title: 'a' })]);
  assert.ok(M.validateExport(structuredClone(ex)));
  ex.counts.task = 5;
  assert.throws(() => M.validateExport(ex));
});
