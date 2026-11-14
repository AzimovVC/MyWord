// Записывает public/version.json: хеш всех файлов приложения. Запускается автоматически
// при `wrangler deploy` и `wrangler dev` (см. [build] в wrangler.toml). Клиент сравнивает
// версию с той, с которой загрузился, и при расхождении сам перезагружается.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('../public/', import.meta.url).pathname;
const files = [];
(function walk(d) {
  for (const f of readdirSync(d).sort()) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (f !== 'version.json') files.push(p);
  }
})(root);

const h = createHash('sha256');
for (const f of files) { h.update(relative(root, f)); h.update(readFileSync(f)); }
const v = h.digest('hex').slice(0, 12);
writeFileSync(join(root, 'version.json'), JSON.stringify({ v, files: files.length }) + '\n');
console.log('version', v);
