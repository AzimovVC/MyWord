import { localParts, dueFor, buildPayload, templatesOf, needsStreak, streakFor, toMin } from '../public/schedule.js';
import { habitFromRow, logFromRow } from './shape.js';
import { sendToAll } from './push.js';

// Cron может прийти с опозданием или пропустить минуту. Поэтому смотрим не только
// текущую минуту, но и несколько предыдущих. Повтор исключает таблица sent.
export const CATCH_UP_MIN = 5;
const KEEP_SENT_MS = 3 * 86400000;
const TIMER_STALE_MS = 15 * 60000; // если cron проспал дольше, о конце сессии уже не напоминаем
const STREAK_DAYS = 62;
const dayAgo = (ms, tz, n) => localParts(ms - n * 86400000, tz).day;

export async function runSchedule(env, nowMs = Date.now()) {
  const db = env.DB;
  const report = { sent: [], skipped: null };

  const subsRes = await db.prepare('SELECT endpoint,p256dh,auth FROM push_subs').all();
  if (!subsRes.results.length) { report.skipped = 'no_subscriptions'; return report; }
  const alive = [...subsRes.results]; // подписки, которые ещё не признаны мёртвыми в этом запуске
  if (!env.VAPID_PRIVATE_KEY || !env.VAPID_PUBLIC_KEY || !env.VAPID_SUBJECT) { report.skipped = 'no_vapid'; return report; }

  const tzRow = await db.prepare("SELECT value FROM settings WHERE key = 'tz'").first();
  const tz = tzRow?.value || 'UTC';

  // Минуты в хронологическом порядке: сначала старые
  const moments = [];
  for (let k = CATCH_UP_MIN - 1; k >= 0; k--) moments.push(localParts(nowMs - k * 60000, tz));
  const days = [...new Set(moments.map((m) => m.day))];

  const [hRes, lRes] = await Promise.all([
    db.prepare('SELECT * FROM habits WHERE archived = 0').all(),
    db.prepare(`SELECT * FROM logs WHERE day IN (${days.map(() => '?').join(',')})`).bind(...days).all(),
  ]);
  const habits = hRes.results.map(habitFromRow);
  const logs = lRes.results.map(logFromRow);

  for (const m of moments) {
    for (const h of habits) {
      const mine = logs.filter((l) => l.hid === h.id && l.day === m.day);
      const due = dueFor(h, m.hm, mine);
      if (!due) continue;
      const key = `${h.id}|${m.day}|${m.hm}|${due.type}`;
      // Сначала фиксируем ключ, потом шлём: повтор невозможен
      const ins = await db.prepare('INSERT OR IGNORE INTO sent (key,at) VALUES (?,?)').bind(key, nowMs).run();
      if (!ins.meta.changes) continue;
      // чередование: номер последней формулировки хранится в settings
      const lastRow = await db.prepare('SELECT value FROM settings WHERE key = ?').bind(`ntl:${h.id}`).first();
      const lastIdx = lastRow ? parseInt(lastRow.value, 10) : null;
      let streak = 0;
      if (!(h.kind === 'avoid' && due.last) && templatesOf(h).some(needsStreak)) {
        const hist = await db.prepare('SELECT * FROM logs WHERE habit_id = ? AND day >= ?').bind(h.id, dayAgo(nowMs, tz, STREAK_DAYS)).all();
        streak = streakFor(h, hist.results.map(logFromRow), m.day, toMin(m.hm));
      }
      const { payload, idx } = buildPayload(h, due, m.hm, { streak, lastIdx });
      if (idx != null && idx !== lastIdx) await db.prepare('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)').bind(`ntl:${h.id}`, String(idx)).run();
      await sendToAll(env, payload, { ttl: 600, urgency: due.last ? 'high' : 'normal', subs: alive });
      report.sent.push(key);
    }
  }

  // Конец таймера: push, если сессия не остановлена (при остановке строка удаляется)
  const due = await db.prepare('SELECT habit_id, ends_at FROM timers WHERE notified = 0 AND ends_at <= ?').bind(nowMs).all();
  for (const t of due.results) {
    const claim = await db.prepare('UPDATE timers SET notified = 1 WHERE habit_id = ? AND notified = 0').bind(t.habit_id).run();
    if (!claim.meta.changes || nowMs - t.ends_at > TIMER_STALE_MS) continue;
    const row = await db.prepare('SELECT * FROM habits WHERE id = ?').bind(t.habit_id).first();
    if (!row) continue;
    const h = habitFromRow(row);
    await sendToAll(env, {
      title: h.name, body: 'Время вышло. Открой приложение, чтобы записать сессию.',
      habitId: h.id, url: `/?habit=${encodeURIComponent(h.id)}`, tag: `timer-${h.id}`,
    }, { ttl: 900, urgency: 'high', subs: alive });
    report.sent.push(`timer|${h.id}`);
  }
  await db.prepare('DELETE FROM timers WHERE ends_at < ?').bind(nowMs - 86400000).run();

  await db.prepare('DELETE FROM sent WHERE at < ?').bind(nowMs - KEEP_SENT_MS).run();
  return report;
}
