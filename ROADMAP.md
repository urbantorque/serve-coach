# ROADMAP — from prototype to product

Written 2026-09-23 after a full review of the app, the engine and the ledgers.
`NEXT.md` stays the ledger for engine rounds; this file is the product plan that
sits above it. Every item obeys `LOOP.md`'s eight constraints — in particular,
no new colours, no re-skin, no confident nonsense, nothing leaves the device.

## Where it stands

The engine is the strongest part of the product and the least visible. Twenty
measurements, six keyframes, an honest confidence model, a causal fault graph,
1,200+ checks. What surrounds it was built one round at a time and it shows:

- **The shell leaks.** No browser history, so the phone's back gesture leaves the
  app from any screen. Returning players see an empty home for a beat on load.
  The example report is dressed as a real serve, dated today, "measured on this
  device". Developer surfaces (device check, `?fixture`) are one tap from a player.
- **The report is long.** About twelve sections; the fix that matters competes
  with the machinery that found it.
- **The best features hide.** Progress lives in a bottom sheet, glance mode only
  exists after an in-app recording, backup sits inside the history sheet, and
  there is no settings surface at all.
- **App.tsx is 1,950 lines** of state, routing, demo seeding, pipeline and five
  inline sheets. Every product change pays that tax.
- **The truth gap.** Zero real-footage fixtures (`RECORDED = []`, need 6), no
  on-device timing, no court trip. Every band is derived from the synthetic rig.
- **No git remote.** Months of work exist on one disk.

## The seven areas

Ranked by what loses a player soonest.

### 1 · First-run trust — *does it work on my clip, and does it feel like an app*
The phone's back gesture must behave; the first screen must not flicker; the
example must say it is an example; a dropped file must survive the first-run
guide; the screen must not sleep during a thirty-second analysis.
**Done when** back closes a sheet or returns home from every screen, and a
cold load with history paints the history.

### 2 · A report you can act on in ten seconds
Lead with the one fix and its drill; fold the evidence (clip reading, playback,
area cards) behind clear section headings rather than deleting it; strip the
coach and lab jargon the voice lint cannot see ("explosive phase", "the brake").
**Done when** the focus card and drill are the whole first viewport and nothing
above the fold is machinery.

### 3 · Polish inside the settled system
No new palette — `LOOP.md` §3 and two rejected redesigns settle that. Polish is
motion, rhythm and states: sheets that animate out as well as in, screens that
cross-fade, skeletons instead of flashes, a filming guide with a picture instead
of prose, rotating tips that actually rotate, hard-coded tints named as tokens so
the next surface cannot drift.
**Done when** every hard-coded hex in `src/styles` is a token or a documented
one-off, and every screen change has a transition that respects reduced motion.

### 4 · Reasons to come back
Progress promoted from a sheet to a real screen; a settings surface (hand,
level, backup, device) so choices are not trapped inside a report; undo on
delete; glance mode reachable for any clip, not only in-app recordings.
**Done when** a player can change their hand without re-running an analysis and
can find their backup without opening history.

### 5 · Architecture that can carry a product
Split `App.tsx` into hooks (`useHistory`, `useAnalysisRun`,
`useProgressInsights`, `useOfflineWarmup`) and components (`ProgressScreen`,
`HistorySheet`, `ErrorScreen`, `FirstRunSheet`), move demo routing into
`dev/`, render `Report` once. Move pose inference into a Web Worker so the UI
thread stays live during analysis.
**Done when** `App.tsx` is under 700 lines and a worker owns MediaPipe.

### 6 · Engine truth
Finish the racket-detector work (a weak box must not hide the wrist estimate;
stale 19 MB copy), then the items only a phone can close: the six-clip fixture
shoot, the court trip's timings, R64's front-ankle landing. These need the
owner's phone and are listed so they stay visible, not so they are faked.
**Done when** `RECORDED.length >= 6` and `COURT-CHECK.md` has a real row.

### 7 · Market readiness
A git remote and a tagged release; manifest `id`, shortcuts and screenshots so
the install sheet sells the app; a hosted build with the offline badge proven
on iOS and Android; code-split the report and progress screens off the entry
chunk; an honest store-style listing drawn from README's first paragraph.
**Done when** someone can install it from a URL and use it in aeroplane mode.

---

## Execution plan

Waves run in order. Each item is one commit, green on
`npm run typecheck && npm run lint && npm test`, checked in the browser when
the player can see it. `[x]` done · `[~]` in progress · `[ ]` todo ·
`[!]` needs the owner · `[=]` already true, left alone.

Branch `roadmap/market-ready`, off `loop/top-ten`. 1,245 checks green at
the end of the first run (1,223 before it).

### Wave 1 — foundations and trust
- [x] **W1.1** Racket-detector work landed; a box under the draw floor now
      falls back to the wrist estimate instead of hiding it. Stale 19 MB copy
      fixed, and README's two orphaned table rows put back.
- [x] **W1.2** Back gesture: `lib/backStack.ts` keeps one history entry per
      open screen or sheet. Five checks against a fake history.
- [x] **W1.3** No empty-state flash on a cold open with history; the offline
      badge holds its space until the cache answers. Also fixed a race in
      `?demo=history`.
- [x] **W1.4** The example report is labelled, cannot be shared, and no longer
      has the player's real history (deltas, streak, drill logging) wired to it.
      New screens now open at their top.
- [x] **W1.5** Device check moved out of the history list into Settings.
      `?fixture` stays in production on purpose — the owner's fixture shoot runs
      on a phone (see `FIXTURE_EXPORT`).
- [x] **W1.6** Screen wake lock while analysing and while the viewfinder is open.
- [x] **W1.7** Undo on delete (five seconds, committed on close).

### Wave 2 — report and copy
- [x] **W2.1** `voice.ts` now lints coach jargon; it caught "Steep cartwheel",
      two "Cartwheel" fixes, "Struck well after the drop" and the area-headline
      templates ("is the brake", "Sharpen explosive phase next"). A new check
      lints every runtime headline.
- [=] **W2.2** Report structure: at phone size the first viewport is already
      score, the fix and its drill. Nothing to invent.
- [x] **W2.3** Analysing notes rotate on a timer; camera file names become
      "Your clip".

### Wave 3 — polish in the system
- [x] **W3.1** Sheets animate out.
- [=] **W3.2** Screens already rise on entry; exit transitions judged not
      worth a second render path.
- [x] **W3.3** Top-down placement diagram at the top of the filming guide.
- [x] **W3.4** 23 raw colours named or mixed from tokens, identical values; a
      check now fails on any new one outside `tokens.css`.

### Wave 4 — retention surfaces
- [x] **W4.1** Progress is a screen (`screens/Progress.tsx`), not a sheet, with
      a real empty state.
- [x] **W4.2** Settings sheet: hand, backup, device check.

### Wave 5 — architecture
- [x] **W5.1** Demo routes → `dev/demoRoutes.ts`. `App.tsx` 1,948 → ~1,630 lines.
- [ ] **W5.2** `useHistory` and `useOfflineWarmup` hooks out of `App.tsx`.
- [ ] **W5.3** One `Report` render instead of two (report / saved).
- [ ] **W5.4** Pose inference in a Web Worker — spike first, and it needs a
      phone to measure, so it pairs with the court trip.

### Wave 6 — market readiness
- [x] **W6.1** Manifest `id`, two long-press shortcuts (`?open=progress|guide`),
      Open Graph tags.
- [x] **W6.2** Report and progress lazy-loaded: entry chunk 142 → 125 kB gzipped;
      the size ratchet taken down to 130 / 385.
- [ ] **W6.5** Manifest `screenshots` for the richer install sheet — needs real
      captures from a phone, not the synthetic rig.
- [!] **W6.3** Git remote and first tagged release — owner's call.
- [!] **W6.4** Fixture shoot (six clips) and court trip — owner's phone.

### Verification, end of first run
Phone-sized (iPhone 15) Playwright pass over home, settings, guide, example
report and progress: zero console errors. It found two defects — a focus
ring drawn round every sheet panel, and "Export no serves" — both fixed. A
web-interface-guidelines pass found three more (heading levels, overscroll
chaining, touch-action), fixed.

---

## Engine programme (2026-09-23, second run) — free data only, no filming

The owner asked for the engine work to proceed with no footage from them and
only free models and data. `ANALYSIS-REVIEW.md` is the reasoning; this is the
ledger.

- [x] **E1** Real-footage evidence without a camera: the CC BY *Tennis Player
      Actions* dataset (500 labelled smartphone serve frames) behind
      `npm run setup:bench` and a dev-only `bench.html`; five openly licensed
      Commons serve clips behind `clipbench.html`. Nothing of either ships.
- [x] **E2** The object detector returned nothing on the GPU delegate — the
      racket boxes were always empty on a phone with a GPU. CPU now.
- [x] **E3** The player crop: the pose model reads a square round the server.
      Benchmark: frames with no pose 101 → 8 of 500, arm error −⅓.
- [x] **E4** `refineExtremum` (tent fit): drop-to-contact bias at 30 fps
      +31 → +10 ms, RMS 35 → 14 ms, on noisy rig serves.
- [x] **E5** Real timestamps to MediaPipe's VIDEO mode.
- [x] **E6** Knee-bend band re-anchored to the 27-study meta-analysis
      (35–62° → 35–80°); the first cited band in the app.
- [x] **E7** RTMPose-s re-reads the swing (toss → contact), all-or-nothing
      inside a 6 s budget, arms/knees/ankles only. Benchmark on the same crop:
      elbows 2.35% → 1.59% of height, wrists 2.02% → 1.72%. Offline download
      24 → 57 MB.
- [ ] **E8** Read the real frame rate (MP4 `stts`) and sample the swing at the
      source rate on high-frame-rate files.
- [x] **E9** Slow motion detected from the motion itself (drop→contact ≥ 320 ms with a ≥ 2.6 s motion); timings hedged and said so, ratios still scored. Rescaling left until a stretch factor can be measured rather than assumed.
- [x] **E10** Ball tracker on a native-resolution crop above the tossing
      shoulder instead of a 256-px whole frame.
- [ ] **E11** Cite or re-derive the other 20 card bands (contact height needs a
      definition first: wrist, not ball). *Carried into D13.*

---

## Depth programme (2026-10-06) — richer features, deeper engine, no human testing

The owner's brief: build only what deepens the capabilities the app already
has, and nothing whose proof needs a person — no filming, no court trip, no
coach panel, no beta. Every item here is proven by a machine:

- **The rig** (`syntheticServe.ts`): dial the thing in, assert the app reads it
  back, and hold it under the noise ensembles in `robustness.test.ts`.
- **Open data**: `/bench.html` (500 labelled serve frames) and `/clipbench.html`
  (CC-licensed Commons clips), run in the preview browser — real pixels, no
  filming.
- **Published research** for every new target band. A reading with no citation
  is shown as information and never graded — the existing `UNCALIBRATED`
  pattern, used on purpose rather than as a holding pen.
- **The browser preview** for everything a player sees.

The rig cannot prove a reading is *accurate* on real people, only that it is
consistent with the rig. That is why bands come from literature and not from
the rig, and why a new fault may not reach the focus card until it is cited.
`LOOP.md`'s eight constraints hold throughout.

**Out of scope, because a person has to do it:** W5.4 (worker timing on a
phone), W6.3–W6.5, the fixture shoot, the court trip, `ANALYSIS-REVIEW.md`
Tier 0.1 and Tier 3, a grip-photo classifier and racket/ball networks (both
need hand-labelled training data), accounts, sharing links and pricing.

Sizes: **S** ≤ 1 round · **M** 2–3 · **L** 4+.

### Wave D1 — See the fast part of the serve (timing foundation)
Most later readings need more than four or five samples through the swing. Do
this first.

- [x] **D1.1 Read the real frame rate** (was E8) · M. *Done: `pose/container.ts` reads mdhd/stts and Android's `com.android.capture.fps`; tested on byte-built boxes. Original plan:* A small MP4/MOV box parser
      (`mdhd` timescale, `stts` deltas, the capture-rate metadata iOS and
      Android write for slow motion). *Proof:* byte-built box fixtures in the
      test suite, including variable-rate `stts`.
- [~] **D1.2 Sample the swing at the source rate** · M. *Partly delivered by D1.3: a stretched clip's window is now read four or eight times wider, so its swing is sampled that much denser. Real-time high-frame-rate files are still capped at 32 fps. Original plan:* Keep 32 fps for
      ready → trophy; read trophy → contact + 0.1 s at 60/120/240 inside the
      existing frame budget. *Proof:* `buildServe(dials, fps)` at 30/60/120/240,
      keyframe error against the rig's true instants, ensemble at each rate.
- [x] **D1.3 Rescale slow motion instead of hedging it** · S. *Done, and wider than planned: the stretch also comes from the ball's fall (gravity at 1/2/4/8×, `slowMotion.ts`, as the methods research advised), the serve is re-read with a real-time window, and the engine measures a retimed copy. A 4× rig clip measures identically to the real one. Original plan:* When D1.1 finds a
      capture rate above the playback rate, convert every timing to real seconds
      and lift the 0.3 hedge. Keep the motion-based detector (E9) as the
      fallback when metadata is absent. *Proof:* the same rig serve, stretched
      2×/4×/8×, returns the same timings.
- [ ] **D1.4 Fuse the contact instant** · M. Take contact from the wrist peak,
      the ball-arc break and the racket box crossing the ball. Record which one
      decided; disagreement lowers confidence instead of picking a winner.
      *Proof:* rig with ball, wrist lag and dropped wrist frames dialled.
- [ ] **D1.5 The ball in fixture replay** · S. `groundTruth.ts` calls
      `measure()` without a ball, so the ball metrics escape every replay.
      *Proof:* the replay suite and clipbench carry `tossPeakHeight` and
      `contactBelowPeak`.
- [~] **D1.6 The small engine defects** (`ANALYSIS-REVIEW.md` F8) · M.
      *Gap fill — done:* a lost sample is now filled by a cubic through two
      measured samples either side. One lost sample at the drop or contact at
      30 fps: 0.07 → 0.014 body heights. Making the filter coast, as F8
      proposed, was tried and measured worse (0.09–0.12). *Gravity — already
      fine:* the ball tracker accepts ±55% of the expected gravity, so the
      1.78 m assumption moves nothing. *Blur window — left alone:* the
      whole-serve median is a deliberate, measured choice (`triage.ts`), not
      an oversight. Still open: serve-finder tolerance, one yaw formula.

### Wave D2 — One serve, judged once, by cited standards
Clean up the judgement before new readings are added to it.

- [ ] **D2.1 Cite or re-derive the remaining bands** (was E11) · L. One citation
      per band in `coaching.ts`, from the sources already in
      `ANALYSIS-REVIEW.md` §3.5 (Fleisig 2003, the 27-study meta-analysis,
      Kovacs & Ellenbecker). A band nothing supports becomes ungraded.
      *Proof:* a check fails on any graded band without a `source`.
- [ ] **D2.2 Define contact height** · S. "Ball height at contact" when D1.4 has
      the ball; otherwise "wrist height", labelled as such, with its own band.
      *Proof:* rig with the ball found and not found.
- [ ] **D2.3 Merge card and diagnosis bands** · M. Contact height and toss peak
      each get one band. Leg drive is not graded on the card while its signal is
      `UNCALIBRATED` in the diagnosis. *Proof:* a check that every signal shared
      by card and diagnosis reads one band.
- [ ] **D2.4 Serve type reaches the diagnosis** · S. `diagnose()` takes
      `serveType`, so a good kick contact cannot become a `low_contact` focus.
      *Proof:* rig kick serve, flat and kick verdicts compared.
- [x] **D2.5 Replace the strict hips-first rule** · S. *Done differently, on the
      research: hips-first is measured and no longer named, and a new
      `no_leg_drive` grades the hips' rise (Deghaies 2026, Reid 2008), placed
      after the toss in the fix order. Original plan:* `arming_the_ball` becomes
      "trunk before arm", which the IMU study supports; the pelvis-vs-trunk order
      stays measured and ungraded. *Proof:* `hipLead` sweep stops naming a fault.

### Wave D3 — New readings on footage the app already accepts
Each reading lands ungraded, then graded once D2.1 gives it a source. The rig
already has dials for D3.2–D3.4; until now nothing read them.

- [ ] **D3.1 Toss placement relative to the front foot** · M. Where the ball
      peaks, in body heights from the front ankle: front/back on a side view,
      left/right on a back view. Fall back to the tossing hand's release
      direction when there is no ball, hedged. The most useful single reading
      for a club player, and the base for kick vs flat. *Proof:* rig toss
      offsets on both axes, both camera yaws, with and without the ball.
- [ ] **D3.2 Stance: platform or pinpoint** · S. Ankle separation across
      ready → trophy (dial `pinpointSlide`, R60's blocked round). Information,
      not a fault: both stances are correct. *Proof:* pinpoint sweep, noise
      ensemble.
- [ ] **D3.3 Landing and balance** · M. Front-ankle landing (R64), hip travel
      after contact, back-foot drag (dials `landingLean`, `landingBackFootDrag`).
      Graded only for a fall across the front foot, which also loads the back.
      *Proof:* both dials swept, the two kept apart.
- [ ] **D3.4 The hitch at the trophy** · M, after D1.2. A pause measured
      against the player's own swing tempo — what reverted R52 lacked — at native
      rate (dial `trophyHitchSeconds`). *Proof:* hitch and tempo dialled
      together, kept separate at 60 fps and above; refused below.
- [ ] **D3.5 Early arm cocking** · S. Racket-wrist height against the shoulder
      at the knee trough — the published amateur signature (WTA 2026), readable
      side-on. Joins the sequence group. *Proof:* new rig dial for arm timing,
      ensemble.
- [ ] **D3.6 Side-on trunk rotation** · M. *Research caution:* no published
      validation, and the width ratio is least sensitive at the trophy. Report
      timing and order, never degrees. Shoulder span over hip span through
      trophy → contact needs no depth, so `early_shoulder_rotation` can fire on
      the recommended angle instead of lying dormant. *Proof:* `shoulderYaw`/`hipYaw`
      sweep at 82–90° camera yaw; plausibility on bench frames.
- [!] **D3.7 Swing direction at contact** — dropped. The methods research
      (`.scratch/research-methods.md` §9; Sheets 2011) puts the kick-vs-flat
      difference in the racket's sideways path, which is depth on a side-on
      camera. Kick is cued from toss and contact placement instead.
- [ ] **D3.8 The order the body fires in** · M, after D1.2. Legs → trunk → arm
      peak times (`legs_peak_ms`, `wrist_peak_ms`, `chain_span_ms`, all
      `UNCALIBRATED` today) drawn as a timeline. Graded on order only, per
      Fleisig 2003, and only at ≥ 60 fps. *Proof:* dialled order swaps.
- [ ] **D3.9 The back view as a full mode** · M. Sideways toss drift, shoulder
      tilt and sideways trunk lean read where a back camera sees them best. Each
      report says which faults its angle could not see ("film from the back
      fence to check your shoulder turn"). *Proof:* `cameraYaw` 0–15° rig
      ensemble; a check that every dormant fault names the angle that would wake
      it.

### Wave D4 — From diagnosis to programme
The diagnosis is good; what follows it is one sentence of text. This wave adds
the coaching around it.

- [x] **D4.1 Drill model v2** · M. *Done as ladders (`progressions.ts`): a
      cue, 3–5 steps, an easier way in, the mistake, and a bar of N of 6 serves
      judged by the engine. Three drills replaced on the research. Original
      plan:* `Drill` gains a feel cue, 3–5 progression
      steps (shadow → service line → half pace → full → under pressure), an
      easier version, the common mistake, and a pass mark the app can check
      (`{ metricId, threshold, ofServes }`). Written for every reachable fault,
      under `voice.ts`. *Proof:* type-level totality over `FlawId`; copy lint.
- [x] **D4.2 "Show me" from the rig** · M. Two model serves, side by side
      on one clock, under the top drill. Five faults pass both proofs (named by
      the engine; at least 0.1 body heights apart at the judged moment). Three
      were measured and dropped as invisible on a stick figure: hip-before-
      shoulder timing, early shoulder turn and toss drift. A dashed overlay was
      tried first and was unreadable.
- [x] **D4.3 Check my drill** · M. *Done on the basket sweep rather than a separate drill mode: `checkDrill` counts clean serves against the ladder's bar, the player moves up or down by tap, and the rung is remembered per fault. Original plan:* Film a basket in drill mode; only the focus
      measurement is scored against its pass mark, serve by serve. Pass moves
      you up a step; a miss offers the easier version. Extends the `practice`
      store with the step. *Proof:* seeded sessions through every transition.
- [ ] **D4.4 A weekly plan on Home** · S. The current step of each of the 2–4
      ranked fixes, in `HIERARCHY` order, with what to film to check it. No
      notifications. *Proof:* render test; plan follows triage order.
- [ ] **D4.5 Your best serve as the model** · S. The ghost overlay is the
      player's best serve of the same type (score, then repeatability), not
      their last. Add "closer to your best" deltas on the focus measurements.
      *Proof:* seeded history picks the right serve; type never mixed.
- [ ] **D4.6 Evidence on the frame** · M. "Watch this moment" draws the
      measurement itself — knee arc, contact-height line, toss-placement
      marker — on the keyframe still. *Proof:* render test per fault; preview.

### Wave D5 — Connect technique to results
The outcome taps already exist and nothing reads them.

- [ ] **D5.1 Tag any serve** · S. First/second and In/Long/Net/Wide on every
      report and on each serve chip in a basket, not only in Glance.
      *Proof:* render tests; tags survive backup round-trip.
- [ ] **D5.2 What your misses have in common** · M. Across tagged serves,
      compare each measurement between serves that went in and serves that
      missed. Say it only when the gap clears that signal's `NOISE_FLOOR` and
      enough serves sit on each side: "Your serves into the net had the toss
      further in front." Computed in `progress.ts`, data only. *Proof:* seeded
      tags with a planted difference, and a null history that must say nothing.
- [ ] **D5.3 First and second serves apart** · S. Progress splits by serve
      number. In-rate from tags per serve type. *Proof:* seeded sessions.
- [ ] **D5.4 Serve count per week** · S. Serves detected per week and a plain
      note when a week jumps well above the last four. A count, not a medical
      claim. *Proof:* seeded history; copy lint.

### Wave D6 — Richer surfaces for what already works
- [ ] **D6.1 Glance for any clip** · S. Not only in-app recordings (was W4).
      *Proof:* `screenFlow` table and test.
- [ ] **D6.2 A spoken summary after each glance** · S. `speechSynthesis` with
      on-device voices only (`localService`); silent otherwise, so §7 holds.
      *Proof:* egress test extended; voice choice unit-tested.
- [ ] **D6.3 The toss map** · M, after D3.1. Every serve's toss peak in a
      basket on one top-down plot, coloured by outcome when tagged. A view
      coaches use constantly. Existing tokens only. *Proof:* render test;
      preview at phone size.
- [ ] **D6.4 Keep the clip if you want to** · M. Opt-in, on-device (OPFS), under
      the existing storage pressure rules, so a saved report replays real video
      and before/after can be played side by side. *Proof:* storage tests at
      each pressure tier; nothing written without the opt-in.
- [!] **D6.5 Suggest the serve type** — dropped with D3.7.
- [ ] **D6.6 Progress by fault** · S. Trends per named fault and per
      progression step, beside the per-measurement charts. *Proof:* seeded
      history.
- [ ] **D6.7 RTMPose-m for the swing window** · M, optional. Adopt only if
      `/bench.html` beats RTMPose-s on wrists and elbows and the memory
      footprint test still passes; try WebGPU for `onnxruntime-web` alongside.
      *Proof:* the benchmark table in `ANALYSIS-REVIEW.md` §7, re-run.
      *Benchmark half met (2026-10-07):* it beats RTMPose-s on both sets.
      Wrists are −16% on Tennis Player Actions and −26% on 146 COCO overhead
      frames from every side (−18% on the edge-on ones);
      `bench.html?set=coco-tennis`. The footprint test is still to run.

### Order of play
D1 first, because D3.4, D3.7 and D3.8 depend on it and D1.4 sharpens every
contact-frame number. D4 and D5 do not depend on D1–D3 and carry the most
player value per round, so they can run alongside it. D2 must land before D3's
readings are graded. D6 last, except D6.1, which is one round and can go any
time.

### Findings on real footage and the rig (2026-10-06)
Measured, not guessed: `/clipbench.html` run headless on the five Commons
clips, frame sheets read by eye, and the rig's own limb lengths.

- **Two refusals were right.** The Sharapova clip has her returning and
  rallying, with no serve of hers in it. `Saque_reves` is table tennis. Both
  "not a serve" answers stand.
- **Contact height is not miscalibrated on real clips.** The two real club
  serves read wrist contact at 1.31–1.32, inside the 1.28–1.50 band.
  Anthropometry puts a real wrist lower (about 1.18–1.28 on a floor-based
  stature). The engine's own chain (ankle ground, nose ÷ 0.93) reads higher,
  so the band and the chain agree. **Left alone.**
- **The rig's arm stretches to reach its clean contact.** At
  `contactReach: 1.38` the forearm is 0.70 m against its own 0.44 m at ready.
  The reach at which it keeps its length is about 1.22. Every expectation
  dialled at the default sits on a body no player has. That is worth fixing in
  the rig (a reach-limited arm, with the jump carrying the rest), but it moves
  every noise floor derived from the rig. It needs its own round.
- **Drop depth reads at or below zero on every real rear-oblique clip**
  (−0.05/−0.06), so "the racket stops short behind you" leads on real
  footage. At 320×240 from behind, the frames cannot settle whether the drops
  were shallow or the wrist was misplaced behind the back. Open, and the next
  thing to check when better open footage turns up.
- **Arm extension** reads 160–171 on real clips. Elite literature has 14–30° of
  bend at impact (interior 150–166). The band floor of 160 sits mid-elite, but
  real readings clear it. Left alone until a clip reads below it.
- **Two ball bands contradicted the literature and are fixed** (D2.1, first
  part). The toss ceiling (1.72, and 1.78 at the top rung) sat below every
  published skilled toss peak (1.82–2.08 from the ankle line). The
  fall-before-contact band (0–0.09) called every skilled server late, since the
  ball falls 0.3–0.5 of standing height into a good serve. Both were argued from
  the wrist's contact height rather than the ball's. Ceilings are now 2.1, and
  the fall band is 0–0.55. Scoring version 3.
- **Still to cite** (rest of D2.1): shoulder tilt (meta-analysis 25 ± 7 at the
  trophy matches the 14–32 band), drop to contact (forward swing 0.13 s matches
  110–230 ms), leg drive card band (Deghaies 2026), and the provisional
  wrist-based contact height.

### Real serve motion, measured (2026-10-07)
`npm run bench:mocap` films the 40 finished serves in the Bath motion-capture
set (CC BY 4.0) with a virtual phone from five placements, at 30, 60 and
120 fps, and runs the engine's own steps on them (`ANALYSIS-REVIEW.md` §9).
No pose model runs, so what it finds is the engine's, not MediaPipe's. Timing
holds up: contact within 18 ms of the 180 Hz capture at 30 fps, and the drop
within 20 ms. Three things do not, and each is pinned as a KNOWN check in
`mocap.test.ts`:

- **`shallow_drop` is the first fix on every real serve, from every angle.**
  The hand stays level with the shoulder at a real drop while the racket head
  falls 35–44 cm. The drop bands describe the back-scratch image. This also
  answers "drop depth reads at or below zero on rear-oblique clips" above.
- **The guide's placement is filed as an angled view, and the back fence as
  side-on.** A textbook stance points the shoulders at the net; the rig poses a
  player square to it. `contactAhead` never reaches the card from where the
  guide puts the phone. *Fixed by D7.2's first half: the guide's placement is
  side-on on all 40 serves and reports `contactAhead`.*
- **The toss keyframe lands 90–210 ms after the tossing hand peaks**, because
  it is read against the shoulder while the trunk tilts. *Fixed by D7.3: it lands within
  a few milliseconds of the hand's peak.*

### Wave D7 — Agree with real motion
Every item is proven against the Bath set (the KNOWN checks flip) and anchored
to the literature, never re-derived from one player.

- [x] **D7.1 Re-anchor the drop** · M. *Done (2026-10-07): a hand near the
      shoulder is a full drop, one floor at every level, and a racket that
      never fell is scored and read out as such on the card. The elbow-angle
      grading was not used: this set's elbow angles carry a marker offset
      (`ANALYSIS-REVIEW.md` §9). The rig's drop pose is left as it was, because
      the new band holds it. Original plan:* Grade the racket's fall by what a camera
      can see of it: the elbow folded (interior angle at the low point; WTA
      top-40 67°, lower-ranked 52°, Gao 2026) and the hand behind the head.
      Stop asking the hand to drop below the shoulder. Re-pose the rig's drop
      (`dropBelowShoulder` 0.45 m is a back-scratch) and re-derive the floors
      that move with it. *Proof:* KNOWN drop check flips; real drops pass from
      every placement; rig `collapsed_elbow` still fires.
- [~] **D7.2 A camera model that matches a real stance** · L. *First half
      done (2026-10-07, scoring version 5): the rig's stance, trunk turn and
      arms re-posed on the Bath serves, and the view, the `axes.ts` routing and
      the framing advice read against the court (`court_yaw_deg`). The guide
      placement is filed side-on and reports `contactAhead` on all 40 serves;
      the back fence is not. The realistic rig also exposed five limits of a
      camera read from one shoulder span, now pinned as KNOWN checks
      (`ANALYSIS-REVIEW.md` §9). Still open:*
      - [x] **A second camera cue that says which side.** *Done
        (2026-10-07): after a capture the court angle comes from the swing's
        direction (`courtYawFromSwing`), 2.9° median error from 24 placements
        with depth noise, against 20° from the stance. Every bench placement is
        filed correctly, and the corner KNOWN check in `depth.test.ts` flipped.
        The rig's world landmarks now turn with the camera, as MediaPipe's do,
        which reversed R50c's "the trunk lead is camera-invariant".*
      - **The two stance questions that remain.** The comparison gate refuses
        a sixth of same-spot pairs near the guide's placement, and a camera 5°
        under the depth floor is read as readable on 22% of poor-light takes.
        Both ask about the shoulders, so the swing does not answer them: a
        swing varies 9–17° from serve to serve at a fixed camera, which would
        make the gate worse. *Proof:* the KNOWN checks in `axes.test.ts` and
        `robustness.test.ts` flip.
      - **`SWING_OFF_NET_DEG` beyond one player.** 19° comes from the Bath
        server. Check it against a second mocap set or published racket-path
        angles, per serve type, before relying on corner classification for
        kick serves.
      - **`SHOULDER_SPAN_RATIO` against pose-model shoulders.** COCO's
        hand-labelled frontal shoulders have a median width of 0.229 of height,
        against the 0.21 ratio. The ratio decides whether the guide's placement
        saturates on real footage. Settle it with item 1, since a court
        direction that does not use the span makes this moot for the view.
      - **Rig fidelity.** Its feet turn with its hips (Bath feet stay apart
        along the net axis), and its hand turns through contact far less than
        real serves (pronation 20–39° against a Bath median of 93°).
      - **R60·2 reopened.** From the guide's placement the stance reads at 18
        times its noise, because a real front foot is ahead towards the net.
        Platform against pinpoint is readable after all.
- [x] **D7.3 Toss from the hand** · M, was S. *Done (2026-10-07), without
      re-posing the rig's tossing arm: the release is the first top of the
      hand's lift after its fastest rise (`findRelease`), not its highest
      point, so a held arm that the legs lift later does not count. The height
      is the hand over the hips from the world landmarks plus the hips' rise
      and fall from the picture. Picture height alone read 40 ms late from the
      guide's placement, because of perspective. On the Bath serves the toss
      lands a median 4–7 ms from the hand's peak at every placement and frame
      rate without noise, and within ±50 ms (p10–p90) with tracker noise. It
      was 90–210 ms late. The KNOWN check flipped. The readings taken at the
      toss moved modestly on real serves (hold 70 → 75%, sync-at-release
      0.11 → 0.04, total time +25 ms), and no new fault is named. The
      toss-drift floor rose from 0.006 to 0.007 by its own 1.5× rule. Original
      plan:* Take release from the tossing hand's own path (its peak, or its
      upward speed falling away), not from wrist-over-shoulder. *Proof:* toss
      keyframe within ±40 ms of the hand's peak on the Bath set; rig toss
      readings re-checked.
- [x] **D7.7 Hand-under-elbow from the guide's placement** · S. *Done
      (2026-10-08), with neither option below: the reading was wrong rather
      than its grade. Read off the picture, a lens at waist height tips the
      order of a hand and an elbow a few centimetres apart. The order now comes
      from the world landmarks, which carry no perspective, and the forty Bath
      serves read 6.5–8.9% at the lowest and 12–13% at the median from every
      placement and rate (were 0% and 8–15%). The rig reads the same either
      way. Found while checking D7.3.* Two of the 40 real full drops read 0% from the guide's
      placement at 30 fps. This was already true before D7.3. The 4% floor sits
      at that placement's lowest tenth, so a real drop can be read out as
      "Hand never gets under the elbow". From that camera the reading cannot
      separate a real drop from none at the low end. Decide whether to
      withdraw its grade or move it to a placement-aware floor. *Proof:* no
      real drop from any bench placement reads under the floor.
- [x] **D7.8 Say a rotated phone, not a missing contact** · S. *Done
      (2026-10-08): `turnedPicture` reads the roll off the whole clip before a
      serve is looked for, from the ankles-to-shoulders direction averaged
      round the circle, which on level clips stays within 5.3° of upright from
      every placement. Past 30° the clip is refused as tilted, on its side or
      upside down. It also closed a gap the sweep found: a clip rolled 30–40°
      used to be levelled by `estimateRoll`'s 25° clamp and measured with the
      rest still in it. `?demo=turned` shows the screen. Found while checking
      D7.3, already true before it.* A clip rolled 89–110° is refused
      as "The clip ends before the racket reaches the ball", because the
      keyframes found in a sideways picture put contact on the toss. Estimate
      roll before the full skeleton exists, as the note on R14 in
      `triage.test.ts` describes. *Proof:* rolled clips get a camera-angle
      refusal.
- [~] **D7.4 Contact height that does not depend on the phone** · M. *Leniency
      done (2026-10-07): bands re-anchored to published impact heights, a
      measured `CAMERA_ALLOWANCE` before `low_contact` is named, and contact
      height no longer rates the player, since the phone moves it four rungs.
      The perspective correction itself is still open. Original plan:* Correct for
      the hand's depth against the body plane, or report the height only from
      placements where it holds, and cite the wrist band (D2.2). *Proof:* the
      five placements agree within the noise floor on the Bath set.
- [x] **D7.5 Say why a clip without contact was refused** · S. *Done
      (2026-10-07): worse than the message — the retry against the other hand
      found a "serve" with every keyframe on one sample, which triage refused
      as too few frames. Contact on the toss is now refused as "The clip ends
      before the racket reaches the ball." A clip cut between the trophy and
      contact still reaches triage's refusal.
      Original plan:* A capture that
      ends before the racket comes over is told it looks left-handed.
      *Proof:* the two unfinished Bath serves get a no-contact refusal.
- [x] **D7.6 Noise ensembles on real motion** · S. *Done (2026-10-08):
      `realiseReal` films the six fixture serves sixty times each with the
      rig's noise, scaled to the player's size in the picture, and
      `depth.test.ts` holds every floor against both ensembles and prints the
      table. Real motion asked for more on five signals, all read from depth or
      at a fast moment: palm-to-sky 11 → 18, lean 7 → 10, elbow lift 0.012 →
      0.017, pronation 31 → 76, and the coil 9 → 30, now `UNDER_RESOLVED`.
      At 9 the coil named early shoulder rotation on 28% of real takes, and
      every one of the forty serves flickered; at 30 it names none, and an open
      chest is still caught 85% of the time from a corner. Forty serves agree with the six
      (`ANALYSIS-REVIEW.md` §9). Original plan:* `filmMocap` takes the rig's
      `noise`, `depthNoise` and `depthBias`, so the ensembles behind every
      `NOISE_FLOOR` can be re-run on real serves and the self-referential
      floors (`ANALYSIS-REVIEW.md` F1) checked. *Proof:* a floor table, rig
      against real motion.
