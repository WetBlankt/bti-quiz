// Real-browser end-to-end test (Chromium via Playwright). Run: npm run e2e
// Needs playwright (npm i -D playwright && npx playwright install chromium). In this sandbox set PW_CHROMIUM to the browser binary.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer } from '../../tools/serve.mjs';
import { startMock } from '../mock-supabase.mjs';

const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = createRequire('/home/claude/.npm-global/lib/node_modules/')('playwright'); }
const SHOTS = process.env.SHOTS || '/tmp/shots';
fs.mkdirSync(SHOTS, { recursive: true });

const results = [];
const check = (name, cond, extra = '') => { results.push([cond, name, extra]); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  ' + extra}`); };

const server = createServer();
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}/`;
const mock = await startMock();
const browser = await pw.chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });

const errors = [];
function watch(page, tag) {
  page.on('pageerror', (e) => errors.push(`${tag} pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errors.push(`${tag} console: ${m.text()}`); });
}
const st = (page) => page.evaluate(() => { const s = window.__app.store.getState(); return { xp: s.xp, att: s.att, ok: s.ok, bad: s.bad, best: s.best, q: Object.keys(s.q).length, quizzes: s.quizzes.length, ach: Object.keys(s.ach) }; });
const settle = (page, ms = 150) => page.waitForTimeout(ms);

async function answer(page, correct = true) {
  return page.evaluate((correct) => {
    const app = window.__app, s = app.session, q = app.data.qIndex.get(s.ids[s.i]);
    const $$ = (sel) => [...document.querySelectorAll(sel)];
    const optBy = (t) => $$('.opt').find((b) => b.querySelector('.t').textContent === t);
    if (q.kind === 'choice') optBy(correct ? q.options[q.answer] : q.options.find((o, i) => i !== q.answer)).click();
    else if (q.kind === 'multi') {
      q.answer.forEach((i) => optBy(q.options[i]).click());
      if (!correct) optBy(q.options.find((o, i) => !q.answer.includes(i))).click();
      document.querySelector('.qfoot .btn').click();
    } else if (q.kind === 'match') {
      const L = [...$$('.mcol')[0].children], R = [...$$('.mcol')[1].children], n = q.pairs.length;
      q.pairs.forEach((p, i) => { L[i].click(); const ri = correct ? i : (i + 1) % n; R.find((b) => b.firstChild.textContent === q.pairs[ri][1]).click(); });
      document.querySelector('.qfoot .btn').click();
    } else {
      const inp = document.querySelector('.fill input'); inp.value = correct ? q.accept[0] : 'zzz'; inp.dispatchEvent(new Event('input'));
      document.querySelector('.qfoot .btn').click();
    }
    return { id: q.id, kind: q.kind };
  }, correct);
}
const clickNext = (page) => page.evaluate(() => document.querySelector('.qfoot .btn').click());

async function runQuiz(page, n, wrongEvery = 0) {
  if (n === 'all') n = await page.evaluate(() => window.__app.session.ids.length - window.__app.session.i);
  const outcomes = [];
  for (let i = 0; i < n; i++) {
    const ok = !(wrongEvery && i % wrongEvery === wrongEvery - 1);
    const { kind } = await answer(page, ok);
    await settle(page, 30);
    const cls = await page.evaluate(() => document.querySelector('.fb')?.className || '');
    outcomes.push([kind, ok, cls.includes('good'), cls.includes('bad')]);
    await clickNext(page);
    await settle(page, 30);
  }
  return outcomes;
}

let page;
try {
  // ============ 1. First load, dashboard, mobile layout
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  page = await phone.newPage(); watch(page, 'phone');
  await page.goto(base); await page.waitForSelector('.hero');
  await page.evaluate(() => navigator.serviceWorker.ready);
  check('dashboard renders with 9 module cards', (await page.locator('.mod').count()) === 9);
  check('dark theme is the default', (await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark');
  const cardTxt = await page.evaluate(() => [...document.querySelectorAll('.mod')].map((m) => m.innerText));
  const sizes = await page.evaluate(() => window.__app.data.modules.map((m) => window.__app.data.byModule.get(m.id).length));
  check('every module card shows its own question count', cardTxt.every((t, i) => t.includes(`0/${sizes[i]}`)), JSON.stringify(sizes));
  check('no horizontal overflow on phone home', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.screenshot({ path: `${SHOTS}/01-home-phone.png`, fullPage: false });
  await page.screenshot({ path: `${SHOTS}/01b-home-phone-full.png`, fullPage: true });

  // ============ 2. Quick quiz, mixed right/wrong, every question type exercised
  await page.getByText('Quick quiz', { exact: true }).first().click();
  await page.waitForSelector('.qcard');
  check('quiz opens with a question and bottom nav hidden', (await page.locator('#nav').isHidden()));
  await page.screenshot({ path: `${SHOTS}/02-quiz-phone.png` });
  const out = await runQuiz(page, 10, 3);
  check('every right answer shows green, every wrong one red', out.every(([, ok, good, bad]) => (ok ? good && !bad : bad && !good)), JSON.stringify(out));
  await page.waitForSelector('.results');
  const s1 = await st(page);
  check('score/XP/attempts recorded locally', s1.att === 10 && s1.xp > 0 && s1.ok === 7 && s1.bad === 3, JSON.stringify(s1));
  check('quiz completion recorded + first-quiz achievement', s1.quizzes === 1 && s1.ach.includes('first_quiz'));
  await page.screenshot({ path: `${SHOTS}/03-results-phone.png`, fullPage: true });

  // ============ 3. Persistence across reload
  await page.reload(); await page.waitForSelector('.hero');
  const s2 = await st(page);
  check('progress survives reload (IndexedDB)', s2.xp === s1.xp && s2.att === 10 && s2.q === s1.q, JSON.stringify([s1, s2]));

  // ============ 4. Mistakes
  await page.goto(base + '#/mistakes'); await page.waitForSelector('.mist');
  const nMist = await page.locator('.mist').count();
  check('wrong answers appear in My Mistakes', nMist === 3, 'got ' + nMist);
  await page.locator('.mist summary').first().click();
  check('mistake shows my answer, correct answer and explanation', (await page.locator('.mist .cmp').first().innerText()).includes('Correct answer'));
  await page.screenshot({ path: `${SHOTS}/04-mistakes-phone.png` });
  await page.getByRole('button', { name: /Practise my mistakes/ }).click(); await page.waitForSelector('.qcard');
  const mq = await page.evaluate(() => window.__app.session.ids.length);
  check('Practise My Mistakes builds a quiz from them', mq === 3 && (await page.evaluate(() => window.__app.session.mode)) === 'mistakes');
  const beforeFix = await st(page);
  await runQuiz(page, 3, 0); await page.waitForSelector('.results');
  const afterFix = await st(page);
  check('mistake review gives bonus XP (>= 15 per correct)', afterFix.xp - beforeFix.xp >= 45, `${afterFix.xp - beforeFix.xp}`);
  await page.evaluate(() => window.__app.go('/'));

  // ============ 5. Settings: fast mode, sounds, themes
  await page.goto(base + '#/settings'); await page.waitForSelector('.setrow');
  check('no horizontal overflow on phone settings', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.getByRole('switch', { name: 'Fast mode' }).click();
  check('fast mode toggles the document class and disables animations', await page.evaluate(() => document.documentElement.classList.contains('fast') && !document.documentElement.classList.contains('anim')));
  await page.selectOption('select[aria-label="Correct answer sound"]', 'coin');
  await page.selectOption('select[aria-label="Incorrect answer sound"]', 'thud');
  await page.selectOption('select[aria-label="Achievement sound"]', 'tada');
  const sp = await page.evaluate(() => { const s = window.__app.store; return [s.get('sCorrect'), s.get('sWrong'), s.get('sAch'), s.get('fast')]; });
  check('sound choices saved', JSON.stringify(sp) === JSON.stringify(['coin', 'thud', 'tada', true]), JSON.stringify(sp));
  await page.screenshot({ path: `${SHOTS}/05-settings-phone.png`, fullPage: true });
  // sound: count scheduled oscillators with sound on vs off
  await page.evaluate(() => { window.__osc = 0; const AC = window.AudioContext; const orig = AC.prototype.createOscillator; AC.prototype.createOscillator = function () { window.__osc++; return orig.call(this); }; });
  await page.evaluate(() => window.__app.sound.play('correct'));
  const oscOn = await page.evaluate(() => window.__osc);
  await page.getByRole('switch', { name: 'Sound effects' }).click();
  await page.evaluate(() => { window.__osc = 0; window.__app.sound.play('correct'); window.__app.sound.play('wrong'); window.__app.sound.play('ach'); });
  const oscOff = await page.evaluate(() => window.__osc);
  check('sound plays when on and is completely silent when off', oscOn > 0 && oscOff === 0, `${oscOn}/${oscOff}`);
  await page.getByRole('switch', { name: 'Sound effects' }).click();

  // fast mode quiz: correct answers auto-advance
  await page.goto(base + '#/'); await page.waitForSelector('.hero');
  await page.getByText('Quick quiz', { exact: true }).first().click(); await page.waitForSelector('.qcard');
  const i0 = await page.evaluate(() => window.__app.session.i);
  await answer(page, true); await page.waitForTimeout(900);
  const i1 = await page.evaluate(() => window.__app.session?.i);
  check('fast mode auto-advances after a correct answer', i1 === i0 + 1, `${i0}->${i1}`);
  await page.evaluate(() => { const b = document.querySelector('.qicon-btn') || document.querySelector('.qbar .icon-btn'); window.confirm = () => true; b.click(); });
  await page.getByRole('switch').first().waitFor({ state: 'detached' }).catch(() => {});

  // ============ 6. Flashcards
  await page.goto(base + '#/'); await page.waitForSelector('.hero');
  await page.evaluate(() => window.__app.store.set('fast', false));
  await page.getByText('Flashcards', { exact: true }).first().click(); await page.waitForSelector('.fcard');
  await page.screenshot({ path: `${SHOTS}/06-flash-front.png` });
  await page.locator('.fcard').click(); await page.waitForSelector('.fcard.back');
  await page.screenshot({ path: `${SHOTS}/06b-flash-back.png` });
  await page.getByRole('button', { name: 'Got it' }).click();
  await page.locator('.fcard').click(); await page.getByRole('button', { name: 'Again' }).click();
  const fl = await page.evaluate(() => Object.values(window.__app.store.getState().flash).map((f) => f.st));
  check('flashcard status recorded (known / review)', fl.includes('know') && fl.includes('learn'), JSON.stringify(fl));

  // ============ 7. Study setup: module / topic / filters / exam
  await page.goto(base + '#/study'); await page.waitForSelector('.act');
  await page.getByRole('button', { name: /Topic quiz/ }).click();
  await page.selectOption('select[aria-label="Topic"]', 'm1-t3');
  await page.getByRole('button', { name: /^Start/ }).click(); await page.waitForSelector('.qcard');
  const ids = await page.evaluate(() => window.__app.session.ids);
  const t3n = await page.evaluate(() => window.__app.data.byTopic.get('m1-t3').length);
  check('topic quiz only serves that topic', ids.length === Math.min(10, t3n) && ids.every((i) => i.startsWith('m1-t3-')), JSON.stringify(ids));
  await page.evaluate(() => { window.confirm = () => true; document.querySelector('.qbar .icon-btn').click(); });
  await page.goto(base + '#/study'); await page.waitForSelector('.act');
  await page.getByRole('button', { name: /Quick quiz/ }).click();
  await page.locator('summary', { hasText: 'Filters' }).click();
  await page.getByRole('button', { name: 'Hard', exact: true }).click();
  await page.getByRole('button', { name: 'Fill the blank', exact: true }).click();
  const poolTxt = await page.locator('.card .muted.small').first().innerText();
  check('difficulty + type filters narrow the pool', /^\d+ questions? match/.test(poolTxt) && !/^50 /.test(poolTxt), poolTxt);
  await page.getByRole('button', { name: 'Any', exact: true }).nth(0).click(); await page.getByRole('button', { name: 'Any', exact: true }).nth(1).click();
  await page.getByRole('button', { name: /Exam mode/ }).click();
  await page.getByRole('button', { name: '5', exact: true }).click();
  await page.getByRole('button', { name: /^Start/ }).click(); await page.waitForSelector('.qcard');
  check('exam mode shows a countdown timer', await page.locator('.qchip', { hasText: '⏱' }).count() === 1);
  let fbSeen = false;
  for (let i = 0; i < 5; i++) {
    const { kind } = await answer(page, i !== 1); await settle(page, 30);
    if (await page.locator('.fb').count()) fbSeen = true;
    if (kind === 'choice') await clickNext(page);   // other kinds already pressed the exam "Next" button
    await settle(page, 30);
  }
  await page.waitForSelector('.results');
  check('exam mode gives no per-question feedback, results only at the end', !fbSeen);
  const ex = await st(page);
  await page.screenshot({ path: `${SHOTS}/07-exam-results.png`, fullPage: true });

  // ============ 8. Search
  await page.goto(base + '#/search'); await page.waitForSelector('input[type=search]');
  await page.fill('input[type=search]', 'hoarding'); await settle(page, 400);
  const sTxt = await page.locator('#view').innerText();
  check('search shows topics, questions and flashcards', /Topics \(/.test(sTxt) && /Questions \(/.test(sTxt) && /Flashcards \(/.test(sTxt));
  await page.screenshot({ path: `${SHOTS}/08-search.png` });

  // ============ 9. Stats + module pages
  await page.goto(base + '#/stats'); await page.waitForSelector('.chart');
  check('stats page renders overall, modules, topics, history, achievements', (await page.locator('#view').innerText()).includes('Achievements') && (await page.locator('.tr').count()) > 15);
  check('no horizontal overflow on phone stats', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.screenshot({ path: `${SHOTS}/09-stats-phone.png`, fullPage: true });
  await page.goto(base + '#/module/m1'); await page.waitForSelector('.topic-row');
  check('module page lists all 10 topics of module 1', (await page.locator('.topic-row').count()) === 10);
  await page.goto(base + '#/module/m4'); await page.waitForSelector('.topic-row');
  check('modules without questions still show their syllabus topics (11 for module 4)', (await page.locator('.topic-row').count()) === 11);
  await page.screenshot({ path: `${SHOTS}/10-module-phone.png`, fullPage: true });

  // ============ 10. Offline: reload with network cut, quiz still works, progress kept
  await page.goto(base + '#/'); await page.waitForSelector('.hero');
  const before = await st(page);
  await phone.setOffline(true);
  await page.reload(); await page.waitForSelector('.hero');
  check('app loads from cache while offline', true);
  check('offline banner shown', (await page.locator('.netbar').innerText()).includes('Offline'));
  await page.getByText('Quick quiz', { exact: true }).first().click(); await page.waitForSelector('.qcard');
  await runQuiz(page, 'all', 0); await page.waitForSelector('.results');
  const off = await st(page);
  check('quiz, scoring, XP and mistakes work offline', off.att === before.att + 10 && off.xp > before.xp, JSON.stringify([before, off]));
  await page.screenshot({ path: `${SHOTS}/11-offline-results.png` });
  await phone.setOffline(false);
  await page.reload(); await page.waitForSelector('.hero');
  check('offline progress is still there after coming back online', (await st(page)).att === off.att);

  // ============ 11. Desktop layout
  const desk = await browser.newContext({ viewport: { width: 1366, height: 800 } });
  const dp = await desk.newPage(); watch(dp, 'desktop');
  await dp.goto(base); await dp.waitForSelector('.hero');
  check('desktop uses sidebar navigation', await dp.evaluate(() => getComputedStyle(document.querySelector('#nav')).position === 'fixed' && document.querySelector('#nav').getBoundingClientRect().width > 200));
  await dp.screenshot({ path: `${SHOTS}/12-home-desktop.png`, fullPage: true });
  await dp.getByText('Quick quiz', { exact: true }).first().click(); await dp.waitForSelector('.qcard');
  await dp.screenshot({ path: `${SHOTS}/13-quiz-desktop.png` });
  for (let k = 0; k < 8; k++) { // keyboard shortcuts apply to choice questions: advance to one
    const kind = await dp.evaluate(() => { const a = window.__app; return a.data.qIndex.get(a.session.ids[a.session.i]).kind; });
    if (kind === 'choice') break;
    await answer(dp, true); await settle(dp, 30); await clickNext(dp); await settle(dp, 30);
  }
  const idx0 = await dp.evaluate(() => window.__app.session.i);
  await dp.keyboard.press('1'); await dp.waitForSelector('.fb');
  check('keyboard: pressing 1-4 picks an answer on desktop', true);
  await dp.keyboard.press('Enter'); await dp.waitForTimeout(100);
  check('keyboard: Enter moves to the next question', (await dp.evaluate(() => window.__app.session.i)) === idx0 + 1);
  await desk.close();

  // narrow phone (360 px) overflow check on quiz
  const tiny = await browser.newContext({ viewport: { width: 360, height: 700 } });
  const tp = await tiny.newPage(); watch(tp, 'tiny');
  await tp.goto(base); await tp.waitForSelector('.hero');
  await tp.evaluate(() => window.__app.go('/study')); await tp.waitForSelector('.act');
  await tp.getByRole('button', { name: /Quick quiz/ }).click(); await tp.getByRole('button', { name: /^Start/ }).click(); await tp.waitForSelector('.qcard');
  check('no horizontal overflow on a 360px quiz', await tp.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await tiny.close();

  // ============ 12. Cross-device sync in a real browser (two separate profiles, mock Supabase)
  const cfg = `export const CONFIG = { SUPABASE_URL: '${mock.url}', SUPABASE_ANON_KEY: 'anon' };`;
  const mk = async (name, vp) => { const c = await browser.newContext({ viewport: vp, serviceWorkers: 'block' }); await c.route('**/js/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: cfg })); const p = await c.newPage(); watch(p, name); return { c, p }; };
  const laptop = await mk('laptop', { width: 1280, height: 800 }), mobile = await mk('mobile', { width: 390, height: 844 });
  for (const d of [laptop, mobile]) {
    await d.p.goto(base + '#/settings'); await d.p.waitForSelector('input[type=email]');
    await d.p.fill('input[type=email]', 'student@example.com');
    await d.p.getByRole('button', { name: 'Email me a sign-in code' }).click(); await d.p.waitForSelector('input[aria-label=Code]:not(.hidden)');
    if (d === laptop) {
      // answer 6 questions on the laptop first, then sign in -> they upload
    }
    await d.p.fill('input[aria-label=Code]', '123456'); await d.p.getByRole('button', { name: 'Sign in' }).click();
    await d.p.waitForFunction(() => window.__app.sync.info.status === 'synced', null, { timeout: 8000 });
    if (d === laptop) {
      await d.p.evaluate(() => window.__app.go('/')); await d.p.getByText('Quick quiz', { exact: true }).first().click(); await d.p.waitForSelector('.qcard');
      await runQuiz(d.p, 'all', 3); await d.p.waitForSelector('.results');
      await d.p.evaluate(() => window.__app.sync.sync()); await d.p.waitForFunction(() => window.__app.store.unsynced().length === 0);
    }
  }
  const L = await st(laptop.p);
  await mobile.p.evaluate(() => window.__app.sync.sync({ force: true }));
  await mobile.p.waitForFunction(() => window.__app.store.getState().att >= 10, null, { timeout: 8000 });
  const M = await st(mobile.p);
  check('laptop progress appears on the phone (XP, answers, mistakes, quiz history)', M.xp === L.xp && M.att === L.att && M.bad === L.bad && M.quizzes === 1, JSON.stringify([L, M]));
  await mobile.p.goto(base + '#/mistakes'); await mobile.p.waitForSelector('.mist');
  check('mistakes made on the laptop show up on the phone', (await mobile.p.locator('.mist').count()) === L.bad);
  await mobile.p.screenshot({ path: `${SHOTS}/14-synced-phone.png` });
  // phone answers offline, then reconnects: laptop gets it
  await mobile.c.setOffline(true);
  await mobile.p.evaluate(() => window.__app.go('/')); await mobile.p.getByText('Quick quiz', { exact: true }).first().click(); await mobile.p.waitForSelector('.qcard');
  await runQuiz(mobile.p, 'all', 0); await mobile.p.waitForSelector('.results');
  check('phone keeps answering while offline', (await st(mobile.p)).att === L.att + 10);
  await mobile.c.setOffline(false);
  await mobile.p.evaluate(() => window.__app.sync.sync());
  await mobile.p.waitForFunction(() => window.__app.store.unsynced().length === 0, null, { timeout: 8000 });
  await laptop.p.evaluate(() => window.__app.sync.sync());
  await laptop.p.waitForFunction(() => window.__app.store.getState().att >= 20, null, { timeout: 8000 });
  const L2 = await st(laptop.p), M2 = await st(mobile.p);
  check('after reconnecting, both devices converge to identical progress', L2.xp === M2.xp && L2.att === M2.att && L2.quizzes === M2.quizzes, JSON.stringify([L2, M2]));
  await laptop.c.close(); await mobile.c.close();

  // ============ 13. Resume after refresh, and resets
  const rs = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const rp = await rs.newPage(); watch(rp, 'resume'); rp.on('dialog', (d) => d.accept());
  await rp.goto(base); await rp.waitForSelector('.hero');
  await rp.getByText('Quick quiz', { exact: true }).first().click(); await rp.waitForSelector('.qcard');
  await runQuiz(rp, 3, 0);
  await rp.reload(); await rp.waitForSelector('.qcard');
  check('refreshing mid-quiz resumes at the same question with the score kept', (await rp.evaluate(() => [window.__app.session.i, window.__app.session.res.length])).join() === '3,3');
  await rp.evaluate(() => window.__app.go('/')); await rp.waitForSelector('.hero');
  check('leaving a quiz midway offers Resume on the dashboard', (await rp.locator('.resume').count()) === 1);
  await rp.getByRole('button', { name: 'Resume' }).click(); await rp.waitForSelector('.qcard');
  check('Resume continues from question 4', (await rp.evaluate(() => window.__app.session.i)) === 3);
  await runQuiz(rp, 'all', 0); await rp.waitForSelector('.results');
  const full = await st(rp);
  check('resumed quiz completes and totals 10 answers', full.att === 10 && full.quizzes === 1, JSON.stringify(full));
  await rp.goto(base + '#/settings'); await rp.waitForSelector('.setrow');
  const m1Answers = await rp.evaluate(() => Object.values(window.__app.store.getState().q).filter((q) => q.m === 'm1').reduce((n, q) => n + q.n, 0));
  await rp.locator('select[aria-label="Module to reset"]').selectOption('m1');
  await rp.getByRole('button', { name: 'Reset', exact: true }).click(); await settle(rp, 200);
  const afterMod = await st(rp);
  const m1Left = await rp.evaluate(() => Object.values(window.__app.store.getState().q).filter((q) => q.m === 'm1').length);
  check('reset module progress clears only that module (other modules keep their answers)', m1Left === 0 && afterMod.att === full.att - m1Answers, JSON.stringify([full.att, m1Answers, afterMod]));
  await rp.getByRole('button', { name: 'Reset all', exact: true }).click(); await settle(rp, 200);
  const afterAll = await st(rp);
  check('reset all progress clears XP, quizzes and achievements', afterAll.xp === 0 && afterAll.quizzes === 0 && afterAll.ach.length === 0, JSON.stringify(afterAll));
  await rs.close();

  check('no console errors or uncaught exceptions anywhere', errors.length === 0, errors.join(' | '));
} catch (e) {
  check('e2e run completed without throwing', false, e.stack || String(e));
  try { await page.screenshot({ path: `${SHOTS}/FAIL.png` }); console.log('state at failure:', await page.evaluate(() => JSON.stringify({ hash: location.hash, session: window.__app.session && { i: window.__app.session.i, n: window.__app.session.ids.length, mode: window.__app.session.mode }, body: document.querySelector('#view').innerText.slice(0, 300) }))); } catch {}
} finally {
  await browser.close(); server.close(); mock.close();
}
const failed = results.filter((r) => !r[0]);
console.log(`\n${results.length - failed.length}/${results.length} checks passed. Screenshots in ${SHOTS}`);
process.exit(failed.length ? 1 : 0);
