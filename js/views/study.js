import { h } from '../dom.js';
import { startQuiz } from './quiz.js';
import { filterPool } from '../select.js';
import { mistakeIds } from './helpers.js';
import { TYPE_LABEL, TYPES, DIFFS } from '../data.js';

const MODES = [
  ['quick', '⚡', 'Quick quiz', 'Whole syllabus'], ['module', '📚', 'Module quiz', 'One module'], ['topic', '🎯', 'Topic quiz', 'One topic'],
  ['weak', '🛠️', 'Weak areas', 'Auto-picked'], ['mistakes', '❌', 'My mistakes', 'Fix what you missed'], ['exam', '⏱️', 'Exam mode', 'Timed, no feedback'], ['flash', '🃏', 'Flashcards', 'Flip and rate'],
];
const STATUSES = [['', 'Any'], ['new', 'New'], ['incorrect', 'Incorrect'], ['weak', 'Weak'], ['strong', 'Strong'], ['mastered', 'Mastered']];

export default function study(ctx) {
  const { data, store } = ctx;
  const c = (ctx.studyCfg = Object.assign({ mode: 'quick', n: 10, module: '', topic: '', difficulty: '', type: '', status: '' }, ctx.studyCfg || {}));
  const set = (k, v) => { c[k] = v; ctx.rerender(); };
  const chip = (label, on, fn, extra) => h('button', { class: 'chip' + (on ? ' on' : ''), type: 'button', onclick: fn, 'aria-pressed': on ? 'true' : 'false', ...extra }, label);
  const withQs = data.modules.filter((m) => (data.byModule.get(m.id) || []).length);

  const needModule = ['module', 'topic', 'flash', 'exam'].includes(c.mode);
  if (c.mode === 'module' && !c.module && withQs.length) c.module = withQs[0].id;
  if (c.mode === 'topic') {
    if (!c.module && withQs.length) c.module = withQs[0].id;
    const ts = c.module ? data.moduleMap.get(c.module).topics.filter((t) => data.byTopic.get(t.id).length) : [];
    if (!ts.find((t) => t.id === c.topic)) c.topic = ts[0]?.id || '';
  }

  const modeGrid = h('div', { class: 'grid g3' }, MODES.map(([id, ic, t, s]) => h('button', { class: 'act' + (c.mode === id ? ' main' : ''), type: 'button', onclick: () => set('mode', id), 'aria-pressed': c.mode === id ? 'true' : 'false' }, h('span', { class: 'ic' }, ic), h('span', null, t), h('small', null, s))));

  const modOpts = (allLabel) => [allLabel ? h('option', { value: '' }, allLabel) : null, ...data.modules.map((m) => h('option', { value: m.id, disabled: !(data.byModule.get(m.id) || []).length && c.mode !== 'flash' }, `${m.n}. ${m.short}` + ((data.byModule.get(m.id) || []).length ? '' : ' (soon)')))];
  const modSelect = (allLabel) => { const s = h('select', { 'aria-label': 'Module', onchange: (e) => { c.module = e.target.value; c.topic = ''; ctx.rerender(); } }, modOpts(allLabel)); s.value = c.module; return s; };
  let scope = null;
  if (c.mode === 'module') scope = h('div', null, h('div', { class: 'hint' }, 'Module'), modSelect(''));
  if (c.mode === 'topic' || c.mode === 'flash') {
    const mod = c.module ? data.moduleMap.get(c.module) : null;
    const ts = mod ? mod.topics.filter((t) => c.mode === 'flash' || data.byTopic.get(t.id).length) : [];
    const tsel = h('select', { 'aria-label': 'Topic', onchange: (e) => { c.topic = e.target.value; ctx.rerender(); } }, c.mode === 'flash' ? h('option', { value: '' }, 'All topics') : null, ts.map((t) => h('option', { value: t.id }, `${t.title} (${data.byTopic.get(t.id).length})`)));
    tsel.value = c.topic;
    scope = h('div', { class: 'grid', style: { gap: '8px' } }, h('div', { class: 'hint' }, 'Module'), modSelect(c.mode === 'flash' ? 'All modules' : ''), mod ? [h('div', { class: 'hint' }, 'Topic'), tsel] : null);
  }
  if (c.mode === 'exam') scope = h('div', { class: 'grid', style: { gap: '8px' } }, h('div', { class: 'hint' }, 'Scope'), modSelect('Entire syllabus'), h('div', { class: 'hint' }, 'Time per question'), h('div', { class: 'chips' }, [40, 60, 90].map((sec) => chip(`${sec} s`, store.get('examSecs') === sec, () => { store.set('examSecs', sec); ctx.rerender(); }))));

  const counts = c.mode === 'flash' ? [10, 20, 50, 0] : [5, 10, 20, 30, 50];
  const countRow = h('div', { class: 'chips' }, counts.map((n) => chip(n ? String(n) : 'All', c.n === n, () => set('n', n))));

  const filters = ['mistakes', 'weak'].includes(c.mode) || c.mode === 'flash' ? null : h('details', { class: 'card', open: !!(c.difficulty || c.type || c.status) },
    h('summary', null, 'Filters'),
    h('div', { class: 'grid', style: { gap: '10px' } },
      h('div', { class: 'hint' }, 'Difficulty'), h('div', { class: 'chips' }, [['', 'Any'], ...DIFFS.map((d) => [d, d[0].toUpperCase() + d.slice(1)])].map(([v, l]) => chip(l, c.difficulty === v, () => set('difficulty', v)))),
      h('div', { class: 'hint' }, 'Question type'), h('div', { class: 'chips' }, [['', 'Any'], ...TYPES.map((t) => [t, TYPE_LABEL[t]])].map(([v, l]) => chip(l, c.type === v, () => set('type', v)))),
      h('div', { class: 'hint' }, 'Progress'), h('div', { class: 'chips' }, STATUSES.map(([v, l]) => chip(l, c.status === v, () => set('status', v))))));

  const filtersObj = () => ({
    modules: c.mode === 'exam' || c.mode === 'module' || c.mode === 'topic' ? (c.module ? [c.module] : []) : [],
    topics: c.mode === 'topic' && c.topic ? [c.topic] : [],
    difficulty: c.difficulty || undefined, types: c.type ? [c.type] : [], status: ['mistakes', 'weak'].includes(c.mode) ? undefined : c.status || undefined,
  });
  const st = store.getState();
  const poolSize = c.mode === 'mistakes' ? mistakeIds(ctx, { openOnly: true }).length || mistakeIds(ctx).length : filterPool(data, filtersObj(), st).length;
  const nShow = c.n ? Math.min(c.n, poolSize) : poolSize;

  function start() {
    if (c.mode === 'flash') { ctx.flashCfg = { module: c.module, topic: c.topic, n: c.n }; return ctx.go('/flash'); }
    startQuiz(ctx, { mode: c.mode, filters: filtersObj(), n: c.n });
  }
  const label = c.mode === 'flash' ? 'Start flashcards' : `Start ${MODES.find((m) => m[0] === c.mode)[2].toLowerCase()}`;
  return h('div', { class: 'page' },
    h('h1', { class: 'h1' }, 'Study'),
    modeGrid,
    h('section', { class: 'card grid', style: { gap: '14px' } }, scope, h('div', null, h('div', { class: 'hint', style: { marginBottom: '6px' } }, c.mode === 'flash' ? 'Cards' : 'Questions'), countRow),
      h('div', { class: 'muted small' }, c.mode === 'flash' ? `${data.cards.length} cards available in total` : `${poolSize} question${poolSize === 1 ? '' : 's'} match, this quiz will use ${nShow}`)),
    filters,
    h('button', { class: 'btn primary block', onclick: start, disabled: c.mode !== 'flash' && !poolSize }, label));
}
