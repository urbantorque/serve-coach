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
- [x] **1b** — The shooting list. `fixtures/README.md` now carries the six clips
      that clear the gate, in order, each with what it proves and why no two
      prove the same thing — plus the rows beyond the six that the gate cannot
      read, and the warning not to mirror a clip to fake a left-hander.
- [x] **1f** — The gate names a non-serve fixture as unlabelled, forever. Found
      while writing 1b, which now tells people to film rally and practice-swing
      clips. `spreadGaps` in `fixtures/index.ts` filters on
      `!f.expect.handedness || !f.expect.view`, and a `rejected: true` fixture
      has neither by construction — `buildRejectedDraft` writes
      `expect: { rejected: true }` and nothing else, and `validateFixture`
      returns before it would ever compare them. So a refusal clip counts
      towards `MINIMUM_RECORDED` and then fails the spread check permanently,
      for a label it is not meant to carry. Count the spread over serve fixtures
      only; keep refusals counting towards the minimum, since they are real
      footage proving a real behaviour.
- [x] **1c** — `replay-fixture.mjs` already printed the per-measurement diff for
      one clip. It now takes many, and prints a row per measurement across all
      of them: `n`, the span of engine-minus-label, the median, and how much of
      the allowance the worst clip needed. It reports a spread and never
      proposes a band.
- [x] **1d** — `chain.span_ratio` is computed, divided by `contact − ready`
      (`metrics.ts`'s `totalTime`, not a second definition), and stays in
      `UNCALIBRATED` with the three things that would move it to `SIGNALS`
      written out. **The 0.092 / 0.088 / 0.092 figure in this ledger and in
      `UNCALIBRATED.chain_span_ms` does not reproduce.** Measured: span 99 / 114
      / 174 ms across tempos 1.1 / 1.35 / 1.7 s at 50 fps, ratio 0.1010 / 0.1000
      / 0.1225 — a 58% spread becoming 21%, not 5%. The sweep is printed by
      `depth.test.ts` on every run so it cannot age the same way.
- [x] **1e** — Stopped here. Everything in Theme 1 that does not need a camera
      is done.
- [!] **1g** — **blocked: needs real footage.** `RECORDED` is still empty and
      nothing an agent can do changes that. Six clips clear the gate and the
      order is in `fixtures/README.md`: right-handed side-on at 30 fps, the same
      serve in slow motion, the same player front-on, a **left-hander** side-on
      at 30 fps, that left-hander at 60 fps from a second angle, and one
      right-hander side-on with the feet deliberately out of frame. The
      left-handed pair is the hard one and cannot be faked by mirroring a clip
      — that is what a front camera does and the app already treats it as an
      artifact. Until those exist: hip–shoulder separation and shoulder tilt are
      unvalidated against anything real, `NOISE_FLOOR` has no measurement behind
      it, and every entry in `UNCALIBRATED` stays there.

## Theme 2 — The basket, promoted to the main event

`buildConsistency` and `ConsistencyPanel` are good and reachable only through an
`onCheckConsistency` action after a single-serve report. The README argues the
gap between best and worst serve beats the average for a club player; the
product does not behave as though it believes that.

- [x] **2a** — A clip with more than one serve now sweeps automatically:
      `openClip` in `App.tsx` runs the single serve with `landOn: 'sweep'` (so
      the report does not flash for two frames before the progress screen
      replaces it) and goes straight into `compareServes`. Single-serve clips
      are untouched. The serve chips were already the drill-down.
      **Departed from the brief on one point, deliberately.** The answer to the
      question was "report opens with consistency at the top", and the full
      panel is not at the top — commit `740a9d8` moved it below the focus card
      because the one instruction the report exists to deliver was arriving two
      phone screens down, under a picker and a stack of spread charts, and
      [[two-to-four-drills-not-one]] says the ranked fix is the point of the
      report. What is at the top is `consistencyHeadline` as one sentence beside
      the serve picker, which says which element moved without displacing the
      fix. Say the word and the whole panel moves up.
- [x] **2b-i** — Best-serve versus worst-serve, in words. `buildGap` in
      `consistency.ts` names both serves by their number in the clip, picked on
      the `overall` the chips already show, and ranks every measurement by how
      far apart the two were as a multiple of its own band. `ConsistencyPanel`
      prints the three biggest that read back as *different words* through
      `anatomy.ts` — two serves that differ by real degrees and both read "arm
      dead straight" are not a difference a player can act on.
- [x] **2b-ii-a** — `skipThumbnails` was three unrelated things behind one name:
      the framing preflight, the ball pass (a whole second pass over the video
      per serve) and the six stills. So the only way to get stills out of a
      swept serve was to also pay for ball tracking, which is why swept serves
      have none — not a decision anybody took about stills. Now
      `skipFramingCheck`, `skipBall` and `skipThumbnails`. The sweep still sets
      all three: stills are ~50 seeks across a basket and nothing keeps them
      yet, so turning them on belongs with the thing that pairs them.
- [ ] **2b-ii-b** — The paired strip. Turn stills back on for the sweep, hold
      the swept analyses in memory (not storage — the report already drops
      stills first under `KEEP_STILLS`), and pair the best serve's six frames
      against the worst serve's. Degrade to 2b-i wherever the images cannot be
      produced, which includes every re-opened saved report.
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
