You are developing Serve Coach, an offline browser app that analyses a tennis
serve from a phone clip. Repo: `C:\Users\roger\OneDrive\Desktop\serve coach`.

**Branching.** This repo's trunk is `master`, and it is stale — the working
branch `loop/top-ten` carries 36 commits of current work that `master` does not
have. Continue on `loop/top-ten` unless the user says otherwise. Never commit to
`master`, and never rebase or merge onto it without being asked.

Read `README.md` fully before your first edit of each session. It is not a
summary — it is the design record, and it is accurate. Read the files named in
the round you are about to touch before editing them.

## The work ledger

`NEXT.md` at the repo root tracks this programme. Read it first. It is the
source of truth for what is done — not the git log, not your memory.

Each iteration: pick the **topmost round that is not done and not blocked**,
implement it completely, and update `NEXT.md` in the same commit. One round per
iteration. Never start a second round because the first was small — stop and let
the next iteration begin cleanly. If a round proves bigger than one iteration,
split it in `NEXT.md` into named sub-rounds, do the first, and leave the rest.
Do not leave half-built code behind a flag.

## Governing constraints — these outrank the feature work

1. **Never report confident nonsense.** This is the codebase's founding rule and
   the reason for `metricConfidence`, `SOFT_MEASUREMENT`, `DEPTH_COLLAPSED`,
   `UNDER_RESOLVED` and `UNCALIBRATED`. If a change would make the app assert
   something it cannot measure, the change is wrong even if it ships a feature.

2. **Be forgiving to amateur footage, but never by lowering a threshold.**
   Convert hard refusals into soft ones: let the clip be measured, let confidence
   collapse honestly, and give every refusal an escape hatch (the pattern is the
   existing "Show me the numbers anyway"). Lowering a number to admit more clips
   is a defect, not a fix.

3. **Do not touch the design.** The dark near-black `--ink` ramp, the single
   tennis-lime accent, the `--r-*` radii, the `--shadow-*` elevation, the system
   font stack and the `body::before` court wash are settled. Two complete
   redesigns were built and both rejected. New UI must be assembled from
   `src/components/primitives.tsx` and existing tokens in `src/styles/tokens.css`.
   You may add a component; you may not restyle an existing one, retune a colour,
   or "modernise" anything. If a new surface genuinely has no token that fits,
   say so in the commit body rather than inventing a colour.

4. **Coaching copy is for someone who plays twice a month.** `analysis/voice.ts`
   lints length, sentence count, passive voice and lab jargon, and
   `__tests__/copy.test.ts` fails the build on a pleasantry. It does *not* catch
   coach jargon — windmill, cartwheel, back-scratch, the chain, head speed. Never
   use those. Never reuse a word the app already owns: "drop" is the racket drop;
   for the ball say "the ball falls". Twenty-five words is the cap, and it is a
   cap on every new line, not an average.

5. **The report shows 2–4 drills, ranked worst-cause-first, never one.** Ranking
   comes from `HIERARCHY` in `analysis/triage.ts` (grip → toss → posture → drop →
   sequence → contact), severity-sorted within a group, symptoms already
   attributed to a detected cause excluded. Top item in full, the rest compact,
   cap at four, keep the suppressed-count sentence. Any document asserting "One
   Answer / One Drill" is superseded.

6. **The diagnosis is data only.** `analysis/diagnose.ts` returns numbers,
   booleans and enums. No sentence is composed in that path and no frame or
   landmark is returned. A test enforces both.

7. **Nothing leaves the device.** No network call after load, no analytics, no
   account, no remote logging. The only egress is the player pressing share on a
   rendered image. The one load-time fetch is the pose and racket models and the WASM
   runtime, and `scripts/fetch-assets.mjs` is the only other network access in
   the project.

8. **Fit on a phone that is already warm.** No component may hold more than
   ~500 MB of resident memory on a mobile device, and anything touching a camera
   stream, a decoder or a canvas is assumed guilty until measured. Battery and
   heat are correctness concerns here, not polish.

## Per-iteration protocol

1. Read `NEXT.md`; pick the topmost actionable round; mark it `[~]`.
2. Read the files it names, plus their doc comments — this codebase explains its
   own decisions in prose above the code, and those comments are usually the
   spec.
3. Implement. Prefer extending an existing module over adding one; the file
   table in `README.md` is a real responsibility map and a new file needs a row.
4. Run, in this order, and do not proceed past a failure:
   ```bash
   npm run typecheck && npm run lint && npm test
   ```
5. If the round changes anything the player sees, verify it in the browser:
   start the dev server through the preview tooling (never a bare shell), open
   `?demo`, `?demo=live`, `?demo=basket` or `?demo=glance` as appropriate, and
   check the console and the rendered result. Do not ask the user to check
   manually.
6. Update `README.md` in the same commit if the change alters behaviour,
   measurement, storage or a decision worth knowing about. The README is the
   deliverable, not an afterthought.
7. Update `NEXT.md` to `[x]`, in one or two sentences saying what was actually
   settled — including any deliberate departure from the round as written, and
   why. **Delta only.** Do not restate what the previous round already recorded.
8. Commit. Message style, matched to this repo's history: one declarative
   sentence in sentence case saying what the change does for the player or the
   engine — "Stop measuring the frame rate and calling it blur". No conventional
   commit prefixes, no ticket numbers, no "feat:". Body paragraphs explain why,
   in prose, when the why is not obvious.
9. Report to the user in two or three lines: what shipped, what the tests said,
   what is next.

## The review lenses

Every round is written by one lens and read by the others before it commits.
They are roles, not processes — apply them as questions, not as ceremony.

| Lens | The question it asks |
| --- | --- |
| **Architect** | Does this pay down the right debt, and is the ledger still honest? |
| **A · Core engine** | Would a coach recognise this as the fault it names, on a clip that is not clean? |
| **B · UX & onboarding** | Could somebody who has never opened this find it, first try? |
| **C · Performance & state** | Where does the state live, what does it cost to store, does it still hold 60 fps? |
| **D · Product & growth** | Does this give somebody a reason to open the app again on Thursday? |
| **1 · QA & logic** | Is there a test that fails if this regresses? |
| **2 · UX & copy** | Twenty-five words. Is this a dashboard nobody asked for? |
| **3 · Perf & security** | Any request after load? Any megabyte that does not go back? |
| **4 · Janitor** | What is now dead, duplicated, or contradicted by the README? |

**Retry limits.** Five attempts on anything in the core engine or the test
suite; three on UI, product or growth. On exhausting them, revert to the last
green commit, mark the round `[!]` with what was actually tried, and move on. A
discarded refactor costs one round; a half-landed one costs the rest of the
programme.

**Purge at every phase boundary.** The close-out round compresses the phase's
ledger entries to their deltas and drops the working notes underneath them. The
README carries the standing description; `NEXT.md` carries the moves; git carries
the rest. A ledger nobody can read in one sitting has stopped being a ledger.

## Verification standard

A round is done when its behaviour is covered by a test that would fail if the
behaviour regressed — not when it renders. The engine is pure TypeScript tested
in Node via `scripts/run-tests.mjs`, driven by the parametric synthetic serve in
`analysis/syntheticServe.ts`, which lets you dial in a specific fault and assert
that fault is what gets reported. Use it. For anything touching measurement
reliability, add or extend an ensemble check in the noise suite rather than an
accuracy check on clean landmarks — accuracy on clean landmarks is a different
question from reliability on real ones.

A round whose honest answer is "this was already correct" is finished by pinning
it with a test and a README line, not by inventing a change.

## When you are blocked

Say so plainly, mark the round `[!]` in `NEXT.md` with the reason, and move to
the next actionable round. Do not invent data to unblock yourself, do not lower
a threshold to make a test pass, and do not widen scope to avoid a hard part. If
every remaining round is blocked, stop the loop and report what is needed.

---

# The programme — thirty-five rounds, five phases

This app is already built. Two programmes have run on this branch and their
outcomes are in `README.md`, which is current. So rounds here are ordered by
**what this app claims that nobody has checked**, not by construction order.
Several are questions whose honest answer may be "already true"; that answer,
pinned by a test that would fail if it stopped being true, is a finished round.
Inventing a change to make a round feel productive is the failure mode this
phrasing exists to prevent — and it is the same thing as feature bloat, arriving
one plausible improvement at a time.

Six pillars run through the five phases rather than being owned by one of them:
**core logic, performance and storage, UX and onboarding, feature and retention,
security and privacy, architecture health.** Each phase leads with one and is
read by the lenses of the others.

| Phase | Rounds | Leading pillar | What it settles |
| --- | --- | --- | --- |
| **1** | R1–7 | Performance, storage, architecture health | The 500 MB ceiling, the byte cost of a report and the quota paths are assertions nobody has measured. Also where `App.tsx`'s implicit state machine gets a name. |
| **2** | R8–14 | Core logic and reliability | The synthetic rig produces only clean failures, so every robustness claim is untested against the way real clips actually break — occlusion, dropped frames, dusk, other people in shot. |
| **3** | R15–21 | UX and onboarding | Nobody has walked the first run as a stranger, the best feature hides behind something that reads as a file picker, and the timeline's frame budget is unmeasured. |
| **4** | R22–28 | Feature and retention | The share card is one serve and a coach wants the basket; a trip to the court is not a thing the app knows about. |
| **5** | R29–35 | Security, privacy, QA, freeze | Zero egress is asserted rather than pinned by a test, the uncalibrated registers need re-reading, README end to end, stop. |

The round list, with what each one has to answer, is in `NEXT.md`. Terminate at
R35. Do not start an R36.

---

## What came before

**A five-theme programme**, run to completion: the fixture gate, the basket
promoted to the main event, the practice loop closed with a player-side record,
recording and glancing on court, and the target dial. Outcomes in `README.md`.

**Eight rounds of a device-truth phase**, of which five landed and two are held
for a court trip. It built `lib/selfCheck.ts` and the `?check` panel, made its
report pasteable under a fixed vocabulary, wrote `COURT-CHECK.md`, and fixed the
one defect it found: `recordingType` chose a container by an ordering that
assumed decodability and never asked the decoder.

Both ledgers are compressed at the foot of `NEXT.md`. Two entries are kept in
full because they are still open and **nothing in the thirty-five rounds below
closes either** — the fixture shoot, and the court trip.
