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
   round is the head of the next cycle in rotation. Rounds 1–21 ran
   A·B·C·D·E·F; round 21 was Cycle B, so **round 22 is Cycle C**, head item
   `C2 · R53`.
2. **`NEXT.md`** — what each round settled, and why. The source of truth for
   status; `BACKLOG.md` is a view over it.
3. **This file** — how each round ran: the critic's citations, the canaries, the
   departures, the things that were verified live and the things that were not.
4. **`.agent_state/cycle_summary.json`** — `unattendedLoop.session_2026_08_17`
   carries the three consolidation records.

**Last green:** `loop-green-4`, plus rounds 20 and 21 on top of it. Tree clean,
1099 checks, exit 0.

**The next consolidation is due at round 25** (blocks run in sixes; the third
gate ran at 19 after a one-round shift).

**Standing hazards a fresh session should know, all learned the hard way here:**

- **`git checkout --` on an uncommitted file discards the round.** It happened
  twice, in rounds 3 and 5. Stash first, always.
- **The preview pane can serve a stale transform through a hard reload.** Round
  15. Restart the dev server before any boot smoke, and when the pane and the
  source disagree, `grep` settles it — that has been true three times.
- **`report()` must be the last statement in a test file.** Now guarded by
  `tallies.test.ts`, after four instances.
- **This repo has no git remote.** Twenty-one rounds and five tags exist on one
  disk, and the loop does hard resets. Nothing in the loop can fix this.
