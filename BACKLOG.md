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
- [x] **A4 · R61·1 spike** — *(Round 27 — 3.9 frames at a strong serve against
      8.0 at club speed, and a 1.50 m smear against a disc detector. Not a
      refusal; a shape the build must fit.)*
- [x] **A4b · R61·2** — `planSharedPass` built. Union window, one grid, per-detector
      coverage, and a drop-never-readmit rule for detectors the grid is too slow for.
      Split `pose/rate.ts` out so the DOM-free vision layer can share the rate.
- [ ] **A4c · R61·3** — The outbound detector, as a streak rather than a disc,
      refusing above the speed where the frames run out. Never in mph.
- [x] **A5 · audit 8** — Windows in `phases.ts` sized in file seconds. *(Round
      33 — right about one of four. The finish keyframe drifts 32% as a share of
      the motion; the three search windows are correctly in seconds.)*
- [ ] **A5b · R72** — Move the finish keyframe to a share of the serve. Needs a
      number diff and a re-derivation of the landing calibration — R44's warning.

## Cycle B — Biomechanics and fault detection

Kinetic chain, trophy metrics, what the body actually did.

- [x] **B1 · R50·1** — The uncalibrated register used the one honest way: a delta
      between two of the player's own serves, on `Consistency`, as data. No
      sentence containing a target. External rotation, bounded against posture.
      *(Round 2 — the machinery, the storage guard and the panel line.)*
- [x] **B1b · R50·2** — Landing balance delta. *(Round 8 — and the round's own
      bound was the wrong number: 0.0035 is where a square landing sits, not how
      far a reading of it wanders. Bounded on the two deviations in quadrature.)*
- [x] **B1c · R50·3** — Chain span ratio delta. *(Rounds 14 and 34 — the only
      one of the three whose bound varies per pair, and it needed no new stored
      field: the tempo is recoverable from the stored keyframes.)*
- [x] **B2 · R50b** — Did the racket lay back further than your last serve, on
      the glance. *(Round 21 — floor of 16.7°, and the round's own estimate of
      "about 15°" was right, unlike its two siblings.)*
- [x] **B3 · R50c** — Refused. The trunk lead is exactly invariant to camera yaw
      (58.199 ms at 4° and at 75°), so a same-spot gate buys nothing at any
      tightness. The real floor is a delta noise of 74 ms against a 76 ms noise
      floor — 97% of it, before the two serves have differed by anything.
- [x] **B4 · R51·1** — Leg drive measured rather than timed: hip-centre rise in
      body heights. *(Round 28 — tracks its dial near 1:1, identical at 45° and
      82°. Ships into `UNCALIBRATED`.)*
- [ ] **B4b · R51·2** — Knee extension, if it can be justified on its own terms.
      Not from image y, and it cannot name the stance — R60·2 refused that.
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
- [x] **C2b · R53·2a** — Where a player-side fact lives: a third store, keyed
      by report id. *(Round 29 — a field on the row is erased by every re-run.)*
- [x] **C2c · R53·2b** — The tap on the glance, and the spreads partitioned.
      *(Round 35 — zero new CSS, and the partition never infers.)*
- [x] **C3 · R56** — Did it go in. Four chips on the glance, stored on the tag row
      beside the serve number, and nothing said back. Found the round-35 tap block
      had never been wired into App, so it had never rendered.
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
- [x] **D2 · R55·1 spike** — *(Round 30 — thirteen functions read the whole
      history, four of which I missed by hand; and a profileId on the row is
      erased by every re-run, the defect R53·2a solved one round earlier.)*
- [x] **D2b · R55·2a** — The migration, and the decision: the profile lives on
      the row, supplied by `saveSession`. *(Round 36 — one default, no prompt,
      and one filter rather than thirteen.)*
- [x] **D2c · R55·2b** — Refused. `possibleHandoff` is camera-position-bound:
      92 cm of re-propping crosses its threshold, so across sessions it flags one
      player as two. Guarded by two checks, because R55·2a made a `Session`
      structurally acceptable to it.
- [ ] **D2d · R55·2c** — The switch, as a tap. Needs the app's first text input.
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
- [x] **E4b · R58·2** — Draw it. *(Round 31 — and the refusal survives into the
      pixels: a trip nobody swept draws no repeatability row at all.)*
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
- [x] **F2 · R62** — Court lines, refused. *(Round 26 — 5.9 m of frame against
      8.23 m of singles court, derived from a constant the app already
      enforces.)*
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
