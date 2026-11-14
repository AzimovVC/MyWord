/* Service worker: офлайн-оболочка. API и данные сюда не попадают. */
var VERSION = 'v4';
var SHELL = 'slovo-shell-' + VERSION;
var FONTS = 'slovo-fonts';
var FILES = ['/', '/index.html', '/app.css', '/gate.js', '/store.js', '/app.js', '/manifest.webmanifest',
  '/icons/icon-192.png', '/icons/icon-512.png', '/icons/apple-touch-icon.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(SHELL).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== SHELL && k !== FONTS; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;
  if (url.origin === location.origin && url.pathname.indexOf('/api/') === 0) return;

  // Шрифты Google: сначала кеш, обновляем в фоне
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(FONTS).then(function (c) {
      return c.match(req).then(function (hit) {
        var net = fetch(req).then(function (r) { if (r && (r.ok || r.type === 'opaque')) c.put(req, r.clone()); return r; }).catch(function () { return hit; });
        return hit || net;
      });
    }));
    return;
  }
  if (url.origin !== location.origin) return;

  // Страницы: сеть, при её отсутствии оболочка из кеша
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(function (r) {
      var copy = r.clone();
      caches.open(SHELL).then(function (c) { c.put('/', copy); });
      return r;
    }).catch(function () { return caches.match('/'); }));
    return;
  }
  // Остальная статика: кеш, обновление в фоне
  e.respondWith(caches.open(SHELL).then(function (c) {
    return c.match(req).then(function (hit) {
      var net = fetch(req).then(function (r) { if (r.ok) c.put(req, r.clone()); return r; }).catch(function () { return hit; });
      return hit || net;
    });
  }));
});

/* ---------- Push ---------- */
self.addEventListener('push', function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: e.data ? e.data.text() : '' }; }
  var opts = {
    body: d.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    lang: 'ru',
    data: { url: d.url || '/', habitId: d.habitId || null },
    actions: Array.isArray(d.actions) ? d.actions.slice(0, 2) : []
  };
  if (d.tag) { opts.tag = d.tag; opts.renotify = true; }
  e.waitUntil(self.registration.showNotification(d.title || 'Слово дано', opts));
});

self.addEventListener('notificationclick', function (e) {
  var n = e.notification, data = n.data || {};
  var url = data.url || '/';
  // действие «Тянет» ведёт на экран тяги этой привычки
  if (e.action === 'urge' && data.habitId) url = '/?urge=' + encodeURIComponent(data.habitId);
  n.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (new URL(c.url).origin === self.location.origin && 'focus' in c) {
        c.postMessage({ type: 'open', url: url });
        return c.focus();
      }
    }
    return self.clients.openWindow(url);
  }));
});
