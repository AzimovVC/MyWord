import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import crypto from 'node:crypto';
import ece from 'http_ece';
import { getPlatformProxy } from 'wrangler';
import { runSchedule } from '../src/cron.js';
import { net } from '../src/push.js';
import { generateVapidKeys, b64u } from '../src/webpush.js';

let proxy, env, dir, hits, bodies;
before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'slovo-cron-'));
  proxy = await getPlatformProxy({ persist: { path: dir } });
  const k = await generateVapidKeys();
  env = { ...proxy.env, VAPID_PUBLIC_KEY: k.publicKey, VAPID_PRIVATE_KEY: k.privateKey, VAPID_SUBJECT: 'mailto:a@b.c' };
  const sql = readFileSync(new URL('../migrations/0001_init.sql', import.meta.url), 'utf8').replace(/--.*$/gm, '');
  for (const st of sql.split(';').map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean)) await env.DB.exec(st + ';');
});
after(async () => { net.fetch = fetch; await proxy.dispose(); rmSync(dir, { recursive: true, force: true }); });

const e = crypto.createECDH('prime256v1'); e.generateKeys();
const AUTH = crypto.randomBytes(16);
const SUB = { endpoint: 'https://push.example/s/1', p256dh: b64u.enc(e.getPublicKey()), auth: b64u.enc(AUTH) };
let status;

beforeEach(async () => {
  for (const t of ['habits', 'logs', 'urges', 'sent', 'push_subs', 'settings']) await env.DB.exec(`DELETE FROM ${t};`);
  await env.DB.prepare('INSERT INTO push_subs (endpoint,p256dh,auth,created_at) VALUES (?,?,?,0)').bind(SUB.endpoint, SUB.p256dh, SUB.auth).run();
  await env.DB.prepare("INSERT INTO settings (key,value) VALUES ('tz','UTC')").run();
  hits = []; bodies = []; status = 201;
  net.fetch = async (url, init) => {
    hits.push(url);
    bodies.push(JSON.parse(ece.decrypt(Buffer.from(init.body), { version: 'aes128gcm', privateKey: e, authSecret: AUTH }).toString()));
    return new Response('', { status });
  };
});

const addHabit = (h) => env.DB.prepare(
  'INSERT INTO habits (id,kind,name,start,end,remind,notify,notify_texts,phrases,dur,goal,unit,why) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
).bind(h.id, h.kind, h.name, h.start, h.end, h.remind ?? null, h.notify ?? 'normal', JSON.stringify(h.texts ?? []), '["Я делаю это."]', h.dur ?? null, h.goal ?? null, h.unit ?? null, h.why ?? '').run();
const addLog = (hid, day, type, time = '10:00') => env.DB.prepare('INSERT INTO logs (habit_id,day,time,type,typed,hint,sim) VALUES (?,?,?,?,?,0,1)').bind(hid, day, time, type, type === 'slip' || type === 'part' ? null : 'x').run();
const setTz = (tz) => env.DB.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ('tz',?)").bind(tz).run();
const at = (iso) => Date.parse(iso + 'Z');
const sentKeys = async () => (await env.DB.prepare('SELECT key FROM sent ORDER BY key').all()).results.map((r) => r.key);

const AVOID = { id: 'h4', kind: 'avoid', name: 'Без ленты', start: '08:00', end: '20:00', notify: 'normal' };

// Прогон целого дня минута за минутой, как это делал бы cron
// Шаг 4 минуты: заодно проверяет наверстывание (окно 5 минут), и сутки идут быстрее
async function runDay(day, tz = 'UTC', hook) {
  const start = Date.parse(day + 'T00:00:00Z');
  const all = [];
  for (let m = 0; m < 1440; m += 4) {
    if (hook) await hook(m);
    const r = await runSchedule(env, start + m * 60000);
    all.push(...r.sent);
  }
  return all;
}

test('приёмка: «Устоять» 08–20, «Обычно» шлёт ровно 5 раз: 08, 11, 14, 17, 20', async () => {
  await addHabit(AVOID);
  const sent = await runDay('2026-05-04');
  assert.deepEqual(sent.map((k) => k.split('|')[2]), ['08:00', '11:00', '14:00', '17:00', '20:00']);
  assert.equal(hits.length, 5);
});

test('«Плотно» шлёт 13 раз', async () => {
  await addHabit({ ...AVOID, notify: 'dense' });
  assert.equal((await runDay('2026-05-04')).length, 13);
});

test('дедупликация: повторный запуск в ту же и в соседние минуты не шлёт заново', async () => {
  await addHabit(AVOID);
  const t = at('2026-05-04T11:00:00');
  assert.equal((await runSchedule(env, t)).sent.length, 1);
  assert.equal((await runSchedule(env, t)).sent.length, 0);
  assert.equal((await runSchedule(env, t + 60000)).sent.length, 0);
  assert.equal((await runSchedule(env, t + 3 * 60000)).sent.length, 0);
  assert.equal(hits.length, 1);
  assert.deepEqual(await sentKeys(), ['h4|2026-05-04|11:00|avoid']);
});

test('пропущенная минута cron наверстывается в пределах окна, позже уже нет', async () => {
  await addHabit(AVOID);
  assert.equal((await runSchedule(env, at('2026-05-04T11:03:00'))).sent.length, 1); // 11:00 в окне 5 минут
  await env.DB.exec('DELETE FROM sent;');
  assert.equal((await runSchedule(env, at('2026-05-04T11:07:00'))).sent.length, 0); // слишком поздно
});

test('срыв: уведомления после срыва не приходят', async () => {
  await addHabit(AVOID);
  const sent = await runDay('2026-05-04', 'UTC', async (m) => { if (m === 12 * 60) await addLog('h4', '2026-05-04', 'slip', '12:00'); });
  assert.deepEqual(sent.map((k) => k.split('|')[2]), ['08:00', '11:00']);
});

test('подтверждение: остаток дня не шлёт', async () => {
  await addHabit(AVOID);
  const sent = await runDay('2026-05-04', 'UTC', async (m) => { if (m === 15 * 60) await addLog('h4', '2026-05-04', 'confirm'); });
  assert.deepEqual(sent.map((k) => k.split('|')[2]), ['08:00', '11:00', '14:00']);
});

test('«Сделать»: подтверждено сегодня — не шлём; вчерашнее подтверждение не мешает', async () => {
  await addHabit({ id: 'a', kind: 'do', name: 'Зарядка', start: '07:00', end: '09:00', remind: '07:05' });
  await addLog('a', '2026-05-03', 'confirm');
  assert.equal((await runSchedule(env, at('2026-05-04T07:05:00'))).sent.length, 1);
  await env.DB.exec('DELETE FROM sent;');
  await addLog('a', '2026-05-04', 'confirm');
  assert.equal((await runSchedule(env, at('2026-05-04T07:05:00'))).sent.length, 0);
});

test('«Счёт» и «Таймер»: правила пропуска', async () => {
  await addHabit({ id: 'c', kind: 'count', name: 'Duo', start: '08:00', end: '22:00', remind: '18:00', goal: 3, unit: 'урок' });
  await addHabit({ id: 't', kind: 'timer', name: 'Медитация', start: '07:30', end: '09:00', remind: '07:25', dur: 10 });
  assert.equal((await runSchedule(env, at('2026-05-04T18:00:00'))).sent.length, 1);
  assert.equal((await runSchedule(env, at('2026-05-04T07:25:00'))).sent.length, 1);
  await env.DB.exec('DELETE FROM sent;');
  await addLog('c', '2026-05-04', 'confirm');
  await env.DB.prepare("INSERT INTO logs (habit_id,day,time,type,typed,minutes) VALUES ('t','2026-05-04','07:40','timer','',10)").run();
  assert.equal((await runSchedule(env, at('2026-05-04T18:00:00'))).sent.length, 0);
  assert.equal((await runSchedule(env, at('2026-05-04T07:25:00'))).sent.length, 0);
});

test('переход через полночь: 00:00 уже новый день, ключ с новой датой, наверстывание через границу', async () => {
  await addHabit({ id: 'n', kind: 'do', name: 'Лечь', start: '00:00', end: '01:00', remind: '00:00' });
  await addLog('n', '2026-05-04', 'confirm', '23:30'); // вчерашнее подтверждение
  assert.equal((await runSchedule(env, at('2026-05-04T23:59:00'))).sent.length, 0);
  const r = await runSchedule(env, at('2026-05-05T00:02:00')); // cron проснулся с опозданием через полночь
  assert.deepEqual(r.sent, ['n|2026-05-05|00:00|remind']);
  assert.equal((await runSchedule(env, at('2026-05-05T00:03:00'))).sent.length, 0);
});

test('вечернее напоминание в 23:59 относится к своему дню, а не к следующему', async () => {
  await addHabit({ id: 'l', kind: 'do', name: 'Лечь', start: '23:00', end: '23:59', remind: '23:58' });
  await addLog('l', '2026-05-05', 'confirm', '23:00'); // подтвердили уже в завтрашний день
  const r = await runSchedule(env, at('2026-05-04T23:59:00'));
  assert.deepEqual(r.sent, ['l|2026-05-04|23:58|remind']);
});

test('смена часового пояса переносит расписание', async () => {
  await addHabit({ id: 'a', kind: 'do', name: 'Зарядка', start: '07:00', end: '09:00', remind: '07:05' });
  const instant = at('2026-05-04T04:05:00'); // 07:05 в Москве (+3), 04:05 в UTC
  await setTz('UTC');
  assert.equal((await runSchedule(env, instant)).sent.length, 0);
  await setTz('Europe/Moscow');
  assert.deepEqual((await runSchedule(env, instant)).sent, ['a|2026-05-04|07:05|remind']);
  await env.DB.exec('DELETE FROM sent;');
  await setTz('Asia/Tokyo'); // +9: тот же момент это 13:05
  assert.equal((await runSchedule(env, instant)).sent.length, 0);
});

test('смена пояса на другую дату: день берётся из пояса, а не из UTC', async () => {
  await addHabit({ id: 'a', kind: 'do', name: 'Зарядка', start: '07:00', end: '09:00', remind: '07:05' });
  await setTz('Pacific/Auckland'); // +12/+13: уже следующий день относительно UTC
  const r = await runSchedule(env, at('2026-05-04T19:05:00')); // 07:05 5 мая по Окленду (NZST +12)
  assert.deepEqual(r.sent, ['a|2026-05-05|07:05|remind']);
});

test('мёртвая подписка (410) удаляется', async () => {
  await addHabit(AVOID);
  status = 410;
  await runSchedule(env, at('2026-05-04T11:00:00'));
  assert.equal((await env.DB.prepare('SELECT COUNT(*) c FROM push_subs').first()).c, 0);
});

test('без подписок и без VAPID cron ничего не делает', async () => {
  await addHabit(AVOID);
  await env.DB.exec('DELETE FROM push_subs;');
  assert.equal((await runSchedule(env, at('2026-05-04T11:00:00'))).skipped, 'no_subscriptions');
  assert.equal((await sentKeys()).length, 0);
});

test('старые ключи sent чистятся', async () => {
  await addHabit(AVOID);
  await env.DB.prepare('INSERT INTO sent (key,at) VALUES (?,?)').bind('old', at('2026-04-01T00:00:00')).run();
  await runSchedule(env, at('2026-05-04T11:00:00'));
  assert.equal((await sentKeys()).includes('old'), false);
});

/* ---------- тексты, чередование, таймер ---------- */

test('приёмка: стандартные тексты чередуются, подстановки раскрываются', async () => {
  await addHabit({ ...AVOID, why: 'Чтобы вечера были длинными.' });
  await runDay('2026-05-04');
  const b = bodies.map((x) => x.body);
  assert.equal(b.length, 5);
  assert.equal(b[0], 'Без ленты: держишься уже 0 мин. Чтобы вечера были длинными.');
  assert.equal(b[1], 'До конца 9 ч 0 мин. Тянет, открой «Тянет»');
  assert.equal(b[2], 'Без ленты: держишься уже 6 ч 0 мин. Чтобы вечера были длинными.');
  assert.equal(b[3], 'До конца 3 ч 0 мин. Тянет, открой «Тянет»');
  assert.equal(b[4], 'Период закончился. Подтверди фразой.'); // последнее просит подтвердить
  for (let i = 1; i < 4; i++) assert.notEqual(b[i], b[i - 1]);
  assert.deepEqual(bodies[1].actions, [{ action: 'urge', title: 'Тянет' }]);
  assert.equal(bodies[1].url, '/?habit=h4');
  assert.equal(bodies.every((x) => !/[{}]/.test(x.body)), true);
});

test('свои тексты: подстановки, чередование по кругу, сохранение между запусками', async () => {
  await addHabit({ ...AVOID, notify: 'dense', why: 'зачем', texts: ['A {название}', 'B {держусь}', 'C {осталось}'] });
  await runSchedule(env, at('2026-05-04T09:00:00'));
  await runSchedule(env, at('2026-05-04T10:00:00'));
  await runSchedule(env, at('2026-05-04T11:00:00'));
  await runSchedule(env, at('2026-05-04T12:00:00'));
  assert.deepEqual(bodies.map((x) => x.body), ['A Без ленты', 'B 2 ч 0 мин', 'C 9 ч 0 мин', 'A Без ленты']);
});

test('{серия} и {прогресс} считаются на сервере', async () => {
  await addHabit({ id: 'c', kind: 'count', name: 'Duo', start: '08:00', end: '22:00', remind: '18:00', goal: 3, unit: 'урок', texts: ['{прогресс}, серия {серия}'] });
  for (const d of ['2026-05-01', '2026-05-02', '2026-05-03']) await addLog('c', d, 'confirm');
  await addLog('c', '2026-05-04', 'part'); await addLog('c', '2026-05-04', 'part');
  await runSchedule(env, at('2026-05-04T18:00:00'));
  assert.equal(bodies[0].body, '2 из 3, серия 3 дня');
});

test('служебные ключи ntl:* не попадают в ответ состояния', async () => {
  await addHabit(AVOID);
  await runSchedule(env, at('2026-05-04T11:00:00'));
  assert.equal((await env.DB.prepare("SELECT COUNT(*) c FROM settings WHERE key LIKE 'ntl:%'").first()).c, 1);
});

const addTimer = (id, endsAt) => env.DB.prepare('INSERT OR REPLACE INTO timers (habit_id,ends_at,notified) VALUES (?,?,0)').bind(id, endsAt).run();
const TIMER = { id: 't', kind: 'timer', name: 'Медитация', start: '07:30', end: '09:00', dur: 10 };

test('таймер: push в момент конца, один раз', async () => {
  await addHabit(TIMER);
  const end = at('2026-05-04T07:40:00');
  await addTimer('t', end);
  assert.equal((await runSchedule(env, end - 60000)).sent.length, 0);
  assert.deepEqual((await runSchedule(env, end + 20000)).sent, ['timer|t']);
  assert.equal((await runSchedule(env, end + 80000)).sent.length, 0);
  assert.equal(bodies[0].title, 'Медитация');
  assert.equal(bodies[0].url, '/?habit=t');
});

test('таймер: остановка отменяет push', async () => {
  await addHabit(TIMER);
  const end = at('2026-05-04T07:40:00');
  await addTimer('t', end);
  await env.DB.prepare('DELETE FROM timers WHERE habit_id = ?').bind('t').run(); // как /api/timer/stop
  assert.equal((await runSchedule(env, end + 20000)).sent.length, 0);
});

test('таймер: протухший (cron не работал) не шлём', async () => {
  await addHabit(TIMER);
  const end = at('2026-05-04T07:40:00');
  await addTimer('t', end);
  assert.equal((await runSchedule(env, end + 20 * 60000)).sent.length, 0);
});
