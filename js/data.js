// Syllabus + question bank loading, validation, indexes, search. Pure (fetch is injected) so tests can use fs.
import { kindOf, correctText } from './check.js';

export const TYPES = ['mcq', 'tf', 'multi', 'match', 'fill', 'ar', 'scenario', 'not', 'concept', 'compare'];
export const TYPE_LABEL = {
  mcq: 'Multiple choice', tf: 'True / False', multi: 'Select all', match: 'Match', fill: 'Fill the blank',
  ar: 'Assertion–Reason', scenario: 'Scenario', not: 'Which is NOT', concept: 'Concept', compare: 'Comparison',
};
export const DIFFS = ['easy', 'medium', 'hard'];

export function normalizeQuestion(raw, topicMap) {
  const err = (m) => ({ error: `${raw?.id || '?'}: ${m}` });
  if (!raw || typeof raw !== 'object') return { error: 'not an object' };
  for (const k of ['id', 'topic', 'type', 'question', 'explanation']) if (!raw[k] || typeof raw[k] !== 'string') return err(`missing "${k}"`);
  if (!TYPES.includes(raw.type)) return err(`bad type "${raw.type}"`);
  const t = topicMap.get(raw.topic);
  if (!t) return err(`unknown topic "${raw.topic}"`);
  const module = raw.module || t.module;
  if (module !== t.module) return err(`module "${module}" does not match topic "${raw.topic}"`);
  const q = {
    id: raw.id, module, topic: raw.topic, type: raw.type, kind: kindOf(raw.type),
    difficulty: DIFFS.includes(raw.difficulty) ? raw.difficulty : 'medium',
    question: raw.question.trim(), explanation: raw.explanation.trim(),
    fixedOrder: raw.fixedOrder ?? (raw.type === 'tf' || raw.type === 'ar'), tags: raw.tags || [],
  };
  if (q.kind === 'choice') {
    q.options = raw.type === 'tf' ? ['True', 'False'] : raw.options;
    q.answer = raw.type === 'tf' && typeof raw.answer === 'boolean' ? (raw.answer ? 0 : 1) : raw.answer;
    if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 6) return err('options must be 2-6 items');
    if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= q.options.length) return err('answer index out of range');
  } else if (q.kind === 'multi') {
    q.options = raw.options; q.answer = raw.answer;
    if (!Array.isArray(q.options) || q.options.length < 3) return err('multi needs >=3 options');
    if (!Array.isArray(q.answer) || !q.answer.length || q.answer.some((i) => !Number.isInteger(i) || i < 0 || i >= q.options.length)) return err('multi answer must be an index array');
  } else if (q.kind === 'match') {
    q.pairs = raw.pairs;
    if (!Array.isArray(q.pairs) || q.pairs.length < 2 || q.pairs.length > 7 || q.pairs.some((p) => !Array.isArray(p) || p.length !== 2)) return err('match needs 2-7 [left,right] pairs');
  } else {
    q.accept = raw.accept;
    if (!Array.isArray(q.accept) || !q.accept.length) return err('fill needs "accept" list');
  }
  return { q };
}

export function buildData(syllabus, files) {
  const modules = syllabus.modules;
  const topicMap = new Map(), moduleMap = new Map();
  for (const m of modules) {
    moduleMap.set(m.id, m);
    for (const t of m.topics) topicMap.set(t.id, { ...t, module: m.id });
  }
  const questions = [], cards = [], errors = [], qIndex = new Map();
  for (const f of files) {
    for (const raw of f.questions || []) {
      const r = normalizeQuestion(raw, topicMap);
      if (r.error) { errors.push(r.error); continue; }
      if (qIndex.has(r.q.id)) { errors.push(`${r.q.id}: duplicate id`); continue; }
      qIndex.set(r.q.id, r.q); questions.push(r.q);
    }
    for (const c of f.cards || []) {
      if (c.id && c.front && c.back && topicMap.has(c.topic)) cards.push({ ...c, module: topicMap.get(c.topic).module });
      else errors.push(`card ${c?.id || '?'}: invalid`);
    }
  }
  const byModule = new Map(modules.map((m) => [m.id, []]));
  const byTopic = new Map([...topicMap.keys()].map((k) => [k, []]));
  for (const q of questions) { byModule.get(q.module).push(q); byTopic.get(q.topic).push(q); }
  // every question doubles as a flashcard (front = question, back = answer + explanation)
  const allCards = [
    ...cards,
    ...questions.map((q) => ({ id: 'fq:' + q.id, module: q.module, topic: q.topic, front: q.question, back: correctText(q), extra: q.explanation, auto: true, qid: q.id })),
  ];
  const cardIndex = new Map(allCards.map((c) => [c.id, c]));
  return { modules, moduleMap, topicMap, questions, qIndex, byModule, byTopic, cards: allCards, authoredCards: cards, cardIndex, errors, docs: buildDocs(topicMap, questions, cards) };
}

const lc = (s) => String(s).toLowerCase();
function buildDocs(topicMap, questions, cards) {
  const docs = [];
  for (const [id, t] of topicMap) docs.push({ k: 'topic', id, title: lc(t.title), hay: lc([t.title, ...t.notes].join(' ')) });
  for (const q of questions) {
    const body = [q.question, ...(q.options || []), ...(q.pairs || []).flat(), ...(q.accept || [])].join(' ');
    docs.push({ k: 'q', id: q.id, body: lc(body), expl: lc(q.explanation) });
  }
  for (const c of cards) docs.push({ k: 'card', id: c.id, hay: lc(c.front + ' ' + c.back) });
  return docs;
}

export function search(data, text, limit = 25) {
  const tokens = lc(text).split(/\s+/).filter(Boolean);
  const res = { topics: [], questions: [], explanations: [], cards: [] };
  if (!tokens.length) return res;
  const all = (s) => tokens.every((t) => s.includes(t));
  for (const d of data.docs) {
    if (d.k === 'topic' && all(d.hay)) res.topics.push({ id: d.id, score: all(d.title) ? 2 : 1 });
    else if (d.k === 'q') {
      if (all(d.body)) res.questions.push({ id: d.id });
      else if (all(d.expl) || all(d.body + ' ' + d.expl)) res.explanations.push({ id: d.id });
    } else if (d.k === 'card' && all(d.hay)) res.cards.push({ id: d.id });
  }
  res.topics.sort((a, b) => b.score - a.score);
  for (const k of Object.keys(res)) res[k] = res[k].slice(0, limit);
  return res;
}

// Browser loader. Files are served from the same origin and cached by the service worker.
export async function loadData(base = './data/', fetchFn = (...a) => fetch(...a)) {
  const get = async (p) => { const r = await fetchFn(base + p, { cache: 'no-cache' }); if (!r.ok) throw new Error(p + ' ' + r.status); return r.json(); };
  const [syllabus, manifest] = await Promise.all([get('syllabus.json'), get('manifest.json')]);
  const files = await Promise.all(manifest.files.map(get));
  const data = buildData(syllabus, files);
  data.version = manifest.version;
  if (data.errors.length) console.warn('Question bank problems:', data.errors);
  return data;
}
