// Cross-device sync against Supabase (REST + GoTrue) using plain fetch - no SDK.
// Events are immutable and de-duplicated by id, so merging is a set union: nothing is ever overwritten.
// Settings merge last-writer-wins per key. Quiz answering never waits on this module.
export function createSync({ store, storage, config, fetchFn = (...a) => fetch(...a), now = Date.now, onStatus = () => {} }) {
  const url = (config.SUPABASE_URL || '').replace(/\/$/, '');
  const key = config.SUPABASE_ANON_KEY || '';
  const configured = !!(url && key);
  let auth = null, busy = false, timer = null, started = false;
  const info = { status: configured ? 'signed-out' : 'unconfigured', last: 0, error: '', email: '', pushed: 0, pulled: 0 };
  const set = (patch) => { Object.assign(info, patch); onStatus({ ...info }); };
  const online = () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false);

  const hdr = (token) => ({ apikey: key, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) });
  async function authCall(path, body) {
    const r = await fetchFn(`${url}/auth/v1/${path}`, { method: 'POST', headers: hdr(), body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.msg || j.error_description || j.message || `Auth error ${r.status}`), { status: r.status });
    return j;
  }
  async function saveSession(j) {
    auth = { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: now() + (j.expires_in || 3600) * 1000, user: { id: j.user?.id, email: j.user?.email } };
    await storage.setMeta('auth', auth);
    set({ status: 'idle', email: auth.user.email || '', error: '' });
  }
  async function token() {
    if (!auth) return null;
    if (auth.expires_at - 60e3 > now()) return auth.access_token;
    try { await saveSession(await authCall('token?grant_type=refresh_token', { refresh_token: auth.refresh_token })); }
    catch (e) { if (e.status === 400 || e.status === 401) { await signOut(); return null; } throw e; }
    return auth.access_token;
  }
  async function rest(path, opts = {}) {
    const tok = await token();
    if (!tok) throw Object.assign(new Error('Signed out'), { status: 401 });
    const r = await fetchFn(`${url}/rest/v1/${path}`, { ...opts, headers: { ...hdr(tok), ...(opts.headers || {}) } });
    if (!r.ok) throw Object.assign(new Error(`Sync error ${r.status}: ${(await r.text().catch(() => '')).slice(0, 120)}`), { status: r.status });
    return r;
  }

  async function sendCode(email) { await authCall('otp', { email, create_user: true }); }
  async function verifyCode(email, code) { await saveSession(await authCall('verify', { type: 'email', email, token: code.trim() })); return sync({ force: true }); }
  async function handleHash(hash) { // magic-link redirect: #access_token=...&refresh_token=...
    const p = new URLSearchParams((hash || '').replace(/^#/, ''));
    if (!p.get('access_token')) return false;
    const r = await fetchFn(`${url}/auth/v1/user`, { headers: hdr(p.get('access_token')) });
    const user = r.ok ? await r.json() : {};
    await saveSession({ access_token: p.get('access_token'), refresh_token: p.get('refresh_token'), expires_in: Number(p.get('expires_in')) || 3600, user });
    sync({ force: true });
    return true;
  }
  async function signOut() { auth = null; await storage.delMeta('auth'); set({ status: configured ? 'signed-out' : 'unconfigured', email: '' }); }

  async function push() {
    const un = store.unsynced();
    for (let i = 0; i < un.length; i += 200) {
      const chunk = un.slice(i, i + 200);
      await rest('events?on_conflict=user_id,id', {
        method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
        body: JSON.stringify(chunk.map((e) => ({ user_id: auth.user.id, id: e.id, ts: e.ts, data: e }))),
      });
      store.markSynced(chunk.map((e) => e.id));
    }
    return un.length;
  }
  async function pull(full) {
    let cursor = full ? 0 : (await storage.getMeta('sync:cursor')) || 0, got = 0;
    for (;;) {
      const rows = await (await rest(`events?select=seq,data&seq=gt.${cursor}&order=seq.asc&limit=1000`)).json();
      if (!rows.length) break;
      got += store.mergeEvents(rows.map((r) => r.data), { synced: true });
      cursor = rows[rows.length - 1].seq;
      if (rows.length < 1000) break;
    }
    await storage.setMeta('sync:cursor', cursor);
    if (full) await storage.setMeta('sync:full', now());
    return got;
  }
  async function syncSettings() {
    const rows = await (await rest('settings?select=data')).json();
    const remote = rows[0]?.data || {};
    store.mergeSettings(remote);
    const local = store.settingsDoc();
    const newer = Object.keys(local).some((k) => !remote[k] || local[k].ts > remote[k].ts);
    if (newer) await rest('settings?on_conflict=user_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ user_id: auth.user.id, data: local, updated_at: new Date(now()).toISOString() }) });
  }

  async function sync({ force = false } = {}) {
    if (!configured) return null;
    if (!auth) auth = (await storage.getMeta('auth')) || null;
    if (!auth) { set({ status: 'signed-out' }); return null; }
    if (!online()) { set({ status: 'offline' }); return null; }
    if (busy) return null;
    busy = true; set({ status: 'syncing', email: auth.user.email || '' });
    try {
      const lastFull = (await storage.getMeta('sync:full')) || 0;
      const full = force || now() - lastFull > 864e5; // daily safety re-pull guards against out-of-order commits
      const pushed = await push();
      const pulled = await pull(full);
      await syncSettings();
      await storage.setMeta('sync:last', now());
      set({ status: 'synced', last: now(), error: '', pushed, pulled });
      if (store.unsynced().length) schedule(1500); // answers recorded while we were syncing
      return { pushed, pulled };
    } catch (e) {
      if (e.status === 401 && !auth) set({ status: 'signed-out' });
      else if (e instanceof TypeError || !online()) set({ status: 'offline' }); // fetch network failure
      else set({ status: 'error', error: e.message });
      return null;
    } finally { busy = false; }
  }

  function schedule(ms = 2500) { if (!configured) return; clearTimeout(timer); timer = setTimeout(() => sync(), ms); }
  async function start() {
    if (started) return; started = true;
    if (!configured) return set({ status: 'unconfigured' });
    auth = (await storage.getMeta('auth')) || null;
    set({ status: auth ? 'idle' : 'signed-out', email: auth?.user?.email || '', last: (await storage.getMeta('sync:last')) || 0 });
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => sync());
      window.addEventListener('offline', () => set({ status: 'offline' }));
      document.addEventListener('visibilitychange', () => sync()); // on show: pull; on hide: flush the outbox
      setInterval(() => { if (document.visibilityState === 'visible') sync(); }, 60e3);
    }
    store.subscribe(() => schedule());
    sync();
  }
  return { info, configured, start, sync, schedule, sendCode, verifyCode, handleHash, signOut };
}
