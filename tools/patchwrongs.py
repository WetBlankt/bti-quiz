"""Replace the wrong options of existing questions, keeping the correct option and its position.
Usage (from Python): patch('m2', {'m2-t2-q020': ['wrong1','wrong2','wrong3'], ...})"""
import json, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
def patch(module, fixes):
    p = ROOT / 'data' / 'questions' / f'{module}.json'
    D = json.load(open(p, encoding='utf-8')); by = {q['id']: q for q in D['questions']}
    for i, wr in fixes.items():
        q = by[i]; c = q['options'][q['answer']]; assert len(wr) == len(q['options']) - 1, (i, len(wr))
        o = list(wr); o.insert(q['answer'], c); q['options'] = o
    json.dump(D, open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(module, 'patched', len(fixes))
