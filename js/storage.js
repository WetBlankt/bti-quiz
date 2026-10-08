// Storage adapters. IndexedDB in the browser; in-memory for tests / when IDB is unavailable.
export function memoryStorage() {
  const ev = new Map(), meta = new Map();
  return {
    kind: 'memory',
    async loadEvents() { return [...ev.values()].map((e) => ({ ...e })); },
    async putEvents(list) { for (const e of list) ev.set(e.id, { ...e }); },
    async getMeta(k) { return meta.has(k) ? structuredClone(meta.get(k)) : undefined; },
    async setMeta(k, v) { meta.set(k, structuredClone(v)); },
    async delMeta(k) { meta.delete(k); },
  };
}

export async function idbStorage(name = 'bti-quiz', idb = globalThis.indexedDB, timeoutMs = 5000) {
  if (!idb) throw new Error('IndexedDB unavailable');
  // indexedDB.open() can stay silent forever (blocked by another tab, browser storage policy). Never wait on it unbounded.
  const db = await new Promise((res, rej) => {
    const timer = setTimeout(() => rej(new Error('IndexedDB did not respond within ' + timeoutMs / 1000 + 's')), timeoutMs);
    let r;
    try { r = idb.open(name, 1); } catch (e) { clearTimeout(timer); rej(e); return; }
    r.onupgradeneeded = () => { r.result.createObjectStore('events', { keyPath: 'id' }); r.result.createObjectStore('meta'); };
    r.onsuccess = () => { clearTimeout(timer); res(r.result); };
    r.onerror = () => { clearTimeout(timer); rej(r.error); };
    r.onblocked = () => { clearTimeout(timer); rej(new Error('IndexedDB is blocked by another open tab')); };
  });
  const run = (store, mode, fn) => new Promise((res, rej) => {
    const tx = db.transaction(store, mode);
    const out = fn(tx.objectStore(store));
    tx.oncomplete = () => res(out?.result ?? out);
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(tx.error);
  });
  return {
    kind: 'idb',
    loadEvents: () => new Promise((res, rej) => { const r = db.transaction('events').objectStore('events').getAll(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }),
    putEvents: (list) => run('events', 'readwrite', (s) => { list.forEach((e) => s.put(e)); }),
    getMeta: (k) => new Promise((res, rej) => { const r = db.transaction('meta').objectStore('meta').get(k); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }),
    setMeta: (k, v) => run('meta', 'readwrite', (s) => { s.put(v, k); }),
    delMeta: (k) => run('meta', 'readwrite', (s) => { s.delete(k); }),
  };
}
