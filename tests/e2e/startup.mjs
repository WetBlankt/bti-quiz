// "Loading..." regression: every way startup can fail must show a SPECIFIC visible reason (or recover) - never a silent
// "Loading..." forever.  Run: npm run build:pages && npm run e2e:startup
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = createRequire('/home/claude/.npm-global/lib/node_modules/')('playwright'); }
if (spawnSync(process.execPath, ['tools/build-pages.mjs'], { cwd: root, stdio: 'inherit' }).status !== 0) process.exit(1);
const dist = path.join(root, 'dist');
const CASES = [
  { name: 'healthy start shows the dashboard', expect: /1000 questions/ },
  { name: 'js/main.js missing (404)', rm: ['js/main.js'], expect: /could not start[\s\S]*js\/main\.js/i },
  { name: 'an imported module missing (js/views/stats.js 404)', rm: ['js/views/stats.js'], expect: /could not start[\s\S]*js\/views\/stats\.js/i },
  { name: 'a script has a syntax error', patch: ['js/main.js', (t) => t + '\n}}}'], expect: /could not start[\s\S]*Unexpected token/i },
  { name: 'question file missing (data/questions/m3.json)', rm: ['data/questions/m3.json'], expect: /Could not load the question bank[\s\S]*m3\.json/ },
  { name: 'syllabus.json missing', rm: ['data/syllabus.json'], expect: /Could not load the question bank[\s\S]*syllabus\.json/ },
  { name: 'indexedDB.open never answers -> falls back, tells the user', init: 'indexedDB.open=function(){return {};};', expect: /NOT be saved/ , dash: true },
  { name: 'indexedDB absent -> falls back, tells the user', init: "Object.defineProperty(globalThis,'indexedDB',{value:undefined});", expect: /NOT be saved/, dash: true },
  { name: 'IndexedDB read fails after open -> real error shown', init: "IDBObjectStore.prototype.getAll=function(){throw new Error('simulated IDB read failure');};", expect: /could not start[\s\S]*simulated IDB read failure/i },
];
let failed = 0;
for (const c of CASES) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'st-')); const site = path.join(tmp, 's'); fs.cpSync(dist, site, { recursive: true });
  (c.rm || []).forEach((f) => fs.rmSync(path.join(site, f)));
  if (c.patch) { const p = path.join(site, c.patch[0]); fs.writeFileSync(p, c.patch[1](fs.readFileSync(p, 'utf8'))); }
  const log = path.join(tmp, 'l'); fs.writeFileSync(log, ''); const port = 24000 + Math.floor(Math.random() * 8000);
  const py = spawn(process.env.PYTHON || 'python3', [path.join(root, 'tools', 'pages-sim.py'), site, '/bti-quiz', String(port), log], { stdio: 'ignore' }); await new Promise((r) => setTimeout(r, 600));
  const b = await pw.chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox'] });
  const page = await (await b.newContext({ serviceWorkers: 'block' })).newPage();
  if (c.init) await page.addInitScript(c.init);
  await page.goto(`http://127.0.0.1:${port}/bti-quiz/`);
  let text = '';
  try { await page.waitForFunction((src) => { const t = document.body.innerText; return !/^\s*Loading…\s*$/.test(document.querySelector('#app').innerText) && new RegExp(src).test(t); }, c.expect.source, { timeout: 20000 }); } catch {}
  text = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
  const silent = /^Loading…\s*$/.test((await page.locator('#app').innerText()).trim());
  const ok = !silent && c.expect.test(text) && (!c.dash || (await page.locator('.mod').count()) === 9);
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${c.name}${ok ? '' : '\n      screen: ' + text.slice(0, 220)}`);
  await b.close(); py.kill(); fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(`\n${CASES.length - failed}/${CASES.length} startup cases behave`);
process.exit(failed ? 1 : 0);
