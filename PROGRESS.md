# PROGRESS.md

Last updated: 2026-10-05 (question bank complete). To resume: "Read CLAUDE.md and PROGRESS.md and continue from where you stopped."

## Status: app functional end-to-end, 1,000-question bank complete, and now **a static GitHub Pages PWA** (tested as a subpath site `/bti-quiz/`, installable, offline). Supabase sync is still optional / not set up.


## Question bank status (FINAL: 1,000 questions)
| Module | Questions | Easy | Medium | Hard |
|---|---|---|---|---|
| M1 Economic Administration | 110 | 22 | 55 | 33 |
| M2 Global Trade Network | 110 | 22 | 55 | 33 |
| M3 Exports & Imports | 110 | 22 | 55 | 33 |
| M4 Guilds & Regulation | 110 | 22 | 55 | 33 |
| M5 Banking & Finance | 110 | 22 | 55 | 33 |
| M6 Money & Ethics | 110 | 22 | 55 | 33 |
| M7 Mauryan State & Trade | 110 | 22 | 55 | 33 |
| M8 Kushanas & Silk Route | 110 | 22 | 55 | 33 |
| M9 Maritime Trade | 120 | 24 | 60 | 36 |
| **Total** | **1,000** | **200** | **500** | **300** |

Types (total): mcq 263, scenario 124, multi 103, fill 96, tf 95, ar 81, not 80, compare 77, concept 52, match 29. All 10 types appear in every module. All 91 topics have questions. 52 authored flashcards (+ every question is also a flashcard).

How it was produced / audited (2026-10-05):
- M1: the original 50 questions kept (ids are permanent), 60 added; 13 length-giveaway option sets rewritten; a few extra deck details (verified against the Session 5 deck) recorded in SYLLABUS.md under "Deck detail".
- M2-M9: these files were already present in `data/questions/` when this phase began (not authored in the audited session). They were **not trusted blindly**: every question and keyed answer was read against SYLLABUS.md; every wrong option of all 103 multi-select questions and every supported option of all 80 NOT questions was checked.
- Corrections made: true/false were almost all TRUE (M2/M3 11 of 11) and assertion-reason keys almost all "A" (M8 11 of 11) -> rebalanced (about half false; AR keys spread over all four). Two outside-knowledge questions (what ESG stands for; a definition of arbitration) replaced with session-supported ones. Several wording fixes (e.g. an invented "licence" detail). M1 option order reshuffled to balance answer positions.
- Difficulty labels: set to the required exact totals (22/55/33 per 110, 24/60/36 for M9) by `tools/qb.py` balance(): it promotes/demotes by question type (scenario/compare/AR/NOT/match/multi hardest). Labels therefore reflect type-based judgement, not student data - re-tier later from real results if wanted.
- Source conflicts handled per SYLLABUS.md FLAGS (enforced by tests/bank.test.mjs): no Kanishka years; Seleucus treaty only from Session 11 (c. 303 BCE, 500 war elephants, Hindu Kush, marriage alliance), never 321; no coastline figure without its session; unusual Session 7 claims always framed "according to the session".
- Known weaknesses: M6 (Session 10) has little content so its questions necessarily revisit the same ideas (no near-duplicates by the validator); some explanations are one sentence; scenario questions are applications of session ideas, not documented cases.

## Tools added for the bank
- `tools/validate-questions.mjs` (npm run validate): schema, ids, topic/module match, answer ranges, AR format, near-duplicate detector (token similarity >= 0.72), correct-option-length giveaway, answer-position balance, **true/false 25-75% false and AR keys spread per module**.
- `tools/qb.py`: authoring helper (deterministic option shuffling, difficulty balancing). `tools/patch.py`: edit questions by id.
- `tests/bank.test.mjs`: exact counts (1,000 / per module / 200-500-300), every keyed answer accepted by the real checker and a wrong one rejected, all 10 types per module, FLAGS respected.
- `tests/e2e/module.mjs` (npm run e2e:module [m1..m9]): in a real browser at 360px, plays EVERY question of a module through the UI correctly (expects green + explanation, no overflow) and wrongly (expects red), checks scoring, My Mistakes (all questions), flashcards, module page, "Quiz this module".
- CSS: long answers / match definitions now wrap (found by the module browser check); `sw.js` VERSION bumped to v2.


## Deployment status (static GitHub Pages) - DONE in code, needs the user's GitHub steps
What was wrong / fixed (2026-10-05):
- The app files were already static and relative; `tools/serve.mjs` was only a dev server. Real Pages risks fixed: added `.nojekyll`; service worker rewritten so updates reach phones despite GitHub's 10-minute HTTP cache (precache with `cache:'reload'`, runtime network-first with 3 s timeout + cache fallback, no manual version bump needed); manifest hardened (`id`, `lang`, `categories`, all relative); everything verified under a `/bti-quiz/` subpath for the first time.
- Added: `tools/build-pages.mjs` (build + static verification -> `dist/`), `tools/pages-sim.py` (dev-only GitHub-Pages-like static host), `tests/pages.test.mjs`, `tests/e2e/pages.mjs`, `SYNC_SETUP.md` (Supabase steps moved out of README), `.nojekyll`.
- Local workflow unchanged: `npm start` -> http://localhost:8080.
- Exact user steps are in README.md (A local, B GitHub Desktop publish/update, C Pages settings: branch `main`, folder `/ (root)`, D phone URL `https://USERNAME.github.io/bti-quiz/`).

Production test results (served as Pages serves it, no Node server): 36/36 - subpath redirect; SW scope `/bti-quiz/`; Chrome installability check clean in a normal profile; all 39 files precached; 1,000 questions from 9 modules; choice/multi/match/fill work; resume after refresh; IndexedDB persistence; deep link; sound on/off; fast mode; exam; search; flashcards; offline reload + quiz + search + stats; redeploy update (incl. a redeploy that does not touch sw.js); server log: 0 requests outside `/bti-quiz/`, 0 404s, 0 console errors. Mutation check: removing `cache:'reload'` makes the update test fail (stale CSS), so the guard is real.

Remaining limitations: not run on the real github.io or a physical Android phone (simulated with a faithful static host + Chromium's own installability check); iOS "Add to Home Screen" untested; progress is per-device/per-origin until sync is set up (Export/Import in Settings moves it); the first load needs internet.

## "Stuck on Loading..." investigation (2026-10-08) - cause on the user's live site NOT yet confirmed
- The sandbox cannot reach github.io/github.com (proxy blocks it; `gh` token invalid) and the repo URL is unknown, so the live deployment could not be inspected. The shipped build starts correctly on a subpath static host (pages e2e 36/36), so the failure is something that differs on the user's deployment.
- Reproduced instead: four distinct faults all leave a silent "Loading..." (any JS file 404 incl. `main.js`; JS syntax/unsupported-syntax error; `indexedDB.open` never answering; IndexedDB read throwing in `store.init`). A missing question/syllabus file already showed a message.
- Fixed the design defect (silent failure): watchdog in index.html, `showFatal`, bounded IndexedDB open, memory-fallback warning (see CLAUDE.md). Question bank untouched (byte-identical).
- NEXT: ask the user what the screen now shows (or the browser console / Network tab) after redeploying; most likely a file missing from the repo (wrong folder level or files not pushed). Then fix that exact cause.
- Tests: unit 62/62; validate OK; `e2e:startup` 9/9; `e2e:pages` 36/36; `e2e` 47/47; `e2e:module` all 9.

## Phases (user's 12-phase plan)
| # | Phase | Status |
|---|---|---|
| 1 | Architecture + basic UI | Done |
| 2 | Syllabus / question-bank structure | Done (SYLLABUS.md -> syllabus.json, schema, validator, manifest) |
| 3 | Quiz engine | Done (all 10 types, 7 modes + flashcards) |
| 4 | Answer checking + feedback | Done |
| 5 | Local persistence | Done (IndexedDB, session resume) |
| 6 | Statistics + mistake tracking | Done |
| 7 | Gamification | Done (XP, 8 levels, streaks, 14 achievements) |
| 8 | Adaptive / spaced repetition | Done (deterministic, unit-tested) |
| 9 | Sound system | Done (synthesised; 5 correct / 5 wrong / 4 achievement sounds) |
| 10 | Cross-device sync | Code done + tested against a MOCK server only. Needs a real Supabase project. |
| 11 | Mobile / PWA optimisation | Done and tested as a static subpath PWA (see Deployment status). Real-phone check outstanding. |
| 12 | Testing + bug fixing | Automated suite green; real-device and real-Supabase testing outstanding |

## Completed
- Dark-mode UI, dashboard, module + topic screens, quiz (large buttons, instant feedback, XP pop, streak), results with review + "Retry missed".
- Modes: quick (5-50), module, topic, weak areas, my mistakes, exam (timed, no feedback), flashcards. Filters: module, topic, difficulty, type, progress status.
- Search (topics, questions, explanations, flashcards) with "quiz me on these".
- Stats: overall, 14-day chart, mastery distribution, by module, by topic, history, achievements.
- Settings: sound on/off + volume + 3 sound pickers with preview, fast mode, animations, theme, export/import, reset module / all, sync status + sign-in, install.
- Offline: service worker; verified in Chromium with the network cut.
- Question bank: 1,000 questions, 9 modules, 91 topics (see table above).

## In progress
Nothing half-written.

## Remaining (in order)
1. **User: set up Supabase** (README -> "Turn on sync") and test laptop <-> phone with the real service.
2. **Deploy over HTTPS** (GitHub Pages) so the phone can install it; test "Add to Home screen" on Android and install on Windows.
3. ~~Generate the question bank~~ DONE (1,000 questions). Optional later: re-tier difficulty from real results; add more authored flashcards.
4. Resolve FLAGS in SYLLABUS.md with the user before writing questions that touch them (coastline km, Seleucus treaty date, Kanishka dates, Session 7 simplifications).
5. Optional polish: light-theme visual QA, per-module "completed" celebration screen, daily goal.

## Architecture (summary - details in CLAUDE.md)
Plain ES modules, no build. Event-sourced progress; local-first IndexedDB; Supabase sync via REST with email-code login; synthesised audio; cache-first service worker.

## Important decisions
- Progress is an event log, not a mutable record -> sync is a set union; resets are events.
- Sounds are synthesised (Web Audio) instead of audio files: zero bytes, offline, instantly silenced.
- Missed questions return as a "Retry missed" round after the quiz (not re-queued mid-quiz) so scoring stays clean.
- Topic names hidden on question/flashcard faces until answered (they leaked answers).
- XP: +10 correct, streak bonus +2 per 3 in a row (cap +10), +5 on mistake review, quiz completion +20 (+10 at >=70%, +20 at >=90%, only for 5+ questions), module +150, achievement +25.
- Levels: Barterer 0, Apprentice 100, Trader 300, Guild Member 650, Analyst 1100, Shreshthi 1800, Expert 2800, Master 4200.
- Mastery: 0 new, 1 seen/last wrong, 2 correct once, 3 twice in a row, 4 three in a row, 5 four+. Intervals: wrong 10 min, then 1d, 3d, 7d, 21d. Mastered questions keep weight >0 so they return.
- Syllabus has **91 topics** (earlier chat said 99 - that was a miscount).

## Known bugs / limitations
- Sync has only run against `tests/mock-supabase.mjs`; real Supabase behaviour (email template, rate limits, RLS) unverified.
- Sound is verified to schedule/silence correctly but has not been listened to by a human.
- Not tested on a real Android device or an installed Windows PWA.
- Light theme exists but is not visually QA'd.
- "Reset" leaves old events in the cloud (ignored on replay); there is no "delete my cloud data" button.
- Supabase email must include the 6-digit code (`{{ .Token }}`) - default template only has a link.
- iOS Safari not targeted/tested.

## Database / schema status
`supabase/schema.sql` written (tables `events`, `settings`, RLS own-rows only, events insert-only). **Not yet run on a real project.**

## Testing status (2026-10-05, after the GitHub Pages work)
- `npm test`: 57/57 (adds tests/pages.test.mjs: static build verifies, .nojekyll, relative manifest, SW cache rules, no Node imports in app).
- `npm run validate`: OK, 0 errors, 0 warnings, 0 near-duplicates (1,000 questions).
- `npm run e2e`: 47/47 (local, `npm start` server). `npm run e2e:module`: all 9 modules pass.
- `npm run build:pages` OK; `npm run e2e:pages`: 36/36 (Pages-style subpath host).

## Next exact steps
1. User: follow README.md B and C (GitHub Desktop publish, Settings -> Pages -> main / root), then open `https://USERNAME.github.io/bti-quiz/` on the phone, install, test offline.
2. After any change: `npm test && npm run validate && npm run build:pages && npm run e2e:pages` (and `npm run e2e` / `npm run e2e:module` if UI or questions changed), then commit + push with GitHub Desktop. Changing file CONTENT needs no SW version bump; adding/removing app files needs `SHELL` + `VERSION` in sw.js.
3. Optional later: Supabase sync (`SYNC_SETUP.md`); skim Module 6 questions; re-tier difficulty from real results.
