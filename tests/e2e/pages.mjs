// Production-style test: the app is served as GitHub Pages serves a project site, with NO Node app server:
//   plain static files, under /bti-quiz/, 10-minute HTTP cache, 404 for anything outside the prefix.
// Run: npm run build:pages && npm run e2e:pages     (needs python3 for the static host and playwright for the browser)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = createRequire('/home/claude/.npm-global/lib/node_modules/')('playwright'); }
const SHOTS = process.env.SHOTS || '/tmp/shots'; fs.mkdirSync(SHOTS, { recursive: true });
const PREFIX = '/bti-quiz';

// ---- prepare: fresh production build, copied so the update test can modify it
if (spawnSync(process.execPath, ['tools/build-pages.mjs'], { cwd: root, stdio: 'inherit' }).status !== 0) process.exit(1);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pages-'));
const site = path.join(tmp, 'site'); fs.cpSync(path.join(root, 'dist'), site, { recursive: true });
const logfile = path.join(tmp, 'requests.jsonl'); fs.writeFileSync(logfile, '');
const port = 20000 + Math.floor(Math.random() * 20000);
const py = spawn(process.env.PYTHON || 'python3', [path.join(root, 'tools', 'pages-sim.py'), site, PREFIX, String(port), logfile], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));
const origin = `http://127.0.0.1:${port}`, base = `${origin}${PREFIX}/`;
const reqLog = () => fs.readFileSync(logfile, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));

const results = []; const check = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + extra}`); };
const browser = await pw.chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const errors = [];

const act = (page, correct = true) => page.evaluate((correct) => {
  const app = window.__app, s = app.session, q = app.data.qIndex.get(s.ids[s.i]), $$ = (x) => [...document.querySelectorAll(x)];
  const optBy = (t) => $$('.opt').find((b) => b.querySelector('.t').textContent === t);
  if (q.kind === 'choice') optBy(correct ? q.options[q.answer] : q.options.find((o, i) => i !== q.answer)).click();
  else if (q.kind === 'multi') { q.answer.forEach((i) => optBy(q.options[i]).click()); document.querySelector('.qfoot .btn').click(); }
  else if (q.kind === 'match') { const L = [...$$('.mcol')[0].children], R = [...$$('.mcol')[1].children]; q.pairs.forEach((p, i) => { L[i].click(); R.find((b) => b.firstChild.textContent === q.pairs[i][1]).click(); }); document.querySelector('.qfoot .btn').click(); }
  else { const inp = document.querySelector('.fill input'); inp.value = q.accept[0]; inp.dispatchEvent(new Event('input')); document.querySelector('.qfoot .btn').click(); }
  const ok = document.querySelector('.fb')?.classList.contains('good') ?? null;
  if (s.mode !== 'exam' || q.kind === 'choice') document.querySelector('.qfoot .btn')?.click(); // exam: non-choice kinds already pressed Next
  return { id: q.id, kind: q.kind, ok, exam: s.mode === 'exam' };
}, correct);
const play = async (page, n) => { const res = []; for (let i = 0; i < n; i++) res.push(await act(page)); return res; };
const startIds = async (page, ids, mode = 'quick') => { await page.evaluate(([ids, mode]) => { const a = window.__app; a.session = { id: 'p' + Math.random(), mode, title: 't', ids, i: 0, res: [], streak: 0, best: 0, xp: 0, started: Date.now(), secs: 0 }; a.go('/quiz'); }, [ids, mode]); await page.waitForSelector('.qcard'); };
const state = (page) => page.evaluate(() => { const s = window.__app.store.getState(); return { xp: s.xp, att: s.att, ok: s.ok, bad: s.bad, quizzes: s.quizzes.length }; });

try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errors.push('console: ' + m.text()); });

  // ===== 1. open the repository URL WITHOUT a trailing slash, as a person might type it
  await page.goto(`${origin}${PREFIX}`); await page.waitForSelector('.hero');
  check('repo URL without trailing slash redirects to /bti-quiz/ and the app loads', page.url() === base, page.url());
  check('all 9 module cards render', (await page.locator('.mod').count()) === 9);
  const look = await page.evaluate(() => ({ bg: getComputedStyle(document.body).backgroundColor, radius: getComputedStyle(document.querySelector('.hero')).borderRadius, theme: document.documentElement.dataset.theme }));
  check('stylesheet applies under /bti-quiz/ (dark theme, styled cards)', look.bg === 'rgb(10, 14, 31)' && parseInt(look.radius) > 10 && look.theme === 'dark', JSON.stringify(look));
  await page.screenshot({ path: `${SHOTS}/pages-1-home.png` });

  // ===== 2. data: all 1,000 questions loaded from the subpath
  const bank = await page.evaluate(() => { const d = window.__app.data; return { n: d.questions.length, mods: [...d.byModule].map(([k, v]) => `${k}:${v.length}`).join(','), errors: d.errors.length, cards: d.cards.length }; });
  check('1,000 questions loaded from all 9 modules, no bank errors', bank.n === 1000 && bank.errors === 0 && bank.mods === 'm1:110,m2:110,m3:110,m4:110,m5:110,m6:110,m7:110,m8:110,m9:120', JSON.stringify(bank));

  // ===== 3. service worker + installability from the subpath
  const sw = await page.evaluate(async () => { const r = await navigator.serviceWorker.ready; return { scope: r.scope, script: r.active.scriptURL }; });
  check('service worker is registered with scope /bti-quiz/', sw.scope === base && sw.script === base + 'sw.js', JSON.stringify(sw));
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  const cdp = await ctx.newCDPSession(page); await cdp.send('Page.enable');
  const man = await cdp.send('Page.getAppManifest'); const mj = JSON.parse(man.data || '{}');
  check('manifest parses with no errors; start_url and scope resolve inside /bti-quiz/', (man.errors || []).length === 0 && man.url === base + 'manifest.webmanifest' && mj.start_url === './' && mj.scope === './', JSON.stringify({ url: man.url, errors: man.errors }));
  // Chrome refuses installs in incognito/temporary profiles, so ask a persistent (normal) profile what it thinks
  const pdir = path.join(tmp, 'profile');
  const pctx = await pw.chromium.launchPersistentContext(pdir, { executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox'], viewport: { width: 390, height: 844 } });
  const ppage = pctx.pages()[0] || (await pctx.newPage());
  await ppage.goto(base); await ppage.waitForSelector('.hero'); await ppage.evaluate(() => navigator.serviceWorker.ready); await ppage.reload(); await ppage.waitForSelector('.hero');
  const pcdp = await pctx.newCDPSession(ppage); await pcdp.send('Page.enable');
  const inst = await pcdp.send('Page.getInstallabilityErrors');
  check('Chrome (normal profile) reports NO installability errors, so Android offers "Install app"', (inst.installabilityErrors || []).length === 0, JSON.stringify(inst.installabilityErrors));
  await pctx.close();
  const icons = await page.evaluate(async () => { const m = await (await fetch('manifest.webmanifest')).json(); return Promise.all(m.icons.map(async (i) => { const r = await fetch(i.src); return r.status + ' ' + r.headers.get('content-type') + ' ' + new URL(r.url).pathname; })); });
  check('all manifest icons load from /bti-quiz/icons/', icons.every((i) => i.startsWith('200 image/png /bti-quiz/icons/')), icons.join(' | '));
  // everything needed offline is in the caches
  const expected = ['index.html', 'manifest.webmanifest', 'css/app.css', ...fs.readdirSync(path.join(site, 'js')).filter((f) => f.endsWith('.js')).map((f) => 'js/' + f), ...fs.readdirSync(path.join(site, 'js/views')).map((f) => 'js/views/' + f), 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'data/syllabus.json', 'data/manifest.json', ...fs.readdirSync(path.join(site, 'data/questions')).map((f) => 'data/questions/' + f)].map((f) => PREFIX + '/' + f);
  const cached = await page.evaluate(async () => { const out = []; for (const k of await caches.keys()) for (const r of await (await caches.open(k)).keys()) out.push(new URL(r.url).pathname); return out; });
  const missing = expected.filter((e) => !cached.includes(e));
  check(`precache holds all ${expected.length} app + data files under /bti-quiz/`, missing.length === 0, missing.join(', '));

  // ===== 4. quiz: every question type from every module, through the UI
  const modIds = await page.evaluate(() => [...window.__app.data.byModule].map(([k, v]) => v.slice(0, 12).map((q) => q.id)));
  let allGood = true; const kinds = new Set();
  for (const ids of modIds) { await startIds(page, ids); const r = await play(page, ids.length); r.forEach((x) => { kinds.add(x.kind); if (x.ok !== true) allGood = false; }); await page.waitForSelector('.results'); }
  check('quizzes from all 9 modules run and mark correct answers green', allGood, '');
  check('choice, multi-select, match and fill-in questions all work', ['choice', 'multi', 'match', 'fill'].every((k) => kinds.has(k)), [...kinds].join(','));
  const s1 = await state(page);
  check('XP, score and answers recorded', s1.att === 108 && s1.ok === 108 && s1.xp > 0 && s1.quizzes === 9, JSON.stringify(s1));

  // ===== 5. refresh / resume + persistence
  await page.evaluate(() => window.__app.go('/')); await page.waitForSelector('.hero');
  await page.getByText('Quick quiz', { exact: true }).first().click(); await page.waitForSelector('.qcard');
  await play(page, 4);
  const idx = await page.evaluate(() => window.__app.session.i);
  await page.reload(); await page.waitForSelector('.qcard');
  const idx2 = await page.evaluate(() => window.__app.session.i);
  check('refreshing mid-quiz resumes at the same question (subpath URL with #/quiz)', idx === 4 && idx2 === 4, `${idx}/${idx2}`);
  await play(page, 6); await page.waitForSelector('.results');
  const s2 = await state(page); await page.reload(); await page.waitForSelector('.hero'); const s3 = await state(page);
  check('progress persists across reload (IndexedDB at the Pages origin)', s3.xp === s2.xp && s3.att === 118, JSON.stringify([s2, s3]));
  await page.goto(`${base}#/stats`); await page.waitForSelector('.chart');
  check('deep link #/stats opens directly under /bti-quiz/', (await page.locator('#view').innerText()).includes('Achievements'));

  // ===== 6. sounds, fast mode, exam mode, flashcards, search, mistakes
  await page.evaluate(() => { window.__osc = 0; const o = AudioContext.prototype.createOscillator; AudioContext.prototype.createOscillator = function () { window.__osc++; return o.call(this); }; });
  await page.evaluate(() => { window.__app.sound.play('correct'); window.__app.sound.play('wrong'); });
  const on = await page.evaluate(() => window.__osc);
  await page.evaluate(() => { window.__app.store.set('sound', false); window.__osc = 0; window.__app.sound.play('correct'); window.__app.sound.play('ach'); });
  const off = await page.evaluate(() => window.__osc); await page.evaluate(() => window.__app.store.set('sound', true));
  check('sound effects play when on and are silent when off', on > 0 && off === 0, `${on}/${off}`);
  await page.evaluate(() => window.__app.store.set('fast', true));
  check('fast mode applies', await page.evaluate(() => document.documentElement.classList.contains('fast')));
  await page.evaluate(() => window.__app.store.set('fast', false));
  await page.goto(`${base}#/study`); await page.waitForSelector('.act');
  await page.getByRole('button', { name: /Exam mode/ }).click(); await page.getByRole('button', { name: '5', exact: true }).click();
  await page.getByRole('button', { name: /^Start/ }).click(); await page.waitForSelector('.qcard');
  check('exam mode shows a timer', (await page.locator('.qchip', { hasText: '⏱' }).count()) === 1);
  for (let i = 0; i < 5; i++) await act(page);
  await page.waitForSelector('.results'); check('exam mode completes with a results screen', true);
  await page.goto(`${base}#/mistakes`); await page.evaluate(() => window.__app.rerender());
  await page.goto(`${base}#/search`); await page.waitForSelector('input[type=search]'); await page.fill('input[type=search]', 'hoarding'); await page.waitForTimeout(400);
  check('search finds topics, questions and flashcards', /Topics \(/.test(await page.locator('#view').innerText()) && /Flashcards \(/.test(await page.locator('#view').innerText()));
  await page.evaluate(() => { window.__app.flashCfg = { module: 'm5', n: 5 }; window.__app.go('/flash'); }); await page.waitForSelector('.fcard'); await page.locator('.fcard').click(); await page.waitForSelector('.fcard.back');
  check('flashcards flip', true);
  await page.evaluate(() => window.__app.go('/'));

  // ===== 7. OFFLINE after the first successful load
  await ctx.setOffline(true);
  await page.goto(base); await page.waitForSelector('.hero');
  check('offline: app opens from the service-worker cache at /bti-quiz/', true);
  check('offline: "Offline" status shown', (await page.locator('.netbar').innerText()).includes('Offline'));
  const offBank = await page.evaluate(() => window.__app.data.questions.length);
  check('offline: all 1,000 questions still load', offBank === 1000, String(offBank));
  const before = await state(page);
  await page.getByText('Quick quiz', { exact: true }).first().click(); await page.waitForSelector('.qcard');
  await play(page, 10); await page.waitForSelector('.results');
  const after = await state(page);
  check('offline: quiz, scoring and XP work', after.att === before.att + 10 && after.xp > before.xp, JSON.stringify([before, after]));
  await page.goto(`${base}#/search`); await page.waitForSelector('input[type=search]'); await page.fill('input[type=search]', 'guild'); await page.waitForTimeout(300);
  check('offline: search works', /Questions \(/.test(await page.locator('#view').innerText()));
  await page.goto(`${base}#/stats`); await page.waitForSelector('.chart'); check('offline: statistics page works', true);
  await page.reload(); await page.waitForSelector('.chart');
  await page.screenshot({ path: `${SHOTS}/pages-2-offline-stats.png` });
  await ctx.setOffline(false);
  check('offline progress is still stored after reconnecting', (await state(page)).att === after.att);

  // ===== 8. UPDATE test: GitHub caches files for 10 minutes; a new deploy must still reach the phone
  fs.appendFileSync(path.join(site, 'css/app.css'), '\n/* deploy-marker-ABC123 */\n');
  fs.writeFileSync(path.join(site, 'sw.js'), fs.readFileSync(path.join(site, 'sw.js'), 'utf8').replace("const VERSION = 'v3';", "const VERSION = 'v3-redeploy';"));
  await page.goto(base); await page.waitForSelector('.hero');
  // wait (poll) until the new worker has installed (29 shell files cached) AND activated (old cache deleted)
  for (let i = 0; i < 60; i++) {
    const snap = await page.evaluate(async () => { const k = await caches.keys(); return { k, n: k.includes('bti-shell-v3-redeploy') ? (await (await caches.open('bti-shell-v3-redeploy')).keys()).length : 0 }; });
    if (snap.n >= 29 && !snap.k.includes('bti-shell-v3')) break;
    await page.waitForTimeout(500);
  }
  const upd = await page.evaluate(async () => {
    const cache = await caches.open('bti-shell-v3-redeploy'); const hit = await cache.match(new URL('css/app.css', location.href).href); if (!hit) return { marker: false, missing: true, keys: (await cache.keys()).map((r) => r.url), all: await caches.keys() }; const css = await hit.text();
    return { marker: css.includes('deploy-marker-ABC123'), keys: await caches.keys(), live: await (await fetch('css/app.css')).text().then((t) => t.includes('deploy-marker-ABC123')) };
  });
  check('after a redeploy the NEW files are cached despite GitHub\'s 10-minute HTTP cache', upd.marker, JSON.stringify(upd));
  check('old cache version is removed', !upd.keys.includes('bti-shell-v3'), upd.keys.join(','));
  check('the running app receives the new files (network-first)', upd.live);
  check('progress survives the update', (await state(page)).att === after.att);
  // also: a new deploy WITHOUT touching sw.js (user forgot) still shows up when online
  fs.appendFileSync(path.join(site, 'css/app.css'), '\n/* second-marker-XYZ789 */\n');
  const live2 = await page.evaluate(async () => (await (await fetch('css/app.css')).text()).includes('second-marker-XYZ789'));
  check('a redeploy that does not change sw.js is still picked up when online', live2);

  // ===== 9. server-side evidence: where did requests go?
  const log = reqLog();
  const outside = log.filter((r) => !r.path.startsWith(PREFIX + '/') && r.path !== PREFIX);
  const notFound = log.filter((r) => r.code === 404);
  check(`no request went outside ${PREFIX}/ (${log.length} requests logged)`, outside.length === 0, JSON.stringify(outside.slice(0, 5)));
  check('no request returned 404', notFound.length === 0, JSON.stringify(notFound.slice(0, 5)));
  check('no uncaught errors or console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
} catch (e) { check('pages e2e completed without throwing', false, e.stack || String(e)); }
finally { await browser.close(); py.kill(); fs.rmSync(tmp, { recursive: true, force: true }); }
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
