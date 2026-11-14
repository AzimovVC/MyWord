CREATE TABLE habits (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,                 -- do | avoid | timer | count
  name TEXT NOT NULL,
  start TEXT NOT NULL, end TEXT NOT NULL,
  remind TEXT,                        -- для do, timer, count
  notify TEXT DEFAULT 'normal',       -- для avoid: off | quiet | normal | dense
  notify_texts TEXT DEFAULT '[]',     -- JSON, свои тексты уведомлений
  dur INTEGER, goal INTEGER, unit TEXT,
  phrases TEXT NOT NULL DEFAULT '[]', -- JSON, до 3 фраз
  why TEXT, rule TEXT,
  mode TEXT DEFAULT 'memory', strict REAL DEFAULT 0.85,
  archived INTEGER DEFAULT 0, updated_at INTEGER
);

-- id задаёт клиент (время*1000 + случайное), чтобы запись из офлайн-очереди
-- можно было повторять без дублей и отменять до ответа сервера
CREATE TABLE logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  habit_id TEXT NOT NULL, day TEXT NOT NULL, time TEXT NOT NULL,
  type TEXT NOT NULL,                 -- confirm | slip | part | timer
  typed TEXT, hint INTEGER, sim REAL, minutes INTEGER, count INTEGER
);
CREATE INDEX logs_habit_day ON logs (habit_id, day);

CREATE TABLE urges (id INTEGER PRIMARY KEY AUTOINCREMENT, habit_id TEXT, day TEXT, time TEXT);
CREATE INDEX urges_habit_day ON urges (habit_id, day);

CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);      -- tz, sky
CREATE TABLE push_subs (endpoint TEXT PRIMARY KEY, p256dh TEXT, auth TEXT, created_at INTEGER);
CREATE TABLE sent (key TEXT PRIMARY KEY, at INTEGER);          -- дедупликация
CREATE TABLE timers (habit_id TEXT PRIMARY KEY, ends_at INTEGER, notified INTEGER DEFAULT 0);
