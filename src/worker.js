// Шаг 1: только проверка токена. Данные пока в localStorage на клиенте.
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

async function sha(s) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
}

// Сравнение за постоянное время через хеши одинаковой длины
export async function tokenOk(request, env) {
  if (!env.APP_TOKEN) return false;
  const h = request.headers.get('authorization') || '';
  const given = h.startsWith('Bearer ') ? h.slice(7) : '';
  const [a, b] = await Promise.all([sha(given), sha(env.APP_TOKEN)]);
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    if (!(await tokenOk(request, env))) return json({ error: 'unauthorized' }, 401);
    if (url.pathname === '/api/ping') return json({ ok: true });
    return json({ error: 'not_found' }, 404);
  },
};
