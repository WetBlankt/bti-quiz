import { loadTestData } from './_setup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { startMock } from './mock-supabase.mjs';
import { memoryStorage } from '../js/storage.js';
import { createStore } from '../js/store.js';
import { createSync } from '../js/sync.js';

const data = loadTestData();
async function device(mock, clock) {
  const storage = memoryStorage();
  const store = createStore({ storage, data, now: () => clock.t });
  await store.init();
  const sync = createSync({ store, storage, config: { SUPABASE_URL: mock.url, SUPABASE_ANON_KEY: 'anon' }, now: () => clock.t });
  return { store, storage, sync };
}
const answer = (d, id, ok, mode = 'quick', sk = ok ? 1 : 0) => d.store.addAttempt({ q: data.qIndex.get(id), ok, resp: 0, mode, qz: 'z', sk });

test('laptop -> phone: progress follows the account; sets converge', async () => {
  const mock = await startMock(), clock = { t: Date.UTC(2026, 1, 1) };
  const A = await device(mock, clock), B = await device(mock, clock);
  await A.sync.sendCode('me@x.com'); await A.sync.verifyCode('me@x.com', '123456');
  for (let i = 1; i <= 20; i++) { clock.t += 1000; answer(A, `m1-t1-q00${(i % 6) + 1}`, i % 3 !== 0, 'quick', i); }
  await A.sync.sync();
  await B.sync.sendCode('me@x.com'); await B.sync.verifyCode('me@x.com', '123456');
  const a = A.store.getState(), b = B.store.getState();
  assert.equal(b.att, 20);
  assert.equal(b.xp, a.xp);
  assert.deepEqual(b.q, a.q);
  assert.equal(A.store.unsynced().length, 0);
  mock.close();
});

test('offline answers queue locally, then sync on reconnect; both devices converge with no overwrite', async () => {
  const mock = await startMock(), clock = { t: Date.UTC(2026, 1, 1) };
  const A = await device(mock, clock), B = await device(mock, clock);
  for (const d of [A, B]) { await d.sync.sendCode('me@x.com'); await d.sync.verifyCode('me@x.com', '123456'); }
  mock.state.offline = true;
  clock.t += 1000; answer(A, 'm1-t1-q001', true);
  clock.t += 1000; answer(B, 'm1-t2-q007', false);
  clock.t += 1000; answer(B, 'm1-t3-q011', true);
  await A.sync.sync(); await B.sync.sync();
  assert.equal(A.sync.info.status, 'offline');
  assert.equal(A.store.unsynced().length > 0, true, 'work is kept in the outbox while offline');
  assert.equal(A.store.getState().att, 1);
  mock.state.offline = false;
  await A.sync.sync(); await B.sync.sync(); await A.sync.sync();
  const a = A.store.getState(), b = B.store.getState();
  assert.equal(a.att, 3); assert.equal(b.att, 3);
  assert.deepEqual(a.q, b.q);
  assert.equal(a.xp, b.xp);
  assert.equal(A.store.unsynced().length + B.store.unsynced().length, 0);
  mock.close();
});

test('re-syncing is idempotent: no duplicate events or double XP', async () => {
  const mock = await startMock(), clock = { t: Date.UTC(2026, 1, 1) };
  const A = await device(mock, clock);
  await A.sync.sendCode('me@x.com'); await A.sync.verifyCode('me@x.com', '123456');
  clock.t += 1000; answer(A, 'm1-t1-q001', true);
  await A.sync.sync({ force: true }); await A.sync.sync({ force: true });
  assert.equal(A.store.getState().att, 1);
  assert.equal(mock.state.events.size, A.store.eventCount());
  mock.close();
});

test('a reset on one device is honoured by the other and does not erase newer answers', async () => {
  const mock = await startMock(), clock = { t: Date.UTC(2026, 1, 1) };
  const A = await device(mock, clock), B = await device(mock, clock);
  for (const d of [A, B]) { await d.sync.sendCode('me@x.com'); await d.sync.verifyCode('me@x.com', '123456'); }
  clock.t += 1000; answer(A, 'm1-t1-q001', true); await A.sync.sync(); await B.sync.sync();
  clock.t += 1000; A.store.reset('all');
  clock.t += 1000; answer(B, 'm1-t1-q002', true);   // newer than the reset
  await A.sync.sync(); await B.sync.sync(); await A.sync.sync();
  for (const d of [A, B]) { const s = d.store.getState(); assert.equal(s.att, 1); assert.ok(s.q['m1-t1-q002']); assert.ok(!s.q['m1-t1-q001']); }
  mock.close();
});

test('settings: last writer wins per key, across devices', async () => {
  const mock = await startMock(), clock = { t: Date.UTC(2026, 1, 1) };
  const A = await device(mock, clock), B = await device(mock, clock);
  for (const d of [A, B]) { await d.sync.sendCode('me@x.com'); await d.sync.verifyCode('me@x.com', '123456'); }
  clock.t += 1000; A.store.set('volume', 20); A.store.set('fast', true);
  clock.t += 1000; B.store.set('volume', 90);                // newer volume, older fast
  await A.sync.sync(); await B.sync.sync(); await A.sync.sync();
  for (const d of [A, B]) { assert.equal(d.store.get('volume'), 90); assert.equal(d.store.get('fast'), true); }
  mock.close();
});

test('two different accounts never see each other', async () => {
  const mock = await startMock(), clock = { t: Date.UTC(2026, 1, 1) };
  const A = await device(mock, clock), B = await device(mock, clock);
  await A.sync.sendCode('a@x.com'); await A.sync.verifyCode('a@x.com', '123456');
  await B.sync.sendCode('b@x.com'); await B.sync.verifyCode('b@x.com', '123456');
  clock.t += 1000; answer(A, 'm1-t1-q001', true); await A.sync.sync(); await B.sync.sync();
  assert.equal(B.store.getState().att, 0);
  mock.close();
});

test('bad code is rejected; unconfigured sync is inert; local quiz works regardless', async () => {
  const mock = await startMock(), clock = { t: Date.UTC(2026, 1, 1) };
  const A = await device(mock, clock);
  await assert.rejects(() => A.sync.verifyCode('me@x.com', '000000'));
  const storage = memoryStorage(), store = createStore({ storage, data }); await store.init();
  const s = createSync({ store, storage, config: {} });
  await s.start(); assert.equal(s.info.status, 'unconfigured');
  store.addAttempt({ q: data.qIndex.get('m1-t1-q001'), ok: true, resp: 0, mode: 'quick', qz: 'z', sk: 1 });
  assert.equal(store.getState().att, 1);
  mock.close();
});
