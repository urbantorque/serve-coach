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
- [x] **N3.2 A laptop layout for Today, Progress and the first run.**
  `styles/wide.css`, the one home for screen layouts at 768 and 1024 px. From
  1024 the bar becomes a side rail with Film at the top, the column widens to
  `--wide`, Today puts the next session beside the week, Progress puts the
  shape of the serve beside the records and flows its sections in two
  columns, and the first run puts the figure beside the promise. Phone is
  untouched: all 30 phone states measure as before. At 1440 px Today went
  from 1.3 screens to 1 and Progress from 3.4 to 2.3.
- [x] **N3.3 The report as a review studio on a laptop.** The player's clip
  holds the left pane, sticky, while the number, the fix, the one action and
  the depth scroll on the right. The action bar sits under the fix instead of
  floating at the window's foot, and the hero's picture shrinks to a backdrop
  because the clip is already big. Reports went from about 3 laptop screens
  to 2.3. Gate green, 2,251 checks.

Not yet wide, and left for wave 5's rebuild: the practice session and the
glance (a readable column, centred), sheets (centred modals), and charts
whose SVG labels grow with the column. The first run still says "on this
phone" on a laptop; the landing page (wave 6) takes that line.

## Wave 2. Trust foundations, first slice

- [x] **N2.1 A test-retest bench on real footage.** `retest.html`,
  `src/dev/bench/retest.ts`, run by `node scripts/retest.mjs` into
  `docs/next/bench/retest.json`. It finds the serve's window on an openly
  licensed amateur clip, re-encodes that stretch through a canvas in the
  browser (a plain copy as the control, then darker, a step further back, at
  60% of the pixels and 1/40 s later) and reads every copy whole. Two runs,
  twelve changed copies of two serves (`Saque_con_pelota`, `0SAQUE`;
  `Saque_reves` was not taken for a serve). What it found, against the
  control:
  - **The faults are stable**: the same set of detected faults on 12 of 12.
  - **The headline mostly holds, the gates do not**: "Work on this next"
    named a different fix on 4 of 12, but 3 of those 4 had a refusal on one
    side (a refused copy takes its headline from a different path). Where
    both copies were measured, the fix changed on 1 of 9 (`Saque_con_pelota`,
    1/40 s later).
  - **The score moves about 5 points** (root mean square), and every changed
    copy scored lower than the plain one: worse footage reads as a worse serve.
  - **Heights move far past their stated noise**: per read, racket drop depth
    8.2 times `CARD_NOISE_SD`, contact height 5.2, leg drive 2.6, release
    height 2.3. Knee bend, load ratio and hand under elbow 1.3 to 1.6. Arm
    extension and shoulder tilt stayed inside. The heights share a ruler (the
    stature read off the same frames), which moves with the picture.
  - **The gates sit on a knife edge**: the same change to the same stretch,
    recorded afresh on each run (the canvas recording is not frame-exact), was
    refused as too blurry on one run and measured on the other, both ways;
    and a plain re-encode of `0SAQUE` was refused as too short. Both gates
    are hard thresholds with no margin (`triage.ts` `LIMITS`: three captured
    samples from drop to contact, a blur score of 0.75), and a 30 fps swing
    sits right on the first.
- [x] **N2.2 Real footage's noise, measured and not adopted.** `RETEST_SD` in
  `cardNoise.ts`. Used as the floor under the player's usual, a basket's
  wander and a new best, it failed eight checks that prove a real change is
  still found (a wandering basket, a racket drop's first best, a lower
  contact). Two 320 x 240 clips overstate a 1080p phone, so it waits for
  sharper open footage through the same bench. Nothing reads it yet.

Next in this wave, from what N2.1 found, in order:
1. **Gates with a soft edge.** The blur and frame-count refusals flip between
   two encodes of the same stretch, and a flipped gate changes whether there
   is a report and what it leads with. Not by lowering a limit: near the
   limit, measure and let confidence fall (the rule in
   `forgiving-to-amateur-footage`), and refuse only well past it.
2. **A stature ruler that holds.** Heights divide by a stature read off the
   same frames. Steady it across a clip (or across a player's history, where
   their height is known once) and re-run the bench.
3. **A headline that holds.** When the top two causes are close, keep the
   fix the player is already working on, or say both. Prove it on the bench:
   the same fix on every pair where both copies were measured.
4. **Sharper footage.** Find openly licensed 720p or 1080p serve clips for
   the bench, then decide `RETEST_SD`.
5. **Other browsers.** WebKit and Firefox are not installed for Playwright
   here (`npx playwright install webkit firefox`, a download the owner should
   agree to). Until then, decode is proved in Chrome only.

Sources looked for on 2026-11-17, for items 4 and the wave's "does the score
know a good serve from a poor one":
- **THETIS** (Gourgari, Goudelis, Karpouzis and Kollias, 2013): 55 players,
  beginner to intermediate, 12 shots including flat, kick and slice serves,
  three takes each, as RGB video with Kinect depth and 2D and 3D skeletons.
  The skeletons are a truth of sorts for the real pipeline, and the three
  serve types are a check on `SERVE_TYPE_SHIFT`. Its licence was not found
  in secondary sources: the owner should confirm it on the dataset's own site
  before anything is fetched (`docs/next/OWNER-STEPS.md`). Its secondary
  summaries disagree on whether expert players are included.
- **Wikimedia Commons**: no HD tennis serve video under CC BY or CC BY-SA
  turned up in a web search. A direct Commons category search by the owner,
  or a licensed clip of their own, is the next route.
