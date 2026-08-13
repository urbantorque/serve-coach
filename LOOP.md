You are developing Serve Coach, an offline browser app that analyses a tennis
serve from a phone clip. Repo: `C:\Users\roger\OneDrive\Desktop\serve coach`.

**Branching.** This repo's trunk is `master`, and it is stale — the working
branch `loop/top-ten` carries sixteen commits of current work that `master` does
not have. Continue on `loop/top-ten` unless the user says otherwise. Never
commit to `master`, and never rebase or merge onto it without being asked.

Read `README.md` fully before your first edit of each session. It is not a
summary — it is the design record, and it is accurate. Read the files named in
the slice you are about to touch before editing them.

## The work ledger

There is a file `NEXT.md` at the repo root that tracks this programme.

- **If it does not exist**, your first task is to create it: transcribe the five
  themes and their slices below into a checklist, one line per slice, each
  marked `[ ] todo`, `[~] in progress`, `[x] done` or `[!] blocked — <reason>`.
  Commit it alone. Do nothing else that iteration.
- **If it does exist**, read it first. It is the source of truth for what is
  done, not your memory and not the git log.

Each iteration: pick the **topmost slice that is not done and not blocked**,
implement it completely, and update `NEXT.md` in the same commit. One slice per
iteration. Never start a second slice because the first was small — stop and let
the next iteration begin cleanly.

If a slice turns out to be bigger than one iteration, split it in `NEXT.md` into
named sub-slices, do the first, and leave the rest. Do not leave half-built code
behind a flag.

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
   for the ball say "the ball falls".

5. **The report shows 2–4 drills, ranked worst-cause-first, never one.** Ranking
   comes from `HIERARCHY` in `analysis/triage.ts` (grip → toss → posture → drop →
   sequence → contact), severity-sorted within a group, symptoms already
   attributed to a detected cause excluded. Top item in full, the rest compact,
   cap at four, keep the suppressed-count sentence. Do not add a drill per metric
   inside `FundamentalCard`. Any document you find asserting "One Answer / One
   Drill" is superseded.

6. **The diagnosis is data only.** `analysis/diagnose.ts` returns numbers,
   booleans and enums. No sentence is composed in that path and no frame or
   landmark is returned. A test enforces both.

7. **Nothing leaves the device.** No network call, no analytics, no account, no
   remote logging. The only egress is the player pressing share on a rendered
   image.

## Per-iteration protocol

1. Read `NEXT.md`; pick the topmost actionable slice; mark it `[~]`.
2. Read the files it names, plus their doc comments — this codebase explains its
   own decisions in prose above the code, and those comments are usually the
   spec.
3. Implement. Prefer extending an existing module over adding one; the file
   table in `README.md` is a real responsibility map and a new file needs a row.
4. Run, in this order, and do not proceed past a failure:
   ```bash
   npm run typecheck && npm run lint && npm test
   ```
5. If the slice changes anything the player sees, verify it in the browser:
   start the dev server through the preview tooling (never a bare shell), open
   `?demo`, `?demo=live` or `?demo=basket` as appropriate, and check the console
   and the rendered result. Do not ask the user to check manually.
6. Update `README.md` in the same commit if the change alters behaviour,
   measurement, storage or a decision worth knowing about. The README is the
   deliverable, not an afterthought.
7. Update `NEXT.md` to `[x]`.
8. Commit. Message style, matched to this repo's history: one declarative
   sentence in sentence case saying what the change does for the player or the
   engine — "Stop measuring the frame rate and calling it blur", "Name the axis
   the camera measured, and withdraw the faults it could not". No conventional
   commit prefixes, no ticket numbers, no "feat:". Body paragraphs explain why,
   in prose, when the why is not obvious.
9. Report to the user in two or three lines: what shipped, what the tests said,
   what is next. If tests failed and you fixed them, say so. If you left
   something out of scope, say what and why.

## Verification standard

A slice is done when its behaviour is covered by a test that would fail if the
behaviour regressed — not when it renders. The engine is pure TypeScript tested
in Node via `scripts/run-tests.mjs`, driven by the parametric synthetic serve in
`analysis/syntheticServe.ts`, which lets you dial in a specific fault and assert
that fault is what gets reported. Use it. For anything touching measurement
reliability, add or extend an ensemble check in the noise suite rather than an
accuracy check on clean landmarks — accuracy on clean landmarks is a different
question from reliability on real ones.

---

# The five themes

Work them in order. Later themes may reuse components built by earlier ones,
which is why the order is what it is.

## Theme 1 — Ground truth, and the signals it unlocks

The engine's accuracy claims rest on `RECORDED` in
`src/lib/analysis/__tests__/fixtures/index.ts`, which is empty: 0 of
`MINIMUM_RECORDED = 6`. Six signals are consequently measured and never spoken
to the player — `legs_peak_ms`, `chain_span_ms`, `wrist_peak_ms`,
`elbow_peak_ms` in `UNCALIBRATED`, and `hip_lead_ms`, `pronation_deg` in
`UNDER_RESOLVED` — and hip–shoulder separation and shoulder tilt are computed
almost entirely from world-space `z`, which the rig models as exact and
MediaPipe does not.

**You cannot film tennis serves. Do not pretend otherwise.** Putting a synthetic
fixture in `RECORDED` is explicitly a `fail` in `fixtureGate` and it is the exact
overclaim that gate exists to prevent. Adding real-looking fixture JSON you
generated is worse: it turns the suite green against reality that does not exist.

So build everything around the footage except the footage:

- **1a.** A capture-and-label workflow good enough that the user can produce a
  fixture in minutes: extend the dev **Save as test fixture** path in
  `src/dev/exportFixture.ts` so the draft it emits has every field the validator
  in `analysis/groundTruth.ts` wants, prompts for the prose `label`, and refuses
  to emit a draft still containing `TODO`.
- **1b.** A shooting list. Write `src/lib/analysis/__tests__/fixtures/README.md`
  into a checklist the user can take to a court: exactly which clips are needed
  to satisfy `SPREAD` (both hands, two views, two frame rates) plus the three
  prose axes (build, framing, lighting), with the filming instructions for each
  and what each one proves.
- **1c.** `npm run replay:fixture` should be able to take a labelled fixture and
  print, per measurement, the labelled value against the measured one and the
  delta. Make that output good enough to be the thing that settles a band.
- **1d.** Prepare the calibration path without walking it. For
  `chain_span_ms`, the README already establishes the scale-free repair —
  divide by motion duration, which reads 0.092 / 0.088 / 0.092 across three
  tempos. Implement the ratio, keep it in `UNCALIBRATED`, and write down exactly
  what evidence would let it move to `SIGNALS`. Do not invent a band.
- **1e.** Then **stop and report**. Mark the remaining Theme 1 slices
  `[!] blocked — needs real footage`, tell the user precisely what to film, and
  move to Theme 2. Do not sit in a loop on a blocked theme.

## Theme 2 — The basket, promoted to the main event

`buildConsistency` in `analysis/consistency.ts` and `ConsistencyPanel` are good
and reachable only through an `onCheckConsistency` action after a single-serve
report. The README argues that for a club player the gap between best and worst
serve matters more than the average; the product does not behave as though it
believes that.

- **2a.** When a clip contains more than one serve, the consistency view is what
  the player lands on. A single serve becomes the drill-down, reached by tapping
  a serve. Preserve the existing behaviour for genuine single-serve clips.
- **2b.** A best-serve / worst-serve comparison: the six keyframe stills of each,
  paired position by position. The stills already carry the skeleton and the
  judged angle drawn on at capture time, and are already stored, so this is
  layout over existing data. Say in words what differed, using
  `analysis/anatomy.ts` readouts rather than numbers.
- **2c.** Route the consistency result into the practice focus. The worst-spread
  element is currently shown and then dropped; `practice.ts` should be able to
  say "your toss is fine on average and it moves more than anything else you do".
- **2d.** Respect the storage rules: `KEEP_STILLS = 20`, stills dropped from
  older reports before numbers. A comparison that silently fails on a report
  whose stills were pruned must degrade to the numbers, with a line saying why.

## Theme 3 — Closing the practice loop

`Session = Omit<Analysis, 'frames'>` — storage holds only what the camera
measured, nothing the player did. So `practice.ts` cannot distinguish "stuck
despite drilling" from "never tried it", and both render as the same badge.

- **3a.** A small player-side record alongside the analysis: which drill was
  assigned, whether the player marked it done, and when. It must survive
  `normalise` in `storage/db.ts` (older reports load without it), export and
  import through `storage/backup.ts` with the same newer-wins merge, and count
  towards nothing if absent.
- **3b.** `PracticeCard` earns a sharper sentence from it: drilled and moving,
  drilled and not moving, assigned and never logged. Keep `MEANINGFUL_DELTA = 3`
  as the gate on any claim of progress — under it, say "no real change".
- **3c.** Do not gamify. No streaks, no badges, no congratulation. The voice lint
  will catch the pleasantries; the restraint is yours to supply.

## Theme 4 — Capture on court, not from the camera roll

`FramingCheck` is a live viewfinder that borrows every threshold from
`framingIssues` and `blockingFramingIssue` and honestly admits it cannot tell a
leaning player from a tilted phone. Filming still hands off to the phone camera
app via `capture="environment"`, so the loop is: film, walk over, pick the file,
wait, read.

- **4a.** Record in-app from the same preview stream, where the browser supports
  it, falling back to the existing file input where it does not. The fallback is
  not a degraded mode — it must stay a first-class path.
- **4b.** Auto-trim to the detected serve. `analysis/serves.ts` already locates
  reach peaks on a fixed sample budget regardless of clip length; reuse it rather
  than writing a second detector.
- **4c.** A between-serves glance: one line, one number, no report, while the
  player is still holding a basket. This must obey constraint 1 — when the clip
  cannot carry an answer, the glance says so rather than guessing.
- **4d.** Battery and heat are real constraints here. The animation loop already
  runs only while the clip is moving, for exactly this reason; hold that
  standard for anything you add that touches a camera stream.

## Theme 5 — Showing the correction

The ghost is deliberately narrow: a rigid translation of the player's own tracked
body, legs undrawn, no ghost below `SOFT_MEASUREMENT`, and the trophy ghost
withdrawn because a translation cannot express a joint angle. That restraint is
correct. Do not undo it. The hole it left is that knee bend and shoulder tilt —
two of the most actionable faults — have no picture at all.

- **5a.** A visual that can honestly say "angle": an arc drawn at the joint on the
  keyframe still, with the target band as a wedge behind it. Same evidence rules
  as the ghost — nothing drawn over a hedged or absent measurement, and the band
  read through `analysis/tiers.ts` as the tier above the player, never a fixed
  standard.
- **5b.** A then-versus-now still pair from history, reusing the comparison
  component built in 2b.
- **5c.** Both must render into the share card in `share/reportCard.ts`, or be
  deliberately omitted from it with a stated reason. A report that looks
  different when shared than when read is a bug.

---

## When you are blocked

Say so plainly, mark the slice `[!]` in `NEXT.md` with the reason, and move to
the next actionable slice. Do not invent data to unblock yourself, do not lower a
threshold to make a test pass, and do not widen scope to avoid a hard part. If
every remaining slice is blocked, stop the loop and report what is needed.
