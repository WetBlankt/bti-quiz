import './_setup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkAnswer, fillOk, norm, correctText, answerText } from '../js/check.js';

test('choice / tf', () => {
  assert.ok(checkAnswer({ kind: 'choice', answer: 2 }, 2));
  assert.ok(!checkAnswer({ kind: 'choice', answer: 2 }, 1));
  assert.ok(!checkAnswer({ kind: 'choice', answer: 0 }, undefined));
});
test('multi needs the exact set (order-free, no partial credit)', () => {
  const q = { kind: 'multi', answer: [0, 2, 3] };
  assert.ok(checkAnswer(q, [3, 0, 2]));
  assert.ok(!checkAnswer(q, [0, 2]));
  assert.ok(!checkAnswer(q, [0, 1, 2, 3]));
  assert.ok(!checkAnswer(q, 'x'));
});
test('match needs every pair right', () => {
  const q = { kind: 'match', pairs: [['a', '1'], ['b', '2'], ['c', '3']] };
  assert.ok(checkAnswer(q, [0, 1, 2]));
  assert.ok(!checkAnswer(q, [0, 2, 1]));
  assert.ok(!checkAnswer(q, [0, 1, -1]));
});
test('fill: normalisation, articles, symbols, small typos on long answers only', () => {
  assert.equal(norm('  The   Bee! '), 'bee');
  assert.ok(fillOk(['bee'], 'A Bee'));
  assert.ok(fillOk(['120', 'Rs 120'], '₹120'));
  assert.ok(fillOk(['Competition Commission of India', 'CCI'], 'cci'));
  assert.ok(fillOk(['Competition Commission of India'], 'competition comission of india')); // 1 typo, long answer
  assert.ok(!fillOk(['bee'], 'bea'));       // short answers are exact
  assert.ok(!fillOk(['Niti'], 'nita'));
  assert.ok(!fillOk(['bee'], ''));
});
test('display helpers', () => {
  const m = { kind: 'match', pairs: [['a', '1'], ['b', '2']] };
  assert.equal(correctText(m), 'a → 1\nb → 2');
  assert.equal(answerText(m, [1, -1]), 'a → 2\nb → —');
  assert.equal(answerText({ kind: 'fill' }, ''), '(no answer)');
});
