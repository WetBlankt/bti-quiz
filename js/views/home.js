import { h, bar } from '../dom.js';
import { levelInfo, dayStreaks } from '../engine.js';
import { startQuiz, resumeQuiz } from './quiz.js';
import { moduleSummary, weakestTopics, accText, STATUS, mistakeIds } from './helpers.js';
import { groupStats } from '../engine.js';

export default function home(ctx) {
  const { data, store } = ctx, st = store.getState();
  const lv = levelInfo(st.xp), ds = dayStreaks(st.days);
  const all = groupStats(st, data.questions);
  const acc = st.att ? Math.round((100 * st.ok) / st.att) : null;
  const open = mistakeIds(ctx, { openOnly: true }).length;

  const hero = h('section', { class: 'hero' },
    h('div', { class: 'seal', style: { '--p': lv.pct }, 'aria-label': `Level ${lv.level}` }, h('b', null, lv.level), h('small', null, 'LEVEL')),
    h('div', { class: 'grid', style: { gap: '8px' } },
      h('div', null, h('div', { class: 'name' }, lv.name), h('div', { class: 'muted' }, lv.next ? `${lv.xp.toLocaleString()} XP · ${(lv.next - lv.xp).toLocaleString()} to ${lv.nextName}` : `${lv.xp.toLocaleString()} XP · top level`)),
      bar(lv.pct, 'gold thick')),
  );
  const tiles = h('section', { class: 'grid g3' },
    tile('🔥 ' + ds.current, 'day streak', `best ${Math.max(ds.best, ds.current)}`),
    tile(acc == null ? '–' : acc + '%', 'accuracy', `${st.ok} of ${st.att} right`),
    tile(st.att.toLocaleString(), 'answered', `best run ${st.best} in a row`),
    tile(all.remaining, 'not yet seen', `of ${all.total} questions`),
  );
  const resume = ctx.saved && ctx.saved.ids ? h('section', { class: 'card resume' },
    h('div', null, h('div', { class: 'h2' }, 'Pick up where you left off'), h('div', { class: 'muted small' }, `${ctx.saved.title || 'Quiz'} · question ${Math.min(ctx.saved.i + 1, ctx.saved.ids.length)} of ${ctx.saved.ids.length}`)),
    h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => resumeQuiz(ctx) }, 'Resume'), h('button', { class: 'btn ghost sm', onclick: () => { ctx.clearSession(); ctx.rerender(); } }, 'Discard'))) : null;

  const actions = h('section', { class: 'actions' },
    act('main', '⚡', 'Quick quiz', '10 questions, whole syllabus', () => startQuiz(ctx, { mode: 'quick', n: 10 })),
    act('', '🛠️', 'Weak areas', 'Auto-picked for you', () => startQuiz(ctx, { mode: 'weak', n: 10 })),
    act('', '❌', 'My mistakes', open ? `${open} to fix` : 'None yet', () => (open ? startQuiz(ctx, { mode: 'mistakes', n: Math.min(20, open) }) : ctx.toast('No open mistakes. Answer some questions first.'))),
    act('', '🃏', 'Flashcards', 'Flip and rate', () => { ctx.flashCfg = { n: 20 }; ctx.go('/flash'); }),
    act('', '⏱️', 'Exam mode', 'Timed, no hints', () => { ctx.studyCfg = { ...(ctx.studyCfg || {}), mode: 'exam' }; ctx.go('/study'); }),
  );

  const mods = h('section', null,
    h('div', { class: 'sec-h' }, h('h2', { class: 'h2' }, 'Modules'), h('span', { class: 'muted small' }, `${data.modules.length} modules · ${data.topicMap.size} topics`)),
    h('div', { class: 'grid gm' }, data.modules.map((m) => modCard(ctx, m))));

  return h('div', { class: 'page' }, hero, resume, tiles, actions, mods);
}

const tile = (v, l, s) => h('div', { class: 'tile' }, h('div', { class: 'v' }, v), h('div', { class: 'l' }, l), h('div', { class: 'l' }, s));
const act = (cls, ic, t, s, fn) => h('button', { class: 'act ' + cls, onclick: fn }, h('span', { class: 'ic' }, ic), h('span', null, t), h('small', null, s));

function modCard(ctx, m) {
  const { g, status } = moduleSummary(ctx, m);
  const [label, cls] = STATUS[status];
  const weak = weakestTopics(ctx, m, 2);
  return h('button', { class: 'mod' + (status === 'empty' ? ' empty-mod' : ''), onclick: () => ctx.go('/module/' + m.id), 'aria-label': `Module ${m.n}: ${m.title}` },
    h('div', { class: 'top' }, h('div', { class: 'ic' }, m.icon), h('div', { class: 'grow', style: { display: 'grid', gap: '4px' } }, h('div', { class: 't' }, `${m.n}. ${m.short}`), h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('span', { class: 's' }, `Session ${m.session}, ${m.topics.length} topics`), h('span', { class: 'pill ' + cls }, label)))),
    bar(g.mastery * 100, g.mastery >= 0.6 ? 'good' : ''),
    h('div', { class: 'kv' }, h('span', null, 'Accuracy ', h('b', null, accText(g))), h('span', null, 'Mastery ', h('b', null, Math.round(g.mastery * 100) + '%')), h('span', null, h('b', null, `${g.attempted}/${g.total}`), ' tried')),
    h('div', { class: 'small muted' }, g.total ? (weak.length ? 'Weakest: ' + weak.map((w) => w.t.title).join(', ') : 'Weakest topics appear once you answer some questions') : 'No questions loaded for this module yet'),
  );
}
