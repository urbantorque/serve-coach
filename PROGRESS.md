# PROGRESS

The running log of the 75-round loop. One entry per round: what was picked, what
was built, and what the critic said before it committed.

`NEXT.md` records **what a round settled** and stays the source of truth for
round status. This file records **how the round ran** — the gates, the critic's
verdict, the retries, and any departure from the brief. Neither restates the
other.

## How this loop is wired to the ones before it

This repo already had a working loop protocol when the 75-round brief arrived:
`LOOP.md`'s eight governing constraints, `NEXT.md` as the ledger, and
`UNATTENDED-LOOP.md`'s five builders and five critics. Rather than start a rival
programme, the brief's three roles are mapped onto it:

| The brief | Here |
| --- | --- |
| Orchestrator | Picks from `BACKLOG.md`, which is a focus-area view of `NEXT.md` |
| Builder | The lead builder named in the round, per `UNATTENDED-LOOP.md` |
| Critic | The five critics, each of which must cite a `file:line` or a number |
| Circuit breaker at 3 | `LOOP.md`'s retry limits: five on engine or test work, three on UI, product or growth |

**Two deliberate departures from the brief, recorded once here rather than in
every round.**

1. **Commit messages keep this repo's style** — one declarative sentence in
   sentence case, no `feat(scope):` prefix. `LOOP.md` step 8 sets that style
   explicitly and 120 commits follow it; switching prefix mid-history would make
   the log unreadable in exactly the way the convention exists to prevent. The
   focus area is recorded here and in `NEXT.md` instead.
2. **The circuit breaker stashes before it resets.** The brief says
   `git checkout .`; `UNATTENDED-LOOP.md` says `git stash push -u -m
   "abandoned-cycle-<N>"` first, then `git reset --hard <LAST_GREEN>`. An
   abandoned round is often three-quarters of a correct one, and discarding it
   outright is how the same wall gets hit twice.

Everything else in the brief is followed as written, including the zero-slop bar
on coaching copy, which this repo already enforces mechanically in
`src/lib/analysis/__tests__/copy.test.ts`.

---

## Rounds

### Round 1 · Cycle A — CV/ML engine · `A1 · R49·2`

**Orchestrator.** Tree confirmed clean and green before anything was picked:
`tsc --noEmit` clean, `eslint .` clean, **1004 checks passed, exit 0**. State
files created (`BACKLOG.md`, `PROGRESS.md`) as views over the existing ledger
rather than as a second programme. Picked the topmost actionable round in
`NEXT.md`: R49 was already `[~]` and split, with `R49·1` landed in `e5d6954`, so
`R49·2` is the head of the ladder. Lead builder: Biomechanics & CV Specialist.
Column served: *Can I see it*.

**Builder.** `pairTracks` in `src/lib/trackPair.ts` — see `NEXT.md` for what it
settled. One departure from "prefer extending a module": `poseTrack.ts` is the
natural home and cannot be, because `db.ts` imports it and this needs
`progress.ts`, which imports `db.ts`. A new file with a README row was the
cheaper of the two.

**Critic.** Two findings raised and fixed before the verdict rather than filed:

- *Honesty.* A row claiming `yaw_measured` with no `yaw_deg` behind it made the
  gap `NaN`, which refuses as `camera_moved` — right outcome, wrong name. Now
  refuses as `yaw_unmeasured`, with its own check and canary.
- *Performance.* The below-the-hips list was a linear scan inside a per-landmark
  map. A `Set`. Trivial in cost; free in clarity.

Evidence, per critic:

| Critic | Verdict | Cited |
| --- | --- | --- |
| Honesty | pass | `trackPair.ts:54` — the 5° gate is `poseTrack.ts:60-63`'s measured crossover (floor 0.0341, 5° of camera 0.0352), not a chosen number. No reading is asserted; the sentinel-45 path refuses before the gate |
| Performance | pass | Nothing stored, no decoder, camera or canvas touched. `footprint.test.ts` unchanged and green |
| Privacy | pass | `egress.test.ts` green with the new file inside the scan set; no new egress surface |
| Architecture | pass | New file has its README row; returns numbers and enums only; three canaries, one red check each and nothing else |
| Product | pass | No new tap, no new screen. Phase 8 round — ranking not re-opened |

**Departure recorded.** The test was not written before the module. For a new
pure file with no prior behaviour there is no "revert the fix" to watch fail, so
the executable form of that standard is the canary discipline, run three times.
Two of the seventeen checks did fail on first run — both were my expectations
being wrong (stored-precision quantisation, and `replayFrom` rounding to the
millisecond), and both are now numbers written down rather than tolerances
loosened.

**Finding for the record, not fixed here.** `egress.test.ts` prints **85 source
files scanned**; `README.md` and R34's ledger entry both say 66. The assertion is
on the allow list rather than the count, so nothing is broken — but a README
number has drifted. Queued as `E5 · audit 4`.

**Gate.** typecheck clean · lint clean · **1022 checks passed, 0 failed, exit 0**
(+18). Browser verification not required: nothing player-visible changed, and
R49·3 is the round that draws.
