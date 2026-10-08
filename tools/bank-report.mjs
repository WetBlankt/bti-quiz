// Final-bank report. Usage: node tools/bank-report.mjs
import { validateAll } from './validate-questions.mjs';
const { data, errors, warns, modules, dups } = validateAll();
const q = data.questions, cnt = (f) => q.reduce((a, x) => ((a[f(x)] = (a[f(x)] || 0) + 1), a), {});
console.log('TOTAL', q.length);
console.log('\nPER MODULE (easy/medium/hard):');
for (const m of data.modules) { const qs = q.filter((x) => x.module === m.id); const d = cnt.call(null, () => 0); console.log(`  ${m.id}: ${qs.length}  ${['easy', 'medium', 'hard'].map((k) => qs.filter((x) => x.difficulty === k).length).join('/')}`); }
console.log('\nDIFFICULTY', JSON.stringify(cnt((x) => x.difficulty)));
console.log('TYPES', JSON.stringify(cnt((x) => x.type)));
console.log('\nTOPICS WITHOUT QUESTIONS:', [...data.byTopic].filter(([, v]) => !v.length).map(([k]) => k).join(', ') || 'none');
console.log('NEAR-DUPLICATE PAIRS (>=0.72):', dups.length, dups.slice(0, 8).map((d) => `${d.a}~${d.b}:${d.sim}`).join(' '));
console.log('ERRORS', errors.length, 'WARNINGS', warns.length);
errors.slice(0, 20).forEach((e) => console.log('  ERROR', e)); warns.slice(0, 20).forEach((w) => console.log('  WARN', w));
