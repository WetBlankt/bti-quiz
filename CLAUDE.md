# CLAUDE.md - Business Trade in India study app

Read this file and PROGRESS.md first, inspect the code, then continue. **Do not rebuild working parts.**

## What this is
An offline-first, gamified quiz PWA (Kahoot + Duolingo + Quizlet) for the college subject *Business and Trade in Ancient India*.
Claude is used only to BUILD it. At runtime there is **no AI, no LLM call, no API**: questions are stored in `data/`, and
answer checking, XP, streaks, mastery and stats all run locally.

## Hard requirements (from the user - never violate)
1. Works with no internet and no AI credits. Quizzing must never wait on the network.
2. One codebase for Android (installed PWA) and Windows (browser/installed PWA). Responsive.
3. Progress syncs across devices (laptop <-> phone), local-first, safe conflict handling, never silently overwrite newer data.
4. **Dark UI is the default and primary design.** Light theme is optional/secondary - do not spend time on it.
5. Sounds optional, never forced, generated locally (no streaming). Off = instantly silent.
6. Fast mode: minimal animation, instant feedback, auto-advance on correct answers.
7. Content comes ONLY from SYLLABUS.md (the 9 uploaded session decks). **Never invent facts.** Flag ambiguity (see FLAGS in SYLLABUS.md).
8. working > complicated, fast > flashy, useful for studying > impressive. No unnecessary libraries or features.

## Source of truth
- `SYLLABUS.md` -> `python tools/build-syllabus.py` -> `data/syllabus.json` (9 modules, **91 topics**, stable ids `m1-t1`...).
- `data/questions/mN.json` = `{ "module": "mN", "questions": [...], "cards": [...] }`. `data/manifest.json` lists the files
  (`npm run manifest`). Question ids are permanent: `m3-t4-q012`. Never renumber or reuse an id (progress is keyed on it).

## Question schema (see js/data.js `normalizeQuestion`)
```
{ id, topic, difficulty: easy|medium|hard, type, question, explanation, ...type fields }
type: mcq | tf | multi | match | fill | ar | scenario | not | concept | compare
choice types (mcq, scenario, not, concept, compare, ar): options[2-6], answer: <index>
tf: answer: true|false          multi: options[>=3], answer: [indices]
match: pairs: [[left,right],...] (2-7)       fill: accept: ["main answer", "variant", ...]
ar: use the 4 standard Assertion-Reason options (fixedOrder is automatic)
optional: fixedOrder:true (needed if an option says "all of the above"), tags
```
Options are shuffled at display time, so authoring order does not matter. Wrong options must be plausible.
Test each concept from several angles (definition, scenario, comparison, interpretation, "which is NOT").
Run `npm run validate` after every change to questions (ids, topics, answer ranges, near-duplicates, answer-position balance, **true/false must be 25-75% false per module, assertion-reason keys must use at least 3 of the 4 keys**). The bank is COMPLETE at 1,000 questions (M1-M8 = 110 each, M9 = 120; difficulty 200/500/300); `tests/bank.test.mjs` pins these numbers, so change them deliberately.
Authoring helpers: `tools/qb.py` (deterministic option shuffle + difficulty balancing), `tools/patch.py` (edit by id). Never put the correct option in a fixed slot or make it the longest option.

## Architecture (no build step, plain ES modules)
| File | Role |
|---|---|
| `js/engine.js` | Pure rules. **Progress = fold over an append-only event log** (`buildState`). XP, levels, mastery 0-5, spaced-repetition intervals, achievements, day streaks. |
| `js/check.js` | Local answer checking (choice/multi/match/fill with typo tolerance on long answers). |
| `js/select.js` | Adaptive selection: weighted by mastery, mistakes, SRS due date; weak/mistakes/exam modes. |
| `js/store.js` | Owns events, state, settings, outbox. `addAttempt` is synchronous; persistence is background. Deterministic ids for module/achievement awards. |
| `js/storage.js` | IndexedDB adapter (+ in-memory for tests). |
| `js/sync.js` | Supabase REST + email-code auth via plain fetch. Push unsynced -> pull by `seq` cursor -> merge settings. |
| `js/sound.js` | Web Audio synthesised sounds. |
| `js/data.js` | Loads/validates syllabus + questions, search index. |
| `js/views/*.js`, `js/main.js` | UI, hash router (`#/`, `#/study`, `#/module/m1`, `#/quiz`, `#/flash`, `#/mistakes`, `#/stats`, `#/search`, `#/settings`). |
| `sw.js` | Service worker (static-host safe, all paths relative): precache with `cache:'reload'`, runtime **network-first** (3 s timeout) then cache, so updates appear without a version bump and offline still works. |

### Sync model (important)
- Event types: `att` (answer), `qz` (quiz done), `fl` (flashcard), `mc` (module complete), `ach` (achievement), `rs` (reset: scope `all` or `mN`).
- Events are immutable and unique by id -> merge = set union. Sorted by (ts, id) and replayed, so every device derives identical state.
- A reset event kills earlier events in scope; newer events survive. Reset does NOT delete cloud rows.
- Settings merge last-writer-wins per key (`{v, ts}`).
- Local `ts` is forced strictly increasing. A full re-pull happens daily as a guard against out-of-order commits.
- Quiz sessions (resume) are device-local and never synced.

## Rules for working in this repo
- After each milestone: run `npm test`, `npm run validate`, `npm run e2e`; update PROGRESS.md; leave the app runnable.
- Adding/removing a file under js/, css/, icons/ requires editing `SHELL` in `sw.js` (tests/sw.test.mjs + `npm run build:pages` enforce this) and bumping `VERSION` (it also cleans old caches). Changing the *content* of existing files needs NO version bump: the runtime is network-first.
- All DOM text via `h()` (no innerHTML). No remote scripts/fonts/images (a test enforces this).
- Do not put the topic name on a question card before it is answered (it can leak the answer).
- Module "completed" = >=80% of its questions at mastery >= 3. XP numbers live in `engine.js` (`XP`).
- Never hand-edit `data/syllabus.json` or `data/manifest.json`; regenerate.


## Deployment architecture (GitHub Pages) - READ BEFORE TOUCHING PATHS OR sw.js
- The app is 100% static files: `index.html`, `manifest.webmanifest`, `sw.js`, `css/`, `js/`, `data/`, `icons/`, `.nojekyll`. **Nothing runs on a server.** `tools/serve.mjs` (`npm start`) is only a local convenience; no app file may import or reference it (tested).
- It is hosted as a *project site*: `https://USERNAME.github.io/bti-quiz/` - i.e. under a SUBPATH. **Never write a URL starting with `/`** (src/href/fetch/url()/register/import). Use relative paths (`./`, `css/app.css`, `data/...`). The manifest uses `start_url: "./"`, `scope: "./"`, `id: "./"`; the SW is registered as `./sw.js`; data is loaded from `./data/`. Routing is hash-based (`#/study`), so GitHub needs no rewrite rules.
- `.nojekyll` must stay at the repo root (stops GitHub running Jekyll).
- Deploy = push the repo root to GitHub; Pages settings: Deploy from a branch -> `main` -> `/ (root)`. `index.html` must be at the repository root.
- GitHub serves files with `Cache-Control: max-age=600`. Therefore: the SW precache fetches with `cache:'reload'` and runtime requests use `cache:'no-cache'` (conditional requests). Do not "simplify" these back to `cache.addAll()` / plain `fetch` - the update test fails without them (proved by mutation).
- `npm run build:pages` -> `dist/` (runtime files only) + static verification (no absolute paths, no server/remote refs, precache complete, manifest/icons/data present). Deploying `dist/` instead of the root also works.
- `npm run e2e:pages` serves `dist/` through `tools/pages-sim.py` (DEV ONLY, plain static host: serves only under `/bti-quiz/`, 404 elsewhere, 10-min cache header) and drives Chromium: subpath redirect, SW scope, Chrome installability (normal profile), 1,000 questions, quizzes from all modules, resume, persistence, sound, exam, search, flashcards, offline, redeploy/update, server log must show no request outside `/bti-quiz/` and no 404.
- Progress lives in IndexedDB per ORIGIN (`USERNAME.github.io`), so it is separate from `localhost` and from other devices (sync is optional, see `SYNC_SETUP.md`; Export/Import in Settings moves progress by file).

## Startup must never fail silently (rule added after the "stuck on Loading..." report)
- `index.html` has a plain (non-module) watchdog script BEFORE the module script. A module that fails to load (404, syntax error) cannot report itself, so the watchdog shows the failing file (from resource timing) / error and a "Clear cached app files & reload" button (`window.__btiReset`: unregisters the SW + deletes Cache Storage only; IndexedDB progress is never touched). The loading box is `<div class="boot" data-loading>`; keep that attribute.
- `boot().catch(showFatal)` in `js/main.js` shows any startup exception. `idbStorage()` times out (5 s) / rejects on blocked, so a hung IndexedDB falls back to memory storage with a visible "progress will NOT be saved" toast.
- Guarded by `tests/startup.test.mjs`, `tests/pages.test.mjs`, and `npm run e2e:startup` (9 injected faults: missing/syntax-broken JS, missing data, hung/absent/failing IndexedDB - each must show a reason or recover, never a bare "Loading...").
""
## Commands
`npm start` (http://localhost:8080) | `npm run build:pages` | `npm run e2e:pages` | `npm test` (unit+sync, needs `npm i`) | `npm run validate` | `npm run manifest` | `npm run syllabus` |
`npm run e2e` (real Chromium via Playwright; set `PW_CHROMIUM=<browser binary>` if needed) | `npm run e2e:module -- m3` (plays every question of a module through the UI).

## Question-bank rules learned the hard way
- Facts only from SYLLABUS.md (deck details used for questions are recorded there as "Deck detail"). If a fact is not in SYLLABUS.md, do not ask it (e.g. what ESG stands for, a definition of arbitration).
- FLAGS are enforced by tests: no Kanishka years; Seleucus treaty = Session 11 only; coastline figures must name their session; unusual Session 7 claims phrased "according to the session".
- Long unbroken words/definitions must wrap on a 360px screen (CSS handles it; the module browser check fails on overflow).
- Provenance note: m2-m9 existed before the audit; they were audited and corrected, see PROGRESS.md.
