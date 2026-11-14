import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getPlatformProxy } from 'wrangler';
import worker from '../src/worker.js';

let proxy, env, dir;
before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'slovo-'));
  proxy = await getPlatformProxy({ persist: { path: dir } });
  env = { ...proxy.env, APP_TOKEN: 'tok' };
  const sql = readFileSync(new URL('../migrations/0001_init.sql', import.meta.url), 'utf8').replace(/--.*$/gm, '');
  for (const st of sql.split(';').map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean)) await env.DB.exec(st + ';');
});
after(async () => { await proxy.dispose(); rmSync(dir, { recursive: true, force: true }); });

const call = (method, path, body, token = 'tok') =>
  worker.fetch(new Request('http://x' + path, {
    method, headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  }), env);
const J = async (r) => r.json();

const today = new Date().toISOString().slice(0, 10);
const habit = { id: 'h1', kind: 'avoid', name: 'Без ленты', start: '08:00', end: '20:00', remind: '', notify: 'normal',
  phrases: ['Я свободен от ленты, вечер мой.'], why: 'зачем', rule: 'правило', mode: 'memory', strict: 0.85 };

test('без токена 401', async () => {
  assert.equal((await call('GET', '/api/state', undefined, 'bad')).status, 401);
});

test('привычка: создать, обновить, прочитать', async () => {
  assert.equal((await call('PUT', '/api/habits/h1', habit)).status, 200);
  await call('PUT', '/api/habits/h2', { id: 'h2', kind: 'count', name: 'Duo', start: '08:00', end: '22:00', goal: 3, unit: 'урок', phrases: ['Я учусь каждый день.'] });
  await call('PUT', '/api/habits/h3', { id: 'h3', kind: 'timer', name: 'Медитация', start: '07:30', end: '09:00', remind: '07:25', dur: 10, phrases: [] });
  const s = await J(await call('GET', '/api/state'));
  const h1 = s.habits.find((h) => h.id === 'h1');
  assert.deepEqual(h1, { ...habit, remind: '', notify: 'normal' });
  assert.equal(s.habits.find((h) => h.id === 'h2').goal, 3);
  assert.equal(s.habits.find((h) => h.id === 'h3').dur, 10);
  habit.name = 'Без ленты 2';
  await call('PUT', '/api/habits/h1', habit);
  assert.equal((await J(await call('GET', '/api/state'))).habits.find((h) => h.id === 'h1').name, 'Без ленты 2');
});

test('валидация отклоняет мусор', async () => {
  assert.equal((await call('PUT', '/api/habits/hx', { ...habit, kind: 'zzz' })).status, 400);
  assert.equal((await call('PUT', '/api/habits/hx', { ...habit, start: '8:00' })).status, 400);
  assert.equal((await call('POST', '/api/logs', { hid: 'h1', day: 'вчера', time: '10:00' })).status, 400);
});

test('журнал: все типы, идемпотентность, удаление', async () => {
  const logs = [
    { id: 1001, hid: 'h1', day: today, time: '10:00', typed: 'я свободен', hint: true, sim: 0.9 },
    { id: 1002, hid: 'h1', day: today, time: '11:00', slip: true },
    { id: 1003, hid: 'h2', day: today, time: '09:00', part: true },
    { id: 1004, hid: 'h3', day: today, time: '07:40', minutes: 10, typed: '' },
    { id: 1005, hid: 'h2', day: today, time: '20:00', typed: 'x', hint: false, sim: 1, count: 3 },
  ];
  for (const l of logs) assert.equal((await call('POST', '/api/logs', l)).status, 200);
  await call('POST', '/api/logs', logs[0]); // повтор из очереди
  const s = await J(await call('GET', '/api/state'));
  assert.equal(s.logs.length, 5);
  assert.deepEqual(s.logs.find((l) => l.id === 1001), logs[0]);
  assert.deepEqual(s.logs.find((l) => l.id === 1002), logs[1]);
  assert.deepEqual(s.logs.find((l) => l.id === 1003), logs[2]);
  assert.deepEqual(s.logs.find((l) => l.id === 1004), logs[3]);
  assert.deepEqual(s.logs.find((l) => l.id === 1005), logs[4]);
  await call('DELETE', '/api/logs/1003');
  assert.equal((await J(await call('GET', '/api/state'))).logs.length, 4);
});

test('state отдаёт только последние 60 дней, export отдаёт всё', async () => {
  await call('POST', '/api/logs', { id: 2001, hid: 'h1', day: '2020-01-01', time: '10:00', typed: 'старое', hint: false, sim: 1 });
  assert.equal((await J(await call('GET', '/api/state'))).logs.some((l) => l.id === 2001), false);
  assert.equal((await J(await call('GET', '/api/export'))).logs.some((l) => l.id === 2001), true);
});

test('тяги и настройки', async () => {
  await call('POST', '/api/urges', { id: 3001, hid: 'h1', day: today, time: '12:00' });
  await call('PUT', '/api/settings/tz', { value: 'Europe/Moscow' });
  assert.equal((await call('PUT', '/api/settings/evil', { value: 'x' })).status, 400);
  const s = await J(await call('GET', '/api/state'));
  assert.deepEqual(s.urges, [{ id: 3001, hid: 'h1', day: today, time: '12:00' }]);
  assert.equal(s.settings.tz, 'Europe/Moscow');
});

test('экспорт и импорт возвращают данные без потерь', async () => {
  const before = await J(await call('GET', '/api/export'));
  const strip = ({ exported_at, ...r }) => r;
  assert.equal((await call('POST', '/api/import', { app: 'x' })).status, 400);
  await call('DELETE', '/api/habits/h1');
  assert.equal((await J(await call('GET', '/api/state'))).habits.length, 2);
  assert.equal((await call('POST', '/api/import', before)).status, 200);
  const after = await J(await call('GET', '/api/export'));
  const norm = (r) => ({ ...strip(r), logs: [...r.logs].sort((a, b) => a.id - b.id), urges: [...r.urges].sort((a, b) => a.id - b.id), habits: [...r.habits].sort((a, b) => a.id.localeCompare(b.id)) });
  assert.deepEqual(norm(after), norm(before));
});

test('удаление привычки убирает её журнал и тяги', async () => {
  await call('DELETE', '/api/habits/h1');
  const s = await J(await call('GET', '/api/export'));
  assert.equal(s.logs.some((l) => l.hid === 'h1'), false);
  assert.equal(s.urges.length, 0);
});
