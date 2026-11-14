import { localParts, dueFor, defaultPayload } from '../public/schedule.js';
import { habitFromRow, logFromRow } from './shape.js';
import { sendToAll } from './push.js';

// Cron может прийти с опозданием или пропустить минуту. Поэтому смотрим не только
// текущую минуту, но и несколько предыдущих. Повтор исключает таблица sent.
export const CATCH_UP_MIN = 5;
const KEEP_SENT_MS = 3 * 86400000;

export async function runSchedule(env, nowMs = Date.now()) {
  const db = env.DB;
  const report = { sent: [], skipped: null };

  const subs = await db.prepare('SELECT COUNT(*) c FROM push_subs').first();
  if (!subs.c) { report.skipped = 'no_subscriptions'; return report; }
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
      await sendToAll(env, defaultPayload(h, due, m.hm), { ttl: 600, urgency: due.last ? 'high' : 'normal' });
      report.sent.push(key);
    }
  }

  await db.prepare('DELETE FROM sent WHERE at < ?').bind(nowMs - KEEP_SENT_MS).run();
  return report;
}
