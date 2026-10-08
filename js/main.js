import { h, $ } from './dom.js';
import { loadData } from './data.js';
import { idbStorage, memoryStorage } from './storage.js';
import { createStore } from './store.js';
import { createSound } from './sound.js';
import { createSync } from './sync.js';
import { CONFIG } from './config.js';
import { ACHIEVEMENTS, XP } from './engine.js';
import { fmtAgo } from './util.js';
import { mistakeIds } from './views/helpers.js';
import home from './views/home.js';
import study from './views/study.js';
import moduleView from './views/module.js';
import quizView, { resumeQuiz } from './views/quiz.js';
import flash from './views/flash.js';
import mistakes from './views/mistakes.js';
import stats from './views/stats.js';
import search from './views/search.js';
import settings from './views/settings.js';

const ROUTES = { '': home, study, module: moduleView, quiz: quizView, flash, mistakes, stats, search, settings };
const NAV = [['/', '🏠', 'Home'], ['/study', '🎯', 'Study'], ['/mistakes', '❌', 'Mistakes'], ['/stats', '📊', 'Stats'], ['/settings', '⚙️', 'Settings']];

async function boot() {
  const root = $('#app');
  let storage;
  try { storage = await idbStorage(); } catch (e) { console.warn('IndexedDB unavailable, using memory', e); storage = memoryStorage(); }
  let data;
  try { data = await loadData(); } catch (e) {
    root.replaceChildren(h('div', { class: 'boot', style: { padding: '24px', textAlign: 'center' } }, 'Could not load the question bank. Open the app once while online so it can cache for offline use. (' + e.message + ')'));
    return;
  }
  const store = createStore({ storage, data });
  await store.init();
  const sound = createSound(() => ({ sound: store.get('sound'), volume: store.get('volume'), sCorrect: store.get('sCorrect'), sWrong: store.get('sWrong'), sAch: store.get('sAch') }));
  const sync = createSync({ store, storage, config: CONFIG, onStatus: () => paintChrome() });

  const ctx = { data, store, sound, sync, session: null, saved: (await store.loadSession()) || null, flashCfg: null, studyCfg: null, installEvt: null, cleanups: [] };
  ctx.go = (p) => { if (location.hash === '#' + p) route(); else location.hash = '#' + p; };
  ctx.rerender = () => route();
  ctx.onLeave = (fn) => ctx.cleanups.push(fn);
  ctx.saveSession = (s) => { ctx.saved = s; return store.saveSession(s); };
  ctx.clearSession = () => { ctx.saved = null; return store.clearSession(); };
  ctx.toast = toast;
  ctx.announce = (r) => {
    if (!r) return;
    let fx = false;
    for (const id of r.ach || []) { const a = ACHIEVEMENTS.find((x) => x.id === id); if (a) { toast(`${a.icon} ${a.name} unlocked  +${XP.achievement} XP`, { kind: 'ach', ms: 4200 }); fx = true; } }
    for (const m of r.mods || []) { toast(`📚 Module ${m.n} complete!  +${XP.module} XP`, { kind: 'ach', ms: 4800 }); fx = true; }
    if (r.levelUp) { toast(`⬆️ Level ${r.levelUp.level}: ${r.levelUp.name}`, { kind: 'ach', ms: 4800 }); fx = true; }
    if (fx) sound.play('ach');
  };

  const shell = h('div', { id: 'shell' });
  const nav = h('nav', { id: 'nav', 'aria-label': 'Main' });
  const top = h('header', { id: 'top' });
  const netbar = h('div', { class: 'netbar' });
  const view = h('main', { id: 'view' });
  const toasts = h('div', { id: 'toasts', 'aria-live': 'polite' });
  shell.append(nav, h('div', { id: 'main' }, top, netbar, view), toasts);
  root.replaceChildren(shell);

  function toast(msg, o = {}) {
    const t = h('div', { class: 'toast ' + (o.kind || '') }, h('span', null, msg), o.action ? h('button', { onclick: () => { o.action.fn(); t.remove(); } }, o.action.label) : null);
    toasts.append(t);
    while (toasts.children.length > 4) toasts.firstChild.remove();
    setTimeout(() => t.remove(), o.ms || 2800);
  }

  function applySettings() {
    const d = document.documentElement, fast = store.get('fast');
    d.dataset.theme = store.get('theme') === 'light' ? 'light' : 'dark';
    d.classList.toggle('fast', !!fast);
    d.classList.toggle('anim', !!store.get('anim') && !fast);
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', d.dataset.theme === 'light' ? '#eef1fb' : '#0a0e1f');
    if (!store.get('sound')) sound.silence();
  }

  const SYNC_LABEL = { unconfigured: ['Local only', ''], 'signed-out': ['Not signed in', 'warn'], idle: ['Ready', 'ok'], syncing: ['Syncing…', 'warn'], synced: ['Synced', 'ok'], offline: ['Offline', 'warn'], error: ['Sync error', 'err'] };
  function paintChrome() {
    const path = current();
    const mc = mistakeIds(ctx).length;
    nav.replaceChildren(
      h('div', { class: 'brand' }, 'Business Trade ', h('b', null, 'in India')),
      ...NAV.map(([p, ic, label]) => h('a', { href: '#' + p, class: path === p || (p === '/study' && /^\/(module|flash)/.test(path)) ? 'on' : '' }, h('span', { class: 'ic' }, ic), h('span', null, label + (p === '/mistakes' && mc ? ` (${mc})` : '')))),
      h('div', { class: 'side-foot' }, `${data.questions.length} questions · v${data.version || ''}`),
    );
    const [lab, cls] = SYNC_LABEL[sync.info.status] || SYNC_LABEL.idle;
    top.replaceChildren(
      h('div', { class: 'logo grow' }, 'Business Trade ', h('b', null, 'in India')),
      h('button', { class: 'chip', onclick: () => ctx.go('/settings'), 'aria-label': 'Sync status: ' + lab }, h('span', { class: 'sync-dot ' + cls }), ' ' + lab),
      h('button', { class: 'icon-btn', onclick: () => ctx.go('/search'), 'aria-label': 'Search' }, '🔍'),
    );
    const off = navigator.onLine === false;
    netbar.replaceChildren(off ? h('div', null, sync.configured ? 'Offline — progress will sync when connected.' : 'Offline — everything still works; progress is saved on this device.') : '');
    shell.classList.toggle('immersive', path === '/quiz' || path === '/flash');
  }
  const current = () => '/' + (location.hash.replace(/^#\/?/, '').split('/')[0] || '');

  let renderQueued = false;
  function route() {
    ctx.cleanups.splice(0).forEach((f) => { try { f(); } catch {} });
    const [name = '', ...params] = location.hash.replace(/^#\/?/, '').split('/');
    const fn = ROUTES[name] || home;
    paintChrome();
    let el;
    try { el = fn(ctx, params); } catch (e) { console.error(e); el = h('div', { class: 'page' }, h('div', { class: 'card' }, 'Something went wrong showing this screen: ' + e.message)); }
    view.replaceChildren(el);
    window.scrollTo(0, 0);
  }
  // live-update data screens when progress changes (e.g. a sync brings in answers from another device)
  store.subscribe(() => {
    applySettings();
    const name = location.hash.replace(/^#\/?/, '').split('/')[0];
    if (['quiz', 'flash', 'search', 'settings', 'study'].includes(name) || renderQueued) { paintChrome(); return; }
    if (document.activeElement && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
    renderQueued = true; requestAnimationFrame(() => { renderQueued = false; route(); });
  });

  applySettings();
  window.addEventListener('hashchange', route);
  window.addEventListener('online', paintChrome); window.addEventListener('offline', paintChrome);
  const unlock = () => sound.unlock();
  document.addEventListener('pointerdown', unlock, { once: true }); document.addEventListener('keydown', unlock, { once: true });
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); ctx.installEvt = e; });

  // magic-link return
  if (location.hash.includes('access_token=')) { try { await sync.handleHash(location.hash); } catch (e) { console.warn(e); } history.replaceState(null, '', location.pathname); }
  if (storage.kind === 'memory') toast('Browser storage is unavailable - your progress will NOT be saved on this device.', { ms: 15000 });
  route();
  sync.start();
  if (new URLSearchParams(location.search).has('resume') && ctx.saved) resumeQuiz(ctx);

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('./sw.js').then((reg) => {
      reg?.addEventListener('updatefound', () => {
        const nw = reg.installing;
        nw?.addEventListener('statechange', () => { if (nw.state === 'installed' && navigator.serviceWorker.controller) toast('Update ready', { ms: 12000, action: { label: 'Reload', fn: () => location.reload() } }); });
      });
    }).catch((e) => console.warn('SW registration failed', e));
  }
  window.__app = ctx; // handy for debugging / e2e
}
// Startup must never fail silently: whatever throws, the person sees the real reason instead of "Loading...".
function showFatal(e) {
  console.error('Startup failed', e);
  const root = document.getElementById('app'); if (!root) return;
  root.replaceChildren(h('div', { class: 'boot' }, h('div', { style: { maxWidth: '34rem', padding: '24px' } },
    h('h2', {}, 'The app could not start'),
    h('p', {}, String((e && e.message) || e)),
    h('p', { style: { color: 'var(--muted)' } }, 'Your saved progress is not deleted by this.'),
    h('button', { class: 'btn', onclick: () => (window.__btiReset ? window.__btiReset() : location.reload()) }, 'Clear cached app files & reload'))));
}
boot().catch(showFatal);
