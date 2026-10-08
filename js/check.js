// Answer checking - 100% local. Response formats:
//   choice -> option index (number) | multi -> array of indices | match -> array (pairs[i] = chosen right index for left i) | fill -> string
export const kindOf = (type) => (type === 'multi' ? 'multi' : type === 'match' ? 'match' : type === 'fill' ? 'fill' : 'choice');

export function norm(s) {
  return String(s ?? '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9%\s]/g, ' ').replace(/\b(the|a|an)\b/g, ' ').replace(/\s+/g, ' ').trim();
}
export function lev(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
export function fillOk(accept, text) {
  const n = norm(text);
  if (!n) return false;
  return accept.some((a) => {
    const na = norm(a);
    if (n === na) return true;
    const tol = na.length >= 12 ? 2 : na.length >= 6 ? 1 : 0; // forgive typos on longer answers only
    return tol > 0 && lev(n, na) <= tol;
  });
}

export function checkAnswer(q, resp) {
  switch (q.kind) {
    case 'choice': return resp === q.answer;
    case 'multi': {
      if (!Array.isArray(resp)) return false;
      const a = [...new Set(resp)].sort(), b = [...q.answer].sort();
      return a.length === b.length && a.every((v, i) => v === b[i]);
    }
    case 'match': return Array.isArray(resp) && resp.length === q.pairs.length && resp.every((v, i) => v === i);
    case 'fill': return fillOk(q.accept, resp);
  }
  return false;
}

export function correctText(q) {
  switch (q.kind) {
    case 'choice': return q.options[q.answer];
    case 'multi': return q.answer.map((i) => q.options[i]).join('  •  ');
    case 'match': return q.pairs.map((p) => `${p[0]} → ${p[1]}`).join('\n');
    case 'fill': return q.accept[0];
  }
  return '';
}
export function answerText(q, resp) {
  if (resp == null || resp === '') return '(no answer)';
  switch (q.kind) {
    case 'choice': return q.options[resp] ?? '?';
    case 'multi': return resp.length ? resp.map((i) => q.options[i]).join('  •  ') : '(none selected)';
    case 'match': return resp.map((r, i) => `${q.pairs[i][0]} → ${r >= 0 ? q.pairs[r][1] : '—'}`).join('\n');
    case 'fill': return String(resp);
  }
  return '';
}
