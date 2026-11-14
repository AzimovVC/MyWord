/* Вход по секрету APP_TOKEN. Токен вводится один раз и хранится в localStorage.
   Пока токен не подтверждён сервером, app.js не загружается. */
(function () {
  if ('serviceWorker' in navigator) window.addEventListener('load', function () { navigator.serviceWorker.register('/sw.js').catch(function () {}); });
  var KEY = 'slovo-token';
  function get() { try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; } }
  function set(t) { try { localStorage.setItem(KEY, t); } catch (e) {} }
  window.slovoToken = get;
  window.slovoLogout = function () { try { localStorage.removeItem(KEY); } catch (e) {} location.reload(); };

  function start() {
    // Общий модуль расписания (ES-модуль): им пользуются и клиент, и сервер
    import('/schedule.js').then(function (mod) {
      window.Schedule = mod;
      var st = document.createElement('script');
      st.src = '/store.js';
      st.onload = function () {
        window.Store.init().then(function () {
          var s = document.createElement('script');
          s.src = '/app.js';
          document.body.appendChild(s);
        });
      };
      document.body.appendChild(st);
    });
  }

  // true — токен принят, false — отклонён, null — сети нет (не знаем)
  function check(t) {
    return fetch('/api/ping', { headers: { Authorization: 'Bearer ' + t }, cache: 'no-store' })
      .then(function (r) { return r.status === 401 ? false : r.ok ? true : null; })
      .catch(function () { return null; });
  }

  function form(msg) {
    var app = document.getElementById('app');
    document.getElementById('top').innerHTML = '';
    app.innerHTML =
      '<h1>Слово дано</h1>' +
      '<p class="mute" style="margin:8px 0 16px">Введи секрет доступа. Он нужен один раз на этом устройстве.</p>' +
      '<form id="gf"><input id="gt" type="password" autocomplete="current-password" autofocus ' +
      'style="width:100%;font:inherit;padding:12px 14px;border:1px solid var(--line);border-radius:12px;background:var(--card);color:var(--ink)" aria-label="Секрет доступа">' +
      '<p id="ge" class="mute" style="min-height:22px;margin:8px 0;color:var(--warn)">' + (msg || '') + '</p>' +
      '<button class="btn2" type="submit">Войти</button></form>';
    document.getElementById('gf').addEventListener('submit', function (e) {
      e.preventDefault();
      var t = document.getElementById('gt').value.trim();
      if (!t) return;
      check(t).then(function (ok) {
        if (ok === true) { set(t); location.reload(); }
        else document.getElementById('ge').textContent = ok === false ? 'Не подходит.' : 'Нет связи, попробуй позже.';
      });
    });
  }

  var t = get();
  if (!t) return form();
  // Офлайн открываем сразу: токен уже был принят раньше
  check(t).then(function (ok) {
    if (ok === false) { try { localStorage.removeItem(KEY); } catch (e) {} form('Токен больше не подходит.'); }
    else start();
  });

  /* ---------- автообновление ----------
     Сервер при деплое пишет public/version.json (хеш файлов). Приложение запоминает версию,
     с которой загрузилось, и проверяет её при возврате в приложение, появлении сети и раз в
     10 минут. Если версия новая, ждёт, пока пользователь ничего не делает, и перезагружается. */
  var loadedVer = null, pending = false;
  function getVer() {
    return fetch('/version.json', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { return j && j.v ? j.v : null; })
      .catch(function () { return null; });
  }
  function applyUpdate() {
    if (!pending) return;
    if (window.slovoIdle && !window.slovoIdle()) { setTimeout(applyUpdate, 20000); return; }
    var go = function () { location.reload(); };
    if (navigator.serviceWorker) navigator.serviceWorker.getRegistration().then(function (r) { return r && r.update(); }).then(go, go);
    else go();
  }
  function checkUpdate() {
    if (pending) return;
    getVer().then(function (v) {
      if (!v) return;
      if (!loadedVer) { loadedVer = v; return; }
      if (v !== loadedVer) { pending = true; applyUpdate(); }
    });
  }
  getVer().then(function (v) { if (!loadedVer) loadedVer = v; });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) checkUpdate(); });
  window.addEventListener('online', checkUpdate);
  window.addEventListener('pageshow', function (e) { if (e.persisted) checkUpdate(); });
  setInterval(checkUpdate, 10 * 60 * 1000);
})();
