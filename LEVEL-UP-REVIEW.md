# Level-up review — 2026-10-09

The owner asked for a deep review of the app and the code, to shape a roadmap
that lifts Serve Coach another level. The review covered six areas:

- coaching and ease of use for a recreational player;
- visual polish;
- engine accuracy;
- grading, progression and gamification;
- long practice sessions;
- everyday pain points.

This file is the reasoning. The ledger is the **Level-up programme** in
`ROADMAP.md`, in the same way `ANALYSIS-REVIEW.md` sits behind the engine
programme.

**How it was done.** There were five parallel read-only reviews, one per area,
plus visual polish reviewed directly. Each one cites `file:line`. Alongside them:

- A walk through every screen at 375×812 in the preview: home, the example
  report, `?demo=basket`, `?demo=live`, `?demo=history`, Progress, the glance and
  its refusal, and the filming guide.
- Scratch probes that ran the engine's own pure path on the rig and the six Bath
  fixture serves. They are not committed.
- A simulation of the serve finder on synthetic 2-, 10- and 30-minute
  timelines.

Typecheck, lint and the suite were green: 88 suites and 1,447 checks.

**What the proposals keep to.** Every proposal keeps to `LOOP.md`'s eight
constraints and to the owner's rule that nothing waits on a person:

- each item is proven by the rig, the Bath bench, the open-data benches, a
  published study or the browser preview;
- nothing re-skins;
- nothing sends data off the device.

Items that would break one of those rules are listed at the end as the
owner's call, not planned.

---

## The verdict, area by area

| Area | Verdict | The one thing to fix |
| --- | --- | --- |
| Coaching & UX | The bones are strong: the causal plan, the drill ladders, and refusals that are honest and come with escape hatches. The surface has drifted. Some lines contradict each other, some drills teach the pause the engine warns against, and some fault titles read as praise. | Copy truth pass. Retire the hold drills. Have one "start here". |
| Visuals | Premium where the system is used fully (score ring, focus card, buttons). Below the fold it turns into grey paragraphs. Progress reads as a text document, and the model figures look like a debug view. | Card the evidence. Rebuild Progress as tiles. Upgrade the figure drawing, all inside the existing tokens. |
| Engine | The honesty machinery is real. But the plan does not inherit the card's hedges, injury flags rest on a reading that cannot be resolved, four graded faults have uncited ladders, and two classic club faults can never become the fix. | One confidence for card and plan. Base injury flags on measured evidence. |
| Grading & progression | Fair and gentle, but compressed. A season of real fixes moves the headline number less than noise does. An area that was not measured scores 0. Streaks never show for a twice-a-month player. Nothing marks a fault as fixed. | Score only what was measured. Calibrate "real change". Add graduation and a serve path. |
| Long sessions | Not supported. A 400 MB gate refuses most sessions. A clip that does get in yields about 8 serves, effectively at random. There is no session dashboard. | Find every serve. Add a session mode with a checkpointed runner and a dashboard. |
| Pain points | The first analysis has an opaque 57 MB download. A missing download at the court is blamed on the video. "Record now" records the 640-px preview. On iOS, Safari can evict the player's history. The crash screen deletes history in one tap. | An honest download. Offline errors that say so. Storage safety. |

## If only ten things get done

1. **Score only what was measured** (S). An empty area currently scores 0 and
   costs the commonest club serve about 9 points.
2. **One confidence for card and plan** (S–M). A number the card calls rough
   must not become the #1 fix.
3. **A copy truth pass, and retire the hold and pause drills** (S + S). No
   back-scratch line, no raw numbers, no fault titles that read as praise, and
   no "freeze at the trophy" to teach a hitch.
4. **Never trade a report for an error. Make basket statistics honest** (S).
   Use a spread with noise subtracted. Hide best-against-worst when the gap is
   noise.
5. **Find every serve, and say what was read** (S–M). Re-read every candidate,
   not just 8. Lift the size gate for the session path.
6. **Calibrate "real change", and add a trip score with a range** (M). Every
   delta chip and record rests on this.
7. **Graduation, then the serve path** (M). A fault fixed on two trips advances
   the plan. Progress is shown as faults retired, not points.
8. **Session mode** (L, phased). A light read of every serve, a full read of a
   representative 8, a checkpoint after each step, and a session dashboard.
9. **Show what good looks like** (M). A model serve to watch, the player's
   frame beside the model's at the focus moment, and a shorter report.
10. **Field reliability** (M). One honest download bar with a stall timeout,
    offline errors that say so, an iOS export-then-install path, and a crash
    screen that backs up first.

---

## 1 · Coaching and the recreational player

### What works

- **The causal plan holds together.** `HIERARCHY`, worst cause first, symptoms
  credited to their cause, and the suppressed-count line.
- **The ladders are grounded in research** (`progressions.ts`). Most cues point
  outside the body. Steps mostly run shadow → service line → half pace →
  points.
- **Many cues are excellent.** The hammer grip for the waiter's tray, the
  chimney toss, the ball in a sock, overhead throws for the elbow, "Count the
  serve", and the drop fix's "let the racket head fall… elbow stays up".
- **First run is short.** Four taps to a first report from a picked clip. The
  example report is labelled as one.

### Lines a twice-a-month player trips on

These were verified in the code. Each rewrite stays under the 25-word cap.

| Where | Now | Problem | Rewrite |
| --- | --- | --- | --- |
| `verdict.ts:371` | "Your racket hand never gets far enough down your back…" | The back-scratch picture the engine dropped in D7.1. It is the why-line for the most common top fault. `coaching.ts:1314` repeats it. | "Your racket head never falls behind your back, so the swing starts halfway up and arrives slow." |
| `analyze.ts:1027` (`pickFocus`) | WORK ON THIS NEXT: **Tossing arm stays up** | The metric label is the target, so the heading reads as praise for the fault. It also appears in Recents and on the glance. | "Your tossing arm comes down early" (from the readout) |
| `practice.ts:393` | "Your tossing arm stays up has lost 4 serves…" | `Your ${label}` breaks on any label that is not a noun phrase. `repeatabilityNote` already fixed this bug elsewhere. | "Tossing arm stays up was your weakest reading on 4 serves, and you haven't logged its drill. Start there." |
| `practice.ts:390` | "…it has not moved. Take this one to a coach." | Gives up after two logged drills. | Offer the ladder's easier way in first. Point to a coach only after a full rung cycle. |
| `consistency.ts:643` | "…Groove that one thing before anything else." | Puts a second "do this first" directly above a focus card that names something else. | "…changes most from serve to serve. Groove it once the fix below holds." |
| `bestServe.ts:97` | "Your best serve read 0.050× here, this one 2.1%" | Prints the internal `display` number. The test pins the number in place. | Say it in readouts: "Your best serve: hand level with the shoulder. This one: above it. Closer than last time." |
| `coaching.ts:125`, `:895`, `:920` and about 8 more | "drops early", "let the ball drop on the line" | Uses "drop" for something other than the racket (LOOP §4). The lint does not see it. | "comes down early", "let the ball fall onto the line" |
| `tossPlaceCopy.ts:13` | "18% of your height in front of your front foot" | A percentage with no target. It escapes the maths lint because it never passes through `cue`. | "About one foot-length in front of your front foot" |
| `verdict.ts:331` | "Your toss lands short… so you strike it on the way down." | "Short" means depth in tennis, and every good serve is struck on the way down. | "Your toss is too low: the ball peaks below your full reach, so you bend or rush to meet it." |
| `coaching.ts:414` | Drill name "Cartwheel shoulders" | A banned jargon word. Drill names are not linted. | "Shoulder over shoulder" |
| `analyze.ts:1712` | "Trim to the serves before you upload." | The app never uploads. | "Trim the clip to the serves before you pick it." |

**Why the lint misses these.** `voice.ts` never sees drill names, metric
labels, fault titles, phase captions, or runtime-built sentences
(`placeLine`, `focusAgainstBest`, `FiringTimeline`). Nor does it check "drop"
outside the racket.

### Technical soundness

**High: drills that teach a pause or a hold can still reach the player.**
- `coaching.ts:993-1000` says it outright: "A pause practised is a pause
  learned". `progressions.ts:35` says no step holds a position.
- Yet these are still handed out:
  - "Pause at the drop… 10 holds" (`coaching.ts:524`);
  - "Slow sink hold" (`:319`, `:324`);
  - "Freeze at the trophy" (`:415`);
  - "Reach and freeze… locked long" (`:742`);
  - the heels-up basket.
- They reach players two ways:
  - through `PracticeCard`, which picks `METRICS[pick.id].drill`
    (`practice.ts:267`);
  - through `pickFocus`, whenever no fault is named, including on a strong
    serve.

**Medium: the wrist injury card claims a measurement the engine cannot make.**
- The card says "then turns hard through the ball" (`verdict.ts:132`).
- The flag needs `pronation_deg ≥ 45` (`triage.ts:513`). But that signal's
  noise floor is 76°, the engine refuses it as a named fault, and real serves
  pronate about 93°. That half of the gate is therefore always true.

**Medium: cues that contradict each other.**
- The early-rotation cue "Keep your chest towards the side fence until you hear
  the strings hit the ball" (`progressions.ts:256`) asks for no trunk turn
  before contact. That is wrong, and it contradicts the same ladder's "Turn
  late" step.
- The kick drill says "toss over your hitting shoulder" (`coaching.ts:1174`),
  but the kick fix says "toss back over your head" (`:1147`).
- `PracticeCard` hands kick servers the flat drill.
- The arm-extension drill says "locked long" (`coaching.ts:742`), but its fix
  says a locked arm stops the racket releasing (`:738`).

**Low: smaller slips.**
- "Toss a stride inside the baseline" asks too much of a club player.
- The back-leg serve re-teaches hips-first (`coaching.ts:1008`), which the
  engine withdrew in D2.5.
- The trophy caption "chest to the sky" works against the anti-arching fix.
- "Towards the net post" does not say which post.

**On the example report** (found in the preview):
- The Loading card says **"Legs straight"** and then **"Leg drive: Strong drive
  up"**. The rig lifts the hips the same amount whatever the knee angle
  (`syntheticServe.ts:686-697`), so the sample serve has both.
- It is the first report a new player sees, and a coach would spot the
  contradiction at once.
- The example also takes the fallback path, so it shows no ranked plan, no
  ladder steps and no Show me. It undersells the product.

### Actionability

- **The single most portable line is hidden.** The feel cue ("Feel:") only
  appears after tapping "All steps" (`Report.tsx:760`).
- **Plan items 2–4 cannot be taken to court.** They show only a drill name and
  a rep count, on the report (`Report.tsx:811`) and on Home's "This week".
- **The starting rung ignores how bad the fault is.** It comes from the old
  drill table: the tray starts at step 4 of 5, a shallow drop at 3 of 5.
- **The pass mark is shown on steps it cannot apply to.** "5 of your next 6
  serves" appears on steps with no serve in them (edge bounces, sock swings,
  throws). It never says how to check: film a basket, then tap "Score all".
- **The same drill can appear twice in a row.** `?demo=basket` shows "Point
  and hold" on the focus card and again on the PracticeCard.

### What good looks like — what exists and what is missing

| Surface | What it shows | Limit |
| --- | --- | --- |
| Show me (`FaultDemoPanel`) | Fault and fix side by side on one clock | Covers only 3 faults (tray, collapsed elbow, low contact). Not the common ones: drop, toss, legs. No racket or ball. Nothing marks where to look. |
| Ghost / AIM FOR | The player's pose slid to the target height | Only for release and contact height. It **vanishes whenever the ball was tracked**: `HEIGHT_TARGETS` has no ball entry (`skeleton.ts:249`). |
| TargetShape | Stick drawings for 8 readings | Only inside folded area cards. |
| Six moments | The player's frames | Captions describe the ideal under the player's own frame, unlabelled. "Chest to the sky" sits under a straight-legged trophy. |
| Toss map | Each toss against the front foot | No target zone. Percentages. |

**Missing, and all buildable from the rig:**
- a model serve to watch, moment by moment;
- the player's frame beside the model's at the focus moment, with two or three
  ticks taken from the readouts;
- a racket and ball on the model, which unlocks Show me for the drop, the toss
  and the legs;
- a target band on the toss map.

### Forgiveness

**Soft refusals are well done.** Too few frames, blur, an unusable camera, two
people in shot, cropped feet and slow motion all measure honestly and offer an
escape.

**Two hard edges remain.**
- **A good report is swapped for an error.** When the basket sweep fails,
  `compareServes` shows "I could only read one of those serves". The single
  analysis it has already saved disappears from view.
- **The player gets four placement instructions:**
  - the guide says "side-on, four metres";
  - the live framing check tells a player who follows that to "move a step
    round" (`judge.test.ts:224-235` admits it: "a job for a person");
  - every side-on report adds "film from behind the baseline";
  - refusals say "ten steps to your side".

**Smaller edges.**
- The wrong-hand error says "tap the hand badge on the report" on a screen that
  has no report.
- A clip on its side is refused, when it could be rotated back upright and its
  confidence let fall.

### Report shape

The first viewport is right: score, focus, drill. After the plan, a live basket
report runs: plan → practice card (often a duplicate) → consistency panel (about
40 lines, open by default) → toss map → quality notes → how it was read →
tagging → **video** → **six moments** → areas → firing order.

The evidence a player wants next — their video, and the frames with AIM FOR —
is buried under basket statistics and settings. Tagging, serve type and hand
are settings, yet they sit above the video.

---

## 2 · Visuals and polish (inside the settled design)

`LOOP.md` §3 and two rejected redesigns settle the palette, type and radii.
Nothing here changes a token. Everything below is layout, hierarchy, drawing
quality and motion.

**What already reads as premium.** The score ring, the focus card's lime glow,
the pill buttons, tabular numerals, and the top-down filming diagram. A
correction to the record: `--fg-faint` is now `#7b8799` (4.9–5.4:1), and every
small control has a 44-px `::after` hit area. Both accessibility costs noted in
August are already paid.

**Where it drops off.**

1. **Grey paragraphs below the fold.**
   - Progress is a stack of overlines over 14-px grey sentences. "Your records"
     is three plain lines; three different "best" lines appear in different
     places; and two share buttons sit above the main chart.
   - The report's middle section has the same problem.
   - Sections switch between carded and bare for no reason the player can see.
2. **"Then, and now" takes about six screens.** It is six pairs of
   200-px-tall stills stacked vertically.
3. **The repeatability bars read backwards.** In "How repeatable, over time"
   the newest and best basket gets the shortest bar, in lime. A longer bar
   reads as more, so the best result looks like the weakest.
4. **The model figures look like a debug view.** Hair-line limbs, no joints,
   no racket or ball, and nothing to show which segment is wrong. They sit
   beside polished chrome and lower the whole page.
5. **Home for a returning player leads with marketing.** "World-class eyes on
   your serve" and "Film one serve" take the first viewport, ahead of the
   player's plan and form.
6. **Small text.** 19 rules sit at 9–10.5 px, some in the faint colour (chart
   ticks at 9 px, `.metric-aim-key` at 9.5 px). That is hard to read in sun at
   the court.

**What lifts it, using existing primitives and tokens.**
- **Progress as a small dashboard of tiles.** One form tile (trip median and
  range), one records tile, the fault path, then the chart.
- **"Then, and now" as one moment at a time,** switched with the same pills
  the video uses.
- **Repeatability shown as steadiness.** Either a longer bar for steadier, or
  the gap drawn as a range.
- **A proper figure renderer.** Limb weight, joint dots, a racket and ball, the
  wrong segment in `--work`, and the target ghost dashed.
- **A compact hero once there is history.** The first viewport becomes This
  week and the player's form.
- **A score ring that counts up,** respecting reduced motion.
- **A floor of about 11 px** for anything a player must read.

Each of these is proven by render tests, the contrast test and a 375×812
preview screenshot.

---

## 3 · The engine

### What works

- **Honesty is built in.** Per-reading confidence, noise floors re-checked on
  real Bath motion, `CAMERA_ALLOWANCE`, `UNDER_RESOLVED` and `UNCALIBRATED`.
- **Contact is fused from the hand and the ball.**
- **Contact height is read without perspective.**
- **The chest turn is read as timing,** not degrees.
- **The virtual-phone Bath bench works.** It is the best validation asset in
  the repo, and it found and fixed the drop, the camera model, the toss
  keyframe and contact height.

### The risks of a confident wrong answer to a club player, ranked

1. **The plan ignores the card's hedges.**
   - Three diagnosis signals take their confidence from landmark visibility
     only (`diagnose.ts:1051-1072`): `drop_depth_ratio`,
     `contact_height_ratio` and `leg_drive_rise_ratio`.
   - The card's version of the same numbers is multiplied down for:
     - feet out of frame (×0.5);
     - a trophy found from the arms (×0.7);
     - the hand and the ball disagreeing about contact (down to ×0.5);
     - blur.
   - So with the feet cropped, the card calls leg drive "approximate" while the
     plan can name `no_leg_drive` first, at full confidence.
   - `confidence.ts:304` calls this "the worst pairing the app can produce",
     but the fix was applied only to the coil.
   - Spine lean is read from depth and carries no `DEPTH_COLLAPSED` hedge.
2. **The injury flags rest on noise.**
   - Flags skip the noise floors by design (`tiers.ts:366`), and the hierarchy
     never suppresses them.
   - The wrist flag needs pronation ≥ 45, which every real serve passes. In
     effect it is palm ≥ 45, which is below the tray fault's own threshold of
     63. A player can be told "watch your wrist" without ever being told they
     have the grip fault.
   - The lumbar flag fires at 22° on a depth reading; the research suggests
     about 40.
   - The only test runs on a clean, noiseless serve. No false-flag rate exists
     on any ensemble.
3. **Camera motion is never measured.**
   - A filmer who tilts the phone to follow the toss moves the hips down the
     picture. That shrinks leg drive and moves the toss and contact heights.
   - The rig has no tilt dial.
   - A zoom drift is pinned in `robustness.test.ts:1691` as "a CONFIDENT WRONG
     NUMBER".
4. **Leg drive is likely the most common top fix for a UTR 2–4 player, at high
   severity.** This is an inference; it was not measured.
   - The floor is pro-derived and flat at every level.
   - Legs rank above the drop in `HIERARCHY`.
   - The research says the arm action matures first and leg drive last
     (Whiteside 2013).
   - An arm-only serve costs racket speed but adds no shoulder load (Reid
     2008).
5. **The basket headline can name camera noise.**
   - Consistency is scored as the range (max − min) over the band's width
     (`consistency.ts:322`). It includes hedged depth rows and subtracts no
     noise.
   - The range grows with the number of serves, so a bigger basket looks less
     steady.
   - Hip–shoulder separation's take-to-take noise alone gives about 63 over six
     serves. That is enough for "Your hip–shoulder separation changes serve to
     serve".
6. **The grip fault sits on an uncited ladder at the top of the hierarchy.**
   - Four named faults use diagnosis ladders that cite nothing: tray, posture,
     toss drift and collapsed elbow (`tiers.ts:94-225`).
   - `bands.test.ts` enforces sources only on the card.
   - The toss-drift ladder calls itself "PROVISIONAL", and it uses a different
     statistic from the card's toss-path row.
7. **Real-time 60 fps clips are still read at 32 fps** (D1.2 unwired). So the
   hitch and the firing order only ever run on slow-motion files. Meanwhile the
   too-few-frames refusal tells players to "set the camera to 60 fps", which
   does not help yet.
8. **Ball heights keep the perspective error that was removed from the hand.**
   A toss half a metre off the body plane, filmed from behind, reads about 6%
   low.

### Coverage of the faults a club player actually has

| Fault | Today | Machine-provable next step |
| --- | --- | --- |
| Forehand/eastern grip (waiter's tray) | Named, from palm-to-sky at the trophy, on an uncited ladder | Add a second witness: shoulder abduction under ~70° during cocking (Touzard 2019) |
| Toss too low | Graded, needs the ball | Measure the fall from timing, ½g·t², which needs no scale |
| Toss scatter serve to serve | Placement measured, ungraded | Scatter of the toss apex across a basket, banded by published variability |
| No trophy / arm not cocked | Partly proxied (arm cock is uncalibrated) | Elbow angle and upper-arm height at the knee trough (Gao 2026) |
| Shallow racket drop | Graded leniently | Benchmark the racket box on COCO labels before using it as a witness |
| Little leg drive | Graded, flat, pro-derived | Judge rise relative to the player's own knee bend; level-aware order |
| Contact over or behind the head | On the card only, **never a fix** | Name it `contact_behind`; its band is already cited |
| Tossing arm drops early | On the card only, **never a fix** | Name it in the toss group; its band is derived on real motion |
| Chest opens early | Named (side view: timing) | Done; widen the camera tolerance |
| Falling back on landing | Measured, unsigned | Sign it by the net direction the swing already gives |
| Second serve pushed in | Missing | Compare tagged first and second serves' drop-to-contact time (Chow 2003: racket speed is the same) |
| Hitch / rushing | Hitch measured at ≥ 60 fps | Trophy-to-contact time against Tubez 2021, readable at 30 fps |
| Foot fault | Missing | A true call needs baseline detection; left out |

**On the hierarchy.** For club players, grip then toss is sound. Legs above
the arm action is weak at UTR 2–4, so keep the current order above rung 6
only. Below that, use grip → toss (height, placement, tossing arm) → arm action
(drop, elbow) → legs → posture → chest → contact.

**On multiple serves.** The diagnosis and the plan come from one serve — by
default the last one found. A basket adds spreads, but nothing uses how often a
fault was named across serves. One noisy take is fully trusted once it clears
its floor: before any fault was dialled in, `posture_collapse` was still named
on 1.3% of real noisy takes. The fix is a basket verdict built on frequency
plus margin, which session mode needs anyway.

**Swept serves run on a weaker pipeline.** Sweeps skip the ball pass, the
refinement, the racket boxes and the framing check (`analyze.ts:470`). So
`checkDrill` can never judge `toss_height` in a basket, and a player whose top
fix is a short toss is told "film a few more" forever.

---

## 4 · Grading, progression and gamification

### How the score works

- **Each reading:** 70 at the band edge and 100 at the best point. Outside the
  band it decays to a floor of 30.
- **Each area:** 70% the confidence-weighted mean, plus 30% the weakest
  trusted row.
- **Overall:** a weighted mean of the five areas: toss 22, loading 22, swing
  20, contact 24, rhythm 12.
- **The player's level never changes a score.** It changes only which faults
  are named.
- **History stays inside one rubric era.**

### Measured with the engine's own path

| Serve | Overall |
| --- | --- |
| Clean rig | 85 |
| Six Bath serves (one skilled player) | 81–85 |
| Straight legs only | 82 |
| No racket drop | 76 |
| The modal club serve: straight legs and no drop | **62** — Rhythm scored **0** with no rows. It would be 71 if the empty area were left out. |
| The same club serve, 24 noise realisations | **61–79**, bimodal |

### Findings

1. **An area that was not measured scores 0, and the overall counts it.**
   - `chainScore` returns 0 on an empty list (`geometry.ts:362`).
     `analyze.ts:1820` weights it in.
   - The card shows a 0 ring with "Needs work". The share card draws it too.
   - The next serve then reports "Rhythm +83".
   - This breaks the file's own rule: a measurement that could not be taken is
     not a bad one.
2. **Noise swamps "real change".**
   - The app says anything under 3 points is noise (`Trend.tsx:311`). On club
     serves, keyframe collapse flips between takes: Rhythm swings 45–100, and
     Swing 39–71.
   - The only noise test runs on the clean serve.
   - Yet single-serve deltas appear in four places: the report hero, every
     area card, the Progress hero, and the glance read aloud.
3. **The scale is compressed.**
   - Real scores sit at about 60–87. A UTR-3-like serve with two named faults
     scores within 1–3 points of the skilled mocap player.
   - Nobody is crushed, which is good. But fixing a fault is worth 1–4 points,
     which is less than the noise, so the headline number cannot show
     improvement.
   - The probe screen shows exactly this: "6 weeks in, averaging 78 — about
     where you started."
4. **The level picker promises a different mark.**
   - It asks "How hard should I mark you?", and the report says "Marked as club
     level…". The score is the same at every level.
   - `inferTier` returns 4 on real footage, because every voting signal falls
     under its own floor. So every player who never picked a level is "club
     level".
5. **Streaks are invisible to the target player.** The streak breaks after a
   9-day gap. A fortnightly player always has 0 or 1, so the streak, the
   longest run and the share line never appear.
6. **No graduation.**
   - `checkDrill` runs against the *new* report's primary fault
     (`App.tsx:913`). When the drilled fault clears, "passed" never shows for
     it.
   - The week plan silently switches to the next fault.
   - A retired fault is only re-checked indirectly.
7. **Two "work on this" answers on Home.**
   - "This week" comes from the causal plan.
   - "Working on X" comes from `findPracticeFocus`, which takes the lowest
     average reading with **no confidence filter** (`practice.ts:196-222`).
8. **Records rest on single noisy serves.** The best score is the best single
   serve, so a noise outlier becomes a record the player never sees again.
9. **History is capped at 60 reports** (`db.ts:198`), and the oldest are
   deleted after every save.
   - On the record → glance loop that is 2–3 months. After that, "your first
     serve", the best score and then-and-now all shift without a word.
   - A restore reports "N added", then prunes.
   - Drill-ladder steps are not in the backup.

### The loop a club player needs

1. Diagnose: 2–4 fixes.
2. The week plan gives each fix's rung.
3. The next trip's basket is checked **against the fault being drilled**.
4. When it holds across two trips, mark it with one sentence, and the plan
   moves one step down the hierarchy.
5. Retired faults are re-checked every fourth trip. A relapse is said plainly.

Over that sits the **serve path**: the six hierarchy groups, each one "not seen
yet", "working on (step k of n)", "holding" or "locked in". The player's level
is said in words: "4 of 6 parts holding". That is the serve's own skill tree. It
rewards exactly what a rec player is trying to do, and it cannot be gamed by a
tap, because every state rests on judged serves past the noise floor.

**Other mechanics that fit an adult, offline audience:**
- attendance counted against the player's own cadence ("on court 7 of the last
  8 fortnights");
- a set of 10 aimed at the player's own in-rate plus one;
- personal bests said as body positions ("first trip with a full racket drop");
- a serve profile card;
- a before-and-after card when a fault is retired.

### What the competitors suggest

The scan covered SwingVision, Arccos, OnForm, and the new AI serve apps:
Tennie, Tennis-IA, ServeBot, SwingIQ and Shot AI.

- **Rec players like benchmarks by level.** SwingVision publishes serve speed
  by NTRP.
- **The fairest model grades against a target the player picks.** Arccos does
  this ("tour benchmarks overwhelm a 20 handicap"), but its norms come from
  crowd data. Here that would mean data donation, which is the owner's call.
- **Badges, challenges and personal bests are table stakes,** and the new apps'
  technique scores are unvalidated. Serve Coach's edge is honesty, so any
  reward must be earned by evidence.
- **Comparison with yourself keeps people coming back** (OnForm). The ghost and
  then-and-now already cover this. OnForm's coach sharing would need data to
  leave the device.

---

## 5 · Long practice sessions

### What happens today

| Input | Admitted? | Serves found | Serves analysed | What the player is told |
| --- | --- | --- | --- | --- |
| 2 min, 10 serves, 1080p30 (~120 MB) | Yes | 7–10 | 1 in full; the last 6 by the sweep. Serves 1–4 are never read. | "10 serves in this clip — showing number 10". Nothing says 1–4 were left out. |
| 10 min, ~50 serves | Only under 400 MB (`App.tsx:175`), i.e. 1080p under about 7 min | If admitted: about 8, effectively at random | 6 | Usually "That video is very large… three to five seconds is all it needs" |
| 30 min, ~120 serves | No, at any common setting | — | — | The same refusal |
| 4K60 or slow motion, 1–6 GB | No, even at 1–2 minutes | — | — | The same refusal. Yet the guide recommends slow motion. |

**Why only about 8 serves survive.**
- Past 35 s the scan is coarse: 420 samples whatever the length, so one every
  1.43 s at 10 minutes.
- Only the 8 highest local peaks get a full-rate re-read (`serves.ts:81`,
  `:141`).
- A serve's reach stays within the finder's tolerance for about 0.08 s, so a
  coarse sample almost never counts on its own.
- The existing test that "coarse sampling still finds every serve" uses 6
  serves, which is under the cap, and a wider peak than a real swing. It cannot
  catch this.

**What the README and the guide claim.** Both say a ten-minute clip is fine
and that "the app finds them all".

**Other gaps.**
- No checkpoints. Nothing is saved until the run ends.
- No pause when the page is hidden; seeks that time out in the background
  become missing frames.
- Only one report is stored per serve the player opened. A 120-serve session
  counts as one serve in the weekly count.
- The "someone else served" check fires whenever the player changes sides.
  With the guide's side-on camera, deuce and ad differ by about 44% in apparent
  height.

### Session mode — the design

```
pick file → duration (metadata only) → basket path (< ~2 min) or session path
  ├─ calibrate: 8 seek+pose samples on THIS file → ms per sample
  ├─ plan sheet: "A sample of 12 · about N min"  |  "Every serve · about M min"
  ├─ LOCATE   (checkpointed every 60 s of footage)
  │    audio impacts (where an AAC track exists) + adaptive visual scan
  │    + re-read every candidate + segmenter (walking, pickups, off camera)
  │    → serve events {time, side, camera segment, confidence}
  ├─ LIGHT    every serve (or the sample): readings that hold at 16 fps
  │           → one ~1 kB ServeLine row each, frames dropped at once
  ├─ FULL     ≤ 8 representative serves (best 3, worst 3, median, fault exemplar)
  │           through today's analyzeServe, with stills
  └─ SessionSummary (data only) → dashboard
```

**Locating serves.**
- **Audio is read in chunks.** `container.ts` already walks `moov`. Extend it to
  the audio sample tables, read only the audio bytes with `file.slice` (about
  1–2 MB a minute), wrap each chunk in ADTS headers, and decode it with
  `decodeAudioData`. Keep only the onset list. Peak memory stays under 10 MB.
- **Whole-file decoding is impossible:** a 1–6 GB ArrayBuffer and about
  690 MB of PCM for 30 minutes. `MediaElementAudioSource` only runs in real
  time.
- **Audio only proposes serves; the swing confirms them.** The offset between
  impacts and reach peaks is learned, never assumed.
- **The visual scan stands alone without audio.** A 3-fps pass that re-reads
  every candidate found 50/50 and 120/120 serves on rig timelines, with no
  false positives.

**Robustness.**
- **Two sides.** The player's position splits into two clusters, so deuce and
  ad are kept apart and spreads are compared within a side.
- **A bumped camera** starts a new camera segment, and comparisons across
  segments are refused.
- **The player off camera** is counted as time, not scanned.
- **A warm phone** — cost per sample at 1.6× the calibration — pauses the run
  and says so once.
- **A hidden page** writes a checkpoint and stops. It resumes when the page
  shows again. Home offers "pick the same video to carry on".

**Budgets** in seek+pose samples. Times are 55 ms per sample on desktop, then
an assumed 140 ms on a phone; the phone figure is unmeasured.
- **Sample of 12, with audio:** 2.6 min / 6.6 min at 10 minutes of footage;
  3.4 / 8.7 at 30 minutes.
- **Every serve, with audio:** 4.3 / 10.9 at 10 minutes; 8.2 / 20.8 at 30.
- **Today's flow:** about 1.2 / 3.2 minutes, for at most 7 serves.
- **Memory:** the JS heap stays under 15 MB at any serve count. Storage is
  about 100 kB per 120-serve session.

**First and second serves.** In a practice basket there is no first or second,
so nothing is inferred. In points play, a short gap from the same side can
*pre-group* serves for a bulk tag, but never pre-tag them. Outcomes stay as the
player's taps.

**The dashboard.** It is built from `primitives.tsx`, `TossMap`, `FramePair`
and the existing classes. Every line passes through `cue()`.

1. One headline line, for example "48 serves read. Your toss crept behind you
   in the last ten minutes."
2. The counts: found, read, unclear, swings with no hit, time on camera.
3. 2–4 fixes, worst cause first, each with how often it appeared: "Low contact
   on 31 of 48 serves". Faults that need swing timing say "judged on 8 serves".
4. The toss map and a contact-height strip for **every** serve. Spread is
   measured with a robust statistic.
5. Early against late, shown only when the change passes D5.2's rule.
   Otherwise it says "Held steady."
6. The best 3 and worst 3, with stills and times in the clip.
7. First and second serves, once tagged.
8. Since last session: same serve type, same rubric era.
9. A folded review list with bulk tagging.

**Storage.** New stores `practiceSessions` and `sessionServes` (DB v4), in the
backup. One median full-read serve joins `sessions`, so the trend stays at one
serve per session. A multi-GB file is never copied into OPFS; time ranges are
stored and replayed when the same file is opened again.

**Proof without a person.** A synthetic long-session timeline built from rig
and Bath serves, at two phone distances for the two sides. Between the serves
it adds:
- rest and walking;
- pickups;
- gaps with no pose;
- a partner of a different height;
- swings that hit nothing, and overheads;
- a camera bump at minute 12;
- rising noise;
- an onset track with jitter, missing and distractor impacts, and an 80 ms
  offset.

The fake-video harness drives the locate code against it, with these targets:
recall ≥ 95%, false positives ≤ 2%, contact error under 0.1 s, and sides and
segments correct. The footprint test checks resident memory is independent of
the number of serves. There are also seeded null sessions, render tests, and
`?demo=session`.

---

## 6 · Pain points a real player hits

Ranked by how soon each loses a player.

1. **The first analysis downloads about 47 MB the player cannot see.**
   - The bar counts only the 9.4 MB pose model.
   - The vision WASM, the detector, RTMPose and ORT download without progress.
   - No fetch has a timeout. A stalled download never rejects, and
     `loadEngine`'s cached `pending` makes every retry wait on it until the
     page reloads.
   - The opt-in warm-up's bar runs 0→100 twice, then sits on "Setting up…"
     through the largest file.
2. **At a court with no signal, a never-downloaded engine is blamed on the
   video.**
   - The error is "Something went wrong reading that video… try a clip
     straight from your camera roll".
   - Home's footer says "with or without a signal" even while the download
     badge is offered.
3. **"Record now" records the 640-px preview stream** at the default frame rate
   (`FramingCheck.tsx:220`). `getSettings()` is never read. The app's own
   court path gets worse footage than the phone's camera app.
4. **A multi-serve clip is swept even when its own read was refused.**
   - Distrusted serves' scores reach the screen.
   - The report's serve is read twice by two different pipelines, so its chip
     can disagree with the hero ring.
5. **An interrupted analysis is lost without trace.**
   - Nothing handles the page being hidden.
   - A refused wake lock is swallowed silently.
   - A killed tab reopens on a plain Home.
6. **iPhone Safari players who haven't installed the app lose their history**
   to WebKit's 7-day storage cap. That is longer than a twice-a-month player's
   gap. *Not verified on a device.*
   - Following the advice to "Add to Home Screen" opens an empty history,
     because installed apps keep separate storage.
   - The only warning is inside Settings.
7. **After an engine upgrade the offline badge lies.**
   - The service-worker cache is named by version, but the readiness check
     uses the global `caches.match`, so it finds the old files.
   - The player sees "Ready to use offline" and then has no engine at the
     court.
8. **The 60-report cap deletes old reports.** A restore reports counts that
   the prune then undoes.
9. **"Keep videos" is offered where it can't work.**
   - The check looks for `getDirectory` but the write uses `createWritable`.
   - A failed keep is thrown away.
   - Four lines say "the video is never saved", including one on a report that
     is playing the kept video.
10. **The crash screen deletes all history in one tap,** with no confirmation
    and no backup.

**Smaller items:**
- **No time estimate before the work starts.** Every stored report already
  carries `Analysis.cost`, which could give one.
- **The update-when-idle rule never fires.** `goHome` doesn't release the
  video.
- **iOS may refuse the glance's speech,** because it starts from an effect
  rather than a tap.
- **`?check` lacks probes** for wake lock, `createWritable`, rVFC, a local
  voice and installed status.

**Maintainability.**
- `App.tsx`'s real debt is `run`, `compareServes` and `openClip` plus four
  refs. A `useAnalysisRun` hook would make the idle and sweep decisions
  testable.
- `Report` takes about 38 props.
- The ledgers have drifted:
  - `LOOP.md` still points at `loop/top-ten` (81 commits behind) and calls the
    trunk `master`.
  - It names `NEXT.md` as the source of truth, but that file stopped on
    Aug 18, and R53 there is still open although D5.3 shipped it.
  - An agent following `LOOP.md` would redo finished work.

---

## The owner's call — outside this plan

- **Git remote, or at least a `git bundle` to a second drive.**
  - Months of work, the models in `public/` and the benches exist on one
    OneDrive-synced disk. `.git` is only 8.5 MB.
  - OneDrive syncing `.git` internals is a known source of conflict copies.
- **Level-relative scoring.** Arccos-style norms by player level need
  population data, which means data donation — and that is egress.
- **Leaderboards, coach sharing and links.** All are egress.
- **Phone timing.** Every phone budget above assumes 2.5× desktop. W5.4 and the
  court trip would replace that assumption with a measurement.
- **The fixture shoot.** It is still the only real-footage ground truth for
  side-on clips.
