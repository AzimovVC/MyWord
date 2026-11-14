// Преобразование строк D1 <-> объекты клиента (формат прототипа).

const KINDS = ['do', 'avoid', 'timer', 'count'];
const NOTIFY = ['off', 'quiet', 'normal', 'dense'];
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const parseJson = (s, d) => { try { const v = JSON.parse(s); return Array.isArray(v) ? v : d; } catch { return d; } };

export function habitFromRow(r) {
  const h = {
    id: r.id, kind: r.kind, name: r.name, start: r.start, end: r.end,
    remind: r.remind || '', phrases: parseJson(r.phrases, []),
    why: r.why || '', rule: r.rule || '', mode: r.mode || 'memory', strict: r.strict ?? 0.85,
  };
  if (r.kind === 'avoid') h.notify = r.notify || 'normal';
  const nt = parseJson(r.notify_texts, []);
  if (nt.length) h.notifyTexts = nt;
  if (r.kind === 'timer') h.dur = r.dur;
  if (r.kind === 'count') { h.goal = r.goal; h.unit = r.unit || 'раз'; }
  return h;
}

const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');

// Проверяет объект привычки от клиента, возвращает значения для INSERT или бросает Error
export function habitToParams(h, id, now) {
  if (!h || typeof h !== 'object') throw new Error('bad habit');
  if (!KINDS.includes(h.kind)) throw new Error('bad kind');
  const name = str(h.name, 120).trim();
  if (!name) throw new Error('bad name');
  if (!HHMM.test(h.start) || !HHMM.test(h.end)) throw new Error('bad window');
  if (h.remind && !HHMM.test(h.remind)) throw new Error('bad remind');
  const phrases = (Array.isArray(h.phrases) ? h.phrases : []).map((p) => str(p, 300)).filter(Boolean).slice(0, 3);
  const texts = (Array.isArray(h.notifyTexts) ? h.notifyTexts : []).map((p) => str(p, 300)).filter(Boolean).slice(0, 5);
  const notify = NOTIFY.includes(h.notify) ? h.notify : 'normal';
  const int = (v) => (Number.isFinite(+v) && v !== null && v !== '' ? Math.round(+v) : null);
  const strict = Number.isFinite(+h.strict) ? Math.min(1, Math.max(0.5, +h.strict)) : 0.85;
  return [
    id, h.kind, name, h.start, h.end, h.remind || null, notify, JSON.stringify(texts),
    h.kind === 'timer' ? int(h.dur) : null, h.kind === 'count' ? int(h.goal) : null,
    h.kind === 'count' ? str(h.unit, 30) || 'раз' : null,
    JSON.stringify(phrases), str(h.why, 500), str(h.rule, 500),
    h.mode === 'exact' ? 'exact' : 'memory', strict, 0, now,
  ];
}

export const HABIT_SQL =
  'INSERT OR REPLACE INTO habits (id,kind,name,start,end,remind,notify,notify_texts,dur,goal,unit,phrases,why,rule,mode,strict,archived,updated_at) ' +
  'VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)';

export function logFromRow(r) {
  const l = { id: r.id, hid: r.habit_id, day: r.day, time: r.time };
  if (r.type === 'slip') l.slip = true;
  else if (r.type === 'part') l.part = true;
  else {
    l.typed = r.typed ?? '';
    if (r.type === 'timer') l.minutes = r.minutes;
    else { l.hint = !!r.hint; l.sim = r.sim ?? 0; if (r.count != null) l.count = r.count; }
  }
  return l;
}

// Клиентский формат -> параметры INSERT; id задаёт клиент (идемпотентность)
export function logToParams(l, id) {
  if (!l || typeof l !== 'object') throw new Error('bad log');
  const hid = str(l.hid ?? l.habit_id, 40);
  if (!hid || !DAY.test(l.day) || !HHMM.test(l.time)) throw new Error('bad log');
  const type = l.slip ? 'slip' : l.part ? 'part' : l.minutes != null ? 'timer' : 'confirm';
  const num = (v) => (Number.isFinite(+v) && v != null ? +v : null);
  return [
    id, hid, l.day, l.time, type, type === 'slip' || type === 'part' ? null : str(l.typed, 400),
    l.hint ? 1 : 0, num(l.sim), type === 'timer' ? Math.round(num(l.minutes) ?? 0) : null, num(l.count),
  ];
}
export const LOG_SQL = 'INSERT OR IGNORE INTO logs (id,habit_id,day,time,type,typed,hint,sim,minutes,count) VALUES (?,?,?,?,?,?,?,?,?,?)';

export function urgeFromRow(r) { return { id: r.id, hid: r.habit_id, day: r.day, time: r.time }; }
export function urgeToParams(u, id) {
  const hid = str(u?.hid ?? u?.habit_id, 40);
  if (!hid || !DAY.test(u.day) || !HHMM.test(u.time)) throw new Error('bad urge');
  return [id, hid, u.day, u.time];
}
export const URGE_SQL = 'INSERT OR IGNORE INTO urges (id,habit_id,day,time) VALUES (?,?,?,?)';

export const SETTING_KEYS = ['tz', 'sky'];
