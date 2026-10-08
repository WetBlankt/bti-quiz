// Per-module browser check. Usage: node tests/e2e/module.mjs [m1 m2 ...]   (default: all modules)
// For every question of a module: renders it in a real browser at 360px, answers it through the UI once correctly
// (expects green feedback) and once wrongly in a fresh profile (expects red feedback), then checks mistakes + flashcards.
import { createRequire } from 'node:module';
import { createServer } from '../../tools/serve.mjs';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = createRequire('/home/claude/.npm-global/lib/node_modules/')('playwright'); }
const server = createServer(); await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}/`;
const browser = await pw.chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox'] });
const wanted = process.argv.slice(2).length ? process.argv.slice(2) : ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9'];
let failures = 0; const errors = [];
const check = (name, ok, extra = '') => { if (!ok) failures++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + extra}`); };

async function fresh() {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto(base); await page.waitForSelector('.hero');
  await page.evaluate(() => window.__app.store.set('anim', false)); // speed only; layout is identical
  return { ctx, page };
}
const startAll = async (page, ids) => { await page.evaluate((ids) => { const a = window.__app; a.session = { id: 'chk' + Math.random(), mode: 'module', title: 'check', ids, i: 0, res: [], streak: 0, best: 0, xp: 0, started: Date.now(), secs: 0 }; a.go('/quiz'); }, ids); await page.waitForSelector('.qcard'); };

// answers the current question through the UI; returns {id, overflow, verdict}
const act = (page, correct) => page.evaluate((correct) => {
  const app = window.__app, s = app.session, q = app.data.qIndex.get(s.ids[s.i]), $$ = (x) => [...document.querySelectorAll(x)];
  const overflow = document.documentElement.scrollWidth > innerWidth + 1 || document.querySelector('.qcard').scrollWidth > document.querySelector('.qcard').clientWidth + 1;
  const optBy = (t) => $$('.opt').find((b) => b.querySelector('.t').textContent === t);
  if (q.kind === 'choice') optBy(correct ? q.options[q.answer] : q.options.find((o, i) => i !== q.answer)).click();
  else if (q.kind === 'multi') { q.answer.forEach((i) => optBy(q.options[i]).click()); if (!correct) optBy(q.options.find((o, i) => !q.answer.includes(i))).click(); document.querySelector('.qfoot .btn').click(); }
  else if (q.kind === 'match') { const L = [...$$('.mcol')[0].children], R = [...$$('.mcol')[1].children], n = q.pairs.length; q.pairs.forEach((p, i) => { L[i].click(); R.find((b) => b.firstChild.textContent === q.pairs[correct ? i : (i + 1) % n][1]).click(); }); document.querySelector('.qfoot .btn').click(); }
  else { const inp = document.querySelector('.fill input'); inp.value = correct ? q.accept[q.accept.length - 1] : 'zzz not an answer'; inp.dispatchEvent(new Event('input')); document.querySelector('.qfoot .btn').click(); }
  const fb = document.querySelector('.fb');
  const verdict = fb ? (fb.classList.contains('good') ? 'good' : fb.classList.contains('bad') ? 'bad' : '?') : 'none';
  const hasExplanation = !!(fb && (fb.querySelector('.exp') || fb.textContent.length > 20));
  document.querySelector('.qfoot .btn')?.click(); // Next / Finish
  return { id: q.id, overflow, verdict, hasExplanation };
}, correct);

for (const m of wanted) {
  const t0 = Date.now();
  console.log(`\n=== ${m}`);
  const { ctx, page } = await fresh();
  const info = await page.evaluate((m) => { const d = window.__app.data; return { n: d.byModule.get(m).length, topics: d.moduleMap.get(m).topics.length, ids: d.byModule.get(m).map((q) => q.id), withQs: d.moduleMap.get(m).topics.filter((t) => d.byTopic.get(t.id).length).length }; }, m);
  // module card + module page + "Quiz this module" through the real UI
  const cardText = await page.locator('.mod').nth(+m.slice(1) - 1).innerText();
  check(`dashboard card shows 0/${info.n} tried`, cardText.includes(`0/${info.n}`), cardText.replace(/\n/g, ' '));
  await page.locator('.mod').nth(+m.slice(1) - 1).click(); await page.waitForSelector('.topic-row');
  check(`module page lists all ${info.topics} topics, ${info.withQs} with questions`, (await page.locator('.topic-row').count()) === info.topics && info.withQs === info.topics);
  await page.getByRole('button', { name: 'Quiz this module' }).click(); await page.waitForSelector('.qcard');
  const sess = await page.evaluate(() => window.__app.session.ids);
  check('"Quiz this module" serves 10 questions, all from this module', sess.length === 10 && sess.every((i) => i.startsWith(m + '-')), JSON.stringify(sess));
  await page.evaluate(() => { window.confirm = () => true; document.querySelector('.qbar .icon-btn').click(); });
  // pass 1: every question answered correctly
  await page.evaluate(() => window.__app.go('/')); await page.waitForSelector('.hero');
  await startAll(page, info.ids);
  const bad = [], over = [], noexp = [];
  for (let i = 0; i < info.n; i++) { const r = await act(page, true); if (r.verdict !== 'good') bad.push(r.id + ':' + r.verdict); if (r.overflow) over.push(r.id); if (!r.hasExplanation) noexp.push(r.id); }
  await page.waitForSelector('.results');
  const st1 = await page.evaluate(() => { const s = window.__app.store.getState(); return { att: s.att, ok: s.ok, bad: s.bad, quizzes: s.quizzes.length }; });
  check(`all ${info.n} questions render and accept their keyed answer (green feedback)`, bad.length === 0, bad.slice(0, 5).join(', '));
  check('no text overflow on a 360px phone for any question', over.length === 0, over.slice(0, 5).join(', '));
  check('every answer shows feedback with an explanation', noexp.length === 0, noexp.slice(0, 5).join(', '));
  check('scoring recorded locally for every answer', st1.att === info.n && st1.ok === info.n && st1.bad === 0 && st1.quizzes === 1, JSON.stringify(st1));
  const pct = await page.locator('.ring b').innerText();
  check('results screen shows 100%', pct.trim() === '100%', pct);
  // flashcards for this module
  await page.evaluate((m) => { window.__app.flashCfg = { module: m, n: 5 }; window.__app.go('/flash'); }, m); await page.waitForSelector('.fcard');
  await page.locator('.fcard').click(); await page.waitForSelector('.fcard.back');
  check('flashcards open and flip for this module', true);
  await ctx.close();
  // pass 2 (fresh profile): every question answered wrongly
  const f2 = await fresh();
  await startAll(f2.page, info.ids);
  const notRed = [];
  for (let i = 0; i < info.n; i++) { const r = await act(f2.page, false); if (r.verdict !== 'bad') notRed.push(r.id + ':' + r.verdict); }
  await f2.page.waitForSelector('.results');
  check(`a wrong response to each of the ${info.n} questions is marked wrong (red feedback)`, notRed.length === 0, notRed.slice(0, 5).join(', '));
  await f2.page.evaluate(() => window.__app.go('/mistakes')); await f2.page.waitForSelector('.mist');
  const nm = await f2.page.locator('.mist').count();
  check(`My Mistakes lists all ${info.n} missed questions`, nm === info.n, 'got ' + nm);
  await f2.page.evaluate(() => { window.__app.studyCfg = { mode: 'mistakes' }; });
  await f2.ctx.close();
  console.log(`  (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}
check('no console errors or uncaught exceptions', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close(); server.close();
console.log(failures ? `\nFAILED: ${failures} check(s)` : '\nALL MODULE BROWSER CHECKS PASSED');
process.exit(failures ? 1 : 0);
