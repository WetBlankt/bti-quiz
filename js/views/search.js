import { h } from '../dom.js';
import { search } from '../data.js';
import { startQuiz } from './quiz.js';
import { correctText } from '../check.js';

let lastQuery = '';
export default function searchView(ctx) {
  const { data } = ctx;
  const input = h('input', { type: 'search', placeholder: 'Search topics, questions, flashcards, explanations', 'aria-label': 'Search', value: lastQuery, autocomplete: 'off', autocapitalize: 'off' });
  const out = h('div', { class: 'grid', style: { gap: '14px' } });
  let t;
  input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(run, 120); });
  function run() {
    lastQuery = input.value.trim();
    out.replaceChildren();
    if (!lastQuery) return out.append(h('div', { class: 'empty' }, 'Type a word like "hoarding" or "Arthashastra".'));
    const r = search(data, lastQuery);
    const total = r.topics.length + r.questions.length + r.explanations.length + r.cards.length;
    if (!total) return out.append(h('div', { class: 'empty card' }, `Nothing found for "${lastQuery}". Try a shorter word.`));
    const qids = [...r.questions, ...r.explanations].map((x) => x.id);
    if (qids.length) out.append(h('button', { class: 'btn primary', onclick: () => startQuiz(ctx, { mode: 'custom', ids: qids, n: qids.length, title: `"${lastQuery}"` }) }, `Quiz me on these ${qids.length} question${qids.length === 1 ? '' : 's'}`));
    if (r.topics.length) out.append(group('Topics', r.topics.map((x) => { const tp = data.topicMap.get(x.id), m = data.moduleMap.get(tp.module); return h('button', { class: 'mod', onclick: () => ctx.go('/module/' + m.id) }, h('div', { class: 't' }, tp.title), h('div', { class: 's' }, `${m.icon} Module ${m.n}: ${m.short}`)); })));
    const qRow = (x) => { const q = data.qIndex.get(x.id); return h('details', { class: 'mist' }, h('summary', null, h('div', { class: 'q' }, q.question.split('\n')[0])), h('div', { class: 'cmp' }, h('div', { class: 'right pre' }, 'Answer: ' + correctText(q)), h('div', { class: 'pre', style: { color: 'var(--text2)' } }, q.explanation))); };
    if (r.questions.length) out.append(group('Questions', r.questions.map(qRow)));
    if (r.explanations.length) out.append(group('Mentioned in explanations', r.explanations.map(qRow)));
    if (r.cards.length) out.append(group('Flashcards', r.cards.map((x) => { const c = data.cardIndex.get(x.id); return h('details', { class: 'mist' }, h('summary', null, h('div', { class: 'q' }, c.front)), h('div', { class: 'pre', style: { color: 'var(--text2)' } }, c.back)); })));
  }
  const group = (title, kids) => h('section', null, h('h2', { class: 'h2', style: { marginBottom: '8px' } }, `${title} (${kids.length})`), h('div', { class: 'grid', style: { gap: '8px' } }, kids));
  setTimeout(() => { run(); input.focus(); }, 0);
  return h('div', { class: 'page' }, h('h1', { class: 'h1' }, 'Search'), input, out);
}
