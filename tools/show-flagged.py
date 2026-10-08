"""Print questions flagged by the validator for answer-length giveaways. Usage: python tools/show-flagged.py m3"""
import json, re, subprocess, sys, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
m = sys.argv[1]
D = json.load(open(root / 'data/questions' / f'{m}.json', encoding='utf-8')); by = {q['id']: q for q in D['questions']}
out = subprocess.run(['node', str(root / 'tools/validate-questions.mjs')], capture_output=True, text=True, cwd=root).stdout
for i in re.findall(rf'({m}-t\d+-q\d+): correct option', out):
    q = by[i]; c = q['options'][q['answer']]
    print(i, '|', q['question'][:60], '|| C(%d):' % len(c), c, '|| W:', ' // '.join(o for k, o in enumerate(q['options']) if k != q['answer']))
