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

- [ ] **E0.2 Every screen scored.**

- [ ] **E0.3 Room in the budgets.**
