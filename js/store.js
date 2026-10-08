// The store owns the event log, derived state, settings and the unsynced outbox.
// Every answer is applied in memory first (instant) and persisted in the background.
import { buildState, applyEvent, attemptXp, quizXp, levelInfo, XP, evalAchievements, groupStats } from './engine.js';
import { uid } from './util.js';

export const DEFAULT_SETTINGS = {
  sound: true, volume: 70, sCorrect: 'chime', sWrong: 'buzz', sAch: 'fanfare',
  anim: true, fast: false, theme: 'dark', examSecs: 60,
};
const stripLocal = (e) => { const { sy, ...rest } = e; return rest; };

export function createStore({ storage, data, now = Date.now }) {
  const events = new Map();
  let state = buildState([]);
  let settings = {}; // key -> {v, ts}
  let dev = 'dev';
  let resets = [];
  const subs = new Set();
  let queued = false;

  const notify = () => { if (queued) return; queued = true; Promise.resolve().then(() => { queued = false; subs.forEach((f) => { try { f(); } catch (e) { console.error(e); } }); }); };
  const nextTs = () => Math.max(now(), state.last + 1);
  const rebuild = () => { resets = [...events.values()].filter((e) => e.t === 'rs'); state = buildState([...events.values()]); };
  const resetEpoch = (scope) => resets.reduce((m, r) => (r.s === 'all' || r.s === scope ? Math.max(m, r.ts) : m), 0);

  function record(partial) {
    const e = { id: uid(), ts: nextTs(), dev, ...partial, sy: 0 };
    events.set(e.id, e);
    if (e.t === 'rs') { resets.push(e); rebuild(); } else applyEvent(state, e);
    storage.putEvents([e]).catch((err) => console.error('persist failed', err));
    notify();
    return e;
  }

  // Module completion + achievements: ids are deterministic so two offline devices can't double-award.
  function postChecks() {
    const out = { xp: 0, ach: [], mods: [] };
    for (const m of data.modules) {
      const qs = data.byModule.get(m.id) || [];
      if (!qs.length || state.done[m.id]) continue;
      const g = groupStats(state, qs);
      if (g.m3 / g.total >= 0.8) {
        const id = `mc:${m.id}:${resetEpoch(m.id)}`;
        if (!events.has(id)) { record({ id, t: 'mc', m: m.id, xp: XP.module }); out.xp += XP.module; out.mods.push(m); }
      }
    }
    const ctx = { moduleIds: data.modules.map((m) => m.id) };
    for (const a of evalAchievements(state, ctx)) {
      if (state.ach[a]) continue;
      const id = `ach:${a}:${resetEpoch('all')}`;
      if (events.has(id)) continue;
      record({ id, t: 'ach', a, xp: XP.achievement });
      out.xp += XP.achievement; out.ach.push(a);
    }
    return out;
  }

  const api = {
    async init() {
      const list = await storage.loadEvents();
      for (const e of list) events.set(e.id, e);
      dev = (await storage.getMeta('dev')) || uid().slice(0, 8);
      await storage.setMeta('dev', dev);
      settings = (await storage.getMeta('settings')) || {};
      rebuild();
    },
    get deviceId() { return dev; },
    getState: () => state,
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    eventCount: () => events.size,

    addAttempt({ q, ok, resp, mode, qz, sk }) {
      const before = levelInfo(state.xp);
      const xp = attemptXp({ ok, sk, mode });
      const event = record({ t: 'att', q: q.id, m: q.module, tp: q.topic, ok: ok ? 1 : 0, a: resp, mode, qz, sk, xp });
      const extra = postChecks();
      const after = levelInfo(state.xp);
      return { event, xp: xp + extra.xp, base: xp, ach: extra.ach, mods: extra.mods, levelUp: after.level > before.level ? after : null };
    },
    addQuizComplete({ qz, mode, total, correct, secs, mods }) {
      const before = levelInfo(state.xp);
      const xp = quizXp({ total, correct });
      record({ t: 'qz', qz, mode, n: total, c: correct, secs, m: mods.length === 1 ? mods[0] : 'mix', xp });
      const extra = postChecks();
      const after = levelInfo(state.xp);
      return { xp: xp + extra.xp, bonus: xp, ach: extra.ach, mods: extra.mods, levelUp: after.level > before.level ? after : null };
    },
    addFlash(card, st) { return record({ t: 'fl', c: card.id, st, m: card.module, tp: card.topic }); },
    reset(scope) { record({ t: 'rs', s: scope }); },

    // ---- sync surface
    unsynced: () => [...events.values()].filter((e) => !e.sy).map(stripLocal),
    markSynced(ids) { const ch = []; for (const id of ids) { const e = events.get(id); if (e && !e.sy) { e.sy = 1; ch.push(e); } } if (ch.length) storage.putEvents(ch); },
    mergeEvents(list, { synced = true } = {}) {
      const added = [], touched = [];
      for (const raw of list) {
        if (!raw || !raw.id || typeof raw.ts !== 'number' || !raw.t) continue;
        const have = events.get(raw.id);
        if (have) { if (synced && !have.sy) { have.sy = 1; touched.push(have); } continue; }
        const e = { ...stripLocal(raw), sy: synced ? 1 : 0 };
        events.set(e.id, e); added.push(e);
      }
      if (added.length) { rebuild(); notify(); }
      if (added.length || touched.length) storage.putEvents([...added, ...touched]);
      return added.length;
    },

    // ---- settings (last-writer-wins per key)
    get: (k) => (settings[k] ? settings[k].v : DEFAULT_SETTINGS[k]),
    set(k, v) { settings[k] = { v, ts: now() }; storage.setMeta('settings', settings); notify(); },
    settingsDoc: () => settings,
    mergeSettings(doc) {
      let ch = false;
      for (const [k, o] of Object.entries(doc || {})) if (o && typeof o.ts === 'number' && (!settings[k] || o.ts > settings[k].ts)) { settings[k] = o; ch = true; }
      if (ch) { storage.setMeta('settings', settings); notify(); }
      return ch;
    },

    // ---- device-local quiz session (resume after refresh); never synced
    saveSession: (s) => storage.setMeta('session', s),
    loadSession: () => storage.getMeta('session'),
    clearSession: () => storage.delMeta('session'),

    // ---- backup
    exportData: () => ({ app: 'bti-quiz', v: 1, exported: now(), events: [...events.values()].map(stripLocal), settings }),
    importData(obj) {
      if (!obj || obj.app !== 'bti-quiz' || !Array.isArray(obj.events)) throw new Error('Not a Business Trade quiz backup file');
      const n = api.mergeEvents(obj.events, { synced: false });
      api.mergeSettings(obj.settings);
      return n;
    },
  };
  return api;
}
