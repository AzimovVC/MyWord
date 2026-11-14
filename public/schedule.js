// Общий модуль расписания. Его используют и клиент (подсказки, текущее время
// в выбранном поясе), и сервер (cron-рассылка). Только чистые функции, без DOM и без Worker API.

const pad = (n) => String(n).padStart(2, '0');
export const toMin = (t) => { const p = String(t).split(':'); return (+p[0]) * 60 + (+p[1]); };
export const fmtMin = (m) => { m = ((m % 1440) + 1440) % 1440; return pad(Math.floor(m / 60)) + ':' + pad(m % 60); };

/* ---------- время в часовом поясе ---------- */

const fmtCache = new Map();
function formatter(tz) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    fmtCache.set(tz, f);
  }
  return f;
}

// Настенное время момента ms в поясе tz: {day:'YYYY-MM-DD', min, hm:'HH:MM', y,mo,d,h,mi,s}
export function localParts(ms, tz) {
  let f;
  try { f = formatter(tz || 'UTC'); } catch { f = formatter('UTC'); }
  const o = {};
  for (const p of f.formatToParts(new Date(ms))) if (p.type !== 'literal') o[p.type] = +p.value;
  const h = o.hour === 24 ? 0 : o.hour;
  return {
    day: `${o.year}-${pad(o.month)}-${pad(o.day)}`, min: h * 60 + o.minute, hm: `${pad(h)}:${pad(o.minute)}`,
    y: o.year, mo: o.month, d: o.day, h, mi: o.minute, s: o.second,
  };
}

export function addDays(day, n) {
  const [y, m, d] = day.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/* ---------- расписание «Устоять» (раздел 7.2) ---------- */

// Минуты суток, в которые приходят уведомления. off — ничего, quiet — начало и конец,
// normal — начало, каждые 3 ч до конца, конец; dense — каждый час, конец включительно.
export function avoidTimes(start, end, notify) {
  const a = toMin(start || '00:00'), b = toMin(end || '00:00');
  if (b <= a || notify === 'off') return [];
  const step = notify === 'dense' ? 60 : notify === 'normal' ? 180 : 0;
  const t = [a];
  if (step) for (let m = a + step; m < b; m += step) t.push(m);
  t.push(b);
  return t;
}

/* ---------- что слать в конкретную минуту (раздел 7.1) ---------- */

// logs — журнал привычки за этот локальный день (формат клиента: slip/part/minutes/typed)
export function dayState(logs) {
  const slip = logs.some((l) => l.slip);
  const parts = logs.filter((l) => l.part).length;
  const done = !slip && logs.some((l) => !l.slip && !l.part);
  const session = logs.some((l) => !l.slip && !l.part && l.minutes != null);
  return { slip, parts, done, session };
}

// Возвращает { type, last?, progress? } или null.
// habit — объект привычки (формат клиента), hm — 'HH:MM' локального времени,
// logs — записи этой привычки за этот локальный день.
export function dueFor(habit, hm, logs) {
  const st = dayState(logs);
  const m = toMin(hm);
  if (habit.kind === 'avoid') {
    if (st.slip || st.done) return null;
    const times = avoidTimes(habit.start, habit.end, habit.notify || 'normal');
    if (!times.includes(m)) return null;
    return { type: 'avoid', last: m === toMin(habit.end) };
  }
  if (!habit.remind || toMin(habit.remind) !== m) return null;
  if (habit.kind === 'do') return st.done ? null : { type: 'remind' };
  if (habit.kind === 'count') return st.done ? null : { type: 'remind', progress: { done: st.parts, goal: habit.goal || 0 } };
  if (habit.kind === 'timer') return st.session ? null : { type: 'remind' };
  return null;
}

/* ---------- серия ---------- */

export function plural(n, f) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return f[2];
  if (b > 1 && b < 5) return f[1];
  if (b === 1) return f[0];
  return f[2];
}

// Повторяет правила клиента (streak, hasLog): день засчитан, если есть запись, которая
// не срыв и не порция, и нет срыва. Срыв сегодня обнуляет серию. logs — вся история привычки.
export function streakFor(habit, logs, today, nowMinutes) {
  const has = (day) => {
    const l = logs.filter((x) => x.day === day);
    return l.some((x) => !x.slip && !x.part) && !l.some((x) => x.slip);
  };
  if (logs.some((l) => l.day === today && l.slip)) return 0;
  if (habit.kind !== 'timer' && habit.kind !== 'avoid' && !has(today) && nowMinutes > toMin(habit.end)) return 0;
  let n = 0, d = today;
  if (!has(d)) d = addDays(d, -1);
  while (has(d)) { n++; d = addDays(d, -1); }
  return n;
}

/* ---------- тексты уведомлений (раздел 7.3) ---------- */

export const PLACEHOLDERS = ['{название}', '{зачем}', '{держусь}', '{осталось}', '{серия}', '{прогресс}'];
export const MAX_TEXTS = 5;

export function fmtDur(min) {
  const h = Math.floor(min / 60), m = min % 60;
  return h > 0 ? `${h} ч ${m} мин` : `${m} мин`;
}

// Стандартные формулировки, если своих нет. Для «Устоять» взяты из гайда, для остальных видов
// сделаны по тому же образцу.
export function defaultTemplates(kind) {
  if (kind === 'avoid') return ['{название}: держишься уже {держусь}. {зачем}', 'До конца {осталось}. Тянет, открой «Тянет»'];
  if (kind === 'count') return ['{название}: {прогресс}. Осталось {осталось}.', '{название}: ещё есть время, {прогресс}. {зачем}'];
  if (kind === 'timer') return ['{название}: пора присесть. {зачем}', '{название}: окно открыто ещё {осталось}.'];
  return ['{название}: окно открыто ещё {осталось}. {зачем}', 'Пора: {название}.'];
}

export function templatesOf(habit) {
  const own = (habit.notifyTexts || []).map((t) => String(t).trim()).filter(Boolean);
  return own.length ? own : defaultTemplates(habit.kind);
}

// Значения подстановок. minutes — локальное время в минутах, streak — число дней.
export function buildVars(habit, minutes, { streak = 0, parts = 0 } = {}) {
  const held = Math.max(0, minutes - toMin(habit.start));
  const left = Math.max(0, toMin(habit.end) - minutes);
  return {
    'название': habit.name || '',
    'зачем': habit.why || '',
    'держусь': fmtDur(held),
    'осталось': fmtDur(left),
    'серия': `${streak} ${plural(streak, ['день', 'дня', 'дней'])}`,
    'прогресс': habit.kind === 'count' ? `${parts} из ${habit.goal || 0}` : '',
  };
}

export function fillText(tpl, vars) {
  return String(tpl)
    .replace(/\{([^{}]+)\}/g, (m, k) => (k in vars ? vars[k] : m))
    .replace(/\s+([.,!?:;])/g, '$1').replace(/\s{2,}/g, ' ').trim();
}

// Следующая формулировка по кругу: одна и та же не идёт два раза подряд (если их больше одной)
export function nextIndex(count, last) {
  if (count <= 1) return 0;
  return Number.isInteger(last) && last >= 0 ? (last + 1) % count : 0;
}

export const needsStreak = (tpl) => tpl.includes('{серия}');

// Готовое уведомление. Для последнего уведомления «Устоять» текст фиксированный.
export function buildPayload(habit, due, hm, { streak = 0, lastIdx = null } = {}) {
  const p = { title: habit.name, habitId: habit.id, url: `/?habit=${encodeURIComponent(habit.id)}`, tag: habit.id };
  const m = toMin(hm);
  if (habit.kind === 'avoid' && due.last) {
    p.body = 'Период закончился. Подтверди фразой.';
    return { payload: p, idx: lastIdx };
  }
  const tpls = templatesOf(habit);
  const idx = nextIndex(tpls.length, lastIdx);
  p.body = fillText(tpls[idx], buildVars(habit, m, { streak, parts: due.progress ? due.progress.done : 0 }));
  if (habit.kind === 'avoid') p.actions = [{ action: 'urge', title: 'Тянет' }];
  return { payload: p, idx };
}
