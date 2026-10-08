"""Tiny patch helper for editing question files by id (used for audit corrections)."""
import json, sys, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
AR = ["Both A and R are true, and R explains A", "Both A and R are true, but R does not explain A", "A is true but R is false", "A is false but R is true"]
class Patch:
    def __init__(self, module):
        self.path = ROOT / 'data' / 'questions' / f'{module}.json'
        self.d = json.load(open(self.path, encoding='utf-8')); self.by = {q['id']: q for q in self.d['questions']}; self.n = 0
    def tf(self, id, question, answer, expl):
        q = self.by[id]; assert q['type'] == 'tf', id; q.update(question=question, answer=answer, explanation=expl); self.n += 1
    def ar(self, id, a, r, key, expl):
        q = self.by[id]; assert q['type'] == 'ar', id; q.update(question=f"Assertion (A): {a}\nReason (R): {r}", answer=key, explanation=expl, options=AR); self.n += 1
    def set(self, id, **kw):
        self.by[id].update(kw); self.n += 1
    def save(self):
        json.dump(self.d, open(self.path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1); print(f"patched {self.n} questions in {self.path.name}")
