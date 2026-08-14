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
