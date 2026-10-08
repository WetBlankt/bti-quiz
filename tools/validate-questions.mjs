// Validates syllabus + every data/questions/mX.json. Exit code 1 on errors.  Run: npm run validate
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildData } from '../js/data.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));


const AR_OPTIONS = ['Both A and R are true, and R explains A', 'Both A and R are true, but R does not explain A', 'A is true but R is false', 'A is false but R is true'];
const STOP = new Set('the a an of to in on for and or is are was were be been by with as at from that this which what who whom how why does did do not its it their his her they these those into than then also per according session statement following'.split(' '));
const toks = (s) => String(s).toLowerCase().replace(/[^a-z0-9\u20b9% ]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));
const jacc = (a, b) => { const A = new Set(a), B = new Set(b); let i = 0; for (const x of A) if (B.has(x)) i++; return A.size + B.size - i ? i / (A.size + B.size - i) : 0; };
const correctOf = (q) => (q.kind === 'choice' ? q.options[q.answer] : q.kind === 'multi' ? q.answer.map((i) => q.options[i]).join(' ') : q.kind === 'fill' ? q.accept[0] : q.pairs.flat().join(' '));

// Near-duplicate detector: similar question stems, or similar stem + same correct answer, within the whole bank.
export function nearDuplicates(questions, warnAt = 0.72, errorAt = 0.9) {
  const info = questions.map((q) => ({ q, stem: toks(q.question), full: toks(q.question + ' ' + correctOf(q)) }));
  const out = [];
  for (let i = 0; i < info.length; i++) for (let j = i + 1; j < info.length; j++) {
    const a = info[i], b = info[j];
    const sStem = jacc(a.stem, b.stem), sFull = jacc(a.full, b.full);
    const sim = Math.max(sStem, sFull);
    if (sim >= warnAt) out.push({ a: a.q.id, b: b.q.id, sim: +sim.toFixed(2), level: sim >= errorAt ? 'error' : 'warn' });
  }
  return out.sort((x, y) => y.sim - x.sim);
}

export function validateAll() {
  const syllabus = rd('data/syllabus.json');
  const manifest = rd('data/manifest.json');
  const files = manifest.files.map((f) => ({ f, ...rd('data/' + f) }));
  const data = buildData(syllabus, files);
  const errors = [...data.errors], warns = [];
  const seenText = new Map();
  for (const f of files) {
    const mod = f.module;
    for (const q of f.questions) if (mod && q.id && !q.id.startsWith(mod + '-')) errors.push(`${q.id}: id does not start with file module "${mod}-"`);
  }
  for (const q of data.questions) {
    if (!new RegExp(`^${q.topic}-q\\d{3,}$`).test(q.id)) errors.push(`${q.id}: id should look like ${q.topic}-q001`);
    const key = q.question.toLowerCase().replace(/\s+/g, ' ');
    if (seenText.has(key)) warns.push(`${q.id}: same question text as ${seenText.get(key)}`); else seenText.set(key, q.id);
    if (q.options && !q.fixedOrder && q.options.some((o) => /(all|none|both) of the above|both (a|b)\b/i.test(o))) warns.push(`${q.id}: "of the above" option breaks when shuffled - set fixedOrder:true`);
    if (q.options && new Set(q.options.map((o) => o.trim().toLowerCase())).size !== q.options.length) errors.push(`${q.id}: duplicate options`);
    if (q.kind === 'choice' && q.type !== 'tf' && q.type !== 'ar' && q.options.length < 4) warns.push(`${q.id}: fewer than 4 options`);
    if (q.explanation.length < 25) warns.push(`${q.id}: explanation very short`);
  }

  // ---- stronger per-question checks
  for (const q of data.questions) {
    if (q.type === 'ar' && (q.options.length !== 4 || q.options.some((o, i) => o !== AR_OPTIONS[i]) || !/Assertion \(A\)/.test(q.question) || !/Reason \(R\)/.test(q.question))) errors.push(`${q.id}: assertion-reason must use the 4 standard options and "Assertion (A)" / "Reason (R)" text`);
    if (q.kind === 'multi' && (new Set(q.answer).size !== q.answer.length || q.answer.length >= q.options.length)) errors.push(`${q.id}: multi answer must be unique indices and not every option`);
    if (q.kind === 'match' && new Set(q.pairs.map((p) => p[1].trim().toLowerCase())).size !== q.pairs.length) errors.push(`${q.id}: match has duplicate right-hand items`);
    if (q.kind === 'fill' && (!/_{3,}/.test(q.question) || q.accept.some((a) => !String(a).trim()))) errors.push(`${q.id}: fill needs a ______ blank and non-empty accept values`);
    if (q.type === 'not' && !/\b(NOT|INCORRECT|EXCEPT|false)\b/i.test(q.question)) warns.push(`${q.id}: "not" question should say NOT / INCORRECT / EXCEPT`);
    if (q.type === 'tf' && !/[.!]$/.test(q.question)) warns.push(`${q.id}: true/false statement should end with a full stop`);
    const optLens = q.options ? q.options.map((o) => o.length) : [];
    if (q.kind === 'choice' && q.type !== 'tf' && q.type !== 'ar' && optLens.length && optLens[q.answer] === Math.max(...optLens) && optLens[q.answer] > 1.8 * ((optLens.reduce((a, b) => a + b, 0) - optLens[q.answer]) / (optLens.length - 1)) && optLens[q.answer] - (optLens.reduce((a, b) => a + b, 0) - optLens[q.answer]) / (optLens.length - 1) >= 25) warns.push(`${q.id}: correct option is much longer than the others (gives it away)`);
  }
  const dups = nearDuplicates(data.questions);
  for (const d of dups) (d.level === 'error' ? errors : warns).push(`${d.a} ~ ${d.b}: near-duplicate (similarity ${d.sim})`);
  // per-module breakdown + target check (40/40/20 difficulty)
  const modules = {};
  for (const q of data.questions) { const m = (modules[q.module] ||= { n: 0, types: {}, diffs: {}, topics: {} }); m.n++; m.types[q.type] = (m.types[q.type] || 0) + 1; m.diffs[q.difficulty] = (m.diffs[q.difficulty] || 0) + 1; m.topics[q.topic] = (m.topics[q.topic] || 0) + 1; }

  // ---- answer-balance rules (a student must not be able to guess by pattern)
  const byMod = {};
  for (const q of data.questions) (byMod[q.module] ||= []).push(q);
  for (const [m, qs] of Object.entries(byMod)) {
    const tf = qs.filter((q) => q.type === 'tf');
    if (tf.length >= 6) { const f = tf.filter((q) => q.answer === 1).length / tf.length; if (f < 0.25 || f > 0.75) errors.push(`${m}: true/false answers unbalanced (${Math.round(f * 100)}% false across ${tf.length}); keep 25-75%`); }
    const ar = qs.filter((q) => q.type === 'ar');
    if (ar.length >= 6) { const c = {}; ar.forEach((q) => (c[q.answer] = (c[q.answer] || 0) + 1)); if (Math.max(...Object.values(c)) / ar.length > 0.5 || Object.keys(c).length < 3) errors.push(`${m}: assertion-reason keys unbalanced ${JSON.stringify(c)}`); }
    const mc = qs.filter((q) => q.kind === 'choice' && q.type !== 'tf' && q.type !== 'ar');
    if (mc.length >= 20) { const c = {}; mc.forEach((q) => (c[q.answer] = (c[q.answer] || 0) + 1)); const mx = Math.max(...Object.values(c)) / mc.length; if (mx > 0.4) errors.push(`${m}: one option position holds ${Math.round(mx * 100)}% of correct answers`); }
  }
  // answer position balance (choice questions)
  const pos = {};
  let nChoice = 0;
  for (const q of data.questions) if (q.kind === 'choice' && q.type !== 'tf' && q.type !== 'ar') { pos[q.answer] = (pos[q.answer] || 0) + 1; nChoice++; }
  if (nChoice >= 20) for (const [p, c] of Object.entries(pos)) if (c / nChoice > 0.45) warns.push(`correct answer is option ${'ABCDEF'[p]} in ${Math.round((100 * c) / nChoice)}% of choice questions`);
  const types = {}, diffs = {}, perTopic = {};
  for (const q of data.questions) { types[q.type] = (types[q.type] || 0) + 1; diffs[q.difficulty] = (diffs[q.difficulty] || 0) + 1; perTopic[q.topic] = (perTopic[q.topic] || 0) + 1; }
  return { data, errors, warns, modules, dups, summary: { questions: data.questions.length, cards: data.authoredCards.length, types, diffs, perTopic, answerPositions: pos } };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { errors, warns, summary, data } = validateAll();
  const nt = data.modules.reduce((n, m) => n + m.topics.length, 0);
  console.log(`syllabus: ${data.modules.length} modules, ${nt} topics`);
  console.log('questions:', JSON.stringify(summary));
  warns.forEach((w) => console.log('WARN ', w));
  errors.forEach((e) => console.log('ERROR', e));
  console.log(errors.length ? `FAILED: ${errors.length} error(s)` : `OK (${warns.length} warning(s))`);
  process.exit(errors.length ? 1 : 0);
}
