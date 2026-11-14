import { sendPush } from './webpush.js';

// Подмена fetch в тестах
export const net = { fetch: (...a) => fetch(...a) };

// Отправляет payload на все подписки, удаляет мёртвые (404/410)
// opts.subs — уже загруженные подписки (cron читает их один раз за запуск, чтобы экономить запросы)
export async function sendToAll(env, payload, opts = {}) {
  const { subs: given, ...sendOpts } = opts;
  const results = given ? [...given] : (await env.DB.prepare('SELECT endpoint,p256dh,auth FROM push_subs').all()).results;
  let sent = 0, failed = 0, removed = 0;
  await Promise.all(results.map(async (sub) => {
    try {
      const r = await sendPush(env, sub, payload, { ...sendOpts, fetchFn: net.fetch });
      if (r.ok) sent++;
      else failed++;
      if (r.gone) {
        await env.DB.prepare('DELETE FROM push_subs WHERE endpoint = ?').bind(sub.endpoint).run();
        removed++;
        if (given) { const i = given.indexOf(sub); if (i >= 0) given.splice(i, 1); }
      }
    } catch {
      failed++; // endpoint и содержимое в лог не пишем
    }
  }));
  return { sent, failed, removed, total: results.length };
}
