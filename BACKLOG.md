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
- [x] **A4c · R61·3** — The outbound detector, as a streak. `vision/outbound.ts`:
      second moments give each blurred region a heading, so one frame carries a
      direction where a disc carries only a position. **The refusal is keyed to
      frames counted, never to the speed** — gate on the estimate and a bad enough
      estimate reads as slow and authorises itself. Nothing in mph, checked.
- [x] **A5 · audit 8** — Windows in `phases.ts` sized in file seconds. *(Round
      33 — right about one of four. The finish keyframe drifts 32% as a share of
      the motion; the three search windows are correctly in seconds.)*
- [x] **A5b · R72** — The finish keyframe is one swing after contact, measured in
      seconds and placed through the clock. Fixed, it held at 0.42–0.44 s while the
      swing ran 0.320–0.600 s: **the same instant was 1.31 swings after contact for
      one player and 0.73 for another.** Number-diffed — 19 figures moved, which is
      the cost R44 named — and the one calibration that can be checked moved the
      right way: a square landing reads **20% above its floor, down from 29%**.
      Round 33's finding, pinned as a check, now asserts the opposite.

- [x] **A6 · R80** — The toss-axis tie-drop **has never fired**. `axes.ts` sets
      `dominant` with an exact equality on 45, argued as "where sin and cos cross,
      so this is an equality test" — true, and it makes the null case one float
      value `estimateYaw` will never return. Measured end to end: at 45° a purely
      lateral wobble is reported as a **forwards-and-back fault, detected, at 0.52
      confidence** — seven hundredths above `MIN_EVIDENCE`, and `diagnose.ts` says
      a fault named on the wrong axis "costs the player the practice session they
      spend on it". At 82° the app reads **0.99 confident while missing the fault
      entirely**: `share` answers how much of image x is this axis, not how much of
      the toss was seen.
- [x] **A6b · R80b** — **The share floor was refused by its own derivation, and
      shipped as a yaw band instead.** Driving one wobble per axis and reading
      which fault the engine names: misattribution happens at 35, 40, 45 and 50,
      and stops at 30 and 55. **0.67 of dominant share is safe at 55° and unsafe
      at 35°** — share is symmetric about 45 and the two axes are not, which is
      F5's seven-fold collapse showing up again. So `AXIS_BAND = [32, 53]`, drawn
      from where misattribution actually stops rather than from a threshold on a
      symmetric quantity. **Cost stated: no toss axis is named across 21° of the
      60° the app accepts** — a corner clip gets no toss verdict instead of a
      wrong one. Number-diffed: nothing moved but the defect's own figure
      disappearing. R59's and R80's checks both closed, as their messages asked.

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
- [x] **B4b · R51·2** — Knee extension ships into `UNCALIBRATED`. Tracks its dial
      **0.89 to one across five rungs** (118°→51.7 … 158°→16.1, monotonic),
      deviation **5.9° against a 35.6° span** — the best-conditioned depth reading
      in the engine, against 9.4° for external rotation and 20.2° for pronation.
      World coordinates, not image y. Claims nothing about camera angle: the rig's
      invariance is a rig property, per R50c. Also fixed the chain audit printing
      a degree reading labelled `ms`.
- [x] **B5 · R52** — **Refused, and blocked on the rig rather than on the idea.**
      The trough reads easily — lowest planar speed between trophy and drop over
      the serve's own peak — and it is confounded by tempo *in the fault's own
      direction*: **0.2081 at a 0.95 s motion down to 0.0749 at 1.85 s, 2.8× with
      no hitch posed**, monotonic — restated at the engine's own smoothing by R84.
      The original 2.3× was measured at a radius the engine does not use. A slower serve reads as a deeper trough, so the
      reading cannot tell "stopped" from "unhurried". And the rig cannot pose a
      hitch, so separation is *unmeasured* rather than disproved.
- [x] **B5b · R52·1** — `trophyHitchSeconds`: the clock stops at the trophy and
      the motion is **longer** by exactly that, so a hitch does not imply a faster
      swing. Bit-identical at zero. **And it reverses R52's refusal in the
      conservative direction**: a 0.15 s hitch reads **28–34× smaller** than a
      flowing serve at the same tempo, against a 2.3× tempo confound. Caveat that
      travels with it — the rig's hitch is a *perfect* freeze, so this is the best
      case, not the expected one. A threshold still wants footage.
- [x] **B5c · R52·2** — **Built, measured, and reverted. R52·1's separation was
      an artifact of the wrong smoothing radius.** That round measured 28–34× using
      `planarSpeedSeries(..., 2)`; the engine builds its wrist series at
      `sampleRadius(t, CHAIN_WINDOW_SECONDS)`, which is wider, and a wider window
      fills a trough in. At the engine's own radius a 0.15 s hitch separates
      **1.7×** against a **2.8×** tempo confound — **the confound is larger than
      the signal.** Only a gross 0.3 s pause separates (120×), and somebody who
      stops for a third of a second is not the case this was for. Nothing
      published.

      **Caught by a canary that did not fire**: scaling the published reading by a
      third reddened nothing, because every existing check computed its own
      trough. The check comparing the two found the engine publishing 0.126 where
      the suite measured 0.049.
- [ ] **B5d · R52·3** — If the hitch is worth having, it needs its own series at
      its own radius — and that radius needs deriving, not borrowing. The reason
      R52·2 failed is that it borrowed one.

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
- [x] **C4 · R57** — **Refused: the page already exists, twice.** The ranked plan
      *is* the session — causal order, capped at four, rendered as a numbered queue
      with the first drill's method and every later rung's name and reps
      ("1. Baseline drop toss — 20 tosses · 2. Let the racket fall — 20 serves ·
      3. Slow sink hold — 3 sets of 8"). The progress sheet renders the recurring
      one the same way. A third surface restates two. Two checks now pin what makes
      the plan a session: every rung has a drill with a dose, and none repeat.
- [x] **C4b · R57b** — One strap on the home screen: the last drill's name and a
      way into the report it came from. **One drill, never the queue** — the test
      round 48 set was that it must not say anything the report already says in the
      same words, and a queue here would be the refused page in a smaller box.
      Walks past refused clips, so one bad film does not blank last week's
      reminder. Zero new CSS: `.strap` is the shape already below it.
- [x] **C0 · R69·1** — The gate for copy that lives in a component. 96 lines,
      25 components, 15 failing — seven the lint being wrong, eight real. *(Round
      9 — and one of the eight contradicts R28's own close-out.)*
- [x] **C0b · R69·2** — Fix the eight. *(Round 15 — nothing in a component fails
      the editor now except the seven where the lint is wrong. R24's three
      transfer methods kept: the fix was a full stop, not a deletion.)*
- [x] **C6 · R83** — The third runtime-assembled producer C5 named, read at last.
      `faultMoveLine` interpolates a flaw title into a fixed frame — the same shape
      as the practice-card line that ran 27 words against a 25 cap — and was
      checked only for structure. Driven across **every flaw × every verdict ×
      both forms, 80 sentences**, off `FLAWS` rather than a pasted list, because a
      pasted short one is exactly what hid C5's defect. **All 80 clean, longest 12
      words.** The gap C5 opened is now fully closed.
- [x] **C5 · audit 6** — **The answer was a gap, and two shipped defects sitting
      in it.** Two copy gates exist and cover different halves — tables, and
      sentences written into JSX. Between them: functions that *assemble* a
      sentence at runtime, in no table and no component. Three of those are
      rendered and none was linted. Driving them found (1) passive voice on the
      practice card, and (2) the same line **twenty-seven words against a 25 cap**
      whenever `r.label` is the six-word "Hitting the ball at its peak" — invisible
      to every fixture, which all used two-word labels. The canary then found (3)
      "**Your** hitting the ball at its peak scores fine", which is not a sentence.
      All three fixed; the check now drives the longest label `METRICS` holds,
      read off the table rather than pasted.

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
- [x] **D6 · R75** — Bundle probed after four rounds of new modules. Entry chunk
      **416.90 kB raw / 139.09 kB gzip**, MediaPipe 138.83/41.55, CSS 54.19/10.35 —
      and the two staged detectors cost the critical path **nothing**, confirmed by
      grepping the built chunk for their string literals rather than their symbol
      names, which minify away. The probe found a refusal-name collision instead:
      `outbound.ts` shipped a `too_few_frames` beside `triage.ts`'s, meaning
      something else. Renamed, and `REJECTIONS` is now a walkable list so the class
      is checkable.
- [x] **D7 · R78** — The history walk in a render path, memoised and measured.
      R76 shipped `TripShareButton` calling `tripsOf` and `tripSummary` in its
      body with no memo, on a sheet that also draws a chart. **The honest number
      is that it cost 0.016 ms — 0.1% of a 60 FPS frame** — so the defect was
      identity, not speed: both allocate, so the summary was fresh every render
      and nothing downstream could memoise against it. Now pinned with a linearity
      guard: 4.4× cost for 4× the reports, and a cubic scan canaried it to 20.5×.
- [x] **D8 · R81** — The bundle, pinned rather than measured. R75 wrote 416.90 kB
      raw / 139.09 gzip into a backlog row; three rounds added components and
      nobody looked again — **the exact shape F4 found twice**, a measured number
      with no gate behind it. Now a ratchet: entry 419.71 raw / 139.88 gzip against
      440 / 145, the pose runtime held in its own chunk at 41.43 against 45, both
      dev routes checked as split, and the stylesheet watched because nothing else
      watched it. Reads `dist` and **fails rather than skips** when it is absent.
      Found a unit mismatch on the way: the first version divided by 1024 while
      Vite prints decimal kB, so every future comparison would have been 2.4% off.
- [x] **D9 · R84** — **Two rounds reasoned about a quantity the app does not
      compute, and the suite still held their numbers.** R52·1 and R52·2 reached
      opposite conclusions from one argument: the checks called
      `planarSpeedSeries(..., 2)` where the engine calls it with
      `sampleRadius(t, CHAIN_WINDOW_SECONDS)`. Both remaining radius-2 checks moved
      to the engine's own radius — R52's tempo confound restates from 2.3× to
      **2.8×**, and R52·1's superseded separation check is deleted rather than left
      contradicting R52·2. Gated: no test may build one of these series at a
      literal radius. Take the constant, not the number.
- [!] **D2d · R55·2c** — The switch, as a tap. **Blocked on constraint 3**: every
      `<input>` in this app is `type="file"`, `tokens.css` strips inputs to no
      border and no background, and a visible text field needs border, padding, a
      focus ring and a placeholder colour. That is new CSS, and it needs asking
      for rather than assuming.
- [x] **D5 · R73** — A gate for optional props nothing passes. Found `defaultOpen`
      on `FundamentalCard` on its first honest run. The wider "any unused export"
      version was built, measured at 116 of 483, and refused.
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
- [x] **E6 · R74** — The taps, in the backup file. They were never carried: the
      tag store arrived in R53·2a, gained outcomes in R56, and neither round came
      back to `backup.ts`. A player moving phones kept every report and every
      drill record and silently lost the one part of the history the camera did
      not produce. Read last, after the prune, so an orphaned tag is refused
      rather than stored about a serve nobody can open.
- [x] **E7 · R76** — The trip card, made pressable. `shareTripCard` and
      `renderTripCard` were built at R58·2, checked down to "a trip nobody swept
      draws no repeatability row", and **no control in the app could produce one**
      — twenty rounds invisible, and the third dead feature this session. Wired as
      `TripShareButton` on `SeasonShareButton`'s pattern; hidden on a trip of one,
      where best and worst are the same report. The reachability gate now covers
      share entry points, with imports stripped — its canary passed until they were.
- [x] **E8 · R79** — Every key the export writes, ruled on in the player's own
      terms. `egress.test.ts` closes constraint 7 on the axis it usually means —
      no network call — and says nothing about the one file that legitimately
      leaves, because that egress is the *player's*. `StoragePanel` promises "your
      scores and real photos of you serving"; nothing made that stay true. **R74
      added a store to the file and never revisited the sentence.** Driven through
      `buildBackup` rather than read off the type, because it was the builder that
      was wrong for twenty rounds, not the type.
- [x] **E10 · R85** — **The register quotes deviations and nothing checked them.**
      R84 had just found a figure this loop published twice, measured at the wrong
      smoothing radius. Two `UNCALIBRATED` entries state a deviation the ensemble
      also measures, so those two are now held to it, read out of the entry string
      rather than pasted and compared at the precision the entry claims. **First
      run: `leg_drive_rise_ratio` says 0.004 and the ensemble measures 0.0059 —
      47% off.** The fourth stale recorded figure this loop has found, after a
      315 ms jump nobody could reproduce, a landing floor 29% out, and R84's.
- [x] **E9 · R82** — The share card's copy, read for the first time. C5 found the
      gap; this is the same gap in a worse place — **forty-four `fillText` calls and
      no gate had ever read one.** Everything else the app writes is read by the
      player alone and corrected on the next report; a card is a PNG in somebody
      else's chat. First run found the privacy footer, on **every** card, reading
      "Measured on device · nothing was uploaded" — passive, in the one sentence
      that is a promise rather than a description, while `Home.tsx` and
      `FramingCheck.tsx` both say it actively. Now "Measured on your phone · the
      video never left it", and the three surfaces are checked for agreement.
      Coverage stated as partial: 15 of 44 are literals a regex can see.
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
- [x] **F4 · audit 10** — Eight load-bearing constants flipped one at a time.
      Six had teeth (`MIN_EVIDENCE` 4 red, `SOFT_MEASUREMENT` 11, height spread 3,
      yaw tolerance 2, swing-sample limit 1, word cap 1). **Two reddened nothing
      at a tenfold change**: `LEG_DRIVE_FLOOR` and `LANDING_SQUARE_FLOOR`, both
      with derivations recorded in their own comments and no gate behind them.
      Both now pinned against the rig — 0 red → 1 red each.
- [ ] **F4b · R77b** — Re-derive `LANDING_SQUARE_FLOOR`. A square landing reads
      **0.0045 on ten seeds against a stated 0.0035** — 29% above, where the
      leg-drive floor beside it lands within 3%. Not corrected here: the constant
      calibrates `LANDING_SQUARE_DEVIATION` and the delta noise in
      `consistency.ts`, so moving it off ten seeds inside a round about test teeth
      is the unmeasured change this repo keeps catching. Needs the full ensemble
      and a number diff.
- [x] **F5 · audit 3** — `toss_drift_ratio`, and the finding is worse than the
      marker. One physical 0.10 m wobble dialled onto each axis in turn: the depth
      axis reads 0.0519 / 0.0818 / 0.0841 / 0.0831 at 30 / 45 / 60 / 82° of yaw,
      the lateral axis 0.0755 / 0.0715 / 0.0429 / **0.0101**. **A seven-fold
      collapse, worst at the angle the filming guide recommends.** One band spans
      both. Not repaired — nothing here has ever filmed a lateral wobble, so a
      second band would be invented — but pinned, and the constant's comment now
      carries the numbers.
- [x] **F6 · audit 7** — **R64's blocker was wrong twice and had been for
      fifty-three rounds.** The rig grew the stance dial it says is missing at
      R60·1, and it never needed one: the front foot is named by handedness. The
      measurement then found the current both-ankle baseline is *contaminated* —
      one lean reads **2.00× differently** as the back foot slides up, while the
      front ankle is flat. R64 is unblocked and justified; switching still costs a
      re-derivation of the landing floor.
- [x] **F7 · audit 9** — Contrast measured across eleven pairs, parsed from
      `tokens.css` rather than copied. **Every pair clears WCAG AA; body text is
      17.40:1, past AAA.** The finding is the margin: `--fg-faint` on a card is
      4.87:1 against a 4.5 floor — 8% of headroom, on the faintest text, on the
      surface most of the report is drawn on. Nothing changed; the margin is now
      checked, so a token nudged two points darker cannot eat it silently.

---

## Blocked, and why

- [!] **R63** — The external-rotation lever refusal on real footage. Blocked
      behind E1.
- [ ] **R64** — **UNBLOCKED BY F6, and its blocker was wrong twice.** It read
      "the front-ankle baseline is the stance, and the rig has no stance dial".
      The rig grew one at R60·1 (`pinpointSlide`, `landingBackFootDrag`) — and it
      never needed one: **the front foot is named by handedness**, not measured. A
      right-handed serve lands on the left foot. R60·2 refused *measuring* the
      stance from a side-on camera, and the blocker conflated that refusal with a
      question handedness already answers.

      Measured, and the current baseline is contaminated rather than merely
      arbitrary: one dialled 0.12 m lean reads **0.0643 / 0.0482 / 0.0321** as the
      back foot slides up — **2.00× from a stance change with nothing to do with
      balance** — while the front ankle reads 0.1142 flat, 1.00×.

      Not switched: it moves every landing reading and re-derives
      `LANDING_SQUARE_FLOOR`, `LANDING_SQUARE_DEVIATION` and the delta bound built
      on them. R44's rule — the cost R72 paid deliberately and R80b is waiting on.
      Pinned in `depth.test.ts` so it cannot go back to being blocked for a reason
      that stopped being true.
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
