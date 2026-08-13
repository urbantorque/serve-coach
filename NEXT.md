# NEXT

The work ledger for the programme in `LOOP.md`. This file, not the git log and
not anybody's memory, is the source of truth for what is done.

Status marks: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` blocked.

Take the topmost round that is neither done nor blocked. One round per
iteration — do not start a second because the first turned out small. If a round
proves bigger than one iteration, split it here into named sub-rounds, do the
first, and leave the rest. Never leave half-built code behind a flag.

Each entry is written as a **question with a deliverable**. Several will have the
answer "already true"; that answer, pinned by a test that would fail if it
stopped being true, is a finished round. Inventing a change to make a round feel
productive is the failure mode this phrasing exists to prevent.

Note entries **delta only** — what this round settled that the previous one did
not. The README carries the standing description; this file carries the moves.

---

## Phase 1 — Device truth (R1–8)

The recorder in `lib/framing/record.ts`, the glance screen and the target dial
all shipped and **none of them has run on a phone**. The preview pane blocks
camera access, so what was verified was the refusal path and the unit tests
behind the choosing. An agent cannot hold a phone; it can build the thing that
reports back, and then ask.

- [x] **R1** — Programme written down, ledger opened. `LOOP.md` now carries the
      forty-round brief ordered by evidence gap rather than build order, the ten
      review lenses as questions rather than as spawned agents, the
      retry-and-revert rule, and two constraints the previous brief did not
      state: the 500 MB mobile-memory ceiling, and that twenty-five words is a
      cap on every new line rather than an average. The five-theme programme it
      replaces is compressed to the foot of this file with **1g** kept in full,
      since no round below closes it. Baseline recorded green before the first
      edit: typecheck, lint, 19 test files passing.
- [x] **R2** — `lib/selfCheck.ts` and `components/DeviceCheck.tsx`, reached at
      `?check` or from the foot of the history sheet. **In the production bundle,
      unlike `?demo`** — a check that only exists in a dev build cannot be run on
      the phone that matters. It found something on its first run rather than
      merely reporting: `recordingType()` orders containers by an assumption
      about what a browser can decode and **never asks**, so `recordingVerdict`
      now asks both questions of the same browser and flags `deadEnd` when the
      answers disagree. Nothing is fixed here — that is R5. Also asks about HEVC,
      the same failure arriving through the picker; this Chromium answers `no`,
      which is the documented iPhone case made visible before anybody films.
      14 tests. Rendered and read at `?check`, no console errors; **no screenshot**
      — the pane does not composite frames, so what was checked is the DOM.
- [ ] **R3** — Make that report handable back without a screenshot of a wall of
      text. Deliverable: one copyable block, no personal data in it, and a test
      on what it is allowed to contain.
- [ ] **R4** — The court protocol. Deliverable: exactly what to film, tap and
      report, in order, each step naming what it proves — same shape as
      `fixtures/README.md`, and short enough to do in twenty minutes.
- [ ] **R5** — Fix the first thing R2–R4 report. The recorder first: a WebM the
      phone cannot play back is the failure that path was designed around and has
      never been observed.
- [ ] **R6** — Fix the second.
- [ ] **R7** — Fix the third, or if the device came back clean, pin the three
      paths that were riskiest with tests that would fail if a browser update
      broke them.
- [ ] **R8** — Phase 1 close-out. README synced, dead code purged, ledger
      compressed to deltas.

## Phase 2 — Hostile footage (R9–16)

The engine is honest about what it cannot see. The open question is whether it
notices the specific ways amateur footage goes wrong, or only the ways the
synthetic rig can produce.

- [ ] **R9** — What does a limb hidden for half a second do to the report?
      `kalman.ts` holds a landmark through blur; occlusion is a different
      failure, and MediaPipe answers it by guessing rather than by declining.
      Deliverable: occlusion driven in the rig, and confidence that falls.
- [ ] **R10** — Are frames assumed evenly spaced? Real clips drop frames and
      phones record variable frame timing. Deliverable: the assumption located,
      and either defended in prose or removed in code.
- [ ] **R11** — What does bad light do? Low contrast lowers landmark visibility
      before it lowers accuracy. Deliverable: the visibility signal traced into
      `confidence.ts`, and a clip filmed at dusk degrading rather than lying.
- [ ] **R12** — How often is the ball missed, and how often is something else
      found? Deliverable: false-positive and false-negative figures on the rig,
      printed by the suite so they cannot age silently.
- [ ] **R13** — Does the multi-body hand-off check cover the sweep, or only the
      single serve? A basket filmed at a club has other people in it by
      definition. Deliverable: the check where the sweep can see it.
- [ ] **R14** — Does handedness and camera-angle detection survive noise, or only
      clean landmarks? Deliverable: both driven through the ensemble.
- [ ] **R15** — Rotation metadata and portrait clips. `axes.ts` assumes the
      sensor told the truth about which way was up. Deliverable: the assumption
      tested against a clip where it did not.
- [ ] **R16** — Phase 2 close-out. README synced, the ensemble's standing
      warnings re-read, ledger compressed.

## Phase 3 — Cost: memory, heat, frames (R17–24)

Constraint 8 is currently an assertion nobody has checked, and so are 60 fps and
the thermal budget. This is also where the state machine hiding in `App.tsx`
gets a name.

- [ ] **R17** — What is the peak resident memory of one analysis? Decode, pose,
      the frame buffer, the six stills and the canvas all coexist. Deliverable: a
      measurement.
- [ ] **R18** — Bound the pipeline to it. Deliverable: a test that fails when the
      bound is exceeded.
- [ ] **R19** — Is the heap flat across ten consecutive analyses? Object URLs,
      canvases, the landmarker, `MediaRecorder` chunks, the paired stills.
      Deliverable: the leak, or the proof there is none.
- [ ] **R20** — Does the timeline hold 60 fps on a long clip with the overlay
      drawing? Deliverable: the frame budget measured, worst offender fixed.
- [ ] **R21** — What does one stored report cost, and does the pruning ladder
      fire? Stills are JPEG at 0.72; `KEEP_STILLS = 20`,
      `KEEP_STILLS_UNDER_PRESSURE = 3`. Deliverable: the real byte cost, and a
      test that drives the pressure path rather than trusting it.
- [ ] **R22** — What happens when the browser refuses a write? Quota exceeded
      mid-save, an import larger than the quota, a device that never grants
      persistence. Deliverable: each path ends somewhere a player can act.
- [ ] **R23** — Where does App state actually live? `App.tsx` carries 19 hooks
      across ~1,100 lines and `view`, `sweep`, `pair` and `thenNow` are stages of
      one machine. Deliverable: the machine made explicit, or the reason it stays
      implicit written beside the code — plus a test on whichever transitions can
      strand a screen.
- [ ] **R24** — Phase 3 close-out.

## Phase 4 — The stranger and the coach (R25–32)

- [ ] **R25** — What does a genuine first run look like today? There is a
      `guide-first` sheet and a `firstRunPickRef`; nobody has walked the whole
      path as a stranger. Deliverable: the walk written down, gaps named, no
      code.
- [ ] **R26** — Build the worst of those gaps. Assembled from `primitives.tsx`
      and existing tokens — constraint 3 is not negotiable for onboarding.
- [ ] **R27** — Build the second worst.
- [ ] **R28** — Can a player find the on-court record route at all? It is the
      best feature in the app and it hides behind a screen most people read as a
      file picker. Deliverable: discoverability, without a tour.
- [ ] **R29** — How many taps from "that is my fault" to "I did the drill"?
      Deliverable: the count, and one tap removed if there is one to remove.
- [ ] **R30** — The share card is one serve; a coach wants the basket.
      Deliverable: an export a coach can read without the app, or the reasoned
      refusal written into `reportCard.ts` the way 5c's was.
- [ ] **R31** — Does one-tap share actually work everywhere? `navigator.share`
      with files is refused by more browsers than accept it. Deliverable: the
      fallbacks tested rather than assumed.
- [ ] **R32** — Copy pass over every line added in Phases 1–4, against the
      twenty-five-word cap and the coach jargon the lint cannot see. Plus phase
      close-out.

## Phase 5 — Honesty audit and freeze (R33–40)

- [ ] **R33** — Egress audit. Every request the running app makes after load,
      enumerated and justified or removed. Deliverable: a test that fails when a
      new one appears.
- [ ] **R34** — What does an export contain that a player would not expect to
      hand somebody? Deliverable: the contents stated in the UI at the moment of
      export.
- [ ] **R35** — Stress the ingestion: a thirty-minute clip, a one-frame clip, a
      rotated clip, 4K, and a file that is not a video at all. Deliverable: five
      answers a player can act on, none of them a stack trace.
- [ ] **R36** — Re-read `UNDER_RESOLVED` and `UNCALIBRATED`. Deliverable: per
      signal, the exact evidence that would move it — or the statement that none
      exists and it stays withdrawn.
- [ ] **R37** — Restate the fixture ask with whatever Phase 1's court protocol
      taught. `RECORDED` is 0 of `MINIMUM_RECORDED = 6` and no round above closes
      it.
- [ ] **R38** — DRY and dead-code purge across the whole tree, not one phase.
- [ ] **R39** — README full sync. It is the deliverable; read it end to end
      against the code and fix every drift.
- [ ] **R40** — Freeze. Final green run recorded, the open gaps stated plainly,
      the loop stopped. Do not start an R41.

---

## The previous programme — the five themes, completed

Ran to completion on this branch across 36 commits. The outcomes are in
`README.md`; the full ledger, including the reasoning behind each departure from
the brief, is in git history at `4e552d0`. In brief:

- **Theme 1 — ground truth.** The fixture export asks for a description and
  writes nothing without one; `fixtures/README.md` is a shooting list of six
  clips; `replay-fixture.mjs` reports a spread across many clips and never
  proposes a band; `chain.span_ratio` is computed and stays uncalibrated because
  the 5% figure the old brief quoted does not reproduce — it is 21%.
- **Theme 2 — the basket.** A multi-serve clip sweeps automatically and lands on
  consistency; best against worst is named, said in words, and paired as stills
  that never enter storage.
- **Theme 3 — the practice loop.** A player-side drill record in its own store,
  surviving re-analysis, export and import; four sentences where there was one;
  no streaks.
- **Theme 4 — capture on court.** Recording off the viewfinder's own stream where
  the browser can read it back, the pose loop stopped while recording, and a
  glance screen for somebody still holding a basket. **Never verified on a real
  device** — the preview pane blocks camera access. Phase 1 above exists to
  close that.
- **Theme 5 — showing the correction.** A dial in the callout plate rather than a
  wedge at the joint, because the arc is a locator and the number is world-space;
  then-against-now on the shared `FramePair`; the dial reaches the share card and
  the pairs deliberately do not.

The one slice still open, kept in full because nothing in the forty rounds
closes it:

- [!] **1g** — **blocked: needs real footage.** `RECORDED` in
      `src/lib/analysis/__tests__/fixtures/index.ts` is still empty, 0 of
      `MINIMUM_RECORDED = 6`, and nothing an agent can do changes that. Six clips
      clear the gate and the order is in `fixtures/README.md`: right-handed
      side-on at 30 fps, the same serve in slow motion, the same player front-on,
      a **left-hander** side-on at 30 fps, that left-hander at 60 fps from a
      second angle, and one right-hander side-on with the feet deliberately out
      of frame. The left-handed pair is the hard one and cannot be faked by
      mirroring a clip — that is what a front camera does and the app already
      treats it as an artifact. Until those exist: hip–shoulder separation and
      shoulder tilt are unvalidated against anything real, `NOISE_FLOOR` has no
      measurement behind it, and every entry in `UNCALIBRATED` stays there.
