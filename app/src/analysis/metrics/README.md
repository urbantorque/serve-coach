# Metrics layer (engine-core)

Every value is a `MetricValue` with an honesty label (measured, estimated, player-entered, experimental, unavailable), a reason code on every downgrade or unavailable value, and, for numbers, a 95% interval built from the METRICS §1.2 components (σ_r, σ_leak, σ_s + σ_p).

| File | What it does |
| --- | --- |
| `catalogue.ts` | Runtime copy of `docs/specs/metrics.json` (units, target statuses, views, unlock hints, plausibility bounds; `catalogue.test.ts` checks drift) and the engine-side **validation levels** from the latest synthetic run. Status = min(target, validation ceiling in the session's condition class). |
| `status.ts` | `finalizeMetric` (ceiling → night cap → per-value downgrades) and `unavailable` (reason text + unlock hint). Wrong view → `NEEDS_SIDE_VIEW` / `NEEDS_REAR_VIEW`. |
| `perServe.ts` | Formulas of §3 per serve: toss height (depth-corrected), toss forward/lateral, drop (physics), contact height/forward, rhythm, trophy pause, leg drive, drive time, loading depth, deep-bend flag, shoulder tilt (φ kept internal, never displayed), rear knee band, shoulder over shoulder, landing distance, launch speed (D4 prerequisites), plausibility bounds. |
| `session.ts` | Per-stratum aggregation: centres, noise-corrected spreads with censoring and "at least", provisional labels, provisional bands with hysteresis, F3/F4/F12 trigger statistics, repeatability, fatigue flag; every metric id present with a status. |
| `repeatability.ts` | The experimental 0–100 index and the representative serve. |

Current validation levels (synthetic, 122 clips): V1 for serve count, toss height and contact height (D1 distances ≥ 6 m), toss drop, rhythm (≥ 45 fps), leg drive, loading depth and the four spreads; everything else V0 (experimental) with the reasons in `catalogue.ts` and `validation/results/metrics/SUMMARY.md`.

Unknown phone pitch (imports, no motion access): per METRICS §1.1 item 3, absolute heights and positions are capped at experimental (`PITCH_UNKNOWN`), but spreads keep their status. `finalizeMetric` records the status a value would have with a known pitch in `MetricValue.statusIfLevel`; the spread summaries (`session.ts` `collect(…, forSpread)`) and coaching's spread series (`coaching/series.ts` `forSpread`) use it, and the report shows each toss peak against the middle one instead of absolute heights (integration change).
