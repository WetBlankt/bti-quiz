// Lists data/questions/*.json in data/manifest.json (the app + service worker read this).
// Run after adding or changing a question file:  npm run manifest
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'data', 'questions');
const files = fs.readdirSync(dir).filter((f) => /^m\d+\.json$/.test(f)).sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1)));
let count = 0;
for (const f of files) count += JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).questions?.length || 0;
const manifest = { version: `${new Date().toISOString().slice(0, 10)}-${count}q`, files: files.map((f) => `questions/${f}`) };
fs.writeFileSync(path.join(root, 'data', 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n');
console.log('manifest:', manifest.version, manifest.files.join(', '));
