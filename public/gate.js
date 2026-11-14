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
    var s = document.createElement('script');
    s.src = '/app.js';
    document.body.appendChild(s);
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
})();
