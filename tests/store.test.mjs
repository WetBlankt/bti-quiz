import { loadTestData } from './_setup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { createStore } from '../js/store.js';
import { memoryStorage, idbStorage } from '../js/storage.js';

const data = loadTestData();
const Q = (id) => data.qIndex.get(id);

test('answering is synchronous and updates xp / mastery / mistakes immediately', async () => {
  const store = createStore({ storage: memoryStorage(), data }); await store.init();
  const r = store.addAttempt({ q: Q('m1-t1-q001'), ok: true, resp: 2, mode: 'quick', qz: 'z', sk: 1 });
  assert.equal(r.base, 10);
  const s = store.getState();
  assert.equal(s.att, 1); assert.equal(s.q['m1-t1-q001'].mastery, 2);
  store.addAttempt({ q: Q('m1-t1-q002'), ok: false, resp: 1, mode: 'quick', qz: 'z', sk: 0 });
  assert.equal(store.getState().q['m1-t1-q002'].bad, 1);
  assert.equal(store.getState().q['m1-t1-q002'].lw.a, 1);
});

test('persistence: close and reopen (IndexedDB) restores identical progress and settings', async () => {
  let store = createStore({ storage: await idbStorage('t1'), data }); await store.init();
  for (let i = 1; i <= 5; i++) store.addAttempt({ q: Q('m1-t1-q00' + i), ok: i % 2 === 1, resp: 0, mode: 'quick', qz: 'z', sk: i % 2 });
  store.addQuizComplete({ qz: 'z', mode: 'quick', total: 5, correct: 3, secs: 40, mods: ['m1'] });
  store.set('volume', 33); store.set('fast', true);
  const before = store.getState();
  await new Promise((r) => setTimeout(r, 50));
  const re = createStore({ storage: await idbStorage('t1'), data }); await re.init();
  const after = re.getState();
  assert.equal(after.xp, before.xp); assert.deepEqual(after.q, before.q); assert.equal(after.quizzes.length, 1);
  assert.equal(re.get('volume'), 33); assert.equal(re.get('fast'), true); assert.equal(re.get('sSomething'), undefined);
  assert.equal(re.deviceId, store.deviceId);
});

test('achievements and module completion are awarded once, with deterministic ids', async () => {
  const store = createStore({ storage: memoryStorage(), data }); await store.init();
  let got = [];
  for (let i = 0; i < 10; i++) { const r = store.addAttempt({ q: Q('m1-t1-q001'), ok: true, resp: 2, mode: 'quick', qz: 'z', sk: i + 1 }); got.push(...r.ach); }
  assert.ok(got.includes('streak10'));
  assert.equal(got.filter((a) => a === 'streak10').length, 1);
  // complete module 1: every question answered correctly twice in a row
  let mods = 0;
  for (const q of data.byModule.get('m1')) for (let i = 0; i < 2; i++) mods += store.addAttempt({ q, ok: true, resp: 0, mode: 'quick', qz: 'z', sk: 1 }).mods.length;
  assert.equal(mods, 1);
  assert.ok(store.getState().done.m1);
  const xpBefore = store.getState().xp;
  store.addAttempt({ q: Q('m1-t1-q001'), ok: true, resp: 2, mode: 'quick', qz: 'z', sk: 1 });
  assert.equal(store.getState().xp, xpBefore + 10);   // no repeat awards
});

test('reset all then re-earn; reset module is scoped', async () => {
  const store = createStore({ storage: memoryStorage(), data }); await store.init();
  store.addAttempt({ q: Q('m1-t1-q001'), ok: true, resp: 2, mode: 'quick', qz: 'z', sk: 1 });
  store.addQuizComplete({ qz: 'z', mode: 'quick', total: 10, correct: 10, secs: 1, mods: ['m1'] });
  assert.ok(store.getState().ach.first_quiz);
  store.reset('m1');
  assert.equal(store.getState().att, 0); assert.ok(store.getState().ach.first_quiz, 'achievements are global; a module reset keeps them');
  store.reset('all');
  assert.equal(store.getState().xp, 0); assert.equal(Object.keys(store.getState().ach).length, 0);
  store.addQuizComplete({ qz: 'y', mode: 'quick', total: 10, correct: 10, secs: 1, mods: ['m1'] });
  assert.ok(store.getState().ach.first_quiz, 'can be earned again after a full reset');
});

test('session save/resume + export/import round-trip', async () => {
  const store = createStore({ storage: memoryStorage(), data }); await store.init();
  await store.saveSession({ id: 's', ids: ['a'], i: 0 });
  assert.equal((await store.loadSession()).id, 's');
  await store.clearSession(); assert.equal(await store.loadSession(), undefined);
  store.addAttempt({ q: Q('m1-t1-q001'), ok: true, resp: 2, mode: 'quick', qz: 'z', sk: 1 });
  store.set('sound', false);
  const dump = JSON.parse(JSON.stringify(store.exportData()));
  const other = createStore({ storage: memoryStorage(), data }); await other.init();
  assert.equal(other.importData(dump) > 0, true);
  assert.equal(other.getState().att, 1); assert.equal(other.get('sound'), false);
  assert.equal(other.importData(dump), 0);                       // importing twice adds nothing
  assert.throws(() => other.importData({ nope: 1 }));
});

test('timestamps stay strictly increasing even with a stalled or skewed clock', async () => {
  const store = createStore({ storage: memoryStorage(), data, now: () => 1000 }); await store.init();
  for (let i = 0; i < 5; i++) store.addAttempt({ q: Q('m1-t1-q001'), ok: true, resp: 2, mode: 'quick', qz: 'z', sk: 1 });
  const ts = store.exportData().events.map((e) => e.ts).sort((a, b) => a - b);
  assert.equal(new Set(ts).size, ts.length);
});
