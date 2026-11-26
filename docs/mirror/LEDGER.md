# Mirror ledger

The programme's brief is `docs/mirror/PROMPT.md`. One line per item: its
wave, what it turned out to be, and how it was proved. A measured "not
adopted" is a result. Items are ticked as they are committed.

## How a screen is scored

The same seven questions as Elevate, from the tour's shots at both sizes
("How a screen is scored" in `docs/elevate/LEDGER.md`): purpose, one main
action, "that's mine", width on a laptop, words, how much the visuals
explain, and taps to the next useful thing. The tour's own measures (screens
tall, words on the first screen, lime actions, text under 14 px, sideways
scroll, width use, console errors) sit in each set's `log.json`.

## Where it starts

Elevate's close (E5.6) with the laptop court screen (E5.7). Wave 0 reshoots
this as set `m0`, adds the two real-footage screens, and rescores only where
a shot differs.

| Screen | Purpose | Action | Mine | Width | Words | Visuals | Taps |
|---|---|---|---|---|---|---|---|
| 01 Landing | 9 | 8 | 5 | 7 | 7 | 5 | 9 |
| 02 Sample report | 8 | 6 | 4 | 7 | 7 | 7 | 9 |
| 03 Camera’s first-time card | 9 | 8 | – | 6 | 9 | 4 | 9 |
| 04 Filming guide | 9 | 8 | – | 6 | 8 | 8 | 7 |
| 05 Checking a clip | 9 | 9 | 5 | 5 | 7 | 6 | 10 |
| 06 Fresh report | 8 | 7 | 7 | 8 | 7 | 7 | 9 |
| 07 Report, reopened | 8 | 7 | 7 | 8 | 7 | 7 | 9 |
| 08 Lesson sheet | 8 | 7 | 4 | 6 | 8 | 8 | 7 |
| 09 Report after a drill | 8 | 6 | 7 | 8 | 7 | 6 | 9 |
| 10 Today | 8 | 8 | 6 | 7 | 8 | 6 | 9 |
| 11 Today’s session sheet | 8 | 8 | 5 | 6 | 7 | 4 | 9 |
| 12 Progress | 7 | 8 | 8 | 8 | 7 | 7 | 9 |
| 13 Settings | 8 | 9 | – | 6 | 8 | – | 9 |
| 13b Settings, never chosen | 8 | 9 | – | 6 | 8 | – | 9 |
| 14 Court screen | 8 | 8 | 6 | 8 | 7 | 5 | 10 |
| 15 Court, refused | 9 | 9 | – | 5 | 8 | 4 | 10 |
| 16 Court, strain | 8 | 8 | 6 | 8 | 6 | 5 | 10 |
| 17 Court, a fault moving | 8 | 8 | 7 | 8 | 7 | 5 | 10 |
| 18 Guided set | 8 | 8 | 6 | 8 | 7 | 5 | 10 |
| 19 Guided set, passed | 7 | 8 | 6 | 8 | 6 | 5 | 9 |
| 20 Practice video, checked | 7 | 8 | 5 | 6 | 7 | 6 | 7 |
| 21 Practice video, before | 9 | 8 | – | 5 | 7 | 3 | 9 |
| 22 Basket | 7 | 7 | 6 | 8 | 7 | 6 | 9 |
| **Mean** | **8.1** | **7.8** | **5.9** | **6.9** | **7.3** | **5.7** | **9.0** |

The tour's lime count at the start (set `w5`, with `e57` for the court
screens), before M0.2 teaches it to count only a sheet's own:

- Two on the laptop's sample report, fresh report, reopened report, report
  after a drill and basket: the main action and the player's play button
  (`watch-play`).
- Two on a phone's Today: "Start today's session" and the tab bar's Film tab.
- Two or three on every sheet (the camera's card, the lesson, the session,
  Settings), counting the screen behind it.

The budgets at the start: the entry chunk 382.60 of 385 kB raw and 130.23 of
132 kB gzip; the entry stylesheet 8.89 of 14 kB gzip; the split stylesheets
19.61 of 20 kB gzip. 2,474 checks pass.

## Wave 0: real footage and a baseline

- [x] **M0.1 A real report to measure against.** `scripts/landing-serve.mjs`
  now files its read as a stored report too (`public/landing/report.json`,
  38 kB): the frames dropped, the track kept, every clip time (the moments,
  the window, the track, contact, the ball's curve and the toss) moved onto
  the committed `serve.mp4` by matching the copy against the clip picture by
  picture, and one serve in it, since the copy is that serve alone.
  `--report` writes it alone, leaving the landing's clip and card as they
  are. `?demo=real` keeps the clip as a player's is kept and reopens the
  report; `&glance` opens the court screen. The tour shoots both
  (`07b-report-real`, `14b-glance-real`). `landingReport.test.ts` holds it:
  a report the app opens, on today's rubric, its score and first fix its
  own card's, every time inside the clip.

  Found on the way, and recorded rather than hidden:
  - *The engine doesn't read this clip the same way twice.* The landing's
    card was 79 with "Hitting elbow at drop"; two runs today read 83 with
    "Racket drop" (the trophy and the drop on one frame) and 84 with
    "Hitting elbow at drop". The extractor seeks the clip and gives up on
    a slow seek, so how busy the machine is changes the frames read. The
    trimmed copy itself reads 79 with another first fix, "Time from trophy
    to contact". So the report is the 84 read, the latest; the landing and
    a report of its serve must come from one run, which the script's full
    run now does, and M3.1 does that before the sample report becomes this
    serve.
  - *The court screen and the report disagree on a serve with no graded
    fault.* This serve's report says "Work on this next: Hitting elbow at
    drop" (the card row furthest off its band); the court screen says
    "Nothing stood out on that one", because it reads only the graded
    faults. Added as M1.4.
- [x] **M0.2 A sheet's own count.** Over an open sheet (the topmost
  `role="dialog"` with `aria-modal`), the tour now measures the sheet alone:
  its lime actions, its first-screen words and controls, and its width.
  The dimmed screen behind it can't be pressed or read. Recounted at both
  sizes:

  | Sheet | Lime | Words first, laptop | Width, laptop |
  |---|---|---|---|
  | 03 Camera's first-time card | 2 → **1** | 158 → **65** | 1 → **1** |
  | 08 Lesson sheet | 3 → **1** | 205 → **73** | 0.82 → **0.36** |
  | 11 Today's session sheet | 3 → **1** | 241 → **80** | 0.86 → **0.38** |
  | 13 Settings | 2 → **0** | 279 → **118** | 0.86 → **0.37** |
  | 13b Settings, never chosen | 2 → **0** | 276 → **115** | 0.86 → **0.37** |

  Each sheet has one lime action of its own, and Settings none (its choices
  are chosen states, not actions). The width is the finding: on a laptop
  the sheets use about a third of the width, which the old measure hid
  behind the screen they cover. That is M4.1's and M4.2's starting point.
  The camera's card is the full-width camera, so 1 is right. On a phone the
  sheets read 0.9 to 0.92 (from 0.96 to 1).
- [x] **M0.3 The baseline.** Set `m0`, shot at 47025796: 50 shots at both
  sizes, none failed, nothing clipped, no console errors. Against `w5` and
  `e57`, the measures moved only where M0.2 changed what is measured (the
  sheets, and the filming guide, which is a sheet too: 0.36 of a laptop's
  width, no lime action of its own) and where the court screen's "Read
  aloud" chip came or went with the browser's voices. No screen was
  rescored: the shots are the same. Still more than one lime action, as
  Wave 1 found: the play button beside the main action on the laptop's
  sample, fresh, reopened and after-a-drill reports and the basket, and
  the Film button beside "Start today's session" on Today at both sizes.

  The two new screens, scored:

  | Screen | Purpose | Action | Mine | Width | Words | Visuals | Taps |
  |---|---|---|---|---|---|---|---|
  | 07b Report on real footage | 8 | 8 | 8 | 8 | 7 | 7 | 9 |
  | 14b Court screen on real footage | 6 | 8 | 7 | 7 | 5 | 5 | 10 |

  The real report is the reopened report with the player's own clip and
  its moments under it (on a laptop the clip leads; on a phone the figure
  replay leads and the clip sits under it), and the only report with one
  lime action, since the browser's own controls play the kept clip. The
  real court screen says "Nothing stood out. Hit another." over a serve
  its report says to work on (M1.4), which costs it purpose and words.

  Means over the 25 screens: purpose 8.0, action 7.8, mine 6.1, width 6.9,
  words 7.2, visuals 5.7, taps 9.0.
- [x] **M0.4 Make room.** The entry chunk carried code for questions asked
  after the first paint, or after a tap. Read off a source-mapped build:
  - the offline badge's "is the model cached?" pulled in all three engine
    modules (the pose engine, the object engine, the refine engine and
    RTMPose's decoder); they now load when the question is asked;
  - the clip store loads with a reopened report, after a read, or when a
    clip is forgotten, not with the entry;
  - the backup code loads on the tap that exports it;
  - `isIOS`, `isInstalled` and `meteredConnection` moved to
    `lib/platform.ts`, so the first screen asks them without the backup
    code and the engine downloader (both re-export them).

  The entry chunk goes from 382.60 to 372.16 kB raw (10.44 freed) and from
  130.23 to 126.26 kB gzip (3.97 freed). The split stylesheets have no dead
  rules left (every class a source file names, or builds from a state, is
  drawn), so the room there is a move: Today draws the serve cards for every
  returning player, so their rules join Today's in the entry sheet. The split
  sheets go from 19.61 to 19.02 kB gzip (0.59 freed), the entry sheet from
  8.89 to 9.13 of its 14. The badge, Today, the landing and a reopened
  report with its kept clip were shot at both sizes with no console errors;
  the clip loads on both.

## Wave 1: one main action

- [x] **M1.1 Play isn't the main action.** The player's play button
  (`.watch-play`: the report's clip, the studio, the lesson's model, the
  track player) and the side by side's (`.side-play-btn`) were lime fills
  beside the screen's main action. Both are now the raised ink control
  (`--ink-4`, the icon in `--fg`), the same family as the Slow chip beside
  them, at the same size, with the same press and keys. The played-so-far
  bar stays lime: it is the current thing. The tour now counts one lime
  action on the sample, fresh, reopened, real and after-a-drill reports
  and the basket at both sizes (from two on a laptop). The lesson sheet
  counts none on its first screen: its pause was its only lime. Its action
  is further down the sheet, which M4.1's two panes bring up.
  `oneLime.test.ts` holds both rules. The tour's basket waits 9 s, not 6:
  it records its clip in real time, and at 6 s it was caught between
  screens twice.
- [x] **M1.2 The phone's Film tab.** DESIGN.md asks for both "the lime film
  button" between Today and Progress and one lime action a screen. On Today
  both stood lime: "Start today's session" and the Film button (the tab bar
  on a phone, the rail on a laptop). Decided by the screen: where it shows a
  lime main action of its own (`.shell:has(.btn--primary)`), the Film button
  steps back to a lime ring on ink, still the film button; where filming is
  the only action (Progress), it stays a fill. One CSS rule in Today's
  sheet, no prop to keep in step, so a Today with no programme (and no lime
  of its own) keeps a lime Film. The tour counts one lime on Today at both
  sizes (from two) and one on Progress. `oneLime.test.ts` holds it.
- [x] **M1.3 The report's first screen: not adopted, measured.** Listed
  control by control on `?demo=report`:
  - *Laptop, 19:* back and share (2); the studio's tools under the clip
    (11): the clip's play overlay and play button, the speed, a frame back
    and forward, the six moments; the right pane (6): the score's word and
    the speed's "Likely", each a tap to their meaning, the drill card, the
    second fix, "Start the drill" (the one lime) and "Film another serve".
  - *Phone, 7:* back, share, the two words, the drill card, "Start the
    drill" and "Film another serve".

  The laptop's count is the studio, which DESIGN.md makes the laptop's
  reason to exist, grouped under the clip. The right pane holds six, one of
  them lime, and nothing on it is off the next step. Folding the studio's
  tools would take away what the laptop is for, so nothing was folded. With
  M1.1 the screen has one lime action at both sizes, which is what this item
  was after.
- [ ] **M1.4 The court screen names what the report names** (found in
  M0.1): a serve with no graded fault but a card row to work on is "Nothing
  stood out" between serves and "Work on this next" in its report.

## Wave 2: pictures that explain

- [ ] **M2.1 The camera's first-time card** shows the placement diagram.
- [ ] **M2.2 A refusal shows its fix when the reason is the camera.** Every
  reason decided in one tested table.
- [ ] **M2.3 A practice video, before checking,** drawn as a strip with the
  sample's picks marked.
- [ ] **M2.4 Today's session sheet** shows each drill's key position and the
  player's last serve at the drill's fault.
- [ ] **M2.5 Checking a clip** shows the player's clip and the body found so
  far, in place of the model.

## Wave 3: the player's own serve

- [ ] **M3.1 The sample report is the landing's real serve,** credited and
  labelled as a sample.
- [ ] **M3.2 The laptop court screen holds the player's own clip** at the
  fix's moment when it has one.
- [ ] **M3.3 The lesson sheet's "This fault" is the player's own serve,**
  beside the fix on the model.
- [ ] **M3.4 A practice video and the basket show serves, not rows.**

## Wave 4: the laptop

- [ ] **M4.1 The lesson and session sheets** in two panes on a laptop.
- [ ] **M4.2 Settings** in two columns on a laptop.
- [ ] **M4.3 The filming guide** in two panes on a laptop.
- [ ] **M4.4 The refused court screen** with its picture in the left pane.

## Wave 5: words, purpose and the close

- [ ] **M5.1 The court screen says why once** per fault per session.
- [ ] **M5.2 One answer first** on Progress, the basket and a practice
  video.
- [ ] **M5.3 The close.** Final tour, every screen rescored, `STATUS.md`
  updated.
