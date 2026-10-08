"""Question-bank builder helpers (authoring aid; the app only reads the generated JSON).
Write the CORRECT answer first; the helper places it at a rotating position so answers are balanced.
Usage:  b = Bank('m2'); b.mc('m2-t1','easy','mcq', 'Question?', 'Correct', ['w1','w2','w3'], 'Explanation'); b.save()
"""
import json, random, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
AR = ["Both A and R are true, and R explains A", "Both A and R are true, but R does not explain A", "A is true but R is false", "A is false but R is true"]
POS = [2, 0, 3, 1, 1, 3, 0, 2]

class Bank:
    def __init__(self, module, start=0):
        self.m, self.qs, self.cards, self.n, self.k = module, [], [], start, 0
    def _id(self, topic):
        self.n += 1
        return f"{topic}-q{self.n:03d}"
    def _add(self, topic, diff, typ, question, expl, **kw):
        d = dict(id=self._id(topic), topic=topic, difficulty=diff, type=typ, question=question, explanation=expl)
        d.update(kw); self.qs.append(d)
    def mc(self, topic, diff, typ, question, correct, wrongs, expl):
        assert typ in ('mcq', 'concept', 'scenario', 'not', 'compare'), typ
        opts = list(wrongs); pos = min(POS[self.k % len(POS)], len(opts)); self.k += 1
        opts.insert(pos, correct)
        self._add(topic, diff, typ, question, expl, options=opts, answer=pos)
    def tf(self, topic, diff, question, ans, expl):
        self._add(topic, diff, 'tf', question, expl, answer=bool(ans))
    def fill(self, topic, diff, question, accept, expl):
        self._add(topic, diff, 'fill', question, expl, accept=accept if isinstance(accept, list) else [accept])
    def multi(self, topic, diff, question, correct, wrongs, expl):
        opts = list(correct) + list(wrongs)
        random.Random(f"{self.m}{self.n}").shuffle(opts)
        self._add(topic, diff, 'multi', question, expl, options=opts, answer=sorted(opts.index(c) for c in correct))
    def match(self, topic, diff, question, pairs, expl):
        self._add(topic, diff, 'match', question, expl, pairs=[list(p) for p in pairs])
    def ar(self, topic, diff, a, r, code, expl):
        self._add(topic, diff, 'ar', f"Assertion (A): {a}\nReason (R): {r}", expl, options=AR, answer=code)
    def card(self, topic, front, back):
        self.cards.append(dict(id=f"{self.m}-c{len(self.cards)+1:03d}", topic=topic, front=front, back=back))
    def save(self):
        p = ROOT / 'data' / 'questions' / f'{self.m}.json'
        json.dump({"module": self.m, "questions": self.qs, "cards": self.cards}, open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        t = {}
        for q in self.qs: t[q['type']] = t.get(q['type'], 0) + 1
        d = {k: sum(1 for q in self.qs if q['difficulty'] == k) for k in ('easy', 'medium', 'hard')}
        print(self.m, len(self.qs), 'questions', len(self.cards), 'cards', d, t)
