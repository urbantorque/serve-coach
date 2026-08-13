# NEXT

The work ledger for the programme in `LOOP.md`. This file, not the git log and
not anybody's memory, is the source of truth for what is done.

Status marks: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` blocked.

Take the topmost slice that is neither done nor blocked. One slice per
iteration — do not start a second because the first turned out small. If a slice
proves bigger than one iteration, split it here into named sub-slices, do the
first, and leave the rest. Never leave half-built code behind a flag.

---

## Theme 1 — Ground truth, and the signals it unlocks

`RECORDED` in `src/lib/analysis/__tests__/fixtures/index.ts` is empty: 0 of
`MINIMUM_RECORDED = 6`. Six signals are measured and never spoken to the player
(`legs_peak_ms`, `chain_span_ms`, `wrist_peak_ms`, `elbow_peak_ms` in
`UNCALIBRATED`; `hip_lead_ms`, `pronation_deg` in `UNDER_RESOLVED`), and
hip–shoulder separation and shoulder tilt are computed from world-space `z`,
unvalidated against any real frame.

An agent cannot film tennis serves. A synthetic entry in `RECORDED` is a `fail`
in `fixtureGate` by design, and hand-written fixture JSON is worse — it turns
the suite green against reality that does not exist. Build everything around the
footage except the footage, then stop.

- [x] **1a** — Fixture capture and labelling. `src/dev/exportFixture.ts` now
      asks for the description and writes nothing without one, carries
      `_engineUnits` so a labeller knows which unit each measurement is compared
      in, and prints `draftGaps` — the remaining work, derived from
      `validateFixtureSchema` rather than restated. `labelProblem` in
      `groundTruth.ts` is the one definition of "described", read by both the
      export and the gate.
- [ ] **1b** — The shooting list. Rewrite
      `src/lib/analysis/__tests__/fixtures/README.md` as a checklist that can be
      taken to a court: which clips satisfy `SPREAD` (both hands, two views, two
      frame rates) plus the three prose axes (build, framing, lighting), how to
      film each, and what each one proves.
- [ ] **1c** — `npm run replay:fixture` prints, per measurement, labelled value
      against measured value and the delta — good enough to settle a band.
- [ ] **1d** — Implement the scale-free `chain_span_ms ÷ motion duration` ratio
      (0.092 / 0.088 / 0.092 across three tempos). Keep it in `UNCALIBRATED`.
      Write down exactly what evidence would move it to `SIGNALS`. Invent no
      band.
- [ ] **1e** — Stop. Mark every remaining Theme 1 slice `[!] blocked — needs
      real footage`, tell the user precisely what to film, move to Theme 2.

## Theme 2 — The basket, promoted to the main event

`buildConsistency` and `ConsistencyPanel` are good and reachable only through an
`onCheckConsistency` action after a single-serve report. The README argues the
gap between best and worst serve beats the average for a club player; the
product does not behave as though it believes that.

- [ ] **2a** — A clip with more than one serve lands on the consistency view.
      Single serve becomes the drill-down, reached by tapping a serve. Genuine
      single-serve clips behave exactly as they do now.
- [ ] **2b** — Best-serve versus worst-serve: the six keyframe stills of each,
      paired position by position. Stills already carry the skeleton and the
      judged angle and are already stored, so this is layout over existing data.
      Say what differed in words, through `analysis/anatomy.ts` readouts.
- [ ] **2c** — Route the consistency result into the practice focus, so
      `practice.ts` can say "your toss is fine on average and moves more than
      anything else you do".
- [ ] **2d** — Respect `KEEP_STILLS = 20`. A comparison against a report whose
      stills were pruned degrades to the numbers, with a line saying why.

## Theme 3 — Closing the practice loop

`Session = Omit<Analysis, 'frames'>` — storage holds only what the camera
measured, nothing the player did. `practice.ts` therefore cannot tell "stuck
despite drilling" from "never tried it", and renders both as one badge.

- [ ] **3a** — A player-side record beside the analysis: drill assigned, marked
      done, when. Survives `normalise` in `storage/db.ts`, exports and imports
      through `storage/backup.ts` on the same newer-wins merge, counts towards
      nothing when absent.
- [ ] **3b** — `PracticeCard` earns a sharper sentence from it: drilled and
      moving, drilled and not moving, assigned and never logged.
      `MEANINGFUL_DELTA = 3` still gates any claim of progress.
- [ ] **3c** — No gamification. No streaks, no badges, no congratulation.

## Theme 4 — Capture on court, not from the camera roll

`FramingCheck` is a live viewfinder that borrows every threshold from
`framingIssues` / `blockingFramingIssue` and admits it cannot tell a leaning
player from a tilted phone. Filming still hands off to the phone camera app, so
the loop is: film, walk over, pick the file, wait, read.

- [ ] **4a** — Record in-app from the same preview stream where the browser
      supports it. The existing file input stays a first-class path, not a
      degraded mode.
- [ ] **4b** — Auto-trim to the detected serve, reusing `analysis/serves.ts`
      rather than writing a second detector.
- [ ] **4c** — A between-serves glance: one line, one number, no report. When
      the clip cannot carry an answer it says so rather than guessing.
- [ ] **4d** — Battery and heat. Hold the standard the animation loop already
      sets for anything touching a camera stream.

## Theme 5 — Showing the correction

The ghost is deliberately narrow — rigid translation, legs undrawn, nothing
below `SOFT_MEASUREMENT`, trophy ghost withdrawn because a translation cannot
express a joint angle. That restraint stands. The hole it left is that knee bend
and shoulder tilt have no picture at all.

- [ ] **5a** — A visual that can honestly say "angle": an arc at the joint on
      the keyframe still, target band as a wedge behind it. Same evidence rules
      as the ghost; band read through `analysis/tiers.ts` as the tier above the
      player.
- [ ] **5b** — A then-versus-now still pair from history, reusing 2b's
      component.
- [ ] **5c** — Both render into `share/reportCard.ts`, or are deliberately
      omitted from it with a stated reason. A report that looks different shared
      than read is a bug.

---

## Log

- Programme written down (`LOOP.md`), ledger opened. Nothing implemented yet.
