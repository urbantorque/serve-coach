# COACHING — coaching framework and content library (v1)

Spec owner: coaching workstream. Written 27 September 2026, in Australian English.
Companion data file: `docs/specs/coaching-library.json`. The JSON holds the 18 focus items. This document explains how they are chosen, adapted, delivered and tested.
Follows `docs/DECISIONS.md` (D1–D10). Where I think a decision needs changing, the text flags it and does not diverge (see §16).

**Labels.** [Established] means a peer-reviewed finding or strong consensus. [Coaching interpretation] means expert practice that has not been directly tested. [Our inference] means our own reasoning, including every numeric threshold in this spec that does not cite a study. Citations point to the research files, for example (research 03 [S7]) = `docs/research/03-serve-biomechanics.md`, source S7.

**Reading order for builders.** Engineers should start with §4 (signals), §6 (detection), §7 (priority algorithm) and §12 (experiment loop). Content designers should start with §9 (adaptation), §10 (pain screen copy), §14 (style guide) and the JSON.

---

## 1. The coaching model in one page

1. **Every analysed session produces exactly one coaching decision (D6).** It is one of four kinds:
   - a **focus**: one change, with one cue and one drill;
   - **keep going**: nothing is clearly worth changing;
   - a **capture fix**: the footage cannot support a decision;
   - a **referral**: the player reported pain, so coaching pauses.
2. **Faults are chosen only from what the side view measures credibly (D1, D5)**, plus patterns in the outcomes the player enters (D3). There are 17 detectable faults, each with one focus item. An 18th item, "keep going", covers sessions where nothing is flagged.
3. **Detection is statistical, not a single-serve judgement.** A fault fires only when it shows on most usable serves, or when a spread is clearly too large for the sample size. Thresholds come from two places: reference bands from the literature, always labelled with the population studied, and the player's own history. Starting values are [Our inference], to be tuned on our own data.
4. **Priority follows D6 in this order:**
   1. safety gate;
   2. detection confidence;
   3. earlier stage of the serve first (toss and loading before contact and finish);
   4. biggest outcome gap;
   5. the player's goal.

   This follows Kovacs's view that most serve problems start at the toss and loading stages and that fixing those cascades downstream (research 04 [S14]) [Coaching interpretation].
5. **Delivery follows the motor-learning evidence, used honestly.** Each decision gives:
   - one cue: an analogy for UTR 1–3 and a target or outcome cue for UTR 4–7 (research 04 [S46], [S40]);
   - a key frame plus one sentence, because visual plus verbal feedback beats verbal alone (research 04 [S56]);
   - replays the player opens when they choose (research 04 [S60]);
   - a whole-serve drill with constraints, not part-practice (research 04 [S49]; research 03 [S25]);
   - a short blocked set, then a mixed transfer set (research 04 [S52]).

   The external-focus advantage is contested (research 04 [S38] vs [S39]). We use such cues as a sensible default and A/B test them; we do not market them as proven.
6. **Each focus runs as an experiment.** The player practises, logs it, then records a matched re-test. The app then gives an honest verdict in words, following D7.
7. **Pain is a referral switch, never an assessment (D8).** Comfort settings remove drills that load a sensitive area. No copy names a condition or claims to prevent injury (research 07, TGA 14B and Apple 1.4.1).

---

## 2. Coaching principles (and where they come from)

| # | Principle | Product rule | Basis |
|---|---|---|---|
| P1 | One focus at a time | One focus per session. Other candidates appear only in "Why this focus?" | [Our inference], consistent with bandwidth-feedback evidence (research 04 [S55]) and implicit-learning practice (research 04 [S48]) |
| P2 | Upstream first | Toss and loading faults outrank contact and finish faults | Kovacs's 80/20 view of stages 2–3 (research 04 [S14]) [Coaching interpretation]; the proximal-to-distal chain (research 03 [S4], [S10]) [Established] |
| P3 | Cue the outcome, not the joint | Cues name a ball position, target, image or sound. Joint-level explanations sit behind "How it works" | External focus: meta-analysis g ≈ 0.58 for retention (research 04 [S38]) but near zero after bias correction (research 04 [S39]). Contested, so A/B test it |
| P4 | Analogies for newer players | UTR 1–3 get the analogy cue; UTR 4–7 get the outcome cue | Analogy effect about 0.3, mostly in novices (research 04 [S46]); the tennis-serve trial found analogy equal to explicit instruction (research 04 [S47]); the distal-focus advantage appeared in experienced performers (research 04 [S40]) |
| P5 | Show the evidence | Every focus pairs a key frame of the player's own serve with one sentence and one or two stats | Visual plus verbal feedback SMD 1.15 vs verbal alone −0.09 (research 04 [S56]) [Established] |
| P6 | Player-controlled replay | Slow motion is opened by the player, never forced | Self-controlled video feedback helped intermediate players (research 04 [S60]) [Established, small n] |
| P7 | Whole serve, constrained | Drills keep the full swing and change the target, distance, start position or tempo. At most 5 toss-only reps, then full serves | Toss practised alone changes the toss (research 03 [S25]) [Established]; constraints-led approach (research 04 [S49]) [Coaching interpretation] |
| P8 | Blocked, then mixed | Each drill ends with a 10-serve transfer set to alternating targets or sides | Contextual-interference benefit in adults (SMD 0.54), smaller in applied settings (research 04 [S52]) [Established, contested] |
| P9 | Don't wreck what works | Never cue the tossing-arm timing or wrist or forearm rotation directly | Changing tossing-arm timing dropped target accuracy from 87% to 10–17% (research 03 [S27]) [Established]; pronation cueing is disputed (research 04 §4.5) |
| P10 | Style is allowed | Stance (foot-up vs foot-back), an abbreviated backswing and routines are never "corrected" | Similar speed and loads for both stances (research 03 [S9], [S15]); abbreviated backswing (research 03 [S3]) [Established]. Professionals show individual loading strategies (research 04 [S34]) |
| P11 | Deeper is not better | The legs item fires only on a *low* knee-bend band. We never cue "bend more" to a player already in the typical band | Timing of the push, not peak force, related to racquet speed (research 03 [S48]) [Established] |
| P12 | Relative before absolute | Elite norms are shown as "direction of travel", never as targets | Nearly all reference data are from elite or high-performance players (research 03 §1) |

---

## 3. Phase model: Kovacs & Ellenbecker's 8 stages mapped to the product

The model has 3 phases and 8 stages. It is a published teaching and clinical framework, not a validated measurement instrument (research 03 [S1]) [Established as a framework; using it as a checklist is Coaching interpretation]. The engine's `ServePhase` type (`app/src/analysis/types.ts`) has seven product phases, and the key-frame events come from `ServeEvents`.

| K&E phase | K&E stage | Product phase (`ServePhase`) | Key frame (`ServeEvents`) | What the side view shows credibly (D1, D5) | Metric ids used by coaching | v1 faults anchored here |
|---|---|---|---|---|---|---|
| Preparation | 1 Start | `setup` | first still frame | stance class, start of routine | `serve-count`, `capture-quality` | none (stance is style: P10) |
| Preparation | 2 Release | `toss` | `tossRelease`, `tossApex` | apex height; apex placement forward of the front toe; drop from apex to contact; spread across serves | `toss-apex-height`, `toss-forward`, `toss-drop`, `toss-height-spread`, `toss-forward-spread` | `toss-height-inconsistent`, `toss-forward-inconsistent`, `toss-behind`, `toss-too-far-forward`, `toss-too-high` |
| Preparation | 3 Loading | `loading` | `trophy` | hip drop (knee-bend band), trunk tilt away from the court (band), timing from release | `knee-bend-band`, `trunk-tilt-band` (trophy reading), `rhythm-release-to-contact`, `rhythm-spread` | `legs-quiet`, `trunk-tilt-low`, `trunk-arch-high`, `rhythm-inconsistent` |
| Preparation | 4 Cocking | `drive` (start) | end of the trophy pause | how long the motion stops at the top. **Racquet drop and external rotation are not assessed (D5)** | `trophy-pause` | `trophy-pause-long` |
| Acceleration | 5 Acceleration | `drive` | (take-off, optional) | overall timing only. Arm speed, pronation and internal rotation are not observable in 2D (research 05 §6.9) | `rhythm-release-to-contact` | none |
| Acceleration | 6 Contact | `contact` | `contact` (ball plus audio) | contact height relative to standing height; contact forward of the front toe; trunk upright or folding | `contact-height-ratio`, `contact-forward`, `trunk-tilt-band` (contact reading) | `contact-low`, `contact-behind`, `trunk-fold-at-contact`; outcome faults `second-serve-unreliable`, `net-miss-pattern`, `long-miss-pattern` |
| Follow-through | 7 Deceleration | `landing` (start) | none | not assessed (deceleration load is not observable) | none | none |
| Follow-through | 8 Finish | `landing` | `landing` | landing position relative to the baseline | `landing-distance` | `landing-behind` |
| (product only) | none | `recovery` | `recoveryEnd` | back to ready (yes/no). No norms exist (research 03 §2) | none | none |

**Stage numbers drive priority.** Each fault carries `chainStage` (the K&E stage number) in the JSON.
- `rhythm-inconsistent` is anchored at stage 3. Release-to-contact timing spans stages 2–6, but coaches trace unstable timing mainly to the toss and loading (research 04 [S68], [S2]) [Coaching interpretation].
- The outcome-only faults are anchored at stage 6. Net faults differ from good serves mainly in the ball's projection angle at contact (research 03 [S23]) [Established], and spin comes from racquet path at contact (research 03 [S19]) [Established].

---

## 4. Signals this spec consumes

`METRICS.md` and `metrics.json` own the definitions. The table records how coaching reads each one, checked against `metrics.json` on 27 September 2026. The JSON thresholds use the same units (cm, ms, ratio of height). If METRICS.md changes a unit or reference point, the thresholds must be re-expressed.

| Metric id | How coaching reads it (units as in metrics.json) | Default status | Used for |
|---|---|---|---|
| `serve-count` | Serves detected; "usable" means all prerequisites met for a given metric | measured | Minimum-data gates |
| `capture-quality` | `good` / `usable` / `poor` per session | measured | Capture-fix decision |
| `toss-apex-height` | Apex height as a ratio of standing height (secondary unit: cm) | estimated | Context for toss height |
| `toss-forward` | cm from the front toe at release to the apex, + = into the court. Target band 20–60 cm for flat and slice first serves [Coaching interpretation]. The synthetic generator uses the same convention | estimated | `toss-behind`, `toss-too-far-forward` |
| `toss-drop` | cm from apex to contact. metrics.json offers a coaching flag above 100 cm | estimated | `toss-too-high` |
| `toss-height-spread` | noise-corrected SD of apex height within a stratum, in cm | estimated (target: measured) | `toss-height-inconsistent` |
| `toss-forward-spread` | noise-corrected SD of `toss-forward`, in cm | estimated (target: measured) | `toss-forward-inconsistent` |
| `contact-height-ratio` | Ball-centre contact height ÷ standing height | estimated | `contact-low` |
| `contact-forward` | cm from the front toe at release to the ball at contact, + = into the court | estimated | `contact-behind` |
| `rhythm-release-to-contact` | ms from ball release to contact | measured | Context |
| `rhythm-spread` | noise-corrected SD of release-to-contact, in ms; needs ≥ 60 fps | estimated (target: measured) | `rhythm-inconsistent` |
| `trophy-pause` | ms of stillness at the trophy position; needs ≥ 60 fps. metrics.json offers a coaching flag above 500 ms | **experimental** | `trophy-pause-long` |
| `knee-bend-band` | `low` / `typical` / `high` / `unclear`. From the side view it is computed from **hip drop normalised by leg length**, as coaching asked. Reported only at band probability ≥ 0.7 | estimated (band only, D5) | `legs-quiet` |
| `trunk-tilt-band` | Trophy reading: lean away from the net as `low` (upright, < 10°) / `typical` (10–35°) / `high` (big arch, > 35°) / `unclear` | estimated (band only, D5) | `trunk-tilt-low`, `trunk-arch-high` |
| `trunk-tilt-band`, contact reading (`upright` / `fold`) | **Not provided by metrics.json** (request below) | n/a | `trunk-fold-at-contact` (dormant until provided) |
| `landing-distance` | cm from **where the front toe started** to the landing toe, + = into the court (not measured from the baseline) | estimated | `landing-behind` |
| `repeatability` | 0–100 composite | **experimental** | not used for decisions |
| `serve-in-rate`, `first-serve-in-rate`, `second-serve-in-rate`, `double-faults` | Player-entered outcomes (k of n; Wilson intervals). Coaching also needs the **miss-type breakdown** (net / long / wide) per serve number | player-entered | Outcome faults and outcome gap |
| `serve-type-mix` | Player-entered intended type (flat / slice / kick / unknown) | player-entered | Strata and kick allowances |
| `fatigue-flag`, `load-flag` | METRICS.md flags (added ids) | estimated / measured | Load notes (§6.5, §11) |
| `placement-zone`, `speed-experimental`, `speed-radar-entered`, `spin`, `toss-lateral`, `retoss-count`, `contact-height-spread` | Not used by coaching in v1 | n/a | none |

**Requests to METRICS.md.** They are not decisions, but they decide whether some items can run.
1. **Hip-drop knee band.** Done in metrics.json. In the chest-side view a 2D knee angle is foreshortened, because the knee flexes towards the camera (research 05 §6.5).
2. **Contact reading for `trunk-tilt-band`** (`upright` / `fold`). Still open. At contact the player faces the net and the side camera sees the trunk in profile, so folding is in the image plane. Until this reading exists, `stay-tall` stays dormant.
3. **Miss types (net / long / wide) per serve number**, exposed alongside the in-rates. `clear-the-net` and `bring-it-down` need them.
4. **Provisional values in coaching triggers.** METRICS.md §4.1 says provisional values (spreads below n = 20; bands below n = 12) are never used in coaching triggers. This spec's spread and band rules apply their own n-aware test: the chi-square and Beta posteriors mean small samples only fire on large effects. Coaching therefore needs the per-serve values and the raw spread even when the display value is provisional. See §16, issue 2.

---

## 5. The v1 fault library

### 5.1 Inclusion rules

A fault is in v1 only if all three hold:
- It is detectable from the side view (D1), using metrics METRICS.md classifies as measured or estimated, or from player-entered outcomes (D3).
- A credible expert source recommends changing it, or a study links it to performance.
- A solo player can practise the fix with a basket at a public court in 5–10 minutes.

A focus item whose detection metric is **experimental** at runtime runs only when the player has switched on "Show experimental" (D10 profile sheet). It then carries the experimental tier (§13).

### 5.2 The 17 faults (plus "keep going")

Fire values are starting thresholds [Our inference] unless a reference is cited in §6.3. "1–3" and "4–7" are the UTR bands. Unit conventions follow §4.

| # | Fault id → focus item | Stage | Rule kind | Signals | Fires when (summary) | Resolved when | Tier |
|---|---|---|---|---|---|---|---|
| 1 | `toss-height-inconsistent` → `toss-height-steady` | 2 | spread | `toss-height-spread` | true SD of apex height > 20 cm (1–3) / 14 cm (4–7) | SD ≤ 12 / 10 cm | research-backed |
| 2 | `toss-forward-inconsistent` → `toss-spot-steady` | 2 | spread | `toss-forward-spread` | true SD > 25 cm (1–3) / 18 cm (4–7) | SD ≤ 15 / 12 cm | coach-recommended |
| 3 | `toss-behind` → `toss-in-front` | 2 | per-serve | `toss-forward` (+ `contact-forward`) | apex clearly behind the front toe: upper bound < −10 cm (flat, slice or untagged); < −30 cm (kick) | mean ≥ +20 cm, the lower edge of the metrics.json target band / ≥ −15 cm (kick) | coach-recommended |
| 4 | `toss-too-far-forward` → `toss-within-reach` | 2 | per-serve plus corroboration | `toss-forward`, `contact-height-ratio`, misses | apex clearly more than 0.40 × standing height in front of the toe (about 70 cm for 1.75 m) on most serves, **and** low contact (mean < 1.40) or a net-miss pattern | mean ≤ 60 cm, the upper edge of the target band | coach-recommended |
| 5 | `toss-too-high` → `toss-to-reach-height` | 2 | per-serve | `toss-drop` | drop from apex to contact clearly > 100 cm (the metrics.json coaching flag) | median ≤ 85 cm | coach-recommended |
| 6 | `legs-quiet` → `legs-spring` | 3 | band | `knee-bend-band` | band `low` on most serves (never fires on `typical` or `high`) | `low` on ≤ 30% of serves | research-backed |
| 7 | `trunk-tilt-low` → `shoulder-tilt` | 3 | band | `trunk-tilt-band` (trophy) | band `low` on most serves | `low` on ≤ 30% | coach-recommended |
| 8 | `trunk-arch-high` → `lift-not-arch` | 3 | band | `trunk-tilt-band` (trophy), `toss-forward` | band `high` on most serves | `high` on ≤ 30% | coach-recommended |
| 9 | `rhythm-inconsistent` → `steady-rhythm` | 3 | spread | `rhythm-spread` (needs ≥ 60 fps) | true SD of release-to-contact > 150 ms (1–3) / 120 ms (4–7) | ≤ 100 / 80 ms | research-backed |
| 10 | `trophy-pause-long` → `flowing-motion` | 4 | per-serve | `trophy-pause` (experimental; needs ≥ 60 fps) | pause clearly > 500 ms (the metrics.json coaching flag) | median ≤ 350 ms | coach-recommended (experimental while the metric is) |
| 11 | `contact-low` → `reach-up` | 6 | per-serve | `contact-height-ratio` | ratio clearly < 1.38 (upper bound below) | mean ≥ 1.40 | research-backed |
| 12 | `contact-behind` → `contact-in-front` | 6 | per-serve | `contact-forward` | upper bound < 0 cm (flat, slice or untagged); < −20 cm (kick) | mean ≥ +10 cm / ≥ −10 cm (kick) | coach-recommended |
| 13 | `trunk-fold-at-contact` → `stay-tall` | 6 | band | `trunk-tilt-band` (contact reading; not yet provided) | reading `fold` on most serves | `fold` on ≤ 30% | coach-recommended (dormant) |
| 14 | `landing-behind` → `land-into-court` | 8 | per-serve | `landing-distance` | upper bound < −10 cm (landing behind where the front toe started) | mean ≥ 0 cm | coach-recommended |
| 15 | `second-serve-unreliable` → `second-serve-margin` | 6 | outcome | `second-serve-in-rate`, `double-faults` | ≥ 10 second serves and P(true in-rate < 0.70) ≥ 0.8 | in-rate ≥ 0.80 over ≥ 20 matched second serves | coach-recommended |
| 16 | `net-miss-pattern` → `clear-the-net` | 6 | outcome | miss types by serve number | ≥ 6 misses and P(net share of misses > 0.5) ≥ 0.8 | net share ≤ 0.40 over ≥ 10 misses | coach-recommended |
| 17 | `long-miss-pattern` → `bring-it-down` | 6 | outcome | miss types by serve number | ≥ 6 misses and P(long share > 0.5) ≥ 0.8 | long share ≤ 0.40 over ≥ 10 misses | coach-recommended |
| 18 | none → `keep-going` | n/a | none | `repeatability`, outcomes | no item is eligible and the data are adequate | n/a | coach-recommended |

**Overlaps, resolved by design.**
- `contact-behind` usually co-occurs with `toss-behind`, because the ball keeps its forward motion after the apex. Stage order then picks the toss item. The contact item exists for two cases: the apex left the frame, so `toss-forward` is unavailable; or the toss drifts backwards after the apex.
- `toss-behind` and `trunk-arch-high` often co-occur. Stage order ties (2 vs 3), so the toss item wins, because moving the toss in front is how coaches reduce the arch (research 04 F6) [Coaching interpretation].

### 5.3 Faults deliberately not in v1

| Fault (research 04 code) | Why it is out | What would unlock it |
|---|---|---|
| Waiter's tray (F1) | The racquet is not a tracked keypoint and racquet-face angle is not observable in 2D (research 05 §1.3, §6.9); D5 forbids racquet-drop claims | A racquet keypoint model plus validation at 120–240 fps |
| Forehand grip (F2) | The hand is occluded in wide shots | A close-up photo check (possible later as a player self-check) |
| Bent-arm or flicked toss (F5) | Tossing-elbow angle is not a v1 metric | A tossing-arm elbow band from pose |
| Tossing arm drops early (F7) | A timing cue here risks wrecking accuracy (research 03 [S27]), and the ideal timing is disputed (research 04 §4.5) | Validation first; even then it would be shown, not cued |
| Opening up early / insufficient coil (F8) | Needs the rear view | Second angle (D1) |
| Double knee bend (F10) | The hip-path shape is not validated | Experimental hip-path classifier |
| No racquet drop (F14), tension (F15), early pronation (F17) | Not observable, or low confidence (research 05 §6.9) | Not planned |
| Toss left/right drift; wide-miss patterns | Lateral position needs the rear view (research 05 §6.3) | Rear "outcomes view" (D1). Wide misses are counted in v1 but not coached |
| Falling sideways on landing (part of F18) | Sideways motion is towards the side camera | Rear view |

---

## 6. Detection: rules, thresholds and confidence

### 6.1 Strata and minimum data

- **A stratum** is: view (always `side` for v1 mechanics) × court side (deuce / ad) × serve number (1st / 2nd) × intended type (flat / slice / kick / untagged).
  - Toss position differs by type and target (research 03 [S20], [S35]); impact position differs by court side (research 03 [S34]).
  - Pooling types inflates spreads (research 06 §7.2).
- **Evaluation.** Each item is evaluated in every stratum that meets its `minUsableServes`. The item's detection is the strongest qualifying stratum, and that stratum becomes the experiment's locked stratum (§12).
- **Minimums** [Our inference, from the precision tables in research 06 §7 and research 09 §3.4]:

| Rule kind | Minimum usable serves in the stratum | Why |
|---|---|---|
| Spread (SD) | 10 | At n = 10 the 95% interval on an SD is 0.69×–1.83× the observed value (research 06 §7.2), so only large spreads can clear the bar. That is intentional |
| Per-serve or band | 6 | Enough to show "most serves", with the prevalence posterior below |
| Outcome pattern | 6 misses, or 10 second serves | Proportions are noisy at small n (research 06 §7.1) |
| Any decision at all | 6 usable serves in the session and `capture-quality` ≠ `poor` | Otherwise the decision is a capture fix (§7.5) |

CAPTURE.md §1 and metrics.json set lower **display** minimums: 5 serves for a mechanics observation, and 8 for a spread shown as an "early read". Choosing a focus is a stronger claim than showing a number, so coaching needs more serves than display does.

METRICS.md §4.1 goes the other way on one point: it keeps provisional values (spreads with n < 20, bands with n < 12) out of coaching triggers. If that rule stands, the hero toss item can only fire from a single-side block of 20 or more serves. CAPTURE.md's standard block is 12 per side, so most first sessions would end in "keep going". This spec's minimums rely on the n-aware tests in §6.2 instead. The disagreement is flagged in §16 for the product lead to settle.

### 6.2 The four rule kinds

Every rule uses the `MetricValue` fields `value`, `uncertainty` (low/high) and `confidence` (0–1) from `types.ts`. **`meanConf`** is the mean `confidence` of the contributing serves.

**(a) Per-serve rule** (positions, heights, durations).
- A serve **clearly shows** the fault when its whole uncertainty interval lies beyond the fire threshold.
- Serves whose interval straddles the threshold count as "unclear", not as clear.
- With k clear serves out of n usable: `detectionConfidence = P(p > 0.5 | Beta(k+1, n−k+1)) × meanConf`. In words: how sure we are that the fault shows on most serves, discounted by tracking quality.
- Reference values: 9 of 14 → 0.85; 12 of 14 → 0.996; 6 of 10 → 0.73 (before `meanConf`).

**(b) Spread rule** (toss spreads, rhythm spread).
- Correct the observed SD `s` for measurement error `e`, where `e` is the per-serve 1-sigma error METRICS.md reports for that metric:
  `σ̂ = sqrt(max(0, s² − e²))`. Observed spread is inflated by noise (research 06 §7.2).
- **Robustness:** compute `s` as 1.4826 × MAD when n < 15, so one wild toss cannot trigger the rule. Use the plain SD at n ≥ 15.
- `detectionConfidence = F_χ²(n−1)((n−1)·σ̂² / T²) × meanConf`, where T is the level's fire threshold. In words: the probability that the true SD exceeds T.
- The defaults for `e` (`measurementErrorDefault` in the JSON) are used only if METRICS.md gives none:
  - toss height: 3 cm;
  - toss forward: 7 cm;
  - rhythm: 1.2 frame durations.

  metrics.json already reports these spreads noise-corrected (`sd-noise-corrected`). When it does, use its value directly as σ̂ and do not correct twice.

  These come from research 05 §6.3 and research 05 §10 (#3).

**(c) Band rule** (`knee-bend-band`, `trunk-tilt-band`).
- As rule (a), where a serve is clear when its band equals the target band with band probability ≥ 0.7, the metrics.json reporting threshold. A band reported as `unclear` never counts as clear.

**(d) Outcome rule** (player-entered).
- Proportions use a Beta(k+1, n−k+1) posterior (uniform prior).
- Example: `P(true second-serve in-rate < 0.75)`. Then `detectionConfidence = that probability × tagCoverage`, where tagCoverage is the share of serves with an outcome. A session tally counts as 1.0.
- Displayed rates always use Wilson 95% intervals with n (D7). The Beta posterior is for decisions only.

**Eligibility.** An item is eligible when `detectionConfidence ≥ 0.70` **and** `severity ≥ moderate`.

**"Fire rule met"**, as used below and in §5.2, means:
- per-serve and band kinds: `detectionConfidence ≥ 0.70` ("most serves clearly show it");
- spread kind: that, plus σ̂ / T ≥ 1.1;
- outcome kind: the item's posterior condition (P ≥ 0.8) and `detectionConfidence ≥ 0.70`.

**Severity**, used for eligibility and in "Why this focus?":

| Kind | minor | moderate | major |
|---|---|---|---|
| Per-serve | fired only by the personal rule (§6.4) | fire rule met | fire rule met, ≥ 80% of serves clear, **and** the median is beyond the threshold by ≥ 2 × the item's smallest worthwhile change (SWC, §12.4) |
| Spread | σ̂ / T < 1.1 | 1.1–1.5 | ≥ 1.5 |
| Band | personal rule only | fire rule met | target band on ≥ 85% of serves |
| Outcome | none | fire rule met | P ≥ 0.95 |

Why a severity gate? It stops D6's strict stage order from promoting a marginal toss issue over a clear contact problem (§16, issue 1).

### 6.3 Reference bands (population context, never targets)

| Signal | Reference values | Population (n) | Source | How v1 uses it |
|---|---|---|---|---|
| Toss drop, apex to contact | 0.56 m; release to impact 0.97 ± 0.10 s | high-performance men, mean UTR about 10.7 (10) | research 03 [S27] [Established] | Anchors `toss-too-high`. The fire value of 100 cm ≈ junior mean + 1.5 SD, rounded; metrics.json uses the same coaching flag [Our inference] |
| Toss drop | 0.72 ± 0.19 m | nationally ranked junior men (13) | research 03 [S28] [Established] | as above |
| Toss spread at zenith | SD 6.0 cm vertical, 7.2 cm forward/back, 6.6 cm lateral; impact height SD 3.5 cm | professional women (8 players × 5 serves) | research 06 [S8] [Established] | Floor for "resolved": we never ask for less than about 10 cm. The authors warn that demanding a perfectly repeatable toss is too strict |
| Which toss dimension matters | experienced servers stabilise **vertical** toss and allow more forward/back and sideways variation | experienced players | research 03 [S29] [Established] | Vertical spread is research-backed; forward spread has a looser threshold and is coach-recommended |
| Timing consistency | elite women: variable toss but very consistent timing | elite women | research 03 [S24] [Established] | Basis for `rhythm-inconsistent` |
| Contact height | 142.6% (beginners) vs 149.2% (elite) of standing height; 141–152% across studies; about 1:1.5 | adult men (32); various | research 03 [S6], [S7], [S29] [Established] | Fire value 1.38 sits below the lowest reported group mean, allowing for estimate error of ±0.03–0.06 (research 05 §6.4) [Our inference] |
| Contact height and speed | ρ ≈ 0.75 (0.63 normalised for height) | junior men (13) | research 03 [S28] [Established] | whyItMatters for `reach-up` |
| Contact forward, flat vs kick | flat contact about 17 cm further forward than kick | elite adolescents | research 03 [S35] [Established] | Kick allowance: thresholds shifted back by 20 cm [Our inference] |
| Knee flexion | > 15° front knee recommended; pooled elite 64.5 ± 9.7° at trophy | elite (11 studies) | research 03 [S1] [Coaching interpretation], [S31] [Established] | `low` band only; METRICS.md sets cut points |
| Knee restricted | ball speed −15 to −17% at all levels | beginner, intermediate, elite men (30) | research 03 [S7] [Established] | whyItMatters for `legs-spring` |
| Trunk inclination at trophy | 25.0 ± 7.1° | elite (6 studies) | research 03 [S31] [Established] | Context for `trunk-tilt-band`. metrics.json cut points: < 10° low, > 35° high [Our inference, METRICS.md] |
| Trophy pause | about 20% lower upper-arm internal-rotation speed after a 1.5 s pause vs none | lab | research 03 [S2] [Established mechanism; application to the pause is Coaching interpretation] | Fire at 500 ms, the metrics.json coaching flag [Our inference] |
| First-serve in-rate | about 53–56% across NTRP 3.0–5.0 | SwingVision users | research 06 [S30], research 09 [S45] [Vendor claim] | Context only; never a target |
| Second-serve in-rate | about 70–71% in match play | SwingVision users, NTRP 3.0–5.0 | research 01 [S7] [Vendor claim] | Fire just below it: P(in-rate < 0.70) ≥ 0.8 [Our inference] |

**The honest gap.** No published dataset describes UTR 1–7 adults for any of these signals (research 03, Open question 1). Every fire and resolved value above is a starting point. Sections 15.3 and 15.4 describe how we replace them with our own distributions.

### 6.4 Personal thresholds (the player's own history)

- **Baseline.** Once a stratum has ≥ 3 matched sessions with the metric, the baseline is:
  - the median of the per-session values over the last 5 matched sessions;
  - the typical error TE = SD of consecutive-session differences ÷ √2 (research 09 [S70], [S71]).
- **"Slipped" rule.** An item also fires, at severity **minor**, when this session is worse than the baseline with P ≥ 0.9 **and** the value is beyond the item's *resolved* threshold. A minor flag cannot become the focus through the gate in §6.2. It appears in "Why this focus?" as "Slipped a little from your usual", and it reopens an item that is on cooldown (§7.4).
- **Resolution uses both.** An item is resolved when it meets its resolved threshold, **or** shows a "clear improvement" verdict against its own experiment baseline (§12.4).
- **Before 3 sessions:** reference thresholds only, and the UI says "Compared with published ranges; your own baseline starts after 3 matched sessions".

### 6.5 Within-session fatigue check (load, not a fault)

- **Trigger:** METRICS.md's `fatigue-flag` (n ≥ 16), a downward trend in contact height across the session. Contact height fell after prolonged play in advanced players (research 03 [S14]) [Established].
- **Action:** coaching shows the METRICS.md copy as a load note, for example "Your contact point dropped in the last part of the session, which can be a sign of tiring. A shorter block next time?"
- **Constraints:**
  - the fatigue check never selects a focus;
  - it never changes the verdict;
  - the serves after the drop still count towards detection. If the flag is on, the "Why this focus?" sheet says so.

---

## 7. Priority algorithm (D6)

### 7.1 Inputs and outputs

```ts
type LevelBand = 'utr-1-3' | 'utr-4-7'          // library bands; ARCHITECTURE's 'utr-4-5' and 'utr-6-7' map to 'utr-4-7' (§7.8)
type Goal = 'first-serves-in' | 'more-pace' | 'second-serve-reliability' | 'less-effort'   // same ids as ARCHITECTURE ProfileRecord.goal
type BodyRegion = 'shoulder' | 'elbow' | 'back' | 'knee' | 'other'   // elbow = elbow or wrist; knee = hip, knee or ankle
type EvidenceTier = 'research-backed' | 'coach-recommended' | 'experimental'

interface CoachingInputs {
  session: SessionSummary            // per-stratum metric summaries + per-serve MetricValues + outcome tags/tally
  profile: {
    level: LevelBand
    goal: Goal
    comfortRegions: BodyRegion[]     // standing settings from the profile sheet
    heightM: number
    showExperimental: boolean
  }
  bodyCheck: 'fine' | { sore: BodyRegion[] } | 'pain' | 'red-flag'   // today's pre-session check (§10)
  history: { matchedSessions: SessionSummary[]; activeExperiment?: Experiment; cooldowns: Record<string, number> }
}

type CoachingDecision =
  | { kind: 'referral'; level: 'emergency' | 'today' | 'stop-and-book' }
  | { kind: 'capture-fix'; issueId: string }                     // copy owned by CAPTURE.md
  | { kind: 'keep-going'; itemId: 'keep-going'; stratum: StratumKey }
  | { kind: 'focus'; itemId: string; stratum: StratumKey; cueRegister: 'analogy' | 'outcome';
      drillVariant: 'base' | 'progression' | 'regression'; effectiveTier: EvidenceTier;
      evidence: { keyFrame: ServeRef; compareFrame?: ServeRef; statIds: string[] };
      reasons: RankReason[];          // shown in "Why this focus?"
      alsoConsidered: { itemId: string; reason: 'later-stage' | 'smaller-gap' | 'not-clear-yet' | 'comfort-setting' | 'needs-more-serves' | 'experimental-off' }[];
      verdict?: ExperimentVerdict }  // present when this session was a matched re-test
```

### 7.2 Steps

```
decide(inputs):
  // 0. SAFETY GATE (always first)
  if bodyCheck == 'red-flag'  -> return referral(emergency | today, per the answers in §10)
  if bodyCheck == 'pain'      -> return referral('stop-and-book')
  comfort = profile.comfortRegions ∪ (bodyCheck.sore ?? [])

  // 1. DATA GATE
  if capture-quality == 'poor' or usableServes < 6 -> return capture-fix(top failing QualityCheck)

  // 2. ACTIVE EXPERIMENT (stickiness)
  if activeExperiment:
      if session matches experiment stratum (§12.3): verdict = compare(...)   // §12.4
      next = experimentTransition(activeExperiment, verdict)                  // §12.5
      earlierMajor = any item with chainStage < experiment item's stage that passes step 3 with severity 'major'
      if next.continues and item not excluded by comfort and not earlierMajor
                                                     -> return focus(sameItem, next.variant, verdict)
      if earlierMajor -> mark experiment 'superseded'  // §7.4
      // otherwise fall through; a concluded or superseded item goes on cooldown

  // 3. CANDIDATES
  for item in library (except keep-going):
      if item.contraindications ∩ comfort ≠ ∅       -> consider(item, 'comfort-setting'); continue
      if cooldown[item] > 0 and not slipped(item)    -> continue      // §6.4 "slipped" lifts cooldown
      if prerequisites unmet (metric unavailable, view ≠ side, fps below minFps,
         contact reading missing, experimental metric with showExperimental = false)
                                                     -> consider(item, 'needs-more-serves' | 'experimental-off'); continue
      det = detect(item)                             // §6.2, strongest qualifying stratum
      if det.confidence >= 0.70 and det.severity >= moderate -> eligible.push(item, det)
      else if det.confidence >= 0.50                 -> consider(item, 'not-clear-yet')

  // 4. RANK (lexicographic, D6)
  sort eligible by:
      a. chainStage ascending                       (earlier in the serve first)
      b. outcomeGap descending; gaps within 0.05 count as a tie   (§7.3)
      c. goal match first (item.goalsServed includes profile.goal)
      d. mechanical items before outcome-only items (a mechanical item explains the outcome and has a key frame)
      e. detectionConfidence descending
      f. library order (JSON array order)

  // 5. NOTHING CLEAR
  if eligible is empty -> return keep-going (stratum = the one with most usable serves)

  // 6. DECISION
  item = eligible[0]
  cueRegister  = level == 'utr-1-3' ? 'analogy' : 'outcome'     // swappable by the player (§9.1)
  drillVariant = chooseVariant(item, level, goal, comfort)       // §9
  effectiveTier = weaker(item.evidenceTier, statusTier(item's primary metric))   // §13
  return focus(item, …, alsoConsidered = eligible[1..2] + considered)
```

### 7.3 Outcome gap

`outcomeGap(item)` is a number from 0 to 1: the share of this stratum's serves that the fault plausibly costs.

1. **Personal association (preferred).** Use it when per-serve outcome tags exist and the item has a per-serve signal.
   - Split usable serves into "fault present" and "fault absent".
   - For spread items, "present" means the serve deviates from the session median by more than the item's *resolved* threshold.
   - Require ≥ 5 serves in each group, the same minimum ARCHITECTURE.md uses for outcome links. Then `gap = max(0, inRate(absent) − inRate(present)) × share(present)`.
2. **Static link (fallback).** Each item lists `linkedOutcomes` in the JSON (`net`, `long`, `double-fault`). Then `gap = (misses of the linked types) ÷ (serves in the stratum)`, using the most common linked type. Outcome-only items use their own miss type.
3. **No outcome data:** `gap = 0`. Ranking then falls through to the goal.

The personal association is also the D3 "signature insight". When shown to the player, it uses counts only, for example "5 of 7 in when your toss peaked near your usual height, 2 of 7 when it didn't". It carries an "Early hint" label while either group has fewer than 10 serves.

### 7.4 Stickiness and cooldown

- **An active experiment keeps its focus** until it concludes (§12.5). Two things override it:
  - the safety gate;
  - an eligible fault at an **earlier** stage with severity **major**. The experiment is then parked with the reason "Something earlier in your serve needs attention first".
- **Cooldown.** Resolved items: 2 sessions. Parked items ("not this time"): 3 sessions. A minor "slipped" flag lifts the cooldown early.

### 7.5 Special decisions

| Decision | When | What the player sees |
|---|---|---|
| Referral | the safety gate trips | §10 cards. Stats stay viewable; no drill or cue is shown |
| Capture fix | `capture-quality = poor` or < 6 usable serves | The top failing quality check, with its fix (copy in CAPTURE.md), for example "The toss left the frame on 7 of 12 serves. Move the phone back a metre." |
| Keep going | data adequate, nothing eligible | The `keep-going` item. "Why?" lists what was checked and found in range. **We never invent a flaw** (research 09 §9) |
| Not enough serves for this item | an item needs more serves than the stratum has | Listed under "Also considered" as "needs more serves", for example "Toss consistency needs 10 serves from one side; you recorded 7" |

### 7.6 "Why this focus?" (transparency sheet)

Template (fill from `reasons`):

> **Why this focus**
> It comes early in your serve, so fixing it often helps what follows. ← stage reason
> It showed on 12 of 14 serves (clear). ← detection
> Serves with this pattern went in less often: 2 of 7 vs 5 of 7 (early hint). ← outcome gap, only when present
> It fits your goal: more first serves in. ← goal, only when matched
> **Also noticed:** contact height (comes later in the serve, so we'll look again after this). Leg drive: not coached because of your knee comfort setting.

### 7.7 Worked example

**Player.**
- Mia, 41, UTR 4.8, so band `utr-4-7`. Right-handed, 1.68 m.
- Goal: more first serves in. Comfort setting: knee.
- Body check today: "All good".

**Session.**
- Side view at 60 fps, `capture-quality = good`.
- Deuce court, first serves, intent untagged.
- 16 serves recorded, 14 usable for toss and contact metrics.
- Outcomes tagged in review: 7 in and 9 out (6 net, 2 long, 1 wide). First-serve in 7/16, shown as 44% (Wilson 95%: 23–67%).

**Step 0. Safety.** No pain. Comfort = {knee}, so `legs-spring` (contraindication: knee) is excluded before detection.

**Step 1. Data.** 14 usable serves, `good` quality. Pass.

**Step 2.** No active experiment.

**Step 3. Detection** (`meanConf` = 0.90 for every row). Under METRICS.md §4.1 as currently written, a spread from 14 serves is "provisional" and could not trigger the toss item. This example follows this spec's n-aware rule (§6.1; §16 issue 2).

| Item | Evidence | detectionConfidence | Severity | Eligible |
|---|---|---|---|---|
| `toss-height-steady` | observed SD 17 cm, e = 3 cm → σ̂ = 16.7 cm; T = 14 cm (UTR 4–7); P(σ > T) with 13 df = 0.86 | 0.86 × 0.90 = **0.78** | σ̂/T = 1.19, **moderate** | yes |
| `reach-up` | 12 of 14 serves clearly below 1.38; mean 1.33 | 0.996 × 0.90 = **0.90** | 86% clear and the mean is 0.05 below the threshold (≥ 2 × the metrics.json SWC of 0.015), **major** | yes |
| `clear-the-net` | 6 of 9 misses in the net; P(net share > 0.5) = 0.83 | 0.83 × 1.0 = **0.83** | moderate | yes |
| `legs-spring` | (band `low` on 11 of 14) | n/a | n/a | excluded: comfort setting |
| `steady-rhythm` | σ̂ = 70 ms < 120 ms | 0.12 | n/a | no |
| `land-into-court` | mean −2 cm from where her front toe started; no serve clearly beyond −10 cm | n/a | n/a | no |

**Step 4. Rank.**
- (a) Stage order puts `toss-height-steady` (stage 2) ahead of `reach-up` and `clear-the-net` (both stage 6).
- The decision is therefore **toss height**, even though contact height has the higher severity. This is D6 as written. It is also plausible coaching: a toss peaking at a different height each time is a common cause of low and variable contact (research 04 [S14]) [Coaching interpretation].
- For illustration, suppose the toss had not fired. Then `reach-up` and `clear-the-net` tie on stage.
  - (b) Both link to net misses: gap = 6/16 = 0.375 each, which is a tie.
  - (c) Both serve "first serves in", which is a tie.
  - (d) Mechanical before outcome-only, so **`reach-up`** would win.

**Step 6. Output (UTR 4–7 register).**
- **Focus:** Steady toss height.
- **Evidence:**
  - key frame at the toss apex of her most off-pattern serve, with all 14 apexes drawn on it (apex scatter overlay), beside her best serve: the serve that went in with its apex closest to her median (§8.1);
  - stats: "Toss height spread: 17 cm across 14 serves [Estimated]" and "Apex height about 3.0–3.2 m (1.8–1.9 × your height) [Estimated]";
  - outcome hint: 5 of 7 in when the toss peaked within 10 cm of her usual height, vs 2 of 7 when it didn't (early hint).
- **Cue:** "Peak it at the same fence line."
- **Drill:** Fence-line toss ladder, 8 min.
- **Re-test:** 12 deuce first serves, side view, 60 fps.
- **Also noticed:** contact height (later in the serve); net misses (usually linked to contact height). Leg drive is not coached (knee comfort setting).

**Re-test five days later** (matched: side view, deuce, first serves, 60 fps; 13 measured serves, above the minimum of 12; spread 11.5 cm):
- Corrected SDs: 16.7 cm → 11.1 cm. Log-ratio = −0.41, SE = 0.283, P(improved) = 0.93. The reduction is 34%, above the metrics.json SWC for spreads (15%).
- Verdict: **"Likely better. About 10 more serves to confirm."** The 10 comes from the n needed for P ≥ 0.95 if the change holds (22 in total), minus the 13 already recorded, rounded up to the nearest 5.
- The experiment continues with the **progression** variant.

### 7.8 Alignment with ARCHITECTURE.md (written in parallel)

| This spec | ARCHITECTURE.md | Mapping |
|---|---|---|
| Decision kinds: `referral`, `capture-fix`, `keep-going`, `focus` | `CoachingDecision.gate`: `pain-referral`, `too-few-serves`, `low-confidence`, `ok` | `referral` → `pain-referral`. `capture-fix` → `too-few-serves` (< 6 usable) or `low-confidence` (quality `poor`). `keep-going` and `focus` → `ok`; keep-going is a focus with `faultId: 'none'` |
| Item `id` and `faultId` (1:1) | `focus.faultId` ("coaching-library id") | Store both. `faultId` keys experiments; `id` keys content |
| Cue register `analogy` / `outcome` | `cue.style`: `analogy` / `external-target` | `outcome` ↔ `external-target`; `cue.id = itemId + ':' + register` |
| Drill variant | `drill.id` | `drill.id = itemId + ':' + variant` (base / progression / regression) |
| `LevelBand` `utr-1-3` / `utr-4-7` | `utr-1-3` / `utr-4-5` / `utr-6-7` / `unknown` | `utr-4-5` and `utr-6-7` → `utr-4-7`. `unknown` → self-rating (§9.1), otherwise `utr-1-3` (looser thresholds mean fewer false fires) |
| Goals | `ProfileRecord.goal` | identical ids |
| `comfortRegions` (multi-select) plus the daily body check | `ProfileRecord.comfort { painFlag, area }` | `painFlag = 1` ↔ body check *pain* or *red-flag*, which triggers the referral. `comfortRegions` is a requested new field |
| Practice log (§12.2) | `PracticeLogRecord` | `reps` = `approxServes`. `feel`: awkward = 1–2, OK = 3, natural = 4–5. `discomfort = 1` runs §10. Requested fields: `drillVariant`, `successCriterionMet`, `cueHelpful`, `cueRegisterUsed`, `setting` |
| Stratum including intended type | `StratumKey { mode, side, serveNumber, fpsClass, engineMajor }` | Requested field: `intendedType`. Matching on `fpsClass` for every metric is stricter than §12.3 needs, which is acceptable |
| Experiment status: `active` / `worked` / `parked` / `superseded` | `active` / `completed` / `abandoned` | `worked` → `completed`; `parked` and `superseded` → `abandoned`, with the reason stored |
| Focus-specific best serve (§8.1) | session-level `bestServeId`, `representativeServeId` | Coaching computes the focus-specific best serve and falls back to `bestServeId` |
| `reasons`, `alsoConsidered` | `RuleTraceEntry[]`, `alternatives` | `reasons` → trace steps; `alsoConsidered` → `alternatives` |

**Dormant entries** (ARCHITECTURE's test requires every entry to be reachable or marked dormant):
- `stay-tall` is dormant until METRICS.md provides the contact reading of `trunk-tilt-band`.
- `flowing-motion` runs only with the experimental toggle on, because `trophy-pause` is experimental by default in metrics.json.
- `land-into-court` is active: `landing-distance` is estimated by default in metrics.json. It becomes dormant if that status is lowered to experimental and the toggle is off.

---

## 8. Evidence presentation

### 8.1 Key frames and the "best serve"

- **Representative serve (the key frame):** within the locked stratum, among serves with confidence ≥ 0.7.
  - For per-serve and band items, it is the serve whose focus-metric value is closest to the session median. We use the median, not the worst serve (research 06 §7.3).
  - For spread items, a single serve cannot show a spread. The key frame is therefore the serve furthest from the session median, and every other apex (or timing bar) is drawn on it by the overlay.
- **Best serve (`compareTo: 'best-serve'`):** from this session and the last 3 matched sessions, among serves with confidence ≥ 0.7 that went in (if outcomes were tagged).
  - For per-serve and band items, it is the serve with the best focus-metric value that is also within the item's resolved band.
  - For spread items, it is the serve closest to the player's median.
  - If none qualifies, fall back to `previous-session`, the representative serve of the last matched session.
  - If there is no previous session, show the single key frame with the overlay and no comparison.
  - **We never compare to a professional.**
- **`compareTo: 'previous-session'`:** the representative serve of the last matched session. It is used by items whose evidence is a distribution (rhythm, outcomes).
- **Key frame:** `keyFramePhase` names the `ServePhase`. The UI takes the frame from the matching event: toss → `tossApex`, loading → `trophy`, contact → `contact`, landing → `landing`.
- **Overlay:** the JSON field `evidence.overlay`. `DESIGN.md` owns the drawing.

| Overlay id | What it shows |
|---|---|
| `apex-scatter` | Apex dots for every serve over the key frame |
| `apex-vs-toe` | Vertical line at the front toe, dot at the apex |
| `toss-arc` | Ball path from apex to contact, with the drop labelled |
| `contact-height-line` | Horizontal line at contact height, labelled as a % of height |
| `contact-vs-toe` | Contact point vs front-toe line |
| `hip-path` | Hip-centre trace through loading |
| `trunk-line` | Mid-hip → mid-shoulder segment |
| `timing-strip` | One bar per serve from release to contact, with the pause shaded |
| `landing-marks` | Landing toe positions vs the baseline |
| `outcome-tally` | In / net / long / wide counts by serve number |
| `none` | No overlay |

### 8.2 Stats and labels

- Each focus shows **1–2 stats** (`evidence.statIds`). Each has its D2 honesty label, n, and an interval where it matters (D7).
- **Experimental values never appear in a non-experimental focus explanation** (research 09 §9). If one of an item's `statIds` is experimental at runtime (for example `landing-distance` in `legs-spring`, if its status is lowered to experimental), drop it and show only the other stat. If both are experimental, the item's effective tier is experimental (§13).
- Band metrics are shown as the band plus its key frame. Degrees are never shown (D5).

---

## 9. Adaptation

### 9.1 By level

**Assigning the band:**
- UTR < 4.0 → `utr-1-3`; UTR ≥ 4.0 → `utr-4-7`.
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
| Spread thresholds | looser (see JSON `thresholds`) | tighter |
| Drill start | base variant; the app suggests the regression if the success criterion is missed in 2 logs | base variant; the progression is unlocked after the criterion is met in 2 logs |
| Serve distance | regressions start at the service line | regressions start at the baseline with larger targets |
| Session serve budget (§11) | 60 | 80 |
| Kick serve | not introduced by any drill | allowed in progressions, unless a back comfort setting is on |
| Jumping | no drill adds a jump | progressions may add one, unless a knee (hip, knee or ankle) comfort setting is on |

### 9.2 By goal

The goal breaks ranking ties (§7.2 c), selects the drill variant and sets the transfer-set format. The first three bullets follow research 03 §10 [Our inference].

| Goal (label) | Tie-break prefers items with this goal | Drill variant and transfer set | Load |
|---|---|---|---|
| `first-serves-in` ("More first serves in") | toss, contact, net/long patterns | transfer set to box targets, counting ins | standard |
| `more-pace` ("More pace") | legs, tilt, pause, contact height | progression may add "speed intent" sets (research 04 [S49]), at most 30 hard serves (§11) | hard-serve cap applies; no speed-intent sets with shoulder or elbow comfort settings |
| `second-serve-reliability` ("A second serve I trust") | second-serve margin, toss height, rhythm | transfer set of second serves only | standard |
| `less-effort` ("Serve with less effort") | rhythm, flowing motion, toss height, lift-not-arch | regression variants first; no speed intent; no jump | session budget 40; hard-serve cap 0 |

**About the `less-effort` goal.** The brief lists "reduce discomfort". We present it as **"Serve with less effort"** (ARCHITECTURE.md uses the same id), and it only changes content selection and load. Two copy rules apply:
- The app never claims that a focus reduces pain or injury risk. Health claims would move the app towards being a health service under the Privacy Act and outside TGA exclusion 14B (research 07 §1.1, §8.3) [Regulation, Our inference].
- The goal screen carries the line: "If something hurts, see a physio or GP. This setting just keeps sessions gentler."

### 9.3 By physical comfort (standing settings and today's soreness)

Comfort regions come from the profile sheet (standing) and from today's "a bit sore" answer (session only). They never raise an item's priority; they only exclude and adjust. [Our inference: raising priority for "injury reasons" would be a health claim, and research 04 §7 itself says such prioritisation should only follow professional clearance.]

| Region | Items excluded (JSON `contraindications`) | Adjustments (`comfortNotes`) | Load |
|---|---|---|---|
| shoulder | none by default | no speed-intent sets; `reach-up` = taps only; `second-serve-margin` = slice at 70%, 20 serves at most | budget 40; hard serves 0 |
| elbow (elbow or wrist) | none by default | no speed-intent sets; `second-serve-margin` = slice at 70%, 20 serves at most | budget 40; hard serves 0 |
| back | `shoulder-tilt` | slice, not kick (research 04 F16: kick vs flat loading is unresolved, research 03 [S15]); effort about 70% | budget 40 |
| knee (hip, knee or ankle) | `legs-spring`, `land-into-court` | no jumps anywhere; platform stance allowed | budget 40 |
| other | none | no jumps; no speed intent | budget 40; hard serves 0 |

**Region ids** match ARCHITECTURE.md `ProfileRecord.comfort.area`. That record holds one area plus a pain flag. Coaching needs a separate, multi-select standing list, `comfortRegions: BodyRegion[]` ("areas to go easy on"). This list is not a pain flag and never triggers a referral by itself (§7.8).

If **every** eligible item is excluded by comfort, the decision is `keep-going`. Its drill already avoids jumping and speed intent, and the card adds: "Your comfort settings rule out today's main candidates. Check with a physio before working on them."

### 9.4 Players under 18

The v1 library is written for adults. ARCHITECTURE.md's `ageBand` allows under-18 profiles, so for those players:
- **No kick serve anywhere.** This removes the `lift-not-arch` progression and the kick parts of `second-serve-margin`.
- **Session budget 40** [Our inference], and the weekly ramp flag at a ratio of 1.3 instead of 1.5 (§11).
- **Extra line on every card:** "Work on this with a qualified coach if you can."
- **One more body-check prompt:** "Back pain that gets worse when you arch or serve", which leads to the *Stop and book* card with "see a physio or sports doctor before serving again" (research 03 §12, juniors row).

Why: elite adolescents show high rates of lumbar abnormality, including pars lesions (research 03 [S38]) and high serve lumbar loads (research 03 [S36]) [Established; application to recreational juniors is Our inference].

---

## 10. Pain and red-flag screen, and referral copy

**Rules.**
- The app screens and signposts. It never assesses, never names a condition, never estimates severity and never suggests treatment or rehab (research 07 §8.3: TGA 14B; Apple 1.4.1).
- Answers are stored on the phone only, after express consent (APP 3.3), and are never synced, sent to analytics or shared with any AI (D8; research 07 §11).
- The wording below is adapted from clinical guidance (research 03 [S55] BESS; [S56] ACSQHC Low Back Pain Clinical Care Standard) and research 03 §12. **It must be reviewed by an Australian physiotherapist or sports and exercise physician before release.**

### 10.1 Body check (before every recording and every logged practice)

> **Quick body check**
> How's your body today?
> ( All good ) ( A bit sore or tight ) ( It hurts )

- **All good:** continue.
- **A bit sore or tight:**
  1. "Where?" [Shoulder] [Elbow or wrist] [Back] [Hip, knee or ankle] [Somewhere else]. These map to the `BodyRegion` ids `shoulder`, `elbow`, `back`, `knee` and `other`.
  2. "Is it sharp, getting worse, or still there from your last session?" [Yes] [No]
     - **Yes** → treat as *It hurts*.
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
> Pain that's sharp, getting worse, or hanging around is worth getting checked by a GP, physiotherapist or sports doctor. With back pain, see a GP soon if it comes with a fever, follows a fall, is there even when you rest, or you've had cancer or unexplained weight loss. We'll keep your focus and stats ready for when you're back.
> [OK] [Remind me in 3 days]

The back-pain line paraphrases the alerting features in the ACSQHC standard (research 03 [S56]).

**During or after a drill** (practice log body answer = sore or pain):
> Stop the drill if pain is sharp, builds as you go, or is still there the next day, and see a physiotherapist or sports doctor.

This is the pain rule for all drills (research 04 §6) [Coaching interpretation].

**Resuming.** The player can tap "It's settled" at the next body check. After a *see a doctor today* or *emergency* answer, the next check also asks "Have you been checked by a doctor or physio?" (self-declared). The app cannot verify it, and it says so: "Thanks. If anything flares up, stop and get it checked again."

**Onboarding line** (research 04 [S36], Better Health Channel, reviewed 2013 and possibly outdated):
> If you're over 40, have a medical condition or haven't exercised for a while, check in with your GP before starting a new training routine.

---

## 11. Load guidance

There are no dose-response data for recreational adult serving. The workload findings come from high-performance players (research 03 [S43]). Every number below is [Our inference], deliberately conservative and adjustable in settings.

| Rule | Default | Basis |
|---|---|---|
| Recording block | 12–36 serves (CAPTURE.md sets the protocol) | research 06 §7.3 |
| Drill volume | 20–40 serves, 5–10 min | research 04 §6 |
| Guided serve budget per session (recorded + drill + transfer) | 60 (UTR 1–3); 80 (UTR 4–7); 40 with any comfort setting or the `less-effort` goal | [Our inference] |
| Hard (near-max-effort) serves | ≤ 30 per session; 0 with shoulder or elbow comfort settings | research 04 F15 [Our inference] |
| Weekly ramp (adults) | METRICS.md `load-flag`: last 7 days ÷ weekly mean of the last 28 days > 1.5, **and** ≥ 100 serves in the last 7 days. The 100-serve floor lets low-volume players build | In adult high-performance players, a ratio > 1.5 went with a hazard ratio of about 2.8 for new injury (research 03 [S43]) [Established for that population; application is Our inference] |
| Weekly ramp (under 18) | same calculation with a ratio > 1.3 | In high-performance juniors, a ratio > 1.3 went with about 1.6-fold injury risk (research 03 [S43]) [Established for that population] |
| Return after a break | ≥ 14 days without logged serves: first week at ≤ 50% of the previous weekly average | [Our inference], in the spirit of the ramp-up findings in research 03 [S43] |
| Spacing | at least one lighter day between days above 60 guided serves | [Our inference] |
| Within-session fatigue | §6.5 note: "A good place to stop" | research 03 [S14] |

**Counting.** Recorded serves are counted automatically; drill serves come from the practice log (`approxServes`, prefilled from the drill). Serves outside the app are unknown, and the copy says so.

**Budget copy:**
- At the budget: "That's your serve budget for today. Nice work." The player may continue; the budget is guidance, not a lock.
- Above the ramp: "You've served a lot more this week than usual. Build up gradually." This is the METRICS.md `load-flag` copy.
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
  drillVariant: 'base' | 'progression' | 'regression'
  retests: { sessionId: string; verdict: ExperimentVerdict }[]
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
- `successCriterionMet = yes` in 2 logs unlocks the progression.
- `no` in 2 logs suggests the regression.
- `feel = awkward` in 2 consecutive logs triggers: "Some changes feel odd at first, but a good change usually starts to feel better within a session or two. Want to try the other cue?" Kovacs suggests a correct fundamental change should feel better within minutes to hours (research 04 [S15]) [Coaching interpretation].

### 12.3 Re-test protocol and matching

**When.** After at least 1 logged practice (2 is better), ideally within 7 days. Record it **after the warm-up and before practising the drill**, so we measure what stuck rather than the drill's immediate effect. Learning is judged by retention, not performance during practice (research 04 [S38] reports the two separately) [Coaching interpretation].

**What.** 12 serves in the locked stratum: same side view preset, same court side, same serve number and the same intended type. Serve at match pace to one target, with your cue in mind.

**Matched means all of these (otherwise "Not comparable yet", with the reason):**
1. same player profile and height setting;
2. view `side` in both sessions, with the camera on the same side of the player;
3. same court side, serve number and intended type (untagged is its own type);
4. `capture-quality` ≥ `usable` in both;
5. for timing metrics (`rhythm-*`, `trophy-pause`), the same `fpsClass`;
6. ≥ 12 measured serves in the stratum in each session, the CAPTURE.md §1 minimum for "Did it work?". Fewer gives "Too early to tell";
7. for outcome-only items, outcomes tagged the same way (per serve or tally).

Items 1–3 are D7. Items 4–7 are my additions, which tighten D7 without contradicting it. Different court, light, wind or camera distance (inside the CAPTURE.md preset) are allowed and noted on the comparison card.

### 12.4 Verdicts ("Did it work?")

**The primary metric** is the item's first `metricId`. Process metrics lead (D7). The linked outcome is shown underneath with n and a Wilson interval, but it drives the verdict only for outcome-only items. Those pool the last 3 matched sessions each side, because one session cannot settle a proportion (research 06 §7.1).

**Probability of improvement, P:**
- **Spreads:** log-ratio of corrected SDs, `ln(σ̂_new/σ̂_base)` with SE = √(1/(2(n_base−1)) + 1/(2(n_new−1))). P = Φ(−log-ratio / SE).
- **Medians and means** (positions, ratios, durations): difference with bootstrap SE (1,000 resamples per session). P = Φ(improvement / SE).
- **Band shares and outcome rates:** Beta(k+1, n−k+1) posteriors for both sessions. P = Pr(new better than baseline), by Monte Carlo (10,000 draws) or a normal approximation.

**Smallest worthwhile change (SWC)** comes from the `swc` field in metrics.json, so display and coaching agree. The values below are copied for convenience, and METRICS.md wins if they differ:

| Metric | SWC (metrics.json) |
|---|---|
| Toss and rhythm spreads | 15% relative (log ratio 0.16) |
| `toss-forward`, `contact-forward` | 5 cm |
| `toss-drop` | 6 cm |
| `contact-height-ratio` | 0.015 |
| `trophy-pause` | 80 ms |
| `landing-distance` | 8 cm |
| Outcome rates | 10 percentage points |
| Band share (coaching only; not in metrics.json) | 30 percentage points [Our inference] |

All are starting values. They will be replaced once we have test–retest data from our own clips: a change must exceed the metric's typical error before it counts as real (research 09 [S70], [S71]; research 09 Open question 1).

**Words (D7, research 09 §4.2).** The ids follow ARCHITECTURE.md `VerdictWord`. Two ids are **requested additions** (*): without them, "Clear improvement" collapses into `likely-better`, and the experiment would never close as "worked" on evidence alone.

| Verdict id | Player sees | Rule |
|---|---|---|
| `clear-improvement`* | **Clear improvement** | P ≥ 0.95 and effect ≥ SWC |
| `likely-better` | **Likely better** | 0.80 ≤ P < 0.95, or P ≥ 0.95 with effect < SWC. Adds "About N more serves to confirm" |
| `no-clear-change` | **About the same** | 0.20 < P < 0.80 and \|effect\| < SWC |
| `too-early-to-tell` | **Too early to tell** | minimums not met, or 0.20 < P < 0.80 with \|effect\| ≥ SWC (the direction is unclear) |
| `likely-worse` / `clear-decline`* | **Likely worse** / **Clearly worse** | mirror images of the first two |
| `not-comparable` | **Not comparable yet** | a matching rule in §12.3 fails |

ARCHITECTURE.md says METRICS.md owns comparison methods (`compareMatched()`, `servesToConfirm()`). If METRICS.md specifies different methods, it wins. This section then states what coaching needs from them: P(improved), an SWC per metric, and N more serves.

**"About N more serves".** Solve for the re-test n at which P would reach 0.95 if the observed effect held, holding the baseline fixed. Subtract the serves already recorded and round up to the nearest 5.
- If N > 60, or cannot be reached because the baseline is too small, say "Another matched session or two will settle it".

**Copy examples:**
- "**Likely better.** Your toss height spread went from 17 cm to 11 cm (13 serves, same side view). About 10 more serves to confirm."
- "**About the same.** Contact height 136% → 137% of your height. Changes like this often take a few sessions."
- "**Not comparable yet.** This session was ad court; your experiment is on the deuce court."

### 12.5 Ending an experiment

| Situation | Transition | Copy |
|---|---|---|
| Clear improvement, or the resolved threshold is met | `worked`; 2-session cooldown; next session re-ranks | "It worked. Your toss height is steadier. We'll keep an eye on it while you work on something new." |
| Likely better | continue; unlock the progression if the log criterion is met | "Keep going; it's moving the right way." |
| About the same after 2 re-tests | continue with the other cue register, or the regression drill | "No clear change yet. Let's try it from a different angle." |
| About the same or worse after 3 re-tests | `parked`; 3-session cooldown | "This one isn't shifting yet, and that's normal. Let's park it and try another route." |
| Likely or clearly worse | continue with the regression; check the body and feel answers | "It dipped a little, which often happens mid-change. Let's make the drill a bit easier." |
| Earlier-stage fault becomes major | `superseded` | "Something earlier in your serve needs attention first." |

---

## 13. Evidence tiers

D2 sets three tiers for coaching insights. They describe **the claim in "why it matters"**, not the honesty label on a number.

| Tier | Criteria | UI chip | Examples |
|---|---|---|---|
| `research-backed` | Peer-reviewed studies link the thing being changed to serve performance (usually in skilled players; the UI names the population in "How we know"), **and** its detection metric is measured or estimated | "Research-backed" | toss height consistency (research 03 [S29], [S28]); leg drive (research 03 [S7]); contact height (research 03 [S6], [S28]); timing consistency (research 03 [S24], [S30]) |
| `coach-recommended` | The recommendation comes from expert teaching (Kovacs, Intuitive Tennis, Essential Tennis, Feel Tennis, ITF CSSR) with at most indirect research support; detection is measured, estimated or player-entered | "Coaches recommend" | toss in front; trophy pause; tilt; landing; second-serve spin |
| `experimental` | The detection metric is experimental, **or** the coaching link is only our inference | "Experimental" plus the flask glyph (D2) | `land-into-court` while `landing-distance` is experimental |

- **Effective tier** at runtime = the weaker of the item's `evidenceTier` and its primary metric's status, where `experimental` status forces `experimental`.
- **Cues and drills are always coaching interpretation.** No trial supports any specific cue for UTR 1–7 servers (research 03, Open question 5). The "How we coach" page says so.
- **No item is tagged research-backed on vendor claims.** For example, Kovacs's statement that good servers lose only 5–7 mph off the back leg is a [Vendor claim] (research 03 [S50]) and is not quoted in-app.

---

## 14. Content style guide

- **Voice:** calm, warm, specific, not chatty. Use second person. Use Australian English (practise/practice, metre, colour, racquet). No emoji, no exclamation marks in coaching copy.
- **`whyItMatters`:**
  - exactly **2 sentences** in plain English;
  - sentence 1 says what goes wrong in the player's serve, sentence 2 says what the evidence or coaches say;
  - numbers only when sourced;
  - no joint names beyond shoulder, hip, knee and back;
  - no injury-prevention claims.
- **Cues:**
  - **fewer than 8 words**, concrete, sayable in one breath;
  - analogy cues use one image (lift, shelf, stool, wave);
  - outcome cues name a ball position, target or count;
  - never cue tossing-arm timing, wrist or forearm rotation (P9).
- **Drills:**
  - solo, public court, basket, 5–10 minutes, with a countable success criterion;
  - removable markers only (towel, racquet cover, ball can); never chalk or tape on public courts;
  - at most 5 toss-only reps;
  - always end with the 10-serve transfer set (P8).
- **Never say:** "wrong", "bad serve", "fix your injury", "protect your shoulder", "prevents injury", "like the pros", "perfect toss", any diagnosis word, any degree value for a joint.
- **Comparisons** are always with the player's own serves.
- **Uncertainty** is stated in words first ("likely", "too early to tell"), then numbers.

**Content lint** (a unit test over `coaching-library.json`; the app builder implements it):
- cues under 8 words;
- `whyItMatters` has exactly 2 sentences;
- `drill.minutes` between 5 and 10;
- every `metricId` and `statId` in the known id list;
- `keyFramePhase` is a `ServePhase`;
- enum values valid;
- every source key resolves to §17;
- every `faultId` unique;
- `keep-going` present.

---

## 15. Validation and tests (accuracy as a product requirement)

The founder did not allow downloading real serve footage, so v1 validation uses the synthetic generator, unit tests and in-app annotation. Real-footage and coach-agreement validation are documented next steps.

### 15.1 Engine unit tests (must pass before release)

| Test | Fixture | Expected |
|---|---|---|
| Worked example (§7.7) | synthetic metric summaries | `toss-height-steady`; `legs-spring` excluded for comfort; `reach-up` ranked second |
| Tie-break chain | as §7.7 without the toss fault | `reach-up` over `clear-the-net` (rule d) |
| Pain gate | body check = pain, or any red flag | referral; no focus; no drill text rendered |
| Comfort exclusion | knee setting with a strong `legs-quiet` signal | not chosen; listed as "comfort setting" |
| All excluded | every eligible item contraindicated | `keep-going`, with the comfort line |
| Capture gate | 5 usable serves, or quality `poor` | `capture-fix` |
| Keep going | all metrics inside the resolved bands | `keep-going`; "Why?" lists the checks |
| Stickiness | active experiment plus a new moderate stage-2 fault | same focus continues |
| Supersede | active stage-6 experiment plus a new major stage-2 fault | experiment superseded |
| Unmatched re-test | ad court vs deuce experiment | verdict "Not comparable yet" |
| Verdict maths | §7.7 re-test numbers | P ≈ 0.93, "Likely better", N = 10 |
| Experimental gate | `landing-distance` experimental, toggle off | `land-into-court` not eligible, listed "experimental-off" |
| Kick allowance | kick-tagged stratum with toss-forward −20 cm | `toss-behind` does not fire |
| MAD robustness | 11 steady tosses plus 1 wild toss | no spread flag |

### 15.2 Synthetic end-to-end (with `tools/synth`)

- **Method.** The generator's `ServeParams` expose each coaching signal directly: `tossApexHeightM`, `tossApexForwardM`, `contactHeightRatio`, `maxKneeFlexionDeg`, `trunkInclinationContactDeg`, `trophyPauseS`, `landingDistanceM`. Per-serve SDs are also available, as are presets (`beginner`, `intermediate`, `advanced`).
  - For each fault, generate matched sessions with the fault injected at 3 magnitudes (below, at and 1.5 × the fire threshold) across 3 seeds, 2 frame rates (60, 120) and 2 player heights.
  - Run the full pipeline (video → metrics → coaching).
  - **Gaps in the generator:**
    - There is no direct control for trunk tilt at trophy; `shoulder-tilt` and `lift-not-arch` need a new `ServeParams` field.
    - Outcomes (in / net / long) come from the ball physics or `launchAngleDeg`, so outcome items should be tested with injected tags as well.
- **Targets** [Our inference]:
  - detection sensitivity ≥ 0.9 at 1.5 × threshold;
  - false-fire rate ≤ 0.1 below threshold;
  - the chosen focus equals the injected fault in ≥ 90% of single-fault sessions;
  - with two injected faults at different stages, the earlier stage wins in ≥ 90%.
- **Honesty.** Synthetic results validate the logic and the maths only. They say nothing about real-world accuracy, and the accuracy page must say so.

### 15.3 In-app annotation mode (founder or coach)

- A reviewer marks per serve:
  - apex frame, contact frame and landing frame;
  - knee band and tilt band (low / typical / high);
  - outcome;
  - "Would you coach this first?" (yes / maybe / no) for the app's chosen focus.
- **Outputs:** per-item agreement between the app's detection and the reviewer's; percentage agreement on the focus choice; per-signal Bland–Altman on frames.
- **Targets** [Our inference, matching research 05 §11.3]:
  - band agreement ≥ 80%;
  - event timing ≤ 1 frame mean absolute error;
  - focus rated "yes" or "maybe" on ≥ 80% of sessions.

### 15.4 Real-world next steps (documented, not run)

1. **Coach agreement.** Two blinded coaches independently pick the single highest-value change for 30 recreational players' sessions. We report Krippendorff's α against the app, targeting ≥ 0.7, as in the expert-rating study (research 03 [S33]).
2. **Reference distributions for UTR 1–7.** Replace the §6.3 starting thresholds with percentiles from our own library of 30+ players. The validation plan targets at least 30 players across UTR 1–7 (research 05 §11.1).
3. **Usefulness metrics.** These feed research 08 §8.2:
   - share of experiments reaching "Likely better" or "Clear improvement" within 3 re-tests, per item;
   - per-item "cue helpful" rate;
   - re-test completion rate.
4. **Cue A/B test.** Randomise the register (analogy vs outcome) within each level band. Compare next-session verdict rates and `cueHelpful`. The literature is contested (research 04 [S38], [S39]).

---

## 16. Known limitations and issues flagged for the product lead

1. **D6's strict stage order can pick a marginal upstream issue over a major downstream one.** Mitigation in this spec, which follows D6: eligibility requires severity ≥ moderate (§6.2), and an active experiment is superseded only by a *major* earlier fault.
   - **Suggested amendment:** "stage order applies among faults of equal or higher severity tier". This would let a major contact problem outrank a moderate toss issue.
   - In the worked example (§7.7) the amendment would have chosen contact height over toss height. That is arguably worse coaching there, because the toss plausibly causes the contact problem. I therefore recommend keeping D6 as written plus the severity gate, and revisiting once coach-agreement data exist (§15.4).
2. **Cross-spec conflict: METRICS.md §4.1 keeps "provisional" values out of coaching triggers** (spreads with n < 20, bands with n < 12). CAPTURE.md's standard block is 12 serves per side, so under that rule the hero toss-consistency focus could almost never be chosen from one session. This spec instead uses n-aware tests (chi-square for spreads, Beta posteriors for prevalence), which only fire on large effects when n is small (§6.1–6.2). **Recommendation:** "provisional" should limit headlines and display wording, not coaching triggers that apply their own sample-size test. The product lead should settle this. A related concern is already resolved: metrics.json derives the side-view knee band from hip drop, not from a foreshortened 2D knee angle.
3. **Framing risk to the hero metric.** D1 allows 6 m at 1.2 m height with no tilt. Research 06 §3.3 computes the top of a level 1x frame at about 3.6 m in that case, and CAPTURE.md §15 computes 3.45 m for a 26 mm lens. Toss apexes above that would leave the frame, and research 06 says to design for tosses up to about 4.5 m. When the apex is lost, the lead toss items become unavailable and coaching silently falls to later-stage items. **I concur with CAPTURE.md's proposal** (1.5–1.9 m high, 7–9 m from the serving spot, with a live headroom check).
4. **Thresholds are starting values.** No recreational reference data exist (§6.3). Expect retuning after §15.4.
5. **Evidence is mostly from elite and male samples** (research 03 §1). Women, older players and left-handers are under-studied. We show the population behind every reference.
6. **The outcome items depend on honest tagging.** Tag coverage discounts detection confidence, and a tally is accepted.
7. **Coaching disagreement is real:** toss isolation, pronation, tossing-arm timing, and leg drive (active vs passive; research 03 §13, research 04 §4.5). v1 takes the "always swing" and "don't cue the arm" positions (P7, P9). The alternatives are documented under "How we coach".
8. **Tennis Australia's coach-education content could not be read** (HTTP 403; research 04 [S77]). We cite TA-affiliated research, not TA's curriculum.
9. **Two items start restricted.**
   - `stay-tall` is dormant until metrics.json adds a contact reading for `trunk-tilt-band`.
   - `flowing-motion` is experimental-only while `trophy-pause` is experimental.

   Both are designed in, so they switch on without content changes.

---

## 17. Sources

Source keys in `coaching-library.json` use the form `"research 03 [S7]"`. Full citations are in the research files, in their Sources sections.

### 17.1 Established findings we rely on

| Key | Finding used | Population |
|---|---|---|
| research 03 [S1] / research 04 [S12] | Kovacs & Ellenbecker 8-stage model (a framework, not a measurement tool); toss slightly lateral to overhead; front knee > 15° recommended (its checkpoints are Coaching interpretation) | review of elite data |
| research 03 [S2] | Elliott 2006: shoulder-over-shoulder tilt; about 20% lower internal-rotation speed after a 1.5 s pause | elite / lab |
| research 03 [S3] | Elliott et al. 2003: < 10° knee flexion → higher shoulder and elbow loads at similar speed; abbreviated backswing similar | Olympic players |
| research 03 [S6], [S7] | Girard et al.: contact 142.6% vs 149.2% of height; knee restriction −15–17% speed at all levels | beginner to elite men |
| research 03 [S9] / research 04 [S28] | Reid, Elliott, Alderson 2008: foot-up ≈ foot-back | 12 high-performance men |
| research 03 [S14] | Martin et al. 2016: lower impact height after a 3-hour match | 8 advanced players |
| research 03 [S15] / research 04 [S26] | Martin et al. 2026 review: load findings; kick vs flat loading unresolved | review |
| research 03 [S19] | Sheets et al. 2011: kick has more sideways racquet path, contact further back | 7 NCAA men |
| research 03 [S20] | Reid, Whiteside, Elliott 2011: toss and impact shift by target on first serves | 6 professionals |
| research 03 [S23] | Whiteside et al. 2013: net faults differ mainly in ball projection angle | elite junior females and 1 professional woman |
| research 03 [S24] | Whiteside et al. 2015: variable toss, consistent timing | elite women |
| research 03 [S25] | Reid et al. 2010: toss practised alone changes the toss | 5 elite juniors |
| research 03 [S27] / research 04 [S29] | Newton et al. 2025: 0.56 m drop, 0.97 s release to impact; tossing-arm timing changes wreck accuracy | 10 high-performance men |
| research 03 [S28] | Vacek et al. 2025: 0.72 ± 0.19 m drop; impact height ρ ≈ 0.75 with speed | 13 junior men |
| research 03 [S29] | Mendes et al. 2013: vertical toss stabilised; about 1:1.5 contact ratio | experienced players |
| research 03 [S30] | Antúnez et al. 2012: more variability with lower speed and accuracy | 17 players |
| research 03 [S31] | Jacquier-Bret & Gorce 2024 meta-analysis: trunk 25 ± 7°, front knee 64.5 ± 9.7° at trophy | elite, 27 studies |
| research 03 [S33] | Wood et al. 2023: experts rate rhythm, leg drive and trunk reliably from 2D | 300 elite players |
| research 03 [S34] | Fett et al. 2021: deuce vs ad differences | 14 elite junior men |
| research 03 [S35] | Connolly et al. 2021: flat contact about 17 cm further forward than kick | elite adolescents |
| research 03 [S36] | Campbell et al. 2013: high lumbar lateral-flexion loads in serving | 20 elite adolescent males |
| research 03 [S43] | Amor-Salamanca et al. 2025: workload ratios > 1.3 (juniors), > 1.5 (adults) with more injuries | high-performance only |
| research 03 [S48] / research 04 [S19] | Fourel et al. 2024: push timing, not peak force, relates to racquet speed | 36 competitive players |
| research 06 [S8] | Whiteside, Giblin, Reid 2014: professional women's toss SDs about 6–7 cm | 8 professionals |
| research 04 [S34] | Deghaies et al. 2026: individual loading strategies | 22 professionals |
| research 04 [S37], [S38] | Wulf 2013; Chua et al. 2021: external-focus advantage | meta-analysis |
| research 04 [S39] | McKay et al. 2024: bias-corrected external-focus effects near zero | re-analysis |
| research 04 [S40] | Zang et al. 2025: distal-focus benefit in experienced performers, not novices | 20 RCTs |
| research 04 [S45], [S46] | Liao & Masters 2001; Carnero-Díaz et al.: analogy learning, ES about 0.3, mainly novices | RCTs |
| research 04 [S47] | Meier et al. 2020: analogy = explicit instruction for the tennis serve | 44 juniors |
| research 04 [S52] | Czyż et al. 2024: contextual interference, smaller in applied settings | 34 studies |
| research 04 [S55], [S56] | Bandwidth feedback; visual + verbal feedback | acrobats; PE meta-analysis |
| research 04 [S57], [S60] | Video alone adds little over coaching; self-controlled video helps | intermediate players |
| research 09 [S70], [S71] | Hopkins: a change must beat the measure's typical error before it counts as real | methods |
| research 03 [S4] | Fleisig et al. 2003: proximal-to-distal sequence; trunk about 48° above horizontal at impact | 20 Olympic players |
| research 03 [S10] | Martin et al. 2014: poorer trunk-to-hand energy flow in injured players (case-control, two-season follow-up) | 19 high-level men |
| research 03 [S38] | Alyas et al. 2007: lumbar MRI abnormalities, including pars lesions, in asymptomatic elite adolescents | 33 elite adolescents |
| research 05 [S50] (same paper as research 03 [S14]) | Martin et al. 2016: impact height about 2.6 m in advanced players; the authors state that higher impact increases the margin for error over the net | 8 advanced players |
| research 04 [S33] | Zhou et al. 2026: amateurs brake with a stiffer, more reactive landing than elites (abstract only) | pinpoint-serve study |

### 17.2 Coaching interpretation we adopt (presented as "Coaches recommend")

| Key | Practice used |
|---|---|
| research 04 [S14], [S15] | Kovacs: over 80% of serve issues start at release or loading; fundamentals vs style; a correct change should feel better quickly |
| research 04 [S16] / research 03 [S50] | Kovacs back-leg serving (the drill is used; the 5–7 mph figure is a Vendor claim and is not quoted) |
| research 03 [S49], [S51] | Kovacs Academy: explosive, synchronised drive rather than simply deeper bend; common adult inefficiencies |
| research 04 [S2], [S4]–[S9] / research 03 [S53], [S54] | Intuitive Tennis (Nikola Aracic): control before power; the 1-2-3 rhythm; rec-level problem list (No Tilt, Jackknife, Double Knee Bend, Toss Release, Contact Point). Course content is paywalled, so only titles and structure were verified |
| research 04 [S48] | Buszard, Reid, Farrow, Masters (Tennis Australia-affiliated): analogies, errorless practice, marginal perception |
| research 04 [S49] | Regan 2025 (ITF CSSR): constraints-led serve practice; always swing at the toss; speed intent (the author calls these untested) |
| research 04 [S51] | Krause et al. 2019: practice design changes behaviour (representative design) |
| research 04 [S62], [S63], [S65] | Feel Tennis (Tomaž Mencinger): relaxed acceleration; toss-and-catch; fence serves |
| research 04 [S66]–[S69] | Essential Tennis: toss release and height matched to leg drive; second-serve spin via a sideways swing path |
| research 04 [S72] | Online Tennis Instruction: behind-the-baseline serves; net-clearance air targets |

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
| research 04 [S36] | Better Health Channel (Vic) tennis injury advice (reviewed 2013) |
| research 07 [S29], [S30], [S2] | TGA exclusion 14B; Apple App Review Guidelines (1.4.1, 5.1.3); Privacy Act (health information, APP 3.3) |
| research 04 [S77] | Tennis Australia coach-education pages: returned HTTP 403, so they were not read and are not relied on |

### 17.4 Our inferences (every number that is ours)

Fire and resolved thresholds (§5.2, JSON); minimum serves (§6.1); confidence gate 0.70; severity tiers; the band-share SWC; load budgets; the kick allowance of 20 cm; the verdict probability bands; best-serve selection; and the synthetic and annotation acceptance targets. Each is to be replaced or confirmed with our own data (§15.4).
