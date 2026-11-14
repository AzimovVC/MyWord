import { sendPush } from './webpush.js';

// Подмена fetch в тестах
export const net = { fetch: (...a) => fetch(...a) };

// Отправляет payload на все подписки, удаляет мёртвые (404/410)
export async function sendToAll(env, payload, opts = {}) {
  const { results } = await env.DB.prepare('SELECT endpoint,p256dh,auth FROM push_subs').all();
  let sent = 0, failed = 0, removed = 0;
  await Promise.all(results.map(async (sub) => {
    try {
      const r = await sendPush(env, sub, payload, { ...opts, fetchFn: net.fetch });
      if (r.ok) sent++;
      else failed++;
      if (r.gone) {
        await env.DB.prepare('DELETE FROM push_subs WHERE endpoint = ?').bind(sub.endpoint).run();
        removed++;
      }
    } catch {
      failed++; // endpoint и содержимое в лог не пишем
    }
  }));
  return { sent, failed, removed, total: results.length };
}
