import {
  habitFromRow, habitToParams, HABIT_SQL, logFromRow, logToParams, LOG_SQL,
  urgeFromRow, urgeToParams, URGE_SQL, SETTING_KEYS,
} from './shape.js';

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}
const bad = (m = 'bad_request') => json({ error: m }, 400);
const pad = (n) => String(n).padStart(2, '0');
const dayKey = (ms) => { const d = new Date(ms); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
const newId = () => Date.now() * 1000 + Math.floor(Math.random() * 1000);
const BATCH = 50;

async function runBatch(db, stmts) {
  for (let i = 0; i < stmts.length; i += BATCH) await db.batch(stmts.slice(i, i + BATCH));
}

async function settingsMap(db) {
  const { results } = await db.prepare('SELECT key,value FROM settings').all();
  const o = {};
  for (const r of results) o[r.key] = r.value;
  return o;
}

async function snapshot(db, sinceDay) {
  const lw = sinceDay ? ' WHERE day >= ?' : '';
  const args = sinceDay ? [sinceDay] : [];
  const [h, l, u, s] = await Promise.all([
    db.prepare('SELECT * FROM habits WHERE archived = 0').all(),
    db.prepare('SELECT * FROM logs' + lw + ' ORDER BY id DESC').bind(...args).all(),
    db.prepare('SELECT * FROM urges' + lw + ' ORDER BY id DESC').bind(...args).all(),
    settingsMap(db),
  ]);
  return {
    habits: h.results.map(habitFromRow),
    logs: l.results.map(logFromRow),
    urges: u.results.map(urgeFromRow),
    settings: s,
  };
}

export async function handleApi(request, env, url, ctx = {}) {
  const db = env.DB;
  const m = request.method;
  const path = url.pathname;
  const body = async () => { try { return await request.json(); } catch { return null; } };
  let mt;

  try {
    if (path === '/api/ping') return json({ ok: true });

    if (path === '/api/state' && m === 'GET') {
      const since = dayKey(Date.now() - 62 * 86400000); // с запасом на часовые пояса
      return json({ ...(await snapshot(db, since)), now: Date.now() });
    }

    if ((mt = path.match(/^\/api\/habits\/([\w-]{1,40})$/))) {
      const id = mt[1];
      if (m === 'PUT') {
        const b = await body();
        await db.prepare(HABIT_SQL).bind(...habitToParams(b, id, Date.now())).run();
        return json({ ok: true });
      }
      if (m === 'DELETE') {
        await db.batch([
          db.prepare('DELETE FROM habits WHERE id = ?').bind(id),
          db.prepare('DELETE FROM logs WHERE habit_id = ?').bind(id),
          db.prepare('DELETE FROM urges WHERE habit_id = ?').bind(id),
          db.prepare('DELETE FROM timers WHERE habit_id = ?').bind(id),
        ]);
        return json({ ok: true });
      }
    }

    if (path === '/api/logs' && m === 'POST') {
      const b = await body();
      const id = Number.isSafeInteger(b?.id) && b.id > 0 ? b.id : newId();
      await db.prepare(LOG_SQL).bind(...logToParams(b, id)).run();
      return json({ ok: true, id });
    }
    if ((mt = path.match(/^\/api\/logs\/(\d{1,16})$/)) && m === 'DELETE') {
      await db.prepare('DELETE FROM logs WHERE id = ?').bind(+mt[1]).run();
      return json({ ok: true });
    }

    if (path === '/api/urges' && m === 'POST') {
      const b = await body();
      const id = Number.isSafeInteger(b?.id) && b.id > 0 ? b.id : newId();
      await db.prepare(URGE_SQL).bind(...urgeToParams(b, id)).run();
      return json({ ok: true, id });
    }

    if ((mt = path.match(/^\/api\/settings\/(\w+)$/)) && m === 'PUT') {
      if (!SETTING_KEYS.includes(mt[1])) return bad('bad_key');
      const b = await body();
      const v = typeof b?.value === 'string' ? b.value.slice(0, 100) : '';
      await db.prepare('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)').bind(mt[1], v).run();
      return json({ ok: true });
    }

    if (path === '/api/export' && m === 'GET') {
      return json({ app: 'slovo-dano', version: 1, exported_at: new Date().toISOString(), ...(await snapshot(db)) });
    }

    if (path === '/api/import' && m === 'POST') {
      const b = await body();
      if (!b || b.app !== 'slovo-dano' || !Array.isArray(b.habits)) return bad('bad_backup');
      // Сначала проверяем всё, потом заменяем данные одной цепочкой
      const hs = b.habits.map((h) => habitToParams(h, String(h.id || '').slice(0, 40), Date.now()));
      if (hs.some((p) => !/^[\w-]{1,40}$/.test(p[0]))) return bad('bad_id');
      const ls = (b.logs || []).map((l, i) => logToParams(l, Number.isSafeInteger(l.id) && l.id > 0 ? l.id : newId() + i));
      const us = (b.urges || []).map((u, i) => urgeToParams(u, Number.isSafeInteger(u.id) && u.id > 0 ? u.id : newId() + i));
      await db.batch([
        db.prepare('DELETE FROM habits'), db.prepare('DELETE FROM logs'),
        db.prepare('DELETE FROM urges'), db.prepare('DELETE FROM timers'),
      ]);
      await runBatch(db, hs.map((p) => db.prepare(HABIT_SQL).bind(...p)));
      await runBatch(db, ls.map((p) => db.prepare(LOG_SQL).bind(...p)));
      await runBatch(db, us.map((p) => db.prepare(URGE_SQL).bind(...p)));
      for (const k of SETTING_KEYS) {
        const v = b.settings?.[k];
        if (typeof v === 'string') await db.prepare('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)').bind(k, v.slice(0, 100)).run();
      }
      return json({ ok: true, habits: hs.length, logs: ls.length, urges: us.length });
    }
  } catch (e) {
    // Содержимое запроса (фразы, «зачем», срывы) в лог не пишем
    if (/^bad /.test(e.message)) return bad(e.message.replace(' ', '_'));
    console.error('api error', path, e.name);
    return json({ error: 'server_error' }, 500);
  }
  return json({ error: 'not_found' }, 404);
}
