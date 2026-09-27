# VALIDATION_PROTOCOL.md: real-footage and radar validation (v1)

*Written 27 September 2026. Status: **a protocol, not a result.** No real serve footage has been analysed. The founder has not allowed downloading real footage, so every clip in this study is filmed for it, with consent, by the team or by volunteer players. Until this protocol runs, every status stays capped at V1 (METRICS §6 item 8).*

Scope: how we collect real serves, mark ground truth on them, compare the app with that truth and with a radar, and turn the results into status changes in `docs/specs/metrics.json`. It carries out METRICS §5.6 (targets and statistics) and research 05 §11 (the 30-player library), and it uses the in-app annotation mode "Check this serve" (`app/src/validation/annotation`, `app/src/ui/screens/playback/check`) and the evaluation tool `tools/validate/annotation-eval.ts`.

Evidence labels follow the research docs: [Established], [Regulation], [Vendor claim], [Our inference]. Numbers without a label come from METRICS or `metrics.json` and are cited there.

Related: `docs/VALIDATION.md` (what the synthetic work shows today), METRICS §1.3 (levels and status ceilings), §5.6 (acceptance), §5.7 (where results live), CAPTURE §2 and §6 (set-ups), CAPTURE §7 (filming etiquette), research 07 (privacy law).

---

## 0. Summary

| | |
|---|---|
| Question | Does the app find the serve's moments and measure its heights, positions and speed on real footage as well as the product claims, per light condition? |
| Players | **30 or more**, UTR 1 to 7, women and men (at least 12 women), aged 18 to 65 across three age bands, at least 5 left-handers (§2) |
| Serves | **1,500 or more** checked serves; at least 150 per metric for each V2 stage; 200 or more radar serves (§3) |
| Cameras | Side view at the default set-up (D1, portrait, 7 to 8 m, 60 fps), a **second, high rear camera** (2.5 to 3.3 m up, 5 to 7 m behind), a 240 fps reference phone for a subset, a radar behind the server (§4) |
| Conditions | Day (sun behind the phone, sun across, overcast), night under LED and metal-halide lights, flicker; acrylic hard courts **and sand-filled synthetic grass**; clay or en-tout-cas where available (§5) |
| Ground truth | Two trained annotators, **blinded** to the app and to each other, in "Check this serve"; a calibration pole, tape-measured landing marks and radar readings for V3 (§6 to §8) |
| Analysis | Agreement between annotators first; then app against the mean of the annotators: Bland–Altman (repeated measures), MAE with a player-cluster bootstrap, ICC(2,1), interval coverage, event-timing error distributions, output coverage (§9) |
| Decision rule | Thresholds from METRICS §5.6, frozen before the first clip is filmed (§10). A pass moves a metric to its V2 or V3 ceiling in the condition classes tested, through a reviewed edit of `metrics.json` (§11) |
| Privacy | Adults only, written consent, filmed at booked courts, video kept off the internet, a random subject key in every file, APP-level handling, HREC approval before anything is published (§12) |

---

## 1. Aims, and what this protocol can and cannot change

1. **V2, real-annotated** (METRICS §1.3): show that event timing and the image positions the app tracks agree with careful human marks on real footage, under each light condition, and that values repeat across days. A pass lets timing metrics become *measured* and keeps spatial metrics *estimated* with real evidence behind them.
2. **V3, physical reference**: show that absolute heights, forward positions, landing distances, spreads and speed agree with physical references (a calibration pole, tape-measured marks, two-view triangulation, a radar). A pass lets a metric reach its designed status (`statusTarget` in `metrics.json`).
3. **Output coverage**: report how often each metric is produced at all, because silent drop-outs flatter accuracy (research 05 §11.3).
4. **A recreational reference set** (gap: recreational ranges §9): the same clips, with consent, give Australian recreational percentiles by sex and age band that later replace the provisional bands. That use is a separate, optional consent (§12.3).

It cannot:
- raise a status by itself. The report is evidence for a reviewed change (METRICS §5.7);
- validate spin. Spin is always unavailable (D4);
- validate the knee-bend band from the side view; it needs the rear view (D1, D5);
- say anything about players or conditions outside those filmed. A condition class with too few serves keeps its level.

**Pre-registration.** Before the first session: this document, the acceptance table (§10), the analysis tool version (git commit of `tools/validate/annotation-eval.ts` and `app/src/validation/annotation`) and the engine version under test are frozen in a dated tag. Later changes to thresholds or analysis are reported as deviations, with both results.

---

## 2. Participants

### 2.1 Sample targets

The evaluation tool checks these targets and prints them in the report's "Sample against the protocol" table (`PROTOCOL_SAMPLE` in `app/src/validation/annotation/evaluate.ts`).

| Requirement | V2 stage (first pass, METRICS §5.6) | Full library (research 05 §11.1) |
|---|---|---|
| Players | ≥ 8 | **≥ 30** |
| Women | ≥ 3 | **≥ 12** |
| Left-handers | ≥ 1 | **≥ 5** |
| Age | ≥ 2 players aged 40 or over | ≥ 6 in each band: 18–29, 30–44, 45–65 |
| UTR | spanning 1–7 where possible | ≥ 8 in each band: 1–2.99, 3–4.99, 5–7 |
| Serves checked | ≥ 150 per metric | **≥ 1,500** in all |
| Serves marked by two annotators | ≥ 25% | ≥ 25% |
| Test–retest | ≥ 6 players with ≥ 3 sessions at least 2 days apart | the same, plus every player has 2 sessions |
| Radar serves (speed, V3) | — | ≥ 200, across the speed range |

Quota grid for recruitment (players, full library). The totals meet every row above; cells may shift by one as long as the row and column totals hold [Our inference]:

| | UTR 1–2.99 | UTR 3–4.99 | UTR 5–7 | Total |
|---|---|---|---|---|
| Women | 4 | 4 | 4 | 12 |
| Men | 6 | 6 | 6 | 18 |
| Total | 10 | 10 | 10 | 30 |

Within each row, spread ages across 18–29, 30–44 and 45–65, and place at least one left-hander in each UTR column. The launch segment (D11, comp-night regulars aged about 30 to 55, UTR about 3 to 7) is over-represented by design, and the rest keeps the results honest for everyone else.

**Why 30 players.** Serves are nested in players, so the precision of a limit of agreement depends on the number of players more than the number of serves. The 95% interval of a limit is roughly ±1.96·√(3/n) standard deviations of the difference: about ±1.2 SD with 8 players and about ±0.6 SD with 30 [Our inference, from Bland & Altman 1999 with n = players]. Eight players are enough to find a gross failure; thirty are needed to state the limits.

### 2.2 Eligibility

- Aged 18 to 65 (the closed beta is 18 and over, D11).
- Plays at least monthly; can hit 60 serves in a session without discomfort.
- A UTR rating, or a coach's estimate recorded as such.
- **Not eligible today:** current pain or injury in the shoulder, elbow, back, hip or knee, or advice from a health professional not to serve. The session pain check (§6, step 2) repeats this on the day. The study never assesses pain or injury; anyone who reports pain is advised to see a qualified professional, such as a physiotherapist or doctor, and is not filmed that day.

### 2.3 Recruitment

- Through coaches and clubs, the lead channel (D11), starting in metro Melbourne. Posters and coach introductions, never approaches at public courts.
- Participants receive a court booking and new balls for their sessions. No payment depends on anything they do on court or on results.
- Each participant gets a study code (P01, P02, …) at enrolment. A participant register (name, contact, study code) is kept apart from the data (§12.4). Demographics go in the consent-sheet file (`participants.csv`, Appendix A.3), keyed by the study code.

---

## 3. Sessions and serves

- **Sessions.** Every player: 2 sessions at least 2 days apart. The test–retest group (at least 6 players): 3 sessions, each at least 2 days after the last. Sessions never happen on consecutive days for the same player.
- **Per session:** a 10-minute warm-up, then 4 blocks of 12 serves (48 or more): first serves from the deuce court (the core block), first serves from the ad court, second serves from the deuce court, then a block the condition plan asks for (§5.2). Breaks of at least 2 minutes between blocks.
- **Per condition** (research 05 §11.1): at least 20 serves per player per condition class they are filmed in.
- **Arithmetic.** 30 players × 2 sessions × 48 serves ≈ 2,900 serves filmed. About half are checked in full (two sessions per player, alternating blocks), which gives 1,500 or more checked serves, with at least 25% of them marked twice [Our inference].
- Every serve is logged on the session sheet (Appendix A.4) with its block, serve number (1st or 2nd), side, aimed target (T, body, wide) and outcome called by an assistant at the net post (in, net, long, wide).

---

## 4. Equipment and set-up

### 4.1 Cameras

| Camera | Position (CAPTURE §2.1, §6.1) | Settings | Purpose |
|---|---|---|---|
| **A. Side (default)** | Hitting-arm side of the server, on the baseline extension, **portrait, 7–8 m from the centre mark**, 1.3–1.6 m high, level; recorded in the app | 1x lens, 60 fps (the test condition); 1080p | The product's default set-up. Everything the side view measures |
| A′. Side (alternative) | **Landscape at the side fence**, 8.5–9.5 m, 1.4–1.8 m high, level or a measured upward tilt of up to 5° | 1x, 60 fps, 4K where offered | The second D1 set-up. At least one session per player in the V2 stage; a third of sessions in the library |
| **B. High rear** | Behind the server, 5–7 m back, **2.5–3.3 m high** (fence clamp or a stand), within 1 m of the server's line, tilted down about 8° | Landscape, 1x, 60 fps, 4K where offered | Rear-view metrics (toss drift, knee band, shoulder over shoulder, outcomes), and the second view for two-view triangulation of positions and spreads (V3) |
| C. Reference (subset) | Beside camera A, same line, 1 m further back | 240 fps | Event reference for the frame-rate subset; the high-rate clip for rear flight time |

All phones have their clocks set automatically. Cameras A and B are synchronised by the toss apex (research 06 §8.2) and an audible clap at the start of each block (a hand clap in view of both cameras).

### 4.2 References

| Reference | Specification | Used for |
|---|---|---|
| Stature | Measured barefoot against a wall with a tape and a set square, to 0.5 cm, at the start of each session; the player's entered height in the app is set to this value | Scale for every cm value (the height the app uses). A run with the player's own self-reported height is analysed as a secondary result |
| **Radar** | Pocket-Radar-class device (spec ±1 mph, research 05 [S69] [Vendor claim]) on a tripod **directly behind the server, in line with the serve**, 3–5 m back, about 1.2 m high, operated by an assistant | Peak serve speed (km/h), every serve logged against its serve number. Entered in "Check this serve" as *Radar* (stored as `speed-radar-entered`, player-entered) |
| Calibration pole | 4 m pole with 10 cm marks, held vertical (spirit level) in the server's plane at the serving spot, filmed for 5 s at the start of each block, then removed | V3 heights: toss apex and contact height (METRICS §5.6) |
| Landing marks | Chalk line at the baseline; after each serve in a landing block, the assistant marks the front-foot landing and measures it with a tape to the nearest cm, perpendicular to the baseline | V3 landing distance |
| Light | A lux reading at the server's spot at the start of each block (phone light meter app accepted, logged as such); the lamp type (LED or metal halide) from the venue | Condition class and the night-lights stratum |
| Court | Surface type and colour, background behind the server (windscreen, trees, sky, building) | Condition strata |

Radar cosine error is small in line with the serve and grows off-line: a 5° angle reads about 0.4% low and 10° about 1.5% low [Our inference: cos 5° = 0.996, cos 10° = 0.985]. The assistant re-aims the radar when the server changes side. Serves wide of the T line are logged with their target so the analysis can check for a target-dependent bias.

### 4.3 What the radar reads

A radar reports the fastest speed it sees, which is close to the launch speed just after contact. The app's side-view speed is an experimental **launch-speed range** that needs 120 fps, a known height and a target tag (D4). The comparison is therefore radar peak against the app's launch-speed range; an average-speed reading (rear view, `speed-average-rear`) is never compared with the radar peak.

---

## 5. Conditions

### 5.1 Condition classes (METRICS §1.3)

Each session carries one class: `day`, `overcast`, `night-lights` or `flicker`, from the app's capture checks and the block card's "Light" choice. The report groups every result by class, and levels move per class.

### 5.2 Condition plan

Minimum filmed cells, each with at least 20 serves per player filmed in it, and each class with at least 150 checked serves per metric before it can pass V2:

| Stratum | Cells | Minimum |
|---|---|---|
| Light | Day, sun behind the phone; day, sun across or into the lens; overcast; night under **LED** lights; night under **metal-halide** lights | ≥ 3 classes in the V2 stage, including night lights on **2 lit courts (one LED, one metal halide)** (METRICS §5.6) |
| Flicker | Night sessions at 60 fps (the default) and at 50 fps where the phone offers it | Flicker class populated from whichever night courts flicker; the app's flicker check decides |
| Surface | Acrylic hard court (blue and green); **sand-filled synthetic grass** (green or terracotta, common at Australian clubs, research 02 §6.2); clay or en-tout-cas where available | Every player on at least one hard court; at least 8 players on synthetic grass |
| Background | Windscreen or wall; trees; open sky | Recorded, not quota'd |
| Frame rate | 60 fps (all); 120 or 240 fps subset | ≥ 6 players with a 120/240 fps session (speed, timing precision) |
| Set-up | Portrait between courts (A); landscape at the fence (A′) | Both set-ups in the V2 stage |
| Clothing | As the player turns up; note fitted or loose | Recorded |
| Wind | Beaufort category at the start of each block | Recorded; blocks above force 5 are filmed but analysed separately |

Night sessions follow the same procedure. Comp-night lighting is the launch segment's real condition (D11), so it is a first-class stratum, not an afterthought.

---

## 6. Session procedure

1. **Arrival.** Check the booking and any venue rule about filming (CAPTURE §7.2). Put up the study sign (Appendix A.5). If other courts are in use, tell the players nearby; if a junior lesson is in the background, move the cameras or wait.
2. **Consent and pain check.** Confirm the written consent (§12.3) is on file and still wanted. Ask: "Any pain or injury today that stops you serving normally?" If yes, do not film; suggest a qualified professional such as a physiotherapist or doctor; record only "not filmed today".
3. **Measurements.** Stature (§4.2). Handedness. Enter both in the study phone's profile.
4. **Set-up.** Cameras A (or A′), B, C and the radar as §4. The app's live framing checks must pass (headroom at least 4.3 m, level). Photograph the set-up from behind for the log.
5. **Warm-up** (10 minutes, not filmed).
6. **Each block.** Pole shot (5 s), clap, then 12 serves. The assistant calls each outcome and reads the radar value aloud; the logger writes serve number, side, target, outcome, radar km/h and anything unusual (net cord, let, ball hit the fence in view).
7. **Landing block** (library sessions): after each serve the assistant marks and measures the landing (§4.2).
8. **End.** Stop all recordings. Copy clips to the study laptop over a cable, check file counts against the log, then delete them from personal phones (§12.4). Import camera A and A′ clips into the study phone's app for analysis (the app analyses on the device).
9. **Session sheet** signed off by the lead. Any deviation (a camera moved, a phone overheated, a block cut short) is written down, never fixed afterwards.

If the player reports pain during the session: stop, advise them to see a qualified professional, and do not film again until they say they are fine. The study does not record what the pain was.

---

## 7. Annotation rules

Annotation uses "Check this serve" (Serve detail → More actions → Check this serve), in-app tool version `in-app@1`. The app shows no value, event, phase name or overlay of its own until the marks are saved; the frame scrubber is neutral and shows only the annotator's own marks. Definitions match the prompts in `app/src/validation/annotation/marks.ts`, so two people marking the same serve mean the same frame and the same pixel.

### 7.1 What is marked

| Mark | Frame rule | Point rule |
|---|---|---|
| **Height** (standing reference) | A frame before the toss where the player stands tall and still (both heels down, head level) | **Top of head**: the highest point of the head or hair outline, not a cap's peak. **Heel on the ground**: where a heel meets the court. **Front toe** (optional, needed for forward distances): the tip of the front shoe |
| **Release** | The **first frame where the ball has left the hand** (a visible gap between ball and fingers) | none |
| **Peak** | The frame where the ball is **highest** (lowest y). If two frames tie, the earlier | **Ball centre**: the centre of the ball's blurred outline, not its brightest pixel |
| **Contact** | The **first frame where the strings meet the ball** (ball and strings touch or overlap) | **Ball centre** as above |
| **Landing** | The **first frame where the front foot is back on the ground** after the serve (the shoe stops dropping) | **Front toe**: the tip of that shoe |
| **Radar** (optional) | none | The peak speed the radar showed, with its unit (km/h or mph, converted at 1.609) and device |

- **Not sure.** Any frame mark can be flagged "Not sure". Flagged marks are kept and analysed; the report shows results with and without them as a sensitivity check.
- **Out of view.** If the moment is hidden or out of the frame (for example a toss peak above the picture), leave that mark empty. Never guess a position outside the picture. Empty marks are counted in the report.
- **Precision tools.** Mark on the paused frame, with the loupe (3× magnifier shown while pressing), arrow keys to nudge by one source pixel (Shift: five), and "Zoom to you" on portrait clips. Step with the ‹ › buttons, the ± 10 frame buttons, or the , and . keys.
- **Frame numbers** are the clip's own decoded frames. Slow-motion clips must be the original file (the app's time base handles real time; a re-encoded copy is excluded).
- **Handedness** comes from the profile: forward distances are measured towards the net.

### 7.2 Who marks, and blinding

- **Two annotators** per serve for at least 25% of serves, assigned at random within each player and condition; one annotator for the rest. Annotators use their initials (up to 4 letters) and the role "Our team"; a coach annotator uses "A coach".
- **Same study phone.** Both annotators mark on the study phone that analysed the clip, one after the other, each under their own initials ("Who is marking?" → Change). Serve ids are made per phone, so two phones analysing the same clip would not pair up in the analysis. Saved marks never pass to the next person.
- **Study code.** A study phone holds several players' sessions, so on the first serve of each session the annotator enters the player's study code (for example P07) in "Who is marking?". The app remembers it for that session, saves it on every check, and the export uses it as the player's key (§7.4). On a player's own phone the code is left empty and the phone's random key is used.
- **Blind to the app.** Marks are made before the comparison is shown. The first time "App vs you" is shown for a set of marks, the app records it (`revealedAt`). Marks changed after that are flagged not blind (`blind: false`) and are left out of the main analysis (the tool's `--include-unblinded` gives the sensitivity result).
- **Blind to each other.** An annotator never sees another annotator's marks on the same serve: the app keeps checks apart by initials and only says that another check exists.
- **Blind to outcome where possible.** Annotators mark from video only. The session sheet (outcomes, radar values) is joined afterwards, except that the radar value is typed in by the logger, not by an annotator.
- **Order.** Serves are marked in a random order across players and sessions, not in filming order.

### 7.3 Training and drift

1. Each annotator reads this section and marks a 20-serve practice set (never analysed).
2. Agreement check on the practice set against the lead annotator: event frames within 1 frame on at least 90% of marks, points within 2 cm on at least 90% [Our inference]. Below that, retrain and repeat.
3. Every 200 serves, each annotator re-marks 10 earlier serves (chosen at random, unannounced). Drift is reported as intra-rater agreement.

### 7.4 Export

Each marking phone exports "Export checks" (Check this serve → App vs you → Export checks). The file `serve-coach-validation@1-YYYY-MM-DD.json` holds every check on that phone with the app's automatic values for the same serves, the clip's timing and set-up, and the engine version, and **no video, no images, no names, no notes and no profile details** beyond the height the app used (Appendix A.1). Sample data never enters it. The file is saved on the phone; nothing is sent. The lead copies it to the study laptop by cable.

---

## 8. What V2 and V3 can and cannot show

**V2 (hand marks on real footage)** checks detection and tracking on real images: does the app find the same frames, the same ball and the same foot a careful person finds? Heights and distances from the marks use the engine's own side-view image geometry (METRICS §1.1): a height is (floor − point) ÷ standing height in the frame, a forward distance is Δx in frame heights ÷ standing height, both times the player's height. So V2:

- **can** test event timing, ball and foot tracking, the standing-height estimate ("Height in the picture" row), and agreement in % of height and cm *within the same geometry*;
- **cannot** test absolute scale (the player's height and its ±3% planning error, METRICS §6 item 2), perspective, the toss's distance from the body's plane (the 8–12 cm depth bias, D1), or the sideways leak into spreads. Hence spatial metrics and spreads stay *estimated* after V2 (METRICS §1.3).

**V3 (physical references)** checks absolute values:

| Quantity | Reference (METRICS §5.6) | How it is compared |
|---|---|---|
| Toss apex, contact height | Calibration pole in the server's plane, plus the 240 fps camera | Pole marks give metres per pixel at the server's plane; the annotated ball centre is converted to metres and compared with the app's height in metres |
| Forward positions, spreads | Two-view triangulation from cameras A and B, synchronised by the toss apex (research 06 §8.2) | Triangulated positions against the app; spreads pass when the side-view corrected SD is within 20% of the triangulated SD |
| Landing distance | Tape-measured chalk marks | Tape distance against the app |
| Speed | Radar behind the server (§4.2) | Radar peak inside the app's experimental range, MAE %, LoA % |
| Knee and shoulder bands (rear) | Two coaches, blinded, three levels | Agreement and weighted κ |

**Gaps in the current tool (`in-app@1`)** [Our inference]. METRICS §5.6 also lists hip centres (leg drive, loading depth), both shoulders at trophy and contact, heel and toe of both feet at release, motion start, the lowest hip frame and the band labels. `in-app@1` does not mark them yet. Until a later tool version adds them, leg drive, loading depth, drive time, trophy pause, shoulder tilt and the bands cannot pass V2 through this protocol; their sessions are still filmed, so the clips can be marked later.

---

## 9. Statistics and analysis plan

Run: `app/node_modules/.bin/tsx tools/validate/annotation-eval.ts <export files or folders> --participants participants.csv` (Appendix A.3). It writes `validation/real/<date>/annotation-report.md` and a JSON copy (METRICS §5.7). The formulas live in `app/src/validation/annotation/stats.ts` and `evaluate.ts`, unit-tested against published values (ICC against Shrout & Fleiss 1979; t and F quantiles against tables) and end to end on synthetic annotations with a known bias (`tools/validate/annotation-eval.test.ts`).

### 9.1 Data preparation

1. Read every `serve-coach-validation@1` file; keep the latest version of each check (by subject key and check id); drop exact duplicates across files.
2. Leave out sample data and marks changed after the comparison was shown (counted in the report).
3. Recompute every marked value from the raw marks (`agreement.ts`), so a formula fix applies to old files.
4. Group checks by serve (subject key, clip fingerprint, serve id). A serve marked by two annotators becomes one reference: the **mean of the annotators**.

### 9.2 Agreement between annotators (reported first)

The app cannot be judged more precisely than two people agree (METRICS §5.6). For serves marked twice: event MAE in frames and ms; point agreement in cm and % of height (head top, heel, toe, ball at peak and at contact, toe at landing); and MAE of each metric derived from the marks. If inter-rater MAE for a metric exceeds half its acceptance threshold, the annotation rule for that metric is reviewed before its app result is judged [Our inference].

### 9.3 App against the marks

For each metric, per condition class and pooled, with differences as app − reference:

- **Bland–Altman** bias with its 95% interval, and 95% limits of agreement with their approximate intervals. With several serves per player, the **Bland & Altman (2007) repeated-measures** method: the variance of a difference is the between-player plus the within-player component from a one-way analysis of variance, and the bias interval uses player means.
- **Proportional bias**: regression of the difference on the mean. If the slope's 95% interval excludes 0, report the ratio (log) form as well (METRICS §5.6).
- **MAE** with a 95% percentile bootstrap that resamples **players** (1,000 resamples, fixed seed).
- **ICC(2,1)**: two-way random effects, absolute agreement, single measure, with the McGraw & Wong (1996) interval. Serves are the targets; nesting in players is not modelled in the ICC, so the Bland–Altman result leads.
- **Interval coverage**: the share of reference values inside the app's stated 95% interval for that serve, with a Wilson interval. The app aims for 95%; a coverage below 90% means the stated ranges are too narrow, whatever the MAE.
- **Output coverage**: of the serves with a reference value, how many the app produced a value for.
- **Units**: heights in % of the player's height (and cm for V3); forward positions and landing in cm; toss-to-hit time in ms and judged in frames; ball drop in cm (reported; judged through its timing, §10).

### 9.4 Event timing

For toss release, toss peak, contact and front-foot landing: bias, MAE (frames and ms), median and 90th percentile of the absolute error, the share within 0, 1 and 2 frames, a histogram of signed errors (≤ −3 to ≥ +3 frames), how often the app found the event, and Bland–Altman on event times in ms. Frame rates are reported separately (60 fps and the 120/240 fps subset).

### 9.5 Test–retest and spreads

From the test–retest group: the typical error of each per-session metric across days (SD of differences ÷ √2) and of each spread. The typical error becomes the smallest worthwhile change basis (METRICS §4.5). Spreads pass V2 when their cross-day typical error is at most 25% of the median spread (METRICS §5.6).

### 9.6 Speed

Radar readings against the app's experimental launch-speed range (only serves filmed at 120 fps or more with a target tag, D4, and only with the experimental toggle on in the analysis phone): MAE as % of the radar value (range midpoint), Bland–Altman in %, and the share of radar readings inside the displayed range with a Wilson interval.

### 9.7 Subgroups and robustness

Reported, not used for pass or fail unless a class has its own level: sex, age band, UTR band, handedness, set-up, surface, background, frame rate, lamp type, wind. A subgroup whose MAE is more than 1.5 times the pooled MAE is written up as a known failure case on the "How accurate is this?" page [Our inference].

### 9.8 Missing data and exclusions

No imputation. A serve without a reference value for a metric is not in that metric's analysis; a serve with a reference but no app value counts against output coverage. Serves the app hard-rejected (`IMPLAUSIBLE_VALUE`) are reported in coverage and excluded from agreement. Exclusions are listed in the report by reason.

---

## 10. Acceptance thresholds

Per metric, the thresholds are each metric's `validation.realThreshold` in `docs/specs/metrics.json`, which follow METRICS §5.6 (research 05 §11.3 unless stated there) and are stricter where METRICS groups metrics: contact height is 2.5% of height (0.025 ratio units) against the grouped 3%, and toss-in-front's V3 limit is 8 cm. The tool and the in-app "App vs you" card use the same values (`METRIC_TARGET` in `agreement.ts`). All are frozen by the pre-registration (§1). "Now" is the level in `metrics.json` on 27 September 2026 (day / overcast / night-lights / flicker).

| Metric (id) | Status target | Now | V2 threshold (vs hand marks) | V3 threshold (vs reference) | Tool row |
|---|---|---|---|---|---|
| Event timing: release, peak, contact, landing | — | — | MAE ≤ 1 frame | — | Event timing |
| Toss-to-hit time (`rhythm-release-to-contact`) | measured | V1 / V1 / V0 / V0 | MAE ≤ 1 frame (judged in frames) | — | Metrics |
| Ball drop before contact (`toss-drop`) | measured (only when σΔt ≤ 8 ms, METRICS §3.5) | V1 / V1 / V0 / V0 | Time MAE ≤ 1 frame: judged through the toss-peak and contact timing rows. The image drop from the marks is reported as a scale cross-check | — | Event timing; Metrics (reported) |
| Toss height (`toss-apex-height`) | estimated | V1 / V1 / V0 / V0 | MAE ≤ 3% of height | MAE ≤ 10 cm; ICC(2,1) ≥ 0.75 | Metrics |
| Contact height (`contact-height-ratio`) | estimated | V1 / V1 / V0 / V0 | MAE ≤ 2.5% of height | MAE ≤ 10 cm; ICC(2,1) ≥ 0.75 | Metrics |
| Toss in front (`toss-forward`) | estimated | V0 all | MAE ≤ 6 cm | MAE ≤ 8 cm | Metrics |
| Contact in front (`contact-forward`) | estimated | V0 all | MAE ≤ 6 cm | MAE ≤ 10 cm | Metrics |
| Landing distance (`landing-distance`) | estimated | V0 all | MAE ≤ 6 cm (toe marked) | MAE ≤ 10 cm (tape) | Metrics |
| Leg drive (`leg-drive`), loading depth (`loading-depth`) | estimated | V1 / V1 / V0 / V0 | MAE ≤ 2.5% of height vs marked hip centres (needs a later tool version, §8) | Leg drive: two-view or IMU hip rise within 2% of height | — |
| Drive time (`drive-time`) | estimated | V0 all | MAE ≤ 2 frames (needs the lowest-hip frame, §8) | — | — |
| Trophy pause (`trophy-pause`) | estimated | V0 all | MAE ≤ 80 ms, after inter-rater agreement is reported (needs trophy frames, §8) | — | — |
| Spreads (`toss-height-spread`, `toss-forward-spread`, `contact-height-spread`, `rhythm-spread`) | estimated (rhythm spread: measured) | V1 / V1 / V0 / V0 | Cross-day typical error ≤ 25% of the median spread | Within 20% of the triangulated SD | Test–retest |
| Knee band (rear, `knee-bend-band`), shoulder tilt (`shoulder-tilt-trophy`) | estimated | V0 all | ≥ 80% agreement with coaches; knee band also Krippendorff's α ≥ 0.7 between coaches | — | Bands (later) |
| In/out (rear, automatic) | experimental | V0 all | — | ≥ 95% for bounces more than 30 cm from a line | Outcomes (later) |
| Zone (rear, automatic) | experimental | V0 all | — | ≥ 90% | Outcomes (later) |
| Speed (`speed-experimental`) | experimental | V0 all | — | MAE ≤ 5%; LoA within ±10%; coverage ≥ 90% | Speed |
| Spin (`spin`) | unavailable | — | never | never | — |

Additional rules for every row:
- **Sample.** A row is judged only with at least 150 serves from at least 8 players in that condition class (the tool says "Too little data to judge" until then, with the direction so far).
- **Coverage.** Interval coverage of at least 90% for any metric that shows a range (the app aims for 95%).
- **Annotators.** Inter-rater MAE for the metric below its threshold; otherwise the row is not judged.
- A MAE threshold is met when the MAE is at or below it; the MAE's bootstrap interval is reported beside it so a narrow pass is visible.
- On one serve, "App vs you" shows the same threshold as a per-serve line ("Within the 2.5% of height target"). One serve never passes or fails a metric; the card says so.

---

## 11. How results change statuses

The emitted status of every value is the lower of the metric's status target and the ceiling for its validation level **in the session's condition class** (METRICS §1.3):

| Level | Ceiling |
|---|---|
| V0 | experimental |
| V1 (synthetic pass) | estimated |
| V2 (this protocol, hand marks plus cross-day test–retest) | **measured** for timing metrics (`timingMetricIds`: toss-to-hit time, its spread, ball drop, trophy pause, drive time); **estimated** for absolute spatial metrics, spatial spreads and bands |
| V3 (physical reference) | the metric's status target |

Rules for a change:

1. **Per condition class.** A pass moves the level only in the classes that met the sample rule. Night-lights and flicker keep the pose-derived cap (`CONDITION_NOT_VALIDATED`, experimental) until the metric is at V1 in that class (`conditionCap` in `metrics.json`).
2. **Cumulative levels** [Our inference, for the product lead to confirm]. A class moves to V2 only if it is already at V1. A real pass in a class still at V0 (today: every night class) is recorded, and the level moves once the synthetic night cells pass. This keeps the synthetic matrix's interval-coverage gate in front of every real claim.
3. **Test–retest is part of V2.** Timing metrics need both the agreement row and the cross-day typical error.
4. **Failure drops a level.** A row that fails keeps or lowers the level in that class (METRICS §1.3), and "How we measure" says what failed.
5. **Through review only.** The result goes into a pull request that edits `validationLevel` and `validationState` for the metric in `docs/specs/metrics.json`, cites the report file, and regenerates the app's copy of the catalogue and "How we measure" (`app/src/ui/screens/metric/tools/build-metric-data.mjs`; `validationState.test.ts` keeps the engine catalogue and the JSON equal). CI never raises a level by itself (METRICS §5.7).
6. **Plain words.** "How we measure" states the new level per class, for example "Checked on real serves in daylight, 312 serves from 11 players; not yet checked under court lights."

Worked examples [Our inference, applying the rules above]:
- **Toss-to-hit time**, day class, V1 (estimated) today. Event rows for release and contact pass (MAE ≤ 1 frame), the metric's own row passes, and cross-day test–retest is done: the day class moves to V2 and the value is emitted as **measured** in daylight. Under lights it stays experimental until the night synthetic cells pass.
- **Toss height**, day class, V1 today. The V2 row passes (MAE ≤ 3% of height): the level becomes V2, but the ceiling for spatial metrics is estimated, so the value **stays estimated**, now backed by real footage. Only the pole reference (V3) can confirm its absolute value, and its status target is estimated anyway.
- **Landing distance**, V0 (experimental) in every class today. A V2 pass in daylight is recorded; the value becomes estimated in daylight once the synthetic check also passes there (rule 2).
- **Speed** stays an experimental range even after a V3 pass, because its status target is experimental (D4). A pass lets the "How accurate is this?" page show the radar comparison.
- **Spin** is always unavailable.

---

## 12. Privacy, consent and ethics (Australia)

### 12.1 The legal frame

- **Treat the study as APP-regulated.** The Privacy Act 1988 (Cth) and its Australian Privacy Principles bind businesses with turnover above AUD 3 million, and a small business that provides a health service while holding health information is not exempt (s 6D(4)(b)); research 07 §1.1 recommends complying with the APPs from day one [Regulation; Our inference for our case].
- **Video of an identifiable person is personal information** (OAIC; research 07 §1.2) [Regulation]. Pose keypoints linked to a person are personal information; they become sensitive biometric information only if used to identify or verify someone, which this study never does [Regulation; Our inference].
- **Health information is sensitive** and needs consent to collect (APP 3.3). The study collects none beyond the yes/no pain check on the day, which is recorded only as "not filmed today" [Regulation; Our inference].
- **Statutory tort for serious invasions of privacy** (in force from 10 June 2025) applies to everyone, including small businesses; consent is a defence (research 07 §2) [Regulation].
- **Audio.** A phone's microphone may count as a listening device under state and territory surveillance-device laws (CAPTURE §7.2) [Regulation]. Cameras record video only; the hit sound is not used in this study, and imported clips have their audio removed on import to the study laptop.
- **Filming in public places is generally lawful**, but venue rules can be stricter, and Tennis Australia's Safeguarding Children Code requires parental approval and the child's consent to film children (CAPTURE §7.2) [Regulation (sport policy)]. The study films adults only, at booked courts.
- **Human research ethics.** Results that will be published, or shared outside the company, need approval from a Human Research Ethics Committee first, for example through a university partner (research 07 §5.1.3 note; gap: recreational ranges §9). **Plan for HREC approval before the first session** [Our inference]: it is also the simplest way to make consent, data handling and withdrawal auditable.

### 12.2 What is collected

| Item | Where it lives | Identifiable? |
|---|---|---|
| Raw clips (cameras A, A′, B, C) | Encrypted study laptop and one encrypted backup drive, in Australia | Yes (faces, bodies) |
| App analysis and checks | The study phone's on-device storage (D8) | Linked by session |
| Validation export (`serve-coach-validation@1`) | Study laptop | **No names**: the study code as the subject key, initials of annotators, no video or images, no notes, no profile beyond height (Appendix A.1) |
| Participant register (name, contact, subject key) | A separate encrypted file, lead and one delegate only | Yes |
| Consent-sheet demographics (`participants.csv`: subject key, sex, age band, UTR band) | Study laptop, apart from the register | Not directly |
| Session sheets (outcomes, radar, light, surface) | Study laptop, keyed by subject key | Not directly |

No cloud storage, no upload, and nothing sent overseas (APP 8), unless an HREC-approved plan says otherwise.

### 12.3 Consent

Written consent before the first session, read aloud and signed, with a copy for the participant. It states, in plain English:
- what is filmed (the serve from the side and from behind; faces will be visible), who films it, and that no sound is recorded;
- what is measured (serve timing, heights, positions, speed by radar) and that nothing about pain or health is assessed;
- where the files live, who can see them, and for how long (§12.4);
- that taking part does not change anything about their coaching, club or competition;
- that they can stop at any time on court, and withdraw their data until the dataset is frozen for analysis (date stated), without giving a reason.

Separate, optional ticks (unticked by default, research 07 §3: no bundled consent):
1. Use of the numbers in the Australian recreational reference set (§1, aim 4).
2. Use of still images with the face blurred in publications or the "How accurate is this?" page.
3. Being contacted for later sessions.

### 12.4 Handling, retention and withdrawal

- Clips are copied off personal phones on the day and deleted from them (§6 step 8).
- **Raw video** is kept until annotation and the V3 references are complete, then deleted within 12 months of the participant's last session unless consent 2 was given for specific stills [Our inference; the HREC sets the final period].
- **De-identified exports and reports** are kept as research records for the period the HREC or institution requires (commonly 5 years after publication) [Our inference].
- **Withdrawal:** the participant's clips, session sheets and export rows are found by subject key and deleted; the register entry is kept only as "withdrawn" so they are not contacted again.
- **Security (APP 11):** full-disk encryption, a password manager for the register, an access log, no USB sticks except the encrypted backup.
- **Breach:** the Notifiable Data Breaches scheme applies to APP entities; a loss of the laptop or drive is reported to the lead the same day and assessed under it [Regulation].

### 12.5 On court

- Film at booked courts; position cameras so neighbouring courts are out of shot where possible (CAPTURE §7.1).
- A sign at the gate: "Tennis study in progress. We are filming our volunteer's serve only. Ask us anything." (Appendix A.5.)
- Bystanders who appear are never analysed, and clips with an identifiable bystander are cropped or blurred before any image leaves the study laptop.
- No junior in the background: move the cameras or wait.

---

## 13. Outputs

- `validation/real/<date>/annotation-report.md` and `annotation-report.json` from the tool, per analysis run (METRICS §5.7). The report states itself that it changes no status by itself.
- A per-metric pull request for any level change (§11).
- The "How accurate is this?" page (research 05 §11.4), regenerated from the latest results: bias, limits of agreement, coverage, conditions tested and known failure cases per metric.
- The frozen export files and session sheets, archived with the report's git commit.

A dry run of the whole chain on synthetic footage exists: a serve of the synthetic clip `baseline-s1` was marked through the real "Check this serve" screens from the clip's ground truth, exported, and read by the tool (`validation/results/ui/harden-annotation/`, `eval-from-ui/annotation-report.md`). It shows the pipeline works end to end. It is not evidence about real footage.

---

## 14. Plan and roles

| Stage | What | Exit |
|---|---|---|
| 0. Ethics and pre-registration | HREC application through a university partner; freeze this document, thresholds and tool versions | Approval; dated tag |
| 1. Pilot | 3 players (at least 1 woman, 1 left-hander), one day session and one night session, both set-ups, radar | Procedure, forms and export work; annotators trained (§7.3) |
| 2. V2 stage | 8 or more players to the §2.1 V2 minima, test–retest group started | V2 rows judged in day and at least one night class |
| 3. Library | 30 or more players, 1,500 or more checked serves, radar 200 or more, V3 references | V3 rows judged; reference-set percentiles |

Roles: a study lead (consent, register, sign-off), a filming assistant (cameras, pole, radar, outcomes, landing marks), two or more annotators (never the filming assistant for the same session), and an analyst who runs the tool and writes the pull requests. A qualified coach (Tennis Australia accredited) confirms UTR estimates where no rating exists and, later, labels the bands.

---

## 15. Risks and open questions

1. **Annotation disagreement at 60 fps.** Contact and release can be ambiguous by a frame. The inter-rater analysis comes first for this reason; if two people cannot agree within a frame, the 1-frame target is re-examined against the 240 fps subset.
2. **Head-top marking.** Hair and caps make the standing height uncertain by 1–2 cm, which feeds every % of height. Rule 7.1 says "not a cap's peak"; players are asked to remove caps for the standing frame.
3. **Night recruitment.** The launch segment plays at night, but night sessions depend on lit-court availability. Book two venues (one LED, one metal halide) before the pilot.
4. **Radar placement for doubles-position serves.** Keep radar serves to singles positions.
5. **Cumulative-level rule** (§11 rule 2) needs the product lead's confirmation.
6. **Tool gaps** (§8): hip centres, shoulders and bands are needed before leg drive, loading depth and the bands can pass V2.
7. **Synthetic grass.** Sandy lines and a green surface may confuse ball and foot tracking; that is exactly why it is a stratum, not a reason to leave it out.
8. **Two spec inconsistencies for the METRICS owner** (this protocol follows `metrics.json`):
   - METRICS §5.6 groups toss and contact height at "MAE ≤ 3% of height" while `metrics.json` sets contact height at 0.025 (2.5%).
   - `metrics.json` says the spreads pass V3 "within 20% (then measured)", but their `statusTarget` is estimated, and a V3 pass can only reach the status target (§11). One of the two needs to change before the V3 stage.

---

## Appendix A. Files and forms

### A.1 `serve-coach-validation@1` (written by the app, read by the tool)

Top level: `format`, `version`, `exportedAt`, `app` (engine and catalogue versions), `privacy` (a plain statement of what is left out), `counts` (entries, annotators, sample left out), `entries[]`. Each entry:

| Field | Content |
|---|---|
| `annotation` | The check: annotator initials and role, events (`frameIndex`, `sure`), points (`frameIndex`, normalised `x`, `y`), radar reference (`radarKmh`, device, unit as entered, `radarQuantity: 'peak'`), `blind`, `revealedAt`, `createdAt`, `updatedAt`. Free-text notes are never written |
| `sample` | Always false in an export (sample data is left out) |
| `subject` | `key`: the check's study code, or else a random key for the phone's player (neither linked to any identity in the file); handedness; the height the app used and whether it was entered |
| `clip` | Clip fingerprint, size, nominal and capture fps, time scale, frame count, time-base status, orientation, view, set-up, camera side, light, source |
| `serve` | Serve id and index, window, included flag, exclusions, soft flags, hard rejects |
| `engine` | Engine stamp (version, pose model and backend, decode path, parameters hash) |
| `app` | The app's events (frame, real time, confidence, method, uncertainty), metric values (value, unit, status, confidence, interval, reason, level, condition class), its image points for the marked ones, and its standing height in the frame |
| `derived` | Convenience copy of the per-serve comparison (the tool recomputes it) |

### A.2 Report

Sections: Data; Sample against the protocol; Agreement between annotators; Event timing; Metrics; By condition class; Speed; What a pass would allow; Method; Files.

### A.3 `participants.csv` (consent-sheet demographics)

`subjectKey,sex,ageBand,utrBand` with `sex` in {female, male, another term the participant chooses, not given}, `ageBand` in {18-29, 30-44, 45-65}, `utrBand` in {1-2.99, 3-4.99, 5-7}. `subjectKey` is the player's study code (for example P07), which is also the export's `subject.key` (§7.2). A `.json` file of the form `{ "P07": { "sex": …, "ageBand": …, "utrBand": … } }` is accepted too. No names.

### A.4 Session sheet (one per session)

Date, venue, court, surface and colour, background, lamp type, lux at the start of each block, weather and wind, condition class, cameras and settings, set-up photo taken (yes/no), stature, handedness, then per serve: block, serve number, side, target, outcome, radar km/h, landing tape cm (landing blocks), notes on events (let, net cord). Signed by the lead.

### A.5 Court sign

"Tennis study in progress. We are filming our volunteer's serve only, for a study of serve technique. No sound is recorded. Ask us anything. [Study lead name and phone]"
