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
- [ ] **A2 · R49b** — Bound how often two clips from one trip agree on camera
      angle within 5°, from `estimateYaw` in `spatial.ts`. The real answer needs
      fixtures (R59); the bound does not.
- [ ] **A3 · R60** — Platform against pinpoint, from ankle separation over time.
      A context reading like serve type, never a graded fault. R51 needs it.
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
- [ ] **B1b · R50·2** — Landing balance delta, against the 0.0035 floor. Same
      machinery, one new entry.
- [ ] **B1c · R50·3** — Chain span ratio delta, bounded by the tempo difference.
- [ ] **B2 · R50b** — Did the racket lay back further than your last serve, on
      the glance, through `carryForward`. Refuses most comparisons by design.
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
- [ ] **C2 · R53** — First serve against second serve. One tap on the glance, or
      inferred within a basket. Pure product on existing readings.
- [ ] **C3 · R56** — Did it go in: in, long, net, wide. One tap, no score, no
      stats screen. The trap is the claim — no correlation over six points.
- [ ] **C4 · R57** — The drills as a week, built from the 2–4 ranked drills the
      report already produces. No streak, no badge, no congratulation.
- [ ] **C5 · audit 6** — A copy line that has drifted over the twenty-five word
      cap since it was written. R28 found its own phase had drifted; it drifts.

## Cycle D — Performance and architecture

Where state lives, what it costs, what it does to a warm phone.

- [ ] **D0 · R68** — Take the validator half of `groundTruth.ts` back out of the
      entry chunk. R59·1 measured it in at 6.41 kB raw / 2.31 kB gzip, carried by
      every player to serve a path behind a query string. *Head of this cycle.*
- [ ] **D1 · R54 spike** — Measure what a canvas recorder costs on this browser
      before any of R54 is built, and gate on `?check` the way the record button
      already does. Constraint 8 says guilty until measured.
- [ ] **D2 · R55 spike** — The profiles migration, not the feature: every stored
      report predates profiles and must land under one default player with no
      prompt. Produces the split plan.
- [ ] **D3 · audit 5** — A stored-data shape that predates its current writer.
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
- [ ] **E1b · R59·2** — The checklist: which of the six clips is next, read off
      `RECORDED` so it cannot drift from the gate.
- [ ] **E1c · R59** — *(the round as a whole)* Make the fixture shoot something a
      user does by accident.
      *Promoted ahead of the product band:* it is the only round that unblocks
      real footage, and real footage is what `groundTruth.ts`, hip–shoulder
      separation, shoulder tilt, `UNDER_RESOLVED.pronation_deg` and
      `chain_span_ratio` are all waiting on.
- [ ] **E2 · R54** — Share the replay as motion. Contains no image of any
      person — the rare share that is safe by construction. Gated on D1.
- [ ] **E3 · R55** — More than one player on one phone. Gated on D2.
- [ ] **E4 · R58** — A trip, in one card, for a coach. Recombines shipped parts.
- [ ] **E5 · audit 4** — A `README.md` claim with no test behind it.

## Cycle F — QA and edge cases

Tests with teeth, refusals, and the things that only break on somebody's phone.

- [ ] **F0 · R66** — A tally that does not cover its own file. R50·1 fixed the
      one instance in `copy.test.ts`; this is the static guard that catches the
      next one. *Takes the head of this cycle — it is a defect, not a feature.*
- [ ] **F1 · R65** — `triage.quality` has no stored-shape guard, and R49·1 found
      it. Needs a decision R49·1 had no business making: there is no honest
      default for a missing `confidence`, so the fitting pattern is `consistency`'s
      — dropped rather than repaired.
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
