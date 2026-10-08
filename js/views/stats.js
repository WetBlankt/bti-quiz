import { h, bar } from '../dom.js';
import { dayStreaks, groupStats, ACHIEVEMENTS, MASTERY } from '../engine.js';
import { dayKey, addDays, fmtDate, fmtDuration } from '../util.js';
import { accText } from './helpers.js';

export default function stats(ctx) {
  const { data, store } = ctx, st = store.getState();
  const ds = dayStreaks(st.days);
  const g = groupStats(st, data.questions);
  const avgQuiz = st.quizzes.length ? Math.round((100 * st.quizzes.reduce((n, q) => n + q.c / q.n, 0)) / st.quizzes.length) : null;
  const known = Object.values(st.flash).filter((f) => f.st === 'know').length;

  const today = dayKey(Date.now());
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13));
  const mx = Math.max(5, ...days.map((d) => st.daily[d]?.[0] || 0));
  const chart = h('div', null, h('div', { class: 'chart', role: 'img', 'aria-label': 'Answers per day, last 14 days' }, days.map((d) => {
    const [n = 0, ok = 0] = st.daily[d] || [];
    return h('div', { class: 'col', title: `${d}: ${ok}/${n} correct` }, h('div', { class: 'seg-bad', style: { height: ((n - ok) / mx) * 100 + '%' } }), h('div', { class: 'seg-ok', style: { height: (ok / mx) * 100 + '%' } }));
  })), h('div', { class: 'chart', style: { height: 'auto', paddingTop: 0 } }, days.map((d, i) => h('div', { class: 'col' }, h('div', { class: 'lab' }, i % 2 === 0 ? d.slice(8) : '')))));

  const dist = h('div', { class: 'grid', style: { gap: '8px' } },
    h('div', { class: 'stack', role: 'img', 'aria-label': 'Mastery distribution' }, g.counts.map((c, i) => h('i', { class: 'm' + i, style: { width: g.total ? (c / g.total) * 100 + '%' : 0 } }))),
    h('div', { class: 'row wrap small' }, g.counts.map((c, i) => h('span', { class: 'row gap-s' }, h('span', { class: 'sync-dot', style: { background: ['#4a557f', 'var(--bad)', 'var(--gold-d)', 'var(--gold)', 'var(--cyan)', 'var(--good)'][i] } }), `${MASTERY[i]} ${c}`))));

  const modRows = data.modules.map((m) => { const mg = groupStats(st, data.byModule.get(m.id) || []); return h('div', { class: 'tr' }, h('div', null, `${m.icon} ${m.n}. ${m.short}`), h('div', { class: 'grid', style: { gap: '4px' } }, bar(mg.acc == null ? 0 : mg.acc * 100, 'good'), h('span', { class: 'small muted' }, accText(mg))), h('div', { class: 'grid', style: { gap: '4px' } }, bar(mg.mastery * 100), h('span', { class: 'small muted' }, Math.round(mg.mastery * 100) + '%')), h('div', { class: 'small' }, `${mg.attempted}/${mg.total}`)); });

  const topicBlocks = data.modules.filter((m) => (data.byModule.get(m.id) || []).length).map((m) => h('details', { open: true },
    h('summary', null, `${m.icon} ${m.n}. ${m.short}`),
    h('div', { class: 'tbl' }, h('div', { class: 'tr th' }, h('div', null, 'Topic'), h('div', null, 'Accuracy'), h('div', null, 'Mastery'), h('div', null, 'Tried')),
      m.topics.filter((t) => data.byTopic.get(t.id).length).map((t) => { const tg = groupStats(st, data.byTopic.get(t.id)); return h('div', { class: 'tr' }, h('div', null, t.title), h('div', { class: 'grid', style: { gap: '4px' } }, bar(tg.acc == null ? 0 : tg.acc * 100, 'good'), h('span', { class: 'small muted' }, accText(tg))), h('div', { class: 'grid', style: { gap: '4px' } }, bar(tg.mastery * 100), h('span', { class: 'small muted' }, Math.round(tg.mastery * 100) + '%')), h('div', { class: 'small' }, `${tg.attempted}/${tg.total}`)); }))));

  const hist = st.quizzes.slice().sort((a, b) => b.ts - a.ts).slice(0, 12);
  return h('div', { class: 'page' },
    h('h1', { class: 'h1' }, 'Statistics'),
    h('section', { class: 'grid g3' },
      tile(st.att ? Math.round((100 * st.ok) / st.att) + '%' : '–', 'accuracy'), tile(st.att, 'answers given'), tile(st.ok, 'correct'), tile(st.bad, 'incorrect'),
      tile(avgQuiz == null ? '–' : avgQuiz + '%', 'average quiz score'), tile(st.best, 'best run in a row'), tile(`${ds.current} / ${Math.max(ds.best, ds.current)}`, 'day streak / best'), tile(known, 'flashcards known')),
    h('section', { class: 'card' }, h('div', { class: 'sec-h' }, h('h2', { class: 'h2' }, 'Last 14 days'), h('span', { class: 'small muted' }, 'green correct, red incorrect')), chart),
    h('section', { class: 'card' }, h('h2', { class: 'h2', style: { marginBottom: '10px' } }, 'Mastery across all questions'), dist),
    h('section', { class: 'card' }, h('h2', { class: 'h2' }, 'By module'), h('div', { class: 'tbl' }, h('div', { class: 'tr th' }, h('div', null, 'Module'), h('div', null, 'Accuracy'), h('div', null, 'Mastery'), h('div', null, 'Tried')), modRows)),
    h('section', { class: 'card' }, h('h2', { class: 'h2', style: { marginBottom: '6px' } }, 'By topic'), topicBlocks.length ? topicBlocks : h('div', { class: 'muted' }, 'Topics appear here as questions are added.')),
    h('section', { class: 'card' }, h('h2', { class: 'h2', style: { marginBottom: '6px' } }, 'Quiz history'),
      hist.length ? h('div', { class: 'tbl' }, hist.map((q) => h('div', { class: 'tr', style: { gridTemplateColumns: '1fr 1fr 1fr 1fr' } }, h('div', null, fmtDate(q.ts)), h('div', null, q.mode), h('div', null, `${q.c}/${q.n} (${Math.round((100 * q.c) / q.n)}%)`), h('div', { class: 'muted' }, fmtDuration(q.secs || 0))))) : h('div', { class: 'muted' }, 'Finish a quiz and it shows up here.')),
    h('section', null, h('div', { class: 'sec-h' }, h('h2', { class: 'h2' }, 'Achievements'), h('span', { class: 'muted small' }, `${Object.keys(st.ach).length}/${ACHIEVEMENTS.length}`)),
      h('div', { class: 'grid gm' }, ACHIEVEMENTS.map((a) => h('div', { class: 'ach' + (st.ach[a.id] ? '' : ' locked') }, h('div', { class: 'ic' }, a.icon), h('div', null, h('div', { style: { fontWeight: 700 } }, a.name), h('div', { class: 'small muted' }, a.desc + (st.ach[a.id] ? ` (${fmtDate(st.ach[a.id])})` : ''))))))));
}
const tile = (v, l) => h('div', { class: 'tile' }, h('div', { class: 'v' }, v), h('div', { class: 'l' }, l));
