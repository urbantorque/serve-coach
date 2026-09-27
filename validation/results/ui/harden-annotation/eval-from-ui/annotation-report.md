# Real-footage validation: app against hand marks

Generated 2026-09-27 from 2 export files (`serve-coach-validation@1`).
Protocol: docs/VALIDATION_PROTOCOL.md. Acceptance thresholds: METRICS §5.6 and docs/specs/metrics.json.

> This report is evidence for a reviewed change to `metrics.json`. It changes no status by itself (METRICS §5.7).

## Data

| Item | Count |
|---|---|
| Serves used | 1 |
| Players | 1 (left-handed 0) |
| Annotators | 1 |
| Serves marked by two annotators | 0 |
| Entries read | 2 (duplicates dropped 1) |
| Left out: sample data | 0 |
| Left out: marks changed after the comparison was shown | 0 |
| Condition classes | unknown 1 |
| Frame rates | 60 fps 1 |
| Set-ups | side-portrait 1 |
| Engine versions | 0.0.0-dev-fixture |

### Sample against the protocol

| Requirement | Target | Now | Met |
|---|---|---|---|
| Players (V2 stage) | ≥ 8 | 1 | not yet |
| Players (full library) | ≥ 30 | 1 | not yet |
| Serves checked (full library) | ≥ 1,500 | 1 | not yet |
| Serves marked by two annotators | ≥ 25% | 0% | not yet |
| Left-handed players | ≥ 5 | 0 | not yet |
| Condition classes with serves | day and night-lights at least | unknown | not yet |

## Agreement between annotators

Reported before agreement with the app (METRICS §5.6): the app cannot be judged more precisely than two people agree.

No serve was marked by two annotators yet.

## Event timing: app against the marks

Error = app frame − marked frame (mean of annotators). Target: MAE ≤ 1 frame (METRICS §5.6).

| Event | Serves (players) | Bias (frames) | MAE (frames) | MAE (ms) | Median abs | 90th pct abs | Within 1 frame | App found it | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| Toss release | 1 (1) | -1.00 | 1.00 | 16.7 | 1.0 | 1.0 | 100% | 1 of 1 | Too little data to judge (1 of 150 serves, 1 of 8 players); so far within the target |
| Toss peak | 1 (1) | 0.00 | 0.00 | 0.0 | 0.0 | 0.0 | 100% | 1 of 1 | Too little data to judge (1 of 150 serves, 1 of 8 players); so far within the target |
| Contact | 1 (1) | 0.00 | 0.00 | 0.0 | 0.0 | 0.0 | 100% | 1 of 1 | Too little data to judge (1 of 150 serves, 1 of 8 players); so far within the target |
| Front-foot landing | 1 (1) | 14.00 | 14.00 | 233.3 | 14.0 | 14.0 | 0% | 1 of 1 | Too little data to judge (1 of 150 serves, 1 of 8 players); so far outside the target |

| Event | ≤ −3 | −2 | −1 | 0 | +1 | +2 | ≥ +3 |
|---|---|---|---|---|---|---|---|
| Toss release | 0 | 0 | 1 | 0 | 0 | 0 | 0 |
| Toss peak | 0 | 0 | 0 | 1 | 0 | 0 | 0 |
| Contact | 0 | 0 | 0 | 1 | 0 | 0 | 0 |
| Front-foot landing | 0 | 0 | 0 | 0 | 0 | 0 | 1 |

Bland–Altman on event times (ms):

Needs at least 3 serves with the event marked and found by the app.

## Metrics: app against the marks

Differences are app − marks. Heights are in % of the player's height; toss-to-hit time is judged in frames.

| Metric | Unit | Serves (players) | Bias [95% CI] | 95% LoA | MAE [95% CI] | ICC(2,1) [95% CI] | Proportional bias: slope [95% CI] | Marks inside the app's range | App produced a value | Target (now) | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Toss height | % of height | 1 (1) | n/a | n/a | 0.53 [n/a to n/a] | n/a | n/a | 100% of 1 | 1 of 1 | MAE ≤ 3% of height (0.53) | Too little data to judge (1 of 150 serves, 1 of 8 players); so far within the target |
| Contact height | % of height | 1 (1) | n/a | n/a | 2.58 [n/a to n/a] | n/a | n/a | 100% of 1 | 1 of 1 | MAE ≤ 2.5% of height (2.58) | Too little data to judge (1 of 150 serves, 1 of 8 players); so far outside the target |
| Ball drop before contact | cm | 1 (1) | n/a | n/a | 0.18 [n/a to n/a] | n/a | n/a | 100% of 1 | 1 of 1 | none | Judged through the toss peak and contact timing rows; reported as a scale cross-check |
| Toss-to-hit time | ms | 1 (1) | n/a | n/a | 26.67 [n/a to n/a] | n/a | n/a | 100% of 1 | 1 of 1 | MAE ≤ 1 frame (1.60) | Too little data to judge (1 of 150 serves, 1 of 8 players); so far outside the target |
| Toss in front | cm | 1 (1) | n/a | n/a | 2.78 [n/a to n/a] | n/a | n/a | 100% of 1 | 1 of 1 | MAE ≤ 6 cm (2.78) | Too little data to judge (1 of 150 serves, 1 of 8 players); so far within the target |
| Contact in front | cm | 1 (1) | n/a | n/a | 2.72 [n/a to n/a] | n/a | n/a | 100% of 1 | 1 of 1 | MAE ≤ 6 cm (2.72) | Too little data to judge (1 of 150 serves, 1 of 8 players); so far within the target |
| Landing distance | cm | 1 (1) | n/a | n/a | 2.17 [n/a to n/a] | n/a | n/a | 100% of 1 | 1 of 1 | MAE ≤ 6 cm (2.17) | Too little data to judge (1 of 150 serves, 1 of 8 players); so far within the target |

### By condition class (MAE, metric unit)

| Metric | unknown |
|---|---|
| Toss height | 0.53 (n 1) |
| Contact height | 2.58 (n 1) |
| Ball drop before contact | 0.18 (n 1) |
| Toss-to-hit time | 26.67 (n 1) |
| Toss in front | 2.78 (n 1) |
| Contact in front | 2.72 (n 1) |
| Landing distance | 2.17 (n 1) |

## Speed: radar against the app's experimental range

Radar readings logged: 1. Serves where the app also gave an experimental range: 0.

No pairs yet. The side view gives a range only at 120 fps or more with a target tag (D4).

## What a pass would allow

| Metric | Level now (per condition class) | If V2 passes (with cross-day test–retest) |
|---|---|---|
| Toss height | day V1, overcast V1, night-lights V0, flicker V0 | V2 ceiling is estimated (spatial); its designed status is estimated, which V3 confirms |
| Contact height | day V1, overcast V1, night-lights V0, flicker V0 | V2 ceiling is estimated (spatial); its designed status is estimated, which V3 confirms |
| Ball drop before contact | day V1, overcast V1, night-lights V0, flicker V0 | V2 ceiling is measured (timing metric), in the condition classes tested |
| Toss-to-hit time | day V1, overcast V1, night-lights V0, flicker V0 | V2 ceiling is measured (timing metric), in the condition classes tested |
| Toss in front | day V0, overcast V0, night-lights V0, flicker V0 | V2 ceiling is estimated (spatial); its designed status is estimated, which V3 confirms |
| Contact in front | day V0, overcast V0, night-lights V0, flicker V0 | V2 ceiling is estimated (spatial); its designed status is estimated, which V3 confirms |
| Landing distance | day V0, overcast V0, night-lights V0, flicker V0 | V2 ceiling is estimated (spatial); its designed status is estimated, which V3 confirms |

- V2 also needs the cross-day test–retest (sessions at least 2 days apart) in METRICS §1.3; this report does not cover it.
- Levels move per condition class. A class with too few serves keeps its level.
- Spreads (toss height consistency and the rest) stay estimated until V3: hand marks share the app's image geometry and cannot see sideways scatter.
- A failing row keeps or drops the level. Changes go through a reviewed edit of `metrics.json`, and "How we measure" is regenerated from it.

## Method

- Marked values use the engine's side-view image geometry: heights are (floor − point) ÷ standing height in the frame; forward distances use the front toe marked in the standing frame. Centimetres use the height the app used (entered, or its default).
- Bland–Altman: bias and 95% limits of agreement. With several serves per player, the Bland & Altman (2007) repeated-measures variance (between plus within players); the bias interval uses player means. Proportional bias: regression of the difference on the mean; a slope whose 95% interval excludes 0 suggests it (then use the ratio form, METRICS §5.6). With more noise in one method than the other the test leans towards a positive slope, so small slopes need care.
- MAE with a 95% percentile bootstrap that resamples players (1,000 resamples, fixed seed).
- ICC(2,1): two-way random effects, absolute agreement, single measure, with the McGraw & Wong (1996) interval. Serves are treated as targets; nesting in players is not modelled in the ICC.
- Interval coverage: share of marked values inside the app's stated interval for that serve (the app aims for 95%).
- Two annotators on a serve: agreement is reported first, then the app is compared with their mean.

Files: `validation/results/ui/harden-annotation/light-export-synthetic-serve-coach-validation@1-2026-09-27.json`, `validation/results/ui/harden-annotation/dark-export-synthetic-serve-coach-validation@1-2026-09-27.json`
