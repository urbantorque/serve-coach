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

- [x] **N3.5 The practice session in two panes on a laptop.** The session's
  numbers and headline held on the left, its fixes, every serve and the rest
  on the right, the same pattern as the report. CSS only, phone unchanged.

Not wide on purpose: the glance, which is read on court from a phone. Left
for wave 5's rebuild: sheets (centred modals) and charts whose SVG labels
grow with the column. The first run still says "on this
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

- [x] **N2.3 Correction: a third of the bench's copies were broken, and two
  "findings" were the bench's own.** On 2026-11-19 the copies the bench had
  saved as failures turned out to be about 0.17 s long (18 KB): the canvas
  recording had stopped early on a machine busy with other work. Every
  refused and collapsed copy in N2.1's runs was one of those, so **N2.1's
  claims about the gates flipping and the headline changing are withdrawn**.
  The bench now reads every copy back, retries a short one up to three times,
  and reports it as short rather than reading it. A second wrong turn, kept
  here so nobody repeats it: a fresh page once read a saved copy as measured
  and a page that had read another clip first read it as "not a serve", which
  looked like the pose tracker carrying one clip into the next. A blank-frame
  reset was built for it, then reverted when a fresh page without it gave the
  same "not a serve": three reads a page had not been enough to tell.
- [x] **N2.4 What the whole copies show (two more runs, 2026-11-19).** With
  every copy whole:
  - **Saque_con_pelota is stable**: measured on all ten copies, the same
    faults, the score within 3 points of the control.
  - **0SAQUE sits exactly on the frame-count gate.** On the original file its
    racket drop and contact are three captured frames apart at 30 fps (36.28
    and 36.37 s), and `LIMITS.swingSamples` is three. Copies that lose one
    frame at the drop (the hand is below the shoulder for one or two frames
    only) fall to two and are refused, deterministically: one saved copy gave
    the same refusal on two fresh pages, three reads each.
  - **When the dip is smeared away, the drop is put in the wrong place and
    nothing says so.** The copies that "passed" with 13 to 15 swing samples
    had their drop near the trophy instead, so their drop-to-contact timing
    is several times too long, with full confidence. That is the honesty
    finding of this wave.
  - The heights still move past `CARD_NOISE_SD` on 0SAQUE's copies; whether
    that is the stature ruler or the misplaced drop is not yet separated.

- [x] **N2.5 On 0SAQUE the app never reports the real drop (KNOWN).** The
  bench now logs where each copy's drop landed. The copies that saw the dip
  found it 0.08 to 0.10 s before contact, and sat on or under the
  frame-count gate (two or three samples). The copies that lost it put the
  drop **exactly on the trophy**, and a drop on the trophy is read as a
  racket that never fell: the card says "Racket never falls" at the floor
  score and the diagnosis names a shallow drop. So on this serve the player is
  either refused or told a fault that did not happen. The guard
  (`sawTheDrop` in `diagnose.ts`) asks whether the wrist was visible and
  whether the swing went into the lens; neither catches a dip one or two
  frames long. `dropUnseen.test.ts` reproduces it on the rig (the dip erased
  from the picture, the world motion kept) and pins today's answer as KNOWN,
  beside two guards: a clean rig serve finds its drop 110 to 230 ms before
  contact at 25 to 120 fps, and a racket held high is still one that never
  fell. A first fix, flagging a drop found further than 0.31 s from contact,
  was built and reverted: the lost drop lands on the trophy, not there.

- [x] **N2.6 "Never fell" now needs a camera that could have seen a drop.**
  The saved trophy-landed copies showed two ways the dip goes: `smaller`
  lost the one frame that held it (wrist visibility 0.00), `darker` lost
  none and the hand simply rises to contact. `dropEvidence.ts` now holds the
  one question both the card and the diagnosis ask, and adds a third test to
  the two the diagnosis had: no frame lost in the last 0.31 s before contact.
  Where the drop sits on the trophy and could not have been seen, the card
  withholds the depth (it used to say "Racket never falls" without asking)
  and the diagnosis gives the depth and elbow-lift signals no weight, so no
  shallow drop is named. On the real copies: `smaller` withholds the depth and
  names nothing, the control reads its real drop ("Hand below the shoulder"),
  and `darker` still says the racket never falls, pinned as KNOWN. On the rig:
  a lost frame withholds, a racket held high and seen in every frame is still
  told it never falls, and every clean serve finds its drop 110 to 230 ms
  before contact at 25 to 120 fps.
  The cost, measured: on the modal club serve, takes that lose a frame where
  a drop lives now withhold the row, so the swing moves a point further
  between takes. `REAL_CHANGE` re-derived from the suite's own 90th
  percentiles: swing 5 to 6, trip 8 to 9, and load ratio's three-a-side
  floor 18 to 19 (one and two a side unchanged). A change in the swing area
  now needs one more point before Progress calls it real.

- [x] **N2.7 The frame-count gate refuses at one sample, not two.**
  `LIMITS.swingSamples` 3 to 2. At two, every reading timed across the swing
  already sits at 0.4 confidence, under the 0.55 soft line, so it is hedged
  with "film in slow motion to sharpen this" and never leads, and the
  sequence's confidence is already nothing; the rest of the card reads as
  ever. The case for it is the bench: the copies refused at two were the ones
  that had caught the real drop. Two runs over both clips with N2.6 and this
  in place: **all 20 copies measured, none refused** (it was 3 to 4 of 10
  refused or failed a run before). `triage.test.ts` holds two as read and one
  as refused.

What those 20 copies still show:
- **Where the drop lands is now the main instability.** 0SAQUE puts it
  0.09 to 0.14 s before contact on the copies that catch the dip, and on the
  trophy (0.44 to 0.54 s) on the rest, about half each. Saque_con_pelota
  spreads from 0.28 to 0.48 s, several on the trophy too. A drop on the
  trophy with no lost frame still reads as a racket that never fell
  (the KNOWN case), so this is frequent at 30 fps, not one clip's quirk.
- The score moved 1 to 9 points between copies (0SAQUE's smaller copy 9),
  most of it following where the drop landed.

Next in this wave, in order:
1. **The smeared dip, now known to be common.** At 30 fps a drop on the
   trophy cannot be told from a drop the picture lost unless a frame is
   missing. Candidates, each to be proved on the rig and on the saved copies:
   grade "never falls" only above about 45 samples a second (slow motion or
   60 fps) and withhold it below; or look for the drop in depth as well as
   height before calling it absent. The first is simple and honest; the
   second keeps more 30 fps readings.
   Checked and set aside on 2026-11-19: the hand hanging under the elbow as
   evidence of a drop. On the saved 320 x 240 copies the hand reads above the
   elbow almost throughout, drop or not, so it separates nothing here. With
   N2.6 in place, 0SAQUE's trophy-landed copies now withhold the depth (a
   frame lost, or the wrist seen poorly); Saque_con_pelota's still says the
   racket never falls, and nothing on hand says whether that player keeps it
   up. Ground truth, not another heuristic, is what decides this one.
2. **A stature ruler that holds**, then re-run the bench for the heights.
3. **Sharper footage**, then decide `RETEST_SD`.
4. **Other browsers**, once the owner agrees to the install.

- [x] **N3.4 The app names the device it is on.** `lib/device.ts`: a coarse
  pointer on a small screen is a phone, on a larger one a tablet, anything
  else a computer. Twenty-nine player-facing lines that said "this phone" or
  "your phone" now say the right thing on a laptop ("Your video never leaves
  this computer"); the three filming instructions keep "phone", because the
  camera is a phone whatever the reader holds. In Node it answers phone, so
  every locked line reads as before; `cardCopy.test.ts` now reads template
  strings too. Checked in the browser on the first run.

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

## Wave 6. The commercial surface, first slice

- [x] **N6.1 What a first-time visitor reads under the promise.**
  `FirstRunMore.tsx`, loaded lazily after the first-run hero, so a phone's
  first screen and the entry chunk are what they were. Three steps of how it
  works, "I tell you what I cannot see" (graded against published serves,
  shown and never graded, a likely range for speed, hedged or left out where
  the camera cannot support it), the privacy promise, and the sample report
  again. Only what the app does today: no prices and no programmes it does not
  have. Three steps across and the honesty list beside its headline on a
  laptop; one column on a phone. A line that promised a missed racket drop is
  never called a fault was cut before commit, because the smeared case
  (N2.5, KNOWN) still is.

## Wave 4. Product depth

- [x] **N4.1 Two serves side by side, in motion and phase for phase.** The
  report's side-by-side (you beside a model serve, your best or your last)
  showed one still at the fix's moment. It now has a phase strip to set both
  bodies at any moment, and Play both, which runs the two serves together on
  one shared timeline: `lib/figure/syncPhases.ts` pins each serve's phases to
  the same instants and lets each run at its own pace between them, so both
  reach the trophy, the drop and contact at once and what differs is the serve,
  not its tempo. Four seconds a play-through, ending on contact; no playback
  under reduced motion, where the phase strip does the work. The ticks and
  crosses show only at the fix's own moment. `syncPhases.test.ts` holds every
  phase landing on its own frame, no running backwards, and a missing phase
  skipped. Walked on a phone (plays, pauses, lands on contact, the strip
  scrolls inside its own width) and on a laptop in the studio's right pane.
- [x] **N4.2 The commonest fault gets a demonstration.** "Your tossing arm
  comes down early", the headline on most of the sample serves, had no moving
  picture; it now has the rig's fault beside its fix (`tossArmHold` 0.3, at the
  drop, the tossing hand painted). Eight of the eleven named faults now
  demonstrate. Contact behind was tried at 0.5, 0.7 and 0.9 m and left out:
  the engine names it only from a side view with the net's direction certain,
  the demo serve is not one, and `faultDemo.test.ts` refuses a demonstration
  of a fault the read would not call on the same serve. Posture collapse and
  an early shoulder turn need a part the figure cannot paint yet.
