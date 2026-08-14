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
