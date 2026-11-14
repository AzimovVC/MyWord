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

/* ---------- тексты (заготовка под шаг 5) ---------- */

export function fmtDur(min) {
  const h = Math.floor(min / 60), m = min % 60;
  return h > 0 ? `${h} ч ${m} мин` : `${m} мин`;
}

export function defaultPayload(habit, due, hm) {
  const p = { title: habit.name, habitId: habit.id, url: `/?habit=${encodeURIComponent(habit.id)}`, tag: habit.id };
  if (habit.kind === 'avoid') {
    const held = fmtDur(Math.max(0, toMin(hm) - toMin(habit.start)));
    const left = fmtDur(Math.max(0, toMin(habit.end) - toMin(hm)));
    if (due.last) { p.body = 'Период закончился. Подтверди фразой.'; }
    else { p.body = `Держишься уже ${held}. До конца ${left}.`; p.actions = [{ action: 'urge', title: 'Тянет' }]; }
  } else if (habit.kind === 'count') {
    p.body = `${due.progress.done} из ${due.progress.goal}. Время ещё есть.`;
  } else if (habit.kind === 'timer') {
    p.body = 'Время для сессии.';
  } else {
    p.body = `Окно открыто до ${habit.end}.`;
  }
  return p;
}
