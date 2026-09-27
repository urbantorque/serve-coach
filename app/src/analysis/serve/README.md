# Serve layer (engine-core)

Serve finding, rectification, left/right relabelling, events and phases (METRICS §1.1, §2). Pure TypeScript; no DOM.

| File | What it does |
| --- | --- |
| `geometry.ts` | Camera model: long-side FOV mapped to the displayed orientation (26 mm: 67.3°, f_HU 0.751 portrait), pitch/roll from `CaptureContext.orientationSamples`, the level rotation `H = K·R·K⁻¹` (5° cap; measured rear tilt up to 25°), camera distance `D = f_HU·H_m/H_HU`, set-up class. |
| `track.ts` | Compact rectified pose track; landmark access with visibility floors; mid-hip, lowest foot point, head top; local quadratic values and velocities (never frame differences). |
| `relabel.ts` | The mirror fix. Two-state Viterbi per limb group (upper, lower): transitions from limb continuity, evidence from the entered handedness (tossing hand nearest the ball around release, highest wrist at contact, front foot towards the net in stance). On the corpus the mirrored share of side-view frames drops from 37% to 0% (median). |
| `windows.ts` | `findServeWindows`: label-free anchors on the higher wrist (≥ 0.95 BH, ≥ nose + 0.08, prominence ≥ 0.30 BH, a toss before), merged within 1.2 s, windows [t − 2.2, t + 2.0] s split at midpoints. Works on sparse (15–30 Hz) poses. |
| `ball.ts` | Per-window toss track, lead-in, `analyseToss` on rectified observations, the §2.4.3 apex case (bracketed, fitted above the frame, censored, too few), `ball-intersection` and `ball-bracket` contact. |
| `events.ts` | Generic fusion rule; measured noise per serve (§5.5); release (hand method as a lag-corrected fallback only), trophy (lowest hip, flatness-based σ), wrist apex, motion and setup start, landing (per-foot standing level), recovery end. |
| `analyse.ts` | One window → `ServeCore`: frame of reference (floor row, upright body height), roles, events, classification (serve / retoss / shadow / other, NO_CONTACT), S0. Calibrated bias terms live in `CALIBRATION` (development seeds s1–s3). |
| `phases.ts` | The seven product phases with key frames (§2.6). |

Validation: `validation/results/metrics/SUMMARY.md` (tools/validate/metrics-eval.ts).
