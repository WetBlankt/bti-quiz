import { h } from '../dom.js';
import { checkAnswer, correctText, answerText } from '../check.js';
import { selectQuestions } from '../select.js';
import { shuffle, uid, fmtDuration } from '../util.js';
import { TYPE_LABEL } from '../data.js';
import { MASTERY } from '../engine.js';

const MODE_TITLE = { quick: 'Quick quiz', module: 'Module quiz', topic: 'Topic quiz', weak: 'Weak areas', mistakes: 'My mistakes', exam: 'Exam mode', retry: 'Retry missed', custom: 'Custom quiz' };
const COLORS = ['#8f7dff', '#38d6f5', '#ffb52e', '#35e3a2', '#ff8fb1', '#b5e655', '#ff9f43'];
const LETTERS = 'ABCDEF';

export function startQuiz(ctx, cfg) {
  const { data, store } = ctx;
  const sel = selectQuestions({ data, state: store.getState(), mode: cfg.mode, filters: cfg.filters || {}, n: cfg.n || 10, ids: cfg.ids });
  if (!sel.items.length) { ctx.toast(cfg.mode === 'mistakes' ? 'No mistakes to practise yet.' : 'No questions match those settings yet.'); return false; }
  const s = {
    id: uid(), mode: cfg.mode, title: cfg.title || MODE_TITLE[cfg.mode] || 'Quiz', ids: sel.items.map((q) => q.id),
    i: 0, res: [], streak: 0, best: 0, xp: 0, started: Date.now(),
    secs: cfg.mode === 'exam' ? sel.items.length * store.get('examSecs') : 0,
  };
  if (s.secs) s.endAt = s.started + s.secs * 1000;
  ctx.session = s; ctx.saveSession(s);
  if (sel.note) ctx.toast(sel.note, { ms: 3500 });
  ctx.go('/quiz');
  return true;
}
export function resumeQuiz(ctx) {
  const s = ctx.saved;
  if (!s || !s.ids?.length) return false;
  ctx.session = s; ctx.go('/quiz'); return true;
}

export default function quizView(ctx) {
  const { data, store, sound } = ctx;
  const s = ctx.session || (ctx.saved && ctx.saved.ids ? (ctx.session = ctx.saved) : null);
  if (!s) { setTimeout(() => ctx.go('/'), 0); return h('div'); }
  const items = s.ids.map((id) => data.qIndex.get(id)).filter(Boolean);
  const exam = s.mode === 'exam';
  const animOn = () => document.documentElement.classList.contains('anim');
  let q, ui, perm, answered = false, finished = false, timer = null, autoT = null, footMode = '';

  const prog = h('i');
  const count = h('span', { class: 'qchip' });
  const streakEl = h('span', { class: 'qchip fire', title: 'Correct in a row' });
  const xpEl = h('span', { class: 'qchip xp', title: 'XP this quiz' });
  const timerEl = h('span', { class: 'qchip' });
  const body = h('main', { class: 'qmain' });
  const foot = h('footer', { class: 'qfoot' });
  const footBtn = h('button', { class: 'btn primary', type: 'button' });
  foot.append(footBtn);
  const root = h('div', { class: 'quiz' },
    h('header', { class: 'qbar' }, h('button', { class: 'icon-btn', 'aria-label': 'Quit quiz', onclick: quit }, '✕'), h('div', { class: 'progress', role: 'progressbar' }, prog), count, exam ? timerEl : [streakEl, xpEl]),
    body, foot);

  function quit() {
    if (!confirm('Quit this quiz? Answers you have already given are saved.')) return;
    stopAll(); ctx.session = null; ctx.clearSession(); ctx.go('/');
  }
  function stopAll() { clearInterval(timer); clearTimeout(autoT); document.removeEventListener('keydown', onKey); }
  ctx.onLeave(stopAll);

  function head() {
    prog.style.width = (items.length ? (s.i / items.length) * 100 : 0) + '%';
    count.textContent = `${Math.min(s.i + 1, items.length)}/${items.length}`;
    streakEl.textContent = '🔥 ' + s.streak; xpEl.textContent = '⭐ ' + s.xp;
  }
  function setFoot(label, fn, { disabled = false, hidden = false, cls = 'primary' } = {}) {
    footBtn.textContent = label; footBtn.className = 'btn ' + cls; footBtn.disabled = disabled; footBtn.onclick = fn;
    foot.classList.toggle('hidden', hidden);
  }
  const lastQ = () => s.i >= items.length - 1;

  // ---------- question UIs: each returns { el, resp(), ready(), lock(), reveal(ok, resp) }
  function choiceUI() {
    let picked = null, locked = false;
    const btns = perm.map((orig, pos) => h('button', { class: 'opt', type: 'button', 'data-o': orig, onclick: () => pick(orig) }, h('span', { class: 'l' }, LETTERS[pos]), h('span', { class: 't' }, q.options[orig]), h('span', { class: 'm' })));
    function pick(orig) {
      if (locked || answered) return;
      if (exam) { picked = orig; btns.forEach((b) => b.classList.toggle('sel', +b.dataset.o === orig)); examFoot(); } else check(orig);
    }
    return {
      kind: 'choice', el: h('div', { class: 'opts', role: 'group' }, btns), pick, pos: (p) => perm[p],
      resp: () => (picked == null ? undefined : picked), ready: () => picked != null, lock: () => { locked = true; btns.forEach((b) => (b.disabled = true)); },
      reveal(ok, resp) {
        btns.forEach((b) => { const o = +b.dataset.o, m = b.querySelector('.m'); b.classList.remove('sel');
          if (o === q.answer) { b.classList.add('good'); m.textContent = '✓'; } else if (o === resp) { b.classList.add('bad'); m.textContent = '✗'; } else b.classList.add('dim'); });
      },
    };
  }
  function multiUI() {
    const chosen = new Set(); let locked = false;
    const btns = perm.map((orig, pos) => h('button', { class: 'opt', type: 'button', 'data-o': orig, onclick: () => toggle(orig) }, h('span', { class: 'l' }, LETTERS[pos]), h('span', { class: 't' }, q.options[orig]), h('span', { class: 'm' })));
    function toggle(orig) {
      if (locked) return;
      chosen.has(orig) ? chosen.delete(orig) : chosen.add(orig);
      btns.forEach((b) => b.classList.toggle('sel', chosen.has(+b.dataset.o)));
      exam ? examFoot() : setFoot('Check', () => check(ui.resp()), { disabled: !chosen.size });
    }
    return {
      kind: 'multi', el: h('div', { class: 'grid', style: { gap: '8px' } }, h('div', { class: 'hint' }, 'Select all that apply'), h('div', { class: 'opts' }, btns)), pick: toggle, pos: (p) => perm[p],
      resp: () => (chosen.size ? [...chosen].sort() : undefined), ready: () => chosen.size > 0, lock: () => { locked = true; btns.forEach((b) => (b.disabled = true)); },
      reveal() {
        btns.forEach((b) => { const o = +b.dataset.o, right = q.answer.includes(o), m = b.querySelector('.m'); b.classList.remove('sel');
          if (chosen.has(o) && right) { b.classList.add('good'); m.textContent = '✓'; } else if (chosen.has(o)) { b.classList.add('bad'); m.textContent = '✗'; } else if (right) { b.classList.add('miss'); m.textContent = '✓'; } else b.classList.add('dim'); });
      },
    };
  }
  function matchUI() {
    const n = q.pairs.length, rp = shuffle([...Array(n).keys()]), pairs = Array(n).fill(-1);
    let active = 0, locked = false;
    const L = q.pairs.map((p, i) => h('button', { class: 'mi', type: 'button', onclick: () => left(i) }, `${i + 1}. ${p[0]}`));
    const R = rp.map((j) => h('button', { class: 'mi', type: 'button', onclick: () => right(j) }, q.pairs[j][1]));
    const nextFree = (from) => { for (let k = 1; k <= n; k++) { const i = (from + k) % n; if (pairs[i] < 0) return i; } return null; };
    function paint() {
      L.forEach((b, i) => { b.classList.toggle('act', active === i && pairs[i] < 0); b.classList.toggle('paired', pairs[i] >= 0); b.style.setProperty('--c', COLORS[i]); });
      R.forEach((b, k) => { const owner = pairs.indexOf(rp[k]); b.classList.toggle('paired', owner >= 0); if (owner >= 0) b.style.setProperty('--c', COLORS[owner]); b.querySelector('.tag')?.remove(); if (owner >= 0) b.append(h('span', { class: 'tag' }, owner + 1)); });
      exam ? examFoot() : setFoot('Check', () => check(ui.resp()), { disabled: !ui.ready() });
    }
    function left(i) { if (locked) return; if (pairs[i] >= 0) pairs[i] = -1; active = i; paint(); }
    function right(j) {
      if (locked) return;
      if (active == null || pairs[active] >= 0) { active = nextFree(active ?? -1); if (active == null) return; }
      const owner = pairs.indexOf(j); if (owner >= 0) pairs[owner] = -1;
      pairs[active] = j; active = nextFree(active); paint();
    }
    return {
      kind: 'match', el: h('div', { class: 'grid', style: { gap: '8px' } }, h('div', { class: 'hint' }, 'Tap a term on the left, then its match on the right'), h('div', { class: 'match' }, h('div', { class: 'mcol' }, L), h('div', { class: 'mcol' }, R))),
      resp: () => (pairs.some((p) => p >= 0) ? pairs.slice() : undefined), ready: () => pairs.every((p) => p >= 0), lock: () => { locked = true; [...L, ...R].forEach((b) => (b.disabled = true)); },
      reveal() { L.forEach((b, i) => { b.classList.remove('act'); b.classList.add(pairs[i] === i ? 'good' : 'bad'); }); R.forEach((b, k) => { const owner = pairs.indexOf(rp[k]); b.classList.add(owner === rp[k] ? 'good' : owner >= 0 ? 'bad' : ''); }); },
      init: paint,
    };
  }
  function fillUI() {
    const input = h('input', { type: 'text', autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', placeholder: 'Type your answer', 'aria-label': 'Your answer', enterkeyhint: 'done' });
    input.addEventListener('input', () => { exam ? examFoot() : setFoot('Check', () => check(ui.resp()), { disabled: !input.value.trim() }); });
    return {
      kind: 'fill', el: h('div', { class: 'fill' }, input), resp: () => (input.value.trim() ? input.value : undefined), ready: () => !!input.value.trim(), lock: () => { input.disabled = true; },
      reveal(ok) { input.classList.add(ok ? 'good' : 'bad'); }, focus: () => setTimeout(() => input.focus({ preventScroll: true }), 0),
    };
  }

  function show() {
    clearTimeout(autoT);
    if (s.i >= items.length) return finish();
    q = items[s.i]; answered = false;
    perm = q.options ? (q.fixedOrder ? q.options.map((_, i) => i) : shuffle(q.options.map((_, i) => i))) : [];
    ui = q.kind === 'choice' ? choiceUI() : q.kind === 'multi' ? multiUI() : q.kind === 'match' ? matchUI() : fillUI();
    head();
    const m = data.moduleMap.get(q.module);
    const card = h('section', { class: 'qcard' },
      h('div', { class: 'qmeta' }, h('span', { class: 'pill violet' }, TYPE_LABEL[q.type]), h('span', { class: 'pill ' + (q.difficulty === 'hard' ? 'bad' : q.difficulty === 'easy' ? 'good' : 'gold') }, q.difficulty), h('span', { class: 'pill' }, `${m.icon} Module ${m.n}`)),
      h('div', { class: 'qtext' }, q.question), ui.el);
    body.replaceChildren(card);
    if (animOn()) card.style.animation = 'rise .22s';
    if (ui.init) ui.init();
    if (ui.focus) ui.focus();
    if (exam) examFoot();
    else if (q.kind === 'choice') setFoot('', null, { hidden: true });
    else setFoot('Check', () => check(ui.resp()), { disabled: true });
    window.scrollTo(0, 0);
  }
  function examFoot() { setFoot(ui.ready() ? (lastQ() ? 'Finish exam' : 'Next') : lastQ() ? 'Skip and finish' : 'Skip', () => examNext(), { cls: ui.ready() ? 'primary' : 'ghost' }); }

  function popXp(text) {
    if (!animOn()) return;
    const p = h('div', { class: 'pop' }, text); document.body.append(p); setTimeout(() => p.remove(), 950);
  }

  function record(resp, ok, sk) {
    const r = store.addAttempt({ q, ok, resp, mode: s.mode, qz: s.id, sk });
    s.xp += r.xp;
    s.res.push({ id: q.id, ok, resp, xp: r.xp });
    ctx.saveSession(s);
    return r;
  }

  function check(resp) { // instant, local, no network
    if (answered || resp === undefined) return;
    answered = true; ui.lock();
    const ok = checkAnswer(q, resp);
    s.streak = ok ? s.streak + 1 : 0; if (s.streak > s.best) s.best = s.streak;
    const r = record(resp, ok, s.streak);
    sound.play(ok ? 'correct' : 'wrong');
    ui.reveal(ok, resp);
    head();
    if (animOn()) { (ok ? streakEl : card()).classList.remove('bump', 'shake'); void streakEl.offsetWidth; (ok ? streakEl : card()).classList.add(ok ? 'bump' : 'shake'); }
    if (ok) popXp(`+${r.base} XP`);
    const fast = store.get('fast');
    const needsAns = q.kind !== 'choice' || false;
    const fb = h('section', { class: 'fb ' + (ok ? 'good' : 'bad'), role: 'status' },
      h('div', { class: 'h' }, h('strong', null, ok ? (s.streak >= 3 ? `Correct! ${s.streak} in a row` : 'Correct!') : 'Not quite'), ok ? h('span', { class: 'pill gold' }, `+${r.base} XP`) : h('span', { class: 'pill' }, 'Review this one')),
      (!ok && needsAns) || (ok && (q.kind === 'fill' || q.kind === 'multi')) ? h('div', { class: 'ans' }, (ok ? 'Answer: ' : 'Correct answer: ') + correctText(q)) : null,
      !(fast && ok) ? h('div', { class: 'exp' }, q.explanation) : null,
      h('div', { class: 'small muted' }, 'Topic: ' + data.topicMap.get(q.topic).title));
    body.append(fb);
    fb.scrollIntoView({ block: 'nearest', behavior: animOn() ? 'smooth' : 'auto' });
    setFoot(lastQ() ? 'Finish' : 'Next', next, { cls: ok ? 'good' : 'primary' });
    ctx.announce(r);
    if (fast && ok) autoT = setTimeout(next, 650);
  }
  const card = () => body.querySelector('.qcard') || body;
  function next() { if (!answered || finished) return; clearTimeout(autoT); s.i++; ctx.saveSession(s); show(); }

  function examNext() {
    if (answered || finished) return;
    answered = true; ui.lock();
    const resp = ui.resp();
    if (resp === undefined) s.res.push({ id: q.id, ok: false, skipped: true });
    else record(resp, checkAnswer(q, resp), 0);
    s.i++; ctx.saveSession(s); show();
  }

  function onKey(e) {
    if (finished || e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = e.target.tagName;
    if (e.key === 'Enter' || (e.key === ' ' && tag !== 'INPUT' && tag !== 'BUTTON')) {
      if (!foot.classList.contains('hidden') && !footBtn.disabled) { e.preventDefault(); footBtn.click(); }
      return;
    }
    if (tag === 'INPUT' || (answered && !exam) || !ui.pos) return;
    const k = e.key.toLowerCase(), pos = /^[1-6]$/.test(k) ? +k - 1 : 'abcdef'.indexOf(k);
    if (pos >= 0 && pos < perm.length) { e.preventDefault(); ui.pick(ui.pos(pos)); }
  }
  document.addEventListener('keydown', onKey);

  function finish() {
    if (finished) return;
    finished = true; stopAll();
    document.querySelectorAll('.pop').forEach((e) => e.remove());
    const have = new Set(s.res.map((r) => r.id));
    for (const it of items) if (!have.has(it.id)) s.res.push({ id: it.id, ok: false, skipped: true });
    const total = items.length, correct = s.res.filter((r) => r.ok).length;
    const secs = Math.round((Date.now() - s.started) / 1000);
    const r = store.addQuizComplete({ qz: s.id, mode: s.mode, total, correct, secs, mods: [...new Set(items.map((x) => x.module))] });
    s.xp += r.xp;
    ctx.session = null; ctx.clearSession();
    sound.play('done'); ctx.announce(r);
    results(total, correct, secs, r);
  }

  function results(total, correct, secs, r) {
    const p = total ? Math.round((100 * correct) / total) : 0;
    const missed = s.res.filter((x) => !x.ok);
    const answerXp = s.res.reduce((n, x) => n + (x.xp || 0), 0);
    const emoji = p === 100 ? '🏆' : p >= 80 ? '🎉' : p >= 60 ? '👍' : '💪';
    const msg = p === 100 ? 'Flawless.' : p >= 80 ? 'Strong run.' : p >= 60 ? 'Solid. A few to revisit.' : 'Good practice. The misses will come back sooner.';
    foot.classList.add('hidden');
    root.replaceChildren(h('div', { class: 'results' },
      h('div', { style: { fontSize: '2.6rem' } }, emoji), h('h1', { class: 'h1' }, `${s.title} complete`), h('p', { class: 'muted' }, msg),
      h('div', { class: 'ring', style: { '--p': p } }, h('b', null, p + '%')),
      h('div', { class: 'grid g3', style: { width: '100%' } },
        tile(`${correct}/${total}`, 'correct'), tile('+' + s.xp, 'XP earned'), tile('🔥 ' + s.best, 'best run'), tile(fmtDuration(secs), 'time')),
      h('div', { class: 'muted small' }, `Answers ${answerXp} XP` + (r.bonus ? `, completion bonus ${r.bonus} XP` : '') + (s.xp - answerXp - (r.bonus || 0) > 0 ? `, achievements & modules ${s.xp - answerXp - (r.bonus || 0)} XP` : '')),
      h('div', { class: 'row wrap', style: { justifyContent: 'center' } },
        missed.length ? h('button', { class: 'btn primary', onclick: () => startQuiz(ctx, { mode: 'retry', ids: missed.map((x) => x.id), n: missed.length }) }, `Retry ${missed.length} missed`) : null,
        h('button', { class: missed.length ? 'btn' : 'btn primary', onclick: () => ctx.go('/study') }, 'New quiz'),
        h('button', { class: 'btn ghost', onclick: () => ctx.go('/') }, 'Home')),
      missed.length ? h('div', { class: 'res-list' }, h('h2', { class: 'h2' }, 'Review'), missed.map((x) => {
        const mq = data.qIndex.get(x.id);
        return h('details', { class: 'rq' }, h('summary', null, mq.question.split('\n')[0]),
          x.skipped ? h('div', { class: 'pre' }, 'Not answered') : h('div', { class: 'pre' }, 'You: ' + answerText(mq, x.resp)),
          h('div', { class: 'pre', style: { color: 'var(--good)' } }, 'Correct: ' + correctText(mq)), h('div', { class: 'pre' }, mq.explanation));
      })) : null));
  }
  const tile = (v, l) => h('div', { class: 'tile' }, h('div', { class: 'v' }, v), h('div', { class: 'l' }, l));

  if (exam) {
    const tick = () => { const left = Math.max(0, Math.round((s.endAt - Date.now()) / 1000)); timerEl.textContent = '⏱ ' + fmtDuration(left); timerEl.classList.toggle('warn', left <= 60); if (left <= 0 && !finished) { ctx.toast("Time's up"); finish(); } };
    tick(); timer = setInterval(tick, 500);
  }
  if (s.i >= items.length) setTimeout(finish, 0); else show();
  return root;
}
