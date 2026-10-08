import { loadTestData, rd } from './_setup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildData, normalizeQuestion, search } from '../js/data.js';
import { validateAll } from '../tools/validate-questions.mjs';

test('syllabus preserves 9 modules and the 91 topics parsed from SYLLABUS.md', () => {
  const s = rd('data/syllabus.json');
  assert.equal(s.modules.length, 9);
  assert.equal(s.modules.reduce((n, m) => n + m.topics.length, 0), 91);
  assert.ok(s.modules.every((m) => m.topics.every((t) => t.id.startsWith(m.id + '-') && t.title && t.notes.length)));
});
test('shipped question bank validates with no errors', () => {
  const { errors, summary } = validateAll();
  assert.deepEqual(errors, []);
  assert.ok(summary.questions >= 50);
  for (const t of ['mcq', 'tf', 'multi', 'match', 'fill', 'ar', 'scenario', 'not', 'concept', 'compare']) assert.ok(summary.types[t] > 0, 'missing type ' + t);
});
test('normalizer rejects bad questions', () => {
  const data = loadTestData();
  const ok = { id: 'm1-t1-q900', topic: 'm1-t1', type: 'mcq', question: 'Q?', explanation: 'E', options: ['a', 'b'], answer: 1 };
  assert.ok(normalizeQuestion(ok, data.topicMap).q);
  const bad = (patch) => assert.ok(normalizeQuestion({ ...ok, ...patch }, data.topicMap).error, JSON.stringify(patch));
  bad({ answer: 5 }); bad({ topic: 'm1-t99' }); bad({ type: 'essay' }); bad({ options: ['only'] }); bad({ module: 'm2' }); bad({ explanation: '' });
  assert.ok(normalizeQuestion({ ...ok, type: 'tf', options: undefined, answer: false }, data.topicMap).q.answer === 1);
});
test('duplicate ids are rejected', () => {
  const s = rd('data/syllabus.json');
  const q = { id: 'm1-t1-q001', topic: 'm1-t1', type: 'tf', question: 'x', explanation: 'y', answer: true };
  assert.equal(buildData(s, [{ questions: [q, q] }]).errors.length, 1);
});
test('search finds topics, questions, explanations and flashcards', () => {
  const data = loadTestData();
  const r = search(data, 'hoarding');
  assert.ok(r.topics.some((t) => t.id === 'm1-t7'));
  assert.ok(r.questions.length > 0 && r.cards.length > 0);
  const e = search(data, 'middlemen purchased');
  assert.ok(e.questions.length + e.explanations.length > 0);
  assert.equal(search(data, 'zzzzqqq').topics.length, 0);
  assert.deepEqual(search(data, 'balance of trade').topics.map((t) => t.id), ['m8-t9']); // only where the syllabus really says it
});
test('every question doubles as a flashcard', () => {
  const data = loadTestData();
  assert.equal(data.cards.length, data.questions.length + data.authoredCards.length);
});
