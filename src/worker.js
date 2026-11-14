import { handleApi, json } from './api.js';

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
    return handleApi(request, env, url);
  },
};
