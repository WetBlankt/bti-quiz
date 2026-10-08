import { h } from '../dom.js';
import { SOUND_OPTIONS } from '../sound.js';
import { fmtAgo } from '../util.js';

export default function settings(ctx) {
  const { store, sound, sync, data } = ctx;
  const sw = (key, label, desc) => {
    const b = h('button', { class: 'switch', role: 'switch', 'aria-checked': String(!!store.get(key)), 'aria-label': label, onclick: () => { store.set(key, !store.get(key)); b.setAttribute('aria-checked', String(!!store.get(key))); if (key === 'sound' && store.get(key)) sound.preview('correct', store.get('sCorrect')); } });
    return row(label, desc, b);
  };
  const pick = (key, kind, label) => {
    const sel = h('select', { 'aria-label': label, onchange: (e) => { store.set(key, e.target.value); sound.preview(kind, e.target.value); } }, SOUND_OPTIONS[kind].map(([v, l]) => h('option', { value: v }, l)));
    sel.value = store.get(key);
    return row(label, null, h('div', { class: 'row gap-s' }, sel, h('button', { class: 'btn sm', onclick: () => sound.preview(kind, store.get(key)), 'aria-label': 'Preview ' + label }, '▶')));
  };
  const vol = h('input', { type: 'range', min: 0, max: 100, value: store.get('volume'), 'aria-label': 'Volume' });
  const volLabel = h('b', null, store.get('volume') + '%');
  vol.addEventListener('input', () => { store.set('volume', +vol.value); volLabel.textContent = vol.value + '%'; });
  vol.addEventListener('change', () => sound.preview('correct', store.get('sCorrect')));

  const resetSel = h('select', { 'aria-label': 'Module to reset' }, data.modules.map((m) => h('option', { value: m.id }, `${m.n}. ${m.short}`)));
  const file = h('input', { type: 'file', accept: 'application/json,.json', class: 'hidden', onchange: async (e) => {
    try { const f = e.target.files[0]; if (!f) return; const n = store.importData(JSON.parse(await f.text())); ctx.toast(n ? `Imported ${n} events` : 'Nothing new in that file'); } catch (err) { ctx.toast('Import failed: ' + err.message); }
  } });

  return h('div', { class: 'page', style: { maxWidth: '760px' } },
    h('h1', { class: 'h1' }, 'Settings'),
    h('section', { class: 'card' }, h('h2', { class: 'h2' }, 'Sound'),
      sw('sound', 'Sound effects', 'Short tones generated on your device. Off means silent immediately.'),
      row('Volume', null, h('div', { class: 'row', style: { width: '55%' } }, vol, volLabel)),
      pick('sCorrect', 'correct', 'Correct answer sound'), pick('sWrong', 'wrong', 'Incorrect answer sound'), pick('sAch', 'ach', 'Achievement sound')),
    h('section', { class: 'card' }, h('h2', { class: 'h2' }, 'Speed and display'),
      sw('fast', 'Fast mode', 'No animations, correct answers auto-advance, explanation only on mistakes.'),
      sw('anim', 'Animations', 'Subtle motion on answers and cards. Fast mode turns these off.'),
      row('Theme', 'Dark is the main design.', h('div', { class: 'chips' }, ['dark', 'light'].map((t) => h('button', { class: 'chip' + (store.get('theme') === t ? ' on' : ''), onclick: () => { store.set('theme', t); ctx.rerender(); } }, t[0].toUpperCase() + t.slice(1)))))),
    syncCard(ctx),
    h('section', { class: 'card' }, h('h2', { class: 'h2' }, 'Your data'),
      row('Back up progress', 'Download everything as a file. Importing merges, never overwrites.', h('div', { class: 'row gap-s' }, h('button', { class: 'btn sm', onclick: () => download(store.exportData()) }, 'Export'), h('button', { class: 'btn sm', onclick: () => file.click() }, 'Import'), file)),
      row('Reset one module', 'Clears XP, mastery and mistakes for that module only.', h('div', { class: 'row gap-s' }, resetSel, h('button', { class: 'btn sm bad', onclick: () => { const m = data.moduleMap.get(resetSel.value); if (confirm(`Reset all progress for Module ${m.n}: ${m.short}? This cannot be undone.`)) { store.reset(m.id); ctx.toast('Module progress reset'); } } }, 'Reset'))),
      row('Reset everything', 'XP, level, streaks, mastery, mistakes, history, achievements, flashcards.', h('button', { class: 'btn sm bad', onclick: () => { if (confirm('Reset ALL progress on all your devices? This cannot be undone.') && confirm('Really erase everything?')) { store.reset('all'); ctx.toast('All progress reset'); } } }, 'Reset all'))),
    h('section', { class: 'card' }, h('h2', { class: 'h2' }, 'App'),
      row('Install', 'Add to your phone or desktop and use it like an app.', h('button', { class: 'btn sm', onclick: async () => { if (ctx.installEvt) { ctx.installEvt.prompt(); ctx.installEvt = null; } else ctx.toast('Use your browser menu: "Install app" or "Add to Home screen".', { ms: 4500 }); } }, 'Install')),
      row('Question bank', `${data.questions.length} questions, ${data.cards.length} flashcards, version ${data.version || '?'}`, null),
      row('This device', `Device id ${store.deviceId}. ${store.eventCount()} events stored locally.`, null)));
}

function syncCard(ctx) {
  const { sync, store } = ctx;
  const i = sync.info;
  const dot = { synced: 'ok', idle: 'ok', syncing: 'warn', offline: 'warn', 'signed-out': 'warn', error: 'err', unconfigured: '' }[i.status] || '';
  const text = { unconfigured: 'Sync is not set up. The app works fully on this device.', 'signed-out': 'Not signed in.', idle: 'Signed in.', syncing: 'Syncing…', synced: 'Up to date.', offline: 'Offline. Progress is saved here and will sync when you are connected.', error: 'Sync problem: ' + i.error }[i.status];
  const body = [row('Status', text, h('span', { class: 'sync-dot ' + dot })), i.email ? row('Account', i.email, h('button', { class: 'btn sm ghost', onclick: async () => { await sync.signOut(); ctx.rerender(); } }, 'Sign out')) : null,
    i.last ? row('Last synced', fmtAgo(i.last), h('button', { class: 'btn sm', onclick: () => sync.sync({ force: true }).then(() => ctx.rerender()) }, 'Sync now')) : null,
    row('Pending on this device', `${store.unsynced().length} change${store.unsynced().length === 1 ? '' : 's'} waiting to upload`, null)];
  if (sync.configured && !i.email) {
    const email = h('input', { type: 'email', placeholder: 'you@example.com', autocomplete: 'email', 'aria-label': 'Email' });
    const code = h('input', { type: 'text', inputmode: 'numeric', placeholder: '6-digit code from the email', autocomplete: 'one-time-code', class: 'hidden', 'aria-label': 'Code' });
    const go = h('button', { class: 'btn primary block' }, 'Email me a sign-in code');
    let sent = false;
    go.onclick = async () => {
      try {
        if (!sent) { await sync.sendCode(email.value.trim()); sent = true; code.classList.remove('hidden'); go.textContent = 'Sign in'; ctx.toast('Check your email for the code'); code.focus(); }
        else { await sync.verifyCode(email.value.trim(), code.value); ctx.toast('Signed in. Syncing…'); ctx.rerender(); }
      } catch (e) { ctx.toast(e.message, { ms: 4500 }); }
    };
    body.push(h('div', { class: 'grid', style: { gap: '8px', paddingTop: '12px' } }, h('div', { class: 'muted small' }, 'Sign in on each device with the same email to share progress. No password, and your answers are never sent to an AI.'), email, code, go));
  }
  return h('section', { class: 'card' }, h('h2', { class: 'h2' }, 'Sync and devices'), body);
}
function row(label, desc, control) { return h('div', { class: 'setrow' }, h('div', null, h('div', { style: { fontWeight: 650 } }, label), desc ? h('div', { class: 'd' }, desc) : null), control); }
function download(obj) {
  const a = h('a', { href: URL.createObjectURL(new Blob([JSON.stringify(obj)], { type: 'application/json' })), download: `bti-progress-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(a); a.click(); a.remove();
}
