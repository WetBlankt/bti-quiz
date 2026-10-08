// Relabels the FEWEST questions needed so a module hits exact easy/medium/hard targets.
// Moves are chosen by a complexity score (type + text length), so only boundary-case questions change.
// Usage: node tools/balance-difficulty.mjs m2 22 55 33
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [mod, e, m, h] = [process.argv[2], +process.argv[3], +process.argv[4], +process.argv[5]];
const f = path.join(root, 'data', 'questions', `${mod}.json`);
const D = JSON.parse(fs.readFileSync(f, 'utf8'));
if (e + m + h !== D.questions.length) throw new Error(`targets sum ${e + m + h} != ${D.questions.length} questions`);
const BASE = { tf: 0, fill: 1, mcq: 2, concept: 2, not: 3, multi: 4, match: 4, compare: 5, scenario: 5, ar: 6 };
const score = (q) => BASE[q.type] + (q.question.length + (q.options || q.pairs || q.accept || []).flat().join('').length) / 220;
const by = (d) => D.questions.filter((q) => q.difficulty === d);
const move = (from, to, n, pickHighest) => { const c = by(from).sort((a, b) => (pickHighest ? score(b) - score(a) : score(a) - score(b))).slice(0, n); c.forEach((q) => (q.difficulty = to)); return c.length; };
let moved = 0;
// hard first, then easy
if (by('hard').length < h) moved += move('medium', 'hard', h - by('hard').length, true);
else if (by('hard').length > h) moved += move('hard', 'medium', by('hard').length - h, false);
if (by('easy').length < e) moved += move('medium', 'easy', e - by('easy').length, false);
else if (by('easy').length > e) moved += move('easy', 'medium', by('easy').length - e, true);
const got = ['easy', 'medium', 'hard'].map((d) => by(d).length);
if (got.join() !== [e, m, h].join()) throw new Error('could not balance: ' + got);
fs.writeFileSync(f, JSON.stringify(D, null, 1) + '\n');
console.log(`${mod}: relabelled ${moved} question(s) -> easy ${got[0]} / medium ${got[1]} / hard ${got[2]}`);
