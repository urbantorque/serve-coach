# Elevate ledger

The programme in `docs/elevate/PROMPT.md` (Part 2), started 2026-11-26 from
`main` at 68e8910. One line per item: its wave, what it turned out to be, and
how it was proved. A measured "not adopted" is a result. Items are numbered by
wave, E0.1 onward; each is one commit, gated
(`npm run typecheck && npx eslint . && npm run build && npm test`).

The galleries are `docs/elevate/gallery/index.html`, opened from disk: pick any
two sets to see them side by side, at 390 by 844 or 1440 by 900. Each set is
one run of `node scripts/tour.mjs <set>` against the dev server.

## How a screen is scored

Each main screen, 1 to 10, from the tour's shots at both sizes:

- **Purpose**: one clear purpose (DESIGN.md's first test).
- **Action**: one main action, and lime only on it (the second test).
- **Mine**: a player's first reaction is "that's mine" (the third). A dash
  where the screen holds nothing of the player's (a settings sheet, a card of
  rules).
- **Width**: on a laptop it uses the width (the fourth). The tour logs how much
  of the width past the rail carries words or pictures on the first screen
  (`widthUse`): a phone column alone in the middle reads about 0.4.
- **Words**: plain, short, no repetition, no admin, leads with what to do.
- **Visuals**: how much the pictures explain on their own.
- **Taps**: taps to the next useful thing, scored 10 for none (it comes to the
  player), 9 for one, 7 for two, 5 for three, 3 for more. The count is beside
  the score.

The scores are judgement against the shots, made by the same reader each wave
from the same tour. The tour's own measures (screens tall, words on the first
screen, lime actions on the first screen, text under 14 px, sideways scroll,
width use, console errors) are machine figures and sit in each set's
`log.json`.

## Wave 0: a baseline to measure against

- [x] **E0.1 A committed screen tour.** `scripts/tour.mjs` visits 23 states
  through the demo routes and the app's own taps (the landing, the sample
  report, the camera's first-time card, the filming guide, a real clip being
  checked, a fresh, reopened and after-a-drill report, the lesson sheet, Today,
  today's session sheet, Progress, Settings twice, the court screen five ways,
  a guided set twice, a practice video before and after, and a basket), at
  390 by 844 (touch, 2x) and 1440 by 900, and writes each shot, a whole-page
  shot where the page is longer than a screen, and the page's own measures
  into `docs/elevate/gallery/<set>/`, then rebuilds `index.html`. MediaPipe's
  own log lines are kept but not counted as the app's errors. `--sheet a b
  size` renders two sets side by side as one picture. Proved by the run: set
  `w0`, 46 shots, none failed, no console errors from the app. Shot at
  68e8910; the laptop shots from Today on were taken with E0.3's icon split
  already in the working tree, which draws the same pixels.

- [x] **E0.2 Every screen scored.** The baseline below, from set `w0`.

| Screen | Purpose | Action | Mine | Width | Words | Visuals | Taps | What holds it back |
|---|---|---|---|---|---|---|---|---|
| 01 Landing | 9 | 8 | 5 | 7 | 7 | 5 | 9 (1) | The real serve plays with no fault drawn on it; the peek card's "Hitting elbow at drop" is jargon; "Download it now" is a second lime thing. Laptop: the right pane is empty under the words. |
| 02 Sample report | 8 | 6 | 4 | 7 | 6 | 6 | 9 (1) | The title is restated by the next sentence; "What to do now" and "Film your serve" pull two ways; laptop has two lime actions. |
| 03 Camera's first-time card | 9 | 8 | – | 6 | 9 | 4 | 9 (1) | Words only: the set-up is not drawn, though the filming guide has the drawing. "Upload a video instead" is a second lime thing. |
| 04 Filming guide | 9 | 8 | – | 6 | 7 | 8 | 7 (2) | "very fast" (filler the voice lint bans); five long steps before the one action. |
| 05 Checking a clip | 9 | 9 | 5 | 5 | 6 | 6 | 10 (0) | Says what it is doing but never how long; the figure is a model, not the player. |
| 06 Fresh report | 8 | 6 | 7 | 8 | 6 | 6 | 9 (1) | "What to do now" and "Start the drill" open the same lesson; "Change" and "Tell me how this serve went" add lime; the title is restated below it. The rig's clip is blank, so the held frame shows only the painted arm: the tour cannot judge that picture. |
| 07 Report, reopened | 8 | 6 | 7 | 8 | 6 | 6 | 9 (1) | As 06. |
| 08 Lesson sheet | 8 | 7 | 4 | 6 | 8 | 8 | 7 (2) | "This fault / The fix" are both the model, never the player's own; the play button is the biggest lime thing; the sheet's action is below the fold. |
| 09 Report after a drill | 6 | 6 | 7 | 8 | 5 | 5 | 9 (1) | Three grey lines before the fault ("About the same", "Your best session yet", "No change I can trust yet") that half contradict; whether the drill worked is not the lead. |
| 10 Today | 8 | 7 | 5 | 5 | 7 | 4 | 9 (1) | The goal card leads with "This drill isn't working yet. What now?"; serve cards are the same figure at the same moment, three with the same title; laptop's right column is empty under three numbers. |
| 11 Today's session sheet | 7 | 3 | 5 | 6 | 6 | 4 | 9 (1) | Three stacked exits (two big buttons and a link); the minutes ("5", "13", "8") have no unit and read as scores, in lime. |
| 12 Progress | 7 | 8 | 6 | 7 | 6 | 5 | 9 (1) | Four notes under the chart; then and now are two alike figures with nothing marked; the fault rows are walls of dark squares with no pass bar; laptop leaves a hole under the tiles and the speed chart's labels are oversized. |
| 13 Settings | 8 | 8 | – | 6 | 8 | – | 9 (1) | The chosen option is marked by a lime outline alone, unlike every other selected state. |
| 13b Settings, never chosen | 8 | 6 | – | 6 | 6 | – | 9 (1) | Neither hand is selected; "Work it out for me" wraps inside its pill; "No backup yet. Once you've filmed a serve" beside 29 serves. |
| 14 Court screen | 8 | 7 | 5 | 4 | 6 | 3 | 10 (0) | The phone's court layout shows "81 mph" with no "about"; "Tell me how this serve went (optional)" is lime beside the main action; laptop: a narrow centre column, the actions top right, the rest empty (width 0.49). |
| 15 Court, refused | 9 | 9 | – | 4 | 8 | 4 | 10 (0) | Laptop width 0.41. |
| 16 Court, strain | 6 | 7 | 5 | 4 | 6 | 3 | 10 (0) | The strain warning sits under the fix and the button, not first. |
| 17 Court, a fault moving | 8 | 7 | 6 | 4 | 7 | 3 | 10 (0) | The move is a line of text; nothing shows it. |
| 18 Guided set | 5 | 7 | 5 | 4 | 5 | 3 | 10 (0) | The headline names the tossing arm while the set checks the racket drop; "This fault looks the same" leaves which fault open. |
| 19 Guided set, passed | 6 | 4 | 5 | 4 | 6 | 3 | 9 (1) | Two lime buttons: "Film another serve" and "Move up a step". |
| 20 Practice video, checked | 7 | 5 | 5 | 6 | 7 | 6 | 7 (2) | No main action ("Back home" at the foot); laptop's left pane is empty under the summary. |
| 21 Practice video, before | 9 | 7 | – | 5 | 6 | 3 | 9 (1) | "Cancel" is the biggest button; "Times are from your phone, on this video" is unclear. |
| 22 Basket | 7 | 6 | 6 | 8 | 6 | 5 | 9 (1) | As 06, with "First serve filmed" on a basket of five. |
| **Mean** | **7.7** | **6.7** | **5.4** | **5.8** | **6.5** | **4.8** | **9.0** | |

  Across both sizes: no text under 14 px and no sideways scroll on any shot;
  lime actions on the first screen: on the phone, one on 13 shots, two on
  6, three on the session sheet, none on the checking screen and the two
  practice screens; on the laptop, two or three on 12 of 23.

- [x] **E0.3 Room in the budgets.** Measured with `bundle.test.ts`'s own
  method (gzip level 9) on a build of 68e8910 and on this commit:

  | | Before | After | Freed |
  |---|---|---|---|
  | Entry chunk, raw | 384.83 kB | 381.56 kB | 3.27 kB (of a 385 budget: room 0.17 → 3.44) |
  | Entry chunk, gzip | 130.70 kB | 129.57 kB | 1.13 kB (of 132: room 1.30 → 2.43) |
  | Entry stylesheet, gzip | 8.35 kB | 8.23 kB | 0.12 kB (of 14) |
  | Split stylesheets, gzip | 19.82 kB | 19.75 kB | 0.07 kB (of 20: room 0.18 → 0.25) |

  What moved. The glyphs: `icons.ts` keeps the 17 an entry module draws, and
  the 13 only lazy screens draw (back, calendar, chevron, clock, gallery,
  pause, play, repeat, share, sound, target, trash, warn) are in
  `iconsMore.ts`, fetched 1.2 s after the first paint (`main.tsx`) or sooner
  by any `Icon` that needs one, which holds its box until it lands
  (`glyphs.ts`). `scripts/icons.mjs` writes both files, and
  `iconSplit.test.ts` fails if an entry module names a later glyph. The
  delta chip's rules moved from `progress.css` to `today.css`: Today draws the
  chip, and it was unstyled there until Progress had been opened once, a
  defect found by listing the classes entry modules use that only a lazy sheet
  styles. About 110 lines of rules nothing draws came out (`.empty` and its
  parts and `.error-detail` in `states.css`, `.session-figure--*`,
  `.model-serve--quiet`).

  Not adopted: a deeper cut of the entry chunk. Source-mapped, it is React
  (141 kB), then the coaching tables (`coaching.ts` 21 kB, `progressions.ts`
  15 kB), `progress.ts` and `db.ts` (15 kB each) and `App.tsx` (14 kB). Today
  reads the tables to name the goal and the next drill, so moving them is a
  restructure, not a split; it waits until an item needs more than 3.4 kB.
  The split stylesheets have no dead weight worth the name left (a class
  scan with the code's strings, and a scan of the modules nothing imports),
  so their room stays thin: an item that adds a lazy screen's styles pays for
  them in the same commit, from what it replaces.

## Wave 1: seamless flow

- [x] **E1.1 The core loop, as taps and waits.** Read off the code and the
  `w0` tour, for a returning player on a phone (hands-free is on by default
  there):

  | Step | Taps | Wait | What it asks for |
  |---|---|---|---|
  | Landing or Today, to the camera | 1 (Film) | | A first-timer also taps "Got it" on the three rules (2). |
  | Filming one serve | 1 (start) | 5 s spoken countdown | Recording stops on its own after the serve, or at 90 s. Upload instead: 1 tap and the phone's picker. |
  | Checking | 0 | 45 to 54 s for an 18 s clip on a laptop (W6.9); unmeasured on a phone | Says what it is doing; says how long only once a serve has been checked before. |
  | Court screen | 0 | back to the camera in 15 s | "Open the full report" is 1 tap. |
  | Report, to the drill | 1 (Start the drill) | | "What to do now" opens the same sheet. |
  | Lesson sheet, to the check | 1 (Film serves to check it), after a scroll | | The film button is below the fold on a phone. |
  | A check of six serves | 0 a serve | 5 s countdown each, back in 15 s | Each serve is judged against the drill's one fault. |
  | Passed, to the next step | 1 (Move up a step) | | Beside "Film another serve", both lime. |
  | Back to Today | 1 | | |
  | Today, to today's drill | 2 (Start today's session, Show the drill full screen) | | The film check is a second big button; the calendar a third. |

  So a whole loop, from Today to a passed step and back, is 6 taps and a
  scroll, plus the six serves themselves, which take none. What this wave
  changes: the check waits with no estimate the first time; three screens
  ask the player to choose between two or three equal exits (the session
  sheet, the passed set, the practice video); Settings shows no choice for a
  player who never made one. No step in the loop is a dead end; the practice
  video's screen ends on "Back home" with the next drill a small button
  inside the first fix.

- [x] **E1.2 Today's session sheet: one main action.** The foot held three
  stacked exits: "Show the drill full screen" (lime), "Film serves to check
  it" (a full-width button) and "Add to calendar". Now the drill is the one
  main action; the check is filmed from its own row in the plan ("Film 6
  serves to check the first drill's step", with a camera), at the point in
  the session it comes; and the calendar is a quiet link beside the time.
  The minutes read "13 min", not a bare "13" in lime that looked like a
  score, and the drill rows' minutes are no longer lime. A plan with no
  drill yet ends on "Film a serve" as its one action. Taps are unchanged (2
  from Today to the drill or to the check); exits at the foot 3 to 1, lime
  things on the sheet 2 to 1. Proved by the tour (`11-session-sheet`, both
  sizes) and the gate.

- [x] **E1.3 Settings shows its guesses.** A player who never chose saw
  neither hand selected, and "How often do you get to a court?" offered a
  fourth pill, "Work it out for me", that wrapped onto two lines and never
  said what it had worked out. Now the hand the latest serve was read with
  (right, with no serves) is shown chosen, under "From your serves, I’ve
  guessed right-handed. Tap the other if that’s wrong."; and the pace the
  streak is already read at (`inferCadence`, from the serves, the session
  ledger and the practice videos) is shown chosen among three pills that fit
  on one line, under "I’ve guessed this from your sessions." One tap on the
  other option sets it, as before. `App.tsx` passes the history in place of
  the count, so it stays 1,196 lines. Proved by the tour (`13b-settings-new`
  against `w0`: no hand chosen and a wrapped pill before; both guesses
  chosen and every pill on one line after) and the gate. The "No backup
  yet" line under it is a demo-route artifact (the seeded serves are never
  stored), not this screen's.

- [x] **E1.4 One look for "chosen".** Eight rules marked a chosen option
  four ways: a lime outline (Settings), a filled panel (segmented controls),
  a lime glow (pressed chips), a lime fill (serve chips, serve tags). Each
  now draws one token, `--chosen` (a raised fill, `#2d3649`, with a top light
  `--chosen-edge`), and none draws lime, which stays for the main action. A
  guessed tag is outlined in the faint text colour until confirmed. Not
  choices, and left alone: the current tab, the framing pips, a chart's
  picked dot. `chosenState.test.ts` reads every stylesheet and fails if a
  chosen rule leaves `--chosen` or uses lime; `contrast.test.ts` still
  passes. Proved by the tour (Settings, the session sheet's time, the
  report's tags) and the gate.

- [x] **E1.5 Every wait says how long; every empty state and error says
  what to do.** The audit: the practice video says its minutes before and
  its time left while it runs; the coach's download says its size and its
  progress; the empty Progress screen says "Film two serves" with the button
  under it; a refused clip lists what to change; the crash screen offers a
  reload and a backup. The one gap was the first checks on a device:
  `estimateLine` says nothing until it has timed three, so a first-time
  player watched a bar with no length. They now read "About a minute or
  two. After a few serves I’ll know this phone’s own pace." (with "plus the
  first download" when the coach is not yet in), until the device's own
  figure replaces it. The range stands on W6.9's laptop timing (45 to 54 s
  for an 18 s clip); no phone has been timed, so its top is left wide, and
  a sweep's cells count its serves off instead. `estimate.test.ts` holds the
  line to the voice lint and to the screen. Proved by the gate.
