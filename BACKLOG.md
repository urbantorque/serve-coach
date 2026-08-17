# BACKLOG

The queue for the 75-round loop, grouped by its six rotating focus areas.

**This file is a view, not the truth.** `NEXT.md` is the ledger — round status,
what was settled, and what is blocked all live there, and a round is done when
`NEXT.md` says so. This file exists to answer one question `NEXT.md` does not:
*which focus area does the next round serve, so no column starves.* When the two
disagree, `NEXT.md` wins.

Every row names the round in `NEXT.md` it maps to, so nothing here can become a
second programme running beside the first. Rows without an `R` number are audit
rotation items from `UNATTENDED-LOOP.md`; they are complete when they produce a
pinned test or a found defect.

Status marks match `NEXT.md`: `[ ]` todo · `[~]` in progress · `[x]` done ·
`[!]` blocked.

---

## Cycle A — CV/ML engine

Pose tracking stability, kinematics, temporal smoothing, the frame budget.

- [x] **A1 · R49·2** — The pairing rule for two stored serves: align at contact,
      normalise to hip centre, scale by shoulder-to-ankle. Refuse a missing
      track, an unmeasured yaw, a yaw gap over 5°, a rubric or serve-type change.
      Pure, no drawing. *(Round 1 — `lib/trackPair.ts`.)*
- [x] **A2 · R49b** — Bound how often two clips from one trip agree on camera
      angle within 5°, from `estimateYaw` in `spatial.ts`. The real answer needs
      fixtures (R59); the bound does not. *(Round 7 — the gate spends nothing on
      noise from 60° up, and the estimator is best conditioned exactly where this
      app is used.)*
- [x] **A3 · R60·1** — Give the rig a stance at all: `pinpointSlide`, ramping to
      the trophy. *(Round 13 — the rig could not build a pinpoint stance, which
      blocked R60 and R64 on one sentence. Bit-identical at zero.)*
- [x] **A3b · R60·2** — Refused. *(Round 20 — the stance is a depth quantity and
      a side-on camera cannot see it: 0.0050 against a flat 0.0030 floor. The
      round said "the axis the camera sees best"; it is the worst.)*
- [ ] **A4 · R61** — Ball speed off the strings. `planSharedPass` in
      `detector.ts` throws; build W7 only, never W6, never in mph. Spike first.
- [ ] **A5 · audit 8** — Windows in `phases.ts` still sized in file seconds
      rather than shares of the serve. R44 fixed the landing floor and left the
      rest.

## Cycle B — Biomechanics and fault detection

Kinetic chain, trophy metrics, what the body actually did.

- [x] **B1 · R50·1** — The uncalibrated register used the one honest way: a delta
      between two of the player's own serves, on `Consistency`, as data. No
      sentence containing a target. External rotation, bounded against posture.
      *(Round 2 — the machinery, the storage guard and the panel line.)*
- [x] **B1b · R50·2** — Landing balance delta. *(Round 8 — and the round's own
      bound was the wrong number: 0.0035 is where a square landing sits, not how
      far a reading of it wanders. Bounded on the two deviations in quadrature.)*
- [~] **B1c · R50·3** — Chain span ratio delta. *(Round 14 — premise cycle: the
      register's 21% is the total spread, not the tempo term. Decomposed to 6%
      noise plus 0.0102 per second, so the bound is 0.0092 at equal tempo.)*
- [x] **B2 · R50b** — Did the racket lay back further than your last serve, on
      the glance. *(Round 21 — floor of 16.7°, and the round's own estimate of
      "about 15°" was right, unlike its two siblings.)*
- [ ] **B3 · R50c** — A trunk-sequence delta between two serves filmed from one
      spot. Needs A2's answer for its same-spot refusal.
- [ ] **B4 · R51** — Leg drive measured rather than timed: hip-centre rise in
      body heights plus knee extension rate, read from image y alone. Ships into
      `UNCALIBRATED` with a rig sweep proving it tracks the dial.
- [ ] **B5 · R52** — A pause between the trophy and the drop, as a trough in
      racket-hand planar speed. Sweep against `motionSeconds` first; an
      `UNDER_RESOLVED` entry saying it cannot be told from a slow serve is the
      finished round.

## Cycle C — Pedagogical coaching and UI

The translation from a number to a cue somebody can act on.

- [x] **C1 · R49·3** — Draw the ghost: the older track dashed under the newer in
      `TrackPlayer`, nothing below the hips. *(Round 3 — and the round's own
      "same-session case first" rule turned out not to apply to this surface.)*
- [x] **C2 · R53·1** — Inference refused: the rig's 18 sd separation is the one
      that was dialled, and "serves arrive in pairs" is a fact about practice
      with no fixtures. *(Round 22.)*
- [ ] **C2b · R53·2** — The tap. One tap on the glance, stored, and the spreads
      partitioned by it. The only honest route.
- [ ] **C3 · R56** — Did it go in: in, long, net, wide. One tap, no score, no
      stats screen. The trap is the claim — no correlation over six points.
- [ ] **C4 · R57** — The drills as a week, built from the 2–4 ranked drills the
      report already produces. No streak, no badge, no congratulation.
- [x] **C0 · R69·1** — The gate for copy that lives in a component. 96 lines,
      25 components, 15 failing — seven the lint being wrong, eight real. *(Round
      9 — and one of the eight contradicts R28's own close-out.)*
- [x] **C0b · R69·2** — Fix the eight. *(Round 15 — nothing in a component fails
      the editor now except the seven where the lint is wrong. R24's three
      transfer methods kept: the fix was a full stop, not a deletion.)*
- [ ] **C5 · audit 6** — A copy line that has drifted over the twenty-five word
      cap since it was written. R28 found its own phase had drifted; it drifts.

## Cycle D — Performance and architecture

Where state lives, what it costs, what it does to a warm phone.

- [x] **D0 · R68** — Take the validator half of `groundTruth.ts` back out of the
      entry chunk. *(Round 10 — 5.21 kB raw and 1.93 kB gzip off the critical
      path; residual 0.38 kB gzip against the pre-R59 baseline. The framing half
      moved, not the validator half, because its own doc argued for staying with
      the fixtures and coverage follows imports.)*
- [x] **D1 · R54·1 spike** — *(Round 16 — the gate the round names did not
      exist: `?check` asked about camera recording, and the replay needs
      `canvas.captureStream`. Capability now probed; cost still needs a phone.)*
- [!] **D1b · R54·2** — Build the replay share. Blocked on the court trip: the
      pane throttles canvas recording, so the cost cannot be measured here.
- [ ] **D2 · R55 spike** — The profiles migration, not the feature: every stored
      report predates profiles and must land under one default player with no
      prompt. Produces the split plan.
- [x] **D4 · R67** — The stored byte cost of a report, re-measured against
      `footprint.test.ts` after Phase 8's new fields. A report that grew and
      nobody noticed is the failure this budget exists to catch. *(Round 4 — the
      gate was counting pictures and tracks and nothing else; the ratchet had
      1.03× of headroom, not the third it claimed.)*

## Cycle E — Data management and export

Storage, backup, and the files a player is handed.

- [x] **E1 · R59·1** — The fixture export, reachable on a phone: `?fixture` in
      the production bundle, and what is still missing shown on screen instead of
      in a console. *(Round 5 — costs 2.31 kB gzip on the critical path, measured,
      and queued for removal as R68.)*
- [x] **E1b · R59·2** — The shoot list, in order, bound to the gate's three axes
      by a test. *(Round 11 — and "which is next" cannot be built: a phone cannot
      see what is committed to the repo.)*
- [x] **E1c · R59** — *(the round as a whole)* Make the fixture shoot something a
      user does by accident. *(Rounds 5 and 11.)*
      *Promoted ahead of the product band:* it is the only round that unblocks
      real footage, and real footage is what `groundTruth.ts`, hip–shoulder
      separation, shoulder tilt, `UNDER_RESOLVED.pronation_deg` and
      `chain_span_ratio` are all waiting on.
- [ ] **E2 · R54** — Share the replay as motion. Contains no image of any
      person — the rare share that is safe by construction. Gated on D1.
- [ ] **E3 · R55** — More than one player on one phone. Gated on D2.
- [x] **E4 · R58·1** — A trip, in one card, for a coach: the content, as data.
      *(Round 24 — and a trip nobody swept gets no repeatability reading rather
      than one invented from separate clips.)*
- [ ] **E4b · R58·2** — Draw it. ~260 lines of canvas, verified by pixel
      sampling since the pane will not composite.
- [x] **E5 · audit 4** — A `README.md` claim with no test behind it. *(Round 17 —
      "about 15 KB" for a pruned report. It is 31.3 kB: the swing track was
      written after that sentence and is kept on every report.)*

## Cycle F — QA and edge cases

Tests with teeth, refusals, and the things that only break on somebody's phone.

- [x] **F0 · R66** — A tally that does not cover its own file. *(Round 18 — the
      guard found a fourth instance on its first run, in `triage.test.ts`, and
      that one predates this session.)*
- [x] **F1 · R65** — `triage.quality` has a stored-shape guard. *(Round 23 —
      and the entry's stated consumers do not exist; the first version broke the
      restore path and an existing check caught it.)*
- [x] **D3 · audit 5** — A stored-data shape that predates its current writer.
      *(Round 23 — the answer was R65, already named. Done rather than
      duplicated.)*
- [ ] **F2 · R62** — Court lines, listed to be refused rather than built. The
      finished round is a README line recording the cost.
- [ ] **F3 · audit 1** — A refusal path nobody has counted on real footage.
- [ ] **F4 · audit 10** — An existing test re-run against its own canary, to
      check it still has teeth.
- [ ] **F5 · audit 3** — A number in `tiers.ts` whose band was set against the
      synthetic rig only.
- [ ] **F6 · audit 7** — The oldest `[!]` item, re-read to see whether it is
      still blocked.
- [ ] **F7 · audit 9** — The contrast ratio of a token pair on a surface a player
      reads outdoors. Measure and record the number; a token that fails is a
      finding, not a change.

---

## Blocked, and why

- [!] **R63** — The external-rotation lever refusal on real footage. Blocked
      behind E1.
- [!] **R64** — The landing reading switched to the front ankle. Blocked behind
      E1: the front-ankle baseline is the stance, and the rig has no stance dial.
- [!] **The court trip** — needs a phone. `COURT-CHECK.md` is the list.
- [!] **The fixture shoot** — needs real footage. `RECORDED` is 0 of 6.

Never select the court trip or the fixture shoot themselves, and never simulate
their data to unblock a round.

## When this runs dry

In order: the rest of the audit rotation, then a derived round. A new round is
admissible only if all four of these can be written down **before** building it:
the file it plugs into; the measurement already in the engine it stands on,
named; the claim it is not allowed to make; and the honest outcome if the rig
cannot separate the effect from its confounder. A well-reasoned refusal added to
`PHASE-8.md`'s "Considered and not proposed" list is a complete round.
