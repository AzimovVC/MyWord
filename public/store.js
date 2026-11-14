/* Хранилище: данные приходят из /api/state, локальный кеш, запись оптимистичная,
   изменения идут в очередь и повторяются при появлении сети. */
(function () {
  var CK = 'slovo-cache', QK = 'slovo-queue';
  var DEMO = /[?&]demo=1/.test(location.search);
  var Store = window.Store = { demo: DEMO, state: null, onSync: null, getState: null, online: true };

  function lsGet(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  var EMPTY = function () { return { habits: [], logs: [], urges: [], settings: {} }; };

  function api(method, path, body) {
    return fetch(path, {
      method: method, cache: 'no-store',
      headers: { Authorization: 'Bearer ' + window.slovoToken(), 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  }
  Store.api = api;

  /* ---- очередь ---- */
  var queue = lsGet(QK) || [];
  var flushing = null;
  function persistQ() { lsSet(QK, queue); }

  // 'ok' — очередь пуста; 'wait' — сети нет или сервер недоступен; 'auth' — токен отклонён
  function flush() {
    if (DEMO) return Promise.resolve('ok');
    if (flushing) return flushing;
    flushing = (function step() {
      if (!queue.length) return Promise.resolve('ok');
      var r = queue[0];
      return api(r.m, r.u, r.b).then(function (res) {
        if (res.status === 401) return 'auth';
        if (res.status >= 500) return 'wait';
        if (res.status >= 400) { try { console.warn('queue: отклонено', r.m, r.u, res.status); } catch (e) {} }
        queue.shift(); persistQ();
        return step();
      }, function () { return 'wait'; });
    })().then(function (s) { flushing = null; Store.online = s !== 'wait'; if (s === 'auth' && window.slovoLogout) window.slovoLogout(); return s; });
    return flushing;
  }
  function enqueue(m, u, b) {
    if (DEMO) return;
    queue.push({ m: m, u: u, b: b }); persistQ();
    writeCache();
    flush();
  }

  /* ---- кеш ---- */
  function writeCache() {
    if (DEMO || !Store.getState) return;
    lsSet(CK, Store.getState());
  }
  Store.cache = writeCache;

  /* ---- чтение ---- */
  function refresh() {
    if (DEMO) return Promise.resolve(false);
    return flush().then(function (s) {
      if (s !== 'ok' || queue.length) return false;
      return api('GET', '/api/state').then(function (r) {
        if (!r.ok) return false;
        return r.json().then(function (st) {
          Store.state = { habits: st.habits, logs: st.logs, urges: st.urges, settings: st.settings || {} };
          lsSet(CK, Store.state);
          Store.online = true;
          if (Store.onSync) Store.onSync(Store.state);
          return true;
        });
      }).catch(function () { Store.online = false; return false; });
    });
  }
  Store.refresh = refresh;

  Store.init = function () {
    if (DEMO) return Promise.resolve();
    var c = lsGet(CK);
    if (c && c.habits) { Store.state = c; refresh(); return Promise.resolve(); }
    return refresh().then(function () { if (!Store.state) Store.state = EMPTY(); });
  };

  /* ---- запись ---- */
  var seq = 0;
  Store.newId = function () { return Date.now() * 1000 + ((seq++ + Math.floor(Math.random() * 1000)) % 1000); };
  Store.putHabit = function (h) { enqueue('PUT', '/api/habits/' + encodeURIComponent(h.id), h); };
  Store.delHabit = function (id) { enqueue('DELETE', '/api/habits/' + encodeURIComponent(id)); };
  Store.addLog = function (l) { enqueue('POST', '/api/logs', l); };
  Store.delLog = function (id) { enqueue('DELETE', '/api/logs/' + id); };
  Store.addUrge = function (u) { enqueue('POST', '/api/urges', u); };
  Store.setSetting = function (k, v) { enqueue('PUT', '/api/settings/' + k, { value: String(v) }); };

  /* ---- резервная копия ---- */
  Store.exportJson = function () {
    return flush().then(function () { return api('GET', '/api/export'); }).then(function (r) {
      if (!r.ok) throw new Error('export'); return r.text();
    });
  };
  Store.importJson = function (text) {
    var data; try { data = JSON.parse(text); } catch (e) { return Promise.reject(new Error('Это не JSON.')); }
    return flush().then(function () {
      return api('POST', '/api/import', data);
    }).then(function (r) {
      if (!r.ok) throw new Error(r.status === 400 ? 'Файл не похож на копию «Слово дано».' : 'Не удалось импортировать.');
      return refresh();
    });
  };

  /* ---- перенос из прототипа (localStorage) ---- */
  var LEGACY = 'slovo-dano-v8', LEGACY_DONE = 'slovo-legacy-done';
  Store.legacyHabits = function () {
    try {
      if (localStorage.getItem(LEGACY_DONE)) return [];
      var o = JSON.parse(localStorage.getItem(LEGACY));
      return o && o.habits && o.habits.length ? o.habits : [];
    } catch (e) { return []; }
  };
  Store.markLegacyDone = function () { try { localStorage.setItem(LEGACY_DONE, '1'); } catch (e) {} };

  window.addEventListener('online', function () { refresh(); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) refresh(); });
  setInterval(function () { if (queue.length) flush(); }, 30000);
})();
