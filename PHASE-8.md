# Phase 8 — activated. Fifteen rounds, ranked.

**Activated into `NEXT.md` on 2026-08-17, and renumbered R48–R62 on the way in.**
The numbers below collided: R44–R47 were already spent in Phase 7 on the
MediaPipe entry chunk, the pre-frame refusals, the "half a minute" audit and the
screen layer. `NEXT.md` carries the mapping table and is the ledger. This file
stays the derivation and the spec — every round here was written after reading
the engine, and names the file it plugs into and the claim it may not make. Read
the round here before starting it; record the outcome there.

Two changes made at activation, both recorded in `NEXT.md`: **R55 was promoted**
ahead of the product band, because it is the only round that unblocks real
footage; and **two rounds were added from `feature_backlog.json`** (R50b, R50c)
which are adjacent to R46 rather than duplicates of it — R46 puts deltas on the
basket, those put them on the glance.

R44 below is done and keeps its number, because it landed in `9079deb` before
this activation rather than through it.

Every round below was written after reading the engine rather than after reading
`README.md`, and each one names the file it plugs into and the claim it is not
allowed to make. The governing constraints in `LOOP.md` outrank all of it — in
particular constraint 1, which kills three otherwise obvious features in this
list and is the reason four of them ship into `UNCALIBRATED` rather than into
`SIGNALS`.

Ranked by **value to a player × what can be done without a phone or footage**.
R44–R48 need neither. R49–R53 are product surface on measurements that already
exist. R54–R58 are the ones with a real dependency, named.

---

## The three things this app is currently missing most

Stated first because the ranking below follows from them.

1. ~~**The swing is the fastest part of the serve and gets the fewest frames.**~~
   **Disproven by R44, and what it was hiding is worse.** The swing gets five
   samples because 30 fps video holds five frames in a sixth of a second, not
   because the budget is spread evenly — `samplingRateFor` returns
   `min(32, 44.4)` on the recommended window, so `FINE_FPS` binds and no
   reallocation creates frames the file does not have. What the sweep found
   instead: **every window in the engine is a fixed number of file seconds**,
   tuned for one tempo, and the guard protecting the newest reading in the app
   was tempo-bound in exactly the way it was written to prevent. See R44.

2. **The most persuasive picture the app could draw is measured and unbuilt.**
   `f8816b0` did the hard half: normalisation kills distance and framing
   (0.083 → 0.0009 body heights over a ±15% zoom), camera angle cannot be
   normalised away and costs 0.0072 body heights per degree, so the gate is 5°,
   and real faults sit six to nine times the noise floor. The commit body ends
   "round two is the build". Nothing since has built it.

3. **Five measurements are taken and said to nobody.** `external_rotation_deg`,
   `legs_peak_ms`, `chain_span_ms`, `chain_span_ratio` and `LandingBalance` are
   all in `UNCALIBRATED` because no one knows what a club player's number should
   be. That is the right refusal for an *absolute* band and it has been read as a
   refusal to use them at all. Inside one clip — one camera, one posture, one
   player, minutes apart — a **difference** between two of the player's own
   serves is confounded by almost nothing, and that is the one comparison these
   readings can honestly support.

---

## R44 — [x] The serve's own clock, and the thing it was hiding

**The round as written below was wrong, and measuring it is what found the real
defect.** Both halves are recorded.

**What was claimed.** That the swing gets five samples because the frame budget
is spread evenly, and that reallocating it would buy twenty. **False.**
`samplingRateFor` on the recommended 2.7 s window returns `min(32, 120/2.7)` =
`min(32, 44.4)` — the binding constraint is `FINE_FPS`, not the budget, and
`FINE_FPS` is 32 because phone video is 30 fps. The swing gets five samples
because 30 fps video contains five frames in a sixth of a second. No schedule
creates frames that are not in the file. The budget binds only on the two wide
windows — the 5 s blind fallback at 24 fps and a short single-pass clip at up to
26.7 fps — and buying samples there is worth a round on its own, not this one.

**What the measurement found instead.** Sweeping the rig from 1× to 8× stretched
showed every search window in the engine is a fixed number of *file* seconds,
tuned for one tempo. Contact never moves (≤ 0.02 s at every stretch — it is found
by search). Ready drifts from 1.5× (0.35 s, 2.35 s at 4×). Toss holds to 3× then
goes (0.76 s at 4×, 3.03 s at 6×, trophy collapsing onto it). And `keys.finish`
is pinned a fixed 0.5 s past contact, which on a stretched clip is a body that
has barely left the ball.

Underneath that sat a live instance of the one thing this codebase forbids.
`MIN_LANDING_SECONDS` was 0.3 s, derived by cutting one 1.35 s serve shorter and
shorter, and applied to every clip regardless of tempo — so on a four-times
stretched file it admitted a finish 5.5% of the way through the motion and
returned a confident number for it. The guard written to stop the landing
reporting a confident zero was itself tempo-bound.

**Shipped.** The floor is a share of the serve — `MIN_LANDING_SHARE = 0.258` of
ready-to-contact — with the denominator taken from what the code measures rather
than what the rig dials. Those differ by a fifth: `findReady` starts 12% up from
rest, so a 1.35 s dial measures 1.16 s, stable at 1.167 / 1.160 / 1.150 s across
30 / 50 / 120 fps with zero spread across seeds. 0.258 reproduces the old 0.30 s
floor to within a millisecond, so ordinary footage is untouched to the digit, and
a serve past about 2.2 s refuses where it used to answer.

One check in `depth.test.ts`, verified to have teeth: restoring the fixed 0.3 s
turns exactly that check red and nothing else. README carries the sweep table.

**Left open, as its own round:** sizing the phase windows in `phases.ts` by the
serve's own length. That is the fix that would let a stretched clip be *read*
rather than refused, and it moves `keys.finish` on every clip whose motion is not
1.35 s — so every noise floor in `tiers.ts` was derived against the current
values and would need re-deriving. Not smuggled into this round.

## R44b — Spend the frame budget where the serve is fastest, where it binds

> **Refused as R48 on 2026-08-17, and the paragraph below about contact being
> known before the fine read is the reason.** It is true of the located window,
> which spends 86 of its 120 frames and is capped by `FINE_FPS`, not by the
> budget. The two windows that do bind the budget — the blind fallback and a
> single-pass clip — both reach `readWindow` with an empty `times`, so there is
> no contact time to centre a weighted schedule on. The two conditions
> anti-correlate exactly. See `NEXT.md` R48 for the table and the check that
> pins it.

**The salvageable half of R44 as written.** The budget is not the constraint on
the recommended window, and it is on two others: the 5 s blind fallback (24 fps)
and a short single-pass clip (up to 26.7 fps). A weighted schedule buys real
samples through the swing there at no extra seeks, and `scanForServes` already
establishes the pattern in the same file — a coarse pass, then `planRefinement`
re-reads a grid around the peaks, then both sort together with nothing to merge
by hand.

Replace the even schedule in `extract.ts` (the
`const t = start + (span * i) / (count - 1)` loop) with a weighted one that puts
more of the budget around contact and thins the lead-in, where nothing is
measured but the ready pose. The contact time is **already known before the fine
read** — `readWindow` centres its window on `times[index]`, the hand-height peak
the scan found — so this needs no second pass and no re-seek, only a different
set of `t` values handed to the same loop.

**Size the claim to what is actually available,** which is the trap R44 fell
into. On the fallback window the ceiling is `FINE_FPS` and the floor is today's
24 fps, so the most this can buy through a 0.16 s swing is about four samples
against today's four — a third more, not a quadrupling. On a 4.5 s single-pass
clip it is smaller still. Worth having, and it is a robustness fix for the clips
that are already worst off rather than an improvement to the ordinary path.

**What it must not do:** thin the lead-in below what `phases.ts` needs to find
ready and toss — which R44 measured, and which is tighter than it looks on a slow
server. The toss peak was re-pinned in `30db5d1` and this must not cost it back.

**Test:** ensemble in the noise suite, not an accuracy check. Re-run the
`NOISE_FLOOR` derivation under both schedules on a fallback-width window and
print both columns. A floor that comes down moves a signal out of
`UNDER_RESOLVED` with no edit to `tiers.ts` — `rungStep` does that automatically.
If no floor moves, the round is finished by pinning that and saying so.

---

## R45 — The ghost: today's swing over your best one

Round two of `f8816b0`. Everything it needs exists: `Analysis.track` is stored,
`replayFrom`/`trackFrameAt` read it, `TrackPlayer` draws it, `ghostFor` in
`skeleton.ts` already draws a dashed target body, and `estimateYaw` is the gate.

Build: align the two tracks at contact, normalise to hip centre and scale by
shoulder-to-ankle, refuse the pair when the two clips' yaw differs by more than
5°, and draw the older track dashed under the newer one in `TrackPlayer`.

**Three things it must refuse, all of them already measured:**

- **Legs.** Removing the leg load entirely moves the worst drawn landmark 0.0387
  against a 0.0341 floor. A player told to watch their legs against a ghost is
  watching noise. Draw nothing below the hips — the same refusal `ghostFor`
  already makes, for the same reason.
- **Yaw over 5°.** Not a similarity transform, so normalisation leaves it
  bit-identical. Silence, not a hedge.
- **Across a rubric change or a serve type change.** `comparisons.test.ts` is
  where that rule lives and this is a tenth entry in it.

**The open question, named in the commit and still unanswered:** how often two
clips from one trip agree on camera angle within 5°. Nobody knows; it is a fact
about how people film. **Build the same-session case first** — two serves from
one basket share a camera by construction, so the gate is satisfied for free —
and let best-ever fall out when the gate passes. That ordering means the feature
ships whatever the answer turns out to be.

---

## R46 — Use the uncalibrated register the one way it is honest

`UNCALIBRATED` says these five have no zero and no band. Inside one clip they do
not need one.

Ship, as data on `Consistency` rather than as a graded signal:

- **External rotation delta.** Both reference frames agree exactly about a
  *change* (14.4° per 15° dialled). The confound is posture, and `tiers.ts`
  already carries `ER_LEAN_SENSITIVITY` at 0.5° of reading per degree of lean,
  with `signals.spine_lean_deg` on the same diagnosis — so the error bar on a
  within-basket delta is computable rather than assumed. Refuse the pair when the
  bound exceeds the delta.
- **Landing balance delta.** 0.0035 ± 0.0028 square against 0.0657 ± 0.0045 at
  0.12 m — fourteen deviations of separation, better conditioned than most of
  what the engine grades. Calibrate against the 0.0035 floor, which is written
  down and stable from 24 seeds to 240.
- **Chain span ratio delta.** Tempo dependence is 21% after division, so a delta
  between two serves at the same tempo carries far less of it than an absolute
  does. Bound it by the tempo difference between the two serves, and refuse when
  that bound eats the delta.

**What it must not say:** any sentence containing a target. "Your shoulder laid
back 18° further on serve 4 than on serve 1" is a fact about two serves.
"18° further than it should" is four invented numbers, and it is the thing this
whole register exists to prevent. No entry moves out of `UNCALIBRATED`; each
gains a line saying a delta is now reported and an absolute still is not.

---

## R47 — Leg drive, measured rather than timed

`UNCALIBRATED.legs_peak_ms` states the gap in its own words: it "times the leg
drive without measuring it — the same peak whether the player drives or not". The
amplitude is missing, and it is the thing R45's ghost explicitly cannot show.

Measure the hip centre's vertical rise from trophy to contact in body heights,
plus the knee extension rate across the same span. **Read from image y alone**,
which is vertical for every camera the app accepts and whose mean, per the same
entry, does not move at all across yaw from 20° to 88°. This is the best-
conditioned axis in the engine.

It joins knee bend at the trophy, which is already graded, to complete the pair:
how far the legs loaded, and how much of that load actually became upward motion.
A player who bends deeply and drives nothing is a real and common fault the app
cannot currently name.

**Ships into `UNCALIBRATED` first,** with a rig sweep against the leg-drive dial
establishing that the reading tracks it — which is precisely what `legs_peak_ms`
failed and is why it is there. A band waits for footage, like everything else.

---

## R48 — A pause between the trophy and the drop

The rhythm group measures motion length, post-trophy share, and whether the arms
arrive together. It cannot see a hitch — the player who reaches the trophy,
stops, and then swings from a standstill. That is one of the most common club
faults and one of the most visible on video.

Read it as a trough in racket-hand planar speed between the trophy and the drop,
off `kinematics.ts`, which already produces the series. Planar speed off image x
and y touches no inferred depth — the same property that makes `chain_span_ms`
the best-conditioned timing in the engine.

Sweep it against `motionSeconds` first, because a slow deliberate serve is not a
hitch and a detector that cannot tell them apart is worse than no detector. If it
cannot separate them on the rig, the honest outcome is an `UNDER_RESOLVED` entry
saying so — a finished round.

---

## R49 — First serve against second serve

The app knows flat, kick and slice. It does not know first from second, and for a
club player the gap between the two is usually a bigger problem than either one:
a second serve is not a slower first serve, it is a different motion, and the
player who patty-cakes it is doing something the app currently averages away.

Tag a serve as first or second — one tap on the glance, or inferred within a
basket where serves arrive in pairs — and report the technique difference across
the two populations using measurements that already exist. `consistency.ts`
computes spreads today; this partitions them.

**Pure product on existing readings.** No new measurement, no new refusal.

---

## R50 — Share the replay as motion

`reportCard.ts` renders one still image, which is the app's only egress and the
one thing a player actually sends to somebody. `TrackPlayer` draws a moving body
to a canvas, and the recording path already proves the app can capture a canvas
with `MediaRecorder` and knows which containers this browser will produce *and*
play back (`selfCheck.ts`, `recordingType`).

A three-second animated replay of the tracked body, with the fault's keyframe
held, is the strongest thing this app could hand somebody — and it contains no
image of any person, which makes it the rare share that is safe by construction.

**Constraint 8 is the risk.** A canvas recorder on a warm phone is exactly the
thing that must be measured rather than assumed, and `?check` already reports
what this browser will record. Gate on it, the way the record button already
does.

---

## R51 — More than one player on one phone

`consistency.ts` already carries `possibleHandoff` and
`IMPLAUSIBLE_HEIGHT_SPREAD` — the app can detect that the body in the clip
changed, and does nothing with it. Every trend, streak, practice focus and injury
count silently assumes one player.

Named profiles in `db.ts`, keyed into `Session`, with the existing handoff
detector offering the switch rather than a settings screen nobody opens. This is
the change that makes the app usable by a coach with a squad, a club with a ball
machine, or two people in a family — which is a different customer entirely, at
no cost to the privacy model, because nothing leaves the device either way.

**The migration is the hard part,** not the feature: every stored report predates
profiles and must land under one default player without a prompt.

---

## R52 — Did it go in

One tap on the glance: in, long, net, wide. Nothing else — no score, no stats
screen, no service box.

It is the missing link between technique and the only outcome a player cares
about, and it costs no vision work at all. It also makes every other record in
`progress.ts` more valuable retroactively.

**The trap is the claim.** "Your toss drifts more on the serves you miss" is a
correlation over six data points and this codebase does not say things like that.
Report it descriptively — the tags beside the technique, on the same trip — and
let the player see it. Anything stronger needs a sample size nobody has.

---

## R53 — The drills as a week, not as a footnote

Thirteen drills exist in `coaching.ts` and are only ever seen attached to a
fault. `PracticeCard` already records that a drill was done, and
`sixWeekMilestone` already spans a training block. What is missing is the middle:
a page that says what to do at the next practice, built from the 2–4 ranked
drills the report already produces.

**No streak, no badge, no congratulation** — `PracticeCard`'s existing restraint,
which exists because an app that celebrates the tap fills its own record with
drills nobody did.

---

## R54 — A trip, in one card, for a coach

`renderBasketCard` shares one basket. A coach wants the trip: the spread, the
best and worst serve, the recurring strain line, and what the player was asked to
work on. Every one of those already survives a reopened report without a clip.

Ranked here rather than higher because it is a recombination of shipped parts
and R50 may be the better artifact to send.

---

## R55 — Make the fixture shoot something a user does by accident

**Unblocks the two items `NEXT.md` has been stuck on since R25.** `RECORDED` is
empty, 0 of `MINIMUM_RECORDED = 6`, and until it is filled, hip–shoulder
separation and shoulder tilt are unvalidated against anything real,
`UNDER_RESOLVED.pronation_deg` cannot be re-examined, and `chain_span_ratio`
cannot leave `UNCALIBRATED`.

`dev/exportFixture.ts` exists but lives behind a dev build. The six clips are
listed in `fixtures/README.md` and every one of them is a normal serve filmed
normally — the only unusual requirements are a left-hander and one clip with the
feet deliberately cropped.

Make the export a first-class path with the checklist attached, so the person
holding the phone can produce the whole set in one session without reading the
repo. It does not break the egress rule: the player saves a file and decides what
to do with it, exactly as the share card works.

---

## R56 — Platform against pinpoint

The app has no idea which stance it is looking at, and the two want different
leg-drive advice and different balance at the finish. Readable from ankle
separation over time — the back foot sliding up to the front is a pinpoint, and
it is a large, slow, unambiguous motion along the axis the camera sees best.

A **context reading like serve type, not a graded signal.** Nothing here is a
fault. Its value is that it decides which of two correct drills is the right one,
and R47's leg-drive reading needs it to interpret what it measures.

---

## R57 — Ball speed off the strings

`planSharedPass` in `detector.ts:273` throws with the message "the detector
contract exists, the pass does not. See W6 (racket head) and W7 (ball past
contact)". The whole shared-grid design is written and reasoned about; the
implementation is absent.

Build **W7 only.** The ball is real pixels, already tracked, and its speed off
the strings in body-heights per second is a genuine new measurement — the first
thing in this app that would describe the *result* of the technique rather than
the technique.

**Do not build W6 as a measurement.** `racket.ts` says in its own header that the
racket estimate "deliberately does not feed any measurement", because hand
landmarks are the least reliable part of the pose output and are at their worst
exactly where a racket number would have to be trustworthy. R44 improves that and
does not fix it.

**Never in mph.** A speed in body heights per second is what was measured; a
speed in miles per hour is a claim about a court distance nobody surveyed.

---

## R58 — Court lines

The enabler for foot faults, serve placement and where the ball actually landed —
the three things every player asks for and none of which this app can see.

Ranked last, honestly: it is a vision project of the same size as the ball
tracker, it fails on exactly the amateur footage this app is built to forgive
(a phone at the baseline sees almost no court), and it would arrive with no
calibration and no fixtures. Listed so the next person does not have to
rediscover the cost.

---

## Considered and not proposed

- **Spin rate.** Not visible at 30 fps from a phone, at any distance.
- **A band on absolute external rotation.** Ruled out rather than pending —
  `UNCALIBRATED` carries the derivation and it is correct.
- **Re-deriving `NOISE_FLOOR` from real footage.** Blocked on R55, which is why
  R55 is in the list at all.
- **Anything that sends a clip anywhere.** Constraint 7.
- **Restyling any of it.** Constraint 3. Two redesigns were built and rejected;
  every round above assembles from `primitives.tsx` or says in its commit body
  that no token fits.
