import 'fake-indexeddb/auto';
import './_setup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { idbStorage, memoryStorage } from '../js/storage.js';

// A fake indexedDB whose open() returns a request that NEVER fires any event (what a blocked/hung browser does).
const hungIdb = { open: () => ({}) };

test('idbStorage gives up (rejects) instead of hanging forever when indexedDB.open never answers', async () => {
  const t0 = Date.now();
  await assert.rejects(idbStorage('x', hungIdb, 80), /did not respond/);
  assert.ok(Date.now() - t0 < 1500);
});
test('idbStorage rejects when indexedDB.open throws, errors, or is blocked', async () => {
  await assert.rejects(idbStorage('x', { open() { throw new Error('SecurityError'); } }, 500), /SecurityError/);
  await assert.rejects(idbStorage('x', { open() { const r = {}; setTimeout(() => { r.error = new Error('boom'); r.onerror(); }); return r; } }, 500), /boom/);
  await assert.rejects(idbStorage('x', { open() { const r = {}; setTimeout(() => r.onblocked()); return r; } }, 500), /blocked/);
});
test('idbStorage still opens a healthy database', async () => {
  const s = await idbStorage('startup-ok'); assert.equal(s.kind, 'idb');
  await s.setMeta('k', 1); assert.equal(await s.getMeta('k'), 1);
});
test('memory fallback keeps the app usable', async () => { const m = memoryStorage(); await m.setMeta('a', 2); assert.equal(await m.getMeta('a'), 2); assert.equal(m.kind, 'memory'); });
