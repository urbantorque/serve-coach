# Notch review — 2026-10-18

The owner asked for a detailed review of the app, with a grade out of 10 for:
- its core principles;
- its design and user experience;
- its look and feel;
- its serve-speed estimation today.

The review also looks for features to enhance, introduce or refine. From it
comes a roadmap that takes the app up another notch, built so it can be
carried out without a person in the loop.

This file is the reasoning. The ledger is the **Notch programme** at the end of
`ROADMAP.md`, the same way `LEVEL-UP-REVIEW.md` sits behind the Level-up
programme.

**How it was done.**
- Two parallel read-only reviews, both citing `file:line`:
  - the engine and serve speed;
  - the product and its flow.
- A walk through the live app at 375×812 in the preview: home (new and
  returning), the example report, `?demo=history`, a reopened report, the
  history sheet and `?demo=glance-score`.
- The untracked `src/lib/vision/serveSpeed.ts` and its test, run alone in the
  repo's own esbuild harness, plus scratch probes of its coverage by frame rate
  and noise. Nothing in the repo was changed by the review.

**What the proposals keep to.** Every rule from the programmes before still
holds:
- every item is proven by machine;
- nothing re-skins (`design-is-the-original-dark-skin`);
- nothing leaves the device;
- the copy lint governs every new line;
- the entry bundle stays under 130 kB. It is at 126.8 kB, so new screens load
  lazily.

---

## The grades

| Area | Grade | One line |
|---|---|---|
| **Core principles** (privacy, honesty, coaching value) | **9** | Egress tested, typed refusals with a way out, every trend held to the camera's noise floor, every graded band cited. |
| **Engine truth on club footage** | **6** | Strong pose and mocap benches, but no labelled real club clip anywhere (`RECORDED = []`). |
| **Coaching programme depth** | **7** | Ladders, feel cues, a pass bar, graduation and re-checks. But a re-test only happens on a picked basket, and sessions never move the ladder. |
| **User experience and flow** | **6.5** | The picked-clip loop is clean. The on-court loop costs two walks per serve, and every retry goes back through Home. |
| **Information architecture** | **6** | The report has about 18 blocks with a 15-element focus card. Progress is 16 sections, mostly sentences. |
| **Look and feel** | **7.5** | The dark lime skin is restrained and premium. It loses marks for the thin tracked figure beside the filled model figure, a text-heavy Progress, and meaningful labels at 11 px in a faint grey. |
| **Onboarding** | **7.5** | One sheet at the moment of intent, an example report, no level quiz. The 57 MB download still lands on the first analysis. |
| **Motivation and retention** | **6** | Honest streaks, bests and a serve path. But set results vanish, nothing in the app celebrates a cleared fault, and there is no reason to open it on court beyond filming. |
| **Accessibility** | **7** | Live regions, shape badges, reduced motion, read aloud. The framing verdict is visual only, which is useless from the baseline. |
| **Serve speed today** | **1** | Nothing is measured or shown. The only pace reading is the racket-drop-to-contact time. |
| **Serve speed, `serveSpeed.ts` as written** | **4** | Sound physics and honest ranges. But nothing finds the ball after contact, the read resolution gives 0% coverage, portrait gives about 0%, and its own test is red. |
| **Product overall** | **6.5** | Up from 6 on Oct 17 only for what this review saw in use. The engineering prototype stays at **8.5**. |

---

## Core principles — 9

**What earns it.**
- **Privacy is enforced, not promised.** The egress allow list fails the suite
  on any new `fetch(`. The report footer says "Nothing was uploaded", and that
  claim is checked.
- **Honesty is structural:**
  - every graded band names a source;
  - readings without one stay `UNCALIBRATED`;
  - a score change has to clear the per-serve noise floor (`realChange.ts`);
  - a scoring-version change is said aloud rather than shown as progress;
  - every refusal has an escape ("Show me the numbers anyway").
- **The coaching is ranked:** 2–4 drills, worst cause first, with the rest
  counted rather than listed.

**What holds it off 10.**
- **Three drills can compete on one report.** On a reopened `?demo=history`
  report:
  - the focus says *Toss and point*;
  - item 2 says *Back-leg serves* for the legs;
  - the season practice card says *Push throws* for the knee bend.

  That makes two drills for one body part and three things to do. One fault
  should always mean one drill, wherever it shows.
- **A player can be told two things at once on the glance.** It shows "▲ 9 vs
  your last serve" with "No change from your last serve." under it. The second
  line is about the fault (`verdict.ts:651`), but it reads as the score.

---

## Design and user experience — 6.5

**The loop that works.** Pick a clip, get a ranked report, and drill. The
guide appears once, at the moment of intent. It is three taps plus the file
picker to a first report, and one plus the picker after that.

**The loop that does not.** The recommended route on court is to record in the
app, read the glance and record again. Along that route:

1. **Two walks per serve.** Tap record, walk to the baseline, serve, walk back,
   tap stop (`FramingCheck.tsx:391-396`). There is no countdown, no automatic
   stop and no spoken framing verdict. The pose loop that could see the landing
   is already running in the viewfinder.
2. **The drill never gets checked.**
   - `checkDrill` runs only inside `compareServes` (`useAnalysisRun.ts:478-486`),
     which is for a basket that was picked from the gallery.
   - Recorded serves are glanced at, one by one, and never pooled.
   - So the route the app recommends can never say "Move up a step".
3. **Sessions are walled off.**
   - `weekPlan(sessions: Session[])` takes reports only (`weekPlan.ts:72`).
   - A whole practice's worth of evidence never touches the ladder, graduation
     or the week plan.
   - An in-app recording stops at 90 s (`record.ts:75`), so it can never become
     a session, which needs more than 150 s.
4. **Every "go again" goes Home.** "Analyse another", the refusal's "Film it
   again" and the error screen's "Try another video" all call `goHome`. The
   refusal's real fix, the framing check, is two taps further on.
5. **Tagging is buried.** "Tag this serve" is inside the fold
   (`Report.tsx:1345`). Yet in-rate, first and second serves, sets and the toss
   map all depend on it.

**Computed but never shown.**
- `missesInCommon` (`progress.ts:1617`) says what a player's net, long and wide
  serves share. It is tested, but nothing renders it.
- The set history (`prefs.sets`, `bestSet` in `sets.ts:95`) is stored and
  backed up, but a finished set lives for one line on the glance and is gone.

**Discoverability.**

| Feature | How a player finds it |
|---|---|
| Week plan | Easily |
| Glance | Mostly by accident. A reopened report never offers it (`App.tsx:808-812`). |
| Sessions | Nowhere: nothing says "film a whole practice and pick it" |
| Level | Only inside a report |
| Read aloud | Only on the glance |

---

## Look and feel — 7.5

The settled skin earns its keep:
- the cool ink ramp;
- one lime accent;
- rounded cards with real elevation;
- the court-light wash.

Home, the focus card and the glance look premium at 375 px. Nothing here asks
for a re-skin. The points below all sit inside it.

- **Two figure languages on one page.**
  - The model serve and the fault demos use the tapered, filled figure from L4.4.
  - The player's own body is drawn as thin sticks: the played-back figure, the
    six moments and the trophy beside the model.
  - In the six moments, a small thin figure floats in a large empty tile.
  - The player's own body should look at least as good as the drawing it is
    compared with, without inventing anything the tracker did not see.
- **Progress reads as a document.** Sixteen sections, most of them sentences.
  The data a player cares about deserves a picture:
  - the score over trips;
  - when each fault appeared and cleared;
  - in-rate by serve.
- **Labels that carry meaning are faint and small.** Overlines such as
  "WORK ON THIS NEXT" and "THEN, IN THIS ORDER" are 11 px uppercase
  (`tokens.css:293-300`). They pass the floor test, but they are the signposts
  of the page.
- **The model serve may caption the wrong moment.** Mid-play it showed "Full
  extension, highest point of the swing" with the *Racket drop* chip lit. This
  needs a check: it may be a caption that lags a frame.
- **Empty states end in nothing.** "No serves analysed yet." in the history
  sheet has no action.

---

## Serve speed — today 1, as written 4, achievable 6–7

**Today.**
- No ball or racket speed is measured or shown. The only `km/h` and `m/s` in
  `src` are in comments.
- `outbound.ts:20` and `ANALYSIS-REVIEW.md:393` hold a deliberate rule: "No
  speed in mph, ever". That was right for one 30 fps camera.
- The pace-like readings are:
  - `dropToContact`, graded against Newton 2025's 110–230 ms;
  - the "second serve slower" line on Progress.

**`serveSpeed.ts` (untracked, 1,026 lines, no caller).** This changes the
arithmetic behind the old rule.

- **Ruler:** gravity. The toss's fitted curvature gives frame heights per metre
  at the toss's own distance, which is where the ball is struck. No player
  height is assumed. That beats the engine's current 1.78 m body.
- **Depth:**
  - a ball flying towards or away from the lens grows or shrinks in the
    picture;
  - a five-unknown fit reads that from the track's apparent acceleration;
  - air drag is corrected (Cross & Lindsey, C_d 0.507).
- **Ranges:** the stated range held the true speed on 95–100% of every
  simulated trial, including with decoys. On the decoy run:
  - the 95th-percentile error was 2.8%;
  - the bias was +0.9%;
  - the typical range was ±4.5%.
- **Gates:**
  - at least 5 frames of the struck ball;
  - a half-range no wider than 12.5%;
  - a typed reason for every miss. Four of the six declared reasons are never
    produced.

**Why it scores 4 as written.**

1. Its own test is red: 4 passed, 3 failed.
   - The ruler's worst case is 79.8% out. It flags itself with a 69% scale
     error, so the assertion is the thing to fix.
   - Landscape coverage is 39 of 60 against a bar of 40.
   - Decoy coverage is 56 of 240 against a bar of 100.
2. **Nothing finds the ball after contact.**
   - `ballCandidates` stops two frames after contact (`analyze.ts:679`).
   - It looks only in the toss column, 1.4 body heights wide (`ballTrack.ts`).
   - It reads at 384 px, or at 256 px for the full frame.
   - It wants a round blob, and a struck ball is a streak.
   - `findStreaks` exists but has never seen real footage.
3. **The frame grid is too coarse.**
   - The pose pass samples at most 32 frames per file second (`rate.ts`).
   - A speed needs every native frame from contact to about +200 ms, read at
     their real timestamps.
4. **Coverage by frame rate**, from scratch probes, landscape and side-on:

   | Frame rate | Clips that get a speed |
   |---|---|
   | 30 fps | 0% |
   | 60 fps | 12–13% |
   | 120 fps | 45–52% |
   | 240 fps | 35–68% |

   - Portrait reads about 0% at every rate.
   - At the noise the app's 256 px full-frame read gives (7.5 px), it reads 0%.
   - 240 fps with decoys reads fewer clips than 120 fps, which needs
     explaining.
5. There is no ball-speed ground truth anywhere: the Bath capture never marked
   the ball.

**What lifts it to 6–7.**
- A dedicated pass from contact to +200 ms that reads every native frame:
  - in a net-side window;
  - near native resolution;
  - at the timestamps the decoder really gives.
- A streak-aware ball centre.
- The impact moment pinned from the strike's sound. `audio/onsets.ts` already
  finds strikes on a 2.5 ms grid.
- A rendered-pixel test from end to end.
- An honest refusal for portrait and 30 fps clips that tells the player how to
  get a speed.

The ceiling short of 10 is the one a machine cannot lift: no real serve with a
radar reading to check against. Until then the speed is shown as a range and
marked `UNCALIBRATED`. It is never graded and never part of the score.

**The owner's call.** Showing any speed reverses a recorded rule. The
programme builds and tests the engine first (N2.1–N2.6), and holds the screen
work (N2.7 onward) until the owner agrees.

**The gravity ruler has a second use.** The same scale gives the toss height
and the contact height in metres, measured rather than assumed from a typical
body. Those are readings players ask for, and they need no slow motion.

---

## What the programme does about it

The ledger is in `ROADMAP.md` under **Notch programme**. In short:

| Wave | What it does | Lifts |
|---|---|---|
| **N0** | Fix what a player trips on: the glance contradiction, competing drills, a broken sentence, retries that go Home, and a green `serveSpeed` test | Principles, UX |
| **N1** | The on-court loop: hands-free recording, a spoken framing verdict, drill checks from recorded serves and from sessions, a court card and today's plan | UX, coaching, retention |
| **N2** | Serve speed, honestly: a struck-ball pass, a streak-aware centre, impact from sound, a pixel test, then the range on screen and over time, plus heights in metres | Speed |
| **N3** | Show what is already computed: misses in common, set history, before and after, the glossary everywhere, history by trip | Retention, IA |
| **N4** | Look and feel inside the skin: the player's figure drawn as well as the model's, a diet for the report and Progress, readable signposts, one placement rule | Look and feel, IA |
| **N5** | Truth a machine can lift: a toss finder that works in portrait and at oblique angles, and the open-data benches made to report ball and speed coverage | Engine truth |

**Targets if it all lands:**

| Area | Now | Target |
|---|---|---|
| UX and flow | 6.5 | 8 |
| Coaching depth | 7 | 8 |
| Information architecture | 6 | 7.5 |
| Look and feel | 7.5 | 8.5 |
| Retention | 6 | 7.5 |
| Serve speed | 1 | 6 (7 with a validated detector) |
| Product overall | 6.5 | 7.5–8 |

Market readiness and engine truth on club footage stay capped by the owner's
calls in the Lift programme: real players, hosting and a remote.
