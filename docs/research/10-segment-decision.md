# 10 — Launch segment decision

**Date:** 27 September 2026. **Status:** decision. This document picks the launch customer segment from three independent proposals and from the candidate list in research 02 §9. Specs should follow it. If a spec owner disagrees, they flag the disagreement rather than diverge.
**Inputs:** research 01–09, `docs/DECISIONS.md` (D1–D10), the specs in `docs/specs/`, three segment proposals, and a spot check of the web facts in those proposals, re-fetched on 27 September 2026 (see §13).
**Evidence labels:** [Established] = peer-reviewed or strong consensus. [Coaching interpretation] = expert practice, not directly proven. [Vendor claim] = a company's own statement. [Market data] = prices, participation and competition facts. [Our inference] = our own reasoning or arithmetic. **UNVERIFIED** = we could not confirm it from a primary page. Every score and threshold in this document is [Our inference] unless a source is cited.

---

## 1. Decision

**Primary segment: "comp-night regulars."** These are adults, about 30–55, who play a weekly organised fixture: a suburban association night comp or a UTR-graded pennant or league. Their UTR is about 3–7 (player-entered; unrated comp players are included). Their serve lets them down on match night: too few first serves go in, and they double-fault in front of a partner and team. They can practise serves alone on a club court or a booked council court. We start in metro Melbourne, then move to Perth and Canberra for the summer comps, then to Adelaide and Brisbane.

- **The problem we sell against is serve reliability under match pressure.** It has two sides: more first serves in, and a second serve they trust. The lead evidence is toss consistency, because that is what one side-on phone measures best (D1, D5).
- **Double faults** are a first-class goal and the headline outcome the player logs. We do not claim to see the whole second-serve fix from the side view. Grip, racket path and spin are rear-view or unavailable (research 04 F16; D1, D4).

**Secondary segment: "solo court-bookers."** These are improving adults, about 30–55, who book courts or hit socially but do not play organised comp. They are about UTR 1–4 or unrated. They need the same product with no extra build: the UTR 1–3 coaching band, the "More first serves in" goal, and the booked-court session templates. They are reached through the same court-booking and hitting-partner channels. They are the scale path once the primary segment has proved retention and willingness to pay.

**Lead channel, not a segment: coaches who teach comp adults.** They get a free coach view, offer codes and a referral fee (research 08 §6–7).

**Deferred:**
- parents of juniors (child privacy);
- masters targeted as masters (health copy needs clinician review);
- regional players as a stand-alone launch (reach) — they are included as a sub-cohort through Country Week and regional associations;
- speed-seekers (poor fit with D4);
- FIFO workers (unreachable).

See §11.

**Merged from the three proposals** (details in §11.1):
- **Proposal 2:** the broader "reliability" framing, the association channel mechanism (TROLS, entry windows) and the scale arithmetic.
- **Proposal 3:** the goal-to-capability argument, the most honest risk list (null mechanics-outcome link, side-view blind spot, pennant churn) and the adult-only boundary.
- **Proposal 1:** the season pass, the pre-match routine, night-capture handling and coach referral mechanics.

---

## 2. The primary segment as a persona

### 2.1 Operational definition (instrument this at onboarding)

A user is **in segment** when all four conditions hold:

1. They are 18 or older (self-declared).
2. They answer "I play a weekly comp or pennant" to *How do you play?*
3. Their player-entered UTR is 3.0–7.0, or blank. Blank is allowed because unrated night-comp players are included.
4. Their answer to *What costs you points on serve?* maps to the `second-serve-reliability` or `first-serves-in` goal (COACHING §9.2).

We report the in-segment share of installs by channel from the first build. This is how we find out the real size of the segment instead of assuming it (§5).

### 2.2 Persona: the comp-night regular (a composite, not a real person)

| Attribute | Persona | Evidence |
|---|---|---|
| Plays | One weekly doubles-heavy association night fixture, and/or a UTR-graded pennant or league. | WDTA night tennis runs Monday to Thursday from 7:30 pm, in doubles, singles/doubles and singles formats [N3] [Market data]. NENTG runs 41 sections of men's, women's and mixed doubles plus an open singles/doubles comp [N5]. Victorian Pennant 2022 had 3,808 players in 388 teams from 137 clubs [N1]. |
| Standard | UTR about 3–7, entered by the player. | UTR is the primary grading method for TV Pennant, with a 0.50 UTR playing-order variance (2026 rules, search excerpt only, UNVERIFIED [N7]; research 02 [S14]). Tennis West pennant requires a UTR-linked Competitive Player Profile (research 02 [S16]). No Australian UTR distribution is published (research 02 §4). |
| Age | About 30–55. | [Our inference]. No age split of comp players is published. 437,000 players were aged 35–54 in 2021–22 (research 02 [S4]). |
| Already pays | Club membership, light money, court hire, occasional lessons. | WDTA requires financial club membership and charges light money of A$8 per person per week for doubles (A$9 singles/doubles, A$10 singles) [N3]. Court hire is A$20–46 an hour (research 02 [S26][S40]). A 30-minute private costs A$60–70 in Melbourne (research 02 [S24][S25]). |
| Practises | Alone with a ball basket, in a 30–60 minute slot, often in daylight on weekends. | Members at some clubs book free, with lights extra, and PIN gate access is common (research 02 [S40]). The serve is the stroke you can practise without a partner [Coaching interpretation]. **How often comp players actually practise alone is unknown** (research 02 open question 4). This is test 1 in §9. |
| Pain point | Double faults and low first-serve % in front of a partner and team. The stakes repeat every week. | In SwingVision's match data, first-serve-in is 53–56%, second-serve-in about 70–71% and double faults 3.2–3.7 a match, almost flat from NTRP 3.0 to 5.0 (research 01 [S7], Vendor claim; mostly US, match play). That the pain is felt socially is [Our inference]. |
| Records with | One phone on a fence clamp or short tripod, side-on, at 1.2–1.6 m (D1). | The incumbent needs an elevated rear camera of 1.5 m or more (research 01 §3.2, UNVERIFIED wording). The iPhone share of this segment is UNVERIFIED. |
| Body | Some carry shoulder or elbow complaints. | The elbow and shoulder are commonly injured in tennis (research 03 §11). 78.8% of 113 senior high-level players had structural shoulder abnormalities (research 02 [S46], a single cross-sectional study). Hence the pain gate and referral (D6, D8). |
| Coach | Often has, or had, a coach. May already get conflicting advice. | Coach supply is thin: 3,766 TA coach members, and only 36 of 190 ACT coach members hold Club Professional or higher (research 02 [S8]). The coach-conflict risk is [Our inference] (research 02 §9.1 B). |

### 2.3 The questions they bring (these map to the brief)

1. "Is my toss becoming more consistent?" This is the hero metric: measured and labelled (D5).
2. "Am I getting more first serves in?" and "Is my second serve safe?" These use player-tagged practice outcomes, shown with n and a Wilson interval (D3, D7).
3. "Did this change improve my serve?" This uses matched "Did it work?" comparisons (D6, D7).
4. "Did it show up on comp night?" This uses a player-entered match log, plotted beside practice and never merged with it (§7).

---

## 3. Why they are underserved

1. **The incumbent measures outcomes, not causes.**
   - SwingVision reports in/out, placement and average speed from an elevated rear camera. It also markets a solo serve Goal Mode (research 01 §3.1–3.2 [S1][S8]).
   - We found no toss or phase metrics. Its blog tells players to *watch* for toss drift rather than measuring it (research 01 §3.7).
   - It costs A$149.99–499.99 a year, and an Australian review objects to paying A$300 (research 01 [S1][S2]) [Market data].
   - A double-faulter already knows the ball went out. What they lack is why, and one fix [Our inference].
2. **The 2024–26 AI technique apps show skeletons and scores, but publish no validation and give no outcome statistics.** Most have fewer than 20 ratings (research 01 §7). ServeAI is closest in concept (one cue, one drill), but it describes no outcome statistics and does not disclose its price (research 01 [S28]). The only Australian precedent we found is Tennis AI (Adelaide, 2020). It analyses uploaded match and training footage for about A$10 a month; it does not coach solo serve mechanics [N6] [Market data].
3. **No product links mechanics to outcomes for the same serves, then tests a change.** For example: "serves that went in had a toss 12 cm further forward", followed by a before/after experiment (research 01 §13 items 1–2, 5) [Our inference].
4. **Human feedback on the serve is expensive and thin on the ground.**
   - Privates cost A$50–85 per 30 minutes (research 02 §5.2).
   - A Brisbane operator paused private lessons because of demand and staff shortages (research 02 [S27]).
   - None of the Australian coaching providers sampled in research 08 §2.5 advertises standalone video analysis [Market data; small sample].
   - Serve-specific expert review is offshore and costs US$299–499: The Intuitive Serve course, and the Kovacs Serve Screen (research 04 [S2][S21]).
5. **State bodies and associations give these players fixtures, ratings and results, but no improvement tool.** TA's AO Labs "Coaches Box" is internal and coach-facing (research 02 §7 [S7]).
6. **The setup suits them.** A side-on phone at 6–8 m, clipped to the side fence, needs no court calibration beyond the player's height (D1). No competitor designs first for a 1–1.5 m tripod (research 01 §13 item 4).

---

## 4. Why they would use it, and why they would pay

### 4.1 Use (behaviour and cadence)

- **The weekly fixture sets a rhythm.** There is a comp night, then practice, then the next comp night. The between-fixture gap is where a 30–60 minute solo session fits (CAPTURE §5.5) [Our inference].
- **Seasons give natural checkpoints.**
  - Victorian Pennant ran a 14-week season in 2022 [N1].
  - WA summer pennant runs 14 weeks plus finals, from October to late March (research 02 [S16]).
  - NENTG's spring 2026 season started on Monday 3 August [N5].
  - A pre-season check, a mid-season check and an end-of-season comparison are natural moments to re-test [Our inference].
- **The goal matches what the side view measures well.** For the "more first serves in" goal, the research points first to toss repeatability and contact height:
  - experienced servers stabilise the vertical toss (research 03 [S29]);
  - a change in tossing-arm timing cut accuracy from 87% to 17% and 10% in high-performance men (research 03 [S27]) [Established, small n];
  - Kovacs puts "probably over 80%" of serve problems at the toss and loading stages (research 04 [S14]) [Coaching interpretation].

  These are D5's hero metrics [Our inference].
- **Speed is not their question.** Reliability is. So an honest "unavailable" for speed (D4) costs little with this segment [Our inference; see the speed-expectation risk in §9].

### 4.2 Pay

| Anchor | Amount | Source |
|---|---|---|
| Night-comp light money | A$8 per person per week (doubles). A 14-week season would cost A$112 [arithmetic; WDTA's own season length is not stated]. | [N3] |
| Club membership | Required for WDTA night comp | [N3] |
| Court hire | A$20–46 an hour | research 02 [S26][S40] |
| 30-minute private, Melbourne | A$60–70 | research 02 [S24][S25] |
| SwingVision Plus / Pro | A$149.99 / A$299.99 a year | research 01 [S1] |
| TopCourt Basic (generic lessons) | A$269.99 a year | research 01 §6 |
| Kovacs Serve Screen | US$499 (about A$710) | research 04 [S21] |
| **Our price** | **A$99.99 a year** (proceeds A$77.26). Test a non-renewing **A$39.99 season pass** (proceeds A$30.90). | research 08 §3, §6 |

Why they would pay:

- **A$99.99 costs less than two 30-minute privates.** It matches Strava and is one-third of SwingVision Pro (research 08 §2.6) [Market data; Our inference].
- **The stakes are public and repeat weekly.** Grading and playing order use UTR ([N7], UNVERIFIED; research 02 [S14][S16]). A double fault costs the pair a point in front of the team [Our inference].
- **They can check the return themselves.** Players already know their double faults. A 20-second player-entered match log next to measured practice metrics makes "Did it work?" tangible, without asking them to trust a black box. This is the segment's must-have in research 02 §10 [Our inference].
- **Honesty is a purchase reason in a sceptical category.** AI apps churn 30% faster (research 08 [S63]). Key-frame evidence, honesty labels (D2) and a plain "we don't measure speed from this view" are credible to a practical club player [Our inference; test in the beta].
- **Annual framing fits the season.** In Health & Fitness, 24.4% of annual subscribers are retained after a year, against 8.5% of monthly subscribers (research 08 [S63]).

---

## 5. Size estimate

### 5.1 Hard counts

| Count | Figure | Source | Status |
|---|---|---|---|
| Adults 15+ who played tennis, Australia, 2025 | 1,118,000 | research 02 [S1] | Confirmed |
| Victorian adults who played tennis, 2022 | 372,400 | [N1], citing AusPlay | Confirmed (read) |
| Rated players "regularly participating" (juniors included) | 100,000+ | research 02 [S8] | Confirmed; no adult split |
| Victorian Pennant 2022 | 3,808 players, 388 teams, 137 clubs (the same report also says 392 teams) | [N1] | Confirmed (read) |
| Victorian Pennant 2023 | 402 teams across 22 grades | [N1] | Confirmed (read) |
| Victorian Pennant 2025 | 419 teams, 135 clubs | research 02 [S13] | Confirmed |
| Victorian Pennant 2026 | "over 400 teams, 140 clubs and over 3500 players" | [N7] | Search excerpt, **UNVERIFIED** |
| Melbourne associations on one results system (TROLS) | 12, including two junior bodies and Metro Masters | [N4] | Confirmed (read) |
| Eastern Region Tennis | 80 affiliated clubs, 4,000+ players (juniors and seniors) | [N2] | Confirmed (read) |
| NENTG | 41 doubles sections plus an open singles/doubles comp | [N5] | Confirmed (read) |
| State League Championships, 2023 | 72 teams from 18 associations | [N1] | Confirmed (read) |
| Tennis Victoria Country Week, 2023 | 205 teams, 1,293 players | [N1] | Confirmed (read) |
| ACT Canberra Tennis League | 499 adult teams across four seasons; about 1,342–1,400 players, adults and juniors combined | research 02 [S8] | Confirmed |

**Not used:** a claimed WA league split of 5,538 players, 3,317 of them adults (Proposal 2). A search on 27 September 2026 did not find it, and the page returned 403.

### 5.2 National pool [Our inference; each assumption is visible]

1. Start with 100,000+ rated players (research 02 [S8]).
2. **Assume** adults are 40–60% of them. No adult split is published. This gives **40,000–60,000 rated adults**.
3. Add unrated night-comp players; the WDTA and NENTG pages mention no UTR requirement. This adds an unknown number, so we treat it as upside.
4. Subtract players above UTR 7. The distribution is unpublished, and we assume the share is small.
5. **Working national pool: about 40,000–60,000 adult comp players.**
6. **The share whose serve is their main weakness is unknown.** We measure it in the §9 survey and the onboarding question; we do not assume it.
   - Proposal 1's claim that an unreliable second serve describes "most of them" over-reads the vendor averages.
   - As illustrative scenarios only, we use 50% and 75%, giving **about 20,000–45,000 serviceable players**.

### 5.3 Melbourne beachhead [Our inference]

- **Hard floor:** about 3,500–3,800 pennant players ([N1]; [N7]).
- **Association comps:**
  - TROLS lists 12 associations, and about 9 of them run adult comps [N4].
  - The only one with a published size, ERT, reports 4,000+ players including juniors [N2].
  - **Assume** 1,000–2,000 adult players per adult association on TROLS. That gives about 9,000–18,000.
  - Associations outside TROLS, such as the WDTA night tennis [N3], are extra. Players who also play pennant overlap.
- **Beachhead estimate: about 10,000–20,000 adult comp players in metro Melbourne.** This rests on the per-association assumption. Replace it with counts requested from Tennis Victoria and the associations (§9, test 11).
- The closed beta needs 50–100 players (research 08 §8.4), so the beachhead is more than large enough to validate.

### 5.4 Revenue arithmetic and verdict

Each annual payer yields A$77.26 in proceeds (research 08 §3). "Penetration" below means paying subscribers as a share of the pool. It is not the download-to-paid rate: APAC download-to-paid is 2.4% of installs (research 08 [S63]).

| Pool | 1% paying | 2% paying | 5% paying |
|---|---|---|---|
| 20,000 (low serviceable) | 200 payers, A$15.5k a year | 400, A$30.9k | 1,000, A$77.3k |
| 50,000 (mid national pool) | 500, A$38.6k | 1,000, A$77.3k | 2,500, A$193.2k |

**Verdict [Our inference]:**
- The primary segment is big enough to validate retention, coaching usefulness and willingness to pay.
- On on-device economics it can fund a lean team: marginal cost is about A$0.01–0.29 per active user a month (research 08 §4.6).
- It is **not** big enough on its own for a large company. Growth has two paths through the same courts and clubs:
  - the secondary segment (§8): 437,000 players aged 35–54 (research 02 [S4]) and 1M+ online court-hire hours a year (research 02 [S36]);
  - then UTR-rated league players overseas. That is not researched here, so no figure is given.

---

## 6. Reach channels (in order)

Today is 27 September 2026. Melbourne's spring night comps are mid-season (NENTG started on 3 August [N5]). WA summer pennant starts in October (research 02 [S16]). Victorian winter pennant and the February association seasons are the soft-launch window (research 08 §7, Implications #10).

| # | Channel | Reach evidence | First experiment and timing | Success signal |
|---|---|---|---|---|
| 1 | **Coaches who teach comp adults** (lead) | 3,766 TA coach members (research 02 [S8]). About one-third of accredited coaches are in Victoria (research 02 [S34], 2022). | Recruit 20–30 coaches in Melbourne, plus Perth and Canberra, in October–November 2026. Offer a free coach view (export-based in v1, D8), one free month via Apple offer codes, and about A$20 per converted annual plan, paid off-platform (research 08 §6). | ≥30% of invited students activate; ≥15% of activated students convert (research 08 §7) |
| 2 | **Melbourne associations** | 12 on TROLS [N4]; ERT 80 clubs [N2]; NENTG 41 sections [N5]; WDTA night tennis [N3] | Email all 12, plus WDTA, with a no-cost offer: a Serve Check night at one club, and an anonymised aggregate "serve reliability" report for the association. Ask to be included in December–January pre-season emails for February seasons. | ≥3 associations agree within 4 weeks |
| 3 | **Pennant clubs and captains** | VIC Pennant 419 teams, 135 clubs (research 02 [S13]); ACT 499 adult teams (research 02 [S8]); WA summer pennant (research 02 [S16]) | Serve Check nights at 5 clubs. One captain's pack onboards a team. Perth in October–November 2026; Melbourne in February–March 2027. | ≥25 installs per event; ≥40% second-session rate (research 08 §7) |
| 4 | **State events** | Country Week 2023: 205 teams, 1,293 players. State League Championships: 72 teams from 18 associations [N1]. | A radar "serve check" booth. It is also the place to collect consented, radar-paired clips for validation (research 08 §7 channel 8). This channel also reaches the regional sub-cohort. | Installs per hour; radar-paired clips collected |
| 5 | **Court-booking touchpoints** | 1M+ online court-hire hours (research 02 [S36]); SportLogic 2.37M hours in 2024 [S37]; PIN gate access [S40] | QR codes on gates at 5–10 council and club courts, with permission. A "record your serve" tip in booking confirmations through ClubSpark or SportLogic partners. This channel also reaches the secondary segment. | Scans per court-week; ≥40% install-to-activation |
| 6 | **Hitting-partner Facebook groups** | 17.4K / 13.6K / 5.2K members (research 02 [S43]–[S45], UNVERIFIED) | Admin-approved beta calls to recruit 50–100 closed-beta players, screened with the §2.1 definition. | ≥30% of respondents complete a first session |
| 7 | **TA, state bodies, UTR** | AO StartUps; UTR Power partner perks (research 08 [S7][S8]) | One conversation per body in Q4 2026 | A named pilot or perk |
| 8 | **Apple Ads** | Break-even cost per install is about A$1.16 at median conversion (research 08 §7) | A capped A$1,500 test after App Store listing optimisation, not before the soft launch | Cost per install ≤ A$1.50 |

---

## 7. What the product must and must not do for them

### 7.1 Must

| # | Requirement | Why | Where it lives |
|---|---|---|---|
| M1 | **Onboarding asks one question:** *What costs you points on serve?* Options, in this order and with none preselected: "Double faults", "Not enough first serves in", "Not enough pace", "Serving feels like hard work". They map to `second-serve-reliability`, `first-serves-in`, `more-pace` and `less-effort` in COACHING §9.2. Also ask for competition type (pennant / night comp / league / none), usual match night, optional UTR (player-entered) and age band. | Routes coaching (D6 goal tie-break). Measures the segment (§2.1). | COACHING §9.2 (wording change, flagged) |
| M2 | **Toss consistency leads the dashboard.** Beside it sits *Second serves in: k of n* with a Wilson band, and the matched first-serve line when the goal is first serves in. | D5, D7. Process metrics move sooner. Detecting a 10-point first-serve change between two sessions needs about 389 serves per session (research 06 §7.1). | METRICS; Progress tab (D10) |
| M3 | **A "second-serve check-in" template:** warm-up, then one block of 15 second serves from the player's usual side, then tally, focus and drill. The existing templates stay. | CAPTURE §5.3 uses a block of 15 serves per stratum. Second serves must be their own stratum, because their toss sits elsewhere (research 03 [S35]). | CAPTURE §5.5 (addition, flagged) |
| M4 | **Per-serve tagging in under 2 seconds** (1st/2nd, deuce/ad, in/net/long/wide), with a session-tally fallback. | D3. Tagging friction is the main threat to outcome statistics (§9). | Review flow |
| M5 | **The signature insight** links tagged outcomes to measured toss and contact. For example: "second serves that went in had the toss further back". It must be allowed to say "no clear difference". | D3. Research 03 [S28] found near-identical toss values for good and faulted serves in ranked juniors, so a null result is a real outcome. | METRICS, COACHING |
| M6 | **A player-entered match log**, entered in about 20 seconds the morning after comp night: double faults (count), service games, a rough first-serve % (optional, labelled "rough"), and "Did you use your cue?" (yes/no). It is plotted by season week beside the practice focus metric, **never pooled** with practice statistics, and labelled player-entered. | Research 02 §10 must-have. D2, D3, D7. Transfer to matches is for the player's story, not for verdicts (research 08 §8.2). | METRICS and ARCHITECTURE (new entity, flagged) |
| M7 | **Coaching on the double-fault goal** says what the side view can and cannot see. It uses side-view-measurable evidence (toss forward/back on second serves, contact forward position, rhythm) with the F16 cue and drill progression: slice for UTR 1–3, kick for UTR 4–7 unless a back comfort setting is on. It states that grip and swing direction are best seen from behind, and offers the optional rear "outcomes view". | Research 04 F16 and §7 rule 4; research 03 §10; D1. | COACHING (copy) |
| M8 | **"My coach's focus":** the player can pin a focus their coach gave them, chosen from the library. The engine keeps it (the safety gate still applies) and still reports the evidence. | Reduces coach conflict and makes coaches a channel (research 02 §9.1 B). | COACHING §7 (addition, flagged) |
| M9 | **Season framing:** a pre-season Serve Check, a mid-season check and an end-of-season comparison, with a progress timeline in season weeks. Test the A$39.99 season pass alongside A$99.99 a year. The paywall appears at the first "Did it work?" (research 08 §6, §8). | Seasons are the buying and re-test windows. | Progress tab; paywall |
| M10 | **A pre-match card:** on match day, the current cue and a 5-minute warm-up serve routine. No new focus is introduced. | Keeps the one-focus rule (D6) and ties practice to match night. Delivered in-app in v1; push reminders come with the native shell (D9). | Today tab |
| M11 | **Night capture handling:** a flicker and lux check with an honest downgrade label, plus a recommendation to record the baseline in daylight. | 50 Hz mains and 100 Hz flicker (research 06 §5.2); 250–350 lux courts (research 02 [S41]). | CAPTURE |
| M12 | **Coach and captain sharing by export only:** key frames, a one-page summary and CSV through the share sheet. No accounts and no upload (D8). | D8. research 08 §6. | Sessions tab |
| M13 | **The pain gate and referral** are always on and always free. There are no masters-specific features. | D6, D8. Research 07 (health information is sensitive). | COACHING §10 |
| M14 | **Instrumentation from build one:** in-segment flag; activation; loop completion; W4/W8 retention through a season; match-log share; usefulness rating; paywall cell. | Research 02 Implications #11; research 08 §8. | Analytics (on-device counters until consented) |

### 7.2 Must not

- **Lead with speed or show precise speed or spin.** Speed is `unavailable` by default and experimental range-only when its prerequisites hold. Spin is always `unavailable` (D4). App Store and onboarding copy lead with "a toss you can trust" and "fewer double faults".
- **Claim that practice improved match results.** The match log is a player's own record. Evidence that video feedback adds value over coaching is weak for intermediate players (research 04 [S57]), and match numbers are noisy.
- **Give a serve-in verdict from one session.** Say "too early to tell" with "about N more serves to confirm" (D7).
- **Mix views or data sources.** Side and rear statistics stay separate (D1). Match-log and practice statistics stay separate.
- **Present unvalidated metrics as validated.** Real-footage and radar validation has not happened yet; engine tests are synthetic only. Toss, contact and rhythm metrics carry the `experimental` state and wording until the annotated real-footage study passes (brief; D2; research 08 §8.4 gate 1).
- **Diagnose pain, or claim injury prevention or pain reduction** (COACHING §9.2; research 07).
- **Require an account, upload video, or send data to a cloud AI by default** (D8, D9).
- **Market to juniors or through junior comps.** Associations run junior leagues (AJL had 94 teams in 2022 [N1]). The Children's Online Privacy Code must be registered by 10 December 2026 and its commencement date is not set (research 07). For the closed beta we recommend an 18+ requirement. The under-18 safeguards already specced (COACHING §9.4) remain for public release, pending the privacy owner's call once the Code's commencement is known (flagged).

### 7.3 Spec changes flagged by this decision

1. **CAPTURE §5.5:** add the "second-serve check-in" template (M3).
2. **COACHING §9.2 and §7:** change the onboarding wording and option order (M1); add "My coach's focus" (M8); add the pre-match card (M10).
3. **METRICS and ARCHITECTURE:** add the match-log entity (M6) with `player-entered` status on every field.
4. **Research 08 §6 tier table:** proposal to make **match-log entry free** and keep the **linked season view** (practice versus match trend, "Did it carry over?") in Plus. The reason is that logging is the weekly habit hook for this segment [Our inference; test it with the fake-door cells].
5. **Closed beta: 18+ only** (see §7.2).

---

## 8. Secondary segment: solo court-bookers

- **Who.** Improving adults, about 30–55, who book courts or hit socially but play no organised comp. They are about UTR 1–4 or unrated. Their goal is "more serves in" or "a serve I'm not embarrassed by" [Our inference].
- **Evidence of size and behaviour.**
  - 437,000 players aged 35–54 (research 02 [S4]).
  - Casual players outnumber club members by about 4:1 at TA-affiliated venues. The categories overlap (research 02 [S7]).
  - 66% of active adults do activities they organise themselves (research 02 [S9]).
  - 1M+ online court-hire hours (research 02 [S36]).
  - Hitting-partner groups exist because partners are scarce (research 02 §8).
- **Why second, not first.** Their pain is less urgent and their willingness to pay is lower and more price-sensitive (research 02 §9.1 C). There is no weekly fixture to set a rhythm and no match log hook. Cheap AI apps compete for them (research 01 §7) [Our inference].
- **Why they are the right second segment.**
  - The product is the same: the UTR 1–3 band uses analogy cues, the `first-serves-in` goal leads to toss and contact, and they use the Check-in template (COACHING §9.1–9.2; CAPTURE §5.5).
  - The channels are the same (§6 rows 5–6), and they cover the lower half of the brief's UTR 1–7 range.
- **What changes for them.** Retention needs a different hook from the match log: personal-best toss consistency and a monthly re-test. This is to be designed after the beta [Our inference].
- **Test.** In the soft launch, compare activation, loop completion and download-to-paid between QR and Facebook-group cohorts and the comp cohorts. Hold the price constant.

---

## 9. Risks and cheap tests

Thresholds are ours [Our inference] unless research 08 is cited.

| # | Risk | Cheap test (cost, timing) | Pass signal | If it fails |
|---|---|---|---|---|
| 1 | Comp players rarely practise serves alone. There are no Australian data (research 02 OQ4). | An 8-question survey through 3–5 associations or club newsletters and 2 Facebook groups, run with the Van Westendorp questions. n ≥ 200 (research 08 §8.3). October 2026. | ≥40% practise serves alone at least twice a month | Reposition as "lesson homework plus pre-match routine" through coaches |
| 2 | Doubles players rank the serve below returns and volleys. | The same survey: "Which two shots cost you most points?" | Serve or double faults in the top two for ≥40% | Widen the secondary segment's weight; re-score |
| 3 | Tagging burden weakens outcome statistics (D3). | Time 10 comp players on a clickable tagging prototype; in the beta, log tagging completion. | Median ≤2 s per serve; ≥80% of sessions tagged or tallied | Default to the tally; tag only misses |
| 4 | The mechanics-outcome insight comes back null (research 03 [S28]). | In the beta: the share of eligible sessions (≥6 misses) where the in-versus-miss toss difference clears its interval. | ≥25% of eligible sessions | Demote the insight to a secondary card; lead with process metrics |
| 5 | The side view misses the real second-serve fix (F16). | Beta usefulness rating on second-serve focuses; uptake of the rear view among double-fault-goal users. | Usefulness ≥70% (research 08 §8.2) | Make the rear view the default suggestion for that goal; revisit D1 for it |
| 6 | Metrics are unvalidated on real footage. | ≥60 consented, annotated or radar-paired clips from Serve Check nights and events (research 08 §8.4). | The annotated study meets the METRICS tolerances | Keep the experimental labels; do not publish accuracy claims |
| 7 | Practice happens under lights, which hurts capture. | Flicker and lux checks at 3 lit courts (LED and metal halide), October 2026. Log the beta share of night sessions and their setup success. | Setup success ≥80% (research 08 §8.4) | A stronger daylight nudge; a night-mode capture preset |
| 8 | Volunteer associations won't carry commercial messages. | The §6 row 2 offer to 13 associations. | ≥3 accept within 4 weeks | Go through coaches and captains only |
| 9 | Seasonal churn, and the season pass cannibalising annual plans (research 08 OQ12). | Fake-door paywall cells (annual versus season pass); W4 and W8 retention across a season end. | Annual ≥40% of paid choices (research 08 §8.4 gate 2) | Drop or reprice the pass |
| 10 | Conflict with the player's coach. | 5–10 coach interviews, and a blind agreement study with 2 coaches on 50 clips (research 08 §8.2). | Agreement ≥70%, κ ≥ 0.6 | Tune the priority rules; make M8 prominent |
| 11 | The segment is smaller than estimated (§5). | Ask Tennis Victoria and 5 associations for adult player counts; track the in-segment share of beta installs. | ≥50% of channel installs are in segment | Shift the soft-launch mix towards the secondary segment |
| 12 | UTR 5–7 players expect speed. | Landing-page headline A/B (reliability versus pace) with a small ad spend; count "speed" requests in beta feedback. | The reliability headline converts at least as well | Surface the radar-entry path (D4) earlier |
| 13 | Health exposure from an older, weekly-serving cohort (research 02 [S46]). | Audit every output for diagnosis language before the beta; count pain flags. | 100% of flags show referral guidance (research 08 §8.2) | Block release until fixed |
| 14 | SwingVision adds toss or pose metrics (research 01 §14). | Monthly release-note check; hands-on trial of Max "AI Coaching" (research 01 OQ2). | Not applicable (monitoring) | Lean harder on the coaching loop, honesty, price and Australian channels |

Pennant has its own churn signal. Player retention from the 2022 to the 2023 season was 63.4% for men, 59.7% for women and 60.7% for masters. In 2022 Tennis Victoria also reported many forfeits and withdrawals, and consultation found players were not valuing the competition as it stood, which prompted a review [N1] [Market data]. **Association night comps may be the steadier base** [Our inference; check with test 11].

---

## 10. Scoring

### 10.1 Criteria (1–10, equal weight, total out of 60)

- **Pain / need:** how often the problem occurs, how visible it is, and what it costs now.
- **Willingness to pay:** existing spend, price anchors and stakes.
- **Reachability in Australia:** named, countable, low-cost channels.
- **Size:** the pool and the quality of the evidence behind it.
- **Fit with credible capabilities:** how much of the need is met by side-view measured metrics plus player-entered outcomes, without speed or spin (D1, D4, D5).
- **Defensibility vs SwingVision and coaches:** how durable our advantage is for this segment.

### 10.2 The three proposals and the chosen merge

| Criterion | P1: pennant and night-comp doubles, unreliable second serve | P2: weeknight league and pennant players, UTR 3–7 | P3: double-fault fixers | **Chosen: comp-night regulars (merge)** |
|---|---|---|---|---|
| Pain / need | **8.** Sharp, weekly, public. | **7.** Broader, so it includes players whose serve is not their problem. | **8.** Sharp. | **8.** Keeps the double-fault sharpness and adds first serves in. |
| Willingness to pay | **7.** Strong anchors. | **7.** Adds light money and membership. | **7.** Adds honesty as a purchase reason. | **7** |
| Reachability | **7.** Right channels, less mechanism. | **8.** TROLS, entry windows, ERT (verified). | **8.** Adds Country Week and State League (verified). | **8** |
| Size | **4.** Narrowed by second serve; "most of them" over-reaches. | **5.** Broadest, but one input (WA split) is unverifiable. | **4.** Narrowest; says to measure rather than assume. | **5** |
| Fit with capabilities | **6.** The main fix (grip, swing path, spin) is largely invisible from the side. | **7.** Reliability maps to toss and contact. | **7.** Explicit goal-to-capability argument; honest about F16. | **8.** Leads with the side view's strongest metric; second serve is first-class with an honest rear-view option. |
| Defensibility | **6** | **6** | **6** | **6.** The moat is the mechanics-outcome loop, honesty labels, the side tripod, Australian channels and price. SwingVision could add toss metrics. Coaches are a complement if M8 and channel 1 work. |
| **Total /60** | **38** | **40** | **40** | **42** |

### 10.3 Other candidate segments (research 02 §9)

| Segment | Pain | WTP | Reach | Size | Fit | Defensibility | Total | Role |
|---|---|---|---|---|---|---|---|---|
| **C. Improving adult court-bookers** | 5 | 5 | 5 | 9 | 8 | 5 | **37** | **Secondary** |
| F. Parents of juniors | 6 | 8 | 7 | 6 | 3 | 5 | 35 | Deferred: regulatory blocker |
| D. Regional and rural players | 8 | 5 | 3 | 5 | 6 | 7 | 34 | Sub-cohort of the primary and secondary |
| E. Masters 50–70 | 6 | 7 | 5 | 6 | 4 | 5 | 33 | Deferred as a target; served by the pain gate |
| B. Coaches as payers | 5 | 3 | 9 | 3 | 6 | 6 | 32 | Lead **channel** |
| G. FIFO and shift workers | 5 | 7 | 1 | 2 | 7 | 6 | 28 | Dropped |
| Speed-seekers (UTR 7+, junior big servers) | 5 | 7 | 6 | 3 | 2 | 2 | 25 | Dropped |

A hard blocker overrides the totals. That is why F (child-privacy obligations) does not rank second despite scoring 35.

---

## 11. Why the others lost

### 11.1 The three proposals

All three proposals chose the same core segment, and research 02 §9.2 ranks it first (30 of 35). The decision was about **framing, evidence quality and fit**.

- **Proposal 1 (unreliable second serve).**
  - *Kept:* the season pass; the pre-match routine; night-capture handling; the coach referral fee; the offer of a rear view to double-fault players.
  - *Dropped:*
    - defining the segment by the second serve alone, whose main fix (grip, sideways path, spin) the side view barely sees and D4 marks unavailable;
    - the unsupported step from vendor averages to "most of them";
    - the 12+12 session, which is replaced by the CAPTURE §5.3 block of 15 per stratum.
- **Proposal 2 (weeknight league and pennant players).**
  - *Kept:* the broad reliability framing (first serves in plus second serves); the TROLS association channel and entry-window timing; the scale arithmetic and the "lean business, not a large company" verdict; the expansion path.
  - *Dropped:*
    - the WA adult league split (5,538 / 3,317), which we could not find;
    - the ages 25–30, which have no evidence behind them;
    - the per-side split in the match log, because friction matters more than granularity there.
- **Proposal 3 (double-fault fixers).**
  - *Kept:* the goal-to-capability argument; the one onboarding question, measured as a segment test; the most honest risk list (null mechanics-outcome link, side-view blind spot, pennant retention of about 60%, video-feedback evidence); the adult-only boundary; the speed-copy rule.
  - *Dropped or corrected:*
    - "double faults" as the default preselected answer, since a preselected default biases the segment measure;
    - its paraphrase of the Tennis Victoria report. The report calls tennis the second-highest *organised* participation sport; the "needs a partner" wording is not in the text we read [N1].
- **Why the merge scores highest.** It keeps the sharp weekly pain of P1 and P3. It frames the promise around what one side-on phone measures best, toss and contact, which gives the best fit. It uses P2's more concrete, verified reach mechanism [Our inference].

### 11.2 Other segments

- **Coaches (B)** are the best channel but a weak paying segment. Many already pay A$30–60 a month for OnForm (research 08 §2.4), so the model is free seats with the student paying.
- **Regional players (D)** have the most pain and the fewest alternatives, but they are the hardest to reach cheaply (research 02 §9.2). They also bring capture variance: sand-filled artificial grass (SFAG) with sandy lines, and grass courts (research 02 §6.2). They enter through Country Week (1,293 players in 2023 [N1]) and regional associations, and are tracked as a beta sub-cohort.
- **Masters (E)** often bring a physical problem first. Pain notes are sensitive health information and push the product towards being a "health service" (research 07). Masters comps (for example Metro Masters on TROLS [N4]) will arrive through primary channels and be handled by the pain gate, not by masters-specific features. That comes after clinician-reviewed copy (research 02 Implications #9).
- **Parents of juniors (F)** have the highest willingness to pay, but they bring the Children's Online Privacy Code (registration due by 10 December 2026, commencement not yet set), junior norms, and higher lumbar risk (research 07; research 03 [S38]; COACHING §9.4). This would delay v1.
- **Speed-seekers** want km/h and spin. Spin is always unavailable, and speed is unavailable by default (D4). SwingVision already sells speed and placement (research 01 §3), so this segment is our weakest fit against the incumbent's strongest ground.
- **FIFO and shift workers (G)** have no tennis channel, and the only sizing dates from 2012 (research 02 [S48]).

---

## 12. Open questions

1. What is the actual adult comp headcount by state and association? Request it from Tennis Victoria, Tennis West, Tennis ACT and 5 Melbourne associations (research 02 OQ2).
2. How often do comp players practise serves alone, and at what time of day? Answered by §9 tests 1 and 7.
3. Does the match-log habit survive the end of a season, and is its entry better free or paid? Answered by §9 test 9 and the §7.3 item 4 cells.
4. Should the closed-beta 18+ requirement carry into public release? This depends on the Children's Code commencement date (research 07).
5. Is the secondary segment's conversion viable at A$99.99, or does it need a lower annual cell (A$79.99, research 08 §6)?

---

## 13. Sources and verification

**Research documents** are cited as (research NN [Sx]). Their own verification logs apply.

**Web sources re-checked for this decision (accessed 27 September 2026):**

- **[N1]** Tennis Victoria. *Annual Report 2022–23.* Text extracted locally with pdftotext. https://www.tennis.com.au/vic/files/2023/10/Tennis-Victoria-Annual-Report-2022-23-1.pdf. Confirmed:
  - 2022 Pennant: 137 clubs, 388 teams, 3,808 players; the report elsewhere says 392 teams in a 14-week 2022 season, an internal inconsistency;
  - retention 63.4% (men), 59.7% (women), 60.7% (masters), 2022 to 2023;
  - 402 teams across 22 grades in 2023;
  - the 2022 forfeits and withdrawals, and the players-not-valuing-the-competition finding;
  - Country Week 2023: 205 teams, 1,293 players;
  - State League Championships April 2023: 72 teams from 18 associations;
  - 372,400 Victorian adults played in 2022, per AusPlay; tennis is the second-highest organised participation sport;
  - AJL 2022: 94 teams.
- **[N2]** Eastern Region Tennis. *About us.* https://ertinc.au/about-us. 80 affiliated clubs and 4,000+ players; seniors and juniors. The page states no season months.
- **[N3]** Whites Lane Mulgrave Tennis Club. *WDTA Night Tennis.* https://play.tennis.com.au/whiteslanemulgravetennisclub/Competitions/WDTANight. Monday to Thursday from 7:30 pm; doubles, singles/doubles and singles; light money A$8 / A$9 / A$10 per person per week; financial club membership required.
- **[N4]** TROLS. Home page. https://trols.org.au/. 12 suburban Melbourne associations listed.
- **[N5]** North Eastern Night Tennis Group on TROLS. https://trols.org.au/nentg/index.php. 41 sections; spring 2026 season commenced Monday 3 August.
- **[N6]** SA Department for Trade and Investment. "Tennis AI smartphone app" (21 October 2020). https://dti.sa.gov.au/articles/tennis-ai-smartphone-app. Adelaide-built; analyses uploaded match and training footage; A$10 a month.
- **[N7]** Tennis Victoria. 2026 Pennant rule changes, rules and Pennant page. **Search-result excerpts only; the pages returned 403. UNVERIFIED.** https://www.tennis.com.au/vic/files/2026/02/2026-TV-Pennant-Rule-Changes-and-FAQs.pdf; https://www.tennis.com.au/vic/doc/2026-pennant-rules; https://www.tennis.com.au/vic/compete/leagues/pennant. Excerpts: "over 400 teams, 140 clubs and over 3500 players"; UTR is the primary grading method, using base players' singles and doubles UTR; 0.50 UTR playing-order variance; teams of 4–6 players.

**Proposal facts not used, because they could not be re-checked:**
- Tennis West league 5,538 / 3,317 players (search found nothing; the page returned 403);
- BDNTA fees and entry dates;
- Melba Tennis Club membership fee;
- Tennis Brisbane League grading;
- ERT season months (not on the page we fetched).
