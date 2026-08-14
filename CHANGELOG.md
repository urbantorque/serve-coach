# Changelog

Player-visible changes, newest first. This file starts on 2026-08-15 — it does
not retroactively document the commits before it, which speak for themselves
in `git log`.

## 2026-08-15

- **Trip streak.** The home screen's "Your form" card now says how many trips
  to the court in a row have landed within nine days of the one before —
  "3 trips to the court in a row, roughly weekly." Counted from real analysed
  sessions, never from a tap, the same rule `sixWeekMilestone` and the drill
  button already hold. Silent until there are at least two trips in the
  current run. See `tripStreak`/`streakLine` in `src/lib/progress.ts`.
- **Tightest gap swept.** The consistency panel (after sweeping a basket, or
  reopening one that was) now names the smallest gap between your best serve
  and your worst across every basket you've ever swept — "Your tightest gap
  yet — 3 points…" on the basket that set it, "Your tightest gap so far is 3
  points, set 15 Aug." on any other. Ungameable like the streak: only moves
  by actually sweeping a tighter basket. See `bestConsistencyGap`/
  `bestGapLine` in `src/lib/progress.ts`.
- **Both records now travel onto the share card.** "Save or share this
  report" and "Share this basket" carry the same trip-streak and
  tightest-gap sentences the two screens already show, in the card's lime
  accent above the drill box / footer. Absent from the image exactly when
  it's absent on screen — no card grows a blank gap for a record that
  doesn't exist yet. See `renderReportCard`/`renderBasketCard` in
  `src/lib/share/reportCard.ts`.
- **Fastest hand speed, tracked across every session.** The "How fast you
  served" panel now names your fastest measured hand speed ever, alongside
  this serve's own reading — "Your fastest hand speed yet — 5.0 body
  heights/sec." on the session that set it, "…so far is 5.0 body
  heights/sec, set 15 Aug." on any other, in km/h once you've told the app
  your height. Built from the measured hand speed only, never the estimated
  ball-speed band — the one number `power.ts` already keeps on every saved
  report so a season of them can be compared. See `bestHandSpeed`/
  `bestHandSpeedLine` in `src/lib/progress.ts`.
- **The trip streak and the tightest gap now show up on "Every serve so
  far".** That screen already tracks your whole history — it just never
  mentioned either record. The streak sits under the hero score, the same
  line the home card already shows; the tightest-gap sentence sits under
  the "How repeatable, over time" chart it's read straight off. See the new
  `bestGapEverLine` in `src/lib/progress.ts`.
- **The fastest hand speed joins the other two records there too.** Grouped
  with the streak rather than given its own chart — both are facts about
  the whole journey, not about form, which is what the rest of that screen
  is otherwise entirely about. See `bestHandSpeedEverLine` in
  `src/lib/progress.ts`.
- **The six-week milestone reads onto "Every serve so far" too.** The
  score-by-session chart there already had the shape of this fact; it just
  never stated it in words, the way the home card already does. Same
  sentence, same rule, both places.
- **Fixed: the speed unit was spelled two different ways on the same
  screen.** "How fast you served" printed "body heights / sec" with spaces
  around the slash; the fastest-hand-speed record right beneath it printed
  "body heights/sec" without. Both now read the same way, everywhere a
  speed is shown. See `formatSpeed` in `src/lib/analysis/power.ts`.
- **"How repeatable, over time" now says how your last basket compared.**
  The chart already carried this — the gap between your best and worst
  serve shrinking or widening since the basket before — it just never said
  so in words. "25 points tighter than your last basket," or wider, right
  under the chart. See `gapDeltaLine` in `src/lib/progress.ts`.
- **A single basket's report says the same thing about itself.** Opening
  any basket now shows how its own gap compared to the one right before
  it — "6 points tighter than your last basket" — sitting between the
  best-against-worst comparison and the all-time tightest-gap record, a
  different question from either of those. Carries onto "Share this
  basket" too, the same way the all-time record already does. See
  `gapDeltaFor` in `src/lib/progress.ts`.
- **A personal-best record for your single highest-scoring serve.** Every
  report now names the best score any one serve of that type has ever
  earned — "Your best serve yet — 68." on the report that set it, "Your
  best serve so far scored 68, set 14 Aug." on any other — sitting under
  the score ring, beside the "vs your last serve" comparison. Scoped to
  the serve type on screen, the same rule the tightest-gap record already
  follows, since a flat serve and a kick serve are scored against
  different target bands. Ungameable like every other record on this
  screen: only moves by actually serving a higher score. See
  `bestOverallScore`/`bestOverallScoreLine` in `src/lib/progress.ts`.
