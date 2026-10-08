process.env.TZ = 'UTC';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildData } from '../js/data.js';
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const rd = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
export function loadTestData() {
  const manifest = rd('data/manifest.json');
  return buildData(rd('data/syllabus.json'), manifest.files.map((f) => rd('data/' + f)));
}
