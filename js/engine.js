// Deterministic progress engine. Progress = fold over an append-only event log.
// Same events (any order, any device) => same state. This is what makes sync safe.
import { dayKey, addDays } from './util.js';

export const XP = {
  correct: 10, mistakeBonus: 5, streakStep: 3, streakPer: 2, streakCap: 10,
  quizBase: 20, quizGood: 10, quizGreat: 20, minQuizForBonus: 5,
  module: 150, achievement: 25,
};

export const LEVELS = [
  { name: 'Barterer', xp: 0 }, { name: 'Apprentice', xp: 100 }, { name: 'Trader', xp: 300 },
  { name: 'Guild Member', xp: 650 }, { name: 'Analyst', xp: 1100 }, { name: 'Shreshthi', xp: 1800 },
  { name: 'Expert', xp: 2800 }, { name: 'Master', xp: 4200 },
];
export const MASTERY = ['New', 'Seen', 'Learning', 'Familiar', 'Strong', 'Mastered'];

const MIN = 60e3, DAY = 864e5;
export const INTERVALS = [10 * MIN, 1 * DAY, 3 * DAY, 7 * DAY, 21 * DAY]; // by consecutive-correct count (0 = just got it wrong)

export const streakBonus = (sk) => Math.min(XP.streakCap, XP.streakPer * Math.floor(sk / XP.streakStep));
export function attemptXp({ ok, sk, mode }) {
  if (!ok) return 0;
  let xp = XP.correct + streakBonus(sk);
  if (mode === 'mistakes' || mode === 'retry') xp += XP.mistakeBonus;
  return xp;
}
export function quizXp({ total, correct }) {
  if (total < XP.minQuizForBonus) return 0;
  const p = correct / total;
  return XP.quizBase + (p >= 0.9 ? XP.quizGreat : p >= 0.7 ? XP.quizGood : 0);
}

export function levelInfo(xp) {
  let i = 0;
  for (let k = 0; k < LEVELS.length; k++) if (xp >= LEVELS[k].xp) i = k;
  const cur = LEVELS[i], nxt = LEVELS[i + 1] || null;
  return {
    level: i + 1, name: cur.name, xp, floor: cur.xp, next: nxt ? nxt.xp : null, nextName: nxt?.name || null,
    pct: nxt ? Math.round((100 * (xp - cur.xp)) / (nxt.xp - cur.xp)) : 100,
  };
}

// 0 new, 1 seen (last answer wrong), 2 correct once, 3 repeatedly (2 in a row), 4 strong (3), 5 mastered (4+)
export function masteryOf(s) {
  if (!s || !s.n) return 0;
  return s.c <= 0 ? 1 : Math.min(5, s.c + 1);
}

export const emptyState = () => ({
  xp: 0, att: 0, ok: 0, bad: 0, best: 0, q: {}, quizzes: [], flash: {}, ach: {}, done: {},
  days: new Set(), daily: {}, last: 0, events: 0,
});

export const cmpEvent = (a, b) => a.ts - b.ts || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function applyEvent(st, e) {
  st.events++;
  if (e.ts > st.last) st.last = e.ts;
  switch (e.t) {
    case 'att': {
      const s = (st.q[e.q] ||= { n: 0, ok: 0, bad: 0, c: 0, last: 0, due: 0, mastery: 0, lw: null, m: e.m, tp: e.tp });
      s.n++; s.last = e.ts;
      if (e.ok) { s.ok++; s.c++; st.ok++; } else { s.bad++; s.c = 0; s.lw = { ts: e.ts, a: e.a }; st.bad++; }
      s.mastery = masteryOf(s);
      s.due = e.ts + INTERVALS[Math.min(s.c, INTERVALS.length - 1)];
      st.att++; st.xp += e.xp || 0;
      if ((e.sk || 0) > st.best) st.best = e.sk;
      const dk = dayKey(e.ts);
      st.days.add(dk);
      const d = (st.daily[dk] ||= [0, 0]); d[0]++; if (e.ok) d[1]++;
      break;
    }
    case 'qz': st.quizzes.push(e); st.xp += e.xp || 0; st.days.add(dayKey(e.ts)); break;
    case 'fl': st.flash[e.c] = { st: e.st, ts: e.ts, m: e.m, tp: e.tp }; st.days.add(dayKey(e.ts)); break;
    case 'mc': st.done[e.m] = e.ts; st.xp += e.xp || 0; break;
    case 'ach': st.ach[e.a] = e.ts; st.xp += e.xp || 0; break;
  }
}

// A reset event kills earlier events in its scope ('all' or a module id). Later events survive.
export function buildState(events) {
  const list = events.slice().sort(cmpEvent);
  const resets = list.filter((e) => e.t === 'rs');
  const st = emptyState();
  for (const e of list) {
    if (e.t === 'rs') { st.events++; if (e.ts > st.last) st.last = e.ts; continue; }
    let dead = false;
    for (const r of resets) {
      if (cmpEvent(e, r) < 0 && (r.s === 'all' || (e.m && e.m === r.s))) { dead = true; break; }
    }
    if (!dead) applyEvent(st, e);
  }
  return st;
}

export function dayStreaks(days, todayKey = dayKey(Date.now())) {
  const keys = [...days].sort();
  let best = 0, run = 0, prev = null;
  for (const k of keys) {
    run = prev && addDays(prev, 1) === k ? run + 1 : 1;
    if (run > best) best = run;
    prev = k;
  }
  let cur = 0, k = days.has(todayKey) ? todayKey : addDays(todayKey, -1);
  while (days.has(k)) { cur++; k = addDays(k, -1); }
  return { current: cur, best };
}

export function groupStats(state, qs) {
  const counts = [0, 0, 0, 0, 0, 0];
  let n = 0, ok = 0, bad = 0, attempted = 0, msum = 0, m3 = 0;
  for (const q of qs) {
    const s = state.q[q.id];
    const m = s ? s.mastery : 0;
    counts[m]++; msum += m; if (m >= 3) m3++;
    if (s && s.n) { attempted++; n += s.n; ok += s.ok; bad += s.bad; }
  }
  return {
    total: qs.length, attempted, remaining: qs.length - attempted, n, ok, bad,
    acc: n ? ok / n : null, mastery: qs.length ? msum / (5 * qs.length) : 0, m3, counts,
  };
}
// module "completed" = at least 80% of its questions are at mastery >= 3 (correct twice in a row)
export function moduleStatus(g) {
  if (!g.total) return 'empty';
  if (g.m3 / g.total >= 0.8) return 'done';
  return g.attempted ? 'progress' : 'new';
}

export const ACHIEVEMENTS = [
  { id: 'first_quiz', icon: '🎯', name: 'First Quiz', desc: 'Complete your first quiz', test: (s) => s.quizzes.length >= 1 },
  { id: 'streak10', icon: '🔥', name: '10 in a Row', desc: 'Answer 10 correctly in a row', test: (s) => s.best >= 10 },
  { id: 'streak25', icon: '⚡', name: '25 in a Row', desc: 'Answer 25 correctly in a row', test: (s) => s.best >= 25 },
  { id: 'q100', icon: '💯', name: '100 Answered', desc: 'Answer 100 questions', test: (s) => s.att >= 100 },
  { id: 'q500', icon: '📚', name: '500 Answered', desc: 'Answer 500 questions', test: (s) => s.att >= 500 },
  { id: 'acc90', icon: '🏹', name: 'Sharpshooter', desc: '90% accuracy over at least 50 answers', test: (s) => s.att >= 50 && s.ok / s.att >= 0.9 },
  { id: 'perfect', icon: '🌟', name: 'Flawless', desc: '100% on a quiz of 10+ questions', test: (s) => s.quizzes.some((q) => q.n >= 10 && q.c === q.n) },
  { id: 'exam_ace', icon: '🎓', name: 'Exam Ace', desc: 'Score 80%+ in an Exam Mode quiz of 20+ questions', test: (s) => s.quizzes.some((q) => q.mode === 'exam' && q.n >= 20 && q.c / q.n >= 0.8) },
  { id: 'module_done', icon: '🏆', name: 'Module Completed', desc: 'Complete any module', test: (s) => Object.keys(s.done).length >= 1 },
  { id: 'weak_defeated', icon: '🛡️', name: 'Weak Area Defeated', desc: 'Master a question you once got wrong twice', test: (s) => Object.values(s.q).some((q) => q.bad >= 2 && q.c >= 3) },
  { id: 'mastered10', icon: '🧠', name: 'Memory Palace', desc: 'Master 10 questions', test: (s) => Object.values(s.q).filter((q) => q.mastery >= 5).length >= 10 },
  { id: 'day3', icon: '📅', name: '3-Day Streak', desc: 'Study 3 days in a row', test: (s) => dayStreaks(s.days).best >= 3 },
  { id: 'day7', icon: '🔥', name: '7-Day Streak', desc: 'Study 7 days in a row', test: (s) => dayStreaks(s.days).best >= 7 },
  {
    id: 'all_modules', icon: '🧭', name: 'All Modules Attempted', desc: 'Attempt a question from every module',
    test: (s, c) => c.moduleIds.length > 0 && c.moduleIds.every((m) => Object.values(s.q).some((q) => q.m === m && q.n > 0)),
  },
];
export const evalAchievements = (state, ctx) => ACHIEVEMENTS.filter((a) => a.test(state, ctx)).map((a) => a.id);
