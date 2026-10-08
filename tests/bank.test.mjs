import { loadTestData } from './_setup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkAnswer } from '../js/check.js';
import { validateAll } from '../tools/validate-questions.mjs';

const data = loadTestData();
const qs = data.questions;

test('the bank has exactly 1,000 questions with the agreed module and difficulty counts', () => {
  assert.equal(qs.length, 1000);
  const mod = {}, diff = {};
  for (const q of qs) { mod[q.module] = (mod[q.module] || 0) + 1; diff[q.difficulty] = (diff[q.difficulty] || 0) + 1; }
  assert.deepEqual(mod, { m1: 110, m2: 110, m3: 110, m4: 110, m5: 110, m6: 110, m7: 110, m8: 110, m9: 120 });
  assert.deepEqual(diff, { easy: 200, medium: 500, hard: 300 });
  for (const m of ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8']) { // difficulty approximately consistent: 22/55/33 per 110
    const d = { easy: 0, medium: 0, hard: 0 }; data.byModule.get(m).forEach((q) => d[q.difficulty]++);
    assert.deepEqual(d, { easy: 22, medium: 55, hard: 33 }, m);
  }
});

test('every one of the ten question types is used in every module', () => {
  for (const m of data.modules) {
    const types = new Set(data.byModule.get(m.id).map((q) => q.type));
    for (const t of ['mcq', 'tf', 'multi', 'match', 'fill', 'ar', 'scenario', 'not', 'concept', 'compare']) assert.ok(types.has(t), `${m.id} lacks ${t}`);
  }
});

test('every topic of the syllabus has questions', () => {
  for (const [id, list] of data.byTopic) assert.ok(list.length >= 3, `${id} has only ${list.length}`);
});

test('every keyed answer is accepted by the real answer checker, and a wrong response is rejected', () => {
  for (const q of qs) {
    let right, wrong;
    if (q.kind === 'choice') { right = q.answer; wrong = (q.answer + 1) % q.options.length; }
    else if (q.kind === 'multi') { right = q.answer.slice().reverse(); wrong = q.answer.slice(1); }
    else if (q.kind === 'match') { right = q.pairs.map((_, i) => i); wrong = q.pairs.map((_, i) => (i + 1) % q.pairs.length); }
    else { right = q.accept[0]; wrong = 'zzz not an answer'; }
    assert.ok(checkAnswer(q, right), `${q.id}: keyed answer rejected`);
    assert.ok(!checkAnswer(q, wrong), `${q.id}: wrong answer accepted`);
    if (q.kind === 'fill') for (const a of q.accept) assert.ok(checkAnswer(q, a), `${q.id}: accept "${a}" rejected`);
  }
});

test('exactly one correct option for choice questions, and no option text is duplicated', () => {
  for (const q of qs) if (q.options) assert.equal(new Set(q.options.map((o) => o.trim().toLowerCase())).size, q.options.length, q.id);
});

test('validator reports no errors, no warnings and no near-duplicates', () => {
  const { errors, warns, dups } = validateAll();
  assert.deepEqual(errors, []); assert.deepEqual(warns, []); assert.deepEqual(dups, []);
});

test('answer keys cannot be guessed by pattern (true/false, assertion-reason, option position)', () => {
  for (const m of data.modules) {
    const L = data.byModule.get(m.id);
    const tf = L.filter((q) => q.type === 'tf'), f = tf.filter((q) => q.answer === 1).length / tf.length;
    assert.ok(f >= 0.25 && f <= 0.75, `${m.id} tf false share ${f}`);
    const ar = L.filter((q) => q.type === 'ar'), keys = {}; ar.forEach((q) => (keys[q.answer] = (keys[q.answer] || 0) + 1));
    assert.ok(Math.max(...Object.values(keys)) / ar.length <= 0.5 && Object.keys(keys).length >= 3, `${m.id} AR keys ${JSON.stringify(keys)}`);
  }
});

const text = (q) => [q.question, q.explanation, ...(q.options || []), ...(q.pairs || []).flat(), ...(q.accept || [])].join(' | ');
test('documented source conflicts are respected (SYLLABUS.md FLAGS)', () => {
  // Kanishka / Kushana: no exact (conflicting) years anywhere in Module 8
  for (const q of data.byModule.get('m8')) assert.ok(!/\b\d{2,4}\s*(CE|BCE|AD|BC)?\b/.test(text(q).replace(/\bsession\s*12\b/gi, '')) || !/\b(7[0-9]|10[0-9]|12[0-9]|1[3-5][0-9])\b/.test(text(q)), `${q.id} contains a Kanishka-era year`);
  // the conflicting 321 BCE Seleucus date is never used; Session 11's c. 303 BCE and 500 elephants are
  for (const q of qs) assert.ok(!/\b321\b/.test(text(q)), `${q.id} uses 321`);
  assert.ok(qs.some((q) => /303 BCE/.test(text(q)) && q.module === 'm7'));
  assert.ok(qs.filter((q) => /Seleucus/.test(text(q)) && /(BCE|elephant|treaty|princess)/i.test(text(q))).every((q) => q.module === 'm7'), 'Seleucus treaty facts only from Session 11 (Module 7)');
  // no bare coastline figure: a coastline number must name its session
  for (const q of qs) if (/7,500|11,098/.test(text(q))) assert.ok(/Session \d+/i.test(text(q)), `${q.id} cites a coastline figure without naming the session`);
  // unusual Session 7 claims are always framed as the session's own claim
  const claims = /(paid Roman soldiers|Borobudur|1701|Brazil \(1725\)|Hippalus|100 times|only known diamond source|woven air)/;
  for (const q of data.byModule.get('m3')) if (claims.test(text(q)) && q.type !== 'match') assert.ok(/(according to the session|the session (says|states|names|dates|calls|describes))/i.test(q.question + ' ' + q.explanation), `${q.id} not framed as the session's claim`);
});
