Run unattended development on Serve Coach for six to eight hours, refining and
expanding the app. Repo: `C:\Users\roger\OneDrive\Desktop\serve coach`, branch
`loop/top-ten`. You are the whole team. Make every architectural, code, product
and design decision yourself, resolve your own disagreements by the precedence
order below, and do not wait for me. I am not available.

Expect fifteen to thirty cycles. Do not plan a programme that needs sixty.

## Before the first cycle only

1. Read `LOOP.md` in full. Its eight governing constraints outrank everything in
   this prompt, including every role below. Where they disagree, `LOOP.md` wins
   and you record the conflict.
2. Read `README.md` in full. It is the design record and it is accurate.
3. Read `PHASE-8.md` in full. It is the work.
4. Read `.agent_state/cycle_summary.json` and `.agent_state/feature_backlog.json`.
   These are the real state files — 119 cycles of history. Do not create
   `backlog.json` or `state.json`; they have never existed.
5. **Revoke the standing override.**
   `cycle_summary.json.unattendedLoop.authorizedBy` records a 2026-08-15
   authorization to override the design freeze and the copy voice rules. It is
   withdrawn. Overwrite it with `"revoked 2026-08-17 — design freeze and copy
   voice are back in force"`. A cycle that cannot be done without a new colour, a
   restyle, or a line over twenty-five words is blocked, not authorized.
6. Confirm clean and green: `git status --porcelain` empty, then
   `npm run typecheck && npm run lint && npm test`. Record HEAD as LAST_GREEN and
   tag it `loop-green-0`. Do not start on a dirty or red tree — stop and report.

---

# Who this is for, and what balance means

The player opens this twice a month, films one serve on a phone propped against a
fence, and wants to know one true thing they can fix. Everything below is ranked
against that person, not against the codebase.

Four questions decide whether they come back. Every cycle serves exactly one, and
the portfolio rule keeps you from draining a single column:

| Column | The question | Where it lives |
| --- | --- | --- |
| **Does it work on my clip at all** | How often does the app refuse, or quietly under-resolve, on footage a real person shot? | Refusal paths, confidence collapse, R44b, R55, audit items 1–2 |
| **Do I believe it** | Is the fault it names the fault a coach would name, on a clip that is not clean? | R46, R47, R48, R56, R57, the noise suite |
| **Can I see it** | Can I look at the thing it is telling me, rather than read a number? | R45, R50, R54 |
| **Is it worth opening again** | Does this give somebody a reason to come back on Thursday? | R49, R52, R53 |

The first column is the one nobody builds and the one that loses users. A player
whose first clip is refused does not file a bug — they delete the app. It is also
the column with the least written down, which is why two of its items sit in the
audit rotation rather than in Phase 8.

**Work that unblocks me is worth more than work that doesn't.** You have eight
hours; I have a phone. `R55` makes the fixture shoot something a person can do
without reading the repo, and the fixture shoot is what unblocks
`groundTruth.ts`, hip–shoulder separation, shoulder tilt,
`UNDER_RESOLVED.pronation_deg` and `chain_span_ratio` — everything the engine
currently cannot check against reality. **Promote R55 to the front of the
R49–R53 band**, ahead of its `PHASE-8.md` rank, on that basis. Record the
promotion and the reason.

---

# The builders

Five perspectives. Every round has **one lead builder**, named in the cycle
record, who decides how it is built. The other four read it before it commits.
Rotate: if one builder has led three cycles running, the next round goes to
another unless the ladder leaves no choice. Eight hours led by a single
perspective produces an app with one good side.

**Product Expansion Lead.** Owns value to somebody holding a racket — R49, R52,
R53, R54. Value here is *derived, not imagined*: it comes from a measurement the
engine already produces reliably, surfaced where a player will meet it. This
builder does not get to want a feature the engine cannot stand behind.

**Biomechanics & CV Specialist.** Owns joint-angle extraction, kinetic-chain
timing and the frame budget — R44b, R46, R47, R48, R56, R57. Builds **load and
strain descriptors carried with their confidence**, never injury prediction: this
app sees one camera with collapsed depth, `strain.ts` describes what the body
did, and a pathomechanical risk model would be both unmeasurable here and a
health claim shipped unattended. That is the one part of this brief rewritten
rather than followed; the rest of the role stands, and it holds the most rounds.

**Pedagogical UX & Skill Architect.** Owns the translation from pose data to a
cue a player can act on, the milestones that mark progress, and the copy on
everything. On gamification, follow the rule this codebase already derived twice:
**a milestone may be earned only by evidence the app measured, never by a tap.**
`tripStreak` is legitimate — a trip is evidenced by a clip. `PracticeCard`'s
drill button deliberately awards nothing, because a tap-producible reward would
poison `findPracticeFocus`'s own evidence, and `sixWeekMilestone` reports a
regression exactly as plainly as an improvement, because a milestone that only
speaks on good news is the same lie sanded smooth. Build milestones that pass
that test; do not build ones that don't.

**Modular UI Developer.** Owns decoupled components assembled from
`src/components/primitives.tsx` and `src/styles/tokens.css`. Outdoor legibility
is real — this app is opened at a court in sun — and it is **measurable**, so
treat it that way: measure the contrast ratio of the tokens a new surface uses,
choose the highest-contrast existing token that fits, record the number. You may
not retune a token, invent a colour, or modernise anything; two complete
redesigns were built and both rejected. If measurement shows an existing token
fails at outdoor luminance, that is a **finding for me** in the cycle record and
the README, not a change you make. Run the accessibility check on changed files.

**Release Architect.** Owns the ledger, the state files, the README, the split
protocol, the consolidation gate and the pushes. Does **not** manage feature
flags: there is no flag system, `LOOP.md` forbids leaving half-built code behind
one, and the risk of the instruction is that an unattended agent builds the
framework to have something to manage. The equivalent discipline is the split
protocol, and enforcing it against the other four is this builder's job.

---

# The critics

Every slice passes all five before it commits. Two rules keep this adversarial
rather than ceremonial:

**A veto must cite a file:line or a number.** A critic producing only a verdict
has not run — record it "not assessed", never "pass".

**Each critic may veto only inside its own scope.** A critic that can re-litigate
anything will stall an unattended loop by hour three.

Mechanical gates run first and are not opinions. Red is a veto no narration
overrides:

```bash
npm run typecheck && npm run lint && npm test
```

That suite already holds three critics in executable form — the privacy gate
(`src/lib/__tests__/egress.test.ts`, a static source scan), the storage-cost gate
(`footprint.test.ts`) and the copy gate
(`src/lib/analysis/__tests__/copy.test.ts`).

**1 · Biomechanical Safety & Honesty.** Vetoes a reading asserted past its
confidence; **an uncalibrated number given a target**; injury prediction or
clinical framing; a coaching cue naming a cause the diagnosis did not detect; a
threshold lowered to admit more clips. Phase 8 concentrates this risk — R46, R47
and R57 all ship into `UNCALIBRATED`, where the rule is absolute: *a delta
between two of the player's own serves is a fact; the same number against a
target is four invented numbers.* R57 ships in body heights per second, never mph
— mph is a claim about a court distance nobody surveyed. Cites the `tiers.ts`
band, the confidence field, or the `UNCALIBRATED` entry. May not veto scope, cost
or product value.

**2 · Performance.** Vetoes unbounded retention; a decoder, camera stream or
canvas touched without measurement; growth in the stored byte cost of a report.
**May not veto on frame rate** — nothing in the gate measures FPS, so a claim in
either direction is invented. R50 is the sharp case, a canvas recorder on a warm
phone, and it gates on what `?check` reports about this browser, the way the
record button already does. Cites a `src/dev/leakProbe.ts` number, a
`footprint.test.ts` assertion, or a `?check` reading.

**3 · Privacy & Security.** Vetoes any network call after load, any telemetry,
any processing off-device. `egress.test.ts` catches the static case; this
critic's judgement is for **new egress surfaces** — share paths and file exports
— where the rule is that the player saves a file and decides what happens to it.
R55 makes the fixture export first-class and needs this critic most. Cites the
egress scan, or the new surface and who initiates it.

**4 · Code Quality & Architecture.** Vetoes a round that should have been split
and was not; a fix written before the test that fails without it; a test without
teeth; a new file with no row in the README file table; coupling that puts a
sentence in the diagnosis path, which returns numbers, booleans and enums only.
R51's migration is the one that can silently break history — every stored report
predates profiles and must land under one default player with no prompt, proved
by a test that loads a pre-profiles record. Cites the file, or the missing test.

**5 · Product & Utility.** Vetoes a **derived** round that fails the four-part
standard; a second screen where a line would do; a flow that adds a tap without
adding a reading. **May not veto a Phase 8 round for being low-impact** — that
ranking was made by reading the engine, and re-opening it is how an autonomous
loop talks itself out of the work. Cites the missing derivation, or the tap count.

**When critics disagree**, resolve by precedence, never by asking me:
**Honesty > Privacy > Performance > Architecture > Product.** A surface Product
wants and Honesty says cannot be stated does not ship. A measurement Performance
cannot afford does not ship even if Honesty is satisfied. Record the call.

---

# The work

## Cycle 1 is activation, not a feature

`PHASE-8.md` says of itself: "Not yet part of the programme. `NEXT.md` is the
ledger; this is a proposal for what goes in it next. Append it there to
activate." Nobody has. Release Architect leads.

- Append R44b–R58 to `NEXT.md` as Phase 8, preserving each round's named files
  and named forbidden claims. R44 is already `[x]`; carry it across as done.
  Apply the R55 promotion and record it.
- **Reconcile the six `next` backlog items first**, because several are the same
  work under other names: `track-ghost-compare` is R45, `er-delta-on-the-glance`
  and `trunk-lead-delta-same-spot` sit inside R46, and
  `ghost-yaw-agreement-in-life` is the open question R45 names and defers. Merge
  each into its round and leave a pointer.
  `landing-front-ankle-after-fixtures` stays blocked behind R55.
- Commit alone. Its value is that every later cycle reads one ledger, not three.

## The portfolio rule

Within every block of six cycles: **at least one player-visible round, at least
one engine or measurement round, at least one hardening cycle** (a pinned claim,
a defect found by audit, a test given teeth, a copy audit), and the sixth is
consolidation. Order within the block is yours.

If the ladder cannot fill a column, take that column's work from the audit
rotation instead. If a column is empty two blocks running, say so in the final
summary — that is a fact about the app worth knowing.

## The order, and why

Follow `PHASE-8.md`'s ranking, with R55 promoted. **R44b–R48** need neither a
phone nor footage. **R49–R55** are product surface on measurements that exist.
**R54, R56–R58** each carry a named dependency.

Three sequencing rules from the rounds themselves:

- **R45 builds the same-session case first.** Two serves from one basket share a
  camera by construction, so the 5° yaw gate is satisfied for free; best-ever
  falls out later when the gate passes. That ordering ships the feature whatever
  the open question's answer turns out to be.
- **R56 lands before R47 is interpreted.** Platform against pinpoint decides
  which leg-drive reading means what.
- **R55 unblocks everything real-footage-shaped.** Do not skip it for plumbing.

**R58 is listed to be refused, not built.** Court lines is a vision project the
size of the ball tracker that fails on exactly the amateur footage this app
forgives. If you reach it, the honest cycle is a README line recording the cost.

Never select the court trip or the fixture shoot themselves. They need a phone
and real footage. Do not simulate their data to unblock yourself.

## When the ladder runs out

In order: remaining backlog items, then the audit rotation. Only then may you
extend the programme — and an extension is a derivation, not an idea. There is no
minimum idea count.

A new round is admissible only if you can write, **before building it**, all four
of the things every `PHASE-8.md` round has:

1. the file it plugs into;
2. the measurement already in the engine it stands on, named;
3. the claim it is **not** allowed to make;
4. the honest outcome if the rig cannot separate the effect from its confounder —
   usually an `UNDER_RESOLVED` entry, which is a finished round.

`PHASE-8.md`'s "Considered and not proposed" list is the model. Adding a
well-reasoned refusal to it is a complete cycle, and a better one than a feature
nobody derived.

---

# The cycle

**Phase 1 — Select.** Read the ledger and state files. Take one item: the topmost
Phase 8 round not done and not blocked, subject to the portfolio rule. Name the
lead builder and the column it serves. Mark `[~]`.

**Phase 2 — Verify the premise before building it.** This repo's own ledger is
the argument: R44's round as written was factually wrong and measuring it found a
live defect underneath; R27's stated premise was simply wrong; R25's feature
already existed, unnamed; R24's defect was in prose, not code. **A round whose
premise is unverified starts with a read-only cycle** that measures the claim,
writes what it found into `NEXT.md`, and ships no production code. That is a
complete cycle and it is the cheapest one you will run.

Mandatory for R50, R51 and R57, where the spike also produces the split plan.
Skip it only when the round's premise is already a measured number on record.

**Phase 3 — Build.** Read the files the round names, including the prose doc
comments above the code — in this codebase those comments are usually the spec,
and `PHASE-8.md` was written by reading them. Prefer extending a module to adding
one. Write the test that fails without the fix, and watch it fail, first.

**Phase 4 — Critic pass.** Mechanical gates, then five critics with evidence,
then any precedence call. Retry limits from `LOOP.md`: five attempts on core
engine or test-suite work, three on UI, product or growth.

**Phase 5 — Ship.** Update `README.md` in the same commit if behaviour,
measurement, storage or a decision changed. Mark the round `[x]` in `NEXT.md`
with one or two sentences on what was actually settled — delta only, including
any deliberate departure and why. Commit in this repo's style: one declarative
sentence, sentence case, what it does for the player or the engine. No `feat:`,
no ticket numbers; body prose for a non-obvious why. Set LAST_GREEN. Append to
`cycle_summary.json.unattendedLoop.cyclesLanded`: cycle number, commit, lead
builder, column served, what shipped, gate results, **each critic's evidence or
"not assessed"**, any precedence call, and any departure from this prompt.

Emit exactly one line: `[CYCLE_COMPLETE: CONTINUE]`.

---

# Robustness standards

These are what stop twenty cycles of individually-green work from adding up to a
broken app.

**A test must have teeth, and only the right teeth.** Watching it fail is not
enough. Revert the fix and confirm **exactly that check goes red and nothing
else** — the standard R44 and R29 already set, and the "nothing else" half is
what catches an over-broad assertion. Record the canary result.

**One seed is not a result.** Anything driven by `syntheticServe.ts` must hold
across the seed range the noise suite uses, not a single seed. A seed-sensitive
test will flake at hour six and burn a retry budget on nothing. For measurement
reliability use an ensemble check in `repeatability.ts` rather than an accuracy
check on clean landmarks — accuracy on clean landmarks is a weaker question.

**Load-bearing modules need the extra gate.** A change to `tiers.ts` (every band
is derived), `phases.ts` (every window, and R44 warns that moving one re-derives
every noise floor), `diagnose.ts` (the data-only contract) or `db.ts` (stored
shape) must be declared in Phase 1, must run the consolidation number diff before
committing rather than waiting for the block to end, and may not be a side effect
of a round about something else.

**Do not refactor as a side effect.** If a round needs a refactor, that refactor
is its own cycle with its own green tree. A discarded refactor costs one cycle; a
half-landed one costs the session.

---

# Rounds bigger than one cycle

R50, R51 and R57 will not fit; R45 has a deferred second half by design. Do not
compress and do not run long. Spike first, then split in `NEXT.md` into named
sub-rounds the way R44 split into R44 and R44b, ship the first, leave the rest
numbered.

Each sub-round must stand alone: green tree, no dead code, nothing behind a flag,
no half-migration. If a round cannot be split so its first half is independently
correct, it is blocked — mark `[!]` and move on.

# Browser verification

Required whenever the player-visible surface changes — R45, R49, R50, R52, R53,
R54, R56 all qualify. Start the dev server through the preview tooling, never a
bare shell. Open `?demo`, `?demo=live`, `?demo=basket`, `?demo=glance` or
`?check` as fits. Read the console. Never ask me to check anything.

Known environment defect, on record in `cycle_summary.json`: the preview pane
does not composite frames while not displayed, breaking screenshots, coordinate
clicks and rAF loops. Proven workaround is `javascript_tool` with
`dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true}))`.
Query-string routes may need a fresh tab. If verification fails twice the cycle
is blocked — never ship an unverified visible change, never claim you saw it.

# Failure, and not losing work

On exhausting retries, abandon **without discarding**:

```bash
git stash push -u -m "abandoned-cycle-<N>"
git reset --hard <LAST_GREEN>
```

Never `git reset --hard` before stashing. Mark the round `[!]` with the specific
thing that did not work, not the word "failed". Do not lower a threshold to make
a test pass, do not invent data to unblock yourself, do not widen scope to avoid
a hard part. Three consecutive abandoned cycles is a stop condition.

---

# Every sixth cycle: the consolidation gate

Release Architect leads. No feature work. This is the cycle that catches what the
per-cycle gates cannot, because it compares the app against its own past rather
than against one round's intent.

1. **Full gate green**: typecheck, lint, test.
2. **Number diff.** Run the rig sweep and diff every reported reading against the
   previous consolidation's. Any change nobody intended is a defect and outranks
   whatever is next on the ladder. Any change somebody did intend gets a README
   line. This is the only thing that catches cycle 12 silently moving a number
   cycle 4 established.
3. **Boot smoke, every time, whatever changed.** Start the dev server, open
   `?demo`, confirm a report renders end to end with a clean console. Twenty-four
   Node suites can pass while the app does not start.
4. **Copy audit** of every line added since the last consolidation — twenty-five
   words, no lab jargon, no coach jargon, no word the app already owns. R28 found
   its own phase's copy had drifted over the cap; it drifts.
5. **Ledger compression.** Cycle records to their deltas. README carries the
   standing description, `NEXT.md` the moves, git the rest. A ledger nobody can
   read in one sitting has stopped being one.
6. **Tag and push**: `git tag loop-green-<n>` then `git push --follow-tags`.
   Eight hours of unattended commits on one local branch, with hard resets in the
   loop, is one bad command from gone — and the tags are the rollback points if a
   defect surfaces six cycles after it landed.

A consolidation that finds a defect converts to a fix cycle and the next cycle
consolidates again. A defect found here always beats a feature.

# The last two hours

After six hours, **start no new multi-cycle round.** Finish or abandon what is
open, then take only work that completes inside one cycle — audit items, a
deferred second half whose first half landed, a copy audit, a README
reconciliation, a refusal written down with its reasoning.

The failure mode of a long unattended run is not idleness. It is a half-landed
refactor at hour seven with nobody awake to finish it.

End with a consolidation gate and a push whatever the clock says.

# Pacing and stop conditions

The mechanical gate costs about twenty seconds. Cycles are cheap; do not batch
work into a large one and do not sleep between them. Self-pace.

Stop, emit `[CYCLE_COMPLETE: STOP <reason>]`, and write a final summary when:

- eight hours have elapsed and the closing consolidation is committed and pushed;
- Phase 8, the backlog and the audit rotation are exhausted and no new round can
  be derived to the four-part standard;
- three consecutive cycles abandoned;
- the tree is red and two attempts have not made it green;
- the consolidation number diff shows a change you cannot explain and cannot
  bisect within one cycle;
- a cycle cannot proceed without breaking the design freeze or the copy cap;
- two critics deadlock in a way precedence does not resolve;
- you are about to do something you would want to ask me about. Write the
  question down and stop. Do not assume yes.

The final summary goes in `cycle_summary.json` and in your last message: what
shipped by column, what was pinned as already-correct, what was written down as a
refusal, what is blocked and on what, every finding raised for me, which columns
went unserved, and the single thing you would do next.

# Appendix — the audit rotation

For hardening cycles and for cycles with no actionable round. Each produces a
pinned test or a found defect; both are complete.

1. A refusal path nobody has counted on real footage.
2. Two clips of the same serve that should agree, and by how much they do.
3. A number in `tiers.ts` whose band was set against the synthetic rig only.
4. A README claim with no test behind it.
5. A stored-data shape that predates its current writer.
6. A copy line that has drifted over the cap since it was written.
7. The oldest `[!]` item, re-read to see whether it is still blocked.
8. A window in `phases.ts` still sized in file seconds rather than shares of the
   serve — R44 fixed the landing floor and left the rest.
9. The contrast ratio of a token pair on a surface a player reads outdoors.
10. An existing test re-run against its own canary, to check it still has teeth.
