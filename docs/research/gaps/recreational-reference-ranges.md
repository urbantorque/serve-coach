# Gap: recreational reference ranges for serve timing and position (UTR 1–7)

Date: 2026-09-27. Status: research complete; bands are provisional until our own annotated data replace them (protocol in Section 9).
Scope: the D5 hero metrics (toss apex spread, drop from apex to contact, contact height ratio, release-to-contact time and its spread, landing distance), the fault thresholds that depend on them (research 04 §6: F3, F4, F12, F18), and the vertical capture envelope behind D1.

Evidence tags: **[Established]** = a measured value reported by the cited study. **[Coaching interpretation]** = expert teaching advice, not measured. **[Our inference]** = our calculation or judgement, including values derived arithmetically from published means. Existing sources are cited as (research NN [Sx]); new sources are numbered [N1]–[N22] (list at the end).

---

## 0. Bottom line

1. **Non-elite data exist, but they are thin.** About a dozen studies give usable toss, contact or timing numbers for non-elite or mixed-level players. Only five contain adults who are clearly novice or recreational: Girard 2005 and 2007 (beginners), Carboch & Hrychová 2022 and 2025, Shafizadeh et al. 2025, and Caprioli et al. 2025. Only one reports a separate group over 40 (Shafizadeh; timing only). **No study reports within-player toss-apex SDs for recreational players, and none reports landing distance for any population.**
2. **Contact height barely separates levels.** Values as a percentage of standing height:
   - novices (under 1 year of play): about 143–146% (research 03 [S6][S7]);
   - club, hobby and experienced players: about 144–149% (research 03 [S7][S29]; research 05 [S47]; [N1]);
   - elite players: about 147–156% (research 03 [S6][S7][S27]; [N4][N8]).

   The between-player SD within a level (5–7 percentage points) is as large as the gap between levels. A "low contact" (F12) flag therefore needs a low absolute threshold and should lean on player-relative change. [Established values; interpretation is Our inference]
3. **Drop from apex to contact depends on sex, even at elite level.**
   - High-performance and junior-national men: 0.56–0.72 m (research 03 [S27][S28]).
   - Professional and elite junior women in three samples: 0.82–1.11 m [N4][N5][N17]. One WTA player in match play dropped 0.46 m [N16].
   - Competitive women: 1.14 ± 0.18 m [N1].
   - The two recreational women measured: 0.82 m and 1.41 m [N1].
   - Experienced club men: only 0.37 m (research 03 [S29]).

   **A single F4 ("toss too high") threshold would flag most competent women.** Thresholds must be sex-specific. [Our inference from Established values]
4. **Recreational release-to-contact time matches elite time.** Recreational players took about 0.97 s (young adults) and 0.91 s (adults over 60) [N3], against 0.97 ± 0.10 s in high-performance men (research 03 [S27]). Toss physics predicts 0.77–1.21 s across the published non-elite toss geometries. The within-player SD is about 45–55 ms (a CV of about 5–6%) [N3, derived]. Lower-skill players take longer to reach the trophy position and have longer, more variable preparation phases [N9][N10]. **No direct measurement of a trophy "pause" in recreational adults was found.**
5. **The highest plausible recreational toss is about 3.9–4.1 m at the 95th percentile of serves, 4.1–4.3 m at the 99th, and 4.4–4.6 m for tall, high-tossing players.** The highest per-player mean observed was 4.00 m, from a recreational woman on the serves she netted [N1]. [Our inference]
6. **D1 does not reliably frame this envelope.** In its near and low configurations the top of the frame sits at 3.2–3.7 m at the server, which is below a typical recreational apex (about 3.4–3.6 m). For right-handers serving from the deuce court in singles, only 1 of 18 D1 combinations frames 4.5 m. For doubles serving positions on the deuce court, none do. Section 6 recommends measuring the distance to the server rather than to the centre mark, using a 1.5–1.8 m phone height, allowing a measured up-tilt of 5° or less, and adding a live headroom check. **This conflicts with D1's wording and is flagged to the product lead.**

**Provisional bands** (details, derivations and fault rules are in Section 7). Every band is [Our inference] and experimental.

| D5 hero metric | Low | Typical (UTR 1–7) | High | Edge uncertainty until our own data |
|---|---|---|---|---|
| Toss apex vertical spread (within-player SD, same stratum, n ≥ 10) | < 8 cm (tight) | 8–20 cm | > 20 cm (scattered) | ±50% |
| Toss apex forward/back spread (side view, within-player SD) | < 10 cm | 10–25 cm | > 25 cm | ±50% |
| Drop from apex to contact, men | < 0.30 m | 0.30–1.00 m | > 1.00 m | ±0.15 m |
| Drop from apex to contact, women | < 0.40 m | 0.40–1.25 m | > 1.25 m | ±0.15 m |
| Drop, sex not given | < 0.30 m | 0.30–1.25 m | > 1.25 m | ±0.15 m |
| Contact height ÷ standing height | < 1.38 | 1.38–1.54 | > 1.54 (> 1.62 = check the entered height) | ±0.03 |
| Release-to-contact time | < 0.80 s (quick) | 0.80–1.20 s | > 1.20 s (unhurried) | ±0.05 s |
| Release-to-contact spread (within-player SD) | < 40 ms (tight) | 40–90 ms | > 90 ms (variable) | ±15 ms |
| Landing distance inside the baseline (front foot) | < 0.15 m (< 10% of height) | 0.15–0.90 m (10–50%) | > 0.90 m (> 50%) | ±0.25 m (no literature at all) |

---

## 1. Method and search log

- **Read first:** DECISIONS D1, D5 and D7; research 03 §5, §8 and §9; research 04 §6; research 05 §6; research 06 §3.2, §3.3 and §7.2.
- **Search sources:**
  - Europe PMC REST: queries on tennis serve × toss, impact, landing or stance × recreational, amateur, club, novice, beginner, intermediate, veteran or skill level.
  - PubMed E-utilities, for abstracts Europe PMC truncated.
  - OpenAlex search and works API, for bibliographic details and abstracts.
  - Semantic Scholar API, which was rate-limited after two queries.
  - The ISBS proceedings archive search (ojs.ub.uni-konstanz.de/cpa): "tennis serve toss", "recreational", "novice", "landing", "club".
  - General web search.
  - The Internet Archive, for the Carboch & Hrychová 2022 PDF: the publisher's DOI link resolves to a 404 page, and the archived copy of 3 January 2025 was read.
- **Full texts read:**
  - Carboch & Hrychová 2022 (research 05 [S47]) and both 2025 companion papers [N1][N2]
  - Seven ISBS papers: [N4][N5][N6][N16][N17][N19] and the 2014 conference version of [N22]
  - Shafizadeh et al. 2025 [N3]
  - Girard et al. 2007 (research 03 [S7], Table 1)
  - Mendes et al. 2013 (research 03 [S29], Table 1)
  - Hornestam et al. 2021 (research 03 [S8])
  - Menayo/Antúnez et al. 2012 (research 03 [S30])
  - Newton et al. 2025 (research 03 [S27], Tables 1–2)
  - Vacek et al. 2025 (research 03 [S28])
  - Caprioli et al. 2025 (research 03 [S61])
  - Chen et al. 2024 [N8], Liang et al. 2023 [N10], Mizuno & Masaki 2024 [N11], Hartoto et al. 2021 [N7]
  - The Special Olympics coaching guide [N21]
- **Abstract only:**
  - Girard et al. 2005 (research 03 [S6]); the publisher page returned HTTP 402.
  - Whiteside et al. 2013, age effects (research 03 [S22]); no toss values in the abstract.
  - Wang, Lo & Su 2021 (research 03 [S46]); no toss or timing values.
  - Zhou et al. 2026 (research 04 [S33]); no landing distance.
  - Reid, Elliott & Alderson 2008 (research 03 [S9]).
  - Tubez et al. 2021 [N9], Martin et al. 2012 [N13], Carboch, Tufano & Süss 2018 [N14], Vacek et al. 2023 [N15] (MDPI returned 403), Pan et al. 2025 [N12], Girard et al. 2010 [N18].
- **Not accessible:** Elliott & Wood 1983 (the Australian foot-up vs foot-back paper).
- **Myers et al. 2017** (research 06 [S4]): the validity sample was 33 non-professional players (college, high school or recreational; the poor-mechanics group was older, 38 ± 16 years, and mostly women). The paper reports no toss, contact, timing or landing values; it used observational yes/no nodes only.
- **Rule used for this file:** where a quantity is not reported, it is marked **none found**, and derived numbers are labelled as derived. No video was downloaded.

### 1.1 How the studies define "level" (their own words, paraphrased)

| Study | Sample | Level as defined by the authors | Our rough overlap with UTR 1–7 [Our inference, unverified] |
|---|---|---|---|
| Girard 2007, research 03 [S7] | 30 men, 21.3 ± 3.8 y, 179.7 ± 7.0 cm | Beginner = ITN 9: irregular competition, regularly active in sport, 0.9 ± 0.1 y of practice (n = 7). Intermediate = ITN 5: good club players with many years of competition (n = 10). Elite = ITN 2: national level (n = 13) | Beginner ≈ UTR 1–2; intermediate ≈ UTR 6–8 |
| Girard 2005, research 03 [S6] | 32 players | Beginner, intermediate and elite; the abstract gives no ITN definition | As above (probably the same scheme) |
| Carboch & Hrychová 2022, research 05 [S47] | 2 hobby men (both 180 cm, 66 and 75 kg) vs 8 competitive men (25.1 ± 5.4 y, 183.4 ± 5.9 cm, national rank 439 ± 255) | Hobby: played team tennis only at ages 12–13, now plays about 4 times a month. Serve speeds 142 and 127 km/h | Hobby ≈ UTR 4–6; competitive ≈ UTR 8–10 |
| Carboch & Hrychová 2025 [N1][N2] | 2 recreational women (18 y, 165 and 173 cm) vs 8 competitive women (22.0 ± 3.6 y, 168.4 ± 4.3 cm, national rank 51 ± 48) | Recreational: junior team tennis at ages 9–14, now about 4 times a month. Recreational speed 130.2 ± 2.7 km/h | Recreational ≈ UTR 3–5 |
| Shafizadeh 2025 [N3] | Young adults: 10 (5 men, 5 women), 24.5 ± 3.3 y. Older adults: 11 (8 men, 3 women), 71.6 ± 5.6 y | Self-defined non-competitive recreational (sub-elite) players, 2–3 sessions a week; 6.8 and 31.8 y of experience | ≈ UTR 2–6 |
| Mendes 2013, research 03 [S29] | 12 men, 25.2 ± 3.9 y, 1.77 ± 0.06 m | "Experienced": 16.3 ± 5.6 y of play, 13.7 ± 4.3 y competitive | ≈ UTR 6–9 |
| Hartoto 2021 [N7] | 9 players (sex not stated), 20.8 ± 5.0 y (15–31), 171.7 ± 11.1 cm (153–183) | At least 10 years of play and still active. Ball speed only 80 ± 16 km/h (Bushnell radar) | Unclear |
| Caprioli 2025, research 03 [S61] | 13 amateurs (4 women, 9 men), 35 ± 15 y, 173 ± 10 cm | Amateurs with 6.2 y of experience | ≈ UTR 2–5 |
| Liang 2023 [N10] | 25 female college players | Level 1 = national level-1 athletes. Level 2 = national level-2. Level 3 = tennis-class students with at least 1 year of training (168.5 cm) | Level 3 ≈ UTR 3–6 |
| Mizuno & Masaki 2024 [N11] | 40 university players (23 men, 17 women), 20.0 ± 1.2 y | More than 3 years of play; mostly intercollegiate (34), some regional (6) | ≈ UTR 6–9 |
| Hornestam 2021, research 03 [S8] | 32 juniors, 13.8–14.3 y | "Intermediate" junior competitors | Juniors, not adults |

---

## 2. (a) Toss: release, apex, drop and within-player spread

### 2.1 Release height (ball leaves the hand)

| Study | Group | Release height | % of standing height | Method |
|---|---|---|---|---|
| Mendes 2013, research 03 [S29] | 12 experienced men; flat 1st serve; deuce court; no-wind condition | 180.2 ± 8.1 cm (group SD as tabulated; not a within-player SD) | 102% [Our inference: 180.2 ÷ 177] | 3D, two cameras at 210 Hz (sagittal 7.0 m away, frontal 3.6 m away) |
| Hartoto 2021 [N7] | 9 players; fastest legal flat serve per player | 165.8 ± 25.4 cm (range 120–211) | 97% (group means) | 2D Kinovea; frame rate not stated |
| Chen 2024 [N8] | 5 national vs 5 provincial women (1.70 m); slice serves, 1st and 2nd, foot-up | 1.64 ± 0.13 m (national 1st), 1.59 ± 0.16 m (provincial 1st) | 93–97% | 3D DLT, two cameras at 1000 Hz, 8 m to the side, 1.5 m high |
| Guo & Zhou 2015 [N16] | 2 WTA players in a match | 1.70 m and 1.58 m | ≈ 97% and 94% | 3D video (context only) |

- Toss release speed: 5.94 m/s (range 5.22–6.24) in 8 elite junior women [N5]; 6.2 m/s for one WTA top-10 player [N17]. [Established]
- **Coaching interpretation:**
  - release about eye height with a straight arm (research 04 [S67]);
  - let go when the hand reaches its highest point, and toss high enough to reach the ball with an extended racket [N21].

  Measured means (93–102% of standing height, roughly head height) agree with the eye-level advice. [Our inference]
- Adults over 40, novices, and within-player SD of release height: **none found**.

### 2.2 Apex (zenith) height

| Study | Group | Apex | % of standing height [Our inference unless stated] | Notes |
|---|---|---|---|---|
| Mendes 2013, research 03 [S29] | Experienced men | 298.0 ± 28.1 cm (group SD) | 168% | Lowest group mean found |
| Hartoto 2021 [N7] | Mixed, fastest serve | 337.1 ± 23.9 cm (306–380) | 196% | 1 serve per player |
| Carboch & Hrychová 2025 [N1] | Recreational women, serves that went in | Player 1: 339.0 cm. Player 2: 382.2 cm (her net faults averaged 400.2 cm) | 196–232% (the paper does not say which player is 165 cm and which 173 cm) | 200 Hz side view, 2D, origin at the front toe, 40 flat 1st serves each to the T from the deuce court |
| Carboch & Hrychová 2025 [N1][N2] | Competitive women, serves that went in | 357.2 ± 21.6 cm (between-player; players 326.6–375.6) | 212% | Serves that went wide were tossed about 5 cm lower (351.7 ± 21.9 cm; p < 0.05) [N2] |
| Elliott et al. 2013 [N4] | 8 professional women (169.2 cm), flat 1st serves | 336 ± 16 cm | 199% (the authors report "2.0" for women and about 1.85 for men) | 3D, Vicon at 500 Hz. The male comparison value is 338 cm |
| Liu et al. 2000 [N5] | 8 elite junior women (19 y) | 3.35 m (range printed as 2.92–3.39 m; the printed SD row is internally inconsistent) | — | 3D at 120 fps; old scanned table |
| Newton 2025, research 03 [S27] | 10 HP men (UTR 10.7) | 347.7 ± 24.0 cm | 186% | Context |
| Vacek 2025, research 03 [S28] | 13 junior men | 3.40 ± 0.24 m | 188% | Context; successful and faulted serves were identical |
| Sun et al. 2012 [N17]; Guo & Zhou 2015 [N16] | Single WTA players | 3.65 m; 3.12 m and 3.53 m | 216%; 178% and 210% | Context |

- **What this means [Our inference]:**
  - Group means span 3.0–3.6 m (168–213% of stature).
  - Recreational players are not systematically lower than elite players. The two recreational women tossed as high as or higher than competitive women [N1], and the lowest mean came from experienced club men.
  - Women toss higher relative to their stature (about 199–213%) than men (about 168–188%). Hartoto's mixed-sex sample was 196%.
- **Coaching interpretation:**
  - toss so the apex sits about 30 cm (1 ft) above full racket reach (research 04 [S68]);
  - toss just high enough to reach with an extended racket [N21].
- **Adults over 40, and kick vs flat apex height in recreational players:** none found.
- **Professionals** (Carboch, Tufano & Süss 2018 [N14]; 15 men, 400 Hz receiver view): the kick toss peak and contact were 18–21 cm and 30–35 cm further to the side than for flat and slice serves. The abstract reports no difference in height. [Established]

### 2.3 Drop from apex to contact

| Study | Group | Apex − contact | Fall time [Our inference: √(2d/g)] |
|---|---|---|---|
| Mendes 2013, research 03 [S29] | Experienced men | 0.37 m (from group means: 298.0 − 261.2) [Our inference] | 0.27 s |
| Newton 2025, research 03 [S27] | HP men | 0.56 m (347.7 − 291.5) | 0.34 s |
| Elliott 2013 [N4] (male reference inside the paper) | Pro men | 0.64 m (338 − 274) [Our inference] | 0.36 s |
| Vacek 2025, research 03 [S28] | Junior men | 0.72 ± 0.19 m (reported) | 0.38 s |
| Hartoto 2021 [N7] | Mixed | 0.78 m (337.1 − 258.8) [Our inference] | 0.40 s |
| Elliott 2013 [N4] | Pro women | 0.82 m (336 − 254) [Our inference] | 0.41 s |
| Carboch & Hrychová 2025 [N1] | Recreational women, serves that went in | 0.82 m (339.0 − 257.5) and 1.41 m (382.2 − 241.2) [Our inference] | 0.41 s and 0.54 s |
| Liu 2000 [N5] | Elite junior women | 0.94 m (range 0.61–1.55); ball falling at 4.23 m/s at contact (reported) | 0.44 s |
| Guo & Zhou 2015 [N16] | Two WTA players | 0.46 m and 0.91 m (reported; slightly inconsistent with their own apex and contact means) | 0.31 s and 0.43 s |
| Sun 2012 [N17] | One WTA top-10 player | 1.11 m (reported) | 0.48 s |
| Carboch & Hrychová 2025 [N1] | Competitive women, serves that went in | 1.14 ± 0.18 m between players (range 0.84–1.36 m) [Our inference, per-player differences] | 0.48 s |

- **Established:** in two samples the drop did not differ between serves that went in and serves that faulted: junior men (research 03 [S28]) and competitive women, where the toss peak and contact height on serves that went in, went long or hit the net were almost identical [N2]. Competent servers therefore live with a large drop without penalty.
- **Coaching interpretation:** a toss that is too high makes players hit the ball on the way down (research 04 [S68]), and a very high toss may encourage a pause at the trophy position (research 03 [S27] discussion, citing Whiteside 2013).
- **Our inference:** the 30 cm cue implies a drop of about 0.3 m. That matches the low end of the male data but is about a third of the typical female drop. It is a teaching target for players who toss very high, not a norm.

### 2.4 Within-player spread of apex position

| Study | Group | Vertical SD | Forward/back SD | Lateral SD | Notes |
|---|---|---|---|---|---|
| Whiteside, Giblin & Reid 2014 (research 06 [S8]) | 8 professional women × 5 serves | 6.0 cm | 7.2 cm | 6.6 cm | Contact height SD 3.5 cm. The only within-player apex SDs found |
| Mendes 2013, research 03 [S29] | 12 experienced men × 20 serves (no wind) | 28.1 cm | 15.2 cm | 15.8 cm | **Group SDs as tabulated**; they include differences between players, so they are not within-player SDs |
| Carboch & Hrychová 2025 [N1] | 2 recreational women | Not reported. Means by outcome for player 2 span 377.7–400.2 cm (22.5 cm); for player 1, 339.0–342.0 cm | Means by outcome span 1.8–8.1 cm (player 1) and 3.4–12.7 cm (player 2) | — | Only per-outcome means are published |
| Carboch & Hrychová 2022 (research 05 [S47]) | 2 hobby men vs 8 competitive men | Toss not tabulated (see Section 10). **Contact height** within-player SD on serves that went in: 3.6 and 2.9 cm (hobby); 3.0–8.8 cm, median 4.1 (competitive) | **Contact forward** SD: 13.2 and 12.4 cm (hobby); 5.4–24.0 cm, median 7.9 (competitive) | — | 200 Hz side view |

- Within-player SDs of apex position for recreational adults, novices, women or adults over 40: **none found**. [Established that the gap exists]
- **Established:** experienced and professional servers stabilise the vertical toss dimension and let forward and lateral position vary. Mendes 2013 (research 03 [S29]) reported CVs of 0.2–1.2% for each player's contact-height ratio across the wind conditions. Contact height is the most repeatable quantity in every sample that reports it: about 3–4 cm SD.
- **Our inference:** contact height is a better "consistency" signal than apex height when detection is good. Apex height SD is still the more coachable, visible metric, and the only one not affected by racket occlusion.

---

## 3. (b) Contact (impact) height as a percentage of standing height

| Study | Group (sex, age, level) | Serve | Contact ÷ height | Method |
|---|---|---|---|---|
| Girard 2005, research 03 [S6] | Beginners vs elite (32) | Power (flat) serve | **142.6 ± 4.7%** vs 149.2 ± 2.7% | Video; force plate |
| Girard 2007, research 03 [S7] | Men: ITN 9 beginners (n = 7), ITN 5 intermediate (n = 10), ITN 2 elite (n = 13) | Flat 1st serve, deuce court, 10 fastest of 15 | **145.9 ± 7.2%**, **148.4 ± 5.4%**, 147.5 ± 3.8% (normal serves). With a knee splint: 144.4, 146.3, 145.3% | 50 Hz lateral camera against a 10 cm yarn grid; racket height at impact |
| Carboch & Hrychová 2022, research 05 [S47] | Hobby men (180 cm) vs competitive men (183.4 cm) | Flat 1st serve, deuce court, to the T | 266.6 cm (**148%**) and 260.4 cm (**145%**) vs 272.9 ± 11.2 cm (149%) [% is Our inference] | 200 Hz side view, 2D |
| Carboch & Hrychová 2025 [N1] | Recreational women (165 and 173 cm) vs competitive women (168.4 cm) | As above | 257.5 and 241.2 cm (**139–156%**; which player is which height is unknown) vs 242.9 ± 13.9 cm (**144%**) | As above. Recreational women contacted 8.8 cm **higher** than competitive women; the reverse of the male study |
| Mendes 2013, research 03 [S29] | Experienced men | Flat 1st serve, deuce court | **147.8%** (players 141.1–153.8%) | 3D at 210 Hz |
| Hartoto 2021 [N7] | Mixed | Fastest flat serve | 258.8 ± 26.5 cm (220–296), **151%** from group means | 2D |
| Otsuka & Fujii 2014 [N6] | 4 Japanese university men (1.68–1.73 m) | Flat, slice and kick to the T | Single trials 2.35–2.58 m (≈ 136–154%) | Vicon at 500 Hz |
| Mizuno & Masaki 2024 [N11] | University players (23 men, 17 women) | **2nd serves** to the wide target | 2.46–2.51 ± 0.13–0.15 m (stature not reported) | 250 fps sagittal view, 9 m away |
| Chen 2024 [N8] | National and provincial women (1.70 m) | Slice 1st and 2nd serves | 2.61–2.63 m (**153–155%**) | 3D at 1000 Hz |
| Elliott 2013 [N4] | Professional women | Flat | 254 ± 7 cm (**150%**; the authors say the same as men) | Vicon |
| Newton 2025, research 03 [S27]; Vacek 2025, research 03 [S28] | HP men; junior men | Flat | 291.5 cm (156%); 2.68 m (148%) | Context |
| Hornestam 2021, research 03 [S8] | Juniors aged 13–14 | Flat | "Normalised racket height" 122.6 ± 5.3% and 124.5 ± 3.2% | IMU on the racket. **Not comparable** (a different reference point) |

- **Women:**
  - Recreational women: 139–156% (n = 2) [N1].
  - Competitive women: 144% [N1].
  - National, provincial and professional women: 150–155% [N4][N8].

  Female ratios are not lower than male ratios.
- **Adults over 40:** **none found** for contact height. Shafizadeh et al. report timing only [N3].
- **Novices:** only the Girard beginner groups (142.6% and 145.9%).
- **Flat vs kick:**
  - In 3D studies of elite players, kick contact is further back and nearer the body midline (research 03 [S19]: 8.7 cm back and 21.1 cm medial, relative to the shoulder; research 03 [S35]: flat contact about 17 cm further forward).
  - A systematic review found kick contact further left than flat contact (right-handers), by 188% in professional men and 88% in junior men [N15].
  - Contact **height** by serve type in non-elite players: **none found**. Otsuka's four players showed no clear kick-vs-flat height difference in the trials tabulated [N6].
- **Forward contact position (side view), which the D3 insights need:**
  - amateurs: 18 cm in front of the front toe (20 ± 25 cm and 17 ± 24 cm in two sets of 5 serves each; the SD is not within-player; research 03 [S61]);
  - recreational women: 9–11 cm; competitive women: 54 ± 13 cm [N1];
  - hobby men: 24 and 68 cm; competitive men: 62 cm (research 05 [S47]);
  - experienced men: 50 ± 15 cm (research 03 [S29]);
  - professional women and men: 61 cm and 78 cm [N4].

  Toss apex forward position: recreational women 3–4 cm; competitive women 37 ± 11 cm [N1]; professional women 49 ± 4 cm [N4]. [Established]
- **Our inference:**
  - Recreational players toss and hit much closer to the baseline than competent players, often almost straight above the front toe.
  - "Forward placement" separates levels far better than contact height does.
  - It is a strong candidate for the D3 per-serve insight (for example, "serves that went in had a toss 12 cm further forward").

---

## 4. (c) Timing: release to contact, release to apex, spread and trophy pause

### 4.1 Published values

| Study | Group | Quantity | Value | Method |
|---|---|---|---|---|
| Shafizadeh 2025 [N3] | Recreational young adults (n = 10) and older adults (n = 11) | Backswing (ball release to the end of maximum shoulder external rotation) | 820 ± 188 ms (young); 776 ± 100 ms (older) | GoPro at 240 fps, 1080p, 45° front-left view from near the net; 20 serves each of one self-chosen type (flat, slice or topspin) as a first serve; manual frame-by-frame in Simi |
| | | Acceleration (racket starts upward to contact) | 149 ms; 130 ms (SDs printed as 0.05 and 0.03; units unclear) | |
| | | **Release to contact, derived** (backswing + acceleration) | **≈ 0.97 s (young); ≈ 0.91 s (older)** [Our inference] | |
| | | Within-player CV: backswing; acceleration; whole serve | 6.2% and 5.5%; 14.3% and 11.4%; 9.8% and 4.8% (young; older) | CV across 20 serves. Older players were **less** variable; group differences in mean timing were not significant |
| | | **Within-player SD of release to contact, derived** | **≈ 55 ms (young); ≈ 45 ms (older)**, assuming independent phases [Our inference] | |
| Newton 2025, research 03 [S27] | HP men | Release to impact; release to trophy | 0.97 ± 0.10 s; 0.62 ± 0.11 s (so trophy to impact ≈ 0.35 s) | Vicon at 250 Hz. Raising the toss lengthened the serve to 1.05 s |
| Tubez 2021 [N9] | Adults ITN 1 (n = 8); teenagers ITN 3 (n = 8); children ITN 5–6 (n = 8) | Racket high point ("trophy") before impact | 0.36 ± 0.11 s; 0.33 ± 0.05 s; **0.54 ± 0.10 s** | 3D motion capture |
| Liang 2023 [N10] | College women, levels 1–3 | Take-off preparation phase (foot-up) | 0.90 ± 0.07 s (level 1); 1.16 ± 0.07 s (level 2); **1.55 ± 0.37 s** (level 3, students) | Vicon at 250 Hz with a force plate |
| | | Flight time; jump height | 0.29, 0.25, 0.23 s; 0.11, 0.08, 0.07 m | |
| | | Landing phase | 0.14, 0.16, 0.12 s | |
| Girard 2005, research 03 [S6] | Beginners vs elite | Preparation phase; concentric phase | Preparation **longer** in elite; concentric **shorter** in elite (values not in the abstract) | Force plate |

- **Release to apex:** **none found** measured directly in non-elite players. Derived from toss geometry [Our inference]:
  - 0.49 s (Mendes men, a 1.18 m rise);
  - 0.59 s (Hartoto, 1.71 m);
  - about 0.60–0.67 s for the Czech recreational women (assuming a 1.6 m release);
  - 0.53–0.64 s from the measured release speeds of 5.2–6.2 m/s [N5][N17].
- **Within-player SD of release to apex:** **none found**.
- **Trophy pause:** no direct measurement of a pause (the time the racket stays still at the trophy position) in recreational adults was found. **None found.** The proxies point one way:
  - less-skilled servers reach the trophy earlier relative to impact [N9];
  - lower-level players spend longer in preparation [N10];
  - HP players can absorb a higher toss without pausing (research 03 [S27]).

  That beginners pause "waiting for the ball" is [Coaching interpretation / hypothesis] (research 03 [S27], citing Whiteside 2013). A long pause lowering internal-rotation speed by about 20% is cited in research 03 [S2].

### 4.2 Physics check of timing against the toss geometry [Our inference]

t(release to contact) = √(2·rise/g) + √(2·drop/g), ignoring drag. Drag is about 7% of g at 6 m/s: it lowers a 6 m/s toss by about 6 cm and shortens the rise by about 15 ms, and is negligible near the apex.

| Toss geometry source | Rise | Drop | Predicted release to contact |
|---|---|---|---|
| Mendes experienced men | 1.18 m | 0.37 m | 0.77 s |
| HP men (research 03 [S27]; release assumed 1.9 m) | 1.58 m | 0.57 m | 0.91 s (measured: 0.97 s) |
| Hartoto | 1.71 m | 0.78 m | 0.99 s |
| Recreational woman 1 (release assumed 1.6 m) | 1.79 m | 0.82 m | 1.01 s |
| Elite junior women (5.94 m/s release) | 1.80 m | 0.94 m | 1.04 s |
| Competitive women (release assumed 1.6 m) | 1.97 m | 1.14 m | 1.12 s |
| Recreational woman 2 (release assumed 1.6 m) | 2.22 m | 1.41 m | 1.21 s |

The predicted range of 0.77–1.21 s brackets the measured recreational values (0.91–0.97 s), so the typical band 0.80–1.20 s is consistent with both evidence lines.

---

## 5. (d) Landing: front-foot distance, direction and balance

**None found.** No study reports front-foot landing distance inside the baseline, in metres or as a percentage of height, for any population or stance, including the elite. The searches covered every item on the priority list plus Spanish-language terms. Elliott & Wood 1983 (the foot-up vs foot-back paper) could not be accessed. Related findings follow; none gives a distance.

| Study | Finding | Tag |
|---|---|---|
| Zhou et al. 2026 (research 04 [S33]) | 15 amateur vs 15 elite men, pinpoint serves. Amateurs used a stiffer, reactive braking strategy at landing; elites spread rotational load across joints | Established (abstract) |
| Pan et al. 2025 [N12] | 15 campus "tennis enthusiasts" vs 15 professionals, landing phase. Professionals showed greater hip stiffness and larger knee and ankle ranges of motion and moments | Established (abstract) |
| Liang et al. 2023 [N10] | Female college players: flight 0.23–0.29 s, jump 7–11 cm, landing 0.12–0.16 s. Lower levels jumped less | Established |
| Martin et al. 2012 [N13] | 15 experts: foot-back serves reach the net faster; foot-up serves are faster | Established |
| Girard et al. 2010 [N18] | Plantar loading differs by stance and serve type (for example, foot-up puts more relative load on the front foot's lateral forefoot) | Established |
| Kovacs & Ellenbecker 2011 (research 03 [S1]) | Foot-up gives larger braking forces at landing | Established |
| Reid & Giblin 2015 [N22] | An "arabesque finish" cue changes landing posture and raises leg drive in elite juniors; no distances | Established (abstract) |
| Lin et al. 2010 [N19] | Foot-up vs foot-back: no difference in ball speed or phase timing; no landing data | Established |

Landing direction (lateral drift) and balance scores for recreational players: **none found**. F18 ("unbalanced or stiff landing") rests on coaching interpretation (research 04 §6).

---

## 6. (e) The highest plausible recreational toss and the vertical capture envelope

### 6.1 How high does a recreational toss go?

- **Observed [Established]:**
  - highest published per-player mean: 4.00 m (recreational woman, net faults); 3.82 m on her serves that went in [N1];
  - highest single-player value in any other sample: 3.80 m [N7];
  - group means with SD: 3.57 ± 0.22 m (competitive women), 3.48 ± 0.24 m (HP men), 3.40 ± 0.24 m (junior men).
- **Design cases [Our inference]:** apex ≈ contact ratio × stature + drop + 2 × within-player SD. The ABS measured mean adult height is 175.6 cm for men and 161.8 cm for women [N20].

| Case | Contact | + drop | + 2 × SD (0.15 m) |
|---|---|---|---|
| Average man (1.756 m × 1.46; drop 0.70) | 2.56 m | 3.26 m | 3.50 m |
| Average woman (1.618 m × 1.46; drop 1.00) | 2.36 m | 3.36 m | 3.60 m |
| Tall man (1.95 m × 1.54; drop 1.10) | 3.00 m | 4.10 m | 4.40 m |
| Tall man, high tosser (drop 1.30) | 3.00 m | 4.30 m | 4.60 m |
| Tall woman (1.80 m × 1.54; drop 1.45) | 2.77 m | 4.22 m | 4.52 m |

- **Mixed-population estimate:** a between-player SD of 0.24 m and a within-player SD of about 0.12 m give a per-serve P95 of about 3.9–4.1 m and a P99 of about 4.1–4.3 m. Tall, high-tossing players reach 4.4–4.6 m.
- **Recommended vertical envelope** at the server's plane [Our inference]:
  - **bottom:** −0.2 m, so the feet and landing are visible with margin, as in research 06 §3.2;
  - **top: 4.5 m minimum**, which frames at least 99% of serves without extrapolation;
  - **4.7 m target**, which absorbs a levelling error (1° at 7.5 m is 13 cm), the ball's radius and a toss plane slightly nearer the camera;
  - **4.3 m acceptable floor** (about P99 for players of average height), with the fallback in 6.4.

### 6.2 Check of D1 with the research 06 §3.3 formula

- Level phone: D = max(T − h, h + 0.2) / tan(VFOV/2).
- Landscape 16:9 vertical FOV: 44.2° for the 24 mm-equivalent lens (tan half-angle 0.4057) and 41.1° for 26 mm (0.3745), per research 06 §3.1.
- Frame top at the server = h + d·tan(VFOV/2). Here d is the camera-to-**server** distance, not the distance to the centre mark.
- For a right-hander with the camera on the right, the server stands:
  - about 0.5–1.0 m nearer the camera on the deuce court (singles);
  - about 0.5–1.0 m further away on the ad court;
  - about 2–3 m from the centre mark in doubles.

  In the tables, 0.75 m is used for singles and 2.5 m for doubles.
- Flat and slice tosses drift slightly towards the camera (the hitting-arm side). A ball plane Δ metres nearer the camera sees a frame top Δ·tan(VFOV/2) lower: about 0.08 m lower for Δ = 0.2 m with a 24 mm lens. Kick tosses drift away from the camera (research 05 [S46]; [N14]). [Our inference]

**Minimum level-phone distance from camera to server** (bottom −0.2 m):

| Lens | Top 4.3 m (h = 1.2 / 1.4 / 1.6 / 1.8 m) | Top 4.5 m | Top 4.7 m |
|---|---|---|---|
| 24 mm (Pro models) | 7.6 / 7.2 / 6.7 / 6.2 m | 8.1 / 7.6 / 7.2 / 6.7 m | 8.6 / 8.1 / 7.6 / 7.2 m |
| 26 mm (iPhone 17, 16e, 17e) | 8.3 / 7.7 / 7.2 / 6.7 m | 8.8 / 8.3 / 7.7 / 7.2 m | 9.4 / 8.8 / 8.3 / 7.7 m |

**Frame top at the server** for D1's own settings (level phone):

| Setting (distance from centre mark, height, lens) | Deuce, singles (d − 0.75) | Ad, singles (d + 0.75) | Deuce, doubles (d − 2.5) |
|---|---|---|---|
| 6 m, 1.2 m, 24 mm | **3.33 m** | 3.94 m | **2.62 m** |
| 6 m, 1.6 m, 24 mm | **3.73 m** | 4.34 m | **3.02 m** |
| 7 m, 1.4 m, 24 mm | **3.94 m** | 4.54 m | **3.23 m** |
| 8 m, 1.6 m, 24 mm | 4.54 m | 5.15 m | **3.83 m** |
| 6 m, 1.2 m, 26 mm | **3.17 m** | 3.73 m | **2.51 m** |
| 8 m, 1.6 m, 26 mm | 4.32 m | 4.88 m | **3.66 m** |

Bold means the frame top is below a typical recreational apex (about 3.4–3.6 m) or clearly below the 4.3 m floor.

**Pass counts across D1's 18 combinations** (6, 7 or 8 m × 1.2, 1.4 or 1.6 m × 24 or 26 mm):

| Envelope top | Deuce singles | Ad singles | Deuce doubles | Ad doubles |
|---|---|---|---|---|
| 4.3 m | 3 of 18 | 12 of 18 | 0 of 18 | 18 of 18 |
| 4.5 m | **1 of 18** | 8 of 18 | 0 of 18 | 17 of 18 |
| 4.7 m | 0 of 18 | 5 of 18 | 0 of 18 | 15 of 18 |

**Verdict [Our inference]:** as written, D1 does not frame a recreational toss reliably. At 6 m and 1.2 m it cuts off most tosses on the deuce court. Only its far, high corner (about 8 m from the centre mark, 1.6 m high, 24 mm lens) meets the 4.5 m envelope for deuce-court singles serves. Research 06 §3.3 already implied distances of 7.4–8.8 m to the **server** at 1.2–1.5 m heights. The discrepancy arises because D1 measures from the centre mark, and the server stands between the camera and the centre mark on the deuce court.

### 6.3 Recommended D1 amendments (for the product lead to decide)

1. **Measure to the server, not the centre mark.** Use at least 7.5 m (24 mm lens) or at least 8.0 m (26 mm) from the server's standing spot, at a phone height of 1.5–1.6 m. For deuce-court singles serves this is about 8.3–8.8 m from the centre mark, normally at the side fence (ITF-standard courts give 8.5–9.1 m from the centre line; research 06 §3.3).
2. **Cap the distance at about 10 m.** At 10 m and 1080p the ball is 8.9–9.7 px, near research 06's 8 px minimum. Use 4K beyond 9 m.
3. **Raise the preferred height to 1.5–1.8 m.** Allow 1.2 m only at 8.1 m or more (24 mm lens).
4. **Allow a measured up-tilt of 5° or less where the fence is closer.** The tilt comes from the gravity vector (CoreMotion on iOS) and is corrected by a rotation-only rectification using the intrinsics. For example, at 6.25 m to the server and 1.6 m high, a 24 mm lens needs 3.0° to reach 4.5 m. This departs from D1's "level (no tilt)" and needs a decision.
5. **Add a live headroom check.** From the detected standing body height in pixels, compute the frame top at the player's plane as T = (y_feet − y_top) / H_px × stature. Require T ≥ max(4.3 m, 1.54 × stature + drop_high + 0.35 m), where drop_high is 1.00 m for men and 1.25 m for women and unknown sex (about 4.3–4.6 m). After the first three serves, if any apex comes within 0.2 m of the top or leaves the frame, prompt "move the phone about 1 m back or raise it".
6. **Doubles positions.** Tell users to film from their singles serving spot, or to move the camera 2 m further back. Deuce-court doubles positions fail at every D1 setting.

### 6.4 Fallback when the apex leaves the frame [Our inference]

Fit the rising and falling branches with a parabola constrained to the known g in pixels, using the stature scale and the time base, and weighting points within 3 m/s of the apex, where drag is under 2% of g.

- The apex height above the frame top follows from the time gap between exit and re-entry.
- A ±1 frame error on that gap costs about ±2 cm at 60 fps (±4 cm at 30 fps) for an apex up to 0.3 m above the frame, and about ±2.6 cm at 60 fps (±5 cm at 30 fps) at 0.5 m, before scale error.
- Label the result `estimated`, reason "apex above frame".
- If the gap exceeds about 0.65 s (apex more than 0.5 m above the frame), mark the apex `unavailable`.

---

## 7. Provisional UTR 1–7 bands, fault thresholds and how they were derived [Our inference throughout]

Rules common to every band:

- **Stratify** by view (side only), serve number (1st/2nd), intended type (flat and slice vs kick), court side (deuce vs ad; research 03 [S34]) and, for the drop, sex.
- **Compute on the player's median** over at least 8–10 detected serves in one stratum (D7).
- **Hysteresis:** do not change a player's band label unless the estimate crosses the edge by more than the stated uncertainty margin. This stops the label flickering between sessions.
- **Wording:** show bands as "tight / typical / scattered" and so on, never "good / bad", because none has been validated against outcomes.
- **Player-relative first:** fault triggers prefer change against the player's own best session over the absolute band. Absolute bands only gate "possible" vs "likely" wording.

### 7.1 Toss apex spread (the lead D5 metric)

- **Vertical within-player SD:** tight < 8 cm; typical 8–20 cm; scattered > 20 cm.
- **Forward/back within-player SD** (side view): tight < 10 cm; typical 10–25 cm; scattered > 25 cm.
- **Derivation:**
  - The floor is the professional women's 6.0 cm vertical and 7.2 cm forward/back (research 06 [S8]).
  - Our measurement error of about 3–5 cm inflates an observed SD: √(6² + 3²) = 6.7 cm and √(6² + 5²) = 7.8 cm. So under 8 cm is effectively professional-like.
  - The upper edge (about 3 × elite) is a judgement. The only recreational hint is one recreational woman whose means by outcome spanned 22.5 cm [N1], which implies an individual SD well above 10 cm. Contact-forward SDs of 12–13 cm in hobby men and a median of 8 cm in competitive men (research 05 [S47]) anchor the forward/back edges.
- **Uncertainty:** ±50% on each edge until our own data exist. Always show the SD with its confidence interval: at n = 20 the 95% interval is 0.76–1.46 × the SD (research 06 §7.2).
- **F3 trigger (inconsistent toss):**
  - "likely" when the one-sided 90% lower bound of the vertical or forward/back SD is at least 15 cm (vertical) or 18 cm (forward/back), with n ≥ 12 in one stratum and at least 80% of serves detected. At n = 12 this means an observed vertical SD of about 19 cm or more; at n = 20, about 18 cm or more;
  - "possible" when the point estimate is in the scattered band but the bound is not met;
  - player-relative: a rise of 50% or more against the player's best matched session at n ≥ 20 (research 06 §7.2 detectable change) triggers regardless of band.

### 7.2 Drop from apex to contact (the F4 metric)

- **Men:** low < 0.30 m; typical 0.30–1.00 m; high > 1.00 m.
- **Women:** low < 0.40 m; typical 0.40–1.25 m; high > 1.25 m.
- **Sex not given:** low < 0.30 m; typical 0.30–1.25 m; high > 1.25 m.
- **Show as time as well:** fall time √(2d/g) is 0.25 s at 0.30 m, 0.45 s at 1.00 m and 0.50 s at 1.25 m. The ball is travelling at 2.4, 4.4 and 5.0 m/s at contact.
- **Derivation:**
  - Male high edge: HP, professional and junior men 0.56–0.72 m, and junior mean + 1.5 SD ≈ 1.0 m (research 03 [S27][S28]; [N4]).
  - Female high edge: professional 0.82 m, elite junior 0.94 m and competitive 1.14 ± 0.18 m [N1][N4][N5]. The 1.25 m edge still marks the upper tail of competent women as "high", which is acceptable for a descriptive band.
  - Low edges: experienced men averaged 0.37 m (research 03 [S29]), and the coaching cue (≈ 0.3 m; research 04 [S68]) sits at the edge.
- **Uncertainty:** ±0.15 m on each edge.
- **F4 trigger (too high, hit on the way down):**
  - "possible" when the median drop is in the high band **and** at least one co-signal is present:
    - release to contact > 1.15 s;
    - a trophy-to-contact wait > 0.55 s (children's mean 0.54 s vs adults' 0.33–0.36 s [N9]). This uses the hitting-wrist high point as an experimental proxy;
    - contact height ratio > 0.04 below the player's own best median.
  - "likely" when the drop exceeds 1.20 m (men) or 1.45 m (women) with two co-signals.
  - Never trigger F4 on the drop alone. [Our inference; the coaching link is Coaching interpretation (research 04 [S68])]
- **Related flags:**
  - "Contact on the rise" (contact before the fitted apex) and "very low toss" (drop < 0.10 m) are shown as observations with a note that the toss may be rushed [Coaching interpretation]. Neither is a fault in the library.

### 7.3 Contact height ratio (the F12 metric)

- **Bands:** low < 1.38; typical 1.38–1.54; high > 1.54. Above 1.62, ask the player to confirm their entered height. For kick and second serves, the low edge is 1.35.
- **Derivation:**
  - The low edge is the novice mean minus 1 SD (1.426 − 0.047; research 03 [S6]).
  - The typical range spans novice-to-club means of 1.43–1.49 (research 03 [S6][S7]; research 05 [S47]; [N1]) and experienced players' individual range of 1.41–1.54 (research 03 [S29]).
  - Values above 1.54 occur mainly in elite, tall or jumping servers (1.53–1.56; [N8]; research 03 [S27]).
  - The kick allowance is a small hedge for the further-back kick contact (research 03 [S19][S35]); its size is not supported by non-elite data.
- **Uncertainty:** ±0.03. Note that our absolute contact-height error of ±5–10 cm (research 05 §6.4) is ±0.03–0.06 in ratio, similar in size to the whole gap between novice and elite. This is why F12 needs confidence gating.
- **F12 trigger (low contact / bent arm):**
  - "likely" when the median is < 1.38 **and** the one-sided 90% upper bound, including systematic scale error, is < 1.42, with at least 8 serves;
  - "possible" when the median is < 1.38 without that bound;
  - player-relative: a fall of 0.04 or more against the player's best matched median.
  - For players aged 60 or over, or with overhead shoulder discomfort flagged, do not raise F12 from the absolute band. There are no data, stature declines with age (the ABS 75+ mean is 8.1 cm below ages 18–24 [N20]), and reaching overhead can be a pain issue (research 04 §8). Use player-relative change only.

### 7.4 Rhythm: release to contact and its spread

- **Bands:** quick < 0.80 s; typical 0.80–1.20 s; unhurried > 1.20 s.
- **Spread (within-player SD):** tight < 40 ms; typical 40–90 ms; variable > 90 ms (about a CV of < 4%, 4–9% and > 9%).
- **Derivation:**
  - Measured recreational values of 0.91–0.97 s [N3] and 0.97 ± 0.10 s in HP men (research 03 [S27]).
  - The physics range for published toss geometries is 0.77–1.21 s (Section 4.2).
  - The spread edges bracket the derived 45–55 ms within-player SD [N3].
  - Measurement adds about 7 ms SD per duration at 60 fps and about 14 ms at 30 fps; audio contact reduces this.
- **Uncertainty:** ±0.05 s (level) and ±15 ms (spread).
- **Use:** descriptive only, per research 05 §6.2: there is no "correct" tempo. It acts as an F4 co-signal (Section 7.2), and a variable spread can support a rhythm-focused cue. Evidence tier: `experimental`.

### 7.5 Landing distance (front foot)

- **Definition:** the horizontal distance from the net-side edge of the baseline to the landing foot's first ground contact (mid-foot between the heel and toe keypoints; research 05 §6.7). Positive values are inside the court. Also report it as a percentage of standing height.
- **Bands:** short < 0.15 m (< 10% of height); typical 0.15–0.90 m (10–50%); long > 0.90 m (> 50%). For foot-back stance, the typical upper edge is 1.10 m.
- **Derivation:** pure inference, because no literature exists. It is built from:
  - flight times of 0.23–0.29 s [N10] × an assumed horizontal body speed of 1–3 m/s ≈ 0.2–0.9 m of travel in the air;
  - the landing foot reaching slightly ahead of the body;
  - the expectation that platform or no-jump servers (common at UTR 1–3) land near the line;
  - evidence that foot-back servers move forward faster [N13].
- **Uncertainty:** ±0.25 m. Label the metric `experimental` until validated, as research 05 §6.7 already requires.
- **F18 trigger:** do not use landing distance. F18 should rest on stability observations (a stumble, sideways step or straight-knee landing), which are Coaching interpretation (research 04 §6). Use landing distance only for trends ("landing 25 cm further in than last month suggests more forward drive").

### 7.6 Secondary descriptive band: forward contact position (side view)

- **Bands:** short < 15 cm in front of the front toe; typical 15–70 cm; long > 70 cm. For kick serves, shift the band 15 cm back.
- **Anchors:** amateurs 18 cm (research 03 [S61]); recreational women 10 cm; competitive women 54 cm [N1]; hobby men 24–68 cm; competitive men 62 cm (research 05 [S47]); professionals 61–78 cm [N4]; kick about 17 cm further back than flat (research 03 [S35]).
- **Use:** a feature for D3 outcome linking, and a possible F11/F13 context. No standalone fault.

---

## 8. Physical plausibility bounds for rejecting outliers [Our inference]

- **Hard reject** means an almost-certain detection, time-base or calibration error: exclude the serve from statistics, keep it visible with a "not measured" chip, and count it in "X of N measured".
- **Soft flag** means physically possible but outside every published human value: keep the serve, lower its confidence, and offer "check this serve" in review.

| Quantity | Hard reject | Soft flag | Basis |
|---|---|---|---|
| Entered standing height | < 1.30 or > 2.20 m | < 1.45 or > 2.05 m | Adult range. ABS means are 175.6 and 161.8 cm [N20] |
| Release height | < 0.45× or > 1.50× stature | < 0.65× or > 1.25× | Published means 0.93–1.02×; Hartoto's range was 0.70–1.23× the group's mean stature [N7] |
| Release to apex | < 0.25 s or > 0.85 s | < 0.38 s or > 0.72 s | Rise 0.3 m ↔ 0.25 s; 3.55 m ↔ 0.85 s; soft 0.7–2.55 m of rise. Published release speeds give 0.53–0.64 s |
| Apex height | Below contact height − 0.10 m, or > 5.5 m | < 2.4 m or > 4.6 m (or < 1.45× / > 2.6× stature) | An apex cannot be below a later point on the same flight. Published group and per-player means are 2.98–4.00 m |
| Apex to contact (signed time) | < −0.15 s (contact well before the apex: probably a wrong contact frame or a caught toss) or > 0.70 s | < 0 s (contact on the rise) or > 0.57 s | 0.57 s ↔ a 1.6 m drop; 0.70 s ↔ 2.4 m |
| Drop from apex to contact | > 2.2 m | < 0.03 m or > 1.6 m | Largest published per-player mean is 1.41 m [N1]; Liu's maximum across players is 1.55 m [N5] |
| Release to contact | < 0.40 s or > 1.60 s | < 0.60 s or > 1.35 s | Physics minimum ≈ 0.49 s (0.75 m rise, contact at the apex); maximum ≈ 1.40 s (3.0 m rise, 1.9 m drop) |
| Contact height ratio | < 1.10 or > 1.75 | < 1.30 or > 1.62 | Reach with an extended arm and racket ≈ 1.45–1.50× stature, plus a jump of 7–11 cm [N10]. Published extremes are 1.36–1.56 |
| Contact forward of the front toe (side view) | < −0.8 m or > 2.0 m | < −0.3 m or > 1.2 m | Published means are 0.1–0.8 m |
| Within-player apex SD (vertical) | > 0.60 m | > 0.35 m | Suggests mixed strata, re-tosses or tracking swaps |
| Within-player release-to-contact SD | > 0.30 s | > 0.15 s | About 3 × the typical upper edge |
| Landing distance | < −0.8 m or > 2.5 m | < −0.3 m or > 1.5 m | Physics (Section 7.5) |
| Fitted gravity on the toss (near-apex window, using the stature scale and time base) | Outside 7.0–13.0 m/s² | Outside 8.8–10.8 m/s² | A hard failure means a wrong slo-mo time base or a wrong entered height (the engine's gravity time-scale check) |

Caught or re-tossed balls (no contact within 1.6 s of release) are classed as "toss only". Show them as a count ("2 tosses caught") and exclude them from contact and drop metrics. Include them in apex spread only as a separate figure, because they are the tosses players judged bad.

---

## 9. Protocol for building our own recreational reference set

**Aim:** replace every band in Section 7 with empirical percentiles for UTR 1–7 Australian adults, by sex and age band, within about 12 months of launch.

1. **Consent and data flow (D8 compatible).**
   - v1 has no upload, so contribution is an explicit, separate opt-in: "Share anonymised serve measurements to improve reference ranges".
   - It exports the structured metrics and annotations only (the JSON export already planned), never video.
   - Contributors choose to send the file, or a later consented upload endpoint does it.
   - Record: sex, age band (18–39, 40–59, 60+), stature, handedness, self-reported UTR (optional UTR profile check), stance, serve type and number, and court side.
   - Pain notes are excluded.
   - If the results are to be published, obtain HREC approval first, for example through a university partner (Victoria University and Tennis Australia have published serve work [N22]).
2. **Capture standard.**
   - Use the amended D1 geometry (Section 6.3), 60 fps or more (120 fps preferred), and a lens and FOV read from the device.
   - Blocks of 12 or more serves per stratum: first serves from the deuce court are the core, followed by the ad court and second serves.
   - Log the environment: wind (Beaufort category), lighting, surface.
3. **In-app annotation mode (ground truth).** For each serve, the annotator marks:
   - the frames for ball release, apex (the peak frame, plus the "last frame before descent"), contact (plus the audio onset) and front-foot first contact;
   - the pixel positions of the ball at release, apex and contact;
   - heel and toe at landing;
   - the baseline edge at the player's plane;
   - two reference heights: the player standing tall (stature check) and the net-post or fence height.

   A second annotator repeats 20% of serves blind. Report inter-rater ICCs and limits of agreement per metric; the target is an ICC ≥ 0.90 for apex, contact and timing.
4. **Measurement error first.**
   - Estimate each metric's error SD from the double annotation and from automated-vs-annotated differences (Bland–Altman).
   - De-attenuate spread metrics before banding: true SD ≈ √(observed² − error²).
   - Do not publish within-player spread bands until the error SD is under half of the lower band edge (for example, under 4 cm for apex SD).
5. **Sampling targets.**
   - Primary cells: sex × age band × UTR band (1–3, 4–5, 6–7), 18 cells.
   - At least 30 players per cell before its percentiles replace the provisional band. Until then, shrink the cell towards the pooled band (empirical Bayes) and flag the cell "provisional".
   - Recruit through clubs and coaches, following the research 02 acquisition channels.
6. **Statistics.**
   - Fit a mixed-effects model per metric: player as a random effect; fixed effects for serve type, serve number, side, sex, age band and UTR band. This separates the between-player distribution (for level bands) from the within-player SD (for spread bands).
   - Level-band edges = P10 and P90 of player medians; spread-band edges = P10 and P90 of within-player SDs. Report 90% bootstrap CIs for each edge.
   - Replace a provisional edge when its CI half-width is under 25% of the band's width. Otherwise keep the wider of the provisional and empirical edges.
7. **Link to outcomes.** Using player-entered outcomes (D3), estimate within-player associations (for example, the odds of a serve going in per 10 cm of forward apex, or per 0.1 m of drop). This tests whether F3, F4 and F12 thresholds predict anything. Keep a fault's evidence tier at `coach-recommended` until such an association is shown.
8. **Validation references.** Where coaches own them, collect paired radar readings (D4) and short 240 fps clips with a dual-camera setup, to check timing and 2D height against an independent reference. Log every failure case: occlusion, glare, wind, a toss outside the frame.
9. **Re-run cadence.** Review quarterly. Version the band tables (for example, `bands_v1_provisional`, `bands_v2_2027Q2`) and store the version with each session, so historical verdicts remain reproducible.

---

## 10. Corrections made to existing research files

1. **research 05 §6 (line on [S47]), plus a note in its verification log.** The 2022 Carboch & Hrychová study's "recreational" players were 2 former junior men, 180 cm tall, serving 127–142 km/h. They contacted the ball 13 cm lower in absolute terms, but at about 145–148% vs 149% of standing height. The paper's text claims greater toss variability, but its tables report contact points only, with within-player contact-height SDs of about 3 cm in both groups. The 2025 female companion study found the reverse height difference [N1]. The file now says this.
2. **research 06 §3.2.** Added an update note: some adult recreational toss values now exist (this file, Sections 2.2–2.3), and D1's near positions do not frame the 4.5 m envelope (Section 6).
3. **research 06 §7.2.** Added an update note: recreational within-player apex SDs are still not published. Contact-height within-player SDs of about 3 cm in hobby men are now available.

---

## 11. Open questions and next steps

1. Obtain the full texts of Girard 2005 (definitions and phase durations), Whiteside 2013 JAB (toss by age group) and Elliott & Wood 1983 (stance and landing). These could tighten the timing and landing bands.
2. Landing distance has no literature. It should be among the first metrics validated with the annotation protocol (Section 9), with 30 players or more and both stances.
3. Test whether the sex-specific drop bands still hold once stature is accounted for, for example as drop ÷ stature. Women's larger drops may partly reflect a relatively higher apex in stature units (≈ 2.0× vs 1.85×; [N4]).
4. Decide D1 (Section 6.3): measure to the server, height 1.5–1.8 m, optional measured tilt of up to 5°. The synthetic generator (tools/synth) should render apex heights up to 4.6 m and some out-of-frame apexes to test the fallback in 6.4.
5. No data exist for adults over 40 on toss or contact height. Recruit this cell early. The lead segment (adult competition players aged about 25–60) includes many players over 40, and 35–54-year-olds are about 36% of adult players (research 02 §9.1 and its participation table).

---

## Sources (new in this file)

- [N1] Carboch J, Hrychová D. Kinematic analysis of the serve toss and its impact on serve outcome in competitive and recreational tennis players: a case study. *International Journal of Physical Education, Fitness and Sports* 14(1):45–51, 2025. https://doi.org/10.54392/ijpefs2515 (full text: https://ijpefs.org/index.php/ijpefs/article/download/619/414/1162) — accessed 2026-09-27
- [N2] Carboch J, Hrychová D. Přímé podání a jeho úspěšnost ve vztahu k nadhozu u tenisových hráček [The toss of successful and unsuccessful flat serves of female tennis players]. *Studia Kinanthropologica* 26(1):7–13, 2025. https://doi.org/10.32725/sk.2025.003 (full text: https://sk.pf.jcu.cz/pdfs/stk/2025/01/02.pdf) — accessed 2026-09-27
- [N3] Shafizadeh M, Hizan H, Davids K. Preservation of temporal organisation of tennis service following ageing in recreational players. *Perceptual and Motor Skills* 132(4):747–763, 2025. https://doi.org/10.1177/00315125251324419 (PMC12209555) — accessed 2026-09-27
- [N4] Elliott B, Whiteside D, Lay B, Reid M. The female tennis serve: an analagous version of the male serve? *ISBS Conference Proceedings* (31st International Conference on Biomechanics in Sports), 2013. https://ojs.ub.uni-konstanz.de/cpa/article/view/5590 — accessed 2026-09-27
- [N5] Liu H, Li L, Fang X. Biomechanical analysis and evaluation of the power serve of female tennis players. *ISBS Conference Proceedings* (18th International Symposium on Biomechanics in Sports, Hong Kong), 2000, pp. 293–296. https://ojs.ub.uni-konstanz.de/cpa/article/view/2537 — accessed 2026-09-27
- [N6] Otsuka E, Fujii N. Biomechanical case study on toss up motion in tennis serve. *ISBS Conference Proceedings* (32nd International Conference on Biomechanics in Sports, Johnson City), 2014. https://ojs.ub.uni-konstanz.de/cpa/article/view/6069 — accessed 2026-09-27
- [N7] Hartoto S, Al Ardha MA, Firmansyah A, Prakoso BB, Pratama SA, Bana P. Biomechanics analysis of arm flexion isometric force, upper extremity movement, and ball toss position towards ball speed in tennis flat serve. *Advances in Social Science, Education and Humanities Research* vol. 618, Atlantis Press, 2021. https://doi.org/10.2991/assehr.k.211223.067 — accessed 2026-09-27
- [N8] Chen Y, Wang T, Zhao Y, Zhan G, Tang Y, Wang Z. Kinematic differences between female national and provincial athletes in the tennis serve. *PeerJ* 12:e18410, 2024. https://doi.org/10.7717/peerj.18410 (PMC11531263) — accessed 2026-09-27
- [N9] Tubez F, Schwartz C, Croisier JL, Brüls O, Denoël V, Paulus J, Forthomme B. Evolution of the trophy position along the tennis serve player's development. *Sports Biomechanics* 20(4):431–443, 2021. https://doi.org/10.1080/14763141.2018.1560493 (abstract via PubMed E-utilities, PMID 30689538) — accessed 2026-09-27
- [N10] Liang Z, Wu J, Yu J, Ying S, Liu Z, Zhang Y, Gu Y, Li J. Comparison and analysis of the biomechanics of the lower limbs of female tennis players of different levels in foot-up serve. *Frontiers in Physiology* 14:1125240, 2023. https://doi.org/10.3389/fphys.2023.1125240 (PMC9998895) — accessed 2026-09-27
- [N11] Mizuno K, Masaki H. Effects of left-hand contraction on tennis serve performance. *Frontiers in Psychology* 15:1386025, 2024. https://doi.org/10.3389/fpsyg.2024.1386025 (PMC11157960) — accessed 2026-09-27
- [N12] Pan J, Sun D, Li F, Zhou Z, et al. The effects of skill level on lower-limb injury risk during the serve landing phase in male tennis players. *Applied Sciences* 15(5):2681, 2025. https://doi.org/10.3390/app15052681 (abstract via OpenAlex) — accessed 2026-09-27
- [N13] Martin C, Bideau B, Nicolas G, Delamarche P, Kulpa R. How does the tennis serve technique influence the serve-and-volley? *Journal of Sports Sciences* 30(11):1149–1156, 2012. https://doi.org/10.1080/02640414.2012.695079 (abstract via PubMed, PMID 22668422) — accessed 2026-09-27
- [N14] Carboch J, Tufano JJ, Süss V. Ball toss kinematics of different service types in professional tennis players. *International Journal of Performance Analysis in Sport* 18(6):881–891, 2018. https://doi.org/10.1080/24748668.2018.1519750 (abstract via OpenAlex) — accessed 2026-09-27
- [N15] Vacek J, Vágner M, Cleather DJ, Šťastný P. A systematic review of spatial differences of the ball impact within the serve type at professional and junior tennis players. *Applied Sciences* 13(6):3586, 2023. https://doi.org/10.3390/app13063586 (abstract via OpenAlex; publisher page returned 403) — accessed 2026-09-27
- [N16] Guo J, Zhou J. Kinematic analysis on serve technique of world's elite female tennis player. *ISBS Conference Proceedings* (33rd International Conference on Biomechanics in Sports, Poitiers), 2015. https://ojs.ub.uni-konstanz.de/cpa/article/view/6558 — accessed 2026-09-27
- [N17] Sun Y, Liu Y, Zhou X. A kinematic analysis of a top 10 WTA tennis player's first serve. *ISBS Conference Proceedings* (30th Annual Conference of Biomechanics in Sports, Melbourne), 2012. https://ojs.ub.uni-konstanz.de/cpa/article/view/5368 — accessed 2026-09-27
- [N18] Girard O, Eicher F, Micallef JP, Millet G. Plantar pressures in the tennis serve. *Journal of Sports Sciences* 28(8):873–880, 2010. https://doi.org/10.1080/02640411003792695 (abstract via PubMed, PMID 20496222) — accessed 2026-09-27
- [N19] Lin HT, Chang JH, Chang Chien JR, Tseng CS. The 3-D kinematic analysis of different tennis serve. *ISBS Conference Proceedings*, 2010. https://ojs.ub.uni-konstanz.de/cpa/article/view/4559 — accessed 2026-09-27
- [N20] Australian Bureau of Statistics. *Australian Health Survey: First Results, 2011–12* (cat. no. 4364.0.55.001), released 29 October 2012. https://abs.gov.au/ausstats/abs@.nsf/Previousproducts/E11CED5FB86D178ACA257AA30014C059?opendocument — accessed 2026-09-27
- [N21] Special Olympics. *Tennis Coaching Guide: Teaching Tennis Skills* (PDF, undated). https://media.specialolympics.org/soi/files/sports/Tennis/EK2BNYG4/TEACHING.PDF — accessed 2026-09-27
- [N22] Reid M, Giblin G. Another day, another tennis coaching intervention, but does this one do what coaches purport? *Sports Biomechanics* 14(2):180–189, 2015. https://doi.org/10.1080/14763141.2015.1045549 (abstract via PubMed, PMID 26102205; conference version: Giblin & Reid, ISBS 2014, https://ojs.ub.uni-konstanz.de/cpa/article/view/6024) — accessed 2026-09-27

Existing sources relied on: research 03 [S1][S2][S6][S7][S8][S9][S19][S22][S27][S28][S29][S30][S34][S35][S46][S61]; research 04 [S33][S67][S68]; research 05 [S46][S47]; research 06 [S4][S8] and §3.1, §3.3 and §7.2. The Carboch & Hrychová 2022 full text (research 05 [S47]) was read from the Internet Archive copy of 3 January 2025 (http://web.archive.org/web/20250103212816/https://www.sportscienceresearch.com/IJSEHR_202262_08.pdf), because the DOI now resolves to a 404 page.
