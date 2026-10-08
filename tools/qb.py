"""Authoring helper for question files (kept so future batches use the same conventions).
Usage in a generator script:
    from qb import Bank
    b = Bank('m2'); b.mc('m2-t1','easy','mcq',"Question?", "Right", ["w1","w2","w3"], "Explanation."); ... ; b.save(target=(22,55,33), total=110)
- Options are shuffled deterministically per question id, so answer positions are balanced and stable.
- save() relabels difficulty minimally (by question-type 'hardness') so the module hits the exact easy/medium/hard targets.
"""
import json, random, hashlib, pathlib
from collections import Counter
ROOT = pathlib.Path(__file__).resolve().parent.parent
AR = ["Both A and R are true, and R explains A", "Both A and R are true, but R does not explain A", "A is true but R is false", "A is false but R is true"]
HARDNESS = ['scenario', 'compare', 'ar', 'not', 'match', 'multi', 'concept', 'mcq', 'fill', 'tf']  # hardest-fitting first

class Bank:
    def __init__(self, module, start=0, existing=None):
        self.module, self.n, self.qs, self.cards = module, start, existing or [], []
    def _id(self, topic):
        self.n += 1
        assert topic.startswith(self.module + '-t'), topic
        return f"{topic}-q{self.n:03d}"
    def _add(self, topic, diff, typ, question, expl, **kw):
        d = dict(id=self._id(topic), topic=topic, difficulty=diff, type=typ, question=question, explanation=expl); d.update(kw); self.qs.append(d); return d
    def _shuffled(self, correct, wrongs, qid_hint):
        opts = [correct] + list(wrongs)
        assert len(set(o.strip().lower() for o in opts)) == len(opts), ('duplicate options', opts)
        r = random.Random(int(hashlib.md5((self.module + str(self.n + 1) + correct).encode()).hexdigest()[:8], 16))
        r.shuffle(opts)
        return opts, opts.index(correct)
    def mc(self, topic, diff, typ, question, correct, wrongs, expl):
        assert typ in ('mcq', 'scenario', 'concept', 'compare', 'not')
        opts, ans = self._shuffled(correct, wrongs, topic)
        return self._add(topic, diff, typ, question, expl, options=opts, answer=ans)
    def tf(self, topic, diff, question, ans, expl): return self._add(topic, diff, 'tf', question, expl, answer=bool(ans))
    def fill(self, topic, diff, question, accept, expl):
        return self._add(topic, diff, 'fill', question, expl, accept=accept if isinstance(accept, list) else [accept])
    def multi(self, topic, diff, question, right, wrong, expl):
        opts = list(right) + list(wrong)
        r = random.Random(int(hashlib.md5((self.module + str(self.n + 1) + opts[0]).encode()).hexdigest()[:8], 16)); r.shuffle(opts)
        return self._add(topic, diff, 'multi', question, expl, options=opts, answer=sorted(opts.index(x) for x in right))
    def match(self, topic, diff, question, pairs, expl): return self._add(topic, diff, 'match', question, expl, pairs=[list(p) for p in pairs])
    def ar(self, topic, diff, a, r, ans, expl):
        return self._add(topic, diff, 'ar', f"Assertion (A): {a}\nReason (R): {r}", expl, options=AR, answer=ans)
    def card(self, topic, front, back):
        self.cards.append(dict(id=f"{self.module}-c{len(self.cards) + 1:03d}", topic=topic, front=front, back=back))

def balance(qs, target):
    E, M, H = target
    cnt = lambda: Counter(q['difficulty'] for q in qs)
    hard_rank = lambda q: HARDNESS.index(q['type'])
    def move(frm, to, key, reverse=False):
        pool = sorted([q for q in qs if q['difficulty'] == frm], key=key, reverse=reverse)
        pool[0]['difficulty'] = to
    while cnt()['hard'] < H:   # promote hardest-fitting medium (else easy) to hard
        if any(q['difficulty'] == 'medium' for q in qs): move('medium', 'hard', hard_rank)
        else: move('easy', 'hard', hard_rank)
    while cnt()['hard'] > H: move('hard', 'medium', hard_rank, reverse=True)   # demote simplest-type hard
    while cnt()['easy'] > E: move('easy', 'medium', hard_rank)                   # complex-type easy -> medium
    while cnt()['easy'] < E: move('medium', 'easy', hard_rank, reverse=True)     # simplest-type medium -> easy
    assert (cnt()['easy'], cnt()['medium'], cnt()['hard']) == (E, M, H), cnt()

def save_bank(module, qs, cards, target, total):
    assert len(qs) == total, f"{module}: {len(qs)} questions, expected {total}"
    balance(qs, target)
    path = ROOT / 'data' / 'questions' / f'{module}.json'
    json.dump({"module": module, "questions": qs, "cards": cards}, open(path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    c = Counter(q['type'] for q in qs); d = Counter(q['difficulty'] for q in qs); t = Counter(q['topic'] for q in qs)
    print(f"{module}: {len(qs)} questions | difficulty {dict(d)} | types {dict(c)}\n   topics {dict(sorted(t.items()))}")

def finish(b, target, total):
    save_bank(b.module, b.qs, b.cards, target, total)
