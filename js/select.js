// Adaptive question selection: weighted by mastery, mistakes and spaced-repetition due dates.
import { shuffle } from './util.js';

const DAY = 864e5;

export function matchesStatus(s, f) {
  switch (f) {
    case 'new': return !s || !s.n;
    case 'incorrect': return !!s && s.n > 0 && s.c === 0 && s.bad > 0;
    case 'weak': return !!s && s.n > 0 && (s.mastery <= 2 || s.ok / s.n < 0.6);
    case 'strong': return !!s && s.mastery >= 4;
    case 'mastered': return !!s && s.mastery >= 5;
  }
  return true;
}

export function weightOf(s, now) {
  if (!s || !s.n) return 3; // unseen questions come up often enough to get introduced
  let w = [0, 6, 4, 2.5, 1.2, 0.35][s.mastery]; // mastered stays > 0: it can always come back
  w += Math.min(s.bad, 5) * 0.8; // repeat offenders
  if (now >= s.due) w += 1.5 + Math.min(3, ((now - s.due) / DAY) * 0.5); // spaced repetition: due / overdue
  else if (s.mastery >= 3) w *= 0.5; // not due yet
  return w;
}

export function pickWeighted(items, weightFn, n, rng = Math.random) {
  const pool = items.map((it) => ({ it, w: Math.max(0.0001, weightFn(it)) }));
  const out = [];
  while (out.length < n && pool.length) {
    let total = 0;
    for (const p of pool) total += p.w;
    let r = rng() * total, idx = 0;
    for (; idx < pool.length - 1; idx++) { r -= pool[idx].w; if (r <= 0) break; }
    out.push(pool[idx].it);
    pool.splice(idx, 1);
  }
  return out;
}

export function filterPool(data, f = {}, state) {
  let pool = data.questions;
  if (f.modules?.length) pool = pool.filter((q) => f.modules.includes(q.module));
  if (f.topics?.length) pool = pool.filter((q) => f.topics.includes(q.topic));
  if (f.difficulty) pool = pool.filter((q) => q.difficulty === f.difficulty);
  if (f.types?.length) pool = pool.filter((q) => f.types.includes(q.type));
  if (f.status) pool = pool.filter((q) => matchesStatus(state.q[q.id], f.status));
  return pool;
}

export function weakTopics(data, state, k = 3) {
  const rows = [];
  for (const [tid, qs] of data.byTopic) {
    let n = 0, ok = 0, ms = 0, att = 0;
    for (const q of qs) { const s = state.q[q.id]; if (s?.n) { n += s.n; ok += s.ok; att++; } ms += s ? s.mastery : 0; }
    if (att >= 1 && qs.length) rows.push({ tid, score: (1 - ms / (5 * qs.length)) * 0.6 + (1 - ok / n) * 0.4 });
  }
  return rows.sort((a, b) => b.score - a.score).slice(0, k).map((r) => r.tid);
}

export function selectQuestions({ data, state, mode = 'quick', filters = {}, n = 10, now = Date.now(), rng = Math.random, ids }) {
  let note = '';
  if (ids) return { items: shuffle(ids.map((i) => data.qIndex.get(i)).filter(Boolean), rng), note };
  let pool = filterPool(data, filters, state);
  const w = (q) => weightOf(state.q[q.id], now);
  if (mode === 'mistakes') {
    const bad = pool.filter((q) => state.q[q.id]?.bad > 0);
    const open = bad.filter((q) => state.q[q.id].mastery < 5);
    pool = open.length ? open : bad;
  } else if (mode === 'weak') {
    const wt = new Set(weakTopics(data, state));
    const cand = pool.filter((q) => wt.has(q.topic) || (state.q[q.id]?.n > 0 && state.q[q.id].mastery <= 2));
    if (cand.length) pool = cand; else note = 'Nothing weak yet - here are fresh questions.';
  } else if (mode === 'exam') {
    return { items: shuffle(pool, rng).slice(0, n), note };
  }
  return { items: shuffle(pickWeighted(pool, w, Math.min(n, pool.length), rng), rng), note };
}
