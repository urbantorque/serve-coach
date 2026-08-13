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
- [x] **2b-ii-b** — The paired strip. Stills are back on for the sweep (~6 seeks
      a serve, no ball pass), `pairStills` pulls the two named serves' frames
      out at the last moment the swept analyses exist, and the strip renders six
      positions two-up. Held in App state and never on the analysis, so nothing
      reaches storage; a re-opened report degrades to the words, which is 2d's
      requirement met by construction. `?demo=basket` draws stand-in tiles so
      the layout is reachable without filming.
- [x] **2c** — `findPracticeFocus` now carries `repeatability`, read off
      `buildConsistencyTrend().recurring` rather than re-derived, so the two
      screens cannot disagree about which element wanders. `repeatabilityNote`
      says it as one sentence under the fix — a second thing to groove when it
      is a different measurement, a stronger reason when it is the same one, and
      nothing at all for a history with no baskets in it.
- [x] **2d** — Met by construction rather than by pruning: the paired stills
      never enter storage, so every re-opened report is the degraded case. What
      was missing was the sentence saying so — a player who watched the strip
      yesterday and finds words today reads silence as a bug.
      `?demo=basket&nostills` reaches that branch.

## Theme 3 — Closing the practice loop

`Session = Omit<Analysis, 'frames'>` — storage holds only what the camera
measured, nothing the player did. `practice.ts` therefore cannot tell "stuck
despite drilling" from "never tried it", and renders both as one badge.

- [x] **3a** — A player-side record, in its own IndexedDB store rather than on
      the report. **Departed from "beside the analysis" for a reason worth
      keeping**: correcting the handedness, changing the serve type or tapping
      another serve all call `saveSession` with a fresh `Analysis`, which
      carries no player-side anything — a field on the row would be erased by
      the most ordinary thing a player does on the report screen, and
      preserving it would mean reading a row of base64 stills back before every
      save. `Session` also stays `Omit<Analysis, 'frames'>` exactly, which is a
      distinction the type has been making all along. DB version 2, upgrade
      verified against a real v1 database with a report already in it.
      `normalisePracticeLog` rejects rather than repairs; backup carries the
      logs on the same newer-wins merge, per log, and an import that loses one
      never fails the reports.
- [x] **3b** — Four sentences where there was one: drilled and moving, drilled
      and not moving ("take this one to a coach" — the right answer when the
      player has done the work and the measurement has not answered), never
      logged, and *no records at all*, which stays distinct because the app not
      having been asked to keep any is not evidence about the player.
      `MEANINGFUL_DELTA` still gates every claim of progress. Verified end to
      end in the browser against a seeded history: tap → IndexedDB → sentence
      flips → undo → sentence flips back.
- [x] **3c** — No gamification, honoured rather than implemented: a ghost
      button, no streak, no badge, no congratulation, and the count shown only
      so the player can see what the sentence counts and spot an accidental
      tap. An app that celebrates the tap is asking to be tapped, which fills
      the record with drills nobody did and makes the evidence worthless.
      Caught one copy defect the voice lint structurally cannot: "drilled it 1
      times" passed every check in the build and reached a real screen.

## Theme 4 — Capture on court, not from the camera roll

`FramingCheck` is a live viewfinder that borrows every threshold from
`framingIssues` / `blockingFramingIssue` and admits it cannot tell a leaning
player from a tilted phone. Filming still hands off to the phone camera app, so
the loop is: film, walk over, pick the file, wait, read.

- [x] **4a** — Recording off the stream the viewfinder already holds, never a
      second `getUserMedia`. `lib/framing/record.ts` decides what this browser
      will record *and then decode* — MP4 first, because a WebM recording is a
      file Safari cannot play back — and the button does not appear at all
      where that answer is nothing. The file picker and the OS camera are both
      untouched. **Not verified on a device**: the Browser pane blocks camera
      access, so what was checked is the refusal path (correct cue, and no
      record button on it) and the eleven unit tests behind the choosing.
      Nothing in this repo has yet recorded a frame.
- [x] **4b** — **Nothing to build, and the reason is worth keeping.** The brief
      assumed a long recording costs more to analyse. It does not: `planScan`
      spends a fixed budget however long the clip is, and extraction covers only
      a couple of seconds around the serve, so a ninety-second recording costs
      the same locate as a five-second one. Trimming the file would mean
      re-encoding — expensive, lossy — to save bytes in a file that is never
      stored. The detector already does what trimming was for.
- [x] **4c** — `screens/Glance.tsx`. One number, one line, two buttons, and a
      recorded basket is glanced at rather than swept, because twenty-five
      seconds of sweep while somebody stands on a baseline is the opposite of
      what this route is for. Runs no analysis of its own — same `Analysis`,
      same `causalPlan` the report ranks with, so there is no second opinion
      about the serve. A refused clip gets the refusal and **no score**.
      Verified via `?demo=glance` and `?demo=glance-refused`.
- [x] **4d** — Done inside 4a rather than after it. The pose loop stops dead
      while recording: the player has stopped aiming and started serving, so the
      verdict has no reader, and it is the worst moment in the app to spend
      thermal headroom — a hardware encoder is on the same stream and the
      analysis that needs the GPU is thirty seconds away. `MAX_POSE_DUTY` caps
      the model against wall clock and cannot know that half of wall clock is
      too much while something else has the device. The recorder is also torn
      down on unmount, and capped at `MAX_RECORDING_SECONDS` because
      `MediaRecorder` accumulates chunks in memory until stopped.

## Theme 5 — Showing the correction

The ghost is deliberately narrow — rigid translation, legs undrawn, nothing
below `SOFT_MEASUREMENT`, trophy ghost withdrawn because a translation cannot
express a joint angle. That restraint stands. The hole it left is that knee bend
and shoulder tilt have no picture at all.

- [x] **5a** — A dial in the callout plate, **not** a wedge at the joint, and
      the difference is the point. The arc at the joint is a locator: it is
      drawn between two limb directions in image space while the number beside
      it is `jointAngle` of the *world* landmarks, and those differ by exactly
      the projection `geometry.ts` refuses to reason about — side-on, a real 20°
      of shoulder tilt reads as 60°+. Shading a band across that arc would turn
      a pointer into a measurement. So the band is drawn where the number lives:
      a small sweep, target shaded, reading marked, claiming nothing about the
      pixels behind it. Bands come off the metric the report prints, and only
      for measurements at or above `SOFT_MEASUREMENT`. Two tests pin it: a dial
      appears only for a banded metric, and the strokes at the joint do not move
      with the band. **Not seen rendered** — a captured still needs a real video
      and `?demo=live` cannot record one in this pane.
- [ ] **5b** — A then-versus-now still pair from history, reusing 2b's
      component.
- [ ] **5c** — Both render into `share/reportCard.ts`, or are deliberately
      omitted from it with a stated reason. A report that looks different shared
      than read is a bug.

---

## Log

- Programme written down (`LOOP.md`), ledger opened. Nothing implemented yet.
