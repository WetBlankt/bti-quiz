import { root } from './_setup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const walk = (d) => fs.readdirSync(path.join(root, d), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name).replaceAll('\\', '/')]));

test('service worker precaches every shell file (so offline never hits a missing module)', () => {
  const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  const listed = new Set([...sw.matchAll(/'([^']+\.(?:js|css|png|webmanifest|html))'/g)].map((m) => m[1]));
  const actual = [...walk('js'), ...walk('css'), ...walk('icons'), 'index.html', 'manifest.webmanifest'];
  const missing = actual.filter((f) => !listed.has(f));
  assert.deepEqual(missing, [], 'add to SHELL in sw.js and bump VERSION');
  for (const f of listed) assert.ok(fs.existsSync(path.join(root, f)), 'listed but missing: ' + f);
});
test('manifest is installable', () => {
  const m = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
  assert.equal(m.display, 'standalone');
  assert.ok(m.icons.some((i) => i.sizes === '192x192') && m.icons.some((i) => i.sizes === '512x512'));
  for (const i of m.icons) assert.ok(fs.existsSync(path.join(root, i.src)));
});
test('no module imports an external URL or remote asset (core works offline)', () => {
  for (const f of [...walk('js'), 'index.html', 'css/app.css']) {
    const txt = fs.readFileSync(path.join(root, f), 'utf8');
    const urls = [...txt.matchAll(/(?:src|href)=["'](https?:)?\/\/[^"']+|@import\s+url\(|from\s+['"]https?:/g)];
    assert.equal(urls.length, 0, f);
  }
});
