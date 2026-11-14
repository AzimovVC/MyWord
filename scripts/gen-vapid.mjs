// Генерация пары VAPID без внешних пакетов:  node scripts/gen-vapid.mjs
import { generateVapidKeys } from '../src/webpush.js';

const k = await generateVapidKeys();
console.log(`
Публичный ключ  (VAPID_PUBLIC_KEY):
${k.publicKey}

Приватный ключ  (VAPID_PRIVATE_KEY), никому не показывай и не коммить:
${k.privateKey}

Положи в Cloudflare как секреты:
  npx wrangler secret put VAPID_PUBLIC_KEY
  npx wrangler secret put VAPID_PRIVATE_KEY
  npx wrangler secret put VAPID_SUBJECT      # mailto:твой-адрес
`);
