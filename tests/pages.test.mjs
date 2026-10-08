import { root } from './_setup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

test('the static GitHub Pages build prepares and verifies cleanly', () => {
  const r = spawnSync(process.execPath, ['tools/build-pages.mjs'], { cwd: root, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /static build OK/);
  const dist = (p) => fs.existsSync(path.join(root, 'dist', p));
  for (const f of ['index.html', 'sw.js', 'manifest.webmanifest', '.nojekyll', 'css/app.css', 'js/main.js', 'data/syllabus.json', 'data/questions/m9.json', 'icons/icon-512.png']) assert.ok(dist(f), f);
  for (const f of ['tools', 'tests', 'node_modules', 'package.json']) assert.ok(!dist(f), `${f} must not be shipped in dist`);
});

test('.nojekyll exists so GitHub does not run Jekyll over the site', () => assert.ok(fs.existsSync(path.join(root, '.nojekyll'))));

test('manifest is relative so it works under /REPO/ and installs from a subpath', () => {
  const m = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
  assert.equal(m.start_url, './'); assert.equal(m.scope, './'); assert.equal(m.id, './'); assert.equal(m.display, 'standalone');
  for (const i of m.icons) assert.ok(!i.src.startsWith('/') && !/^https?:/.test(i.src), i.src);
});

test('service worker: precache bypasses GitHub\'s 10-minute HTTP cache and runtime is network-first (updates need no manual version bump)', () => {
  const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  assert.match(sw, /cache:\s*'reload'/); assert.match(sw, /cache:\s*'no-cache'/); assert.match(sw, /networkFirst/);
  assert.doesNotMatch(sw, /new URL\(\s*['"]\//); assert.doesNotMatch(sw, /caches\.match\(\s*['"]\//);
});

test('no app file imports from the dev tooling or Node', () => {
  const walk = (d) => fs.readdirSync(path.join(root, d), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  for (const f of walk('js')) { const t = fs.readFileSync(path.join(root, f), 'utf8'); assert.doesNotMatch(t, /from\s+['"][^'"]*(tools|tests|node_modules)\//, f); assert.doesNotMatch(t, /from\s+['"]node:/, f); }
});

test('startup can never fail silently: watchdog in index.html, fatal handler in main.js, bounded IndexedDB open', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /<div class="boot" data-loading>/);
  assert.match(html, /<script>[\s\S]*__btiReset[\s\S]*<\/script>\s*<script type="module" src="js\/main\.js">/, 'plain-script watchdog must come before the module');
  const main = fs.readFileSync(path.join(root, 'js/main.js'), 'utf8');
  assert.match(main, /boot\(\)\.catch\(showFatal\)/);
  assert.match(fs.readFileSync(path.join(root, 'js/storage.js'), 'utf8'), /did not respond within/);
});
