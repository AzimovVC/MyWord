// Берёт SHA-256 отпечаток ключа подписи из keystore и записывает его в public/.well-known/assetlinks.json
//   node scripts/set-fingerprint.mjs                       # отладочный ключ ~/.android/debug.keystore
//   node scripts/set-fingerprint.mjs путь/к/ключу.jks алиас пароль [пароль_ключа]
// Запусти ещё раз с другим ключом, чтобы добавить и его: старые отпечатки сохраняются.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const [ks = join(homedir(), '.android', 'debug.keystore'), alias = 'androiddebugkey', pass = 'android', keyPass = pass] = process.argv.slice(2);
let out;
try {
  out = execFileSync('keytool', ['-list', '-v', '-keystore', ks, '-alias', alias, '-storepass', pass, '-keypass', keyPass], { encoding: 'utf8' });
} catch (e) {
  console.error('keytool не сработал. Проверь путь к ключу, алиас и пароль. Для отладочного ключа сначала собери приложение: cd android && ./gradlew assembleDebug');
  process.exit(1);
}
const m = out.match(/SHA256:\s*([0-9A-F]{2}(?::[0-9A-F]{2}){31})/i);
if (!m) { console.error('В выводе keytool нет отпечатка SHA256.'); process.exit(1); }
const fp = m[1].toUpperCase();

const file = new URL('../public/.well-known/assetlinks.json', import.meta.url);
const data = JSON.parse(readFileSync(file, 'utf8'));
const t = data[0].target;
const old = (t.sha256_cert_fingerprints || []).filter((x) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(x));
t.sha256_cert_fingerprints = [...new Set([...old, fp])];
writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
console.log('Записан отпечаток', fp);
console.log('Теперь задеплой сайт: npx wrangler deploy');
