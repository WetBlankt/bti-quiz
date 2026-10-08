import { h } from '../dom.js';
import { startQuiz } from './quiz.js';
import { answerText, correctText } from '../check.js';
import { mistakeIds, masteryLabel } from './helpers.js';
import { fmtDate } from '../util.js';

let modFilter = '';
export default function mistakes(ctx) {
  const { data, store } = ctx, st = store.getState();
  const all = mistakeIds(ctx);
  const open = mistakeIds(ctx, { openOnly: true });
  const ids = all.filter((id) => !modFilter || data.qIndex.get(id).module === modFilter);
  const mods = data.modules.filter((m) => all.some((id) => data.qIndex.get(id).module === m.id));
  const chip = (label, on, fn) => h('button', { class: 'chip' + (on ? ' on' : ''), onclick: fn }, label);
  return h('div', { class: 'page' },
    h('h1', { class: 'h1' }, 'My mistakes'),
    h('section', { class: 'grid g3' }, tile(all.length, 'ever missed'), tile(open.length, 'still to fix'), tile(all.length - open.length, 'fixed and mastered')),
    h('div', { class: 'row wrap' }, h('button', { class: 'btn primary', disabled: !all.length, onclick: () => startQuiz(ctx, { mode: 'mistakes', filters: { modules: modFilter ? [modFilter] : [] }, n: 20 }) }, `Practise my mistakes${open.length ? ` (${Math.min(20, modFilter ? ids.filter((i) => st.q[i].mastery < 5).length || ids.length : open.length)})` : ''}`)),
    mods.length > 1 ? h('div', { class: 'chips' }, chip('All', !modFilter, () => { modFilter = ''; ctx.rerender(); }), mods.map((m) => chip(`${m.icon} ${m.n}`, modFilter === m.id, () => { modFilter = m.id; ctx.rerender(); }))) : null,
    !ids.length ? h('div', { class: 'empty card' }, all.length ? 'No mistakes in this module.' : 'Nothing here yet. Every question you get wrong is saved here with its explanation, and comes back until you have mastered it.') :
      h('div', { class: 'grid', style: { gap: '10px' } }, ids.map((id) => {
        const q = data.qIndex.get(id), s = st.q[id], m = data.moduleMap.get(q.module), t = data.topicMap.get(q.topic);
        return h('details', { class: 'mist' },
          h('summary', null, h('div', { class: 'q' }, q.question.split('\n')[0]), h('div', { class: 'row wrap', style: { marginTop: '6px' } }, h('span', { class: 'pill' }, `${m.icon} ${t.title}`), h('span', { class: 'pill bad' }, `wrong ×${s.bad}`), h('span', { class: 'pill ' + (s.mastery >= 4 ? 'good' : 'gold') }, masteryLabel(s.mastery)))),
          h('div', { class: 'cmp' },
            h('div', { class: 'you pre' }, 'Your last wrong answer: ' + (s.lw ? answerText(q, s.lw.a) : '—')),
            h('div', { class: 'right pre' }, 'Correct answer: ' + correctText(q)),
            h('div', { class: 'pre', style: { color: 'var(--text2)' } }, q.explanation),
            h('div', { class: 'small muted' }, `Right ${s.ok} · wrong ${s.bad} · last attempt ${fmtDate(s.last)}`)));
      })));
}
const tile = (v, l) => h('div', { class: 'tile' }, h('div', { class: 'v' }, v), h('div', { class: 'l' }, l));
