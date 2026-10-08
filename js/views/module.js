import { h, bar } from '../dom.js';
import { startQuiz } from './quiz.js';
import { moduleSummary, topicSummary, accText, STATUS } from './helpers.js';

export default function moduleView(ctx, [id]) {
  const { data } = ctx, m = data.moduleMap.get(id);
  if (!m) { setTimeout(() => ctx.go('/'), 0); return h('div'); }
  const { g, status } = moduleSummary(ctx, m);
  const [label, cls] = STATUS[status];
  const flash = (topic) => { ctx.flashCfg = { module: m.id, topic: topic || '', n: 20 }; ctx.go('/flash'); };
  return h('div', { class: 'page' },
    h('div', { class: 'row' }, h('button', { class: 'icon-btn', onclick: () => ctx.go('/'), 'aria-label': 'Back' }, '←'), h('span', { class: 'muted' }, `Session ${m.session}`)),
    h('header', { class: 'row', style: { alignItems: 'flex-start' } }, h('div', { style: { fontSize: '2.2rem' } }, m.icon), h('div', { class: 'grow' }, h('h1', { class: 'h1' }, `${m.n}. ${m.title}`), h('div', { class: 'row wrap', style: { marginTop: '6px' } }, h('span', { class: 'pill ' + cls }, label), h('span', { class: 'pill' }, `${m.topics.length} topics`), h('span', { class: 'pill' }, `${g.total} questions`)))),
    h('section', { class: 'card grid', style: { gap: '10px' } },
      bar(g.mastery * 100, g.mastery >= 0.6 ? 'good thick' : 'thick'),
      h('div', { class: 'kv' }, h('span', null, 'Mastery ', h('b', null, Math.round(g.mastery * 100) + '%')), h('span', null, 'Accuracy ', h('b', null, accText(g))), h('span', null, 'Tried ', h('b', null, `${g.attempted}/${g.total}`))),
      h('div', { class: 'row wrap' },
        h('button', { class: 'btn primary', disabled: !g.total, onclick: () => startQuiz(ctx, { mode: 'module', filters: { modules: [m.id] }, n: 10, title: `Module ${m.n}` }) }, 'Quiz this module'),
        h('button', { class: 'btn', onclick: () => flash('') }, 'Flashcards'),
        h('button', { class: 'btn ghost', disabled: !g.total, onclick: () => { ctx.studyCfg = { ...(ctx.studyCfg || {}), mode: 'module', module: m.id }; ctx.go('/study'); } }, 'More options'))),
    h('section', { class: 'card' }, h('h2', { class: 'h2', style: { marginBottom: '4px' } }, 'Topics'),
      m.topics.map((t, i) => {
        const tg = topicSummary(ctx, t);
        return h('div', { class: 'topic-row' },
          h('div', { class: 'grid', style: { gap: '6px' } },
            h('div', { style: { fontWeight: 700 } }, `${i + 1}. ${t.title}`),
            tg.total ? [bar(tg.mastery * 100, tg.mastery >= 0.6 ? 'good' : ''), h('div', { class: 'small muted' }, `${tg.total} questions · accuracy ${accText(tg)} · mastery ${Math.round(tg.mastery * 100)}%`)] : h('div', { class: 'small muted' }, 'No questions yet'),
            h('details', null, h('summary', { class: 'small muted' }, 'Key points from the syllabus'), h('ul', { class: 'small', style: { margin: '4px 0 0', paddingLeft: '18px', color: 'var(--text2)' } }, t.notes.map((n) => h('li', null, n))))),
          h('div', { class: 'row gap-s' }, h('button', { class: 'btn sm', disabled: !tg.total, onclick: () => startQuiz(ctx, { mode: 'topic', filters: { topics: [t.id] }, n: 10, title: t.title }) }, 'Quiz'), h('button', { class: 'btn sm ghost', onclick: () => flash(t.id) }, 'Cards')));
      })));
}
