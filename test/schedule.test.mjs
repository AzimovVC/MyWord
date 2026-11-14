import { test } from 'node:test';
import assert from 'node:assert/strict';
import { avoidTimes, fmtMin, localParts, addDays, dueFor, dayState } from '../public/schedule.js';

const hm = (arr) => arr.map(fmtMin);

test('«Устоять» 08:00–20:00: плотности из раздела 7.2', () => {
  assert.deepEqual(avoidTimes('08:00', '20:00', 'off'), []);
  assert.deepEqual(hm(avoidTimes('08:00', '20:00', 'quiet')), ['08:00', '20:00']);
  assert.deepEqual(hm(avoidTimes('08:00', '20:00', 'normal')), ['08:00', '11:00', '14:00', '17:00', '20:00']);
  const dense = avoidTimes('08:00', '20:00', 'dense');
  assert.equal(dense.length, 13);
  assert.equal(fmtMin(dense[0]), '08:00');
  assert.equal(fmtMin(dense.at(-1)), '20:00');
});

test('плотности: конец не на шаге и пустой период', () => {
  assert.deepEqual(hm(avoidTimes('08:00', '19:00', 'normal')), ['08:00', '11:00', '14:00', '17:00', '19:00']);
  assert.deepEqual(hm(avoidTimes('08:00', '09:30', 'dense')), ['08:00', '09:00', '09:30']);
  assert.deepEqual(avoidTimes('20:00', '08:00', 'normal'), []);
});

test('localParts: один момент в разных поясах, смена даты', () => {
  const t = Date.UTC(2026, 2, 10, 21, 30); // 10 марта 21:30 UTC
  assert.deepEqual([localParts(t, 'UTC').day, localParts(t, 'UTC').hm], ['2026-03-10', '21:30']);
  assert.deepEqual([localParts(t, 'Europe/Moscow').day, localParts(t, 'Europe/Moscow').hm], ['2026-03-11', '00:30']);
  assert.deepEqual([localParts(t, 'America/New_York').day, localParts(t, 'America/New_York').hm], ['2026-03-10', '17:30']); // EDT
  assert.equal(localParts(t, 'Asia/Kolkata').hm, '03:00'); // +5:30
});

test('localParts: полночь это 00:00, а не 24:00', () => {
  const t = Date.UTC(2026, 5, 1, 0, 0);
  assert.deepEqual([localParts(t, 'UTC').day, localParts(t, 'UTC').hm], ['2026-06-01', '00:00']);
});

test('localParts: переход на летнее время (Нью-Йорк, 8 марта 2026)', () => {
  const before = Date.UTC(2026, 2, 8, 6, 59); // 01:59 EST
  const after = Date.UTC(2026, 2, 8, 7, 0);   // 03:00 EDT
  assert.equal(localParts(before, 'America/New_York').hm, '01:59');
  assert.equal(localParts(after, 'America/New_York').hm, '03:00');
});

test('addDays через границу месяца и года', () => {
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});

const doH = { id: 'a', kind: 'do', name: 'Зарядка', start: '07:00', end: '09:00', remind: '07:05' };
const logC = { hid: 'a', typed: 'x', hint: false, sim: 1 };
const slip = { hid: 'h4', slip: true };
const part = { hid: 'c', part: true };

test('«Сделать»: напоминание только в remind и только если не подтверждено', () => {
  assert.deepEqual(dueFor(doH, '07:05', []), { type: 'remind' });
  assert.equal(dueFor(doH, '07:06', []), null);
  assert.equal(dueFor(doH, '07:05', [logC]), null);
  assert.equal(dueFor({ ...doH, remind: '' }, '07:05', []), null);
});

test('«Счёт»: прогресс в уведомлении, день закрыт фразой — пропуск', () => {
  const c = { id: 'c', kind: 'count', name: 'Duo', start: '08:00', end: '22:00', remind: '18:00', goal: 3 };
  assert.deepEqual(dueFor(c, '18:00', [part, part]), { type: 'remind', progress: { done: 2, goal: 3 } });
  assert.equal(dueFor(c, '18:00', [part, part, part, logC]), null);
});

test('«Таймер»: пропуск, если сегодня уже есть сессия', () => {
  const t = { id: 't', kind: 'timer', name: 'Медитация', start: '07:30', end: '09:00', remind: '07:25', dur: 10 };
  assert.deepEqual(dueFor(t, '07:25', []), { type: 'remind' });
  assert.equal(dueFor(t, '07:25', [{ hid: 't', minutes: 10, typed: '' }]), null);
});

test('«Устоять»: время по плотности, последнее просит подтвердить', () => {
  const a = { id: 'h4', kind: 'avoid', name: 'Без ленты', start: '08:00', end: '20:00', notify: 'normal' };
  assert.deepEqual(dueFor(a, '11:00', []), { type: 'avoid', last: false });
  assert.deepEqual(dueFor(a, '20:00', []), { type: 'avoid', last: true });
  assert.equal(dueFor(a, '12:00', []), null);
  assert.equal(dueFor({ ...a, notify: 'off' }, '11:00', []), null);
});

test('«Устоять»: срыв и подтверждение гасят остальные уведомления дня', () => {
  const a = { id: 'h4', kind: 'avoid', name: 'Без ленты', start: '08:00', end: '20:00', notify: 'normal' };
  assert.equal(dueFor(a, '14:00', [slip]), null);
  assert.equal(dueFor(a, '17:00', [logC]), null);
  assert.deepEqual(dueFor(a, '14:00', [part]), { type: 'avoid', last: false }); // «порция» день не закрывает
});

test('dayState: срыв отменяет «сделано»', () => {
  assert.equal(dayState([logC, slip]).done, false);
  assert.equal(dayState([logC]).done, true);
  assert.equal(dayState([part, part]).parts, 2);
});
