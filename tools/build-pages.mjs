// Prepares the static GitHub Pages version in ./dist and verifies it.   Run: npm run build:pages
// dist/ contains ONLY what the browser needs (no Node, no tests, no tools). You normally do not need it: pushing the
// project root to GitHub works too. It exists so the production files can be checked and tested exactly as Pages serves them.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const RUNTIME = ['index.html', 'manifest.webmanifest', 'sw.js', '.nojekyll', 'css', 'js', 'data', 'icons'];
const problems = [];

fs.rmSync(dist, { recursive: true, force: true });
const copy = (rel) => {
  const src = path.join(root, rel), dst = path.join(dist, rel);
  if (!fs.existsSync(src)) { problems.push(`missing ${rel}`); return; }
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.cpSync(src, dst, { recursive: true });
};
RUNTIME.forEach(copy);

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const files = walk(dist).map((f) => path.relative(dist, f).replaceAll('\\', '/'));
const read = (rel) => fs.readFileSync(path.join(dist, rel), 'utf8');

// 1. nothing may assume the site lives at "/"
const absolute = /(?:src|href)=["']\/(?!\/)|url\(\s*["']?\/(?!\/)|fetch\(\s*["'`]\/|register\(\s*["']\/|from\s+["']\/|new URL\(\s*["']\//;
for (const f of files.filter((f) => /\.(html|css|js|webmanifest)$/.test(f))) if (absolute.test(read(f))) problems.push(`absolute "/" path in ${f}`);
// 2. nothing may depend on Node / the dev server / remote hosts
const code = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1'); // ignore comments
for (const f of files.filter((f) => /\.(js|html)$/.test(f))) if (/serve\.mjs|require\(|process\.env|https?:\/\/(?!www\.w3\.org)/.test(code(f)) && f !== 'js/config.js') problems.push(`server/remote reference in ${f}`);
// 3. manifest is relative and its icons exist
const manifest = JSON.parse(read('manifest.webmanifest'));
if (manifest.start_url !== './' || manifest.scope !== './') problems.push('manifest start_url/scope must be "./"');
for (const i of manifest.icons) if (!files.includes(i.src)) problems.push(`manifest icon missing: ${i.src}`);
// 4. the service worker precache list is complete and every entry exists
const sw = read('sw.js');
const shell = [...sw.matchAll(/'([^']+\.(?:js|css|png|webmanifest|html))'/g)].map((m) => m[1]);
for (const f of shell) if (!files.includes(f)) problems.push(`sw.js lists a missing file: ${f}`);
for (const f of files.filter((f) => /^(js|css|icons)\//.test(f) || ['index.html', 'manifest.webmanifest'].includes(f))) if (!shell.includes(f)) problems.push(`sw.js does not precache ${f}`);
// 5. data files referenced by the manifest exist
const dm = JSON.parse(read('data/manifest.json'));
for (const f of dm.files) if (!files.includes('data/' + f)) problems.push(`data/manifest.json lists a missing file: ${f}`);
if (!files.includes('.nojekyll')) problems.push('.nojekyll missing');

const bytes = files.reduce((n, f) => n + fs.statSync(path.join(dist, f)).size, 0);
console.log(`dist/: ${files.length} files, ${(bytes / 1024).toFixed(0)} KB, ${dm.files.length} question files (${dm.version})`);
if (problems.length) { problems.forEach((p) => console.log('PROBLEM', p)); process.exit(1); }
console.log('static build OK: relative paths only, no server dependency, precache complete');
