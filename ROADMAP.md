# ROADMAP — from prototype to product

Written 2026-09-23 after a full review of the app, the engine and the ledgers.
`NEXT.md` stays the ledger for engine rounds; this file is the product plan that
sits above it. Every item obeys `LOOP.md`'s eight constraints — in particular,
no new colours, no re-skin, no confident nonsense, nothing leaves the device.

## Where it stands

The engine is the strongest part of the product and the least visible. Twenty
measurements, six keyframes, an honest confidence model, a causal fault graph,
1,200+ checks. What surrounds it was built one round at a time and it shows:

- **The shell leaks.** No browser history, so the phone's back gesture leaves the
  app from any screen. Returning players see an empty home for a beat on load.
  The example report is dressed as a real serve, dated today, "measured on this
  device". Developer surfaces (device check, `?fixture`) are one tap from a player.
- **The report is long.** About twelve sections; the fix that matters competes
  with the machinery that found it.
- **The best features hide.** Progress lives in a bottom sheet, glance mode only
  exists after an in-app recording, backup sits inside the history sheet, and
  there is no settings surface at all.
- **App.tsx is 1,950 lines** of state, routing, demo seeding, pipeline and five
  inline sheets. Every product change pays that tax.
- **The truth gap.** Zero real-footage fixtures (`RECORDED = []`, need 6), no
  on-device timing, no court trip. Every band is derived from the synthetic rig.
- **No git remote.** Months of work exist on one disk.

## The seven areas

Ranked by what loses a player soonest.

### 1 · First-run trust — *does it work on my clip, and does it feel like an app*
The phone's back gesture must behave; the first screen must not flicker; the
example must say it is an example; a dropped file must survive the first-run
guide; the screen must not sleep during a thirty-second analysis.
**Done when** back closes a sheet or returns home from every screen, and a
cold load with history paints the history.

### 2 · A report you can act on in ten seconds
Lead with the one fix and its drill; fold the evidence (clip reading, playback,
area cards) behind clear section headings rather than deleting it; strip the
coach and lab jargon the voice lint cannot see ("explosive phase", "the brake").
**Done when** the focus card and drill are the whole first viewport and nothing
above the fold is machinery.

### 3 · Polish inside the settled system
No new palette — `LOOP.md` §3 and two rejected redesigns settle that. Polish is
motion, rhythm and states: sheets that animate out as well as in, screens that
cross-fade, skeletons instead of flashes, a filming guide with a picture instead
of prose, rotating tips that actually rotate, hard-coded tints named as tokens so
the next surface cannot drift.
**Done when** every hard-coded hex in `src/styles` is a token or a documented
one-off, and every screen change has a transition that respects reduced motion.

### 4 · Reasons to come back
Progress promoted from a sheet to a real screen; a settings surface (hand,
level, backup, device) so choices are not trapped inside a report; undo on
delete; glance mode reachable for any clip, not only in-app recordings.
**Done when** a player can change their hand without re-running an analysis and
can find their backup without opening history.

### 5 · Architecture that can carry a product
Split `App.tsx` into hooks (`useHistory`, `useAnalysisRun`,
`useProgressInsights`, `useOfflineWarmup`) and components (`ProgressScreen`,
`HistorySheet`, `ErrorScreen`, `FirstRunSheet`), move demo routing into
`dev/`, render `Report` once. Move pose inference into a Web Worker so the UI
thread stays live during analysis.
**Done when** `App.tsx` is under 700 lines and a worker owns MediaPipe.

### 6 · Engine truth
Finish the racket-detector work (a weak box must not hide the wrist estimate;
stale 19 MB copy), then the items only a phone can close: the six-clip fixture
shoot, the court trip's timings, R64's front-ankle landing. These need the
owner's phone and are listed so they stay visible, not so they are faked.
**Done when** `RECORDED.length >= 6` and `COURT-CHECK.md` has a real row.

### 7 · Market readiness
A git remote and a tagged release; manifest `id`, shortcuts and screenshots so
the install sheet sells the app; a hosted build with the offline badge proven
on iOS and Android; code-split the report and progress screens off the entry
chunk; an honest store-style listing drawn from README's first paragraph.
**Done when** someone can install it from a URL and use it in aeroplane mode.

---

## Execution plan

Waves run in order. Each item is one commit, green on
`npm run typecheck && npm run lint && npm test`, checked in the browser when
the player can see it. `[x]` done · `[~]` in progress · `[ ]` todo ·
`[!]` needs the owner · `[=]` already true, left alone.

Branch `roadmap/market-ready`, off `loop/top-ten`. 1,245 checks green at
the end of the first run (1,223 before it).

### Wave 1 — foundations and trust
- [x] **W1.1** Racket-detector work landed; a box under the draw floor now
      falls back to the wrist estimate instead of hiding it. Stale 19 MB copy
      fixed, and README's two orphaned table rows put back.
- [x] **W1.2** Back gesture: `lib/backStack.ts` keeps one history entry per
      open screen or sheet. Five checks against a fake history.
- [x] **W1.3** No empty-state flash on a cold open with history; the offline
      badge holds its space until the cache answers. Also fixed a race in
      `?demo=history`.
- [x] **W1.4** The example report is labelled, cannot be shared, and no longer
      has the player's real history (deltas, streak, drill logging) wired to it.
      New screens now open at their top.
- [x] **W1.5** Device check moved out of the history list into Settings.
      `?fixture` stays in production on purpose — the owner's fixture shoot runs
      on a phone (see `FIXTURE_EXPORT`).
- [x] **W1.6** Screen wake lock while analysing and while the viewfinder is open.
- [x] **W1.7** Undo on delete (five seconds, committed on close).

### Wave 2 — report and copy
- [x] **W2.1** `voice.ts` now lints coach jargon; it caught "Steep cartwheel",
      two "Cartwheel" fixes, "Struck well after the drop" and the area-headline
      templates ("is the brake", "Sharpen explosive phase next"). A new check
      lints every runtime headline.
- [=] **W2.2** Report structure: at phone size the first viewport is already
      score, the fix and its drill. Nothing to invent.
- [x] **W2.3** Analysing notes rotate on a timer; camera file names become
      "Your clip".

### Wave 3 — polish in the system
- [x] **W3.1** Sheets animate out.
- [=] **W3.2** Screens already rise on entry; exit transitions judged not
      worth a second render path.
- [x] **W3.3** Top-down placement diagram at the top of the filming guide.
- [x] **W3.4** 23 raw colours named or mixed from tokens, identical values; a
      check now fails on any new one outside `tokens.css`.

### Wave 4 — retention surfaces
- [x] **W4.1** Progress is a screen (`screens/Progress.tsx`), not a sheet, with
      a real empty state.
- [x] **W4.2** Settings sheet: hand, backup, device check.

### Wave 5 — architecture
- [x] **W5.1** Demo routes → `dev/demoRoutes.ts`. `App.tsx` 1,948 → ~1,630 lines.
- [ ] **W5.2** `useHistory` and `useOfflineWarmup` hooks out of `App.tsx`.
- [ ] **W5.3** One `Report` render instead of two (report / saved).
- [ ] **W5.4** Pose inference in a Web Worker — spike first, and it needs a
      phone to measure, so it pairs with the court trip.

### Wave 6 — market readiness
- [x] **W6.1** Manifest `id`, two long-press shortcuts (`?open=progress|guide`),
      Open Graph tags.
- [x] **W6.2** Report and progress lazy-loaded: entry chunk 142 → 125 kB gzipped;
      the size ratchet taken down to 130 / 385.
- [ ] **W6.5** Manifest `screenshots` for the richer install sheet — needs real
      captures from a phone, not the synthetic rig.
- [!] **W6.3** Git remote and first tagged release — owner's call.
- [!] **W6.4** Fixture shoot (six clips) and court trip — owner's phone.

### Verification, end of first run
Phone-sized (iPhone 15) Playwright pass over home, settings, guide, example
report and progress: zero console errors. It found two defects — a focus
ring drawn round every sheet panel, and "Export no serves" — both fixed. A
web-interface-guidelines pass found three more (heading levels, overscroll
chaining, touch-action), fixed.
