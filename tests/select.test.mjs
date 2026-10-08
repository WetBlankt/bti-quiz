import { loadTestData } from './_setup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { selectQuestions, weightOf, filterPool, matchesStatus, weakTopics } from '../js/select.js';
import { buildState } from '../js/engine.js';
import { mulberry32 } from '../js/util.js';

const data = loadTestData();
const NOW = Date.UTC(2026, 0, 10, 12);
let n = 0;
const att = (q, ok, ts) => { const x = data.qIndex.get(q); return { id: 'a' + ++n, ts, t: 'att', q, m: x.module, tp: x.topic, ok: ok ? 1 : 0, xp: 0, sk: 0 }; };

test('quick quiz returns n distinct questions', () => {
  const { items } = selectQuestions({ data, state: buildState([]), n: 20, now: NOW, rng: mulberry32(1) });
  assert.equal(items.length, 20);
  assert.equal(new Set(items.map((q) => q.id)).size, 20);
});
test('n is capped by pool size; empty pool is fine', () => {
  assert.equal(selectQuestions({ data, state: buildState([]), n: 100000, now: NOW }).items.length, data.questions.length);
  assert.equal(selectQuestions({ data, state: buildState([]), filters: { topics: ['no-such-topic'] }, n: 10, now: NOW }).items.length, 0);
});
test('filters: module, topic, difficulty, type, status', () => {
  const st = buildState([att('m1-t1-q001', false, NOW - 5000), att('m1-t1-q002', true, NOW - 4000)]);
  assert.equal(filterPool(data, { modules: ['m1'] }, st).length, data.byModule.get('m1').length);
  assert.equal(filterPool(data, { topics: ['m1-t3'] }, st).length, data.byTopic.get('m1-t3').length);
  assert.ok(filterPool(data, { difficulty: 'hard' }, st).every((q) => q.difficulty === 'hard'));
  assert.ok(filterPool(data, { types: ['fill'] }, st).every((q) => q.type === 'fill'));
  assert.deepEqual(filterPool(data, { status: 'incorrect' }, st).map((q) => q.id), ['m1-t1-q001']);
  assert.equal(filterPool(data, { status: 'new' }, st).length, data.questions.length - 2);
});
test('adaptive: wrong answers come up far more often than mastered ones, but mastered never vanish', () => {
  const ev = [att('m1-t1-q001', false, NOW - 1e6), att('m1-t1-q001', false, NOW - 9e5)];
  for (let i = 0; i < 5; i++) ev.push(att('m1-t1-q002', true, NOW - 8e5 + i * 1000)); // mastered
  const st = buildState(ev);
  assert.equal(st.q['m1-t1-q002'].mastery, 5);
  const rng = mulberry32(42);
  const cnt = { wrong: 0, mastered: 0 };
  for (let i = 0; i < 600; i++) {
    const ids = selectQuestions({ data, state: st, filters: { topics: ['m1-t1'] }, n: 5, now: NOW, rng }).items.map((q) => q.id);
    if (ids.includes('m1-t1-q001')) cnt.wrong++;
    if (ids.includes('m1-t1-q002')) cnt.mastered++;
  }
  assert.ok(cnt.wrong > cnt.mastered * 2.5, JSON.stringify(cnt));
  assert.ok(cnt.mastered > 0, 'mastered questions must still return for retention');
  assert.ok(weightOf(st.q['m1-t1-q001'], NOW) > weightOf(undefined, NOW));
});
test('spaced repetition: due questions outweigh not-yet-due ones', () => {
  const ev = [att('m1-t1-q003', true, NOW - 1000), att('m1-t1-q003', true, NOW - 900)]; // mastery 3, due in 3 days
  const s = buildState(ev).q['m1-t1-q003'];
  assert.ok(weightOf(s, NOW + 4 * 864e5) > weightOf(s, NOW) * 2);
});
test('mistakes mode only serves previously-wrong questions; mastered mistakes drop out', () => {
  const ev = [att('m1-t1-q001', false, NOW - 5000), att('m1-t2-q007', false, NOW - 4000)];
  for (let i = 0; i < 5; i++) ev.push(att('m1-t2-q007', true, NOW - 3000 + i)); // fixed & mastered
  const { items } = selectQuestions({ data, state: buildState(ev), mode: 'mistakes', n: 10, now: NOW });
  assert.deepEqual(items.map((q) => q.id), ['m1-t1-q001']);
});
test('weak mode targets weak topics; with no history it falls back with a note', () => {
  const ev = [att('m1-t3-q011', false, NOW - 5000), att('m1-t3-q012', false, NOW - 4000), att('m1-t4-q018', true, NOW - 3000)];
  const st = buildState(ev);
  assert.equal(weakTopics(data, st)[0], 'm1-t3');
  const { items } = selectQuestions({ data, state: st, mode: 'weak', n: 5, now: NOW });
  assert.ok(items.some((q) => q.topic === 'm1-t3'));
  const none = selectQuestions({ data, state: buildState([]), mode: 'weak', n: 5, now: NOW });
  assert.ok(none.note && none.items.length === 5);
});
test('explicit ids (retry / search quiz)', () => {
  const { items } = selectQuestions({ data, state: buildState([]), ids: ['m1-t1-q001', 'nope', 'm1-t1-q002'] });
  assert.equal(items.length, 2);
});
test('status predicate edge cases', () => {
  assert.ok(matchesStatus(undefined, 'new'));
  assert.ok(!matchesStatus(undefined, 'weak'));
  assert.ok(matchesStatus(undefined, undefined));
});
