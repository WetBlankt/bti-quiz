import { groupStats, moduleStatus, MASTERY } from '../engine.js';

export const moduleSummary = (ctx, m) => {
  const g = groupStats(ctx.store.getState(), ctx.data.byModule.get(m.id) || []);
  return { g, status: moduleStatus(g) };
};
export const topicSummary = (ctx, t) => groupStats(ctx.store.getState(), ctx.data.byTopic.get(t.id) || []);
export function weakestTopics(ctx, m, k = 2) {
  const rows = [];
  for (const t of m.topics) {
    const g = topicSummary(ctx, t);
    if (g.n > 0) rows.push({ t, g, score: g.acc * 0.6 + g.mastery * 0.4 });
  }
  return rows.sort((a, b) => a.score - b.score).slice(0, k);
}
// questions answered wrong at least once (and still in the bank), weakest first
export function mistakeIds(ctx, { openOnly = false } = {}) {
  const st = ctx.store.getState();
  return Object.entries(st.q)
    .filter(([id, s]) => s.bad > 0 && ctx.data.qIndex.has(id) && (!openOnly || s.mastery < 5))
    .sort((a, b) => a[1].mastery - b[1].mastery || b[1].last - a[1].last)
    .map(([id]) => id);
}
export const accText = (g) => (g.acc == null ? '–' : Math.round(g.acc * 100) + '%');
export const STATUS = { done: ['Completed ✓', 'good'], progress: ['In progress', 'violet'], new: ['Not started', ''], empty: ['Questions coming', ''] };
export const masteryLabel = (m) => MASTERY[m];
