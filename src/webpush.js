// Web Push для Cloudflare Workers на чистом WebCrypto, без Node-зависимостей.
//   VAPID: RFC 8292 (JWT ES256), шифрование: RFC 8291 (aes128gcm, RFC 8188).

const enc = new TextEncoder();

export const b64u = {
  enc(buf) {
    const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    let s = '';
    for (const x of b) s += String.fromCharCode(x);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  dec(str) {
    const s = String(str).replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  },
};

const concat = (...a) => {
  const out = new Uint8Array(a.reduce((n, x) => n + x.length, 0));
  let o = 0;
  for (const x of a) { out.set(x, o); o += x.length; }
  return out;
};

async function hkdf(ikm, salt, info, bytes) {
  const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, bytes * 8));
}

// Генерация пары VAPID: публичный (65 байт, несжатый) и приватный (32 байта), оба base64url
export async function generateVapidKeys() {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const pub = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
  const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
  return { publicKey: b64u.enc(pub), privateKey: jwk.d };
}

async function vapidKey(publicKey, privateKey) {
  const pub = b64u.dec(publicKey);
  if (pub.length !== 65 || pub[0] !== 4) throw new Error('bad vapid public key');
  return crypto.subtle.importKey(
    'jwk',
    { kty: 'EC', crv: 'P-256', d: privateKey, x: b64u.enc(pub.slice(1, 33)), y: b64u.enc(pub.slice(33)), ext: true },
    { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'],
  );
}

export async function vapidJwt({ publicKey, privateKey, subject }, endpoint, now = Date.now()) {
  const aud = new URL(endpoint).origin;
  const head = b64u.enc(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const body = b64u.enc(enc.encode(JSON.stringify({ aud, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject })));
  const key = await vapidKey(publicKey, privateKey);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${head}.${body}`)));
  return `${head}.${body}.${b64u.enc(sig)}`;
}

// RFC 8291: шифрует payload для подписки (p256dh и auth в base64url)
export async function encryptPayload(plain, p256dh, auth, { asKeys, salt } = {}) {
  const uaPub = b64u.dec(p256dh);
  const authSecret = b64u.dec(auth);
  if (uaPub.length !== 65 || authSecret.length < 16) throw new Error('bad subscription keys');
  const ecdh = { name: 'ECDH', namedCurve: 'P-256' };
  const as = asKeys || (await crypto.subtle.generateKey(ecdh, true, ['deriveBits']));
  const asPub = new Uint8Array(await crypto.subtle.exportKey('raw', as.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPub, ecdh, false, []);
  const secret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, as.privateKey, 256));
  const ikm = await hkdf(secret, authSecret, concat(enc.encode('WebPush: info\0'), uaPub, asPub), 32);
  const s = salt || crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(ikm, s, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(ikm, s, enc.encode('Content-Encoding: nonce\0'), 12);
  const data = concat(typeof plain === 'string' ? enc.encode(plain) : plain, new Uint8Array([2])); // 0x02 — последняя запись
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, data));
  const rs = new Uint8Array([0, 0, 0x10, 0]); // размер записи 4096
  return concat(s, rs, new Uint8Array([asPub.length]), asPub, ct);
}

// Отправка одного уведомления. gone=true значит подписку надо удалить (404/410).
export async function sendPush(env, sub, payload, { ttl = 3600, urgency = 'normal', fetchFn = fetch } = {}) {
  const vapid = { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY, subject: env.VAPID_SUBJECT };
  if (!vapid.publicKey || !vapid.privateKey || !vapid.subject) throw new Error('vapid not configured');
  const url = new URL(sub.endpoint);
  if (url.protocol !== 'https:') throw new Error('bad endpoint');
  const json = JSON.stringify(payload);
  if (enc.encode(json).length > 3000) throw new Error('payload too large');
  const [jwt, body] = await Promise.all([vapidJwt(vapid, sub.endpoint), encryptPayload(json, sub.p256dh, sub.auth)]);
  const res = await fetchFn(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: `vapid t=${jwt}, k=${vapid.publicKey}`,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(ttl),
      Urgency: urgency,
    },
    body,
  });
  return { ok: res.ok, status: res.status, gone: res.status === 404 || res.status === 410 };
}
