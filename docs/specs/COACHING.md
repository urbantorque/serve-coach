# COACHING — coaching framework and content library (v1)

Spec owner: coaching workstream. Written 27 September 2026 and revised the same day after the revision of D1, D4 and D5, the new D11 and the gap studies (revision log in §18). Australian English.
Companion data file: `docs/specs/coaching-library.json`. The JSON holds 14 fault focus items, the `keep-going` item and one routine (`warm-up-routine`). This document explains how they are chosen, adapted, delivered and tested.
Follows `docs/DECISIONS.md` (D1–D11). Where I think a decision needs changing, the text flags it and does not diverge (see §16).

**Labels.** [Established] means a peer-reviewed finding or strong consensus. [Coaching interpretation] means expert practice that has not been directly tested. [Our inference] means our own reasoning, including every numeric threshold in this spec that does not cite a study. [Contested] marks a finding whose method or transfer to our players is disputed.

**Citations.**
- (research 03 [S7]) = `docs/research/03-serve-biomechanics.md`, source S7.
- (gap-geometry [G8]) = `docs/research/gaps/side-view-geometry-contradictions.md`.
- (gap-ranges §7.2 or [N1]) = `docs/research/gaps/recreational-reference-ranges.md`.
- (gap-audit [A46]) = `docs/research/gaps/intuitive-tennis-kovacs-primary-content.md`.
- (gap-segment) = `docs/research/gaps/australian-segment-evidence.md`.
- (research 10 M10) = `docs/research/10-segment-decision.md` §7.1, requirement M10.

**Reading order for builders.** Engineers should start with §4 (signals), §6 (detection), §7 (priority algorithm) and §12 (experiment loop). Content designers should start with §9 (adaptation), §10 (pain screen copy), §14 (style guide), §17.4 (attribution register) and the JSON.

---

## 1. The coaching model in one page

1. **Every analysed session produces exactly one coaching decision (D6).** It is one of four kinds:
   - a **focus**: one change, with one cue and one drill;
   - **keep going**: nothing is clearly worth changing;
   - a **capture fix**: the footage cannot support a decision;
   - a **referral**: the player reported pain, so coaching pauses.

   Two special cards sit outside the four kinds. The **match-day card** carries the current cue and a warm-up, and never introduces a new focus (§7.9). **Not available** is shown to under-18 profiles, which v1 blocks (§9.4, D11).
2. **Faults are chosen only from what the session's camera view measures credibly (D1, D5)**, plus patterns in the outcomes the player enters (D3). v1 mechanics come from the side view.
   - The side view cannot measure knee bend, forward lean at contact, or shoulder-over-shoulder tilt at contact (D1), so no item uses them.
   - Statistics are never mixed across views.
   - There are 14 detectable faults, each with one focus item. `keep-going` covers sessions where nothing is flagged, and `warm-up-routine` is a routine, not a fault.
3. **Detection is statistical, not a single-serve judgement.** A fault fires only when it shows on most usable serves, or when a spread is clearly too large for the sample size.
   - Player-relative rules come first.
   - The provisional recreational bands (gap-ranges §7) decide between "possible" and "likely".
   - Every reference is labelled with the population studied.
   - Starting values are [Our inference], to be tuned on our own data.
4. **Priority follows D6 in this order:**
   1. safety gate;
   2. detection confidence;
   3. earlier stage of the serve first (toss and loading before contact and finish);
   4. biggest outcome gap;
   5. the player's goal.

   This follows the Kovacs Institute view that most serve problems start at the toss and loading stages (research 04 [S14]), which is Kovacs Academy teaching written by a Ki Serve Fellow reporting Dr Kovacs's observations (gap-audit §4.3) [Coaching interpretation].
5. **Delivery follows the motor-learning evidence, used honestly.** Each decision gives:
   - one cue: an analogy for UTR 1–3 and a target or outcome cue for UTR 4–7 (research 04 [S46], [S40]);
   - a key frame plus one sentence, because visual plus verbal feedback beats verbal alone (research 04 [S56]);
   - replays the player opens when they choose (research 04 [S60]);
   - a whole-serve drill with constraints, not part-practice (research 04 [S49]; research 03 [S25]);
   - a short blocked set, then a mixed transfer set (research 04 [S52]).

   The external-focus advantage is contested (research 04 [S38] vs [S39]). We use such cues as a sensible default and A/B test them; we do not market them as proven.
6. **Each focus runs as an experiment.** The player practises, logs it, then records a matched re-test in a later session. METRICS §4.5 gives the honest verdict in words (D7). A same-session before-and-after is shown only as "Straight after practice" and never decides anything (§12.3).
7. **Pain is a referral switch, never an assessment (D8).** Comfort settings remove drills that load a sensitive area. No copy names a condition or claims to prevent injury (research 07, TGA 14B and Apple 1.4.1).
8. **Some things are never cued:**
   - knee-bend depth ("bend more", "sit");
   - pronation, the wrist, or a conscious racquet drop;
   - the tossing arm's drop timing;
   - the front hip;
   - the landing.

   Both named expert schools agree on these (gap-audit §5) (P9, P11).

---

## 2. Coaching principles (and where they come from)

| # | Principle | Product rule | Basis |
|---|---|---|---|
| P1 | One focus at a time | One focus per session. Other candidates appear only in "Why this focus?" | [Our inference], consistent with bandwidth-feedback evidence (research 04 [S55]) and implicit-learning practice (research 04 [S48]). Kovacs advises changing no more than two things at once (gap-audit [A48]) |
| P2 | Upstream first | Toss and loading faults outrank contact and finish faults | Kovacs Institute 80/20 view of stages 2–3: a Kovacs Academy post by a Ki Serve Fellow reporting Dr Kovacs's observations (research 04 [S14]; gap-audit §4.3) [Coaching interpretation]. Proximal-to-distal chain (research 03 [S4], [S10]) [Established] |
| P3 | Cue the outcome, not the joint | Cues name a ball position, target, image or sound. Joint-level explanations sit behind "How it works" | External focus: meta-analysis g ≈ 0.58 for retention (research 04 [S38]) but near zero after bias correction (research 04 [S39]). Contested, so A/B test it |
| P4 | Analogies for newer players | UTR 1–3 get the analogy cue; UTR 4–7 get the outcome cue | Analogy effect about 0.3, mostly in novices (research 04 [S46]); the tennis-serve trial found analogy equal to explicit instruction (research 04 [S47]); the distal-focus advantage appeared in experienced performers (research 04 [S40]) |
| P5 | Show the evidence | Every focus pairs a key frame of the player's own serve with one sentence and one or two stats | Visual plus verbal feedback SMD 1.15 vs verbal alone −0.09 (research 04 [S56]) [Established] |
| P6 | Player-controlled replay | Slow motion is opened by the player, never forced | Self-controlled video feedback helped intermediate players (research 04 [S60]) [Established, small n] |
| P7 | Whole serve, constrained; never the toss arm alone | Drills keep the full swing and change the target, distance, start position or tempo. **At most 5 toss-only reps per drill, check tosses included**, and every toss rep moves the racquet arm through its take-back before the player catches the ball or lets it drop | Toss practised alone changes the toss (research 03 [S25]) [Established, n = 5]. Both named schools say never to toss with the tossing arm alone (gap-audit [A8], §5 T2) [Coaching interpretation] |
| P8 | Blocked, then mixed | Each drill ends with a 10-serve transfer set to alternating targets or sides | Contextual-interference benefit in adults (SMD 0.54), smaller in applied settings (research 04 [S52]) [Established, contested] |
| P9 | Don't wreck what works | Never cue the tossing arm's drop timing (keep pointing, pull it down), the wrist, forearm rotation, a conscious racquet drop, the front hip or the landing | Instructed changes to tossing-arm drop timing cut target accuracy from 87% to 10–17% in high-performance men (research 03 [S27]) [Established]. Both schools say never teach pronation or pull the toss arm down, and treat landing as a result (gap-audit §5, T3, T4; [A46]) [Coaching interpretation] |
| P10 | Style is allowed | Stance (foot-up vs foot-back), an abbreviated backswing, toss height and routines are never "corrected" | Similar speed and loads for both stances (research 03 [S9], [S15]); abbreviated backswing (research 03 [S3]) [Established]. Professionals show individual loading strategies (research 04 [S34]). Toss height is style; the schools disagree (gap-audit §5 T5) |
| P11 | **Never cue depth** | Legs are coached through the rise: `leg-drive` (hip rise from the lowest point to contact) and `drive-time`. No copy says "bend more", "sit" or "go deeper". `loading-depth` and `deep-bend-flag` are descriptive only and never trigger, rank or evidence a focus (D5) | Loading depth varied widely and was not related to performance in 22 professionals; CoM rise was (gap-geometry [G8]) [Established]. Push timing, not peak force, related to racquet speed (research 03 [S48]) [Established]. Both named schools say depth is not the goal (gap-audit §5 T1) [Coaching interpretation] |
| P12 | Relative before absolute | Player-relative rules fire first. Absolute bands are provisional and gate "possible" vs "likely" wording. Elite norms are context only, never targets | Nearly all reference data are from elite or high-performance players (research 03 §1); provisional recreational bands carry ±15–50% edge uncertainty (gap-ranges §7) |
| P13 | Honest scope | An item runs only in the view whose image plane holds its movement (D1). No 2D band is compared with published trunk angles (D5) | gap-geometry §1, §4 [Our inference from Established geometry] |

---

## 3. Phase model: Kovacs & Ellenbecker's 8 stages mapped to the product

The model has 3 phases and 8 stages. It is a published teaching and clinical framework, not a validated measurement instrument (research 03 [S1]) [Established as a framework; using it as a checklist is Coaching interpretation]. The engine's `ServePhase` type (`app/src/analysis/types.ts`) has seven product phases, and the key-frame events come from `ServeEvents`.

| K&E phase | K&E stage | Product phase (`ServePhase`) | Key frame (`ServeEvents`) | What the side view shows credibly (D1, D5) | Metric ids used by coaching | v1 faults anchored here |
|---|---|---|---|---|---|---|
| Preparation | 1 Start | `setup` | first still frame | stance class, start of routine | `serve-count`, `capture-quality` | none (stance is style: P10) |
| Preparation | 2 Release | `toss` | `tossRelease`, `tossApex` | Apex height (estimated: it reads 8–12 cm high when the toss is 0.3 m nearer the camera); apex placement forward of the front toe; drop from apex to contact; spread across serves (the height spread includes 2–4 cm from sideways drift) | `toss-apex-height`, `toss-forward`, `toss-drop`, `toss-height-spread`, `toss-forward-spread` | `toss-height-inconsistent`, `toss-forward-inconsistent`, `toss-behind`, `toss-too-far-forward`, `toss-too-high` |
| Preparation | 3 Loading | `loading` | `trophy` | Hip rise from the lowest point to contact, and drive time (leg drive, D5). Loading depth is described only. Shoulder tilt at the trophy position is a player-relative band. **Knee bend is not measured from the side: the knees point at the camera (D1)** | `leg-drive`, `drive-time`, `shoulder-tilt-trophy`, `rhythm-release-to-contact`, `rhythm-spread` (descriptive only: `loading-depth`, `deep-bend-flag`) | `legs-quiet`, `shoulder-tilt-low`, `rhythm-inconsistent` |
| Preparation | 4 Cocking | `drive` (start) | end of the trophy pause | How long the motion stops at the top. **Racquet drop and external rotation are not assessed (D5)** | `trophy-pause` | `trophy-pause-long` |
| Acceleration | 5 Acceleration | `drive` | (take-off, optional) | overall timing only. Arm speed, pronation and internal rotation are not observable in 2D (research 05 §6.9) | `rhythm-release-to-contact` | none |
| Acceleration | 6 Contact | `contact` | `contact` (ball; audio times contact only, D4) | Contact height relative to standing height; contact forward of the front toe. **Forward lean and shoulder-over-shoulder tilt at contact are not measurable from the side (D1)**. Shoulder-over-shoulder is a rear-view experimental metric not used in v1 | `contact-height-ratio`, `contact-forward` | `contact-low`, `contact-behind`; outcome faults `second-serve-unreliable`, `net-miss-pattern`, `long-miss-pattern` |
| Follow-through | 7 Deceleration | `landing` (start) | none | not assessed (deceleration load is not observable) | none | none |
| Follow-through | 8 Finish | `landing` | `landing` | Landing position, as an experimental trend only. It is a result, not a cue (gap-audit §5; gap-ranges §7.5) | `landing-distance` (context only) | none |
| (product only) | none | `recovery` | `recoveryEnd` | back to ready (yes/no). No norms exist (research 03 §2) | none | none |

**Stage numbers drive priority.** Each fault carries `chainStage` (the K&E stage number) in the JSON.
- `rhythm-inconsistent` is anchored at stage 3. Release-to-contact timing spans stages 2–6, but coaches trace unstable timing mainly to the toss and loading (research 04 [S68]; gap-audit [A17]) [Coaching interpretation].
- `legs-quiet` is anchored at stage 3. The hip rise runs from the lowest point (stage 3) to contact (stage 6); loading is where it starts.
- The outcome-only faults are anchored at stage 6. Net faults differ from good serves mainly in the ball's projection angle at contact (research 03 [S23]) [Established], and spin comes from racquet path at contact (research 03 [S19]) [Established].

---

## 4. Signals this spec consumes

`METRICS.md` and `metrics.json` own the definitions and statuses. This table records how coaching reads each **canonical metric id**. It was checked against the canonical list on 27 September 2026; metrics.json is being revised in parallel, and where it disagrees, METRICS wins. The JSON thresholds use the same units (cm, ms, ratio of height, % of height). If METRICS changes a unit or reference point, the thresholds must be re-expressed.

**Capture assumptions (D1).**
- Portrait is the default, 7–8 m from the centre mark and 1.3–1.6 m high. The alternative is landscape at the side fence, 8.5–9.5 m out.
- A live headroom check blocks recording when the frame top is below 4.3 m at the server's plane.
- A toss peak above a 4.3–4.5 m frame is extrapolated and labelled `estimated` ("apex above frame"). It becomes `unavailable` when it is more than about 0.5 m above the frame (gap-ranges §6.4).
- A measured upward tilt of 5° or less is removed in software, and all angles are computed on rectified keypoints. Uncorrected tilt is not allowed, so angle-based metrics are unavailable without it.

| Metric id | How coaching reads it | Default status (METRICS decides) | Used for |
|---|---|---|---|
| `serve-count` | Serves detected. "Usable" means all prerequisites are met for a given metric. "Detected share" = usable ÷ recorded in the stratum | measured | Minimum-data gates; load counting |
| `capture-quality` | `good` / `usable` / `poor` per session | measured | Capture-fix decision |
| `toss-apex-height` | Apex height as a ratio of standing height (secondary unit: cm). Absolute value biased high when the toss is nearer the camera (D1) | estimated | Per-serve series behind `toss-height-steady`; context |
| `toss-forward` | cm from the front toe at release to the apex, + = into the court | estimated | `toss-in-front`, `toss-within-reach`; branch in `bring-it-down` copy |
| `toss-drop` | cm from apex to contact. Read against **sex-specific** bands; never a trigger on its own | estimated | `toss-to-reach-height` |
| `toss-height-spread` | Noise-corrected within-stratum SD of apex height, cm. Includes 2–4 cm of apparent spread per 10 cm of sideways toss spread (D1), so the copy says so | estimated | `toss-height-steady` |
| `toss-forward-spread` | Noise-corrected SD of `toss-forward`, cm | estimated | `toss-spot-steady` |
| `contact-height-ratio` | Ball-centre contact height ÷ standing height | estimated | `reach-up`; co-signal for `toss-to-reach-height`; corroboration for `toss-within-reach` |
| `contact-forward` | cm from the front toe at release to the ball at contact, + = into the court | estimated | `contact-in-front`; branch in `bring-it-down` copy |
| `rhythm-release-to-contact` | ms from ball release to contact | measured | Co-signal for `toss-to-reach-height`; context |
| `rhythm-spread` | Noise-corrected SD of release-to-contact, ms; needs ≥ 60 fps | estimated | `steady-rhythm` |
| `trophy-pause` | ms of stillness at the trophy position; needs ≥ 60 fps | **experimental** | `flowing-motion`; co-signal for `toss-to-reach-height` (with the experimental toggle on only) |
| `leg-drive` | Hip rise from the lowest mid-hip point to contact, % of standing height (D5; gap-geometry §5) | estimated (expected) | `legs-spring` |
| `drive-time` | ms from the lowest mid-hip point to contact; a player-relative trend (±35–50 ms at 60 fps) | estimated or experimental | Co-signal for `legs-spring` |
| `loading-depth` | Hip drop from ball release to the lowest point, % of height | estimated | **Never a trigger, a rank input or a focus stat.** It may appear only as a description in "How it works", never as a "bend more" instruction (D5, P11) |
| `deep-bend-flag` | Side-view "deep bend: yes/no" | experimental | **Never used by coaching** (P11) |
| `shoulder-tilt-trophy` | Player-relative band `low` / `typical` / `high` / `unclear` from the rectified shoulder line at the trophy position, with a key frame. Words only; degrees never shown (D5) | estimated (band only) | `shoulder-tilt` |
| `knee-bend-band` | **Rear view only** (D1). Measured on the knee nearer the rear camera | experimental | Not used in v1. **No side-view item may reference it** (lint, §14) |
| `shoulder-over-shoulder-contact` | **Rear view only**, experimental | experimental | Not used in v1. No side-view item may reference it |
| `landing-distance` | Landing position, as METRICS defines it (metrics.json measures from where the front toe started; gap-ranges §7.5 measures from the baseline; §16 item 11) | **experimental** (gap-ranges §7.5) | **Never a trigger.** A trend line and corroborating context for `toss-in-front` and `legs-spring`, shown only with the experimental toggle on |
| `repeatability` | 0–100 composite | experimental | Not used for decisions |
| `serve-in-rate` | Player-entered, k of n within a stratum. The second-serve stratum's `serve-in-rate` is the second-serve in-rate (§16 item 10) | player-entered | Outcome faults; outcome gap |
| `first-serve-in-rate` | Player-entered | player-entered | `keep-going` stats; outcome gap |
| `double-faults` | Player-entered | player-entered | `second-serve-margin` |
| `serve-type-mix` | Player-entered intended type (flat / slice / kick / unknown) | player-entered | Strata and kick allowances |
| `placement-zone` | Player-entered target (side) | player-entered | Not used by coaching in v1 |
| `speed-experimental`, `speed-average-rear`, `speed-radar-entered`, `spin` | Speed: side view only at ≥ 120 fps with a target tag; rear average speed experimental; radar player-entered; spin always unavailable (D4). **No audio flight-time speed from the side view** | varies | **Never used by coaching.** Speed never drives a focus, a rank or a verdict, including for the `more-pace` goal |

METRICS also emits two session flags that are not metric ids: `fatigue-flag` (§6.5) and `load-flag` (§11).

**Requests to METRICS.md.** They are not decisions, but they decide whether some items can run.
1. **Miss types (net / long / wide) per serve number**, exposed alongside the in-rates. `clear-the-net` and `bring-it-down` need them. Still open.
2. **Personal best per metric and stratum:** the best matched-session centre (or spread) among the player's last 10 matched sessions, with its SE. The relative rules in §6.4 need it.
3. **§4.7 contrast for spread items** on |deviation from the stratum median|, so the outcome association for toss consistency tests the right quantity (§7.3).
4. **Trophy-to-contact time** (an experimental proxy from the hitting-wrist high point). gap-ranges §7.2 uses more than 0.55 s as a co-signal for `toss-to-reach-height`. Until METRICS provides it, coaching uses `trophy-pause`.
5. **When `shoulder-tilt-trophy` becomes available.** It needs the player's reference (ARCHITECTURE §5 says until 2 matched sessions exist), plus any experimental population band METRICS chooses to publish. Coaching sets no degree cut points.
6. **Provisional values in coaching triggers.** METRICS §4.1 keeps provisional values out of coaching triggers. This spec's spread rule applies its own one-sided bound at n ≥ 12 (§6.2), so coaching needs per-serve values and the raw spread even when the display value is provisional. See §16, item 2.
7. **Withdrawn:** the old request for a "contact reading" of `trunk-tilt-band`. Forward lean at contact cannot be measured from the side view: on the camera-side court, a true 20° lean reads 2–8° (gap-geometry §4.2; D1).

---

## 5. The v1 fault library

### 5.1 Inclusion rules

A fault is in v1 only if all four hold:
- **Measurable in the session's view.** For v1 mechanics that is the side view (D1), using metrics METRICS classifies as measured or estimated, or player-entered outcomes (D3). No side-view item uses `knee-bend-band`, `shoulder-over-shoulder-contact` or the removed `trunk-tilt-band`. No item uses `loading-depth` or `deep-bend-flag` at all.
- **Recommended by an expert, or linked to performance.** A credible expert source recommends changing it, or a study links it to performance.
- **Practicable alone.** A solo player can practise the fix with a basket at a public court in 5–10 minutes.
- **Not an outcome coaches treat as a result.** Coaches do not treat it as a result that should not be cued (landing: gap-audit §5).

An item whose **effective tier** is experimental (§13) runs only when the player has switched on "Show experimental" (D10 profile sheet). This covers an experimental detection metric, an experimental detection path, or an experimental item tier.

### 5.2 The 14 faults (plus "keep going" and the warm-up routine)

Fire values are starting thresholds [Our inference] unless §6.3 cites a reference. "1–3" and "4–7" are the UTR bands. Unit conventions follow §4. "Most serves" means the per-serve prevalence rule in §6.2(a).

| # | Fault id → focus item | Stage | Rule kind | Signals | Fires when (summary) | Resolved when | Tier |
|---|---|---|---|---|---|---|---|
| 1 | `toss-height-inconsistent` → `toss-height-steady` | 2 | spread (+ relative) | `toss-height-spread` | One-sided 90% lower bound of the true SD ≥ 15 cm, with n ≥ 12 and ≥ 80% of the stratum's serves detected (gap-ranges §7.1, F3 "likely"). Relative: σ̂ ≥ 1.5 × the player's best matched session, n ≥ 20 in both. A point estimate above 20 cm without the bound is **"possible": shown, not coached** | σ̂ ≤ 15 cm, or ≥ 30% below the experiment baseline, or `clearly-better` | coach-recommended |
| 2 | `toss-forward-inconsistent` → `toss-spot-steady` | 2 | spread (+ relative) | `toss-forward-spread` | Lower bound ≥ 18 cm, same conditions; relative as row 1; "possible" above 25 cm | σ̂ ≤ 20 cm, or ≥ 30% reduction, or `clearly-better` | coach-recommended |
| 3 | `toss-behind` → `toss-in-front` | 2 | per-serve | `toss-forward` (+ `contact-forward`; `landing-distance` trend) | Upper bound < −10 cm (flat, slice, untagged) or < −15 cm (kick) on most serves | Mean ≥ +20 cm (flat, slice, untagged); ≥ 0 cm, at or inside the baseline (kick) | coach-recommended |
| 4 | `toss-too-far-forward` → `toss-within-reach` | 2 | per-serve plus corroboration | `toss-forward`, `contact-height-ratio`, misses | Lower bound > 0.40 × standing height (about 70 cm at 1.75 m) on most serves, **and** low contact (mean < 1.40), or a net or long share of misses ≥ 0.6 with ≥ 6 misses | Mean ≤ 60 cm, the upper edge of the target band | coach-recommended |
| 5 | `toss-too-high` → `toss-to-reach-height` | 2 | composite | `toss-drop`; co-signals `rhythm-release-to-contact`, `trophy-pause`, `contact-height-ratio` | **Never on the drop alone.** "Possible" (moderate): the median drop is in the high band (lower bound above 100 cm for men; above 125 cm for women or when sex is not given) **and** ≥ 1 co-signal is present. "Likely" (major): drop > 120 cm (men) or > 145 cm (women or not given) with ≥ 2 co-signals | No co-signal on most serves, or the median drop is back inside the player's typical band, or `clearly-better` | coach-recommended |
| 6 | `legs-quiet` → `legs-spring` | 3 | relative; experimental population path | `leg-drive` (+ `drive-time` co-signal) | Relative: median hip rise ≥ 3% of height below the player's best matched median with P ≥ 0.9 (≥ 3 earlier matched sessions). Population path (experimental toggle): upper bound < 7% of height on most serves. **Never fires on `loading-depth` or `deep-bend-flag`** | Median within 1.5% of height of the player's best (relative), or median ≥ 9% of height (population), or `clearly-better` | coach-recommended (relative); experimental (population) |
| 7 | `shoulder-tilt-low` → `shoulder-tilt` | 3 | band (player-relative) | `shoulder-tilt-trophy` | The METRICS player-relative band is `low` on most serves (band probability ≥ 0.7), or an experimental population band if METRICS publishes one. No degree cut points in coaching | `low` on ≤ 30% of serves | experimental |
| 8 | `rhythm-inconsistent` → `steady-rhythm` | 3 | relative first, then spread | `rhythm-spread` (≥ 60 fps) | Relative: σ̂ ≥ 1.5 × the player's best matched session (n ≥ 20 in both). Absolute: one-sided 90% lower bound ≥ 90 ms, n ≥ 12, ≥ 80% detected (gap-ranges §7.4) | σ̂ ≤ 80 ms, or ≥ 30% reduction, or `clearly-better` | experimental |
| 9 | `trophy-pause-long` → `flowing-motion` | 4 | per-serve | `trophy-pause` (experimental; ≥ 60 fps) | Lower bound > 500 ms on most serves (the metrics.json coaching flag; no recreational measurement exists, gap-ranges §4.1) | Median ≤ 350 ms in the same `fpsClass` | coach-recommended (effective experimental while the metric is) |
| 10 | `contact-low` → `reach-up` | 6 | per-serve (+ relative) | `contact-height-ratio` | Upper bound < 1.38 (flat or slice first serves, untagged) or < 1.35 (kick, or any second serve) on most serves, n ≥ 8. Relative: fall ≥ 0.04 below the player's best matched median, P ≥ 0.9. **With a shoulder comfort setting or age 60+: relative rule only** (gap-ranges §7.3) | Mean ≥ 1.40 (≥ 1.37 kick or second serve), or back within 0.02 of the player's best (relative) | coach-recommended |
| 11 | `contact-behind` → `contact-in-front` | 6 | per-serve | `contact-forward` | Upper bound < 0 cm (flat, slice, untagged) or < −10 cm (kick) on most serves | Mean ≥ +10 cm; ≥ +5 cm (kick) | coach-recommended |
| 12 | `second-serve-unreliable` → `second-serve-margin` | 6 | outcome | `serve-in-rate` (second-serve stratum), `double-faults` | ≥ 10 second serves and P(true in-rate < 0.70) ≥ 0.8 | In-rate ≥ 0.80 over ≥ 20 matched second serves, or `clearly-better` | coach-recommended |
| 13 | `net-miss-pattern` → `clear-the-net` | 6 | outcome | miss types by serve number | ≥ 6 misses and P(net share of misses > 0.5) ≥ 0.8, **and** missing is a real problem: net misses ≥ 25% of the stratum's serves, or (first serves) P(in-rate < 0.5) ≥ 0.8 | Net share ≤ 0.40 over ≥ 10 misses | coach-recommended |
| 14 | `long-miss-pattern` → `bring-it-down` | 6 | outcome | miss types by serve number | Same as row 13, for long misses (the same real-problem gate) | Long share ≤ 0.40 over ≥ 10 misses | coach-recommended |
| 15 | none → `keep-going` | n/a | none | `capture-quality`, `serve-count`, outcomes | No item is eligible and the data are adequate | n/a | coach-recommended |
| 16 | (routine) → `warm-up-routine` | n/a | routine | `serve-count` | Not detected: offered before sessions and on the match-day card (§11.1, §7.9) | n/a | coach-recommended |

**Overlaps, resolved by design.**
- `contact-behind` usually co-occurs with `toss-behind`, because the ball keeps its forward motion after the apex. Stage order then picks the toss item. The contact item exists for two cases: the apex left the frame, so `toss-forward` is unavailable; or the toss drifts backwards after the apex.
- `legs-quiet` and `contact-low` often co-occur: in professionals, CoM rise correlated r = 0.87 with impact height (gap-geometry [G8]). Stage order picks the legs item when both are eligible. Before the player has 3 matched sessions, only the experimental population path can fire the legs item, so `reach-up` usually leads.
- `toss-to-reach-height` and `flowing-motion` share the "waiting" signal. The toss item needs a high drop as well, and stage order puts it first.

### 5.3 Faults deliberately not in v1

| Fault (research 04 code) | Why it is out | What would unlock it |
|---|---|---|
| Waiter's tray (F1) | The racquet is not a tracked keypoint and racquet-face angle is not observable in 2D (research 05 §1.3, §6.9); D5 forbids racquet-drop claims | A racquet keypoint model plus validation at 120–240 fps |
| Forehand grip (F2) | The hand is occluded in wide shots | A close-up photo check (possible later as a player self-check) |
| Bent-arm or flicked toss (F5) | Tossing-elbow angle is not a v1 metric | A tossing-arm elbow band from pose |
| Tossing arm drops early (F7) | A timing cue here risks wrecking accuracy (research 03 [S27]), and the ideal timing is disputed (gap-audit §5 T4) | Validation first; even then it would be shown, not cued |
| Opening up early / insufficient coil (F8) | Needs the rear view; hip turn and tossing-arm direction are rear-view checkpoints (gap-audit §4.1) | Second angle (D1) |
| Little knee bend / straight legs as a depth fault (F9) | The side view cannot measure knee bend: the 2D band is wrong on 47–80% of serves (gap-geometry §3). Depth is not the goal (P11) | Not planned as a depth cue. The rear-view knee band stays descriptive and experimental |
| Double knee bend (F10) | The hip-trace shape is not validated | Experimental classifier on the `leg-drive` hip trace |
| Back arch at the trophy position (was `trunk-arch-high` / `lift-not-arch`) | Not visible from the side. At the trophy position the chest faces the camera, so lumbar extension runs in depth and only adds ±5–9° of contamination (gap-geometry §1, §4.2). A "high" in-plane reading is mostly lateral tilt, which K&E describe as desirable, so the item would tell players with a big tilt to reduce it | A validated arch measure (two-view), copy with no load claims, and a slice-only progression |
| Folding forward at contact / jackknife (F11; was `trunk-fold-at-contact` / `stay-tall`) | Forward lean at contact is contaminated in the side view: on the camera-side court a true 20° lean reads 2–8° (gap-geometry §4.2). The rear view does not see it in-plane either | A validated two-view measure |
| Shoulder-over-shoulder at contact | Rear-view experimental metric only (D1, D5) | A rear-view item after validation |
| Landing behind (F18; was `landing-behind` / `land-into-court`) | Both named schools treat landing as a result, and Kovacs warns against landing cues (gap-audit §5, [A46]). There is no literature on landing distance (gap-ranges §5, §7.5) | Not planned as a focus. `landing-distance` stays a trend line |
| No racquet drop (F14), tension (F15), early pronation (F17) | Not observable, or low confidence (research 05 §6.9) | Not planned |
| Toss left/right drift; wide-miss patterns | Lateral position needs the rear view (research 05 §6.3) | Rear "outcomes view" (D1). Wide misses are counted in v1 but not coached |

### 5.4 Library schema (fields added in this revision)

| Field | Meaning |
|---|---|
| `itemType` | `focus`, `keep-going` or `routine`. A routine has `faultId: null` and is never chosen by detection |
| `view` | `side` for every v1 fault item, `any` for `keep-going` and the routine. An item never runs on another view's session |
| `tierByPath` | Optional. The tier of each detection path when the paths differ (`legs-spring`: relative = coach-recommended, population = experimental) |
| `whyItMattersVariants` | Optional. An ordered array of `{ id, when, text }` two-sentence alternatives; the first matching `when` wins, otherwise `whyItMatters` is used (for example `bring-it-down`, §7.2) |
| `evidence.viewNote` | Optional. One sentence on what the view cannot see (for example the toss-spread sideways component; M7 for second serves) |
| `cues.outcomeSecondServe` | Optional. The outcome cue used in a second-serve stratum |
| `drill.tossOnlyReps` | Total toss-only reps, check tosses included (≤ 5, P7) |
| `drill.progressionGate` | `{ levels, excludeIfComfort, label }`. The progression is offered only to the listed levels and never with the listed comfort regions. `label: "coaches-differ"` shows "Coaches differ on this one" |
| `drill.progressionAlt` | The progression used when the gate fails |
| `drill.note` | Optional. A short explanatory note, such as the net-clearance physics |
| `drill.optionalAid` | Optional. `{ text, basis }`: an aid the player may use, with its basis stated (`our-inference` for the uneven count in `steady-rhythm`) |
| `evidence.compareTo: "none"`, `evidence.keyFramePhase: null` | Allowed for the routine only |

---

## 6. Detection: rules, thresholds and confidence

### 6.1 Strata and minimum data

- **A stratum** is: view (always `side` for v1 mechanics) × court side (deuce / ad) × serve number (1st / 2nd) × intended type (flat / slice / kick / untagged).
  - Toss position differs by type and target (research 03 [S20], [S35]); impact position differs by court side (research 03 [S34]).
  - Pooling types inflates spreads (research 06 §7.2).
  - The toss-drop band also depends on the player's sex (gap-ranges §0 item 3).
- **Evaluation.** Each item is evaluated in every stratum that meets its minimum. The item's detection is the strongest qualifying stratum, and that stratum becomes the experiment's locked stratum (§12).
- **Minimums** [Our inference, from gap-ranges §7 and the precision tables in research 06 §7 and research 09 §3.4]:

| Rule kind | Minimum in the stratum | Why |
|---|---|---|
| Spread (SD) | 12 usable serves **and** ≥ 80% of the stratum's recorded serves detected | gap-ranges §7.1 F3. Missing serves are often the wild tosses, so a low detected share biases the spread down |
| Per-serve | 6 usable serves (8 for `reach-up`) | Enough to show "most serves", with the prevalence posterior below; gap-ranges §7.3 asks for 8 for contact height |
| Band | 6 usable serves, and METRICS must be emitting the player-relative band | The shoulder band needs the player's reference (§4 request 5) |
| Relative | ≥ 3 earlier matched sessions, each meeting the item's per-session minimum, plus this session | A personal best needs a history; typical error (research 09 [S70], [S71]) |
| Composite (`toss-to-reach-height`) | 8 serves with drop values and co-signal values | gap-ranges §7: medians over at least 8–10 detected serves |
| Outcome pattern | 6 misses, or 10 second serves | Proportions are noisy at small n (research 06 §7.1) |
| Any decision at all | 6 usable serves in the session and `capture-quality` ≠ `poor` | Otherwise the decision is a capture fix (§7.5) |

CAPTURE.md §1 and metrics.json set lower **display** minimums: 5 serves for a mechanics observation, and 8 for a spread shown as an "early read". Choosing a focus is a stronger claim than showing a number, so coaching needs more serves than display does.

METRICS §4.1 keeps provisional values (spreads with n < 20) out of coaching triggers. This spec instead fires spreads at n ≥ 12 only on a one-sided bound (§6.2 b), which already accounts for sample size. The disagreement is flagged in §16, item 2.

### 6.2 The rule kinds

Every rule uses the `MetricValue` fields `value`, `uncertainty` (low/high) and `confidence` (0–1) from `types.ts`. **`meanConf`** is the mean `confidence` of the contributing serves.

**(a) Per-serve rule** (positions, heights, durations).
- A serve **clearly shows** the fault when its whole uncertainty interval lies beyond the fire threshold. The interval is the one METRICS reports, including systematic scale error for absolute heights (METRICS §1.2).
- Serves whose interval straddles the threshold count as "unclear", not as clear.
- With k clear serves out of n usable: `detectionConfidence = P(p > 0.5 | Beta(k+1, n−k+1)) × meanConf`. In words: how sure we are that the fault shows on most serves, discounted by tracking quality.
- Reference values: 9 of 14 → 0.85; 12 of 14 → 0.996; 13 of 16 → 0.994; 6 of 10 → 0.73 (before `meanConf`).

**(b) Spread rule** (toss spreads, rhythm spread), using a one-sided lower bound.
- **Spread.** `s` = the sample SD when n ≥ 15, or 1.4826 × MAD when n < 15, so that one wild toss cannot trigger the rule.
- **Degrees of freedom.** `df = n − 1` for the SD, and `df_eff = 0.37 × (n − 1)` for the MAD-based spread, because MAD's efficiency under normal data is about 37%. A bootstrap interval is an acceptable alternative.
- **Measurement error** `e` is the per-serve 1-sigma error METRICS reports, including any apex-extrapolation error. The JSON `measurementErrorDefault` is used only if METRICS gives none:
  - toss height: 4 cm (3 cm measurement, plus about 3 cm of sideways-drift contamination in quadrature: D1; gap-geometry §6.7);
  - toss forward: 7 cm;
  - rhythm: 1.2 frame durations.

  These come from research 05 §6.3 and §10 (#3). If metrics.json already reports the spread noise-corrected, use its value and do not correct twice.
- **Formulas:**
  - true-SD estimate: `σ̂ = √max(0, s² − e²)`;
  - one-sided 90% lower bound: `σ_L = √max(0, s²·df / χ²₀.₉₀(df) − e²)`;
  - `P(σ > T) = F_χ²(df)( df·s² / (T² + e²) )`.
- **Fire rule met** when all of these hold:
  - σ_L ≥ T, which is equivalent to P(σ > T) ≥ 0.90;
  - n ≥ 12;
  - the detected share is ≥ 0.80.

  Then `detectionConfidence = P(σ > T) × meanConf`, and it must be ≥ 0.70.
- **Observed SD needed for the height rule** (T = 15 cm, e = 4 cm): 19.5 cm at n = 12, 18.9 cm at n = 16 and 18.6 cm at n = 20 (plain SD). With the MAD-based spread at n = 12–14 it is about 21–22 cm. [Our calculation; gap-ranges §7.1 gives about 19 and 18 cm with e ≈ 3 cm]
- **"Possible".** The point estimate σ̂ is above the scattered-band edge (20 cm height, 25 cm forward, 90 ms rhythm), but the bound is not met. The item is listed under "Also noticed" as "possibly more scattered than usual; a longer block would tell", and is **not coached**.

**(c) Band rule** (`shoulder-tilt-trophy` only).
- As rule (a), where a serve is clear when its band equals the target band with band probability ≥ 0.7, the METRICS reporting threshold. A band reported as `unclear` never counts as clear.
- The band is player-relative by construction (D5), so a `low` reading already means "less tilt than your usual". Coaching adds no degree thresholds and never compares the band with published trunk angles (D5).

**(d) Outcome rule** (player-entered).
- Proportions use a Beta(k+1, n−k+1) posterior (uniform prior).
- Example: `P(true second-serve in-rate < 0.70)`. Then `detectionConfidence = that probability × tagCoverage`, where tagCoverage is the share of serves with an outcome. A session tally counts as 1.0.
- The miss-pattern items (`clear-the-net`, `bring-it-down`) also need the **real-problem gate**: misses of that type are ≥ 25% of the stratum's serves, or, for first serves, P(in-rate < 0.5) ≥ 0.8. This stops a strong server whose few misses happen to be of one type from getting the item.
- Displayed rates always use Wilson 95% intervals with n (D7). The Beta posterior is for decisions only.

**(e) Relative rule** (player's own history; §6.4).
- It compares this session's centre (or spread) with the player's **personal best** in the same stratum, using the METRICS §4.4 SE for differences between sessions (including the `2σ_s²` term).
- It fires when P(this session is worse than the best by at least the item's relative threshold) ≥ 0.9.
- Relative thresholds [Our inference]:
  - `leg-drive`: 3% of height;
  - `contact-height-ratio`: 0.04 (gap-ranges §7.3);
  - spreads: σ̂ ≥ 1.5 × the best, with n ≥ 20 in both sessions (gap-ranges §7.1, research 06 §7.2 detectable change).

**(f) Composite rule** (`toss-to-reach-height` only).
- **Drop band.** The median drop is in the high band when its one-sided 90% lower bound (METRICS bootstrap) is above the sex-specific high edge:
  - men: 100 cm;
  - women, or sex not given: 125 cm.
- **Co-signals**, each judged on the session median:
  1. release to contact > 1,150 ms;
  2. a trophy wait: `trophy-pause` > 500 ms (experimental; it counts only with the toggle on), or trophy-to-contact > 550 ms once METRICS provides it (§4 request 4);
  3. `contact-height-ratio` ≥ 0.04 below the player's own best median (needs a personal best).
- **Outcomes:**
  - "Possible" = the high band plus ≥ 1 co-signal.
  - "Likely" = a drop above 120 cm (men) or 145 cm (women or not given) plus ≥ 2 co-signals.
  - A high drop with no co-signal is shown as the player's own drop band, never as a fault.
- `detectionConfidence = P(median drop > edge) × meanConf`.
- "Possible" is coached here (unlike a "possible" spread) because it already needs an independent co-signal. Its copy says "may".

**Eligibility.** An item is eligible when its fire rule is met, `detectionConfidence ≥ 0.70` (per-serve, band, spread, composite and outcome kinds), and `severity ≥ moderate`.

**Severity**, used for eligibility and in "Why this focus?":

| Kind | minor (never the focus) | moderate | major |
|---|---|---|---|
| Per-serve | fired only by the "slipped" rule (§6.4) | fire rule met | Fire rule met, ≥ 80% of serves clear, **and** the median is beyond the threshold by ≥ 2 × the item's smallest worthwhile change (SWC, METRICS §4.5) |
| Spread | "possible", or "slipped" only | fire rule met | fire rule met and σ̂ ≥ 1.5 × T |
| Band | "slipped" only | fire rule met | target band on ≥ 85% of serves |
| Relative | — | fire rule met | Fire rule met, plus the item's co-signal (`legs-spring`: drive time ≥ 80 ms longer than the player's best median), or a gap ≥ 2 × the relative threshold |
| Composite | high drop with no co-signal (shown as a band, not a fault) | "possible" | "likely" |
| Outcome | — | fire rule met | P ≥ 0.95 |

Why a severity gate? It stops D6's strict stage order from promoting a marginal toss issue over a clear contact problem (§16, item 1).

### 6.3 Reference bands (population context, never targets)

| Signal | Reference values | Population (n) | Source | How v1 uses it |
|---|---|---|---|---|
| Toss apex spread, within player | SD 6.0 cm vertical, 7.2 cm forward/back; contact height SD 3.5 cm | Professional women (8 × 5 serves) | research 06 [S8] [Established] | Floor: with 3–5 cm of measurement error, an observed SD under about 8 cm is professional-like |
| Provisional recreational toss-spread bands | Vertical: tight < 8, typical 8–20, scattered > 20 cm. Forward/back: < 10, 10–25, > 25 cm. ±50% on each edge | UTR 1–7 (none measured) | gap-ranges §7.1 [Our inference] | F3 bounds of 15 and 18 cm; "possible" wording; resolved values back inside the typical band |
| Which toss dimension matters | Experienced servers stabilise the **vertical** toss and allow more forward/back and sideways variation | Experienced men (12) | research 03 [S29] [Established] | Forward spread has the looser threshold |
| Side-view toss bias | A toss 0.3 m nearer the camera reads about 8–12 cm high; a 10 cm sideways toss spread adds 2–4 cm of apparent height spread | Geometry | D1; gap-geometry §6.7 [Our inference] | Absolute apex height is `estimated`; the spread copy mentions the sideways component; e = 4 cm default |
| Toss drop, by sex | Men 0.56–0.72 m (high-performance and national junior men). Women: professional 0.82 m, elite junior 0.94 m, competitive 1.14 ± 0.18 m | HP men (10), junior men (13), professional women (8), elite junior women (8), competitive women (8) | research 03 [S27], [S28]; gap-ranges [N4], [N5], [N1] [Established] | Sex-specific high edges: 100 cm (men), 125 cm (women or not given); "likely" at 120 / 145 cm (gap-ranges §7.2) |
| Drop and outcome | The drop did not differ between serves that went in and serves that faulted | Junior men; competitive women | research 03 [S28]; gap-ranges [N2] [Established] | Never fire on the drop alone; co-signals required |
| Release to contact | Recreational about 0.97 s (young adults) and 0.91 s (adults over 60); HP men 0.97 ± 0.10 s. Typical band 0.80–1.20 s | Recreational (21); HP men (10) | gap-ranges [N3]; research 03 [S27] [Established; band is Our inference] | Co-signal at > 1.15 s |
| Rhythm spread, within player | Derived recreational SD about 45–55 ms. Bands: tight < 40, typical 40–90, variable > 90 ms (±15 ms) | Recreational (21) | gap-ranges [N3], §7.4 [derived: Our inference] | Absolute bound of 90 ms; tier experimental |
| Trophy-to-contact wait | 0.54 ± 0.10 s in children vs 0.33–0.36 s in teenagers and adults | ITN 1–6 (24) | gap-ranges [N9] [Established] | Co-signal of more than 0.55 s once METRICS provides it |
| Trophy pause | About 20% lower upper-arm internal-rotation speed after a 1.5 s pause than with none. No pause has been measured in recreational adults | Lab | research 03 [S2] [Established mechanism]; gap-ranges §4.1 | Fire at 500 ms, the metrics.json coaching flag [Our inference, an extrapolation] |
| Contact height ÷ stature | Novices about 143–146%; club 144–149%; elite 147–156%. The between-player SD (5–7 points) is as large as the gap between levels. Girard 2007: intermediate 148.4% vs elite 147.5%. Recreational women contacted higher than competitive women | Adult men (30); others | research 03 [S6], [S7]; gap-ranges §3, [N1] [Established] | Low edge 1.38 (1.35 kick and second serves); typical 1.38–1.54 (gap-ranges §7.3). Relative rule preferred |
| Contact height and speed | ρ ≈ 0.75 for absolute height, 0.63 after normalising for stature | Junior men (13) | research 03 [S28] [Established] | Context only; not a claim that better servers hit higher relative to height |
| Contact forward | Amateurs 18 cm; recreational women 9–11 cm; competitive women 54 cm; professional women and men 61 and 78 cm. Kick contact about 17 cm further back than flat | Various | research 03 [S61], [S35]; gap-ranges [N1], [N4] [Established] | Descriptive band: short < 15, typical 15–70 cm, kick 15 cm back (gap-ranges §7.6). The kick allowance covers only the flat-to-kick offset; kick contact still stays in front of the toe |
| Leg drive (CoM rise) | 15.8 ± 3.4% of body height; r = 0.87 with impact height; within-player CV 5.7%. Women national and provincial 15–17.5% (derived by the gap study from the paper's tables) | 22 male professionals; 10 women | gap-geometry [G8], [G9] [Established] | **Context, not a target.** CoM rise is not hip rise, and recreational hip rise is unmeasured (UNVERIFIED). The population "low" edge of 7% is [Our inference] (below professional mean − 2.5 SD) and experimental |
| Loading depth | CoM drop 5.5 ± 2.3% of height; between-player CV 42%; **not related** to racquet speed or impact height | 22 male professionals | gap-geometry [G8] [Established] | Why depth is never cued (P11) |
| Drive time | Acceleration phase 0.40 ± 0.07 s; leg-drive duration 0.26 ± 0.07 s | Professionals; ITN 3 players (13) | gap-geometry [G8], [G7] [Established] | Player-relative co-signal only |
| Knee restricted | Ball speed −15 to −17% at all levels with knees splinted near straight | Beginner, intermediate and elite men (30) | research 03 [S7] [Established] | `whyItMatters` for `legs-spring`. It is not evidence for any side-view detector |
| Shoulder tilt at trophy | **No reference value applies.** The pooled 25 ± 7.1° is thorax-relative-to-pelvis side bend under mixed definitions, and the 48° definition is unresolved | — | gap-geometry §4.1 | Player-relative band only (D5) |
| Landing | No literature. Kovacs reads landing about 30–60 cm inside the baseline as a sign the body worked well, and advises against coaching the landing | — | gap-ranges §5; gap-audit [A46] [Coaching interpretation] | Trend only, never a trigger |
| First-serve in-rate | About 53–56% across NTRP 3.0–5.0 | SwingVision users | research 06 [S30], research 09 [S45] [Vendor claim] | Context only; never a target |
| Second-serve in-rate | About 70–71% in match play | SwingVision users, NTRP 3.0–5.0 | research 01 [S7] [Vendor claim] | Fire just below it: P(in-rate < 0.70) ≥ 0.8 [Our inference] |

**The honest gap.** No published dataset describes the within-player toss spread, hip rise or landing of UTR 1–7 adults, and no study covers adults over 40 for toss or contact height (gap-ranges §0, §11). Every fire and resolved value above is a starting point. Sections 15.3 and 15.4 describe how we replace them with our own distributions, following the protocol in gap-ranges §9.

### 6.4 Personal thresholds (the player's own history)

- **Baseline.** Once a stratum has ≥ 3 matched sessions with the metric, the baseline is:
  - the median of the per-session values over the last 5 matched sessions;
  - the typical error TE = SD of consecutive-session differences ÷ √2 (research 09 [S70], [S71]).
- **Personal best** (§4 request 2): the best matched-session centre or spread among the last 10 matched sessions. Sessions need at least the item's minimum n and `capture-quality` ≥ `usable`.
- **Relative rule** (§6.2 e): it fires at severity **moderate** (major with a co-signal). It is the primary rule for `legs-spring` and `steady-rhythm`, and it runs alongside the absolute rules for the toss spreads and `reach-up`.
- **"Slipped" rule.** An item also fires, at severity **minor**, when this session is worse than the baseline with P ≥ 0.9 **and** the value is beyond the item's *resolved* threshold.
  - A minor flag cannot become the focus.
  - It appears in "Why this focus?" as "Slipped a little from your usual".
  - It reopens an item that is on cooldown (§7.4).
- **Before 3 sessions:** absolute rules only. The UI says "Compared with published ranges; your own baseline starts after 3 matched sessions". Items that have only a relative path (`legs-spring` without the toggle) list "needs more sessions" under "Also considered".

### 6.5 Within-session fatigue check (load, not a fault)

- **Trigger:** METRICS's `fatigue-flag` (n ≥ 16), a downward trend in contact height across the session. Contact height fell after prolonged play in advanced players (research 03 [S14]) [Established].
- **Action:** coaching shows the METRICS copy as a load note: "Your contact point dropped in the last part of the session, which can be a sign of tiring. A shorter block next time?"
- **Constraints:**
  - the fatigue check never selects a focus;
  - it never changes the verdict;
  - the serves after the drop still count towards detection. If the flag is on, the "Why this focus?" sheet says so.

---

## 7. Priority algorithm (D6)

### 7.1 Inputs and outputs

```ts
type LevelBand = 'utr-1-3' | 'utr-4-7'          // ARCHITECTURE 'utr-4-5' and 'utr-6-7' map to 'utr-4-7' (§7.8)
type Goal = 'first-serves-in' | 'more-pace' | 'second-serve-reliability' | 'less-effort'   // ARCHITECTURE ProfileRecord.goal
type BodyRegion = 'shoulder' | 'elbow' | 'back' | 'knee' | 'other'   // elbow = elbow or wrist; knee = hip, knee or ankle
type EvidenceTier = 'research-backed' | 'coach-recommended' | 'experimental'
type Sex = 'male' | 'female' | 'not-given'                      // requested profile field (§16 item 10); used only for the toss-drop band
type CoachingAgeBand = 'under-18' | '18-39' | '40-59' | '60-plus'  // requested refinement of ProfileRecord.ageBand
type VerdictId = 'clearly-better' | 'likely-better' | 'no-clear-change' | 'too-early'
  | 'likely-worse' | 'clearly-worse' | 'not-comparable'           // METRICS §4.5 = ARCHITECTURE VerdictWord

interface CoachingInputs {
  session: SessionSummary            // view, fpsClass, per-stratum summaries, per-serve MetricValues, outcome tags or tally
  profile: {
    level: LevelBand
    goal: Goal
    comfortRegions: BodyRegion[]     // standing settings from the profile sheet
    heightM: number
    sex: Sex
    ageBand: CoachingAgeBand
    showExperimental: boolean
    pinnedFocusItemId?: string       // "My coach's focus" (research 10 M8; PRODUCT §6.8.5)
  }
  bodyCheck: 'fine' | { sore: BodyRegion[] } | 'pain' | 'red-flag'   // today's pre-session check (§10)
  matchDay: boolean                  // a profile match night (ARCHITECTURE matchNights) from 12:00, or "I'm playing tonight"
  history: {
    matchedSessions: SessionSummary[]
    personalBest: Record<string, PersonalBest>   // by metric id and stratum (§4 request 2)
    activeExperiment?: Experiment
    activeReferral: boolean          // a referral card is still unresolved (§10.3)
    cooldowns: Record<string, number>
  }
}

type CoachingDecision =
  | { kind: 'not-available'; reason: 'under-18' }                         // §9.4
  | { kind: 'referral'; level: 'emergency' | 'today' | 'stop-and-book' }
  | { kind: 'match-day'; itemId: string; cueRegister: 'analogy' | 'outcome'; routineId: 'warm-up-routine' }   // §7.9
  | { kind: 'capture-fix'; issueId: string }                               // copy owned by CAPTURE.md
  | { kind: 'keep-going'; itemId: 'keep-going'; stratum: StratumKey }
  | { kind: 'focus'; itemId: string; stratum: StratumKey; cueRegister: 'analogy' | 'outcome';
      drillVariant: 'base' | 'progression' | 'progression-alt' | 'regression'; effectiveTier: EvidenceTier;
      wording: 'likely' | 'possible';                                      // 'possible' only for the composite rule
      pinnedByCoach: boolean;
      evidence: { keyFrame: ServeRef; compareFrame?: ServeRef; statIds: string[]; outcomeLine: 'association' | 'no-clear-difference' | 'none' };
      reasons: RankReason[];          // shown in "Why this focus?"
      alsoConsidered: { itemId: string; reason: 'later-stage' | 'smaller-gap' | 'not-clear-yet' | 'possible-only'
        | 'comfort-setting' | 'age-rule' | 'needs-more-serves' | 'needs-more-sessions' | 'not-in-frame'
        | 'experimental-off' | 'other-view' }[];
      verdict?: { id: VerdictId; delta: number; moreServes?: number } }   // present when this session was a later matched re-test
```

### 7.2 Steps

```
decide(inputs):
  // 0. SAFETY GATE (always first)
  if bodyCheck == 'red-flag'        -> return referral(emergency | today, per the answers in §10)
  if bodyCheck == 'pain'            -> return referral('stop-and-book')
  if history.activeReferral         -> return referral(resume flow, §10.3)    // match-day card hidden too
  if profile.ageBand == 'under-18'  -> return not-available('under-18')       // §9.4; no focus, drill or load guidance
  comfort = profile.comfortRegions ∪ (bodyCheck.sore ?? [])

  // 1. MATCH DAY (§7.9): never a new focus
  if matchDay -> return match-day(itemId = activeExperiment?.itemId ?? pinned ?? 'keep-going',
                                  cueRegister = current register, routineId = 'warm-up-routine')

  // 2. DATA GATE
  dataOk = capture-quality != 'poor' and usableServes >= 6

  // 3. COACH'S FOCUS (research 10 M8)
  if profile.pinnedFocusItemId:
      item = library[pinned]
      if item.contraindications ∩ comfort ≠ ∅ -> return keep-going (+ "Your comfort settings rule out your coach's focus today")
      return focus(item, pinnedByCoach = true, evidence where dataOk and the item's metrics exist in this view,
                   otherwise the card says "We can't measure this one from this recording" and still shows the cue and drill;
                   the engine's own top pick goes in alsoConsidered)
  if not dataOk -> return capture-fix(top failing QualityCheck)

  // 4. ACTIVE EXPERIMENT (stickiness)
  if activeExperiment:
      if this session is a later matched re-test (§12.3): verdict = METRICS §4.5
      next = experimentTransition(activeExperiment, verdict)                   // §12.5; same-session A/B never counts
      earlierMajor = any item with chainStage < experiment item's stage that passes step 5 with severity 'major'
      if next.continues and item not excluded by comfort and not earlierMajor
                                                     -> return focus(sameItem, next.variant, verdict)
      if earlierMajor -> mark experiment 'superseded'  // §7.4
      // otherwise fall through; a concluded or superseded item goes on cooldown

  // 5. CANDIDATES
  for item in library where item.itemType == 'focus':
      if item.view != session.view                    -> consider(item, 'other-view'); continue
      if item.contraindications ∩ comfort ≠ ∅        -> consider(item, 'comfort-setting'); continue
      if cooldown[item] > 0 and not slipped(item)     -> continue          // §6.4 "slipped" lifts cooldown
      paths = detection paths whose effective tier (§13) is allowed:
              an experimental path needs profile.showExperimental
      if no path allowed                              -> consider(item, 'experimental-off'); continue
      if the primary metric is unavailable because the apex left the frame -> consider(item, 'not-in-frame'); continue
      if minimum serves or sessions unmet             -> consider(item, 'needs-more-serves' | 'needs-more-sessions'); continue
      det = detect(item, paths, profile.sex, profile.ageBand, comfort)   // §6.2; strongest qualifying stratum
      if det.fireRuleMet and det.confidence >= 0.70 and det.severity >= moderate -> eligible.push(item, det)
      else if det.possibleOnly                        -> consider(item, 'possible-only')
      else if det.ageOrComfortRestricted              -> consider(item, 'age-rule' | 'comfort-setting')
      else if det.confidence >= 0.50                  -> consider(item, 'not-clear-yet')

  // 6. RANK (lexicographic, D6)
  sort eligible by:
      a. chainStage ascending                         (earlier in the serve first)
      b. outcomeGap descending; gaps within 0.05 count as a tie   (§7.3)
      c. goal match first (item.goalsServed includes profile.goal)
      d. mechanical items before outcome-only items (a mechanical item explains the outcome and has a key frame)
      e. detectionConfidence descending
      f. library order (JSON array order)

  // 7. NOTHING CLEAR
  if eligible is empty -> return keep-going (stratum = the one with most usable serves)

  // 8. DECISION
  item = eligible[0]
  cueRegister  = level == 'utr-1-3' ? 'analogy' : 'outcome'      // swappable by the player (§9.1)
  cue          = stratum is a second-serve stratum and item.cues.outcomeSecondServe ? that : cues[cueRegister]
  drillVariant = chooseVariant(item, level, goal, comfort)        // §9; progressionGate decides progression vs progression-alt
  whyText      = pickVariant(item)                                // whyItMattersVariants (bring-it-down) by toss-forward and contact-forward
  effectiveTier = weakest(item.evidenceTier, tierByPath[firing path], status of the primary metric)   // §13
  return focus(item, …, alsoConsidered = eligible[1..2] + considered)
```

**`bring-it-down` copy branch** [Our inference, following gap-audit [A6], [A47]]:
- **`tossFar`:** session mean `toss-forward` > 60 cm, the upper edge of the target band.
- **`contactShort`:** otherwise, session mean `contact-forward` < 15 cm, or < 0 cm on kick (the short band, gap-ranges §7.6).
- **Default:** otherwise. The default copy cues spin and a depth target only, never "further in front".

### 7.3 Outcome gap

`outcomeGap(item)` is a number from 0 to 1: the share of this stratum's serves that the fault plausibly costs.

1. **Personal association.** It is used only when all of these hold:
   - per-serve outcome tags exist;
   - the stratum has ≥ 6 serves that went in and ≥ 6 faults;
   - the item has a per-serve signal.

   The METRICS §4.7 test is run on the item's per-serve quantity; for spread items that is |deviation from the stratum median| (§4 request 3). The personal association **counts only if it surfaces**:
   - the 99% interval of the in-vs-fault difference excludes 0;
   - |Δ| ≥ the SWC;
   - the direction matches the fault.

   Then split the usable serves into "fault present" and "fault absent" at the item's resolved threshold, and `gap = max(0, inRate(absent) − inRate(present)) × share(present)`. If the association does not surface, the personal term is **0**, and the card says "No clear difference yet between your in and out serves on this." Research 10 M5 requires that the app can say this, and competent servers show near-identical toss values on serves that went in and serves that faulted (research 03 [S28]; gap-ranges [N2]).
2. **Static link.** It is used when the personal term is 0 or cannot be computed. Each item lists `linkedOutcomes` in the JSON (`net`, `long`, `double-fault`). Then `gap = (misses of the most common linked type) ÷ (serves in the stratum)`, and outcome-only items use their own miss type. This is a prior link from coaching and research, used for ranking only. It is **never shown to the player as a personal finding**.
3. **No outcome data:** `gap = 0`. Ranking then falls through to the goal.

When shown, the association uses METRICS §4.7 wording (an association, never a cause) and counts, with at most one contrast per session.

### 7.4 Stickiness and cooldown

- **An active experiment keeps its focus** until it concludes (§12.5). Two things override it:
  - the safety gate;
  - an eligible fault at an **earlier** stage with severity **major**. The experiment is then parked with the reason "Something earlier in your serve needs attention first".

  A match day holds everything as it is (§7.9).
- **Cooldown.** Resolved items: 2 sessions. Parked items ("not this time"): 3 sessions. A minor "slipped" flag lifts the cooldown early.

### 7.5 Special decisions

| Decision | When | What the player sees |
|---|---|---|
| Referral | The safety gate trips, or a referral is still active (this check runs before the age rule, so red-flag copy always shows) | §10 cards. Stats stay viewable; no drill or cue is shown |
| Not available | Profile age band under 18 | "The serve coach is for adults for now. You can still record and review your serves." No focus, drill, cue or load guidance (§9.4) |
| Match day | The profile's match night, from 12:00 | The pre-match card (§7.9) |
| Capture fix | `capture-quality = poor` or < 6 usable serves | The top failing quality check, with its fix (copy in CAPTURE.md), for example "The toss left the frame on 7 of 12 serves. Move the phone back a metre." |
| Keep going | Data adequate, nothing eligible | The `keep-going` item. "Why?" lists what was checked and found in range. **We never invent a flaw** (research 09 §9) |
| Not enough serves or sessions | An item needs more serves than the stratum has, or a personal history | Listed under "Also considered", for example "Toss consistency needs 12 serves from one side; you recorded 9", or "Leg drive is compared with your own best, which starts after 3 matched sessions" |
| Not in frame | Toss items when the apex left the frame on too many serves (METRICS marks it unavailable) | "Also considered: toss height (the toss went above the frame on 6 of 12 serves)", plus the CAPTURE headroom tip. Coaching never silently falls back to later items without saying why |

### 7.6 "Why this focus?" (transparency sheet)

Template (fill from `reasons`):

> **Why this focus**
> It comes early in your serve, so fixing it often helps what follows. ← stage reason
> Your toss height spread was 21 cm across 16 serves; even allowing for measurement error, it is clearly more scattered than typical. ← detection
> No clear difference yet between your in and out serves on this. ← outcome line (or a METRICS §4.7 association when one surfaces)
> It fits your goal: more first serves in. ← goal, only when matched
> **Also noticed:** contact height (comes later in the serve, so we'll look again after this). Net misses. Leg drive: not coached because of your knee comfort setting. Rhythm: an experimental check, which you haven't switched on.

For a pinned coach's focus the first line is "Your coach's focus". The engine's own pick appears under "Also noticed".

### 7.7 Worked example

**Player.**
- Mia, 41, UTR 4.8, so band `utr-4-7`. Female, age band 40–59. Right-handed, 1.68 m.
- Goal: more first serves in. Comfort setting: knee. "Show experimental" is off.
- Body check today: "All good". Not a match night.

**Session.**
- Side view, portrait at 7.5 m, 60 fps, `capture-quality = good`.
- Deuce court, first serves, intent untagged.
- 18 serves recorded, 16 usable for toss and contact metrics (detected share 0.89).
- Outcomes tagged in review: 8 in and 10 out (7 net, 2 long, 1 wide). First serves in: 8 of 18, shown as 44% (Wilson 95%: 25–66%).

**Step 0. Safety.** No pain, no referral. Comfort = {knee}, so `legs-spring` (contraindication: knee) is excluded before detection.

**Steps 1–4.** Not a match day. Data gate passed (16 usable, `good`). No coach's focus and no active experiment.

**Step 5. Detection** (`meanConf` = 0.90 for every row):

| Item | Evidence | detectionConfidence | Severity | Eligible |
|---|---|---|---|---|
| `toss-height-steady` | Plain SD, since n ≥ 15: s = 21 cm, e = 4 cm, so σ̂ = 20.6 cm. One-sided 90% lower bound σ_L = 16.8 cm ≥ 15. P(σ > 15) = 0.975 | 0.975 × 0.90 = **0.88** | σ̂/T = 1.37, **moderate** | yes |
| `reach-up` | 13 of 16 serves clearly below 1.38; median 1.33. No shoulder setting, age < 60 | 0.994 × 0.90 = **0.89** | 81% clear and the median is 0.05 below the threshold (≥ 2 × SWC 0.015), **major** | yes |
| `clear-the-net` | 7 of 10 misses in the net: P(net share > 0.5) = 0.89. Real-problem gate: net misses are 7 of 18 serves (39% ≥ 25%) | 0.89 × 1.0 = **0.89** | moderate | yes |
| `toss-to-reach-height` | Median drop 105 cm. Mia is female, so the high edge is 125 cm: not high. No fault. (Under the old single 100 cm rule, most of her serves would have been flagged) | n/a | n/a | no |
| `toss-spot-steady` | s = 17 cm, e = 7 cm, so σ̂ = 15.5 cm; P(σ > 18) = 0.29 | 0.26 | n/a | no |
| `legs-spring` | — | n/a | n/a | excluded: comfort setting |
| `steady-rhythm`, `shoulder-tilt`, `flowing-motion` | — | n/a | n/a | "experimental-off" |

**Outcome gap.** In and fault groups are 7 and 9 of the usable serves (both ≥ 6).
- METRICS §4.7 on |apex deviation| and on contact height: neither 99% interval excludes 0, so the personal term is 0 for both items. The card says "No clear difference yet between your in and out serves on this."
- Static links: net is the most common linked miss, so the gap is 7/18 = 0.39 for `toss-height-steady`, `reach-up` and `clear-the-net`.

**Step 6. Rank.**
- (a) Stage order puts `toss-height-steady` (stage 2) ahead of `reach-up` and `clear-the-net` (both stage 6).
- The decision is therefore **toss height**, even though contact height has the higher severity. This is D6 as written. It is also plausible coaching: a toss peaking at a different height each time is a common cause of low and variable contact (research 04 [S14]) [Coaching interpretation].
- For illustration, suppose the toss had not fired. Then `reach-up` and `clear-the-net` tie on stage.
  - (b) The gaps tie (0.39 each).
  - (c) Both serve "first serves in", which is a tie.
  - (d) Mechanical before outcome-only, so **`reach-up`** would win.

**Step 8. Output (UTR 4–7 register).**
- **Focus:** Steady toss height.
- **Evidence:**
  - key frame at the toss apex of her most off-pattern serve, with all 16 apexes drawn on it (apex scatter overlay), beside her best serve: the serve that went in with its apex closest to her median (§8.1);
  - stats: "Toss height spread: 21 cm across 16 serves [Estimated]", with the view note "From the side, a little of this comes from tosses drifting sideways", and "Toss peak about 3.3–3.5 m, about 2.0× your height [Estimated]";
  - outcome line: "No clear difference yet between your in and out serves on this."
- **Cue:** "Every toss peaks at the same spot."
- **Drill:** Same-peak serves, 8 min (no fence-line reference; the count is "tosses you neither waited for nor chased").
- **Re-test:** in a later session, after the warm-up and before the drill: 12–15 deuce first serves, side view.
- **Also noticed:** contact height (later in the serve); net misses. Leg drive is not coached (knee comfort setting).

**Re-test five days later.** It is matched: side view, same set-up (portrait, 7.5 m), deuce court, first serves, untagged. There are 17 recorded and 16 usable serves, s = 14 cm, so σ̂ = 13.4 cm.
- **METRICS §4.5 decides the verdict** (revised 27 Sep 2026; the earlier text used an unbounded −ln SD test). Spreads use the stratified bootstrap of corrected variances with Pocock bounds for 3 looks (z = 2.29 and 1.65) and the between-session term τ = 0.15 on the log scale:
  - Δ = 1 − 13.4/20.6 = 0.35 (35% tighter), above the 15% SWC;
  - CI95* is about −0.40 to 0.71 and CI80* about −0.12 to 0.63. Both lower edges are below 0, so the change is neither `clearly-better` nor `likely-better`; the verdict is **`too-early`**.
- "About N more serves" (log scale): SE ≈ √(1/30 + 1/30 + 0.15²·2) = 0.33; the shrunk effect is about 0.21, so SE* = 0.21 / (2.29 + 0.84) = 0.067. One matched session's τ term alone (0.15²·(1 + 1/3) = 0.030) is bigger than SE*² (0.0045), so no number of serves settles it this way: the "more than 150 serves" message applies.
- Verdict copy: **"Too early to tell. A change this size needs more than 150 serves to confirm, so keep practising and re-test."** The between-session term is why: one good session is not yet evidence that the change stuck. The second and third planned re-tests add sessions (k grows), which is what shrinks τ's share.
- σ̂ = 13.4 cm meets the resolved value of 15 cm once. `worked` needs `clearly-better`, or the resolved value in two consecutive matched re-tests (§12.5), so the experiment continues and the progression unlocks if the log criterion is met.
- The numbers are reproduced by `coaching/experiment.test.ts` ("§7.7 re-test numbers follow METRICS §4.5") through the one `analysis/stats` implementation.

(The previous version of this example, σ̂ 16.7 cm at n = 14 with e = 3 cm, has a lower bound of about 13.4 cm. Under the F3 rule it would be "possible": shown, not coached.)

### 7.8 Alignment with ARCHITECTURE.md (written in parallel)

| This spec | ARCHITECTURE.md | Mapping |
|---|---|---|
| Decision kinds: `not-available`, `referral`, `match-day`, `capture-fix`, `keep-going`, `focus` | `CoachingDecision.gate`: `pain-referral`, `too-few-serves`, `low-confidence`, `ok` | `referral` → `pain-referral`. `capture-fix` → `too-few-serves` (< 6 usable) or `low-confidence` (quality `poor`). `keep-going` and `focus` → `ok`; keep-going is a focus with `faultId: 'none'`. **Requested:** gates for `not-available` (under 18) and `match-day` |
| Item `id` and `faultId` (1:1 for focus items; `null` for the routine) | `focus.faultId` ("coaching-library id") | Store both. `faultId` keys experiments; `id` keys content. `trunk-tilt-low` is renamed `shoulder-tilt-low` |
| Cue register `analogy` / `outcome` | `cue.style`: `analogy` / `external-target` | `outcome` ↔ `external-target`; `cue.id = itemId + ':' + register` (+ `':second'` for `outcomeSecondServe`) |
| Drill variant | `drill.id` | `drill.id = itemId + ':' + variant` (base / progression / progression-alt / regression) |
| `LevelBand` `utr-1-3` / `utr-4-7` | `utr-1-3` / `utr-4-5` / `utr-6-7` / `unknown` | `utr-4-5` and `utr-6-7` → `utr-4-7`. `unknown` → self-rating (§9.1), otherwise `utr-1-3` (looser rules mean fewer false fires) |
| Goals | `ProfileRecord.goal` | Identical ids |
| `comfortRegions` plus the daily body check | `ProfileRecord.comfortRegions`, `comfort { painFlag, area }` | `painFlag = 1` ↔ body check *pain* or *red-flag*, which triggers the referral |
| `sex`, `ageBand` (18–39 / 40–59 / 60+) | `ageBand: 'under-15' \| '15-17' \| '18-plus'`; no sex field | **Requested:** `sex` (optional; "not given" is the default) and an adult age band. Until then: sex = not given (the wider drop band) and age < 60 |
| `matchDay` | `ProfileRecord.matchNights` | `matchDay = today ∈ matchNights` from 12:00, or the player's "I'm playing tonight" |
| `pinnedFocusItemId` | PRODUCT §6.8.5 "My coach's focus" | Requested profile field |
| Practice log (§12.2) | `PracticeLogRecord` | `reps` = `approxServes`. `feel`: awkward = 1–2, OK = 3, natural = 4–5. `discomfort = 1` runs §10. Requested fields: `drillVariant`, `successCriterionMet`, `cueHelpful`, `cueRegisterUsed`, `setting` |
| Stratum including intended type | `StratumKey { mode, side, serveNumber, fpsClass, engineMajor }` | Requested field: `intendedType` |
| Experiment status: `active` / `worked` / `parked` / `superseded` | `active` / `completed` / `abandoned` | `worked` → `completed`; `parked` and `superseded` → `abandoned`, with the reason stored |
| Verdict ids (§12.4) | `VerdictWord` = METRICS §4.5 ids | Identical |
| Library `itemType`, `view`, `tierByPath`, `progressionGate`, `tossOnlyReps` and the other §5.4 fields | Library loader | Requested: the loader must accept the §5.4 fields and skip `routine` items in detection |
| Focus-specific best serve (§8.1) | Session-level `bestServeId`, `representativeServeId` | Coaching computes the focus-specific best serve and falls back to `bestServeId` |
| `reasons`, `alsoConsidered` | `RuleTraceEntry[]`, `alternatives` | `reasons` → trace steps; `alsoConsidered` → `alternatives` |

**Reachability** (ARCHITECTURE's test requires every entry to be reachable or marked dormant):
- `shoulder-tilt` and `steady-rhythm` run only with the experimental toggle on, because their tier is experimental. `shoulder-tilt` also needs METRICS to emit the player-relative band.
- `flowing-motion` runs only with the experimental toggle on while `trophy-pause` is experimental.
- `legs-spring` runs by default through its relative path once 3 matched sessions exist. Its population path needs the toggle.
- `warm-up-routine` is reached through the match-day card and the pre-session warm-up offer, never through detection.

### 7.9 Match day and the pre-match card (research 10 M10)

- **Input.** `matchDay` is true on a profile match night (ARCHITECTURE `matchNights`) from 12:00 local time, or when the player taps "I'm playing tonight".
- **Order.** The body check runs first (§10.1). Pain or a red flag gives the referral card. **While a referral is active the match-day card is hidden**, because it would suggest serving.
- **Content** (PRODUCT §6.8.4; this spec owns it):
  - "Match night. Your cue: *{cue}*." The cue is the active focus's cue in the player's current register. With no active experiment it is the pinned coach's focus cue, or otherwise the `keep-going` cue.
  - The warm-up routine (§11.1): at most 10 serves, easy to firm, respecting comfort notes.
  - "No new changes today."
  - It shows no stats and works offline.
- **No new focus.** On a match day `decide()` never starts, switches, supersedes or concludes an experiment, and never unlocks a variant.
  - A session recorded that day is analysed and stored, and counts towards the serve budget and load.
  - Its verdict and any new decision are shown the next day.
- **Budget.** The routine's 10 serves count towards the session budget and weekly load. Match serves are added from the morning-after match log (M6; §11).

---

## 8. Evidence presentation

### 8.1 Key frames and the "best serve"

- **Representative serve (the key frame):** within the locked stratum, among serves with confidence ≥ 0.7.
  - For per-serve, band, relative and composite items, it is the serve whose focus-metric value is closest to the session median. We use the median, not the worst serve (research 06 §7.3).
  - For spread items, a single serve cannot show a spread. The key frame is therefore the serve furthest from the session median, and every other apex (or timing bar) is drawn on it by the overlay.
- **Best serve (`compareTo: 'best-serve'`):** from this session and the last 3 matched sessions, among serves with confidence ≥ 0.7 that went in (if outcomes were tagged).
  - For per-serve, band, relative and composite items, it is the serve with the best focus-metric value that is also within the item's resolved band.
  - For spread items, it is the serve closest to the player's median.
  - If none qualifies, fall back to `previous-session`, the representative serve of the last matched session.
  - If there is no previous session, show the single key frame with the overlay and no comparison.
  - **We never compare to a professional.**
- **`compareTo: 'previous-session'`:** the representative serve of the last matched session. It is used by items whose evidence is a distribution (rhythm, outcomes).
- **Key frame:** `keyFramePhase` names the `ServePhase`. The UI takes the frame from the matching event: toss → `tossApex`, loading → `trophy`, contact → `contact`.
- **Overlay:** the JSON field `evidence.overlay`. `DESIGN.md` owns the drawing (§16 item 10 asks DESIGN to rename two overlays).

| Overlay id | What it shows |
|---|---|
| `apex-scatter` | Apex dots for every serve over the key frame |
| `apex-vs-toe` | Vertical line at the front toe, dot at the apex |
| `toss-arc` | Ball path from apex to contact, with the drop labelled against the player's own band |
| `contact-height-line` | Horizontal line at contact height, labelled as a % of height |
| `contact-vs-toe` | Contact point vs the front-toe line |
| `hip-rise` | Mid-hip trace from the lowest point to contact, labelled with the rise as a % of height. The lowest point is marked but **no depth value is labelled** (P11) |
| `shoulder-line` | Line through both shoulders at the trophy position, labelled with the band word only; no degrees (D5) |
| `timing-strip` | One bar per serve from release to contact, with the pause shaded |
| `outcome-tally` | In / net / long / wide counts by serve number |
| `none` | No overlay |

### 8.2 Stats and labels

- Each focus shows **1–2 stats** (`evidence.statIds`). Each has its D2 honesty label, n, and an interval where it matters (D7).
- **Experimental values never appear in a non-experimental focus explanation** (research 09 §9). If one of an item's `statIds` is experimental at runtime (for example `drive-time` in `legs-spring`), drop it and show only the other stat. If both are experimental, the item's effective tier is experimental (§13).
- Band metrics are shown as the band word plus its key frame. Degrees are never shown (D5).
- `loading-depth` and `deep-bend-flag` are never focus stats. `landing-distance` appears only as a trend line with the experimental toggle on.
- Toss spreads carry the view note: "From the side, a little of this comes from tosses drifting sideways" (D1).
- Speed is never a focus stat (D4).

---

## 9. Adaptation

### 9.1 By level

**Assigning the band:**
- UTR < 4.0 → `utr-1-3`; UTR ≥ 4.0 → `utr-4-7`. The launch segment (D11) is about UTR 3–7, so both bands matter.
- UTR above 7 → `utr-4-7`, with a note that the library is written for UTR 1–7.
- No UTR: ask "Which sounds most like you?"
  - "Still getting my serve going" → `utr-1-3`;
  - "I get most serves in but want more" → `utr-1-3`;
  - "I play competition or pennant" → `utr-4-7`.
- The UTR-to-ability mapping is unverified (research 04 §6), so the player can switch the band in the profile at any time.

| Aspect | UTR 1–3 | UTR 4–7 |
|---|---|---|
| Cue register | `analogy` (research 04 [S46]) | `outcome` (research 04 [S40]) |
| Swap register | "Try the other cue" link in the focus card. The swap is logged (it feeds the cue A/B test, §15.4) | same |
| Thresholds | Same absolute bands at both levels (gap-ranges §7 covers UTR 1–7); player-relative rules adapt to the player | same |
| Drill start | Base variant; the app suggests the regression if the success criterion is missed in 2 logs | Base variant; the progression is unlocked after the criterion is met in 2 logs |
| Progression gating | A progression whose `progressionGate` excludes `utr-1-3` is replaced by `progressionAlt` | Gated progressions allowed unless a listed comfort region is set |
| Serve distance | Regressions start at the service line | Regressions start at the baseline with larger targets |
| Session serve budget (§11) | 60 | 80 |
| Kick serve | **Never** in any variant. Spin work is slice (research 10 M7) | Only in progressions gated to `utr-4-7`, and never with a back comfort setting |
| Back-leg serving | Never | Optional progression of `legs-spring`, labelled "Coaches differ", never with knee or back comfort settings (gap-audit §5 T1, T6) |
| Jumping | No drill adds a jump | No drill adds a jump. Both named schools treat lift-off and landing as results (gap-audit §5) |

The content lint checks this table against the JSON (§14).

### 9.2 By goal, and the onboarding question (research 10 M1)

**Onboarding asks one question: "What costs you points on serve?"** The options appear in this order, with none preselected:
1. "Double faults" → `second-serve-reliability`;
2. "Not enough first serves in" → `first-serves-in`;
3. "Not enough pace" → `more-pace`;
4. "Serving feels like hard work" → `less-effort`.

The goal breaks ranking ties (§7.2 c), selects the drill variant and sets the transfer-set format. The first three rows below follow research 03 §10 [Our inference].

| Goal (label) | Tie-break prefers items with this goal | Drill variant and transfer set | Load |
|---|---|---|---|
| `first-serves-in` ("More first serves in") | Toss, contact, net and long patterns | Transfer set to box targets, counting ins | Standard |
| `more-pace` ("More pace") | Legs, tilt, pause, contact height | Progression may add "speed intent" sets (research 04 [S49]), at most 30 hard serves (§11). No speed numbers from the side view drive anything (D4) | Hard-serve cap applies; no speed-intent sets with shoulder or elbow comfort settings |
| `second-serve-reliability` ("A second serve I trust") | Second-serve margin, toss height, rhythm | Transfer set of second serves only. The card says what the side view can and cannot see (M7; `evidence.viewNote`) | Standard |
| `less-effort` ("Serve with less effort") | Rhythm, flowing motion, toss height, toss to reach | Regression variants first; no speed intent; no jump | Session budget 40; hard-serve cap 0 |

**About the `less-effort` goal.** It changes only content selection and load. Two copy rules apply:
- The app never claims that a focus reduces pain or injury risk. Health claims would move the app towards being a health service under the Privacy Act and outside TGA exclusion 14B (research 07 §1.1, §8.3) [Regulation, Our inference].
- The goal screen carries the line: "If something hurts, see a physio or GP. This setting just keeps sessions gentler."

### 9.3 By physical comfort (standing settings and today's soreness) and by age

Comfort regions come from the profile sheet (standing) and from today's "a bit sore" answer (session only). They never raise an item's priority; they only exclude and adjust. [Our inference: raising priority for "injury reasons" would be a health claim, and research 04 §7 itself says such prioritisation should only follow professional clearance.]

| Region or rule | Items excluded (JSON `contraindications`) | Adjustments (`comfortNotes`, gates) | Load |
|---|---|---|---|
| shoulder | none by default | `reach-up`: relative rule only (no absolute band), taps only. No speed-intent sets. `second-serve-margin`: slice at 70%, 20 serves at most. Warm-up: stop after the half-effort serves | Budget 40; hard serves 0 |
| elbow (elbow or wrist) | none by default | No speed-intent sets. `second-serve-margin`: slice at 70%, 20 serves at most. Warm-up: stop after the half-effort serves | Budget 40; hard serves 0 |
| back | `shoulder-tilt` | Slice, not kick: every kick progression is locked (research 04 F16: kick vs flat loading is unresolved, research 03 [S15]). No back-leg serves. Effort about 70% | Budget 40 |
| knee (hip, knee or ankle) | `legs-spring` | No back-leg serves; no jumps anywhere; platform stance allowed | Budget 40 |
| other | none | No speed intent | Budget 40; hard serves 0 |
| Age 60 or over (not a comfort region) | none | `reach-up`: relative rule only. Stature declines with age, and there are no contact-height data for older players (gap-ranges §7.3) | Standard |

**Region ids** match ARCHITECTURE.md `BodyRegion`. `comfortRegions` ("areas to go easy on") is not a pain flag and never triggers a referral by itself (§7.8).

If **every** eligible item is excluded by comfort, the decision is `keep-going`. Its drill already avoids jumping and speed intent, and the card adds: "Your comfort settings rule out today's main candidates. Check with a physio before working on them."

### 9.4 Players under 18: blocked in v1 (D11)

D11 limits the closed beta to adults of 18 and over and defers juniors. A light adaptation of adult content is not an adequate safety basis for juniors, who carry the highest lumbar risk: elite adolescents show high rates of lumbar abnormality, including pars lesions (research 03 [S38]), and high serve lumbar loads (research 03 [S36]) [Established].

**Rule.** A profile whose age band is under 18 gets `not-available` (§7.5):
- no focus, cue, drill, experiment, warm-up routine or load guidance;
- recording, review and player-entered stats still work.

**Deferred design note** (not in v1; for a future junior release, pending clinical and privacy review and the Children's Online Privacy Code):
- no kick serve anywhere;
- a lower serve budget, and the ramp flag at an acute:chronic ratio of 1.3 (research 03 [S43], high-performance juniors) [Contested];
- "Work on this with a qualified coach if you can" on every card;
- an extra body-check prompt, "Back pain that gets worse when you arch or serve", leading to *Stop and book* (research 03 §12, juniors row);
- junior reference bands, since none of this spec's bands apply to juniors.

---

## 10. Pain and red-flag screen, and referral copy

**Rules.**
- The app screens and signposts. It never assesses, never names a condition, never estimates severity and never suggests treatment or rehab (research 07 §8.3: TGA 14B; Apple 1.4.1).
- Answers are stored on the phone only, after express consent (APP 3.3), and are never synced, sent to analytics or shared with any AI (D8; research 07 §11).
- The wording below is adapted from clinical guidance (research 03 [S55] BESS; [S56] ACSQHC Low Back Pain Clinical Care Standard) and research 03 §12. **It must be reviewed by an Australian physiotherapist or sports and exercise physician before release.** The night-pain question and the APSS-based onboarding screen (§10.3) are part of that review.

### 10.1 Body check (before every recording, every logged practice and the match-day card)

> **Quick body check**
> How's your body today?
> ( All good ) ( A bit sore or tight ) ( It hurts )

- **All good:** continue.
- **A bit sore or tight:**
  1. "Where?" [Shoulder] [Elbow or wrist] [Back] [Hip, knee or ankle] [Somewhere else]. These map to the `BodyRegion` ids `shoulder`, `elbow`, `back`, `knee` and `other`.
  2. "Is it sharp, getting worse, waking you at night, or still there from your last session?" [Yes] [No]
     - **Yes** → treat as *It hurts*. Research 04 §8 lists night pain alongside sharp, worsening and persisting pain as a reason to refer.
     - **No** → add the region to today's comfort settings and continue with: "We'll go easy on your [area] today: fewer serves, no jumps or max-effort swings. If it turns sharp or builds while you play, stop."
- **It hurts** → red-flag questions (10.2).
- **First use only:** "Save body-check answers on this phone so we can adjust your drills? They never leave this phone." [Save on this phone] [Don't save]. If the player declines, the check still works for the current session.

### 10.2 Red-flag questions (shown after "It hurts")

> **Do any of these apply right now?**
> ☐ Chest pain or pressure, fainting, or trouble breathing that isn't normal for you
> ☐ New trouble controlling your bladder or bowels, or numbness around your groin or buttocks
> ☐ Leg weakness that is getting worse, or numbness in both legs
> ☐ A joint that looks out of shape, or won't move, after a fall or knock
> ☐ You suddenly can't lift your arm
> ☐ A hot, red or swollen joint, or you feel feverish or unwell
> ☐ Sudden sharp pain in your side or tummy while serving
> ( One or more of these ) ( None of these )

The first three map to **Emergency**. The rest map to **See a doctor today**. "None" maps to **Stop and book**.

Grouping "suddenly can't lift your arm" under *today* is more cautious than the source guidance, which says urgent, within 2 weeks (research 03 [S55]). We chose one simpler tier. The reviewing clinician decides.

### 10.3 Referral cards

**Emergency.**
> **Please stop and call 000 now.**
> What you've described needs urgent medical care. If you can't call, ask someone nearby to call for you.
> [Call 000]

**See a doctor today.**
> **Please stop serving and see a doctor today.**
> A GP or an emergency department can check this properly. We've paused coaching; your stats are safe.
> Not sure where to go? healthdirect's 24-hour line can help: 1800 022 222. *(Verify the number and service description before release.)*
> [OK]

**Stop and book.**
> **Let's skip serving today.**
> Pain that's sharp, getting worse, waking you at night or hanging around is worth getting checked by a GP, physiotherapist or sports doctor. With back pain, see a GP soon if it comes with a fever, follows a fall, is there even when you rest, or you've had cancer or unexplained weight loss. We'll keep your focus and stats ready for when you're back.
> [OK] [Remind me in 3 days]

The back-pain line paraphrases the alerting features in the ACSQHC standard (research 03 [S56]).

**During or after a drill** (practice log body answer = sore or pain):
> Stop the drill if pain is sharp, builds as you go, wakes you at night or is still there the next day, and see a physiotherapist or sports doctor.

This is the pain rule for all drills (research 04 §6) [Coaching interpretation].

**Resuming.** A referral stays active (and the match-day card stays hidden) until the player taps "It's settled" at a later body check. After a *see a doctor today* or *emergency* answer, the next check also asks "Have you been checked by a doctor or physio?" (self-declared). The app cannot verify it, and it says so: "Thanks. If anything flares up, stop and get it checked again."

**Onboarding screen.**
- **Basis.** It follows stage 1 of the Australian **Adult Pre-Exercise Screening System (APSS)** from Exercise & Sports Science Australia, Sports Medicine Australia and Fitness Australia (now AUSactive). It replaces the 2013 Better Health Channel page (research 04 [S36]), which this spec had already called possibly outdated.
- **Wording.** The stage 1 questions are used verbatim from the current official version. The version, wording and any licence terms must be confirmed before release (UNVERIFIED here), so the questions are not reproduced in this spec.
- **Any "yes" answer:** "Please check with your GP or another health professional before starting a new serving routine. You can still record and review your serves."
- **Storage.** The answers are health information. They are not stored; only "screen shown on {date}" is kept (D8).

---

## 11. Load guidance

There are no dose-response data for recreational adult serving. The workload findings come from high-performance players (research 03 [S43]). Every number below is [Our inference] unless tagged otherwise, deliberately conservative and adjustable in settings.

| Rule | Default | Basis |
|---|---|---|
| Warm-up routine (§11.1) | 10 serves, easy to firm; offered before every recorded or drill session and on the match-day card. **No hard serves before it** | [Coaching interpretation; structure Our inference] |
| Recording block | 12–36 serves (CAPTURE.md sets the protocol) | research 06 §7.3 |
| Drill volume | 20–40 serves, 5–10 min | research 04 §6 |
| Guided serve budget per session (warm-up + recorded + drill + transfer) | 60 (UTR 1–3); 80 (UTR 4–7); 40 with any comfort setting or the `less-effort` goal | [Our inference] |
| Hard (near-max-effort) serves | ≤ 30 per session; 0 with shoulder or elbow comfort settings; never before the warm-up | research 04 F15 [Our inference] |
| Weekly ramp | METRICS `load-flag`: last 7 days ÷ weekly mean of the last 28 days > 1.5, **and** ≥ 100 serves in the last 7 days. The 100-serve floor lets low-volume players build | A ratio > 1.5 went with a hazard ratio of about 2.8 for new injury in adult high-performance players (research 03 [S43]) **[Contested; high-performance players only]**. That review excluded recreational players, its primary studies were not checked, and the acute:chronic ratio has well-known methodological criticisms. The flag is therefore a gentle nudge, never a lock, a warning of injury or a reason to change the focus |
| Return after a break | ≥ 14 days without logged serves: first week at ≤ 50% of the previous weekly average | [Our inference], in the spirit of the ramp-up findings in research 03 [S43] |
| Spacing | At least one lighter day between days above 60 guided serves. A comp night counts as such a day | [Our inference] |
| Within-session fatigue | §6.5 note: "A good place to stop" | research 03 [S14] |

### 11.1 Warm-up routine (`warm-up-routine`; research 10 M10, PRODUCT §6.8.4)

This spec now owns the routine; PRODUCT's draft is superseded. The comp-night cohort is aged about 30–55 and serves close to maximum effort in matches (D11), and CAPTURE templates assume a warm-up before recording.

1. A general warm-up first: a few minutes of easy movement or rallying.
2. 3 shadow swings, slow to medium, saying your cue.
3. 4 serves at about half effort to big targets, alternating deuce and ad.
4. 3 serves at about two-thirds effort with your cue in mind.
5. 3 second serves at about 80% effort. Then stop: "Done. Same cue tonight."

There are 10 serves in total, and effort rises from about 50% to 80%. It takes about 5 minutes, needs no camera and shows no stats. Comfort notes apply:
- shoulder or elbow: stop after the half-effort serves;
- back: slice only.

The tier is coach-recommended; no study has tested this routine.

### 11.2 Counting

The weekly count includes:
- **Recorded serves:** counted automatically.
- **Drill serves:** from the practice log (`approxServes`, prefilled from the drill).
- **Warm-up routine serves:** 10 when done in the app.
- **Match serves:** from the morning-after match log (research 10 M6). Match serves ≈ 10 × service games + 10 warm-up serves [Our inference].
  - The factor of 10 serves per service game assumes about 6–7 points per game and about 1.45 serves per point at a first-serve in-rate near 55%.
  - This count feeds only METRICS's `load-flag`. It is never pooled with practice statistics, never given a verdict and never used to choose a focus. ARCHITECTURE's rule that match logs are never inputs needs this one exception (§16 item 10).

Serves outside the app that are not logged are unknown, and the copy says so.

**Budget copy:**
- At the budget: "That's your serve budget for today. Nice work." The player may continue; the budget is guidance, not a lock.
- Above the ramp: "You've served a lot more this week than usual. Build up gradually if you can." This is the METRICS `load-flag` copy, softened.
- The copy makes no claim that the budget prevents injury (§14).

---

## 12. The experiment loop

### 12.1 Experiment record

```ts
interface Experiment {
  id: string
  itemId: string
  stratum: StratumKey                    // ARCHITECTURE StratumKey + requested intendedType (§7.8)
  fpsClass: 'fps30' | 'fps60' | 'fps120plus'
  startedSessionId: string
  baseline: { metricId: string; value: number; sd?: number; n: number; outcome?: { k: number; n: number } }
  target: { resolvedWhen: string }       // copied from the JSON
  cueRegister: 'analogy' | 'outcome'
  drillVariant: 'base' | 'progression' | 'progression-alt' | 'regression'
  pinnedByCoach: boolean
  retests: { sessionId: string; verdict: VerdictId; resolvedMet: boolean }[]   // later matched sessions only
  sameSessionChecks: { sessionId: string; delta: number }[]                  // display only (§12.3)
  status: 'active' | 'worked' | 'parked' | 'superseded'
}
```

### 12.2 Practice log (local only)

One screen, all prefilled; 10 seconds to complete.

| Field | Type | Default |
|---|---|---|
| `date` | date | today |
| `itemId`, `drillVariant` | from the active experiment | current |
| `minutes` | 5 / 10 / 15 / other | drill minutes |
| `approxServes` | integer | the drill's serve count |
| `successCriterionMet` | yes / partly / no | none |
| `feel` | felt natural / OK / felt awkward | none |
| `cueHelpful` | yes / not sure / no | none |
| `cueRegisterUsed` | analogy / outcome | current register |
| `body` | fine / sore (region) / pain | runs the §10 flow if not "fine" |
| `setting` | court / wall / other | court |
| `note` | free text, 140 characters, never leaves the phone | empty |

**Rules driven by the log:**
- `successCriterionMet = yes` in 2 logs unlocks the progression. The variant the player gets is decided by `progressionGate`: the progression if their level and comfort settings pass, otherwise `progressionAlt` (§9.1).
- `no` in 2 logs suggests the regression.
- `feel = awkward` in 2 consecutive logs triggers: "Some changes feel odd at first, but a good change usually starts to feel better within a session or two. Want to try the other cue?" This follows Kovacs Institute teaching that a correct fundamental change should feel better within minutes to hours. The source is a Kovacs Academy post by a Ki Serve Fellow and the Ki team (research 04 [S15]; gap-audit §4.3) [Coaching interpretation].

### 12.3 Re-test protocol and matching

**When.**
- After at least 1 logged practice (2 is better), ideally within 7 days.
- In a **later session**, recorded **after the warm-up routine and before practising the drill**, so we measure what stuck rather than the drill's immediate effect. Learning is judged by retention, not by performance during practice (research 04 [S38] reports the two separately) [Coaching interpretation].

**What.** 12–15 serves in the locked stratum: same view, same camera side, same court side, same serve number and the same intended type. Serve at match pace to one target, with your cue in mind. The verdict needs at least 8 included serves each side (METRICS §4.1, §4.5). Spread items should aim for 12 or more, so detection can also re-run.

**Matched** means METRICS §4.4 (view and camera side, **set-up**, court side, serve number, intended type and handedness). Its soft factors apply, and a `poor` capture makes the pair not comparable. Different court, light or wind are allowed and noted on the comparison card (ARCHITECTURE §5.7 caveats). The set-up (orientation, camera distance class and singles or doubles serving spot, `StratumKey.setup`) is a hard key for heights, positions and spreads, so a baseline filmed at 6 m never pools with a re-test at 7.5 m (revised 27 Sep 2026; METRICS §1.6, §4.4).

**Same-session comparisons (CAPTURE §5 "Experiment" template: Block A → drill → Block B).**
- They are shown only as **"Straight after practice"** copy, for example: "Straight after practice: toss spread 18 → 12 cm (same session). That's the drill's immediate effect, which often fades. Your next session will show what stuck."
- A same-session comparison **never**:
  - drives a §12.5 transition;
  - counts as a re-test, meets a resolved threshold or starts a cooldown;
  - marks an experiment `worked`;
  - serves as the "Did it work?" moment that shows the paywall (research 10 M9).
- Only a later matched session does these things. §15.1 has a unit test for this.

### 12.4 Verdicts ("Did it work?")

**METRICS §4.5 owns the verdict:**
- the verdict ids (`clearly-better`, `likely-better`, `no-clear-change`, `too-early`, `likely-worse`, `clearly-worse`, `not-comparable`), which are identical to ARCHITECTURE `VerdictWord`;
- the minimum of 8 included serves per side;
- the baseline pooling (up to 3 matched sessions before the focus, at most 60 serves) and follow-up pooling;
- the goodness transform, the SWC table and "About N more serves" (N capped at 150).

Coaching adds no verdict rules of its own.

**What coaching reads:**
- **Primary metric.** It is the item's first `metricId`, so process metrics lead (D7). Outcome-only items use their rate.
- **Guard metric.** The linked outcome is shown underneath as METRICS's guard metric, with n and a Wilson interval.
- **Spreads.** Detection uses a MAD-based σ̂ when n < 15 (§6.2 b), but verdicts use METRICS's plain SD with its outlier rule (METRICS §4.2). If METRICS adopts a MAD-based spread for verdicts, it must use the effective df of about 0.37 × (n − 1) or a bootstrap.

**Copy examples** (METRICS words):
- "**Likely better.** Your toss height spread went from 21 cm to 13 cm (16 serves, same side view). About 20 more serves to confirm."
- "**About the same.** Contact height 136% → 137% of your height. Changes like this often take a few sessions."
- "**Not comparable yet.** This session was ad court; your experiment is on the deuce court."
- "**Too early to tell.** About 25 more serves would settle it."

### 12.5 Ending an experiment

Only later matched re-tests count (§12.3).

| Situation | Transition | Copy |
|---|---|---|
| `clearly-better`, or the resolved threshold met in 2 consecutive matched re-tests with no `likely-worse` or `clearly-worse` | `worked`; 2-session cooldown; next session re-ranks | "It worked. Your toss height is steadier. We'll keep an eye on it while you work on something new." |
| `likely-better` | Continue; unlock the progression (or `progressionAlt`) if the log criterion is met | "Keep going; it's moving the right way." |
| `too-early` | Continue; ask for a fuller re-test block | "Too early to tell. Record a few more serves next time." |
| `no-clear-change` after 2 re-tests | Continue with the other cue register, or the regression drill | "No clear change yet. Let's try it from a different angle." |
| `no-clear-change`, `likely-worse` or `clearly-worse` after 3 re-tests | `parked`; 3-session cooldown | "This one isn't shifting yet, and that's normal. Let's park it and try another route." |
| `likely-worse` or `clearly-worse` | Continue with the regression; check the body and feel answers | "It dipped a little, which often happens mid-change. Let's make the drill a bit easier." |
| `not-comparable` | No transition | The reason, from METRICS |
| An earlier-stage fault becomes major | `superseded` | "Something earlier in your serve needs attention first." |
| Match day | No transition until the next day (§7.9) | — |

---

## 13. Evidence tiers

D2 sets three tiers for coaching insights. They describe **the claim in "why it matters"**, not the honesty label on a number.

| Tier | Criteria | UI chip | v1 items |
|---|---|---|---|
| `research-backed` | Peer-reviewed studies link the thing being changed to serve performance **within players** (or show that changing it changes performance), **and** its detection metric is measured or estimated | "Research-backed" | **None in v1.** The toss, contact and rhythm links are between-player or between-level comparisons in elite, experienced or junior samples. Serves that went in and serves that faulted had near-identical toss values (research 03 [S28]; gap-ranges [N2]). Items stay coach-recommended until a within-player outcome association is shown (gap-ranges §9.7) |
| `coach-recommended` | The recommendation comes from expert teaching (the Kovacs Institute, Intuitive Tennis free lessons, Essential Tennis, Feel Tennis, ITF CSSR), with at most indirect research support. Detection is measured, estimated or player-entered, and its thresholds are anchored in population data or player-relative | "Coaches recommend" | Toss consistency (experienced men stabilise the vertical toss, research 03 [S29]); toss in front; toss within reach; no waiting; contact height (between-level data in adult men, research 03 [S6]); contact in front; leg drive (relative path); second-serve spin; miss patterns; keep going; warm-up |
| `experimental` | The detection metric is experimental, **or** the thresholds lack population data, **or** the coaching link is only our inference | "Experimental" plus the flask glyph (D2) | `steady-rhythm` (gap-ranges §7.4); `shoulder-tilt` (no reference applies; the band is new); `legs-spring` population path; `flowing-motion` while `trophy-pause` is experimental |

- **Effective tier** at runtime = the weakest of the item's `evidenceTier`, the firing path's tier (`tierByPath`) and the primary metric's status, where `experimental` status forces `experimental`.
- **Effective experimental items run only with "Show experimental" on** (§5.1).
- **"How we know"** names the population behind every claim, for example "in 13 junior men" or "in 22 professional men".
- **Cues and drills are always coaching interpretation.** No trial supports any specific cue for UTR 1–7 servers (research 03, Open question 5). The "How we coach" page says so.
- **No item is tagged on vendor claims.** For example, Kovacs's statement that good servers lose only 5–7 mph off the back leg is a [Vendor claim] (research 03 [S50]) and is not quoted in-app.
- **"Coaches differ"** is a label on a drill variant, not a tier. It appears where the named schools disagree (back-leg serving: gap-audit §5 T1, T6).

---

## 14. Content style guide

- **Voice:** calm, warm, specific, not chatty. Use second person. Use Australian English (practise/practice, metre, colour, racquet). No emoji, no exclamation marks in coaching copy.
- **`whyItMatters`** (and each variant):
  - exactly **2 sentences** in plain English;
  - sentence 1 says what goes wrong in the player's serve, sentence 2 says what the evidence or coaches say;
  - numbers only when sourced, and never "better servers do X" unless within-player or level data show it;
  - no joint names beyond shoulder, hip, knee and back;
  - no injury-prevention or load claims ("asks your back to…").
- **Cues:**
  - **fewer than 8 words**, concrete, sayable in one breath;
  - analogy cues use one image (lift, shelf, window, jack-in-the-box, wave);
  - outcome cues name a ball position, target or count;
  - never cue tossing-arm drop timing, the wrist, forearm rotation, the front hip, the landing or knee depth (P9, P11);
  - never prescribe a toss height (gap-audit §5 T5).
- **Drills:**
  - solo, public court, basket, 5–10 minutes, with a countable success criterion the player can honestly judge (never "peaks at a background line": from the server's eyes the apex sits about 70–75° up, far above any fence rail);
  - removable markers only (towel, racquet cover, ball can); never chalk or tape on public courts;
  - at most 5 toss-only reps including check tosses, and every toss rep moves the racquet arm (P7);
  - never "hold" or "freeze" the landing;
  - always end with the 10-serve transfer set (P8).
- **Never say:** "wrong", "bad serve", "fix your injury", "protect your shoulder", "prevents injury", "like the pros", "perfect toss", "bend more", "sit down", "deeper", "be tall", any diagnosis word, any degree value for a joint.
- **Comparisons** are always with the player's own serves.
- **Uncertainty** is stated in words first ("likely", "too early to tell", "may"), then numbers.
- **Names:** no coach's name in cues, drill names, features, notifications or App Store metadata. Names appear only in the "Where this comes from" source sheet (§17.5; gap-audit §6.2).

**Content lint** (a unit test over `coaching-library.json`; the app builder implements it):
1. Every cue (analogy, outcome, `outcomeSecondServe`) is under 8 words.
2. `whyItMatters` and every variant have exactly 2 sentences.
3. `drill.minutes` is between 5 and 10.
4. Every `metricId` and `statId` is in the canonical id list (§4).
5. **`trunk-tilt-band` is rejected anywhere.**
6. **`knee-bend-band` and `shoulder-over-shoulder-contact` are rejected in any item whose `view` is `side` or `any`.**
7. **`loading-depth` and `deep-bend-flag` are rejected in every `metricIds` and `statIds`.**
8. `landing-distance` is never the first `metricId` and never a `statId`.
9. `keyFramePhase` is a `ServePhase` (null only for `itemType: routine`); `compareTo` and `overlay` are valid enums.
10. Every source key resolves to a verified row of the attribution register (§17.4) and to a source in §17. Named-coach attribution is allowed only for rows marked verified. `research 04 [S2]` and `[S4]`–`[S9]` are rejected.
11. `faultId` is unique among focus items; `keep-going` and `warm-up-routine` are present.
12. `drill.tossOnlyReps` ≤ 5, and each drill text with toss-only reps mentions the racquet arm moving.
13. **Level gating (§9.1):** the drill instructions (`setup`, `steps`, `successCriterion`, `regression`, `progressionAlt`) never contain "kick" or "back leg". Only a `progression` may, and then its `progressionGate.levels` is `["utr-4-7"]`. For kick, `excludeIfComfort` includes `back`; for back-leg serving it includes `knee` and `back`, with `label: "coaches-differ"`. The informational `note` may say where a kick toss goes but never asks for one. No drill text contains "jump". A gated progression always has a `progressionAlt`.
14. **Deny-list phrases** in cues, drills and `whyItMatters`:
    - depth: "sit", "bend more", "deeper", "lower your hips";
    - landing: "hold your landing", "freeze";
    - tossing arm: "keep pointing", "pull your arm down", "drop your arm";
    - toss height: "cm above", "above your reach";
    - "be tall" and "lighthouse";
    - contact: "brim", "before it drops", "head height";
    - "trunk", "arch".
15. **Contradictory cues across items:** no cue negates another item's cue phrase. For example "not across" is rejected, because `second-serve-margin` teaches "brush up and across". A maintained list of cue-pair checks lives beside the test.

---

## 15. Validation and tests (accuracy as a product requirement)

The founder did not allow downloading real serve footage, so v1 validation uses the synthetic generator, unit tests and in-app annotation. Real-footage and coach-agreement validation are documented next steps.

### 15.1 Engine unit tests (must pass before release)

| Test | Fixture | Expected |
|---|---|---|
| Worked example (§7.7) | Synthetic metric summaries | `toss-height-steady` (σ_L 16.8 cm); `legs-spring` excluded for comfort; `reach-up` ranked second |
| Old example is only "possible" | s = 17 cm, n = 14, e = 3 cm | Toss item listed "possible-only", not coached |
| Tie-break chain | §7.7 without the toss fault | `reach-up` over `clear-the-net` (rule d) |
| MAD effective df | n = 13, MAD-based s = 19 cm and s = 22 cm (e = 4 cm) | No fire at 19 cm (σ_L 13.2 cm with df_eff = 4.4); fires at 22 cm (σ_L 15.5 cm) |
| Sex-specific drop | Drop median 110 cm with one co-signal: male vs female | Male: "possible" fires; female: no fault |
| Never on drop alone | Drop median 160 cm, no co-signal | No fault; drop shown as a band |
| Legs never on depth | Low `loading-depth`, `deep-bend-flag` = no, normal `leg-drive` | `legs-spring` not eligible |
| Legs relative | 3 sessions with best median 12%; this session 8% (P > 0.9) | `legs-spring` eligible, moderate; major if drive time is ≥ 80 ms longer |
| Legs before 3 sessions, toggle off | Any values | Listed "needs more sessions" |
| Reach-up shoulder and age | Shoulder comfort (or age 60+), median 1.33, no history | Not eligible; listed "age-rule" or "comfort-setting" |
| Kick allowances | Kick stratum, toss-forward −12 cm (upper bound) | `toss-behind` does not fire; resolved needs mean ≥ 0 cm |
| Real-problem gate | 60 first serves, 52 in, 8 misses of which 7 net (P(net share > 0.5) = 0.98, but net misses are only 12% of serves) | `clear-the-net` not eligible |
| Personal association | 7 in / 9 fault, association CI includes 0 | Personal term 0; card says "No clear difference yet…" |
| Same-session A/B | Block A → drill → Block B, large improvement | "Straight after practice" copy; no transition, no `worked`, no paywall trigger |
| Pain gate | Body check = pain, or any red flag | Referral; no focus; no drill text rendered |
| Active referral on match day | Referral active, match night | Referral card; no match-day card |
| Match day | Active experiment, strong new stage-2 fault | Match-day card with the same cue; no new focus; no transition |
| Under 18 | ageBand under 18 | `not-available`; no drill, cue or load text |
| Coach's focus | Pinned `contact-in-front`, engine would choose toss | Pinned item is the focus; the toss item is under "Also noticed" |
| Comfort exclusion | Knee setting with a strong `legs-quiet` signal | Not chosen; listed as "comfort setting" |
| Progression gating | `second-serve-margin` log criterion met twice: UTR 1–3; UTR 4–7 with back comfort; UTR 4–7 without | `progression-alt`; `progression-alt`; kick progression |
| All excluded | Every eligible item contraindicated | `keep-going`, with the comfort line |
| Capture gate | 5 usable serves, or quality `poor` | `capture-fix` |
| Not in frame | Apex unavailable on 6 of 12 serves | Toss items listed "not-in-frame"; headroom tip shown |
| Keep going | All metrics inside the resolved bands | `keep-going`; "Why?" lists the checks |
| Stickiness | Active experiment plus a new moderate stage-2 fault | Same focus continues |
| Supersede | Active stage-6 experiment plus a new major stage-2 fault | Experiment superseded |
| Unmatched re-test | Ad court vs deuce experiment | `not-comparable` |
| Verdict maths | §7.7 re-test numbers | `likely-better`, N = 20; resolved met once; status stays `active` |
| Experimental gate | Toggle off | `steady-rhythm`, `shoulder-tilt`, `flowing-motion` listed "experimental-off" |
| Other view | A rear-view session | No side-view item runs; each is listed "other-view" |
| Content lint | `coaching-library.json` | All §14 lint rules pass; a fixture with `trunk-tilt-band`, a "sit" cue or a 6-rep toss drill fails |

### 15.2 Synthetic end-to-end (with `tools/synth`)

- **Method.** The generator's truth exposes the coaching signals:
  - `tossApexHeightM`, `tossApexForwardOfFrontToeM`, `tossHeightAboveContactM` (drop), `contactHeightRatio`, `contactForwardOfFrontToeM`, `releaseToContactS`, `trophyPauseS`;
  - `legDrive.hipRisePctHeight`, `legDrive.driveTimeS` and `legDrive.loadingDepthPctHeight`;
  - `shoulderTiltTrophy.deg2DLevel`, which is the value a side-view band is scored against.

  The test runs as follows:
  - For each fault, generate matched sessions with the fault injected at 3 magnitudes (below, at and 1.5 × the fire threshold) across 3 seeds, 2 frame rates (60, 120) and 2 player heights.
  - Run the full pipeline (video → metrics → coaching).
  - Include D1 set-ups: portrait at 7.5 m, landscape at the fence, and a 5° measured tilt. Include apexes up to 4.6 m, some above the frame, to test the "not-in-frame" path.
  - **Gaps in the generator** (tools/synth README):
    - Shoulder tilt at the trophy position is a constant (16.83° in 3D), so `shoulder-tilt` needs a varied thorax-lean parameter and a re-render before its band can be tested.
    - Hip-rise parameters need a sweep of 4–20% of height with drive times of 0.2–0.6 s.
    - The old `maxKneeFlexionDeg` and `trunkInclinationContactDeg` fields are not coaching inputs any more.
    - Serve number, double faults and radar are not modelled, so outcome items are tested with injected tags.
- **Targets** [Our inference]:
  - detection sensitivity ≥ 0.9 at 1.5 × threshold;
  - false-fire rate ≤ 0.1 below threshold;
  - the chosen focus equals the injected fault in ≥ 90% of single-fault sessions;
  - with two injected faults at different stages, the earlier stage wins in ≥ 90%.
- **Honesty.** Synthetic results validate the logic and the maths only. They say nothing about real-world accuracy, and the accuracy page must say so.

### 15.3 In-app annotation mode (founder or coach)

- A reviewer marks per serve:
  - apex frame, contact frame, lowest-hip frame and landing frame;
  - shoulder-tilt band at the trophy position, relative to the player's own serves (low / typical / high);
  - outcome;
  - "Would you coach this first?" (yes / maybe / no) for the app's chosen focus.
- Knee bands are annotated only on rear-view clips.
- **Outputs:** per-item agreement between the app's detection and the reviewer's; percentage agreement on the focus choice; per-signal Bland–Altman on frames and on hip rise.
- **Targets** [Our inference, matching research 05 §11.3 and gap-geometry §9]:
  - band agreement ≥ 80%;
  - event timing ≤ 1 frame mean absolute error;
  - hip rise within ±2% of height;
  - focus rated "yes" or "maybe" on ≥ 80% of sessions.

### 15.4 Real-world next steps (documented, not run)

1. **Coach agreement.** Two blinded coaches independently pick the single highest-value change for 30 recreational players' sessions. We report Krippendorff's α against the app, targeting ≥ 0.7, as in the expert-rating study (research 03 [S33]).
2. **Reference distributions for UTR 1–7.** Replace the §6.3 provisional bands with percentiles from our own reference set, following gap-ranges §9:
   - sex × age band × UTR band;
   - at least 30 players per cell;
   - mixed-effects models separating between-player and within-player spread.

   Recruit adults over 40 early (D11 segment). Add hip-rise and drive-time distributions, which the gap studies could not find.
3. **Within-player outcome links.** Estimate within-player associations (for example the odds of a serve going in per 10 cm of apex deviation). No item moves to `research-backed` until one is shown (gap-ranges §9.7).
4. **Usefulness metrics.** These feed research 08 §8.2:
   - share of experiments reaching `likely-better` or `clearly-better` within 3 re-tests, per item;
   - per-item "cue helpful" rate;
   - re-test completion rate.
5. **Cue A/B test.** Randomise the register (analogy vs outcome) within each level band. Compare next-session verdict rates and `cueHelpful`. The literature is contested (research 04 [S38], [S39]). Throwing-image cues stay alternatives only (gap-audit §5 T9).

---

## 16. Known limitations and issues flagged for the product lead

1. **D6's strict stage order can pick a marginal upstream issue over a major downstream one.** Mitigation in this spec, which follows D6: eligibility requires severity ≥ moderate (§6.2), a "possible" spread is never coached, and an active experiment is superseded only by a *major* earlier fault.
   - **Suggested amendment:** "stage order applies among faults of equal or higher severity tier".
   - I recommend keeping D6 as written plus the severity gate, and revisiting once coach-agreement data exist (§15.4).
2. **Cross-spec conflict: METRICS §4.1 keeps "provisional" values out of coaching triggers** (spreads with n < 20). CAPTURE's standard block is 12–15 serves per side. This spec fires spreads at n ≥ 12 only on a one-sided 90% bound (gap-ranges §7.1). **Recommendation:** "provisional" should limit headlines and display wording, not coaching triggers that apply their own sample-size test. The product lead should settle this.
3. **Framing.** The revised D1 settles the earlier framing risk: portrait at 7–8 m, or landscape at the fence, a headroom check that blocks recording below 4.3 m, and measured tilt removal. What remains: an apex more than about 0.5 m above the frame is `unavailable`, and toss items then say "not in frame" rather than silently dropping out (§7.5).
4. **Thresholds are starting values.** The recreational bands are provisional, with ±15–50% on their edges (gap-ranges §7). The legs population edge (7% of height) has no recreational data at all. Expect retuning after §15.4.
5. **Evidence is mostly from elite and male samples** (research 03 §1). Women, older players and left-handers are under-studied. The toss-drop bands are sex-specific because of this. Every reference shows its population.
6. **The outcome items depend on honest tagging.** Tag coverage discounts detection confidence, and a tally is accepted.
7. **Coaching disagreement is real** (gap-audit §5):
   - leg drive, active (Kovacs) vs passive (Intuitive Tennis);
   - toss height (higher is safer vs err lower);
   - weight at the trophy position, and back-leg serving;
   - throwing images.

   v1 takes these positions:
   - a quick single rise, never depth;
   - no prescribed toss height;
   - back-leg serving only as an optional UTR 4–7 progression labelled "Coaches differ";
   - "always swing" and "don't cue the arm" (P7, P9).

   The alternatives are documented under "How we coach".
8. **Tennis Australia's coach-education content could not be read** (HTTP 403; research 04 [S77]). We cite TA-affiliated research, not TA's curriculum.
9. **Items that start restricted:**
   - `shoulder-tilt` and `steady-rhythm` are experimental (toggle).
   - `shoulder-tilt` also waits for METRICS's player-relative band.
   - `flowing-motion` is experimental while `trophy-pause` is.
   - `legs-spring` needs 3 matched sessions (or the toggle).

   All are designed in, so they switch on without content changes.
10. **Requests to other specs** (not edited here):
    - **ARCHITECTURE:**
      - add optional `sex` and an adult age band with 60+ to `ProfileRecord`;
      - add `pinnedFocusItemId`;
      - add the `not-available` and `match-day` decision gates and the `matchDay` input;
      - make the library loader accept the §5.4 fields (`itemType`, `view`, `tierByPath`, `progressionGate`, `progressionAlt`, `tossOnlyReps`, `whyItMattersVariants`, `viewNote`, `outcomeSecondServe`, `note`, `optionalAid`);
      - rename the fault id `trunk-tilt-low` to `shoulder-tilt-low`;
      - allow the match log's `serviceGames` to feed METRICS's `load-flag` count only (§11.2).
    - **METRICS:**
      - the §4 requests (miss types, personal best, the |deviation| contrast, trophy-to-contact, shoulder-band availability);
      - the serves-per-game factor in `load-flag`;
      - whether `second-serve-in-rate` stays a separate id (coaching uses `serve-in-rate` in the second-serve stratum; the two map 1:1).
    - **CAPTURE:**
      - §0 and §4 re-test minimum: use METRICS's 8 included serves, while still asking for 12–15 serves;
      - §5 Experiment template: the Block B comparison is "Straight after practice" only (§12.3).
    - **PRODUCT:**
      - §1.5 attribution wording: "a Kovacs Academy post reporting Kovacs's observations"; no Intuitive Tennis credit for a 1-2-3 drill;
      - §6.3.1 re-test copy (≥ 8 included serves);
      - §6.8.4 warm-up: now owned by §11.1 here;
      - the paywall must use the first *later matched* "Did it work?".
    - **DESIGN:**
      - rename the overlays `hip-path` → `hip-rise` and `trunk-line` → `shoulder-line`, with no depth or degree labels;
      - the band tile shows `shoulder-tilt-trophy`, and shows `knee-bend-band` in rear-view sessions only.
11. **`landing-distance` reference point.** metrics.json measures from where the front toe started; gap-ranges §7.5 measures from the baseline. Coaching uses the metric only as an experimental trend, so either works, but the copy must match METRICS.
12. **Toss-spread honesty.** From the side, a 10 cm sideways toss spread adds 2–4 cm of apparent height spread (D1). The coaching default error (4 cm) and the view note account for it, and the rear view removes it.

---

## 17. Sources

Source keys in `coaching-library.json` use the forms `"research 03 [S7]"`, `"gap-geometry [G8]"`, `"gap-ranges [N1]"`, `"gap-audit [A46]"` and `"research 10 M10"`. Full citations are in the research files, in their Sources sections.

### 17.1 Established findings we rely on

| Key | Finding used | Population |
|---|---|---|
| research 03 [S1] / research 04 [S12] | Kovacs & Ellenbecker 8-stage model (a framework, not a measurement tool); toss slightly in front and to the hitting side; "lateral rear tilt" during loading (its checkpoints are Coaching interpretation) | Review of elite data |
| research 03 [S2] | Elliott 2006: shoulder tilt; about 20% lower internal-rotation speed after a 1.5 s pause | Elite / lab |
| research 03 [S3] | Elliott et al. 2003: < 10° knee flexion → higher shoulder and elbow loads at similar speed; abbreviated backswing similar | Olympic players |
| research 03 [S4] | Fleisig et al. 2003: proximal-to-distal sequence. (Its "48°" trunk figure is not used: definition unresolved, gap-geometry §4.1) | 20 Olympic players |
| research 03 [S6], [S7] | Girard et al.: contact 142.6% vs 149.2% of height (beginner vs elite); intermediate 148.4% vs elite 147.5%; knee restriction −15–17% speed at all levels | Beginner to elite men |
| research 03 [S9] / research 04 [S28] | Reid, Elliott, Alderson 2008: foot-up ≈ foot-back | 12 high-performance men |
| research 03 [S10] | Martin et al. 2014: poorer trunk-to-hand energy flow in injured players | 19 high-level men |
| research 03 [S14] / research 05 [S50] | Martin et al. 2016: lower impact height after a 3-hour match; the authors state that higher impact increases the margin over the net | 8 advanced players |
| research 03 [S15] / research 04 [S26] | Martin et al. 2026 review: load findings; kick vs flat loading unresolved | Review |
| research 03 [S19] | Sheets et al. 2011: kick has a more sideways racquet path and contact further back | 7 NCAA men |
| research 03 [S20] | Reid, Whiteside, Elliott 2011: toss and impact shift by target on first serves | 6 professionals |
| research 03 [S23] | Whiteside et al. 2013: net faults differ mainly in ball projection angle | Elite junior females and 1 professional woman |
| research 03 [S24] | Whiteside et al. 2015: variable toss, consistent timing | Elite women |
| research 03 [S25] | Reid et al. 2010: toss practised alone changes the toss | 5 elite juniors |
| research 03 [S27] / research 04 [S29] | Newton et al. 2025: 0.56 m drop, 0.97 s release to impact; tossing-arm timing changes wreck accuracy | 10 high-performance men |
| research 03 [S28] | Vacek et al. 2025: 0.72 ± 0.19 m drop; toss identical on good and faulted serves; impact height ρ ≈ 0.75 (0.63 normalised) with speed | 13 junior men |
| research 03 [S29] | Mendes et al. 2013: vertical toss stabilised; about 1:1.5 contact ratio | 12 experienced men |
| research 03 [S30] | Antúnez et al. 2012: more variability with lower speed and accuracy (between players) | 17 players |
| research 03 [S33] | Wood et al. 2023: experts rate rhythm, leg drive and trunk reliably from 2D | 300 elite players |
| research 03 [S34] | Fett et al. 2021: deuce vs ad differences | 14 elite junior men |
| research 03 [S35] | Connolly et al. 2021: flat contact about 17 cm further forward than kick | Elite adolescents |
| research 03 [S36], [S38] | Campbell et al. 2013: high lumbar lateral-flexion loads; Alyas et al. 2007: lumbar MRI abnormalities in asymptomatic elite adolescents | Elite adolescents |
| research 03 [S43] | Amor-Salamanca et al. 2025: workload ratios > 1.3 (juniors), > 1.5 (adults) with more injuries [Contested; high-performance only] | High-performance only |
| research 03 [S48] / research 04 [S19] | Fourel et al. 2024: push timing and impulse, not peak force, relate to racquet speed | 36 competitive players |
| research 03 [S61] | Caprioli et al. 2025: amateur contact about 18 cm in front of the front toe | 13 amateurs |
| research 06 [S8] | Whiteside, Giblin, Reid 2014: professional women's toss SDs about 6–7 cm | 8 professionals |
| research 04 [S33] | Zhou et al. 2026: amateurs brake with a stiffer, more reactive landing than elites (abstract only) | 15 amateur vs 15 elite men |
| research 04 [S34] | Deghaies et al. 2026: individual loading strategies (same paper as gap-geometry [G8]) | 22 professionals |
| research 04 [S37], [S38], [S39], [S40] | External-focus meta-analyses and re-analysis; distal focus in experienced performers | Meta-analyses |
| research 04 [S45], [S46], [S47] | Analogy learning, ES about 0.3, mainly novices; analogy = explicit instruction for the serve | RCTs; 44 juniors |
| research 04 [S52] | Czyż et al. 2024: contextual interference, smaller in applied settings | 34 studies |
| research 04 [S55], [S56], [S57], [S60] | Bandwidth feedback; visual + verbal feedback; video alone adds little over coaching; self-controlled video helps | Various |
| research 09 [S70], [S71] | Hopkins: a change must beat the measure's typical error | Methods |
| gap-geometry [G1] | Fett et al. 2021: body orientation at trophy and contact (why the side view sees knees end-on and cannot see forward lean or shoulder-over-shoulder at contact) | 14 elite junior men |
| gap-geometry [G4] | Kovacs & Ellenbecker 2011 full text: "lateral rear tilt" during loading; shoulder-over-shoulder is qualitative | Review |
| gap-geometry [G7] | Tubez et al. 2019: back-hip peak upward speed 2.22 ± 0.27 m/s; leg-drive duration 0.26 ± 0.07 s | 13 ITN 3 players |
| gap-geometry [G8] | Deghaies et al. 2026: CoM rise 15.8 ± 3.4% of height, r = 0.87 with impact height; loading depth not related to performance | 22 male professionals |
| gap-geometry [G9] | Chen et al. 2024: CoM rise about 15–17.5% of height (derived from the paper's tables) | 10 national and provincial women |
| gap-ranges [N1], [N2] | Carboch & Hrychová 2025: recreational vs competitive women's toss, drop and contact; toss nearly identical on in, long and net serves | 2 recreational, 8 competitive women |
| gap-ranges [N3] | Shafizadeh et al. 2025: recreational release-to-contact about 0.91–0.97 s; within-player CV about 5–6% | 21 recreational adults (11 aged over 60) |
| gap-ranges [N4], [N5] | Elliott et al. 2013; Liu et al. 2000: female drops 0.82 m and 0.94 m | Professional and elite junior women |
| gap-ranges [N9] | Tubez et al. 2021: trophy-to-impact 0.54 s (children) vs 0.33–0.36 s | ITN 1–6 players (24) |

### 17.2 Coaching interpretation we adopt (presented as "Coaches recommend")

| Key | Practice used | Verification |
|---|---|---|
| research 04 [S14], [S15] | Kovacs Institute: over 80% of serve issues start at release or loading; fundamentals vs style; a correct change should feel better quickly. **Kovacs Academy posts by T. Patiño (Ki Serve Fellow) and the Ki team, reporting Dr Kovacs's observations**, not Kovacs's own writing | Verified (gap-audit §4.3) |
| gap-audit [A46], [A47], [A55] | Kovacs's own talks: knee bend is about velocity, not depth; no waiting at the bottom or for a falling ball; toss height is style (at most about 46 cm above reach, err lower; we prescribe none); landing about 30–60 cm inside is a result, not a cue; net misses mostly from opening early; rhythm is a result | Verified (captions) |
| research 04 [S16] / research 03 [S50] | Kovacs Academy back-leg serving drill. Used only as an optional UTR 4–7 progression labelled "Coaches differ"; the 5–7 mph figure is a Vendor claim and is not quoted | Verified (post); disputed by Intuitive Tennis (gap-audit [A12]) |
| research 03 [S51] | Kovacs Academy Tennis Congress summary: explosive, synchronised drive rather than simply deeper bend | Verified |
| gap-audit [A1], [A4], [A6], [A8], [A10], [A11], [A13], [A15], [A17], [A20], [A23], [A27], [A33] | Intuitive Tennis (N. Aracic) **free YouTube lessons**:<br>• toss in front and never behind the baseline, including kick; judged against the baseline;<br>• a toss too far in front opens the face and misses long;<br>• never practise the toss arm alone;<br>• a higher toss is safer than a low one;<br>• passive leg drive and no jumping;<br>• double knee bend;<br>• toss arm rising after release gives the tilt;<br>• lag rhythm, no stop at the trophy, and the racquet-drop leak;<br>• "high-five a giant";<br>• the jackknife cause;<br>• flat, then slice, then kick | Verified (captions); paraphrased only |
| research 04 [S2], [S4]–[S9] | Intuitive Tennis course and "Problems at the Rec Level" pages. **Not cited for content:** the "1-2-3 rhythm", "control before power" and the rec-level lessons are unseen paid titles, and "be tall" is on the course's list of myths | Unverified; removed from the library |
| research 04 [S48] | Buszard, Reid, Farrow, Masters (Tennis Australia-affiliated): analogies, errorless practice | Verified |
| research 04 [S49] | Regan 2025 (ITF CSSR): constraints-led serve practice; always swing at the toss; speed intent (the author calls these untested) | Verified |
| research 04 [S51] | Krause et al. 2019: practice design changes behaviour (representative design) | Verified (abstract) |
| research 04 [S62], [S63], [S65] | Feel Tennis (T. Mencinger): relaxed acceleration; toss-and-catch; fence serves | Verified |
| research 04 [S67], [S68], [S69] | Essential Tennis: toss release; match the toss to the leg drive; second-serve spin via a sideways swing path | Verified |
| research 04 [S72] | Online Tennis Instruction: behind-the-baseline serves; net-clearance air targets | Verified |
| research 10 M1, M5, M7, M8, M10 | Segment requirements: the onboarding question; "no clear difference" must be sayable; double-fault coaching copy; my coach's focus; the pre-match card | Product decision |

**Vendor claims used as context only, never as evidence for a focus:**
- research 06 [S30] and research 09 [S45]: SwingVision's recreational first-serve in-rates;
- research 01 [S7]: SwingVision's second-serve in-rates in match play;
- research 03 [S50]: Kovacs's back-leg speed figure.

### 17.3 Clinical and regulatory sources

| Key | Used for |
|---|---|
| research 03 [S55] | BESS subacromial shoulder pain commissioning guide: shoulder red flags |
| research 03 [S56] | ACSQHC Low Back Pain Clinical Care Standard (2022): back red flags |
| research 03 [S39] | Rectus abdominis strain mechanism: "sudden side or tummy pain" prompt |
| research 04 §8 | Referral reasons: sharp, worsening, night and persisting pain |
| APSS stage 1 (ESSA, SMA, Fitness Australia / AUSactive) | Onboarding pre-exercise screen. **Current version and wording to be verified before release** (UNVERIFIED) |
| research 04 [S36] | Better Health Channel (Vic) tennis injury advice (reviewed 2013). Superseded by APSS as the basis for onboarding |
| research 07 [S29], [S30], [S2] | TGA exclusion 14B; Apple App Review Guidelines (1.4.1, 5.1.3); Privacy Act (health information, APP 3.3) |
| gap-audit §6 (A69–A76) | ACL s 18 and s 29(1)(g)–(h) misrepresentation risk; platform terms; Apple 5.2.1, 5.2.2, 2.3.7 |
| research 04 [S77] | Tennis Australia coach-education pages: returned HTTP 403, so they were not read and are not relied on |

### 17.4 Attribution register (gap-audit §6.2)

One row per library item. "Own" means our own wording. "Adapted" means that similar advice appears in the listed free material. "Generic" means common coaching practice. Named-coach sources appear only in the "Where this comes from" sheet. Legal review is required before release.

| Item | Cues | Drill | Related sources (verified) | Status |
|---|---|---|---|---|
| `toss-height-steady` | Own | Own (feel count; no background line) | research 03 [S29]; gap-audit [A8] (racquet arm moves on toss reps) | Verified |
| `toss-spot-steady` | Own ("shelf" image adapted from gap-audit §5 T2) | Generic (towel target) | research 03 [S29]; gap-audit [A8] | Verified |
| `toss-in-front` | Own | Generic | research 03 [S1]; gap-audit [A6] | Verified |
| `toss-within-reach` | Own | Generic | gap-audit [A6], [A47] | Verified |
| `toss-to-reach-height` | Adapted (gap-audit §5 T5, our wording) | Own | gap-audit [A1], [A4], [A46]; gap-ranges §7.2 | Verified; the schools disagree on height, so no height is prescribed |
| `legs-spring` | Adapted (gap-audit §5 T1, our wording) | Own; back-leg progression adapted from research 04 [S16] | research 03 [S7], [S48]; gap-geometry [G8]; gap-audit [A10], [A46] | Verified; back-leg labelled "Coaches differ" |
| `shoulder-tilt` | Own ("see-saw" image, generic) | Own | research 03 [S1]; gap-geometry [G4]; gap-audit [A15] | Verified |
| `steady-rhythm` | Adapted (lag rhythm, gap-audit §5 T7) | Adapted; the optional count is [Our inference], not attributed | gap-audit [A16], [A17], [A55] | Verified; **no "1-2-3" attribution** |
| `flowing-motion` | Own | Adapted (lag-rhythm regression) | research 03 [S2]; gap-audit [A20], [A47] | Verified |
| `reach-up` | Adapted ("high-five": gap-audit [A23]) | Generic | research 03 [S6]; research 05 [S50] | Verified; no "be tall" |
| `contact-in-front` | Own | Own | research 03 [S35]; gap-audit [A6] | Verified |
| `second-serve-margin` | Own | Generic (spin ladder) | research 04 [S69]; research 03 [S19]; gap-audit [A33] | Verified |
| `clear-the-net` | Own | Generic (air target) | research 03 [S23]; research 04 [S72]; physics [Our inference] | Verified |
| `bring-it-down` | Own | Generic | research 04 [S69]; gap-audit [A6], [A47] | Verified |
| `keep-going` | Own | Generic | research 04 [S52], [S51] | Verified |
| `warm-up-routine` | Own | Own | research 10 M10 | Product decision; structure is [Our inference] |

### 17.5 "How we coach" source sheet: independence statement

Shown at the top of the "Where this comes from" sheet (profile → How we coach), and in the legal section of the App Store description. Template (gap-audit §6.2; for legal review):

> {App} is independent. It is not affiliated with, sponsored by or endorsed by Intuitive Tennis, Nikola Aracic, the Kovacs Institute or Dr Mark Kovacs. Names are used only to cite published coaching material, in our own words.

Rules:
- link out, never embed;
- no photos, logos or likenesses;
- "Coaches differ" where they do;
- never attribute a paywalled lesson's content.

### 17.6 Our inferences (every number that is ours)

- Fire and resolved thresholds (§5.2, JSON), including:
  - the legs relative threshold (3% of height) and population edge (7%);
  - the drive-time co-signal (80 ms);
  - the real-problem gate (25%, and P(in-rate < 0.5) ≥ 0.8);
  - the e = 4 cm toss default.
- Minimum serves (§6.1), the confidence gate of 0.70 and the severity tiers.
- Load budgets, the serves-per-game factor (10) and the warm-up structure.
- The kick allowances.
- Best-serve selection, and the synthetic and annotation acceptance targets.
- The net-clearance physics in the `clear-the-net` note: a point-mass drag model with Cd 0.55, no spin and contact at 2.45 m, straight down the middle.

Each is to be replaced or confirmed with our own data (§15.4).

---

## 18. Revision log (2026-09-27)

**Decision-driven changes (D1, D4, D5, D11).**
- **D1/D5 (knee):**
  - Removed the side-view knee band from every item.
  - `legs-spring` is re-keyed to `leg-drive` (hip rise), with `drive-time` as a co-signal. It is player-relative first, with an experimental population path.
  - P11 is now "never cue depth".
  - `loading-depth` and `deep-bend-flag` are descriptive only and linted out of `metricIds` and `statIds`.
- **D1/D5 (trunk):**
  - Removed `trunk-tilt-band`.
  - `shoulder-tilt` uses the player-relative `shoulder-tilt-trophy` with no degree cut points, and its fault id is renamed `shoulder-tilt-low`.
  - Removed the 25 ± 7.1° and 48° references.
  - Removed `lift-not-arch` and `stay-tall`, and withdrew the request for a contact trunk reading.
- **D1 (framing, bias, tilt):**
  - Recorded the portrait and fence set-ups, the headroom check, tilt rectification and apex extrapolation.
  - Added the "not-in-frame" reason, the sideways-spread view note and the e = 4 cm default.
  - §16 item 3 is resolved.
- **D4:** speed never drives a focus or verdict; there is no audio flight-time path from the side view.
- **D11:**
  - Under-18 profiles are blocked (§9.4).
  - Added the onboarding question (M1), the no-clear-difference line (M5), the double-fault view note (M7), the coach's focus (M8), the match-day card and warm-up routine (M10), and match serves in the load count (M6).
- **Other changes:**
  - Removed `land-into-court` (landing is a result).
  - The library is now 14 faults + `keep-going` + `warm-up-routine`, with new schema fields (§5.4).

**Reviewer issues.** Numbered in the order received. All were accepted except where noted.
1. Removed-metric triggers (P11, legs, trunk faults, trunk-fold, toss-too-high): **accepted**.
2. `legs-spring` on the knee band: **accepted**. The cues and drill follow gap-audit T1. `reach-up`'s outcome cue was changed to avoid duplicating the legs cue.
3. Items on `trunk-tilt-band`; `stay-tall`: **accepted**. `stay-tall` was deleted, and the lint rejects the removed and rear-only ids.
4. `toss-to-reach-height` single threshold: **accepted**. It now uses sex-specific bands and co-signals, the "Toss so you never have to wait" cue, and no prescribed height.
5. `lift-not-arch`: **accepted**. It was removed from the library and from the `less-effort` tie-break list.
6. `shoulder-tilt` copy: **accepted**. Sentence 1 is rewritten, "not across" is gone, a contradiction lint is added, the arm-timing steps are removed, and the tier is experimental.
7. Toss spread thresholds: **accepted**. This is gap F3 (90% bounds of 15 and 18 cm, n ≥ 12, ≥ 80% detected). "Possible" is not coached, resolved is 15 and 20 cm or a 30% reduction, and §7.7 is reworked.
8. Evidence tiers: **accepted**. No v1 item is research-backed. Rhythm and the legs population path are experimental, and `reach-up`'s sentence 2 is rewritten.
9. `steady-rhythm`: **accepted**. [S2] and "1-2-3" are removed, there is a lag-rhythm drill with an optional uneven count [Our inference], the bound is 90 ms (relative first), and the tier is experimental.
10. `land-into-court`: **accepted**. The item is removed, the freeze and hold steps are removed, and landing is a trend only.
11. Kick allowances: **accepted**. Toss: fire −15 cm, resolved ≥ 0 cm. Contact: fire −10 cm, resolved ≥ +5 cm.
12. Level gating: **accepted**. `progressionGate` and `progressionAlt` added, the spin ladder base is slice-only, back-leg serving is UTR 4–7 with no knee or back setting and "Coaches differ", and the lint is added.
13. `reach-up` shoulder, age and kick: **accepted** as the relative-only option for a shoulder setting or age 60+, with 1.35 for kick and second serves.
14. `clear-the-net`: **accepted**. The real-problem gate is added (also applied to `bring-it-down` for consistency), and targets are scaled by serve type. Our own physics check confirms the reviewer's figures (about 0.7 / 0.45 / 0.3 m at 100 / 120 / 140 km/h). The `shoulder-tilt` criterion is changed to depth.
15. Fence-line toss references: **accepted**. Replaced by a feel count, partner call, roof beams or the next recorded block, and no heights are prescribed.
16. Attributions: **accepted**. The Kovacs Institute wording is used, [S2] is removed, "be tall" is dropped, and the register lint is added.
17. Load: **accepted**. The ramp is [Contested], M6 match serves are counted (×10 per game), and the warm-up routine is added and counted.
18. Same-session A/B: **accepted**. It is "Straight after practice" only, with a unit test.
19. Personal association: **accepted**. It uses the METRICS §4.7 rule, the personal term is 0 unless it surfaces, and the card says "no clear difference". *Interpretation:* the static link still ranks, as it does for tallies, but is never shown as a personal finding.
20. Toss-only reps: **accepted**. At most 5 including checks, with the racquet arm moving; `tossOnlyReps` is linted.
21. `bring-it-down` copy branch: **accepted** (`whyItMattersVariants`).
22. Night pain and APSS: **accepted**. The APSS wording is to be verified, and clinician review is required.
23. Under 18: **accepted** (blocked; deferred note kept).
24. MAD effective df: **accepted** for detection (0.37 × (n − 1)). Verdicts follow METRICS.
25. `flowing-motion`: **accepted**. Sentence 1 is hedged, the lab finding moved to §6.3, and the regression is lag rhythm.
26. `contact-in-front` cue: **accepted** ("Reach up through a window ahead"), with a lint against lower-contact wording.
27. Four items on removed metrics, and overlays: **accepted in part**. The re-key of `shoulder-tilt`, the overlay renames (`hip-rise`, `shoulder-line`) and the removal of `stay-tall` are done. **Rejected:** re-keying `lift-not-arch` to the high shoulder band. An arch cannot be seen from D1, and a high in-plane tilt is mostly desirable (issue 5 prevails).
28. Verdict defined three ways: **accepted** for these files. METRICS §4.5 ids, minimum n and N cap apply, and `resolvedWhen` uses `clearly-better`. The CAPTURE and PRODUCT alignment is flagged in §16 item 10; ARCHITECTURE `VerdictWord` already matches.
29. Match day: **accepted** (§7.9, `matchDay` input, §11.1 routine).
30. The 80/20 and 1-2-3 wording, and independence: **accepted**. The PRODUCT §1.5 change is flagged.

**Consistency round (27 Sep 2026, later).**
- **§7.7 worked example follows METRICS §4.5.** The re-test (σ̂ 20.6 → 13.4 cm, n = 16 each side) is now worked through the METRICS §4.5 spread rule (stratified bootstrap, Pocock 2.29 / 1.65, τ 0.15 on the log scale): **too early to tell**, with the "more than 150 serves" message, instead of the earlier "likely better, about 20 more serves" (an unbounded −ln SD test with no τ). Coaching's fallback verdict is now the `analysis/stats` implementation itself, so the injected and fallback verdicts cannot disagree; the unit test reproduces the §7.7 numbers.
- **Spread noise in verdicts.** "Did it work?" corrects spreads with the engine's per-serve σ_r (METRICS §4.2), the same correction the session's own spread uses, so a one-session baseline or re-test shows the same number as that session's report. The e = 4 cm default (which adds sideways drift) stays a detection rule (§6.2 b) and a fallback when METRICS reports no σ_r.
- **Set-up is a matching key (§12.3).** Baselines and re-tests match on the set-up key (orientation, distance class, serving spot) as METRICS §4.4 requires; sessions analysed before the key existed match any set-up.
- **Experiment state.** A verdict that ends an experiment (`worked`, `parked`, `superseded`) maps to the stored `completed` or `abandoned` status (`experimentRecordStatus`), not `active`.
