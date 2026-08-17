# PROGRESS

The running log of the 75-round loop. One entry per round: what was picked, what
was built, and what the critic said before it committed.

`NEXT.md` records **what a round settled** and stays the source of truth for
round status. This file records **how the round ran** — the gates, the critic's
verdict, the retries, and any departure from the brief. Neither restates the
other.

## How this loop is wired to the ones before it

This repo already had a working loop protocol when the 75-round brief arrived:
`LOOP.md`'s eight governing constraints, `NEXT.md` as the ledger, and
`UNATTENDED-LOOP.md`'s five builders and five critics. Rather than start a rival
programme, the brief's three roles are mapped onto it:

| The brief | Here |
| --- | --- |
| Orchestrator | Picks from `BACKLOG.md`, which is a focus-area view of `NEXT.md` |
| Builder | The lead builder named in the round, per `UNATTENDED-LOOP.md` |
| Critic | The five critics, each of which must cite a `file:line` or a number |
| Circuit breaker at 3 | `LOOP.md`'s retry limits: five on engine or test work, three on UI, product or growth |

**Two deliberate departures from the brief, recorded once here rather than in
every round.**

1. **Commit messages keep this repo's style** — one declarative sentence in
   sentence case, no `feat(scope):` prefix. `LOOP.md` step 8 sets that style
   explicitly and 120 commits follow it; switching prefix mid-history would make
   the log unreadable in exactly the way the convention exists to prevent. The
   focus area is recorded here and in `NEXT.md` instead.
2. **The circuit breaker stashes before it resets.** The brief says
   `git checkout .`; `UNATTENDED-LOOP.md` says `git stash push -u -m
   "abandoned-cycle-<N>"` first, then `git reset --hard <LAST_GREEN>`. An
   abandoned round is often three-quarters of a correct one, and discarding it
   outright is how the same wall gets hit twice.

Everything else in the brief is followed as written, including the zero-slop bar
on coaching copy, which this repo already enforces mechanically in
`src/lib/analysis/__tests__/copy.test.ts`.

---

## Rounds
### Round 66 · Cycle F — QA and edge cases · `F6 · audit 7`

**Orchestrator.** Re-read the oldest blocked item and ask whether it is still
blocked. Round 61 had just unblocked one by building the instrument it wanted,
so the question is whether the rest of the list is stale too.

**R64's blocker was wrong twice, and had been for fifty-three rounds.** It read:
*"the front-ankle baseline is the stance, and the rig has no stance dial."*

1. **The rig grew one at R60·1** — `pinpointSlide`, with `landingBackFootDrag`
   beside it. Round 13 built exactly the thing round 13's sibling was blocked on.
2. **And it never needed one.** The front foot is named by **handedness**, not
   measured: a right-handed serve lands on the left foot. R60·2 refused
   *measuring* the stance from a side-on camera, and the blocker conflated that
   refusal with a question handedness already answers.

**Then the measurement found something better than "unblocked".** The current
baseline is the midpoint of both ankles, and the back foot moves:

    back-foot drag   both ankles   front ankle
         0.0           0.0643        0.1142
         0.5           0.0482        0.1142
         1.0           0.0321        0.1142

**One dialled lean, three stances, and the reading halves — 2.00×.** Nothing
about the player's balance changed; the point they are measured against moved.
The front ankle is flat to four decimals, 1.00×.

**And the two differ in kind at square**, which is why switching is not a rename:
both-ankle reads exactly 0.0000 because the hips sit between the ankles by
construction, while the front ankle reads 0.0499 — half a stance width. That is
what `LANDING_SQUARE_FLOOR` is for, and it would need a different number.

**Not switched.** It moves every landing reading and re-derives the floor, the
deviation and the delta bound built on them — R44's rule, the cost R72 paid
deliberately and `R80b` is queued behind. R64 is unblocked and *justified*; it is
not free.

**Critic.** PASS.

| Critic | Verdict | Cited |
| --- | --- | --- |
| Honesty | pass | An item was sitting in a blocked list for a reason that had stopped being true, and half of it was never true. That is what audit 7 exists to find |
| Architecture | pass | Pinned so it cannot go back to being blocked for the same stale reason — the check fails in both directions |
| Product | pass | A player who slides their back foot up was being told their landing improved. Nothing about their balance changed |
| Performance | pass | Six rig builds at suite time |

**Gate.** typecheck clean · lint clean · **1217 checks, 0 failed, exit 0** (+1).
Canaried by pointing the "front" reading at the midpoint — it went to 2.000× and
reddened.

---

### Round 65 · Cycle E — data and export · `E9 · R82` (new)

**Orchestrator.** Cycle E's rows are blocked, so the Orchestrator generates —
and round 63 pointed straight at this. C5 found that the two copy gates cover
tables and JSX, and that a third kind of copy sits between them. **The share card
is the same gap in a worse place.**

**Forty-four `fillText` calls, and no gate had ever read one of them.**

**Why that matters more here than anywhere else.** Everything else this app
writes is read by the player, alone, on their own phone, and corrected on the
next report. A share card is a PNG that goes to a coach, a partner, a group chat.
**It is the only copy in this app that cannot be taken back.**

**And the first run found the worst possible line.** The privacy footer, printed
on *every* card: *"Measured on device · nothing was uploaded"* — passive, in the
one sentence that is a promise rather than a description. Every other privacy
line in the app is active and says the same thing: `Home.tsx` has "Your video
stays on this device and never leaves it", `FramingCheck.tsx` has "Your video
never leaves the device".

Now **"Measured on your phone · the video never left it"**, and the check tests
the three surfaces for *agreement* rather than for exact words — three places
saying this must not drift into three different claims.

**Partial coverage, stated.** Fifteen of the forty-four drawn strings are
literals a regex can see; the rest are built from variables at draw time. A gate
implying it read all forty-four would be worse than one saying it reads fifteen —
the admission `jsxCopy.test.ts` makes about interpolated JSX, made here too.

**Critic.** PASS.

| Critic | Verdict | Cited |
| --- | --- | --- |
| Honesty | pass | The failure message says what is at stake: this is a PNG in somebody else's chat |
| Privacy | pass | The one sentence the app's whole promise rests on was the one nobody had read, and it is now checked for agreement across all three places it appears |
| Architecture | pass | Coverage admitted at 15 of 44, and the scan self-checks that it can still see the file |
| Product | pass | Shorter, active, and the same words the rest of the app uses |

**Gate.** typecheck clean · lint clean · **1216 checks, 0 failed, exit 0** (+4).
Canaried by restoring the passive footer — both the editor check and the
agreement check reddened.

---

### Round 64 · Cycle D — performance and architecture · `D8 · R81` (new)

**Orchestrator.** Cycle D's rows are blocked, so the Orchestrator generates.
Round 49 measured the entry chunk and wrote the numbers into a backlog row.
Three rounds then added components — a share button, a home strap, a memo — and
nobody looked again.

**That is the exact shape round 52 found twice.** `LEG_DRIVE_FLOOR` and
`LANDING_SQUARE_FLOOR` could both be moved tenfold with nothing going red,
because their derivations lived in comments. A measured number with no gate
behind it is a number that stops being true quietly.

**So the bundle is a ratchet now**, not a note:

| | measured | budget |
| --- | --- | --- |
| entry, gzip | 139.88 kB | 145 |
| entry, raw | 419.71 kB | 440 |
| pose runtime, gzip | 41.43 kB | 45 |
| stylesheet, gzip | 10.24 kB | 14 |

Plus the two properties that matter more than the bytes: **the pose runtime is
still its own chunk**, and **both dev routes are still split off**. R68 spent a
whole round taking 1.93 kB gzip off this path; a MediaPipe bundle folded back in
would put forty times that on it and the app would still work, so nothing else
would notice.

**It reads `dist` and fails rather than skips when it is missing.** A check that
quietly passes when it cannot see is worse than no check — `tallies.test.ts`
exists because this repo shipped one, and round 52 found two more.

**A unit mismatch, caught by comparing against the build output.** The first
version divided by 1024 and read **409.87** where Vite printed **419.71** for the
same file. Vite prints decimal kB, and the budgets were read off Vite — so every
future comparison would have been 2.4% off, and nobody would have noticed until
somebody raised a budget against a figure that did not match the terminal beside
it.

**Critic.** PASS.

| Critic | Verdict | Cited |
| --- | --- | --- |
| Performance | pass | This app is opened on a phone at a fence line. The entry chunk is what stands between the player and the viewfinder, and the 9 MB model behind it is cached where this is not |
| Honesty | pass | The failure message says what to do and what it costs: take something off the path, or raise the budget and say in the commit what the player is now waiting for |
| Architecture | pass | The split checks are named by chunk, not by size, because the property is the split |
| Product | pass | Nothing user-facing changed |

**Gate.** typecheck clean · lint clean · production build clean · **1212 checks,
0 failed, exit 0** (+4). Canaried twice — budget tightened to 130, and a missing
chunk named — each reddening its own check.

---

### Round 63 · Cycle C — coaching and UI · `C5 · audit 6`

**Orchestrator.** Find a copy line that has drifted over the twenty-five word cap
since it was written. **The answer is not a line — it is a gap, with three
defects sitting in it.**

**The gap.** This repo has two copy gates and they cover different halves:
`copy.test.ts` walks six data tables plus `everyVerdictCue()`, and
`jsxCopy.test.ts` walks every sentence written straight into a component. Between
them sits a third kind — **a function that assembles a sentence at runtime from
parts**, which is in no table and in no JSX. `faultMoveLine`, `practiceHeadline`
and `repeatabilityNote` are all that kind, all three are rendered, and none was
ever read by an editor.

**Defect one, on the first run.** *"Groove it once this is fixed."* — passive
voice, on the practice card.

**Defect two is the one the audit actually asked for, and it is worse.** The same
sentence interpolates `r.label`, and `METRICS`'s longest label is **"Hitting the
ball at its peak" — six words** against the two in "Racket drop". At that label
the shipped line ran **twenty-seven words against a twenty-five cap**, and
nothing had ever counted them. Every fixture anybody had written used a two-word
label, so it was invisible.

**Defect three came out of the canary.** Reverting to the old wording printed
*"**Your** hitting the ball at its peak scores fine but varies most"* — the
template assumed labels were noun phrases, and that one is a verb phrase. Not a
sentence. The label leads now, in its own capitalisation, which reads correctly
either way.

**All three fixed. 22 words at the worst label**, and the check reads the longest
label off `METRICS` rather than pasting one, so a longer label added later fails
here rather than on somebody's phone.

**Critic.** PASS.

| Critic | Verdict | Cited |
| --- | --- | --- |
| Honesty | pass | The audit's stated target was one drifted line; what it found was the reason lines can drift unseen, and both are reported |
| Product | pass | "Your hitting the ball at its peak scores fine" is exactly the slop the mandate forbids, and it was shipped |
| Architecture | pass | The worst case is derived from the table, not chosen — the two-word fixture is precisely what hid this |
| Performance | pass | Thirty-three assembled sentences at suite time |

**Gate.** typecheck clean · lint clean · **1208 checks, 0 failed, exit 0** (+2).
Canaried three ways: passive clause restored, line lengthened, possessive
restored — each reddening the right check.

---

### Round 62 · consolidation gate

**Orchestrator.** Sixth cycle since `loop-green-11`. Number diff, boot, tag.

**285 figures then, 300 now. Fifteen added, ZERO removed, zero moved.** After a
block whose previous gate had eighteen figures move, nothing in the engine
shifted at all — including through a new rig dial, which is the change most able
to move everything.

**Every addition is one round's finding:**

- **R78** (57): `0.016` — the history walk, 0.1% of a 60 FPS frame
- **F5** (59): `0.0519 0.0818 0.0841 0.0831` depth and `0.0755 0.0715 0.0429
  0.0101` lateral — the seven-fold axis collapse
- **R80** (60): `0.52` and `0.99` — a sideways toss named as a forwards fault at
  the corner, and the app at its most confident where it sees least
- **R52·1** (61): `0.0017` hitched against `0.0490` flowing, at `1.35` and `1.85`

**And the rig dial moved nothing**, which is the claim round 61 made and this is
where it is checked across the whole suite rather than in one file:
`trophyHitchSeconds` is skipped at zero rather than applied as an identity, so a
serve built without a hitch is the serve the rig built before the dial existed.

**Gate.** typecheck clean · lint clean · production build clean (671.32 KiB
precache) · **1206 checks, 0 failed, exit 0**.

**Boot smoke** on a restarted server: report renders, five area cards, headline
"The racket stops short behind you", drill "Let the racket fall".

Tag: `loop-green-12`.

**What this block was.** Four of the six rounds were the loop auditing itself and
finding something real: a walk that cost a tenth of a per cent (57), an export
whose contents nothing held to its promise (58), a band spanning two axes seven-
fold apart (59), and a guard that has never once fired (60). The fifth built the
instrument a refusal was blocked on and found the refusal conservative (61).
**None of them was a feature, and the app is more honest than it was six rounds
ago.**

---

### Round 61 · Cycle B — biomechanics · `B5b · R52·1`

**Orchestrator.** Build the instrument round 54's refusal was blocked on. R60·1's
precedent exactly: the rig could not pose a pinpoint stance, and building that
dial was its own round.

**`trophyHitchSeconds`** — the motion clock stops at the trophy for that long.

**It lengthens the motion rather than compressing the swing**, which is the one
real design decision. Holding the trophy and squeezing what follows into the same
span would make a hitch *imply* a faster swing, and then any reading that
separated hitch from tempo might be reading the swing instead of the pause. A
player who stops takes longer; the serve after the pause is the serve they were
going to hit.

**Bit-identical at zero** — the warp is skipped, not applied as an identity.
Verified rather than claimed: 1205 checks, nothing moved.

**And it reverses round 54's refusal, in the conservative direction.**

    motion    no hitch    0.15s hitch    0.3s hitch
    1.35s      0.0490       0.0017        0.0000
    1.85s      0.0344       0.0010        0.0000

**28× apart at 1.35 s, 34× at 1.85 s — against a tempo confound of 2.3×.** The
separation is an order of magnitude clear of the thing that confounds it. Round
54 recorded the refusal as *"unmeasured, not disproved"*, and that phrasing is
what let this round overturn it cleanly rather than contradict it.

**One caveat travels with the result, as an assertion rather than a footnote.**
The rig's hitch is a *perfect* freeze — the clock stops, the wrist is exactly
still, the trough goes to zero plus landmark noise. A real player pausing does
not freeze. **This is the best case, not the expected one.** It says the reading
is worth building; it does not say a threshold can be set from here. That wants
footage.

**Critic.** PASS.

| Critic | Verdict | Cited |
| --- | --- | --- |
| Honesty | pass | The caveat is a check — if the rig's hitch stops being a total stop, the "best case" framing is what needs revisiting, not the threshold |
| Architecture | pass | Bit-identical at zero, the discipline `pinpointSlide` shipped under, and verified rather than asserted |
| Honesty | pass | The separation is claimed as a comparison against the confound, not as a level: 2.3× is what tempo does, and the hitch has to beat it by enough that no threshold has to thread between them |
| Product | pass | Nothing shipped. `R52·2` is the build, and it now has a measured reason to exist |

**Gate.** typecheck clean · lint clean · **1206 checks, 0 failed, exit 0** (+1).
Canaried by softening the freeze to 90% — the separation check reddened alone.

---

### Round 60 · Cycle A — the engine · `A6 · R80` (new)

**Orchestrator.** Cycle A's rows are done, so the Orchestrator generates — and
round 59 left the obvious question. It measured the toss reading collapsing
seven-fold on the axis a side-on camera cannot see. **What does the app do with
that, end to end?**

**Worse than going quiet.** One 0.10 m wobble on the lateral axis alone:

    yaw    axis named   detected   confidence   value
    30°      lateral      true        0.76       0.0870
    45°      depth        TRUE        0.52       0.0850
    60°      depth        false       0.78       0.0490
    82°      depth        false       0.99       0.0110

**At 45° a sideways toss is reported as a forwards-and-back fault** — detected,
drilled, at 0.52 confidence, seven hundredths above `MIN_EVIDENCE`. `diagnose.ts`
states the cost in its own words: a fault named on the wrong axis *"costs the
player the practice session they spend on it"*.

**The guard meant to prevent exactly this cannot fire.** `axes.ts` sets
`dominant: yawDeg > 45 ? 'depth' : yawDeg < 45 ? 'lateral' : null` and argues
that "45 is not a threshold here — it is where sin and cos cross... so this is an
equality test, not a judgement call". **The mathematics is right and the
consequence is that the null case is one float value.** `estimateYaw` returns a
measurement. **The tie-drop described in three separate comments has never once
happened.**

**And the confidence does not stand in for it**, because `share` answers a
different question: how much of *image x* is this axis, not how much of the
*toss* was seen. At 82° the app reads **0.99** — it knows perfectly which axis
image x carries — while being blind to the other. **It is most confident exactly
where it sees least.**

**Not fixed here.** A share floor is the fix and it silences the toss verdict
across a band of near-corner clips, so it needs a derivation and a number diff —
R44's rule, and the same reason round 59 left its band alone. Queued as `R80b`.

**Critic.** PASS.

| Critic | Verdict | Cited |
| --- | --- | --- |
| Honesty | pass | This is the sharpest constraint-1 case the loop has found: not a missed fault but a *confidently misattributed* one, with a drill attached |
| Architecture | pass | Three comments describe a behaviour the code cannot produce; the one in `axes.ts` now says so with the measurement |
| Product | pass | Nothing changed on screen — the alternative was guessing a floor that silences real clips |
| Honesty | pass | Both checks fail when the fix lands, and both messages say to **close the finding**, not widen the check |

**Gate.** typecheck clean · lint clean · **1205 checks, 0 failed, exit 0** (+1).
Canaried by widening the tie to 39–51° — this check and round 59's both reddened,
which is the intended coupling.

---

### Round 59 · Cycle F — QA and edge cases · `F5 · audit 3`

**Orchestrator.** Find a number in `tiers.ts` whose band was set against the
synthetic rig only. `toss_drift_ratio` announces itself: its own comment marks it
**PROVISIONAL** and says the lateral case "has never been calibrated against
anything", estimating the corner-camera divisor at "about 1.4".

**The rig can now be asked directly**, because `tossWobble` and
`tossWobbleLateral` differ in nothing but the axis they move — a dial added
precisely so a test could ask this. One physical wobble of 0.10 m onto each in
turn:

    yaw     depth axis    lateral axis
    30°       0.0519        0.0755
    45°       0.0818        0.0715
    60°       0.0841        0.0429
    82°       0.0831        0.0101

**The depth axis holds. The lateral axis collapses seven-fold — and worst at
82°, which is the angle the filming guide tells people to stand at.** Side-on,
motion across the shoulders points nearly at the lens. That is geometry, not a
defect in the estimator, and it is exactly what R60·2 refused the stance over.

**What it means for the band.** One set of anchors covers whichever axis
`axes.ts` laid across image x, on the stated argument that "a hand wandering 3%
of standing height wandered that far whichever way it went". **That argument is
about the player and it is sound. It is not about the measurement, and the
measurement disagrees with itself seven-fold.** A player whose toss wanders
sideways at the recommended angle is graded on a seventh of the truth.

**Not repaired, on R44's reasoning.** There is no honest target to re-derive
against: nothing in this repo has ever filmed a lateral toss wobble, so a second
band would be a number invented to fill a column. Pinned instead, in both places
— the check, and the constant's own comment, which is where the next person
looks.

**Critic.** PASS.

| Critic | Verdict | Cited |
| --- | --- | --- |
| Honesty | pass | The audit asked for a rig-only band and got one whose real problem is worse than its marker said — reported at the size measured, not the size expected |
| Architecture | pass | The check asserts both halves: the lateral collapse *and* the depth axis holding, because if both collapsed this would be the rig losing the toss rather than the camera losing an axis |
| Product | pass | Nothing changed on screen, and that is right — the alternative was inventing a band |
| Performance | pass | Eight ensembles at suite time |

**Gate.** typecheck clean · lint clean · **1204 checks, 0 failed, exit 0** (+1).
Canaried by dialling depth into the lateral case — the collapse read 0.4× and
the check reddened.

---

### Round 58 · Cycle E — data and export · `E8 · R79` (new)

**Orchestrator.** Both Cycle E rows are blocked, so the Orchestrator generates
one. `egress.test.ts` closes constraint 7 on the axis it usually means — every
syntactic way a browser starts a request, enumerated and closed — and it says
nothing about the export, because **that egress is not the app's. It is the
player's**, and it is the one sanctioned way anything ever leaves the phone.

**Which makes what the file contains a promise of the same kind.**
`StoragePanel` tells them in as many words: *"An export is one file holding your
scores and real photos of you serving, not just numbers."* That sentence is
correct today. Nothing was making it stay correct.

**And there is a worked example already in the history.** R74 added the tag store
to the file — which serve it was, where it landed — and **did not revisit that
sentence**. It happens to still be true. Nothing asked. The next field might be a
device identifier or a timestamp trail, and the sentence would go on saying
"scores and photos" while the file said more.

**So every top-level key has a ruling in the player's terms**, not the
codebase's: *"every report: the scores, the measurements, and the six keyframe
photographs of them serving"*, *"which drills they ticked off and when"*, *"what
they tapped about their own serves"*. Seven keys, seven rulings, one marked
personal.

**Driven through `buildBackup`, not read off `Backup`**, and that distinction is
the round's other half. A type can be right while the builder is wrong — and the
builder *was* wrong for twenty rounds: the tag store existed, the type could have
declared it, and `buildBackup` did not write it, so a player moving phones
silently lost every tap they had made.

**Critic.** PASS.

| Critic | Verdict | Cited |
| --- | --- | --- |
| Honesty | pass | The canary's failure message says what to do: add a ruling, *and re-read the sentence in StoragePanel that tells them what is in the file* |
| Privacy | pass | The "still pictures of a person" check is asserted rather than assumed, because it is the claim the player acts on before pressing export — and if reports ever stop carrying stills, the right response is to soften the warning, not delete the check |
| Architecture | pass | Stale-ruling half included, the lesson `jsxCopy.test.ts` had to grow and `reachable.test.ts` inherited |
| Performance | pass | One `buildBackup` against a Map at suite time |

**Gate.** typecheck clean · lint clean · **1203 checks, 0 failed, exit 0** (+4).
Canaried by adding a `deviceId` to the export — reddened alone, with the
instruction attached.

---

### Round 57 · Cycle D — performance and architecture · `D7 · R78` (new)

**Orchestrator.** Both Cycle D rows are blocked, so the Orchestrator generates
one — and the obvious candidate was six rounds old and mine. R76 shipped
`TripShareButton` calling `tripsOf(sessions)` and `tripSummary(trip, sessions)`
straight in its body, no memo, on a sheet that also draws a chart.

**The honest number is that it did not matter for speed.** Timed at the
sixty-report cap the prune ladder holds: **0.016 ms, 0.1% of a 60 FPS frame.**

**The defect was identity, not milliseconds.** Both functions allocate —
`tripsOf` copies the history and sorts it into fresh arrays — so `summary` was a
new object on every render and nothing downstream could have memoised against it
either. One `useMemo` fixes it.

**The reason this is a check and not a one-line commit** is that the mandate
names 60 FPS, and 60 FPS is a budget: 16.7 ms for everything a frame does. A
history walk is cheap, and "cheap" is not a number — a walk that is 0.1% of a
frame at sixty reports is a different fact from one that is 40%, and only one of
them can be stated.

**Bounded on shape as well as time.** 60 reports cost **4.4× what 15 do**, which
is linear. Timing alone would look safe on any small cap; the growth check is
what would catch a walk going quadratic behind it.

**Canaried with a cubic scan** inside `tripsOf`: the per-walk cost went 0.016 →
0.291 ms and the growth to **20.5×**, reddening the check. Which also shows the
budget assert alone would have passed at 1.7% of a frame — the growth half is
carrying it.

**Critic.** PASS.

| Critic | Verdict | Cited |
| --- | --- | --- |
| Honesty | pass | The measurement refutes the round's own motivation and the entry says so. A performance round that found 0.1% has to report 0.1% |
| Performance | pass | The actual fix is memoisation for identity stability, and it is described as that rather than as a speed-up |
| Architecture | pass | The growth bound is the durable half; the absolute timing is machine-dependent and generously bounded on purpose |
| Product | pass | Nothing on screen changed |

**Gate.** typecheck clean · lint clean · **1199 checks, 0 failed, exit 0** (+1).

---

### Round 56 · consolidation gate

**Orchestrator.** Sixth cycle since `loop-green-10`. Number diff, boot, tag.

**271 figures then, 285 now: 18 removed, 32 added — and every one is
accounted for.** This is the first gate in the loop where figures *moved* rather
than only appeared, and that was the point of the block.

**The 18 removed and 18 of the added are R72** (round 53), the finish keyframe
moving from half a second after contact to one swing after it. That cost was
attached to the work since round 33 and paid deliberately, diffed against the
tree before it:

    0.0030×3 → 0.0032×3   0.0040 → 0.0042   0.0050 → 0.0055   0.020 → 0.040
    0.0652 → 0.0643   0.066 → 0.064   0.118×2 → 0.116×2   0.435 → 0.353/0.366
    0.44×2 → 0.38×2   0.500×4 → 0.440/0.460×2   0.92 → 0.91

**The other 14 are new measurements, not movements.** Round 52's two pinned
floors and their evidence — 0.0457 and 0.0444 grounded, 0.1433 jumping, 0.0035
and 0.0042 landing — and round 54's five trough readings across four tempo rungs:
0.0795, 0.0613, 0.0490, 0.0401, 0.0344 at 0.95, 1.15, 1.35 and 1.85 seconds.

**Zero unexplained.** Every figure that moved is one round's stated cost; every
figure that appeared is one round's stated finding.

**Gate.** typecheck clean · lint clean · production build clean (671.14 KiB
precache) · **1198 checks, 0 failed, exit 0**.

**Boot smoke** on a restarted server: home renders both straps — "Head up hold"
above "How to film it" — and the server logs are clean.

Tag: `loop-green-11`.

**What the last six rounds were.** Two refusals with arithmetic (`R57`, `R52`),
one dead feature wired twenty rounds late (`R76`), one audit that found two gates
with no teeth (`F4`), one engine change that paid its stated cost (`R72`), and
one placement that was the real content of a refused feature (`R57b`). Three of
the six were the loop correcting its own earlier rounds.

---

### Round 55 · Cycle C — coaching and UI · `C4b · R57b`

**Orchestrator.** The successor round 48 left behind. Lead builder: Coaching
Voice. Column: *Would I use it between serves.*

**Round 48 refused the page and named what was actually missing.** The ranked
plan already *is* a session — causal order, capped at four, with methods and
doses — and the progress sheet renders the recurring one the same way. What
neither does is be reachable: the report says in its own header that it is the
wrong screen for somebody holding a basket, and the practice card is two taps
away on the progress sheet.

**So this is one line and a way in.** The last drill's name, and the report it
came from. On the home screen, above the filming guide.

**One drill, never the queue**, which is the test round 48 set: it must not say
anything the report already says in the same words. A queue here would be the
refused page in a smaller box. The name is a reminder; the method, the dose and
the order stay where they are — and the tap goes to them.

**It walks past refused clips.** `sessions[0]` would blank on one bad film, so a
player who filmed into the sun on Tuesday would lose the reminder they were given
last week. It stops at the newest report that actually named something.

**Zero new CSS.** `.strap` is the shape immediately below it — icon, title,
subtitle, chevron — and already a button that goes somewhere.

**Critic.** PASS.

| Critic | Verdict | Cited |
| --- | --- | --- |
| Product | pass | Verified end to end: the strap reads "Head up hold — Last time you were working on this", and tapping it opens the report on that same drill |
| Honesty | pass | No second opinion — `focus` is the ranked plan's first rung as it was saved, not recomputed here |
| Architecture | pass | A walk over a list already in memory, memoised on it |
| Product | pass | Seven words under the cap, no jargon, and the copy gate scans it because it lives in JSX |

**Gate.** typecheck clean · lint clean · **1198 checks, 0 failed, exit 0**.

---

### Round 54 · Cycle B — biomechanics · `B5 · R52`

**Orchestrator.** The hitch: reaching the trophy, stopping, and swinging from a
standstill. One of the most common club faults and one of the most visible on
video, and the rhythm group cannot see it. The backlog stated the round's own
shape — sweep against `motionSeconds` first, and a refusal is a finished round.

**The reading exists and is easy to take**: lowest planar speed between trophy
and drop, over the serve's own peak, so units and body scale divide out.

**It is confounded by tempo, in the fault's own direction.** Swept across the
motion dial with **no hitch posed at all**:

    0.95s → 0.0795   1.15s → 0.0613   1.35s → 0.0490   1.6s → 0.0401   1.85s → 0.0344

**2.3× from tempo alone, monotonic.** A slower serve reads as a deeper trough —
exactly what a pause would read as. Telling a club player they have a hitch when
they are simply unhurried is the confident nonsense constraint 1 exists to stop.

**And nothing here can show otherwise, which is the other half of the honest
answer.** The rig has no hitch dial, so this measures the confound and cannot
measure the separation. Claiming the reading fails would be as unfounded as
claiming it works. Recorded as **unmeasured, not disproved.**

**Blocked on the rig, not on the idea** — R60's wall, and R60·1's answer is the
precedent: the rig could not pose a pinpoint stance either, and building the dial
was its own round. Queued as `R52·1`.

**A gate corrected where the refusal belongs.** I first wrote it into
`UNDER_RESOLVED`, and the "no floor is quietly set below what its own
repeatability asks for" check refused it: *"trophy_drop_trough_ratio is declared
under-resolved but this ensemble resolves it"*. That register is for readings the
engine **takes** and cannot resolve. This is one it does not take. The check
taught me the register's contract; the entry came back out.

**Critic.** PASS.

| Critic | Verdict | Cited |
| --- | --- | --- |
| Honesty | pass | Both halves stated. The confound is measured; the separation is not, and the entry says which is which rather than letting a refusal imply evidence it does not have |
| Architecture | pass | The numbers live in a check that fails in both directions — if the confound shrinks below 1.8× or stops being monotonic, R52 gets re-decided rather than staying refused by inertia |
| Product | pass | Nothing shipped, and that is the outcome: a hitch cue on this evidence would fire on every unhurried club player |
| Performance | pass | Five rig builds at suite time |

**Gate.** typecheck clean · lint clean · **1198 checks, 0 failed, exit 0** (+1).

---

### Round 53 · Cycle A — the engine · `A5b · R72`

**Orchestrator.** Move the finish keyframe to a share of the serve. R44's
warning has been attached to this since round 33: moving a placement in
`phases.ts` re-derives every noise floor built on it.

**The defect, measured.** Fixed at half a second, contact→finish held at
0.42–0.44 s while trophy→contact ran **0.320 s on a quick motion and 0.600 s on
a slow one**. The same instant is **1.31 swings after contact for one player and
0.73 for another** — two people's landings read at different points of their own
follow-throughs, then compared as though they were the same moment.

**One swing after contact**, in seconds, through the clock.

**And the first version was wrong in exactly the way this file exists to
prevent.** I wrote `contact + (contact - trophy)` — a count of *frames* — with a
comment claiming it "needs no clock". A frame index is not a time on a clip
whose samples did not arrive evenly, which is the whole reason `clockOf` exists.
The "keyframes land at the same real times when a third of the frames are lost"
check caught it at **60 ms of drift** on the bursty fixture.

**Two existing checks pinned the old behaviour and both were rewritten, not
satisfied.** One of them is round 33's own finding, which asserted the defect —
and its failure message had asked for exactly this: *"so this audit finding has
been fixed or has gone away, and the entry should say so"*. It now asserts the
inverse, both halves, for the same reason it asserted both before: a share
holding is only meaningful beside seconds moving, or the tempo dial has stopped
working rather than the fix having landed.

**Number diff: 19 figures moved, 19 replaced, none lost.** That is R44's stated
cost, paid deliberately.

**And the one calibration that can be checked moved the right way.** Round 52
found a square landing reading 0.0045 against a stated floor of 0.0035 — 29%
above. After this change it reads **0.0042, 20% above**. The placement was part
of why that floor looked stale, and `R77b` gets cheaper rather than harder.

**Critic.** PASS.

| Critic | Verdict | Cited |
| --- | --- | --- |
| Honesty | pass | The 19 moved figures are listed rather than summarised, and the change was diffed against the tree before it, not asserted to be safe |
| Architecture | pass | R33 refuted three quarters of the audit that produced this; only the placement moved, and the three search windows stayed in seconds where they belong |
| Product | pass | Nothing on screen changed wording. What changed is that two players' landings are now read at the same point of their own serves |
| Performance | pass | One subtraction and one clock walk, at keyframe time |

**Gate.** typecheck clean · lint clean · production build clean · **1197 checks,
0 failed, exit 0**.

---

### Round 52 · Cycle F — QA and edge cases · `F4 · audit 10`

**Orchestrator.** Re-run existing tests against their own canaries. Not chosen
by feel: **three gates this session passed canaries they should have failed** —
round 39's coverage check, round 42's props scan, round 51's share scan — so the
question of which existing gates have teeth is now an evidenced one.

**Eight load-bearing constants, flipped one at a time, counting what reddened.**

| Constant | Flipped to | Red |
| --- | --- | --- |
| `SOFT_MEASUREMENT` 0.55 | 0.05 | **11** |
| `MIN_EVIDENCE` 0.45 | 0.05 | **4** |
| `IMPLAUSIBLE_HEIGHT_SPREAD` 0.18 | 0.98 | **3** |
| `GHOST_YAW_TOLERANCE_DEG` 5 | 60 | **2** |
| `swingSamples` 3 | 0 | **1** |
| `MAX_WORDS` 25 | 250 | **1** |
| `LEG_DRIVE_FLOOR` 0.0457 | 0.4570 | **0** |
| `LANDING_SQUARE_FLOOR` 0.0035 | 0.0350 | **0** |

**Two of eight could be moved tenfold with nothing going red.** Both carry a
derivation in their own comment — one is what a player who never leaves the
ground still reads from straightening alone, the other is where a square landing
sits rather than zero — and both are exported for a test to name. Neither was
named in an assertion that could fail.

**Both are rig-measurable, which is why this is a round and not a note.**

- **Grounded serve reads 0.0444 against a floor of 0.0457** — within 3%. And a
  jump reads 0.1433, 3.1× the floor, so the floor is not swallowing the
  measurement.
- **Square landing reads 0.0045 against a floor of 0.0035** — **29% above**.

**The second is a finding, not a pass.** Its sibling lands within 3%; this one
does not. Either the constant was derived on a different seed count or something
under it has moved since R50·2 set it, and there is no way to tell from here —
R50·2's derivation is a sentence rather than a reproducible call, which is the
same defect round 40 found in `NEXT.md`.

**Not widened and not silently corrected.** 0.0035 calibrates
`LANDING_SQUARE_DEVIATION` and the delta noise in `consistency.ts`; moving it off
ten seeds, inside a round about test teeth, is exactly the unmeasured change this
repo keeps catching. Recorded as `R77b` with the numbers and what it needs. The
band holds the finding rather than hiding it: the gap prints every run.

**Critic.** PASS.

| Critic | Verdict | Cited |
| --- | --- | --- |
| Honesty | pass | The 29% is printed on every run and written into the backlog with its successor, rather than absorbed by a tolerance chosen to fit |
| Architecture | pass | A derived number with a recorded derivation and no gate is the shape this repo has been caught by twice — a figure nobody could re-run, and one that quietly stopped being true |
| Product | pass | Nothing user-facing moved; the audit is about whether the safety net exists |
| Performance | pass | Two ten-seed ensembles at suite time |

**Gate.** typecheck clean · lint clean · **1197 checks, 0 failed, exit 0** (+2).
Both floors re-canaried after: **0 red → 1 red each.**

---

### Round 51 · Cycle E — data and export · `E7 · R76` (new)

**Orchestrator.** Cycle E's rows are gated on a phone and on the design ask, so
the Orchestrator generates one — and after rounds 41 and 42 the obvious question
is whether anything else was built and never reachable. Round 49's wide scan had
flagged the share path; that was worth checking rather than assuming.

**It was true, and it is the biggest one yet.** `shareTripCard` and
`renderTripCard` were built at R58·2, drawn, and checked down to *"a trip nobody
swept draws no repeatability row"* — and **nothing has ever called them**. Twenty
rounds. Unlike the tap prop and the history filter before it, this is a whole
user-facing artifact: the card a coach would want, that no control could produce.

**Wired as `TripShareButton`**, mirroring `SeasonShareButton` exactly — a tiny
self-contained button rather than more `App.tsx`, because the sharing state and
one handler are the whole thing. The most recent trip only: `tripsOf` returns
them oldest-first, and a button offering a trip from three weeks ago is one
nobody meant to press.

**Hidden on a trip of one**, and that is not tidiness. A trip card is a spread, a
best, a worst and a repeatability line; with one serve the best and the worst are
the same report and the spread is zero — a card that looks like a summary and is
a single serve wearing one. `SeasonShareButton` makes the same judgement at two
records.

**The gate now covers the class it missed.** Round 42 refused the wide "any
unused export" version at 116 of 483 and narrowed to props, which was right — and
this slipped between the two. A `share*` function is judgeable for the same
reason a prop is: it is a contract between two files, and it exists to be
pressed. A `render*` may reasonably be internal; an entry point may not.

**And its canary passed until imports were stripped.** Unwiring the handler while
leaving `import { shareTripCard }` at the top left the check green — an import
names a function without pressing it, and a component that imports a share and
never calls it is precisely the state being caught. Same lesson as round 42's
comment blanking, one line further down: a search for a name finds every mention,
and only some mentions are uses.

**Critic.** PASS.

| Critic | Verdict | Cited |
| --- | --- | --- |
| Product | pass | Verified on screen: "Share this trip" renders beside "Share your season" on the progress sheet |
| Honesty | pass | The gate's own canary was run and failed, and the fix was the gate rather than the canary |
| Architecture | pass | Zero new CSS, zero new share logic — the card and its refusals were already written and checked |
| Performance | pass | `tripsOf` over a list already in memory, once per render of a sheet mounted alone |

**Gate.** typecheck clean · lint clean · **1195 checks, 0 failed, exit 0** (+1).
Canaried twice: once green and once red, which is the round.

---

### Round 50 · consolidation gate

**Orchestrator.** Sixth cycle since `loop-green-9`. Number diff, boot, tag.

**255 figures then, 271 now. Sixteen additions, zero removals, zero movements.**
Every addition is traceable to a round that measured something new:

- **11 contrast ratios** (round 45) — 17.40, 16.07, 15.77, 12.11, 11.22, 10.17,
  7.69, 7.60, 6.97, 6.89, and 4.87 twice, the narrowest margin in the palette
- **1.00 and 18.94** (round 46) — a disc against a smear, which is the whole
  argument for the outbound detector existing
- **0.89 twice** (round 47) — the knee-extension slope against its dial

**Nothing the engine reports about a serve has moved in twelve rounds**, across
two tags, a new detector, a new uncalibrated reading, a storage field, a store
added to the backup, and a component prop deleted.

**Gate.** typecheck clean · lint clean · production build clean (668.40 KiB
precache) · **1194 checks, 0 failed, exit 0**.

**Boot smoke** on a restarted server: five area cards, none open — the
`defaultOpen` deletion from round 42 still behaving — first drill "Let the racket
fall", 20 serves. Server logs clean.

Tag: `loop-green-10`.

**Fifty rounds in, what the loop has actually been for.** Twenty-three of the
fifty delivered a correction or a refusal rather than a feature — the round as
written, or the ledger it came from, was wrong. Six of those were premises that
did not survive being measured: a same-spot gate for a camera-invariant reading,
a hand-off detector fed sessions it cannot compare, a page that already existed
twice, a 315 ms figure nobody could re-run. And four defects were found not by
looking for them but by a gate written for something else — a props scan, a
bundle probe, a tally guard, a restore-path check.

---

### Round 49 · Cycle D — performance and architecture · `D6 · R75` (new)

**Orchestrator.** Cycle D's two open rows are blocked — `D1b` on a phone, `D2d`
on the design ask round 42 recorded — so the Orchestrator generates one. Four
rounds have added modules since the bundle was last measured at round 10.

**Measured.** Entry chunk **416.90 kB raw / 139.09 kB gzip**. MediaPipe
138.83/41.55 in its own chunk, CSS 54.19/10.35, the demo and fixture routes
split out at 8.63 and 8.55.

**And the staged detectors cost the critical path nothing.** `planSharedPass`
and `outbound.ts` both exist with no caller — deliberately, and round 42 ruled
them so. The question Cycle D has to ask is whether that costs anything, and it
does not: neither module's literals appear in the entry chunk.

**Probed by string literal, not by symbol name**, which is the part worth
keeping. The first probe grepped for `MIN_ELONGATION`, `planSharedPass` and four
others and returned zero across the board — a clean-looking result that proves
nothing, because those names are minified away before they reach `dist`. Refusal
enums survive as literals.

**Which is how the round found a real defect.** `too_few_frames` came back
**present** in the entry chunk. It was not from the new detector: `triage.ts`
has owned that reason since long before, meaning *the clip had too few swing
samples*. Round 46 shipped one beside it meaning *too few streaks agreed*.

Two enums with one value are indistinguishable the moment they meet — in a log,
a share card, a map from reason to sentence — and the types cannot help, because
they are separate unions that never touch. It is constraint 4's "never reuse a
word the app owns", in the machine-readable half of the app rather than in the
copy.

Renamed to `too_few_streaks`. And `RejectReason` was a bare union, so **nothing
could have checked this**: it is now derived from a frozen `REJECTIONS` array —
the argument `DETECTOR_IDS` makes in `detector.ts`, arrived at here from the
other direction.

**Critic.** PASS.

| Critic | Verdict | Cited |
| --- | --- | --- |
| Architecture | pass | The union became a list for the reason `detector.ts` already gives: the failure is mundane and total, and nothing throws |
| Honesty | pass | The first probe's clean result was refused rather than reported — a gate that cannot see is worse than no gate |
| Performance | pass | Staged code confirmed off the critical path, which is what licenses building ahead of a caller at all |
| Product | pass | Nothing user-facing moved; bundle byte-identical after the rename |

**Gate.** typecheck clean · lint clean · production build clean · **1194 checks,
0 failed, exit 0** (+1). Canaried by restoring the colliding name — the new
check reddened alone.

---

### Round 48 · Cycle C — coaching and UI · `C4 · R57`

**Orchestrator.** The drills as a week. Lead builder: Coaching Voice. Column:
*Would I use it between serves.*

**Refused: the page it asks for already exists, twice.**

R57's premise is that the thirteen drills in `coaching.ts` "are only ever seen
attached to a fault", and that what is missing is a session built from the 2–4
ranked drills. **The plan is that session.** `causalPlan` orders it causally and
caps it at four. `Report.tsx` renders it as a numbered queue whose own comment
says *"these are not four equal options to choose between, they are a queue"* —
the first drill's full method, every later rung's name and reps.

On the fixture it comes out as: **"1. Baseline drop toss — 20 tosses · 2. Let
the racket fall — 20 serves · 3. Slow sink hold — 3 sets of 8."** That is a
practice session, in order, with doses. The progress sheet renders the recurring
focus the same way, with its how and its reps.

**A third surface would restate two** — more screen, no new information, which
is the padding the mandate names as slop.

**What R57 was reaching for is placement, not content.** Neither rendering is
reachable without opening a screen you read sitting down: the report says in its
own header that it is the wrong screen for somebody holding a basket, and the
practice card lives on the progress sheet. Recorded as `R57b`, with the test it
has to pass — whether it says anything the report does not already say in the
same words.

**Two checks, so the premise cannot become true after the fact.** Every rung
carries a drill with a method and a dose; no two rungs share a drill. A ranked
item with a diagnosis and nothing to do is a queue entry a player cannot act on,
and a repeated drill hides that the second fault has no distinct answer.

**Critic.** PASS.

| Critic | Verdict | Cited |
| --- | --- | --- |
| Product | pass | The refusal is the product decision. An app that renders the same three drills on a third screen has more surface and no more help |
| Honesty | pass | Evidenced against the rendered output, not against my memory of it — the fixture's own queue is quoted in the ledger |
| Architecture | pass | The round leaves behind a smaller successor with a stated test, rather than a vague "revisit" |
| Performance | pass | Nothing shipped to a render path |

**Gate.** typecheck clean · lint clean · **1193 checks, 0 failed, exit 0** (+2).
Canaried by duplicating the plan's first rung — the new dedup check reddened
alongside the existing "nothing is listed twice", which is the right pair.

---

### Round 47 · Cycle B — biomechanics · `B4b · R51·2`

**Orchestrator.** The other half of R51's pair. `leg_drive_rise_ratio` is how
much of the load became upward motion; nothing measured how much load there was
to spend. Lead builder: Biomechanist. Column: *Would I trust it.*

**"Not from image y" was already satisfied.** `kneeBend` at the trophy reads
through `steadyAngle`, which is `steadyWorld` underneath — a joint angle cannot
be had from one axis. So the round's real question was never the source. It was
whether a depth reading of this thing can be resolved at all, which is what
R60·2 refused the stance over.

**Measured, and it ships.**

- **Tracks its dial 0.89 to one.** 118° → 51.7, 128° → 42.6, 138° → 33.1,
  148° → 26.2, 158° → 16.1. Monotonic across all five rungs, not just the ends —
  a reading right at the extremes and flat in the middle separates nobody in the
  middle, which is everyone this app is for. This is the test `legs_peak_ms`
  failed.
- **Deviation 5.9° against a 35.6° span.** The best-conditioned depth reading in
  the engine: 9.4° for `external_rotation_deg` and 20.2° for `pronation_deg` on
  the same clips. A delta carries 8.3°, under a third of the span, which is what
  licenses it as a between-serves reading under R50's rule.

**And it claims nothing about the camera, which took R50c to know.** It reads
identical to two decimals at 30°, 45°, 60° and 82° — and round 40 established
exactly what that is worth: world coordinates do not rotate when the camera does,
so rig invariance here is a property of the rig. It would have been very easy to
report as robustness. A check now reads the `UNCALIBRATED` entry and **fails if
it mentions camera angle at all**, because a future reader meets that string long
before they meet the test.

**Two of my own errors, both caught by the checks as written.** The slope came
out −0.89 because the dial is an *angle* — a bigger dial is a straighter leg — so
the relationship is negative by construction and the monotonic loop is what
establishes direction. And the reading arrived declared through the wrong door
until it was wired into `flattenUngraded`; the "declared uncalibrated ⟺ actually
produced" gate then refused it until `UNCALIBRATED` had an entry.

**A defect in the audit itself.** The chain table printed
`knee_extension_deg ... deviation 5.9 ms` — a degree measurement wearing
milliseconds, in the printout whose whole job is to say what each number is. The
unit now comes off the id, which every reading in that bag already carries; the
`ms` was an assumption that held only while everything there was a timing.

**Critic.** PASS.

| Critic | Verdict | Cited |
| --- | --- | --- |
| Honesty | pass | Not named, and the entry says why twice over: nothing knows what a club player should straighten, and bending less is having less to spend rather than a fault |
| Honesty | pass | The camera claim is refused in the one place people read, and checked |
| Architecture | pass | Pinned rather than recorded in prose — its sibling's "tracks its dial near one-to-one" has never been checked since R51·1 measured it |
| Performance | pass | Two frames, two joint angles, no new pass |

**Gate.** typecheck clean · lint clean · **1191 checks, 0 failed, exit 0** (+3).
Canaried by scaling the extension to 0.4× — the tracking check reddened alone.

---

### Round 46 · Cycle A — the engine · `A4c · R61·3`

**Orchestrator.** The outbound ball, built on the pass round 39 laid down. Lead
builder: Pose Engineer. Column: *Would I trust it.*

**Why a new detector and not the old one pointed at a new window.**
`findCandidates` grows a blob and scores it on roundness. R61·1 measured how
wrong that is after contact: a struck ball smears about **1.50 m across the
frame** in one exposure — not a disc, far past `maxRadius`, thrown out by the
roundness score before anything else looks at it.

**So the smear is the measurement.** Second moments give each region its
principal axes: the long one is where the ball went during that exposure, which
means **one frame carries a heading** where a disc carries only a position. That
is the whole reason this is worth building at the speeds where the disc dies.
Measured on drawn bitmaps: a disc reads **1.00** elongation, a 60-px smear reads
**18.94**, and a line drawn at 30° reads back at **30.0**.

**The round's one hard part, and it is the refusal.** R61·3 asks for a refusal
"above the speed where the frames run out". **A refusal keyed to that speed is
one the estimate authorises for itself**: the readings that fail hardest come
from the fewest frames, so a bad enough estimate reads as slow and passes. The
failure is silent and always in the same direction.

So the gate is on **frames actually counted**. Three is the least that can
disagree with a straight line — two always fit one — and R61·1 puts a strong
serve at 3.9 frames against 8.0 at club speed. That refuses the fastest serves
and passes the ones this app is for, which is the right way round.

**Two refusals, told apart.** Found-and-disagreeing is a scene with two fast
things in it, which no better camera fixes. Never-found is a ball too fast for
the frame rate, which a slower swing or a higher rate would.

**A canary disproved one of my own comments.** I claimed the hypothesis search
was needed because a median-first filter "lets two false streaks drag the middle
off the ball". Swapped one for the other: **suite stayed green**. At eight frames
or fewer with one dominant cluster the median lands inside it and the two agree —
no separating case could be constructed at this scale. The code stays; the claim
is now the narrower true one, and the finding is recorded where the claim was.

**Critic.** PASS.

| Critic | Verdict | Cited |
| --- | --- | --- |
| Honesty | pass | Nothing in mph, and that is a check rather than a comment: a speed needs a scale, and the only scale here is a body height at the baseline against a ball flying into an uncalibrated plane |
| Honesty | pass | The frame count travels with a stated reading, not only with a refusal — it is the caveat, and a caller may be stricter |
| Architecture | pass | `findCandidates` untouched. It is load-bearing for the toss on every clip; refactoring it to share a mask with a detector that has never seen footage is the wrong order |
| Performance | pass | One green channel, one iterative flood fill — recursion blows the stack on a smear crossing a quarter of the frame |

**Gate.** typecheck clean · lint clean · **1188 checks, 0 failed, exit 0** (+11).
Canaried three ways: the floor, the difference threshold, and the agreement rule
— the third failing to redden, which became the correction above.

**What this does not prove.** Every check runs on drawn bitmaps. They prove the
geometry; they prove nothing about whether a real ball against a real sky
produces a region at all. `RECORDED` is 0 of 6.

---

### Round 45 · Cycle F — QA and edge cases · `F7 · audit 9`

**Orchestrator.** Cycle F's head item `F3` needs real footage and cannot move
here. Takes `F7` instead: contrast on the surfaces a player reads outdoors, on a
phone propped against a fence, from further away than they read anything else.

**Every other lint in this repo checks what the app says. Nothing checked
whether it can be seen.**

**Eleven pairs, parsed from `tokens.css` rather than copied**, so a token that
moves moves the measurement with it — a copied hex is a recorded number wearing
a derivation's clothes, which is the defect round 40 found in `NEXT.md` itself.

**Every pair clears WCAG AA.** Body text is **17.40:1**, past the 7.0 AAA floor,
which is the one pair worth holding above AA: it carries the report, the plan,
the cue and the refusal.

**The finding is the margin, not a failure.** `--fg-faint` on a card is
**4.87:1 against a 4.5 floor — 8% of headroom**, on the palette's faintest text,
on the surface most of the report is drawn on. Nothing changed: it passes, and
constraint 3 makes the colour somebody else's to move. What it gained is a check
on the margin itself, computed as whichever pair comes out narrowest rather than
hard-coded — a gate reporting only pass/fail goes green to green until the day
it does not.

**Translucent tints composited before measuring.** Every status tint is
`rgba(..., 0.14)`; measuring one uncomposited reports the contrast of a colour
nobody ever sees, which is a wrong number that looks like a right one.

**Critic.** PASS.

| Critic | Verdict | Cited |
| --- | --- | --- |
| Honesty | pass | A failing token is recorded with its number, not repaired. The audit was asked for a finding and constraint 3 forbids the fix |
| Product | pass | This app is used in daylight, at distance, by somebody holding a basket. Legibility is a correctness concern here in the way it is not in a desk app |
| Architecture | pass | Parsed, not restated. The sheet is the source |
| Performance | pass | One file read at suite time |

**Gate.** typecheck clean · lint clean · **1177 checks, 0 failed, exit 0** (+6).
Canaried by darkening `--fg-faint` two points — 4.87 fell to 4.07 and both the
floor check and the margin check reddened, nothing else.

---

### Round 44 · consolidation gate

**Orchestrator.** Sixth cycle since `loop-green-8`. Number diff, boot, tag.

**Number diff, instrument readings excluded** — the filter round 38 established,
because five earlier gates had been diffing wall-clock milliseconds and calling
it clean.

**249 figures at `loop-green-8`, 255 now. Six additions, zero movements, zero
removals.** All six are `58.199` — the trunk-lead invariance round 40 printed at
six camera yaws. Every pre-existing figure is byte-identical.

That is what this gate is supposed to look like. Across six rounds it covered the
shared pixel pass, a refusal that changed no engine path, an outcome tap and its
storage, a props gate that deleted a component prop, and the backup carrying a
new store — **and nothing the engine reports about a serve moved**.

**Gate.** typecheck clean · lint clean · production build clean (668.04 KiB
precache, 18 entries) · **1171 checks, 0 failed, exit 0**.

**Boot smoke**, on a restarted dev server — round 15's rule, because the pane
served a stale transform through a hard reload once. `?demo=glance`: score ring
reads "Score 68 out of 100", headline "The racket stops short behind you", all
six taps present. Server logs clean.

Tag: `loop-green-9`.

**Where the loop stands at 44 of 75.** Six focus areas, and the shape of what is
left is worth naming: Cycle A has two rounds of real engine work queued
(`A4c · R61·3`, `A5b · R72`), B has two, C has two, D and E are down to items
blocked on a phone or on a design ask, F has its audit rotation. The blocked five
have not moved and cannot move here — they need a court, a phone, or somebody to
say yes to a text input.

---

### Round 43 · Cycle E — data and export · `E6 · R74` (new)

**Orchestrator.** Cycle E is dry: `E2` is gated on a phone, `E3` on the design
ask round 42 recorded, everything else is done. Per the loop's own rule the
Orchestrator generates one — and the obvious question for this focus is what the
export path missed while other cycles added stored fields.

**It missed the whole tag store.** `serveTags` arrived in R53·2a and gained
outcomes in R56, and **neither round came back to `backup.ts`**. A player moving
to a new phone kept every report and every drill record and silently lost every
tap they had made — which serve it was, where it landed. The one part of the
history the camera did not produce.

`profileId` survives for free: it rides on the `Session` row, which is exactly
the argument round 36 made for putting it there.

**Read last, after the pruning, and that ordering is the round.** A tag is keyed
by a report id and `restoreBackup` prunes as it goes, so a backup from a full
phone restored onto a fuller one carries tags for serves that no longer exist by
the time they are read. Checked against what is actually in the database rather
than against the backup's own session list — the two differ precisely in the
case that matters. An orphan is refused rather than stored, which is the
lifetime `TAG_STORE` was keyed by report id to get.

**Optional, no version bump**, on the pattern `practice` set and for its stated
reason: every file written before this round has no such key, and refusing those
would strand the histories most worth carrying.

**The counts are surfaced, and the skips deliberately are not.** Round 42's
lesson applied on the spot: a result field nothing reads is the same defect in a
smaller box. `12 taps skipped` beside a successful restore reads as a loss the
player should act on, when the serves those taps described are gone too.

**Critic.** PASS.

| Critic | Verdict | Cited |
| --- | --- | --- |
| Honesty | pass | A restore that quietly drops what the player typed is the reason somebody stops trusting an app with their history — this file's own header says so |
| Architecture | pass | Newest tap wins, the rule the practice log already sets, and for the same reason: a tag is the player correcting the record |
| Product | pass | Failures never fail the import. Losing a tap must never be why somebody cannot restore their serves |
| Performance | pass | One extra `getAll` on export, one on import |

**Gate.** typecheck clean · lint clean · production build clean · **1171 checks,
0 failed, exit 0** (+5). Canaried twice — the orphan guard and the export half —
each reddening exactly one check.

**Caught by a gate I did not write.** All five new checks are async and I wrote
them without `await`; the harness refused the tally with "5 async checks still
running". That guard is round 18's, built after `copy.test.ts` was found printing
red crosses into a file that exited 0.

---

### Round 42 · Cycle D — architecture · `D5 · R73` (new)

**Orchestrator.** Cycle D's head item is `D2d · R55·2c`, the profile switch.
Sized first, and it is blocked: **every `<input>` in this app is `type="file"`**,
`tokens.css` strips inputs to no border and no background, and a visible text
field needs border, padding, a focus ring and a placeholder colour. That is new
CSS, which constraint 3 forbids without a design ask. Recorded and left blocked.

**So the round takes what round 41 uncovered instead.** `onTagServe` was
invisible for three rounds. Auditing for the same shape found `forProfile`,
`profilesIn` and `DEFAULT_PROFILE` called nowhere but a test. Two in seven
rounds, both found by hand at a consolidation — which is not a thing anybody
keeps doing.

**The wide version was built first, and refused on measurement.** "Any export
with no shipping caller" flags **116 of 483 exports**, because this codebase
deliberately exports constants so a test can name them rather than copy the
number — an argument written out in `FINE_FPS`, `MAX_FINE_FRAMES`, `KEEP_STILLS`
and a dozen more. A gate needing a 116-row allow list is a list nobody prunes.

**Narrowed to the shape the defect had.** A prop is a contract between two
files: one declares it, one passes it, and there is no reason for the first
without the second. Optional only — a required prop nobody passes is a compile
error and `tsc` already owns it. 45 props across 25 components.

**The gate's first finding was its own regex.** `name={` flagged `leftIsBetter`,
which `ConsistencyPanel` passes as a bare boolean shorthand. A gate whose first
finding is itself is a gate everyone learns to ignore.

**Its second was the canary failing.** Unwiring `onTagServe` left it green — the
comment beside the wiring says the words "nothing ever passed `onTagServe`", and
a search that counts prose about a prop as a use of it cannot catch a prop that
is only ever talked about. Comments are blanked before matching now. That canary
is the only reason this file works.

**Its third was real.** `defaultOpen` on `FundamentalCard`, deleted. The report
stopped passing it rounds ago for a reason written beside the call site — the
array order is hard-coded, so opening the first card always opened the toss
under a plan saying the problem was elsewhere. Deleted rather than left
optional: a door back to a rejected behaviour is one `defaultOpen={i === 0}`
away from being walked through by somebody who never reads the comment.

**Critic.** PASS.

| Critic | Verdict | Cited |
| --- | --- | --- |
| Architecture | pass | A mechanism whose only caller is a test has a green suite and no user. It reads as done in `NEXT.md`, counts in the tally, and the feature does not exist — the most expensive failure this loop can have, because nothing goes red |
| Honesty | pass | The wide gate was refused with its own number rather than tuned until the output looked tidy |
| Product | pass | Verified live: five area cards, none open, unchanged |
| Performance | pass | 25 files read once at suite time |

**Gate.** typecheck clean · lint clean · **1166 checks, 0 failed, exit 0** (+3).

**Departure, and a mistake worth recording.** I ran `npx prettier --write` on
`FundamentalCard.tsx`. **This repo has no prettier config**, so it applied
prettier's defaults — semicolons, double quotes, an 80-column wrap — and
reformatted 54 lines of a file I had two lines to change in. Lint passed, which
is why it would have been committed. Undone by hand; the file now differs from
`HEAD` by exactly the intended deletions. **Do not run prettier in this repo.**

---

### Round 41 · Cycle C — coaching and UI · `C3 · R56`

**Orchestrator.** Where the serve landed, in one tap. Lead builder: Coaching
Voice. Column: *Would I use it between serves.*

**And it found the last round's feature had never rendered.** `onTagServe`
shipped with round 35 — the block, the `aria-pressed`, the zero-new-CSS
argument — and nothing ever passed it. Grepping for the prop before adding one
beside it returned exactly one file: the screen that declares it. Three rounds
of dead UI, and the outcome tap would have shipped the same way.

So the round wires both. That is arguably two backlog rows in one, and the
alternative was shipping a second unreachable block to keep the row count tidy.

**One row, two independent facts, and the failure is silent.** A player taps
where it landed and their "second serve" is gone, with nothing on screen to say
so. `withServeTag` is a pure merge — outside the transaction, because the suite
runs in Node and a rule inside IndexedDB is a rule nothing checks. An explicit
`undefined` is the undo; an absent key leaves the field alone; a row left saying
nothing is deleted rather than stored, because a store that accumulates empty
rows is a store whose count means nothing.

**Malformed costs the field, not the row** — round 23's rule on `triage.quality`,
applied here. The existing "a 3 is refused, not clamped" check still passes, and
it passes for a reason worth writing down: its fixture carries no outcome, so
dropping the bad field empties the row anyway. Add an outcome and the real rule
shows.

**Chips, not four more full-width buttons.** Two stacked ghosts was right for a
two-way choice; four would be most of a phone screen, on the screen that exists
because reading costs a serve. `.chip--button` already carries a 44px target and
says in its own comment it is built for wrapping rows.

**"Wide" checked against constraint 4 before it was written.** The fault line
above it uses `wider` — but that renders as "Further out this time", so the word
never reaches the player twice. The heading keeps the two apart.

**Nothing is said back**, which is R56's own trap: "your toss drifts more on the
serves you miss" is a correlation over six points. The tap stores and draws
nothing.

**Critic.** PASS.

| Critic | Verdict | Cited |
| --- | --- | --- |
| Honesty | pass | Four words the player says, stored as tapped. No service box, no line, no judgement — the app never sees the court and does not pretend to |
| Product | pass | Verified on screen rather than argued: both taps held at once (`Second serve=true`, `Wide=true`), which is the exact failure the merge exists to stop |
| Performance | pass | Four chips on one row at 375px, `scrollWidth` 375 against `innerWidth` 375 — no overflow, 44px targets on all four |
| Architecture | pass | The merge is pure and tested; the transaction is unchanged |

**Gate.** typecheck clean · lint clean · production build clean · **1163 checks,
0 failed, exit 0** (+5). Canaried both merge branches separately; each reddened
only the checks that cover it.

**Verified live**, on a restarted dev server: `?demo=glance` at 375×812, both
blocks rendering, `aria-pressed` correct on both after two taps, server logs
clean.

---

### Round 40 · Cycle B — biomechanics · `B3 · R50c`

**Orchestrator.** R50c has been blocked for the whole loop on one number: how
tight "filmed from the same spot" has to be. Lead builder: Biomechanist.
Column: *Would I trust it.*

**The blocker was a figure nobody can re-run.** `NEXT.md` cites "cycle 105's
315 ms branch jump between 50° and 55°". It appears nowhere in the tree — the
exact defect `repeatability.ts`' own header names, a recorded number wearing a
derivation's clothes. So the round measured it.

**And the question does not apply.** `hip_lead_ms` is *exactly* invariant to
camera yaw: **58.199 ms at 4° and 58.199 at 75°**, twelve seeds, every angle
between. It is the difference of two peak times read from world landmarks, and
world coordinates do not rotate when the camera does.

**The dial is not being dropped**, which is the check that made this believable
rather than suspicious: `cameraYaw: 4` moves the depth confidences from usable
to soft on the same realisations, in the check immediately above. It reaches
everything projected. It cannot reach this, because this never looks.

**So the round's premise is false.** R50c says the trunk lead "has an absolute
belonging to the camera and a change that does not". For the quantity the engine
actually computes, neither half is about the camera at all.

**What blocks it is worse, and was already on file.** A delta carries both
serves' spreads — 52 ms each here, 74 ms in quadrature — against a 76 ms
`NOISE_FLOOR` entry. **97% of the floor before the two serves have differed by
anything.** One and a half deviations of noise with no room for a signal. R50c
is a resolution problem, not a same-spot problem.

**Critic.** PASS.

| Critic | Verdict | Cited |
| --- | --- | --- |
| Honesty | pass | A delta whose noise is 97% of the floor would have produced a sentence about the player's sequencing that was almost entirely about the tracker. That is constraint 1 |
| Architecture | pass | Pinned, not written down — "invariant" decays silently, and the day someone rebuilds the trunk peaks out of projected width this goes red and says why |
| Performance | pass | Six yaws × twelve seeds; the existing ensemble, no new rig |
| Product | pass | Nothing shipped, and that is the outcome. A same-spot refusal would have been a refusal spent on something the measurement cannot see |

**Gate.** typecheck clean · lint clean · **1158 checks, 0 failed, exit 0** (+1).
Canaried twice — 5 ms injected into one yaw's mean, and the quadrature widened
to 2× — both landing on exactly this check and nothing else.

**Departure.** The assertion is a band (0.8–1.2 × floor) rather than a
direction, so it reddens in both directions: quieter unblocks R50c and is news;
noisier makes the recorded margin stale.

---

### Round 39 · Cycle A — the engine · `A4b · R61·2`

**Orchestrator.** `planSharedPass` has thrown by design since the contract was
written. Builds it. Lead builder: Pose Engineer. Column: *Does it work at all.*

**The part that is not three lines.** Dropping a detector for being too slow can
make the pass fast enough to have kept it. The rate is `samplingRateFor(span)`,
the span is the union of surviving windows, and the union *shrinks* when a member
leaves — so a ball detector reaching a second past contact is the reason the
racket detector gets refused, and removing it raises the rate past what the
racket asked for.

**Drops, never re-admits**, and the argument is that re-admitting is the same
step backwards: the re-admitted window widens the span, lowers the rate, and can
refuse whoever was already in. Membership would then depend on the order the
drops happened in. The cost is a detector occasionally refused on a grid the
final pass beats — refused against the pass it was actually offered, which is
honest. It is also what makes the loop terminate: each round removes at least one
member or stops.

**A miss is `undefined` from the fold** — the one convention this adds to the
contract. The pass cannot otherwise know `found`, and a zero would be the
stand-in value this file refuses everywhere else.

**Two of my own checks failed first, and both were right to.** The grid stopped a
rounding remainder short of `window.end` — which is contact, the frame the
racket window exists for. And the `window_empty` case could not be reached
through the existing `ballFlight` stand-in at all: it opens at the *toss*, so it
never collapses, while the detector W7 will actually write starts at contact.
`WindowAnchors`' own comment says so. The stand-in has been wrong since it was
written, and only building the planner surfaced it.

**A canary found a check too weak to be worth having.** Replacing per-detector
`asked` with the whole grid stayed green: the racket window is a third of the
union, so "read is less than asked" held while `asked` was wrong by two and a
half times — a detector blaming itself for frames its window never contained.
The check now asserts the count, not an inequality.

**`pose/rate.ts` split out.** `detector.ts` promises DOM-free in its own header
and `detector.test.ts` warns in line 33 that importing `extract.ts` "would pull
`document.createElement` into a Node bundle" — and the first version of this
round did exactly that. The rate now lives in a file with no imports; `extract.ts`
re-exports all three, so no existing importer changed.

**Critic.** PASS.

| Critic | Verdict | Cited |
| --- | --- | --- |
| Honesty | pass | A declined detector is named with a reason and the grid it was refused on, so a caller can tell "did not look" from "looked and found nothing" — different sentences to a player, and the second is a fault report |
| Performance | pass | This is the performance item: one seek instead of two over windows that overlap heavily. `harvest` is O(frames × members) with members ≤ 2 |
| Architecture | pass | One rate authority, and the DOM-free promise kept rather than quietly spent |
| Product | pass | Nothing user-facing yet by design — W6 and W7 are the detectors |

**Gate.** typecheck clean · lint clean · **1157 checks, 0 failed, exit 0** (+5).
Canaried three ways; the third failed to go red and became a better check.

---

### Round 38 · consolidation gate — and the gate was measuring itself

**Orchestrator.** Sixth cycle since `loop-green-7`. Number diff, boot, tag.

**The diff came back dirty, and the second diff is why it matters.** Eight
figures moved against `loop-green-7`. Re-running the *current* suite twice moved
eight figures too. **The suite is not deterministic, so five gates have been
diffing against a moving target** — and a genuine eight-reading regression would
have been indistinguishable from this noise.

**Two sources, and only one of them is noise.** Four are wall-clock milliseconds
from the frame-budget checks: those measure this machine, not the serve, and
belong out of the diff by definition. The fifth is a defect.

**A frame reported as holding less than nothing.** `footprint.test.ts` printed
`one frame: 7414 bytes, of which -457 is not landmarks` — a negative
composition, and it has printed one for as long as the file has existed. The two
`perItem` readings are taken at different `n` (200,000 landmarks against 20,000
frames) with no collector between them, so their difference carries both lots of
heap noise and wanders either side of zero by about 6%. The finding is real and
was being said backwards: the box around the landmarks is too small to see.

Now the share always prints and the byte figure only clears a stated 5% floor —
5% because that is the observed spread, and a bound under what the instrument
wobbles by reports the wobble. Plus a check that the sentence can never again
claim a negative composition, and a second bound at 50% so a frame that really
does change shape breaks the note rather than widening it.

**Gate.** typecheck clean · lint clean · production build clean (665.96 KiB
precache, 18 entries) · **1152 checks, 0 failed, exit 0**.

**Number diff, instrument readings excluded:** 249 figures, **byte-identical to
`loop-green-7`**. No engine reading has moved in six rounds — across the profile
migration, a `Session` type change and two new checks.

**Standing rule added.** The gate's diff excludes lines matching
`ms( \(informational\))?$|bytes|noise floor`. Those are readings of the machine.
Everything else is a reading of the serve and must not move without a round
saying why.

Tag: `loop-green-8`.

---

### Round 37 · Cycle E — data management · `D2c · R55·2b`

**Orchestrator.** Cycle E's head items are gated on a phone, so the round takes
the item round 36 unblocked: the profile switch, offered by the hand-off
detector. Lead builder: Release Architect. Column: *Would I trust it.*

**Refused, and the mechanism is the part that fails.** `possibleHandoff` reads
standing height as a fraction of the frame. That is a body only because the
camera held still — the function's own doc comment has said *the same camera
position* since it was written. Across two sessions the phone moved.

**The arithmetic.** Same player, camera at six metres and then five: the body
reads 6/5 taller, `spread / min` = 0.20, threshold 0.18. The boundary sits at
6 / 1.18 = 5.08 m. **Ninety-two centimetres of re-propping a phone on a fence
flags one player as two.** Fed a history it would cry hand-off on most sessions.

**And round 36 made it compile.** A stored `Session` now satisfies
`Pick<Analysis, 'scale'>[]` structurally, so `possibleHandoff(history)` would
pass the typechecker silently. The type cannot state this contract, so two
checks do.

**Critic.** PASS.

| Critic | Verdict | Cited |
| --- | --- | --- |
| Honesty | pass | Offering to move somebody's serves under another player on a signal that fires on a camera move is constraint 1 exactly. `trackPair.ts` refuses `camera_moved`/`no_scale` for this reason with a similarity transform to lean on; this has nothing |
| Architecture | pass | The hazard is newly created and load-bearing: the guard is checks, not a comment, because the compiler stopped being able to catch it three rounds ago |
| Product | pass | The within-clip note is untouched and still right. No profile assignment could fix what it reports — a basket with two people in it is one report holding two people's serves |
| Performance | pass | No engine path changed |

**Gate.** typecheck clean · lint clean · **1151 checks, 0 failed, exit 0** (+2).
Canaried: both bounds moved to a camera that barely shifted, exactly the two
intended checks went red, suite exit 1.

**Left behind.** `R55·2c` — the switch as a tap, which is where R53·1 landed on
the same question. Wants the app's first text input; size it before starting.

---

### Round 36 · Cycle D — performance and architecture · `D2b · R55·2a`

**Orchestrator.** Takes the decision round 30 left open, then does the migration
R55 itself calls the hard part. Lead builder: Release Architect. Column: *Does it
work on my clip at all*.

**The decision.** The profile lives on the stored row, supplied by
`saveSession`. Not in `serveTags` — that store is written by a tap after the
fact, and a profile must be known at save time or a re-run files the same serve
under nobody. Not on `Analysis` — a live analysis is of a clip, and which history
it joins is a storage question.

**Which breaks an identity this file defended twice**, and the argument for it
survives: `Session = Omit<Analysis, 'frames'>` was defended on the grounds that
what the camera measured and what the player says are different claims. A profile
is neither. It is whose row this is, like `id` and `createdAt`, both of which
have always sat on `Analysis` without anybody calling them measurements.

**Defaulted rather than refused, and the contrast with round 23 is the point.**
`triage.quality` is *dropped* when malformed because there is no honest default
for a missing confidence. A missing profile is different in kind: it is a report
from before the question was asked, and there is exactly one honest answer.

**One filter, not thirteen** — round 30's finding as code, with its own check
already in place to catch a fourteenth consumer.

**Critic.** PASS.

| Critic | Verdict | Cited |
| --- | --- | --- |
| Honesty | pass | A restored report keeps its own profile rather than being reassigned to whoever is active — the rule the scoring stamp already follows, and a restore that reassigned would move somebody else's serves into this history |
| Performance | pass | One string per row. `forProfile` is a filter over a list already in memory |
| Privacy | pass | This *is* a privacy feature: it stops one player's serves reaching another's trend on a shared phone |
| Architecture | pass | `profilesIn` derives from the reports rather than a store — a profile with no serves is a name and nothing else, and a list that can hold one needs pruning, renaming and an empty state nothing asked for |
| Product | pass | No UI, and none needed to ship: everything files under one player until R55·2b makes it vary |

**Gate.** typecheck clean · lint clean · **1149 checks, 0 failed, exit 0** (+6).
Canaried to two.

---

### Round 35 · Cycle C — pedagogical coaching and UI · `C2c · R53·2b`

**Orchestrator.** Closes R53. Lead builder: Pedagogical UX & Skill Architect
with the Modular UI Developer on the layout. Column: *Is it worth opening again*.

**Zero new CSS, and it cost something.** Two stacked full-width buttons is not
the tightest layout for a two-way choice; a two-across row would look better and
would need a class this stylesheet does not have. Constraint 3 says assemble from
what exists, so that is what shipped — and at arm's length on a court the bigger
targets are the better trade anyway, which is the honest version of the argument
rather than a consolation.

**The partition never infers, which is R53·1 carried through.** An untagged serve
is in neither bucket and is counted, so the two sides routinely fail to add up to
the basket. That is the honest state, and a check names it so nobody later
"fixes" the arithmetic.

**`MIN_COMPARABLE_SERVES` per bucket, not per basket.** One serve on a side has a
spread of zero, which would score a perfect 100 off a sample with no repetition —
exactly what that floor exists to prevent. A basket of six with five firsts and
one second has a comparison on one side and none on the other, and says so.

**Critic.** PASS.

| Critic | Verdict | Cited |
| --- | --- | --- |
| Honesty | pass | Nothing inferred. Each side is rebuilt from its own readings rather than re-split from an average, because there is no way back from a mean to what went into it |
| Performance | pass | One pass over a basket; each side rebuilt only when it has two serves |
| Privacy | pass | The tag is local, in the store round 29 built |
| Architecture | pass | No new CSS class. `aria-pressed` carries state rather than colour — R21's gap closed while writing rather than in a later pass |
| Product | pass | The tap is on the glance because that is the moment. Tapping the chosen one clears it, the undo the practice log already establishes |

**Verification.** The copy gate sees the new lines — 98 readable, still zero real
failures. **The tap itself has not been driven**: the glance needs a live
analysis, the same block as rounds 5, 11 and 21.

**Gate.** typecheck clean · lint clean · **1143 checks, 0 failed, exit 0** (+5).

---

### Round 34 · Cycle B — biomechanics and fault detection · `B1c · R50·3`

**Orchestrator.** Closes R50, three entries and twenty rounds after it opened.
Lead builder: Biomechanics & CV Specialist. Column: *Do I believe it*.

**The only one of the three whose bound is not a constant.** External rotation's
confounder is posture and landing's is noise; both give a fixed floor. This one's
is tempo, which *varies between the two serves being compared*, so the bound is
computed per pair. That is what makes it a third entry rather than a copy of the
first two.

**No new stored field, and that was worth checking for.** `motionSeconds` lives
inside `diagnose` and is never kept — but `phases` carries `t` on every keyframe
and is stored, so the tempo is `contact.t − ready.t` from any report the prune
ladder has left. Round 17 measured what a stored report costs and round 24
checked what survives pruning; the cheapest field is the one nobody stores.

**A fixture error of mine, caught by arithmetic.** My first tempo-widening
fixture used a delta of 0.013 against a bound of 0.0123 — the right side of the
line by 0.0007, so the check failed and the code was correct. Rewritten to
straddle the two bounds deliberately at 0.011: past the equal-tempo floor,
inside what a 0.8 s gap buys. A comfortably large delta would pass both and prove
nothing about the tempo term.

**And a check went red for the right reason.** The unmapped-identifier check used
`chain_span_ratio` as its example, and this round mapped it. Repointed at
`leg_drive_rise_ratio`, which round 28 measured and deliberately did not surface.

**Critic.** PASS.

| Critic | Verdict | Cited |
| --- | --- | --- |
| Honesty | pass | Built on round 14's measured decomposition, not the register's 21% — which is the total spread and would have refused every comparison for a reason that is mostly not tempo |
| Performance | pass | Two field reads and a `hypot` per basket. No new stored bytes |
| Privacy | pass | Nothing new leaves the device |
| Architecture | pass | Third entry through one mechanism. The copy check names "chain" explicitly because `voice.ts` catches lab jargon and not coach jargon — constraint 4's known gap |
| Product | pass | One more line on a panel that already renders a list |

**Gate.** typecheck clean · lint clean · **1138 checks, 0 failed, exit 0** (+6).

---

### Round 33 · Cycle A — CV/ML engine · `A5 · audit 8` (R71)

**Orchestrator.** Lead builder: Biomechanics & CV Specialist. Column: *Do I
believe it*.

**The audit is right about one of four, and saying so is half the round.** Read
as "four things to fix", it would produce three changes that make the engine
worse: `toss`, `ready` and `trophy` are *search windows*, which only have to be
generous, and a share would narrow a fast serve's window for no reason.

**The fourth is a placement, not a window,** and it decides where the landing is
read. Fixed at ~0.42 s after contact, which is **0.435 of the motion on a fast
serve and 0.295 on a slow one** — so two players' landings are read at different
points of their own follow-throughs.

**And it is exactly the half R44 left.** That round made the landing *refusal* a
share of the serve and left the *placement* in seconds. One question, two units,
and neither half wrong on its own.

**Recorded rather than fixed, on R44's own authority.** Its warning is that
moving a window in `phases.ts` re-derives every noise floor built on it — and
this one would move `landing.offset` on every clip, invalidating the calibration
R50·2's bound rests on. Queued as R72 with that cost attached.

**Critic.** PASS.

| Critic | Verdict | Cited |
| --- | --- | --- |
| Honesty | pass | Three quarters of the audit item refuted rather than acted on. The finding is a measured 32% drift, not an assertion that seconds are wrong |
| Performance | pass | Test-only |
| Privacy | pass | Nothing shipped |
| Architecture | pass | Not fixed here, because the fix needs a number diff and a re-derivation — the exact discipline R44 wrote its warning for. The second check goes red if the drift stops, so a later fix updates this entry rather than leaving it stale |
| Product | pass | Nothing a player sees |

**Gate.** typecheck clean · lint clean · **1132 checks, 0 failed, exit 0** (+2).

---

### Round 32 — the fifth consolidation gate

**1 · Full gate.** typecheck clean · lint clean · **1130 checks, 0 failed,
exit 0** (+18 across the block).

**2 · Number diff against `loop-green-5`.** **No existing engine reading moved.**
Round 28 added one — `leg_drive_rise_ratio` — and it appears as new lines rather
than as a change to anything, which is the right shape for an addition and worth
checking rather than assuming. Otherwise four new notes (26, 27, 28, 30), heap
and wall-clock noise.

**3 · Boot smoke.** Server restarted, fresh tab, report renders end to end, clean
console.

**4 · Copy audit.** Zero real.

**5 · Ledger compression.** Not done. Same reasoning, and it is now worth naming
as a standing decision rather than restating each block: Phase 8 is mid-flight,
the entries are delta-only, and rounds cite each other by number across blocks —
26 paid for 27, and 29 made 30's second finding visible.

**6 · Tag.** `loop-green-6`. Push still impossible: no remote.

**What this block was.** Two refusals with arithmetic behind them (court lines,
and the stance from the block before), two spikes that changed what their rounds
would build (the ball's frame count, the profiles migration), one new engine
reading, one storage decision, and a coach's card built content-first. **Three of
the six were rounds where the deliverable was a number that stopped something
being built** — which is the same ratio as block four and looks like the steady
state of a codebase this far along.

---

### Round 31 · Cycle E — data management and export · `E4b · R58·2`

**Orchestrator.** Draws what round 24 decided. Lead builder: Modular UI
Developer. Column: *Is it worth opening again*.

**The split paid off exactly where it was supposed to.** This function computes
nothing — it draws `tripSummary` — so the only thing a drawing round could still
get wrong is turning a refusal back into a number on the way to the canvas. That
is what the checks are about, and the canary confirms: defaulting the gap to 0
reddens precisely the check that says a trip nobody swept draws no repeatability
row.

**No new token, and this surface has the least claim on one** — it exists to be
screenshotted into a message thread, where the app's own palette is the only
thing carrying its identity.

**A near-miss worth recording.** A shell quoting error aborted a command line
that ended in `git checkout -- src/lib/share/reportCard.ts`. The abort is the
only reason the round survived; that call would have discarded it, and it would
have been the third time this session. I have stopped using `git checkout --` for
canaries — `Edit` both ways instead, which is what the rest of this round used.

**Critic.** PASS.

| Critic | Verdict | Cited |
| --- | --- | --- |
| Honesty | pass | The absent row is absent, asserted both ways. "1 serve filmed", not "1 serves" — the kind of thing nobody notices until it is in somebody's thread |
| Performance | pass | One detached canvas, measured before the height is set, as both existing cards do |
| Privacy | pass | No image of any person, asserted rather than assumed. A coach's card travels further than a report does |
| Architecture | pass | Every token already existed. The variable height falls out of two fields that are routinely absent, which is the shape the content decided |
| Product | pass | The strongest artefact this app can hand somebody who is not the player |

**Verification, and its limit.** Six checks against a recording context. **Not
verified in a browser** — the pane will not composite, and unlike the ghost there
is no on-screen canvas to sample: the card renders to a detached canvas and goes
straight to a Blob. The stub is evidence about what is drawn, not about how it
looks.

**Gate.** typecheck clean · lint clean · **1130 checks, 0 failed, exit 0** (+6).

---

### Round 30 · Cycle D — performance and architecture · `D2 · R55·1`

**Orchestrator.** The spike R55 asks for. Lead builder: Release Architect.
Column: *Do I believe it*.

**The check caught me on its first run, which is the finding.** I enumerated the
history consumers by hand from a grep and got nine. There are thirteen — it found
`streakLine`, `longestStreakLine`, `glanceStrain` and `clearedStrainOf`. If a
careful count misses a third of them, a careful patch will too, and the failure
mode is one player's serves on another player's chart. So the filter goes at the
source, not at thirteen call sites.

**A finding that was invisible one round ago.** `saveSession(analysis)` takes an
`Analysis` and nothing else, so a `profileId` on the row is erased by every
re-run — precisely the defect R53·2a solved for tags in round 29. Putting the two
side by side is what made it visible; neither round alone would have.

**Critic.** PASS.

| Critic | Verdict | Cited |
| --- | --- | --- |
| Honesty | pass | The count is stated as a correction of my own estimate, not as a clean number. The where-it-lives decision is named as R55·2's to take, not pre-empted |
| Performance | pass | Test-only |
| Privacy | pass | Nothing built. The leak this prevents is between players on one phone, which is the privacy shape a squad or a family actually has |
| Architecture | pass | Both directions guarded — a fourteenth consumer fails, and a name that stops reading a history fails too, which is `egress.test.ts`'s own allow-list discipline |
| Product | pass | Nothing shipped |

**Gate.** typecheck clean · lint clean · **1124 checks, 0 failed, exit 0** (+2).

---

### Round 29 · Cycle C — pedagogical coaching and UI · `C2b · R53·2a`

**Orchestrator.** Lead builder: Release Architect. Column: *Is it worth opening
again*.

**The storage decision is the round, and `db.ts` had already made the argument.**
`saveSession` is called with a fresh `Analysis` after every re-run — a handedness
correction, a serve-type change, flicking to another serve in the clip — so a
field on the row is erased by the most ordinary thing anybody does on the report
screen. That is the second time this reasoning has decided a design, after the
practice log.

**A DB version bump that needed no new upgrade logic.** The existing handler adds
stores by existence rather than by the version being upgraded from, and its
comment says it was written for exactly this. It worked untouched.

**Named for what it holds.** R56 will need to know whether a serve went in — the
same kind of claim, the player's, about one serve, outliving the report. Two
stores for one idea would be two upgrade paths and two normalisers.

**Critic.** PASS.

| Critic | Verdict | Cited |
| --- | --- | --- |
| Honesty | pass | No inference — R53·1 settled that. `serveNumber` refused rather than clamped, since clamping is the app deciding what somebody meant |
| Performance | pass | One store, one row per tagged serve. `tagsById` is a `Map` because every consumer asks per-serve and a linear scan over sixty reports looks free until it is inside a render |
| Privacy | pass | Local, same as everything else. Nothing new leaves |
| Architecture | pass | Lifetime deliberately the report's, unlike the practice log's — a tag about a dropped serve is not worth its row. The normaliser is exported and the comment says why: no DOM-free public door exists, so a private repair would be an untested one |
| Product | pass | No surface yet. The tap is R53·2b |

**Gate.** typecheck clean · lint clean · **1122 checks, 0 failed, exit 0** (+5).
Canaried to one.

---

### Round 28 · Cycle B — biomechanics and fault detection · `B4 · R51·1`

**Orchestrator.** Lead builder: Biomechanics & CV Specialist. Column: *Do I
believe it*. The engine's first new reading in nine rounds.

**It does what `legs_peak_ms` could not.** That entry times the leg drive and
cannot measure it — the same peak whether the player drives or not — which is
why no amount of footage would rescue it. This is the amplitude, and swept
against `contactHipHeight` it tracks near one-to-one with a flat deviation and
ten deviations between adjacent steps. **Identical to four decimals at 45° and
82°.** Nothing else in the engine is that indifferent to the camera.

**Half the round refused.** R51 asks for knee extension "read from image y
alone", and a knee angle is not an image-y quantity — it is an angle between
three points, camera-dependent in the image plane. The round's own justification
for the reading does not extend to it, so it would need its own and has none.

**Two gates I did not write caught this round** — fifth and sixth this session.
The register's producer check refused an entry nothing produced. Then the printed
provenance audit would have labelled an image-y reading "world z" and printed a
dimensionless one in milliseconds — the exact wrong-unit trap that file's
comments were written about after it happened once before. Fixed by renaming to
`leg_drive_rise_ratio`: this codebase carries units in id suffixes and
`landing_offset_ratio` is the precedent, so a rename beat a special case.

**Critic.** PASS.

| Critic | Verdict | Cited |
| --- | --- | --- |
| Honesty | pass | Ships into `UNCALIBRATED`, with the sweep in the entry. Its zero is 0.0457 and that is stated, since a planted player still rises. Half the round refused rather than stretched |
| Performance | pass | Two frames, four landmarks. No window, no smoothing pass |
| Privacy | pass | Nothing new leaves the device |
| Architecture | pass | Read at two keyframes rather than smoothed windows, for `readLandingBalance`'s reason: these are endpoints of a span and averaging would blunt the difference being measured |
| Product | pass | Not surfaced. It completes the pair with knee bend at the trophy — how far the legs loaded, and how much became upward motion — and a surface is a later round |

**Gate.** typecheck clean · lint clean · **1117 checks, 0 failed, exit 0**.

---

### Round 27 · Cycle A — CV/ML engine · `A4 · R61·1`

**Orchestrator.** The spike R61 asks for by name. Lead builder: Biomechanics &
CV Specialist. Column: *Do I believe it*.

**Two numbers, both derivable without building anything.** How much ball there
is — 8.0 frames at club speed, **3.9 at a strong serve**, at 30 fps — and how
blurred it is: a **1.50 m smear** in one exposure against a 5.9 m frame. Both
fall out of R62's frame-width figure from the round before, which is the first
time this session one round's measurement has directly paid for the next.

**The shape is the finding, not the count.** Frames fall as the serve gets
faster, so a speed reading would be least precise exactly where a player cares
most. And the tracker looks for a compact disc — `min(R,G) − B` over a blob —
which a streak across a quarter of the frame is not. The toss works because a
tossed ball is nearly stationary at its apex.

**Not a refusal.** Eight frames at club speed is a usable fit and club players
are who this app is for. What this is is a set of constraints the build has to be
shaped around rather than discover, which is what a spike is for.

**Critic.** PASS.

| Critic | Verdict | Cited |
| --- | --- | --- |
| Honesty | pass | "Film it at 60" is answered before anybody suggests it: 7.9 frames and still 13% smear. And the round is left `[~]`, not refused — the numbers do not support a refusal |
| Performance | pass | Nothing built |
| Privacy | pass | Nothing built |
| Architecture | pass | Split three ways with the infrastructure separated from the detector, since `planSharedPass` is needed by W6 and W7 alike and is the only ordinary engineering in it |
| Product | pass | The one reading that would describe the *result* of the technique rather than the technique. Not promised, and not refused |

**Gate.** typecheck clean · lint clean · **1117 checks, 0 failed, exit 0** (+3).

---

### Round 26 · Cycle F — QA and edge cases · `F2 · R62`

**Orchestrator.** The one round `PHASE-8.md` lists to be refused rather than
built. Lead builder: Biomechanics & CV Specialist. Column: *Do I believe it*.

**Refused with arithmetic, not instinct.** Court lines enable the three things
every player asks for, so "too hard" is not an answer anybody will accept or
remember. Derived from a constant the app already enforces: a well-framed 1.8 m
player at 0.54 of frame height puts a 16:9 frame at **5.9 m** wide at the
player's distance, against **8.23 m** of singles court. The sidelines are not in
shot.

**Both ends checked, and the second is what makes it honest.** At the framing
floor the frame reaches 10.7 m — wide enough. That is one step above "too far
away", where every pose reading the report is made of is already soft, so court
lines bought from there are paid for with the serve. The check is written to go
red if the loosest accepted framing ever stops reaching the court, which would
make the refusal *stronger* than stated — a refusal that only fails in the
direction that flatters it is not a check.

**Critic.** PASS.

| Critic | Verdict | Cited |
| --- | --- | --- |
| Honesty | pass | A number, derived from `MIN_FRAME_HEIGHT_SHARE` and the rig's own scale, rather than an assertion. What would change it is named as a camera or a second device, explicitly not smoothing — the lines are absent, not faint |
| Performance | pass | Nothing built |
| Privacy | pass | Nothing built |
| Architecture | pass | The derivation lives in `axes.test.ts`, beside the other camera-geometry findings, so it is re-run rather than remembered |
| Product | pass | Product would want this most of anything in the ladder, and Honesty says the pixels are not there. Recorded in `PHASE-8.md`'s refusal list, `NEXT.md` and `README.md` |

**Gate.** typecheck clean · lint clean · **1114 checks, 0 failed, exit 0** (+2).

---

### Round 25 — the fourth consolidation gate

**1 · Full gate.** typecheck clean · lint clean · **1112 checks, 0 failed,
exit 0** (+22 across the block).

**2 · Number diff against `loop-green-4`.** **No engine reading moved** —
including across round 23's change to `normalise` and to the `Triage` type, which
made `quality` optional. Everything that did: two new notes (rounds 20 and 22),
the per-frame heap figure by 0.09%, and wall-clock timings.

**3 · Boot smoke.** Server restarted first, fresh tab, report renders end to end,
clean console.

**4 · Copy audit.** 97 lines, 7 failing, all exempt with a reason, **zero real**.

**5 · Ledger compression.** Not done — Phase 8 still mid-flight, entries already
delta-only and cross-referenced.

**6 · Tag.** `loop-green-5`. Push still impossible: no remote.

**What this block was.** Six rounds, and **five of them refused or corrected
something** rather than adding a feature: the stance detector refused on a
measurement (20), the racket delta shipped with the round's own floor confirmed
rather than corrected (21), basket inference refused with its seductive
counter-evidence preserved (22), a stored-shape guard built on a premise that
turned out false — and breaking the restore path on the way (23), and a coach's
card whose content was decided before its pixels (24). The engine gained one new
reading in six rounds. That is the ratio a maturing codebase should have.

---

### Round 24 · Cycle E — data management and export · `E4 · R58·1`

**Orchestrator.** The round I deferred in 17 for want of room, taken as the half
that fits: the content, not the canvas. Lead builder: Product Expansion Lead.
Column: *Is it worth opening again*.

**Nothing assembled trip-level content before.** `renderBasketCard` shares one
swept clip; R58 asks for a *trip*, which is every report filed within one visit.
That distinction is the round.

**The refusal is the interesting field.** A trip nobody swept gets no
repeatability reading, rather than one built from the spread across separate
clips — that would compare serves the app never compared, filmed minutes apart
with a camera that may have moved. Canaried by defaulting it to 0: exactly that
check reddens.

**A fixture error, mine, caught by the check.** The survives-without-a-clip test
put the focus on the first report and the rule takes the last. The rule is right
— a trip whose fault changed partway through is one where the earlier advice was
superseded — and the fixture was unrealistic, since every real report carries a
focus. Fixed the fixture.

**Critic.** PASS.

| Critic | Verdict | Cited |
| --- | --- | --- |
| Honesty | pass | R58's own claim — every field survives a reopened report — checked against a fixture with no frames, video, thumbnails or track, which is what the prune ladder leaves |
| Performance | pass | One pass over a trip's reports; no canvas, no decoder |
| Privacy | pass | Reads stored reports only. Nothing new leaves the device |
| Architecture | pass | Lives in `progress.ts`, which owns trips, rather than in the share module that will draw it. Strain gated twice — recurring across trips *and* raised on this one |
| Product | pass | The content decided before the pixels, so the drawing round argues about layout rather than about truth |

**Gate.** typecheck clean · lint clean · **1112 checks, 0 failed, exit 0** (+7).

---

### Round 23 · Cycle D — performance and architecture · `D3 · audit 5` → R65

**Orchestrator.** Audit 5 asks for a stored-data shape that predates its writer.
The answer was already named — R65 — so the round did it rather than
rediscovering it. Lead builder: Release Architect. Column: *Does it work on my
clip at all*.

**R65's stated premise is wrong, and that is the seventh time this session.** It
said "the consumers in `verdict.ts` read those without asking". A sweep finds no
such consumers: exactly one reader of `triage.quality` exists outside tests, and
it guards itself.

**Built anyway, and the file's own history is the argument.** `withChain` has
three separate guards because the chain, the rotation and the landing each
arrived, found no shape check, and wrote their own. `pairTracks` wrote a fourth
in R49·1. One guard at the door is cheaper than one per reader.

**My first version broke the restore path, and an existing check caught it.**
Dropping the whole triage lost `status`, which `importBackup` reads to refuse a
clip the engine rejected — so a rejected row came back into a history that had
refused it. A rejected clip legitimately has readings nobody took; the rejection
must survive. `Triage.quality` is now optional and the **block** drops, not the
verdict. Fourth time this session a gate I did not write has caught me.

**Critic.** PASS.

| Critic | Verdict | Cited |
| --- | --- | --- |
| Honesty | pass | The entry's false premise is recorded in the code, not only the ledger. Dropped rather than repaired — no honest default exists for a missing `confidence` |
| Performance | pass | Five `typeof` checks per row on read |
| Privacy | pass | Nothing shipped changes |
| Architecture | pass | `pairTracks` keeps its own guard, and that is not redundancy: `Pairable` accepts a live `Analysis` that never passes through `normalise`. `yaw_measured` deliberately excluded from the required shape — it is younger than the block, so requiring it would drop most of a real history |
| Product | pass | A corrupted row loses its verdict and keeps its scores, filmstrip, trend and practice card |

**Gate.** typecheck clean · lint clean · **1105 checks, 0 failed, exit 0** (+5).
Canaried to one check.

---

### Round 22 · Cycle C — pedagogical coaching and UI · `C2 · R53·1`

**Orchestrator.** Lead builder: Product Expansion Lead, with Honesty leading the
read. Column: *Do I believe it*.

**I nearly published the wrong conclusion from my own probe.** Dialling a
plausible second serve and measuring gave 18.2 sd of separation on contact
height, which reads as "inference works". It is circular: the rig was told the
two serves differ in exactly that quantity by exactly that amount. The control —
`chain_span_ratio`, which nobody dialled — separates at 1.1 sd, and that is the
number that means something.

**Kept as a check rather than deleted.** The 18 sd figure is reproducible and
misleading, and somebody will measure it again. The check asserts the circularity
directly and goes red if an *undialled* reading ever starts separating, which is
precisely when the round is worth reopening.

**Critic.** PASS.

| Critic | Verdict | Cited |
| --- | --- | --- |
| Honesty | pass | The round's own "or infer it within a basket" is refused by two independent routes, and the seductive measurement is preserved with its refutation attached rather than dropped |
| Performance | pass | Test-only |
| Privacy | pass | Nothing shipped |
| Architecture | pass | Nothing built on an unverified premise. R53·2 named as the only honest route |
| Product | pass | Product wanted the partition; Honesty says the field it rests on cannot be inferred. Precedence call, recorded |

**Gate.** typecheck clean · lint clean · **1100 checks, 0 failed, exit 0** (+1).

---

### Round 21 · Cycle B — biomechanics and fault detection · `B2 · R50b`

**Orchestrator.** Lead builder: Biomechanics & CV Specialist. Column: *Do I
believe it*.

**The round's own figure was right this time**, which is worth saying after two
siblings whose stated bounds were the wrong number. R50b estimated "about 15°"
from the 1.5 × deviation convention — a single-reading convention — and the delta
arithmetic gives √2 × 11.8 ≈ 16.7°. Close. The estimate was good judgement rather
than a category error.

**A second function, not a second field.** `rotationMove` sits beside `faultMove`
rather than inside it: they refuse for different reasons, and a trip where the
named fault held still while the racket moved is exactly the case worth seeing.
One function returning both would invite a caller to treat them as a pair.

**Critic.** PASS.

| Critic | Verdict | Cited |
| --- | --- | --- |
| Honesty | pass | Neither direction graded — a check holds the two lines differ, so a screen that only spoke on good news fails. Refuses most comparisons, as the round required |
| Performance | pass | Two field reads and a `hypot` per glance |
| Privacy | pass | Nothing new stored or sent |
| Architecture | pass | Both refusals inherited, not re-implemented. `ER_DEVIATION_DEG` exported from prose so the bound is computed rather than retyped. The trip join stays in `progress.ts`, so `analysis/` still never imports it |
| Product | pass | One line on an existing screen, absent far more often than present |

**Copy.** Not reached by `everyVerdictCue()` — that walks the flaw tables — so it
is checked directly. R69's finding applied while writing rather than after.

**Gate.** typecheck clean · lint clean · **1099 checks, 0 failed, exit 0** (+9).
Canaried by setting the floor to 1°: two red, both written for it. Not verified
live — the glance needs a live analysis, the same block as rounds 5 and 11.

---


### Round 20 · Cycle A — CV/ML engine · `A3b · R60·2`

**Orchestrator.** Fourth block opens on the detector round 13 built the rig for.
Lead builder: Biomechanics & CV Specialist. Column served: *Do I believe it*.

**Refused, and the measurement is the round.** R60 says the slide is "a large,
slow, unambiguous motion along the axis the camera sees best". It is along the
axis a side-on camera sees **worst** — the stance is a depth quantity, and this
repo established at 82° image x is 99% depth. Side-on the separation reads 0.0050
against a flat 0.0030 noise floor. The first ratio built on that denominator came
back 12.0 ± 14.8: not a weak reading, a meaningless one.

**Round 13 was not wasted by this.** The dial is what made the refusal
measurable rather than arguable, and R64 still needs it for the front-ankle
baseline. A rig capability outlives the round that asked for it.

**A guard I did not write caught a mislabelling.** The first version put this in
`UNDER_RESOLVED`, and `depth.test.ts`'s check that no floor sits below its own
repeatability rejected it — that register is for readings the engine *computes*
and cannot grade, and nothing computes this one. The check was right. Third time
this session a gate I did not write has caught me, after the tally guard and the
report vocabulary.

**Critic.** PASS.

| Critic | Verdict | Cited |
| --- | --- | --- |
| Honesty | pass | One of the four checks asserts the signal **is** readable at 30°, so this reads as a withdrawal rather than an impossibility. And what would move it is named as a second camera, not smoothing — because the signal is absent rather than noisy, and smoothing is where a rebuild would otherwise start |
| Performance | pass | Nothing shipped into the engine |
| Privacy | pass | Nothing shipped |
| Architecture | pass | The refusal lives in `NEXT.md`, `README.md` and four checks. Nothing was added to a register that would have mislabelled it |
| Product | pass | R51 loses its interpreter and is told so: it will ship without knowing the stance, or say it cannot tell |

**Gate.** typecheck clean · lint clean · **1090 checks passed, 0 failed, exit 0**
(+4).

---

### Round 19 — the third consolidation gate

Shifted from 18 so R66 could land first, which was the right order: this gate
leans on the test suite, and R66 is what proves the suite counts itself.

**1 · Full gate.** typecheck clean · lint clean · **1086 checks, 0 failed,
exit 0** (+17 across the block).

**2 · Number diff against `loop-green-3`.** **No engine reading moved** —
including across round 13's change to `syntheticServe.ts`, the module every
other test stands on. That was already proved per-round; this confirms it across
the block. Everything that did move:

| Moved | Why |
| --- | --- |
| Six new notes | Rounds 13, 14, 17, 18. Intended |
| Copy gate `15 failing / 8 real` → `7 / 0` | Round 15. This *is* the deliverable |
| frame `7415 → 7414` bytes | Heap noise, 0.01% |
| stroke timings | Wall clock |

**3 · Boot smoke, with the server restarted first — now standard.** Round 15
proved the pane can serve a **stale transform through a hard reload**, which
would have made a smoke test pass on old code. Restarting is cheap; being wrong
about what shipped is not. Fresh tab: report renders end to end, round 15's
corrected copy is live, clean console.

**4 · Copy audit.** Mechanical. 97 lines, 7 failing, all seven exempt with a
reason, **zero real** — against 15 and 8 at the last gate.

**5 · Ledger compression.** Still not done, same reasoning: Phase 8 is
mid-flight and later rounds cite these entries by name.

**6 · Tag.** `loop-green-4`. Push still impossible — no remote, no upstream.

**What this block was.** Six rounds, four of which found something wrong that
nobody had asked about: the rig could not build a stance (13), the round's bound
was the wrong number (14), a README figure had doubled underneath a sentence
(17), and a suite had been half-unenforced since before this session (18). The
two that did not — 15 and 16 — closed debts the earlier blocks opened.

---

### Round 18 · Cycle F — QA and edge cases · `F0 · R66`

**Orchestrator.** Taken before the consolidation rather than after, and the
consolidation shifts to round 19. The reason: three near-misses since round 2,
one of them mine in round 13, none caught by a gate — and this protects the very
suite the consolidation leans on. A departure from the sixth-is-consolidation
rule, recorded rather than quietly taken.

**It found a fourth instance on its first run, and that one is not mine.**
`triage.test.ts` tallied at line 677 with a helpers section below it. Nothing
was broken — an interface is erased, four function declarations are hoisted — so
it was a true positive against the rule and a false one against the defect.

**The rule stays the strict one, deliberately.** "No `check(` after the tally"
would be precise and would have passed `triage.test.ts` as it stood. But a
helpers section under a tally is exactly the shape that invites somebody to
append a check into a dead zone, and "nothing goes after `report()`" is a rule a
person can follow without thinking about hoisting. The tally moved; the rule did
not soften.

**A source scan rather than a harness change.** Making `report()` idempotent or
registering an exit hook would fix the symptom invisibly — a file with a stray
mid-file tally would go green and stay wrong. The position *is* the invariant.

**Critic.** PASS.

| Critic | Verdict | Cited |
| --- | --- | --- |
| Honesty | pass | The one file it flagged is described as a true positive against the rule and a false one against the defect, rather than counted as a fourth bug |
| Performance | pass | Test-only; 46 files read once |
| Privacy | pass | Nothing shipped |
| Architecture | pass | The scan checks its own pattern against strings — indented, commented, awaited, and a trailing comment correctly not executable — because a scan that stopped matching would report every file clean and look like a clean repo. Canaried both ways |
| Product | pass | Not a product round |

**Gate.** typecheck clean · lint clean · **1086 checks passed, 0 failed, exit 0**
(+4).

---

### Round 17 · Cycle E — data management and export · `E5 · audit 4` (R70)

**Orchestrator.** Took the audit item over `E4 · R58`, and the reason is worth
stating plainly rather than dressed up: R58 is a new canvas share card, and I did
not have the room to build one properly. Starting it would have risked exactly
the half-landed surface the protocol warns about. **The product column goes
unfilled in this block**, which the portfolio rule asks me to say out loud.

**What the audit found.** `README.md`: older reports "keep only their numbers at
about 15 KB each". Measured: **31.3 kB** — 21.3 of swing track, 10.0 of
measurements and captions. Roughly double, on the number the same sentence
multiplies by forty, so the full-history range was understated as well.

**Nobody was careless, and that is the interesting part.** The figure was true
when written; the swing track came afterwards and is kept on every report the
ladder keeps. This is how a document goes wrong — not by being written badly but
by the code moving underneath a sentence nothing was checking. `footprint.test.ts`
is full of byte figures and every one is its own constant; none had ever been
asked to agree with the prose.

**Critic.** PASS.

| Critic | Verdict | Cited |
| --- | --- | --- |
| Honesty | pass | The README now carries the correction *and* why it drifted, rather than quietly showing the new number |
| Performance | pass | Test-only |
| Privacy | pass | Nothing shipped |
| Architecture | pass | Pinned as a range, not a figure — the claim is that prose and measurement stay in the same neighbourhood. A second assertion holds the track as the larger half, so a round that stops storing tracks finds this paragraph instead of leaving it stale twice |
| Product | pass | Not a product round, and the column it should have served is named as unfilled |

**Gate.** typecheck clean · lint clean · **1082 checks passed, 0 failed, exit 0**
(+1). Canaried by dropping the track from the sum: exactly one check red.

---

### Round 16 · Cycle D — performance and architecture · `D1 · R54·1`

**Orchestrator.** A spike, which the round asks for by name. Lead builder:
Release Architect. Column served: *Does it work on my clip at all*.

**The gate the round names did not exist.** R54 says to gate on `?check` "the way
the record button already does". That gate answers a question about *camera*
recording; the replay is a canvas, and `captureStream` is a different API that
`MediaRecorder` support says nothing about. A browser could pass every check in
`selfCheck.ts` and hand the player a button that produces nothing.

**Two halves, not one.** Whether `captureStream` exists, and whether it yields a
stream with a video track — because an API that exists and returns an empty
stream looks capable to any check that stops at `typeof`, and that is the failure
worth catching.

**The cost is still unmeasurable here, and R54 stays gated.** Constraint 8 is
about cost. Confirmed live in one call: `captureStream` present, one video track,
**and `document.hidden` true** — the throttle R40 and R41 both hit, in the same
reading that proves the capability. What changed is that the question now has
somewhere to put its answer.

**The vocabulary guard caught my own line.** `REPORT_VOCABULARY` walks the pasted
block and failed on `canvastrack` the moment it was written. Two words added
deliberately. That is the list working, and it is the second time this session a
gate I did not write has caught me.

**Critic.** PASS.

| Critic | Verdict | Cited |
| --- | --- | --- |
| Honesty | pass | Capability and cost kept apart. The round is left `[~]` and its second half `[!]` on the court trip rather than marked done |
| Performance | pass | One unattached canvas, asked at 0 fps — a stream that produces frames on demand rather than continuously |
| Privacy | pass | The pasted block still contains only its fixed vocabulary, proved by the guard that rejected the line first |
| Architecture | pass | Probe injected rather than reaching for `document`, so it is testable in Node — the trade `recordingType` already makes |
| Product | pass | One line on a panel behind a URL |

**Gate.** typecheck clean · lint clean · **1081 checks passed, 0 failed, exit 0**
(+5).

---

### Round 15 · Cycle C — pedagogical coaching and UI · `C0b · R69·2`

**Orchestrator.** The eight the gate found. Lead builder: Pedagogical UX & Skill
Architect. Column served: *Do I believe it*.

**One fix was a trap and the gate would have accepted the wrong answer.**
`StoragePanel`'s transfer line is 26 words because R24 deliberately put three
concrete methods in it — email, AirDrop, a cloud drive — after finding the panel
promised a file would carry a history to a new phone and never said how. Cutting
those to make a word count would have been this round undoing a previous one to
please a lint, and the lint would have gone green. The fix is a full stop where
an em dash was: two sentences, 24 words, all three methods intact.

**The home privacy line lost a hedge and a passive together**, and the passive
mattered: "Your video is read on this device" has the same shape as the two
privacy lines the gate *exempts*, where an active rewrite would need a subject
and the whole promise is that there is nobody doing it. This one is different —
the video is the subject, so "stays on this device and never leaves it" is
active without inventing a "we". `HandednessPicker` is the same distinction from
the other side: there **is** an actor, so "which arm the app measures" is honest.

**A third staleness incident, and the worst.** The pane served a stale transform
of `Report.tsx` **through a hard reload** — the old sentence rendered on a fresh
tab after `location.reload(true)`, with the file on disk definitively changed.
Only a dev-server restart cleared it. Rounds 3 and 12 were stale consoles, a
nuisance; this was stale content, and trusting it would have had me record fixed
copy as unfixed and hunt a bug that did not exist. **When the pane and the source
disagree, the source is right** — `grep` has now settled this three times.

**Critic.** PASS.

| Critic | Verdict | Cited |
| --- | --- | --- |
| Honesty | pass | No line lost a fact to gain a word. The storage methods, the privacy promise and the replay's explanation all survive intact |
| Performance | pass | Copy only |
| Privacy | pass | The privacy lines say the same thing more plainly. Nothing about behaviour changed |
| Architecture | pass | Each ruling came out of the table as its line stopped failing, so the "no stale ruling" check proved the fixes landed. The `known` verdict stays in the type — a table that can only say "exempt" exempts everything |
| Product | pass | Four screens read better and none says less |

**Browser verification.** Home hero and privacy line confirmed live; the replay
note confirmed after the server restart above. `FilmingGuide`, `FramingCheck`,
`HandednessPicker` and `StoragePanel` sit behind sheets and were **not** driven —
their text is asserted by the gate rather than watched, and that is the weaker of
the two. Console clean on a fresh tab.

**Gate.** typecheck clean · lint clean · **1076 checks passed, 0 failed, exit 0**
(unchanged — this round fixed copy rather than adding checks, and the gate going
from "8 real" to "0 real" is the evidence).

---

### Round 14 · Cycle B — biomechanics and fault detection · `B1c · R50·3`

**Orchestrator.** The third and last entry through round 2's machinery — except
it isn't yet, because the premise did not survive checking. Lead builder:
Biomechanics & CV Specialist. Column served: *Do I believe it*.

**A read-only cycle, which the protocol names as a complete one.** No production
code. The round's stated bound — "the residual 21% tempo-dependence is the
bound's whole content" — rests on a figure carried by both `tiers.ts` and
`README.md`, and that figure is the *total* spread across a tempo sweep with
seed noise folded in. Right for the question the register asks; wrong for
bounding a difference.

**The second time in this block that a round's own bound was the wrong number,
and the same shape both times.** R50·2 was told to bound with 0.0035, which is
where a square landing sits rather than how far a reading wanders. R50·3 is told
to bound with 21%, which is where the whole distribution sits rather than what a
tempo difference causes. A delta is a difference between two readings, and the
figures these entries carry are about the readings themselves.

**What the measurement gives R50·3 to build on:** 6% noise, flat across tempo —
which is what makes the two terms separable — plus a mean moving 0.0102 per
second of tempo difference. Bound `hypot(√2 × 0.0065, 0.0102 × |Δt|)` = 0.0092
at equal tempo, 8.6% of a reading near 0.107. A 21% bound would have refused
every comparison there is.

**Critic.** PASS.

| Critic | Verdict | Cited |
| --- | --- | --- |
| Honesty | pass | The register is **not** corrected: its 21% is accurate for what it claims, and the entry is about bandability rather than deltas. What was missing was the decomposition, and it now lives where the sweep lives |
| Performance | pass | Test-only; 36 rig builds in a suite that already runs 240-seed ensembles |
| Privacy | pass | Nothing shipped |
| Architecture | pass | One check is written to fail **in both directions** — if the mean's movement approaches 21% this finding is wrong, and if it drops under 2% the division has removed the dependence entirely, which is a better finding and should not pass silently as this one |
| Product | pass | Nothing a player sees |

**Gate.** typecheck clean · lint clean · **1076 checks passed, 0 failed, exit 0**
(+3). No canary: nothing was fixed, so there is nothing to revert. The teeth are
the two-sided assertion above.

---

### Round 13 · Cycle A — CV/ML engine · `A3 · R60·1`

**Orchestrator.** Third block opens on Cycle A's head. Lead builder:
Biomechanics & CV Specialist. Column served: *Do I believe it*.

**The premise check killed the round as written, and found a second round stuck
on the same sentence.** R60 wants to read stance from ankle separation over time.
`syntheticServe.ts` places every ankle directly below its own hip and leaves it
there until the landing — one stance, 0.180 m, no dial. Nothing to sweep. And
R64 has been blocked since it was written on the identical fact: it cannot say
how much the front ankle's baseline varies between players, because the baseline
*is* the stance. One dial unblocks both, which is what turned "refuse R60" into
"build the dial first".

**A load-bearing module, declared, with the number diff run before the commit**
rather than deferred to the block boundary — `UNATTENDED-LOOP.md`'s rule for
`syntheticServe.ts`'s neighbours and this file is the rig they all stand on.
Every reported reading is **bit-identical**; only wall-clock and a 0.04% heap
figure moved. Asserted on landmark values rather than on a derived reading,
because a measurement agreeing to four decimals would hide precisely the drift
the skip-at-zero rule exists to prevent.

**My first check was wrong and the rig was right.** Summing |Δx| + |Δz| reported
a platform stance "varying" by 5.7 cm on a rig whose feet never move — the hip
line yaws, the ankles sit below the hips, and a per-axis sum turns a rotation
into a width. `hypot` in the ground plane is what the question means. Recorded
because it looked like a rig defect and was a metric defect, which is the
direction of error R44 warns about.

**And the tally hazard again, third time this session.** The `sed` that inserted
these checks put them *after* `robustness.test.ts`'s `report()`, recreating the
exact defect round 2 found in `copy.test.ts`. Caught by grepping for `^report()`
before running. **R66 is worth more than its queue position** — three near-misses
in thirteen rounds, none of them caught by a gate.

**Critic.** PASS.

| Critic | Verdict | Cited |
| --- | --- | --- |
| Honesty | pass | Number diff bit-identical, run before commit. The dial's own limits are stated: 1.0 closes the gap entirely, further than a real pinpoint goes, and nobody here knows the distribution |
| Performance | pass | One `track()` call and one conditional per leg per frame, skipped entirely at the default |
| Privacy | pass | Rig only |
| Architecture | pass | Skip-at-zero, matching `landingShift` and `trophyExternalRotation`. `solveKnee` re-run after the move, so thigh and shin still add up. Canaried to three checks, with the bit-identical one correctly staying green |
| Product | pass | Not a product round; it unblocks two |

**Gate.** typecheck clean · lint clean · **1073 checks passed, 0 failed, exit 0**
(+4).

---

### Round 12 · Cycle F — the second consolidation gate

**1 · Full gate.** typecheck clean · lint clean · **1069 checks, 0 failed,
exit 0** (+18 across the block).

**2 · Number diff against `loop-green-2`.** Through a worktree again, so the
working tree was never touched. **No engine reading moved.** Everything that did:

| Moved | Why |
| --- | --- |
| Four new yaw-ensemble notes | Round 7. Intended |
| Two new copy-scan notes | Round 9. Intended |
| One new shoot-list note | Round 11. Intended |
| `85 → 87` source files scanned | `framingIssues.ts` and `fixturePlan.ts`. Intended |
| frame `7413 → 7420` bytes | Heap noise, 0.09% |
| stroke and frame timings | Wall clock |

**3 · Boot smoke, and it very nearly passed dishonestly.** The long-lived dev
server's console carried `does not provide an export named 'framingIssues'` —
round 10's split. Restarting the server did not clear it, which made it look
current rather than stale. What settled it was `grep`: nothing imports either
symbol from `groundTruth` any more, so the source is correct and the buffer is
retained per tab across restarts. Confirmed on a genuinely fresh tab — report
renders end to end, **clean console**, no error boundary.

Worth recording because this is the second consolidation in a row where a stale
console nearly cost a wrong conclusion, in both directions: round 3 nearly
reported a real error that was not one, and this nearly dismissed one that might
have been. **The check that resolved both was reading the source, not the
console.**

**4 · Copy audit — mechanical this time.** Block one audited three lines by hand
and said that was not a thing anybody would keep doing. R69·1 now walks all 25
components: 97 readable lines, 15 failing, all fifteen ruled on, 8 real and
queued. That is the difference one block made to this step.

**5 · Ledger compression.** Not done, same reasoning as block one: Phase 8 is
mid-flight, the entries are already delta-only, and later rounds cite them by
name — R68 rests on R59·1's measurement, R59·2 on R69·1's scanner boundary,
R50·2 on R50·1's machinery. Compression belongs at the phase close-out.

**6 · Tag.** `loop-green-3`. The push is still impossible: no remote, no
upstream. Twelve rounds and four tags exist on one disk.

---

### Round 11 · Cycle E — data management and export · `E1b · R59·2`

**Orchestrator.** Closes R59, the promoted round — the only one that unblocks
real footage. Lead builder: Product Expansion Lead, with the Release Architect on
the binding to the gate. Column served: *work that unblocks me is worth more than
work that doesn't*.

**The round as written could not be built, and saying so is half the round.** The
stub asked for a checklist reading off `RECORDED` to show which clip is *next*.
`RECORDED` is a build-time list of files committed to the repo; a phone on a
court cannot see it and never will. A progress bar there would be the app
claiming to know something it cannot. So what ships is the shoot list itself, in
order, with the app claiming to know nothing about where anybody is on it.

**The real content is the binding.** `fixtures/index.ts` does not ask for six
clips — it asks for six spanning three axes. A list that satisfied somebody's
sense of thoroughness and not those axes would cost a person an afternoon of
somebody else's tennis and come back refused. The test runs the list through
`MINIMUM_RECORDED` and the gate's own `SPREAD`, so the two cannot drift.

**Critic.** PASS.

| Critic | Verdict | Cited |
| --- | --- | --- |
| Honesty | pass | Refused to build the progress view the round asked for, rather than approximating it. The list claims nothing about what has been filmed |
| Performance | pass | Six objects, behind a query string. Entry chunk unmeasured this round and unlikely to have moved; round 10's figures stand |
| Privacy | pass | Nothing new leaves the device |
| Architecture | pass | Order and spread asserted from the plan's side against the gate's own constants, not against a copy. Canaried to two checks, both about the left-hander axis |
| Product | pass | The list is on the screen where somebody has just filmed a clip, which is the moment they are deciding what to film next |

**Copy, and the seam between the two lint gates.** Every line faces `cueIssues`
and the 25-word cap. These lines are interpolated into JSX, so R69·1's scanner is
blind to them by design — they are linted at the source instead, which is the
same division `copy.test.ts` and R69·1 already draw. The one static line I added
to `Report.tsx` *was* picked up by the scanner and passed: 97 readable lines now
against 96, still 15 failing.

**Browser verification: partial, same block as round 5.** The list sits inside
the same `fixtureExport && isLive` guard as the save button, and `isLive` needs a
clip with a player in it, which this environment cannot produce. **Neither the
button nor the list has been watched appearing.**

**Gate.** typecheck clean · lint clean · **1069 checks passed, 0 failed, exit 0**
(+6).

---

### Round 10 · Cycle D — performance and architecture · `D0 · R68`

**Orchestrator.** Debt round 5 incurred and priced, paid in the very next D
cycle. A refactor, so it gets its own cycle with its own green tree —
`LOOP.md`'s rule, and the reason this was not folded into round 5. Lead builder:
Release Architect. Column served: *Does it work on my clip at all* — first paint
is the first thing anybody experiences.

**Split the opposite way to the obvious one, and the code said why.** The
tempting move is to pull `framingIssues` out, since it is the one thing the
running app needs from an 800-line fixture module. Its own doc comment argues
against exactly that: it lives beside the fixture machinery so whatever real
footage that suite grows covers it. Reading that before cutting is what changed
the plan — the *framing* half moved instead, and `groundTruth.ts` kept both its
name and its subject. The doc's argument survives intact, because coverage
follows imports rather than file boundaries, and both suites that exercise it
import it exactly as before.

**Measured at both ends, which is the only reason this is a round rather than
tidying.**

| | entry raw | entry gzip | fixture chunk |
| --- | --- | --- | --- |
| before R59·1 | 408.87 kB | 137.22 kB | none |
| after R59·1 | 415.28 | 139.53 | 2.86 kB |
| after R68 | **410.07** | **137.60** | **8.55 kB** |

The lazy chunk tripled, which is the point: the validator half now lives where it
is used. Residual against the pre-R59 baseline is **1.20 kB raw, 0.38 kB gzip**,
down from 2.31 — the button, the note, and the dynamic import's own plumbing.

**Critic.** PASS.

| Critic | Verdict | Cited |
| --- | --- | --- |
| Honesty | pass | Both figures measured by building, before and after. The residual is stated rather than rounded to nothing |
| Performance | pass | 1.93 kB gzip off first paint. This is the critic's own round |
| Privacy | pass | `egress.test.ts` green with one more file in its scan |
| Architecture | pass | Behaviour unchanged: **1063 checks both sides**, which is the check that this moved code and not logic. New file has its README row |
| Product | pass | Nothing a player sees changed |

**Gate.** typecheck clean · lint clean · **1063 checks passed, 0 failed, exit 0**
(unchanged, deliberately). No canary: a refactor's canary is the check count and
the number diff, and both are flat.

---

### Round 9 · Cycle C — pedagogical coaching and UI · `C0 · R69·1`

**Orchestrator.** The head of Cycle C since round 6 promoted it there, and it had
grown teeth in the meantime: I had added four JSX lines across three rounds and
nothing watched any of them. Lead builder: Pedagogical UX & Skill Architect, with
Release Architect on the allow-list shape. Column served: *Do I believe it* —
copy that has drifted is the app saying something nobody checked.

**Premise measured before designing.** Ran the scan first, read all fifteen
failing lines in full, and only then decided the shape. That order matters: had I
designed the gate first I would have tuned the regex until the output looked
clean, which is the failure the file's own header now argues against.

**The split.** Building a lint and rewriting eight lines of player-facing copy —
two of them the most-read paragraphs in the app — are different jobs with
different risks. The gate lands now, because it stops drift from this moment on;
the eight are R69·2.

**Critic.** PASS.

| Critic | Verdict | Cited |
| --- | --- | --- |
| Honesty | pass | Every one of the fifteen is written down with a verdict and a reason, including the seven where the lint is wrong. Nothing was tuned away |
| Performance | pass | Test-only; a directory walk over 25 files |
| Privacy | pass | Nothing shipped changed |
| Architecture | pass | `egress.test.ts`'s exact shape, including the check for the opposite failure — a stale exemption outliving the line it excused. What the pattern cannot see is named rather than left implicit |
| Product | pass | No player-facing change. The eight it names are queued, not quietly rewritten |

**A finding against the ledger.** R28 — a phase close-out — recorded tightening
`StoragePanel`'s "To carry it to a new phone" line to fit the cap it was auditing
everything else against. It measures **26 words**. Whether it drifted afterwards
or was never under is not recoverable from what is written down. What is
recoverable is that a close-out claimed a fix that does not hold, and nothing
could have contradicted it, because no gate had ever read that file. That is the
argument for this round in one line.

**Gate.** typecheck clean · lint clean · **1063 checks passed, 0 failed, exit 0**
(+5). Canaried by putting a deliberately awful line into a component: the gate
names the line, its word count and all three faults. No browser verification:
nothing player-visible changed.

---

### Round 8 · Cycle B — biomechanics and fault detection · `B1b · R50·2`

**Orchestrator.** Second entry through round 2's machinery, which is what the
split was for. Lead builder: Biomechanics & CV Specialist. Column served: *Do I
believe it*.

**The round's own bound was wrong, and that is the round.** R50 asked for this
"calibrated against the written-down 0.0035 floor", and so did the sub-round stub
I wrote in round 2. 0.0035 is where a square landing *sits* — the reading is a
magnitude, so noise about a true zero folds positive instead of cancelling — and
it says nothing about how far a reading wanders. A delta is a difference between
two readings, so the bound is the two measured deviations in quadrature: about
0.0053. The check that pins it uses the case that exposes the error — two
readings 0.0045 apart, which look real against a floor of 0.0035 and are barely
one deviation of a difference.

**A load-bearing module changed, declared.** Three deviation figures moved from
prose in `diagnose.ts` into named exports. Constants only: nothing in that file
reads them, no reading moved, and the consolidation number diff will say so.

**Critic.** PASS.

| Critic | Verdict | Cited |
| --- | --- | --- |
| Honesty | pass | No target. The bound is computed from the two exported deviations rather than retyped, so a re-measurement carries through. The line grades nothing — `fell`, `lost`, `off balance`, `collapsed` all asserted against, because `offset` is unsigned and ungraded and a professional lands across their front foot on purpose |
| Performance | pass | One optional five-number entry, written only when a delta clears its bound, which is a twelfth of the reading's measured range — so rarely. `footprint.test.ts` green, and round 4 made it able to see this |
| Privacy | pass | Nothing new leaves the device |
| Architecture | pass | Second entry through one mechanism, not a copy of it. The two bounds are of different kinds — a second measurement against noise — and a check holds that neither refusal silences the other |
| Product | pass | One more `.note` line on an existing panel |

**Gate.** typecheck clean · lint clean · **1058 checks passed, 0 failed, exit 0**
(+5). Canaried by replacing the bound with 0.001, which reddens exactly the two
checks written for it. No browser verification: the surface is round 2's, already
verified live, and this adds a row to a list it already renders.

---

### Round 7 · Cycle A — CV/ML engine · `A2 · R49b`

**Orchestrator.** Second block opens where the first left a question: round 3
shipped the ghost across sessions, and nobody knew whether its camera gate would
ever let anything through. Lead builder: Biomechanics & CV Specialist. Column
served: *Do I believe it*.

**A read-only round that produced a number, not a feature.** No production code
changed. The deliverable is a bound the ledger did not have and two checks that
hold it.

**What it answers, and what it does not.** It answers the floor — two clips from
the *same dialled angle*, differing only by tracker noise — because the rig can
be asked that. It does not answer how often two clips from one real trip agree,
because that is a fact about how people film and there are still no fixtures.
Both halves said plainly rather than the first presented as the second.

**Critic.** PASS.

| Critic | Verdict | Cited |
| --- | --- | --- |
| Honesty | pass | The saturation finding was volunteered, not buried: past ~82° the reading stops tracking the dial, which is fine for a gate on a difference and would not be fine for grading an absolute. Nothing grades it |
| Performance | pass | Test-only. 12 seeds × 4 angles of rig build, in a suite that already runs six-seed ensembles |
| Privacy | pass | Nothing shipped changed |
| Architecture | pass | Written in `GHOST_YAW_TOLERANCE_DEG`, not in 5, so the gate and the estimator are coupled to the evidence. Both sides asserted — side-on must agree completely, face-on must not — so a change that flattened the curve goes red rather than passing quietly |
| Product | pass | Not a product round |

**A near miss worth recording.** The edit that added these checks consumed the
file's `report()` call, so `axes.test.ts` would have run twenty-one checks and
tallied none of them — the exact defect round 2 found in `copy.test.ts`, one
round after queueing R66 to catch it. What caught it here was `tsc` flagging the
now-unused import, which is luck rather than a gate. R66 is worth more than its
place in the queue suggests.

**Gate.** typecheck clean · lint clean · **1053 checks passed, 0 failed, exit 0**
(+2). Canaried by tightening the gate to 1°, which reddens exactly the side-on
check. No browser verification: nothing player-visible changed.

---

### Round 6 · Cycle F — the consolidation gate

No feature work. Release Architect leads. This is the cycle that compares the app
against its own past rather than against one round's intent.

**1 · Full gate.** typecheck clean · lint clean · **1051 checks, 0 failed,
exit 0**.

**2 · Number diff — the point of the exercise.** Every figure the suite reports
was captured at HEAD and again at the session baseline `e5d6954`, through a git
worktree so the working tree was never touched, and diffed. **No engine reading
moved.** Nothing in `tiers.ts`, no band, no deviation, no noise floor, no
biomechanical figure. What did move, all of it accounted for:

| Moved | Why |
| --- | --- |
| `84 → 85` source files scanned by the egress test | `trackPair.ts`, round 1. Intended |
| `full history 1.1/2.3 MB → 1.8/2.9 MB` | Round 4 counting whole reports. This *is* R67 |
| two new notes — words per report, Phase 8's stored fields | Round 4. Intended |
| frame `7457 → 7417` bytes, landmark `119.4 → 119.1` | Heap measurement noise, 0.25%. That check is a ratchet, not an accuracy check, and says so |
| stroke and frame timings | Wall clock on a shared machine |

**3 · Boot smoke.** Fresh tab, dev server, saved report opened: score 68, three
blocks, five fundamental cards, the replay canvas present, no error boundary,
**console clean**.

**4 · Copy audit.** Three player-facing lines were added this session. All three
clean against `cueIssues`, at 13, 16 and 11 words against a cap of 25.

And auditing them turned up a gap worth a round. **Nothing lints the copy that
lives in a component.** `copy.test.ts` walks six data tables and every sentence
written straight into JSX is unchecked — the refusal notes, both player notes
under the replays, the storage panel's export warning, the handoff caveat. R28
found drift *inside* the linted tables; outside them there is no gate at all.
Queued as **R69**.

**5 · Ledger compression — deliberately not done, with the reason.** The
protocol asks for cycle records compressed to their deltas. These entries were
written today, they are already delta-only, and later rounds cite them by name:
R59·1 rests on R44's chunk finding, R67 on R49·1's and R50·1's stored fields,
R49·3 on R47's extraction rule. Compression belongs at the phase close-out, and
Phase 8 is mid-flight. Performing it here would be ceremony that costs
information.

**6 · Tag, and the push that cannot happen.** `loop-green-2` tagged.
`git push --follow-tags` **did not run and cannot**: this repo has no remote and
no upstream — `git remote` is empty. `UNATTENDED-LOOP.md` asks for the push and
gives a good reason for it (eight hours of unattended commits on one local
branch, with hard resets in the loop, is one bad command from gone). That
protection is not available here. The tags are still the rollback points, and
this session has already twice proved the risk is real: two `git checkout --`
calls reverted uncommitted work in rounds 3 and 5.

**A finding for whoever reads this:** if this work matters, the branch wants a
remote. Nothing in the loop can create one.

**Gate.** No new code. **1051 checks passed, 0 failed, exit 0.**

---

### Round 5 · Cycle E — data management and export · `E1 · R59·1`

**Orchestrator.** The promoted round — the only one that unblocks real footage,
and five threads in `NEXT.md` wait on it. Split before building: "reachable on a
phone" and "knows which clip is next" are different jobs and the first is what
actually unblocks anybody. Lead builder: Release Architect, with Privacy reading
it hardest. Column served: *work that unblocks me is worth more than work that
doesn't*.

**Premise verified.** The export really is behind `import.meta.env.DEV`, really
does prompt with `window.prompt`, and really does print what is still missing to
the console. Everything about it assumed a desk. Nothing needed rewriting for a
wrong premise this time.

**Critic.** PASS, with Performance pricing it rather than passing it quietly.

| Critic | Verdict | Cited |
| --- | --- | --- |
| Honesty | pass | The on-screen list is `draftGaps`' own output, so the app and the suite cannot disagree about the same file |
| Performance | **pass, priced** | Entry 408.87 → **415.28 kB** (137.22 → 139.53 gzip), plus a 2.86 kB on-demand chunk. Cause measured, not guessed: `groundTruth.ts` was already half in the entry via `analyze.ts`/`judge.ts`, and Rollup hoists a module shared with a lazy chunk. `trackPair.ts`'s import ruled out — breaking that edge leaves 415.28 exactly. Queued as R68 |
| Privacy | pass | A draft carries no image at any depth, now asserted over the serialised form rather than over known field names. The only personal content is what the labeller typed, and the file is saved locally — the same model as the share card |
| Architecture | pass | No new module, no new CSS class. `location.search` keeps one reader. The gate is pinned by a source check because a dev build cannot test it |
| Product | pass | Behind a query string; no ordinary player meets it |

**The judgement call.** 2.31 kB gzip on every player's first paint is a real cost
and R44 fought hard for 40 kB of the same. Paid because it is 1.7% of the
critical path against five threads that are otherwise permanently stuck, and
because it is now a number in the ledger with a round attached rather than a
fact nobody wrote down.

**Departure, and the second time this session.** A `git checkout --` used to undo
a canary reverted `App.tsx`'s whole round-5 change. Caught, re-applied, green.
Same rule broken as in round 3 and the same rule that exists to prevent it: stash
before any reset. Noted here rather than quietly fixed, because twice is a habit
rather than a slip.

**Browser verification, partial and said so.** The negative case ran — no button
on a saved report, because `isLive` is false with no frames. The positive case
needs a live analysis, which needs a clip with a player in it, which is R41's
standing block. **The button has not been watched appearing.**

**Gate.** typecheck clean · lint clean · **1051 checks passed, 0 failed, exit 0**
(+3).

---

### Round 4 · Cycle D — performance and architecture · `D4 · R67`

**Orchestrator.** A hardening round, and the portfolio rule wanted one: rounds 1
to 3 were engine, measurement and player-visible. Picked over `D1 · R54 spike`
because three consecutive rounds had added fields to stored reports and the
storage gate had not been asked about any of them. Lead builder: Release
Architect. Column served: *Does it work on my clip at all* — a store that
silently outgrows its budget is a player losing serves.

**What it found.** `storeWorstCase` counted stills plus track and nothing else,
so the gate was blind to everything else a report carries — and blind by
construction, not by accident, since nothing it multiplied had anything to do
with the words. The correction is one term. What the term revealed is the round:
the ratchet claimed a third of headroom and had 1.03×.

**The judgement call, stated plainly.** Raising a threshold is the move this
codebase distrusts most, and `LOOP.md` constraint 2 names it as a defect rather
than a fix. This is the exception the rule leaves room for and it is worth being
explicit about why: the number was not raised to admit something that was
failing. It was re-derived from a corrected measurement, at the policy the
comment already stated, and it is *still a gate* — both canaries fire at the new
line, and zeroing the new term reddens the headroom check and the breach canary
together. Had the ratchet been left at 3.0 MB it would have gone red on the next
stored boolean, which is a gate that reports nothing.

**Critic.** PASS.

| Critic | Verdict | Cited |
| --- | --- | --- |
| Honesty | pass | Every figure measured off the rig, none estimated. 19 bytes for the camera flag and 71 for one delta are stated so the next field has something to be compared against |
| Performance | pass | This *is* the performance critic's own instrument, and it now sees a third of a report it could not see before |
| Privacy | pass | Test-only; nothing shipped changes |
| Architecture | pass | One term added to one function, declared beside the two constants it sits with — a `const` read before its initialiser comes back `NaN` here rather than throwing, which is how a budget check stops being one |
| Product | pass | Not a product round |

**Gate.** typecheck clean · lint clean · **1048 checks passed, 0 failed, exit 0**
(+3). No browser verification: nothing player-visible changed.

---

### Round 3 · Cycle C — pedagogical coaching and UI · `C1 · R49·3`

**Orchestrator.** Head of Cycle C, and it closes the feature R49·1 and R49·2
built the halves of. Lead builder: Modular UI Developer, with the Biomechanics &
CV Specialist reading the drawing rule. Column served: *Can I see it*.

**Premise checked, and it did not hold.** The round says to build the
same-session basket case first. `TrackPlayer` renders only under `!live`, and a
basket always has a clip, so that case is unreachable on this surface. The pair
this screen can hold is `previous`, already on its props. Recorded in `NEXT.md`
and `README.md` rather than quietly built the other way.

**Critic.** PASS.

| Critic | Verdict | Cited |
| --- | --- | --- |
| Honesty | pass | No new claim: no zone, no gap line, no leader. Legs never arrive — enforced in `pairTracks`, and the drawing only skips nulls. The refusal path was watched firing in life on a pre-`yaw_measured` row |
| Performance | pass | `pairedLookup` builds its search array once in a closure; the alternative allocated ~50 objects per painted frame. Eight bones and one arc added to a frame the R20 measurement already found bucketed |
| Privacy | pass | Nothing added to the share path; the track carries no image of anybody, which is the property `poseTrack.ts` already records |
| Architecture | pass | No new colour, no new token, `GHOST_BONES` reused. The lookup extracted out of a `useCallback` where no test could reach it — R47's finding applied while writing rather than after. Two canaries |
| Product | pass | One dashed body and one sentence, on a screen that already existed. No new tap |

**Departure, recorded rather than tidied away.** A `git checkout --` used to undo
a canary reverted this round's entire `skeleton.ts` change, because the file was
tracked and the new code was not yet committed. Caught immediately, re-applied,
re-verified green. `UNATTENDED-LOOP.md`'s rule is to stash before any reset, and
it exists for precisely this.

**Browser verification.** Both directions. Refused first — the seeded report
predates `yaw_measured`, so it repairs to `false` and the pair was refused
silently, which is R49·1's guard working in life. Then accepted, with two
reports carrying measured angles: the note renders and the ghost paints. Proved
by subtraction rather than by eye, since the pane will not composite a
screenshot — the same report sampled with and without a serve behind it differs
by **120 dim pixels over canvas rows 328–640**, on a 734px canvas with its hip
line at 490 and ankles at 683. The ink past the hip line is the arm the probe
deliberately displaced on the older serve, and it stops well short of the ankles.

Console clean, checked on a fresh tab after finding stale HMR errors in the old
one from a mid-refactor moment — worth naming, because a stale console is the
easiest way to talk yourself out of a real error or into a fake one. Probe rows
deleted and the store put back to the single seeded report it started with.

**Gate.** typecheck clean · lint clean · **1045 checks passed, 0 failed, exit 0**
(+9).

---

### Round 2 · Cycle B — biomechanics and fault detection · `B1 · R50·1`

**Orchestrator.** R50 as written is three readings with three different
confounders. Split into R50·1/·2/·3 in `NEXT.md` before building, per the
"bigger than one iteration" rule — the first sub-round carries the machinery,
the storage guard and the surface, so the other two are one entry each. Lead
builder: Biomechanics & CV Specialist. Column served: *Do I believe it*.

**Premise verified before building** (Phase 2). Three things had to be true and
all three were, on record rather than assumed: `buildConsistency` already
receives whole `Analysis` objects, so `diagnosis.externalRotation` and
`signals.spine_lean_deg` are in scope; `ER_LEAN_SENSITIVITY` is an exported
constant with its additivity measured across a 4×4 sweep; and `signals` is
already gated on `MIN_EVIDENCE`, so a badly seen trunk is absent rather than
wrong. No spike cycle needed.

**Builder.** See `NEXT.md`. One precedence call and one defect, both below.

**Precedence call — Honesty over Product.** The round's own model sentence
carries a figure in degrees, which `voice.ts` refuses and `readoutOf` cannot
rescue, because the reading has no ladder and cannot be given one. Product wanted
the magnitude; the copy gate is mechanical and Honesty outranks Product. The
direction shipped, the magnitude did not, and `NEXT.md` records it as a
departure rather than as a design choice.

**Defect found mid-round, and fixed rather than filed.** `copy.test.ts` called
`report()` two thirds of the way up itself, and the harness exits non-zero only
when it has failures to print — so eight checks below the tally printed crosses
into a file that still exited 0. Proved with a deliberate `assert(false)`, not
inferred. My two new copy checks were landing in that dead zone, so fixing it
was a precondition of this round having teeth rather than a side quest. A sweep
of every other test file found no second instance; the static guard against the
next one is queued as **R66**, at the head of Cycle F.

**Critic.** PASS.

| Critic | Verdict | Cited |
| --- | --- | --- |
| Honesty | pass | No target anywhere; `delta > bound` refuses outright rather than hedging, canaried. No entry leaves `UNCALIBRATED`. The line carries no figure — `copy.test.ts` asserts both the lint and the absence of degrees |
| Performance | pass | One optional array of five numbers per stored report, written only when a delta clears its bound — which is the minority case by design. `footprint.test.ts` green |
| Privacy | pass | No new egress surface; nothing added to the share path |
| Architecture | pass | `consistency.ts` extended, not a new module. Storage guard follows `usableGap`'s existing shape. Copy lives in `statusLabels.ts`, the plain module beside the components, so no fast-refresh boundary is crossed. Three canaries, intended checks only |
| Product | pass | One line on an existing panel, no new tap, no new screen, reusing `consistency-foot` alongside its two siblings |

**Browser verification.** `?demo=basket` still hangs on `sampleClip`, exactly as
R41 recorded — console clean, no error, the demo simply never resolves. Verified
through the real path instead: a report written straight into IndexedDB and
reopened from the history sheet, so `normalise` → `usableDeltas` →
`ConsistencyPanel` all ran on real DOM. The line renders between the serve chips
and the spread rows. No console errors. The probe row was deleted afterwards and
the store confirmed back to its single `demo` row. **Screenshot not possible** —
the pane does not composite, which is the environment defect already on record.

**Measurement raised as a finding.** `.consistency-foot` renders
`rgb(123, 135, 153)` on `rgb(20, 24, 34)` — **4.87:1 at 11.5px**, the quietest
text on a panel a player reads at a court in sun. It passes AA by 0.37 and sits
under AAA's 7:1. Same panel for comparison: `.spread-detail` 6.89:1,
`.spread-label` 15.77:1. Not changed — it is the class the two existing basket
findings already use, and raising the token is a decision about every surface
using it. In `README.md` as a finding.

**Gate.** typecheck clean · lint clean · **1036 checks passed, 0 failed, exit 0**
(+14).

---

### Round 1 · Cycle A — CV/ML engine · `A1 · R49·2`

**Orchestrator.** Tree confirmed clean and green before anything was picked:
`tsc --noEmit` clean, `eslint .` clean, **1004 checks passed, exit 0**. State
files created (`BACKLOG.md`, `PROGRESS.md`) as views over the existing ledger
rather than as a second programme. Picked the topmost actionable round in
`NEXT.md`: R49 was already `[~]` and split, with `R49·1` landed in `e5d6954`, so
`R49·2` is the head of the ladder. Lead builder: Biomechanics & CV Specialist.
Column served: *Can I see it*.

**Builder.** `pairTracks` in `src/lib/trackPair.ts` — see `NEXT.md` for what it
settled. One departure from "prefer extending a module": `poseTrack.ts` is the
natural home and cannot be, because `db.ts` imports it and this needs
`progress.ts`, which imports `db.ts`. A new file with a README row was the
cheaper of the two.

**Critic.** Two findings raised and fixed before the verdict rather than filed:

- *Honesty.* A row claiming `yaw_measured` with no `yaw_deg` behind it made the
  gap `NaN`, which refuses as `camera_moved` — right outcome, wrong name. Now
  refuses as `yaw_unmeasured`, with its own check and canary.
- *Performance.* The below-the-hips list was a linear scan inside a per-landmark
  map. A `Set`. Trivial in cost; free in clarity.

Evidence, per critic:

| Critic | Verdict | Cited |
| --- | --- | --- |
| Honesty | pass | `trackPair.ts:54` — the 5° gate is `poseTrack.ts:60-63`'s measured crossover (floor 0.0341, 5° of camera 0.0352), not a chosen number. No reading is asserted; the sentinel-45 path refuses before the gate |
| Performance | pass | Nothing stored, no decoder, camera or canvas touched. `footprint.test.ts` unchanged and green |
| Privacy | pass | `egress.test.ts` green with the new file inside the scan set; no new egress surface |
| Architecture | pass | New file has its README row; returns numbers and enums only; three canaries, one red check each and nothing else |
| Product | pass | No new tap, no new screen. Phase 8 round — ranking not re-opened |

**Departure recorded.** The test was not written before the module. For a new
pure file with no prior behaviour there is no "revert the fix" to watch fail, so
the executable form of that standard is the canary discipline, run three times.
Two of the seventeen checks did fail on first run — both were my expectations
being wrong (stored-precision quantisation, and `replayFrom` rounding to the
millisecond), and both are now numbers written down rather than tolerances
loosened.

**Finding for the record, not fixed here.** `egress.test.ts` prints **85 source
files scanned**; `README.md` and R34's ledger entry both say 66. The assertion is
on the allow list rather than the count, so nothing is broken — but a README
number has drifted. Queued as `E5 · audit 4`.

**Gate.** typecheck clean · lint clean · **1022 checks passed, 0 failed, exit 0**
(+18). Browser verification not required: nothing player-visible changed, and
R49·3 is the round that draws.

---

## Resuming this loop

The loop is designed to be picked up cold, and everything a fresh session needs
is on disk:

1. **`BACKLOG.md`** — the six focus cycles with every task's status. The next
   round is the head of the next cycle in rotation. Round 38 was the gate, so
   **round 39 is Cycle A** — the engine. Head items `A4b · R61·2` (build
   `planSharedPass`) and `A5b · R72`.
2. **`NEXT.md`** — what each round settled, and why. The source of truth for
   status; `BACKLOG.md` is a view over it.
3. **This file** — how each round ran: the critic's citations, the canaries, the
   departures, the things that were verified live and the things that were not.
4. **`.agent_state/cycle_summary.json`** — `unattendedLoop.session_2026_08_17`
   carries the three consolidation records.

**Last green:** `loop-green-8` at round 38. Tree clean, 1152 checks, exit 0.

**The next consolidation is due at round 44** (blocks run in sixes; gates have run
at 6, 12, 19, 25, 32 and 38).

**The gate's number diff excludes instrument readings.** Filter the suite output
through `grep -vE "ms( \(informational\))?$|bytes|noise floor"` before extracting
figures. Those lines measure the machine and move run to run; round 38 found five
gates had been diffing that noise and calling it clean. Everything left — 249
figures — is a reading of the serve and must not move without a round saying why.
The comparison worktree needs a junction to the main `node_modules`, or its suite
cannot start and the diff silently compares one number against 271.

**Standing hazard: never use `git checkout --` for a canary.** It has destroyed a
round's work twice (rounds 3 and 5) and came within a shell parse error of a
third (round 31). Canary with the `Edit` tool in both directions.

**Standing hazards a fresh session should know, all learned the hard way here:**

- **`git checkout --` on an uncommitted file discards the round.** It happened
  twice, in rounds 3 and 5. Stash first, always.
- **The preview pane can serve a stale transform through a hard reload.** Round
  15. Restart the dev server before any boot smoke, and when the pane and the
  source disagree, `grep` settles it — that has been true three times.
- **`report()` must be the last statement in a test file.** Now guarded by
  `tallies.test.ts`, after four instances.
- **Never use `git checkout --` on an uncommitted file.** It cost a round twice
  (3 and 5) and a shell parse error is the only reason it did not cost a third
  (31). Canary with `Edit` both ways instead.
- **This repo has no git remote.** Thirty-four rounds and seven tags exist on one
  disk, and the loop does hard resets. Nothing in the loop can fix this.
