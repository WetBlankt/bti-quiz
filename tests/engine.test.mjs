import './_setup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildState, applyEvent, emptyState, masteryOf, levelInfo, attemptXp, quizXp, streakBonus, dayStreaks, INTERVALS, evalAchievements, groupStats, moduleStatus, XP } from '../js/engine.js';
import { mulberry32, shuffle } from '../js/util.js';

let n = 0;
const att = (q, ok, ts, extra = {}) => ({ id: 'e' + ++n, ts, t: 'att', q, m: 'm1', tp: 'm1-t1', ok: ok ? 1 : 0, xp: ok ? 10 : 0, sk: ok ? 1 : 0, ...extra });
const DAY = 864e5, T0 = Date.UTC(2026, 0, 10, 12);

test('mastery ladder 0-5 and reset on a wrong answer', () => {
  const ev = [att('q', true, T0), att('q', true, T0 + 1), att('q', true, T0 + 2), att('q', true, T0 + 3), att('q', true, T0 + 4)];
  const seen = [];
  const st = emptyState();
  seen.push(masteryOf(st.q.q));
  for (const e of ev) { applyEvent(st, e); seen.push(st.q.q.mastery); }
  assert.deepEqual(seen, [0, 2, 3, 4, 5, 5]);
  applyEvent(st, att('q', false, T0 + 5));
  assert.equal(st.q.q.mastery, 1);
  assert.equal(st.q.q.c, 0);
  assert.equal(st.q.q.bad, 1);
});
test('spaced repetition: wrong -> soon, correct -> growing intervals', () => {
  const st = emptyState();
  applyEvent(st, att('q', false, T0));
  assert.equal(st.q.q.due, T0 + INTERVALS[0]);
  applyEvent(st, att('q', true, T0 + 1000));
  assert.equal(st.q.q.due, T0 + 1000 + INTERVALS[1]);
  for (let i = 0; i < 6; i++) applyEvent(st, att('q', true, T0 + 2000 + i));
  assert.equal(st.q.q.due, T0 + 2005 + INTERVALS[4]); // capped: mastered still returns, just rarely
});
test('XP rules', () => {
  assert.equal(attemptXp({ ok: false, sk: 0, mode: 'quick' }), 0);
  assert.equal(attemptXp({ ok: true, sk: 1, mode: 'quick' }), 10);
  assert.equal(attemptXp({ ok: true, sk: 3, mode: 'quick' }), 12);
  assert.equal(attemptXp({ ok: true, sk: 30, mode: 'quick' }), 10 + XP.streakCap);
  assert.equal(attemptXp({ ok: true, sk: 1, mode: 'mistakes' }), 15);
  assert.equal(quizXp({ total: 10, correct: 10 }), 40);
  assert.equal(quizXp({ total: 10, correct: 7 }), 30);
  assert.equal(quizXp({ total: 10, correct: 3 }), 20);
  assert.equal(quizXp({ total: 3, correct: 3 }), 0); // no farming with tiny quizzes
  assert.equal(streakBonus(2), 0);
});
test('levels', () => {
  assert.equal(levelInfo(0).name, 'Barterer');
  assert.equal(levelInfo(100).level, 2);
  assert.equal(levelInfo(299).name, 'Apprentice');
  const top = levelInfo(99999); assert.equal(top.name, 'Master'); assert.equal(top.next, null);
});
test('state is order-independent and idempotent per id (determinism for sync)', () => {
  const rng = mulberry32(7);
  const ev = [];
  for (let i = 0; i < 300; i++) ev.push(att('q' + (i % 17), rng() > 0.4, T0 + i * 1000));
  const a = buildState(ev), b = buildState(shuffle(ev, rng));
  assert.equal(a.xp, b.xp);
  assert.deepEqual(a.q, b.q);
  assert.equal(a.best, b.best);
});
test('reset scopes: module reset only wipes that module; later events survive', () => {
  const ev = [
    att('a', true, T0), att('b', true, T0 + 1, { m: 'm2' }),
    { id: 'r1', ts: T0 + 10, t: 'rs', s: 'm1' },
    att('a', false, T0 + 20),
  ];
  const st = buildState(ev);
  assert.equal(st.q.a.n, 1);        // only the post-reset attempt
  assert.equal(st.q.b.n, 1);        // m2 untouched
  const st2 = buildState([...ev, { id: 'r2', ts: T0 + 30, t: 'rs', s: 'all' }]);
  assert.equal(st2.att, 0); assert.equal(st2.xp, 0); assert.equal(Object.keys(st2.q).length, 0);
});
test('day streaks', () => {
  const k = (d) => new Date(T0 + d * DAY).toISOString().slice(0, 10);
  const days = new Set([k(0), k(1), k(2), k(5), k(6)]);
  assert.deepEqual(dayStreaks(days, k(6)), { current: 2, best: 3 });
  assert.deepEqual(dayStreaks(days, k(7)), { current: 2, best: 3 });  // yesterday still counts
  assert.deepEqual(dayStreaks(days, k(9)), { current: 0, best: 3 });
});
test('achievements + module status', () => {
  const st = emptyState();
  assert.deepEqual(evalAchievements(st, { moduleIds: ['m1'] }), []);
  applyEvent(st, { id: 'x', ts: T0, t: 'qz', mode: 'quick', n: 10, c: 10, xp: 40 });
  applyEvent(st, att('q1', true, T0 + 1, { sk: 10 }));
  const got = evalAchievements(st, { moduleIds: ['m1'] });
  assert.ok(got.includes('first_quiz') && got.includes('streak10') && got.includes('perfect') && got.includes('all_modules'));
  assert.ok(!evalAchievements(st, { moduleIds: ['m1', 'm2'] }).includes('all_modules'));
  const qs = [{ id: 'a' }, { id: 'b' }];
  assert.equal(moduleStatus(groupStats(st, [])), 'empty');
  assert.equal(moduleStatus(groupStats(st, qs)), 'new');
  applyEvent(st, att('a', true, T0 + 2));
  assert.equal(moduleStatus(groupStats(st, qs)), 'progress');
  for (const q of ['a', 'b']) for (let i = 0; i < 2; i++) applyEvent(st, att(q, true, T0 + 10 + i));
  assert.equal(moduleStatus(groupStats(st, qs)), 'done');
});
