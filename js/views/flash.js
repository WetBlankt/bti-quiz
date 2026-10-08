import { h, bar } from '../dom.js';
import { shuffle } from '../util.js';

export default function flashView(ctx) {
  const { data, store } = ctx;
  const cfg = ctx.flashCfg || { n: 20 };
  const st = store.getState();
  let cards = data.cards.filter((c) => (!cfg.module || c.module === cfg.module) && (!cfg.topic || c.topic === cfg.topic));
  const stOf = (c) => st.flash[c.id]?.st;
  const learn = shuffle(cards.filter((c) => stOf(c) === 'learn')), fresh = shuffle(cards.filter((c) => !stOf(c))), known = shuffle(cards.filter((c) => stOf(c) === 'know'));
  cards = [...learn, ...fresh, ...known];
  if (cfg.n) cards = cards.slice(0, cfg.n);
  let i = 0, flipped = false, again = 0, got = 0;
  const root = h('div', { class: 'quiz' });
  const done = new Set();

  function rate(kind) {
    const c = cards[i]; store.addFlash(c, kind);
    kind === 'know' ? got++ : again++;
    i++; flipped = false; draw();
  }
  function flip() { flipped = true; draw(); }
  function onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey || i >= cards.length) return;
    if (!flipped && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); flip(); }
    else if (flipped && (e.key === '1' || e.key === 'ArrowLeft')) rate('learn');
    else if (flipped && (e.key === '2' || e.key === 'ArrowRight' || e.key === 'Enter')) rate('know');
  }
  document.addEventListener('keydown', onKey);
  ctx.onLeave(() => document.removeEventListener('keydown', onKey));

  function draw() {
    if (!cards.length) return root.replaceChildren(h('div', { class: 'page' }, h('div', { class: 'empty card' }, 'No flashcards in this selection yet.'), h('button', { class: 'btn', onclick: () => ctx.go('/study') }, 'Back')));
    if (i >= cards.length) {
      return root.replaceChildren(h('div', { class: 'results' }, h('div', { style: { fontSize: '2.6rem' } }, '🃏'), h('h1', { class: 'h1' }, 'Deck finished'),
        h('div', { class: 'grid g2', style: { width: '100%', maxWidth: '420px' } }, h('div', { class: 'tile' }, h('div', { class: 'v' }, got), h('div', { class: 'l' }, 'got it')), h('div', { class: 'tile' }, h('div', { class: 'v' }, again), h('div', { class: 'l' }, 'to review again'))),
        h('div', { class: 'row wrap', style: { justifyContent: 'center' } }, again ? h('button', { class: 'btn primary', onclick: () => { ctx.flashCfg = { ...cfg }; ctx.rerender(); } }, 'Another round') : null, h('button', { class: again ? 'btn' : 'btn primary', onclick: () => ctx.go('/study') }, 'Study menu'), h('button', { class: 'btn ghost', onclick: () => ctx.go('/') }, 'Home'))));
    }
    const c = cards[i], m = data.moduleMap.get(c.module), t = data.topicMap.get(c.topic), status = stOf(c);
    const face = h('button', { class: 'fcard' + (flipped ? ' back' : ''), type: 'button', onclick: () => !flipped && flip(), 'aria-label': flipped ? 'Answer' : 'Question. Tap to reveal the answer' },
      h('div', null, flipped ? c.back : c.front, flipped && c.extra ? h('span', { class: 'x' }, c.extra) : null, !flipped ? h('span', { class: 'tapnote' }, 'Tap to reveal') : null));
    if (document.documentElement.classList.contains('anim')) face.style.animation = 'flip .25s';
    root.replaceChildren(
      h('header', { class: 'qbar' }, h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: () => ctx.go('/study') }, '✕'), h('div', { class: 'progress' }, h('i', { style: { width: (i / cards.length) * 100 + '%' } })), h('span', { class: 'qchip' }, `${i + 1}/${cards.length}`)),
      h('main', { class: 'fc-wrap' }, h('div', { class: 'qmeta' }, h('span', { class: 'pill' }, flipped ? `${m.icon} ${t.title}` : `${m.icon} Module ${m.n}`), status ? h('span', { class: 'pill ' + (status === 'know' ? 'good' : 'bad') }, status === 'know' ? 'known' : 'reviewing') : h('span', { class: 'pill violet' }, 'new')), face),
      h('footer', { class: 'qfoot' }, flipped ? h('div', { class: 'row', style: { maxWidth: '760px', margin: '0 auto' } }, h('button', { class: 'btn bad grow', onclick: () => rate('learn') }, 'Again'), h('button', { class: 'btn good grow', onclick: () => rate('know') }, 'Got it')) : h('button', { class: 'btn primary', onclick: flip }, 'Show answer')));
  }
  draw();
  return root;
}
