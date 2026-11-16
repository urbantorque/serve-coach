# The Next programme: ledger

The plan is `HANDOVER.md` beside this file. This page records what each item
turned out to be and how it was proved, one line or a short paragraph per item,
newest at the bottom of each wave. A measured "not adopted" is a result.

Branch `next/premium`, cut from `master` at `e8bf74c` on 2026-11-16.

## Wave 0. Ground

- [x] **N0.1 Branch and baseline.** `next/premium` from `e8bf74c`. Baseline gate
  on the untouched tree: typecheck, eslint, build and tests green. After wave 0: all four green again, 2,246 checks across 171 suites after N0.4.
- [x] **N0.2 Old ledgers archived.** `ROADMAP.md`, `LOOP.md`,
  `ANALYSIS-REVIEW.md` and `NOTCH-REVIEW.md` moved to `docs/history/` with git
  history kept. No test reads them by path; source comments cite them by name,
  which `STATUS.md` already resolves to that folder, so the comments stand.
  `STATUS.md` now points at this ledger and the handover.
- [x] **N0.3 Shots at three sizes.** `scripts/lift-shots.mjs` takes
  `SIZE=phone|tablet|laptop` (390 x 844, 820 x 1180, 1440 x 900). Baseline in
  `docs/lift/next-before/`, `-tablet/` and `-laptop/`.
- [x] **N0.4 Dead modules removed.** `vision/detector.ts` (455 lines, "types and
  stubs only") and `vision/outbound.ts` (290, a smear detector nothing called),
  with their two test files (561 lines). `reachable.test.ts` drops their five
  refusal values and two sources. `analysis/invariants.ts` was on the list and
  is kept: it is the rig's invariant set, read by two test files, so it is test
  infrastructure rather than dead code.

## Wave 1. Design direction

- [x] **N1.1 Three directions on a Claude Design canvas.**
  https://claude.ai/artifact/TkMaXg3ryFfDYXykfGA3HN (private to the owner).
  Each direction shows a landing page (1440, fluid), the desktop review
  studio (1440 x 900) and the phone report (390 x 844), on real frames of an
  openly licensed amateur serve (`Saque_con_pelota`, CC BY-SA 3.0) and the
  app's own lit figure. A: Floodlit (today's dark and lime, raised, Archivo).
  B: Daylight (cool off-white, court blue, Geist, footage on dark stages).
  C: Broadcast (off-black, signal orange, condensed type, telemetry on the
  clip). Prices are placeholders; scores and angles are sample values.
- [x] **N1.2 The owner chose A, Floodlit** (2026-11-16). `DESIGN.md` is
  rewritten whole around it: the identity kept and raised, a laptop grid
  (rail, `--wide` 1280, two panes with `--aside`), breakpoints at 768, 1024
  and 1280, the review studio, the landing page, and a type floor. No colour
  changed, so `styleTokens.test.ts` and `contrast.test.ts` stand as they are.
- [x] **N1.3 The type floor.** 213 font sizes under 15 px across 16
  stylesheets moved up: 11 to 13 px to 14, 13.5 to 14.5 px to 15. Three
  signposts went to 15. `wordsInChrome.test.ts` now fails under 14 px (was
  11) and holds the tracked signposts at 15 (was 12). Walked all 30 phone
  states before and after: page heights moved by at most 0.1 screen, no
  horizontal overflow at 375 px on the live report or Progress, and the
  console said nothing new.

## Wave 2. Trust foundations

Findings checked against the code before work starts:

- STATUS's "every engine score is capped until real players are read" has no
  code behind it. No cap exists in `confidence.ts`, `verdict.ts` or
  `analyze.ts`; the only caps are the four-drill cap and the sweep cap. The
  score is shown uncapped. This feeds N2's "rethink the headline number".

## Wave 3. A website, not a phone page

- [x] **N3.1 Every screen has an address.** `lib/routes.ts` names one per
  screen (`/`, `/progress`, `/serves`, `/serve/<id>`, `/sample`,
  `/practice/<id>`, and `/report`, `/reading`, `/glance`, `/problem` for the
  screens that hold a clip) and sets the tab's title. The address is replaced,
  never pushed, so `backStack.ts` still owns the history and back still closes
  what is on top. Loading an address opens its screen: Progress and every
  serve at once, a stored serve, the sample and a practice session from
  storage, anything unknown on Today. Not a router library: the screen still
  lives in `App.tsx` state, which kept the change to about 50 lines and left
  `screenFlow.test.ts` true. `routes.test.ts` walks every screen there and back
  under `/` and a sub-path base. Walked in the browser: Progress and back,
  `/serves`, `/sample` and back, a stored serve reloaded at its address, and
  an unknown id landing on Today.
