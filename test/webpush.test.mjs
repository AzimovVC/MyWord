import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import ece from 'http_ece';
import { encryptPayload, vapidJwt, generateVapidKeys, sendPush, b64u } from '../src/webpush.js';

function uaKeys() {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  const auth = crypto.randomBytes(16);
  return { ecdh, p256dh: b64u.enc(ecdh.getPublicKey()), auth: b64u.enc(auth), authBuf: auth };
}

test('шифрование aes128gcm расшифровывается независимой реализацией (http_ece)', async () => {
  const ua = uaKeys();
  const text = 'Устоять: держишься уже 3 ч 20 мин. Тянет — открой «Тянет» 🌿';
  const body = await encryptPayload(text, ua.p256dh, ua.auth);
  const plain = ece.decrypt(Buffer.from(body), { version: 'aes128gcm', privateKey: ua.ecdh, authSecret: ua.authBuf });
  assert.equal(plain.toString('utf8'), text);
});

test('заголовок записи: salt, rs=4096, idlen=65', async () => {
  const ua = uaKeys();
  const body = await encryptPayload('x', ua.p256dh, ua.auth);
  assert.equal(new DataView(body.buffer, body.byteOffset).getUint32(16), 4096);
  assert.equal(body[20], 65);
  assert.equal(body[21], 4);
});

test('каждое шифрование даёт новые ключ и соль', async () => {
  const ua = uaKeys();
  const a = await encryptPayload('x', ua.p256dh, ua.auth), b = await encryptPayload('x', ua.p256dh, ua.auth);
  assert.notDeepEqual(a, b);
});

test('плохие ключи подписки отклоняются', async () => {
  await assert.rejects(encryptPayload('x', 'AAAA', 'BBBB'));
});

test('VAPID JWT: подпись проверяется публичным ключом, aud и exp верны', async () => {
  const k = await generateVapidKeys();
  const now = Date.UTC(2026, 0, 1);
  const jwt = await vapidJwt({ ...k, subject: 'mailto:a@b.c' }, 'https://fcm.googleapis.com/fcm/send/abc', now);
  const [h, p, s] = jwt.split('.');
  const claims = JSON.parse(Buffer.from(b64u.dec(p)).toString());
  assert.equal(claims.aud, 'https://fcm.googleapis.com');
  assert.equal(claims.sub, 'mailto:a@b.c');
  assert.equal(claims.exp, Math.floor(now / 1000) + 12 * 3600);
  assert.deepEqual(JSON.parse(Buffer.from(b64u.dec(h)).toString()), { typ: 'JWT', alg: 'ES256' });
  const pub = b64u.dec(k.publicKey);
  const key = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: b64u.enc(pub.slice(1, 33)), y: b64u.enc(pub.slice(33)) }, format: 'jwk' });
  const ok = crypto.verify('sha256', Buffer.from(`${h}.${p}`), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(b64u.dec(s)));
  assert.equal(ok, true);
});

test('sendPush: заголовки, тело расшифровывается, 410 помечает подписку как удалённую', async () => {
  const k = await generateVapidKeys();
  const env = { VAPID_PUBLIC_KEY: k.publicKey, VAPID_PRIVATE_KEY: k.privateKey, VAPID_SUBJECT: 'mailto:a@b.c' };
  const ua = uaKeys();
  const sub = { endpoint: 'https://push.example/send/1', p256dh: ua.p256dh, auth: ua.auth };
  let seen;
  const mk = (status) => async (url, init) => { seen = { url, init }; return new Response('', { status }); };
  const r = await sendPush(env, sub, { title: 'T', body: 'B' }, { fetchFn: mk(201), urgency: 'high' });
  assert.deepEqual(r, { ok: true, status: 201, gone: false });
  assert.equal(seen.init.headers['Content-Encoding'], 'aes128gcm');
  assert.equal(seen.init.headers.Urgency, 'high');
  assert.match(seen.init.headers.Authorization, new RegExp(`^vapid t=[\\w-]+\\.[\\w-]+\\.[\\w-]+, k=${k.publicKey}$`));
  const plain = ece.decrypt(Buffer.from(seen.init.body), { version: 'aes128gcm', privateKey: ua.ecdh, authSecret: ua.authBuf });
  assert.deepEqual(JSON.parse(plain.toString()), { title: 'T', body: 'B' });
  assert.equal((await sendPush(env, sub, {}, { fetchFn: mk(410) })).gone, true);
  assert.equal((await sendPush(env, sub, {}, { fetchFn: mk(404) })).gone, true);
  assert.equal((await sendPush(env, sub, {}, { fetchFn: mk(500) })).gone, false);
  await assert.rejects(sendPush(env, { ...sub, endpoint: 'http://insecure/x' }, {}, { fetchFn: mk(201) }));
});
