# 01 — Competitor and adjacent-app landscape (international)

**Prepared:** 2026-09-27 · **Scope:** tennis serve/stroke analysis, sports video coaching, serve-speed tools, tennis sensors, and single-phone analysis products in golf, baseball, cricket, basketball and running · **Audience:** product, design and engineering for the Australian iOS "virtual serve coach"

---

## How to read this document

**Evidence labels (used on every non-trivial claim):**

- **[Established]**: peer-reviewed finding or strong consensus.
- **[Coaching interpretation]**: expert practice, not directly proven.
- **[Vendor claim]**: what a company says about its own product, not independently verified.
- **[Market data]**: prices, ratings, review counts, user numbers, dates.
- **[Regulation]**: legal or platform rule.
- **[Our inference]**: our own reasoning from the evidence.

**Currency.** Where an Australian App Store price exists we quote it directly. Australian App Store prices include GST. Where only USD or EUR is published we add an *indicative* AUD figure at **A$1.42 per US$1** and **A$1.62 per €1**, from the Reserve Bank of Australia's published rates for 25 September 2026 (AUD/USD 0.7019; AUD/EUR 0.6170) [S67] [Market data]. *(Fact-check correction: the first draft used A$1.52 and A$1.75, which overstated converted prices by about 7–8%.)* Converted figures exclude GST, whereas AU App Store prices include it, so a converted price understates what an Australian would pay in-app by about 10%. Recheck rates before any pricing decision. App Store ratings and version dates were read on 2026-09-27. "Latest version 2 days ago" means about 25 September 2026.

**Method.** We ran about 40 web searches (the session's search budget ran out partway through) and opened about 75 primary pages: App Store listings in the US and AU storefronts, vendor pricing pages, vendor help pages, peer-reviewed abstracts and one full-text validation PDF. Several vendor sites are JavaScript apps that could not be fetched: swing.vision pricing and guides, open.sportai.com, the SwingVision "Introducing Max" newsletter, and playsight.com (HTTP 522). Where we relied on a search-index summary of those pages, we say so and mark the detail UNVERIFIED.

---

## 1. Executive summary

1. **SwingVision is the category incumbent, and it already owns single-phone serve outcome statistics.** It measures speed, placement and in/out from one elevated rear camera. It has a solo "Goal Mode" that calls out speed and accuracy as you serve, and a match database of 250,000+ sessions [S1][S7][S8] [Vendor claim]. In Australia it costs **A$149.99–A$499.99 per year** across the Plus, Pro and Max tiers [S2] [Market data]. Since February 2026 its free tier allows 8 hours of HD recording a month [S2] [Market data]. A prominent Australian review complains about the price (A$300 a year) and slow processing [S2] [Market data].
2. **SwingVision reports average ball speed, not radar-style peak speed.** Its speed figures should therefore read below radar [S5] [Vendor claim; Our inference]. A figure of "about 20% lower" circulates in search summaries of SwingVision's FAQ, but neither S5 nor S6 states it and the FAQ could not be loaded (UNVERIFIED). Independent validation is modest. Bilić et al. (2023, n = 5 juniors) found serve-speed ICC **0.76–0.80** and placement ICC **0.83–0.87** [S3] [Established, small sample]. Choe et al. (2023/24; 1,065 strokes) found good agreement overall, but accuracy fell when the camera angle was sub-optimal [S4] [Established].
3. **We found no product that joins validated serve outcome statistics with phase-based serve technique evidence and a single prioritised practice change.** SwingVision is strong on outcomes and weak on mechanics. The new AI technique apps are strong on skeleton overlays and weak on validation, outcome statistics and trust [Our inference].
4. **An AI tennis technique app boom took place in 2024–2026.** Examples include Toach, NiceShot, Axel AI/TENNIS AI 2.0, Tennis AI (USTA–UTR Coach), Shot AI, SportsReflector, AXIFY and ServeAI. Most have fewer than 20 App Store ratings and publish **no validation data**. Some make striking claims such as "107/109 biomechanical metrics" or serve speed from an uncalibrated iPhone [S30][S31][S32][S34][S35][S36] [Market data]. The field is crowded but has no trusted leader [Our inference].
5. **ServeAI (serveaiapp.com) is the closest conceptual match to our brief.** It offers skeleton-guided capture of one serve, "measured motion signals", **one drill and one cue**, and privacy-by-design deletion controls [S28] [Vendor claim]. Its pricing, traction and accuracy are unknown. It is the competitor to watch most closely.
6. **Coach video tools are coach-centred, not self-coaching tools.** OnForm, CoachNow, Dartfish, Kinovea and V1 give you the instruments (slow motion, drawing, skeleton, side-by-side), but a human has to interpret them. Hudl Technique (2021) and Coach's Eye (2022) were shut down, and the free mobile option for this workflow went with them [S12][S14] [Market data].
7. **Court-installed systems depend on the venue.** PlaySight, Wingfield, and SportAI through MATCHi or Save My Play charge per session or per club. They do not serve a player practising alone at a public council court [S19][S20][S21][S27] [Market data].
8. **Every plug-in tennis sensor we checked is dead.** Babolat Play (sales and support ended 1 March 2021; app kept until 31 December 2021, confirmed from Babolat's quoted notice [S47]) and, per a single secondary source with a commercial interest, Zepp (about 2020), Babolat POP (March 2021), Head (September 2021) and Sony (30 September 2021) all failed because their server-dependent apps were switched off [S47][S49] [Market data; the dates other than Babolat Play are UNVERIFIED against primary notices]. This is a strong trust lesson: players remember paying for hardware that stopped working.
9. **Adjacent sports show what credible single-phone metrics look like:**
   - **Fulltrack AI (cricket)** calibrates on known objects (the stumps). Australian university validation found good but biased speed agreement: ICC 0.87–0.90 for pace, with about 0.7–0.8 m/s overestimation and limits of agreement outside ±3% [S61] [Established]. For landing position (line and length) ICC was above 0.96 [S62] [Established].
   - **PitchAI** has a peer-reviewed single-camera pose validation with joint-angle RMSE of 4.4–20.8° [S57] [Established].
   - **Mustard and PitchAI** organise feedback around automatically detected **key frames** [S56][S58] [Vendor claim].
10. **The white space is a serve-only, solo-first, honest coach.** It would use one tripod at ground level, give credible serve-in and landing statistics from service-box calibration, measure toss and rhythm consistency, show key-frame technique evidence, give one change, one cue and one drill, and then answer "Did it work?" with a session-versus-session comparison. It would label every metric as measured, estimated, player-entered or unavailable, and it would be priced below SwingVision Pro in AUD [Our inference].

---

## 2. Market map

| Category | Examples | What they are | Relevance to our player (UTR 1–7, practising alone) |
|---|---|---|---|
| AI match and shot tracking (phone) | SwingVision | Automatic stats, line calls and highlights from one phone | **Direct competitor for serve stats**; not a technique coach |
| AI technique apps (phone, pose) | ServeAI, Toach, NiceShot, Axel AI/TENNIS AI 2.0, Tennis AI (USTA–UTR), Shot AI, SportsReflector, AXIFY | Skeleton overlays, scores, AI tips | **Direct competitor for technique**; mostly unvalidated |
| B2B AI technique engines | SportAI | Licensed technique analysis for clubs, booking platforms and brands | Could appear in Australia through partners; not consumer-direct |
| Coach video-analysis platforms | OnForm, CoachNow, Dartfish, Kinovea, V1 | Manual analysis toolkits and coach–athlete messaging | Adjacent; a possible channel through coaches |
| Court-installed camera systems | PlaySight, Wingfield | Club hardware with per-session video and stats | Adjacent; venue-bound |
| Instruction content | TopCourt | Lessons from professionals | Adjacent; no personal feedback |
| Serve-speed apps and radar | Speed Gun for Tennis, Tennis Serve Tracker, Tennis Serve Speed Tracker, Tennis Radar, Pocket Radar | Single-purpose speed | Adjacent; a reference or integration option |
| Tennis sensors | Zepp, Sony, Babolat Play/POP, Head, Qlipp | Racquet or wrist inertial measurement units | All discontinued; a cautionary tale |
| Adjacent-sport analogues | Sportsbox AI, V1 Golf, Swing Profile, Rapsodo (golf); Mustard, PitchAI (baseball); Fulltrack AI (cricket); HomeCourt (basketball); Ochy (running) | Single-phone motion or ball analysis | Design and validation patterns to copy |

---

## 3. Tennis incumbent: SwingVision

### 3.1 What it does

- **Core features.** SwingVision offers automated shot tracking (speed, depth, accuracy, rally length), AI scoring, highlight editing with score overlays, real-time line calls with audio feedback, line challenges from Apple Watch, and personalised coaching recommendations. It covers tennis, pickleball and, more recently, padel [S1] [Vendor claim]. Coaches use its placement breakdowns: the share of shots past the service line, left, middle and right thirds, and first- and second-serve locations in the box [S9] [Coaching interpretation]. It is an Apple **Editors' Choice** app, rated **4.7 from about 4,900 ratings in the US** and **4.6 from 297 ratings in AU** [S1][S2] [Market data].
- **Solo serve practice.** SwingVision's August 2026 blog describes **Goal Mode**: you pick target zones and get speed and accuracy called out as you hit. It also says the app logs serve speed, placement and in/out for every serve [S8] [Vendor claim]. The same post calls the serve the highest-value thing a player can practise alone [S8] [Vendor claim; a coaching opinion in marketing copy, not evidence]. So SwingVision is already marketing to our core "serve practice alone" use case.
- **Apple Watch.** The watch starts and stops sessions, keeps score, takes Siri commands and handles line challenges [S1][S6] [Vendor claim]. A 2023 reviewer said the watch mainly saves walking back to the phone [S6] [Market data].
- **Device requirements.** iOS 18+, iPhone XS or later; also runs on iPad, Mac and Apple Watch. The app is about 752 MB in AU [S1][S2] [Market data].
- **Pickleball serve practice and ball-machine modes** were added in 2025 (search-index summary of vendor newsletter; UNVERIFIED) [Vendor claim].

### 3.2 How its statistics are obtained

- **Method.** The app runs computer vision on video from **one camera behind the baseline**. It detects and tracks the ball, finds bounces and maps them to the court [S5][S6] [Vendor claim].
- **Speed is average ball speed over the flight, not peak speed off the racquet.** Tennisnerd confirmed this in 2021, and the reviewer said they would prefer radar-style shot speed [S5] [Vendor claim]. Secondary summaries of SwingVision's own FAQ say the figure is about 20% slower than broadcast radar (UNVERIFIED; the vendor page could not be loaded, and the fact-check found no fetchable source for the 20% figure) [Vendor claim]. Radar reports speed close to the racquet, while the ball slows through the air and at the bounce, so an average over the flight must read lower [Our inference].
- **Accuracy claims.** A 2023 review reports that SwingVision claims to be within about **10% for ball speed** and **5% for placement**, given a correct setup at **60 fps**. The same review notes that SwingVision had not explained what "within 10%" means statistically [S6] [Vendor claim]. The reviewer also saw occasional gross errors: a badly tossed serve that landed short of the net on the near side was logged as a good serve in the far service box [S6] [Market data].
- **Recommended setup** (from a search-index summary of SwingVision's guides; the pages could not be loaded, so the exact wording is UNVERIFIED):
  - at least **1.5 m (about 5 ft)** high;
  - behind the baseline, with both baselines in view;
  - imported footage at **1080p and 60 fps**;
  - an optional fence mount ("Swing Stick") that rises about 60 cm above the fence [Vendor claim].

  A 2026 filming guide from a rival (UNFORCE) recommends **2.4–3 m (8–10 ft)**, 60 fps (30 fps acceptable if 60 is unavailable), 1080p and landscape orientation. It describes 8–10 ft as roughly what SwingVision recommends [S66] [Vendor claim].

### 3.3 Pricing (read from App Store listings, 2026-09-27)

| Tier | US monthly | US yearly | **AU monthly** | **AU yearly** | AU yearly as per-month |
|---|---|---|---|---|---|
| Plus | US$14.99 | US$95.99 | **A$22.99** | **A$149.99** | A$12.50 |
| Pro | US$24.99 | US$179.99 | **A$39.99** | **A$299.99** | A$25.00 |
| Max (family, up to 5) | US$39.99 | US$299.99 | **A$59.99** | **A$499.99** | A$41.67 |

Sources: [S1][S2] [Market data]. The Australian yearly prices are **1.56–1.67 times** the US prices. At the 25 September 2026 RBA rate plus 10% GST the parity multiple is about 1.57 (1.425 × 1.10), so Plus is priced at parity while Pro and Max carry about a 6% premium, reflecting Apple's price tiers [S67] [Our inference].

- **Free tier.** Until early 2026 it was 2 hours of recording per month [S5]; one Australian reviewer called this "next to nothing" [S2] [Market data]. The App Store version notes for v11.9.50 (9 February 2026) announce a "New Free Tier!" with **8 hours per month in HD**, Apple Watch line-call challenges and real-time audio line calls [S2] [Market data; confirmed in fact-check].
- **Max tier.** Adds 4K, "AI Coaching", audio line calls and family sharing (search-index summary of the vendor newsletter; UNVERIFIED detail) [Vendor claim].

### 3.4 Independent validation

| Study | Sample | Criterion | Key results | Label |
|---|---|---|---|---|
| Bilić, Dukarić, Šanjug, Barbaros, Knjaz (2023), *Applied Sciences* [S3] | 5 elite male juniors (mean age 15.6) doing closed and open drills | Video analysis (a secondary summary also mentions radar for speed; UNVERIFIED) | Stroke detection ICC **0.97**; placement ICC **0.83–0.87**; serve speed ICC **0.76–0.80**; spin/rotation recognition ICC **0.76** | [Established]; very small sample; elite juniors, not recreational players |
| Choe, Hwang, Park, Amo, Lee (2023, online; 2024 issue), *Int J Perf Analysis in Sport* 24(1):58–73 [S4] | 6 college players, 4 matches, 2 camera angles, **1,065 strokes** | Trained human analysts | "High proportional similarity and percent agreement" on most variables (stroke type, depth, zone, spin, result, speed). **Optimal angle clearly better than sub-optimal.** | [Established] |

**What this means for us.** SwingVision's outcome statistics are reasonable for trends and good enough for coaching feedback when the camera is placed well. The speed figure is not interchangeable with radar, and no study we found validated it for **recreational** servers or for a **low, tripod-height** camera [Our inference].

### 3.5 SwingVision's own serve data (useful benchmarks)

SwingVision published session-weighted averages from **more than 86 million shots across 250,000+ sessions**, combined across genders [S7] [Vendor claim; Market data]:

| NTRP level | 1st-serve speed (SV average, mph / km/h) | 2nd-serve speed | 1st serve in | 2nd serve in | Double faults per match |
|---|---|---|---|---|---|
| 3.0 | 59.5 / 95.8 | 49.2 / 79.2 | 53.3% | 70.4% | 3.49 |
| 3.5 | 62.5 / 100.6 | 53.7 / 86.4 | 53.5% | 70.5% | 3.71 |
| 4.0 | 66.2 / 106.5 | 57.0 / 91.7 | 54.4% | 70.5% | 3.58 |
| 4.5 | 73.6 / 118.4 | 61.2 / 98.5 | 55.8% | 70.9% | 3.23 |
| 5.0 | 74.8 / 120.4 | 63.2 / 101.7 | 55.5% | 70.7% | 3.21 |

- **First-serve percentage barely changes with level**: about 53–56% from 3.0 to 5.0. Speed rises by about 15 mph [S7] [Vendor claim]. First-serve percentage on its own is therefore a weak progress measure. The useful signals are **quality at a steady in-rate**, second-serve reliability and consistency [Our inference].
- These are SwingVision average-speed figures and must not be quoted as radar speeds [Our inference].

### 3.6 Complaints (App Store reviews, US and AU)

- Price: "$300 AUD… too much" for a yearly subscription [S2] [Market data].
- Slow processing and slow cloud upload [S2] [Market data].
- The free tier's monthly allowance is too small [S2] [Market data] (this review refers to the former 2-hour tier, before the February 2026 increase to 8 HD hours).
- Scoring errors, with no way to correct them after the match [S1] [Market data].
- Players misidentified when they wear similar colours [S1] [Market data].
- Pickleball shot types mislabelled [S1] [Market data].
- Recording limited to HD on lower tiers (4K only on Max) [S1] [Market data].
- One report of half a match lost during upload (NZ storefront review) [S1] [Market data].

### 3.7 What SwingVision does not do

- **No serve technique analysis.** We found no public evidence of pose or skeleton analysis of the serve by phase (toss, trophy, racquet drop, contact, landing) [Our inference; UNVERIFIED because vendor pages could not be loaded]. Its blog tells players to *watch* footage for toss drift rather than measuring it [S8] [Vendor claim].
- No **toss height or toss-position consistency** metric described [Our inference].
- No explicit **"one change, one cue, one drill, re-test"** loop. "AI Coaching" exists on Max, but we could not verify what it covers (UNVERIFIED).
- Speed is **average speed**, not comparable with radar or television figures [S5] [Vendor claim].
- Best results need an **elevated rear view**, which is awkward alone at a public court without a fence mount [S4][S66] [Our inference].

---

## 4. Coach video-analysis platforms

| Product | What it is | AI | Pricing | Rating | Notes |
|---|---|---|---|---|---|
| **OnForm** | Coach and athlete video analysis: slow motion, drawing, side-by-side, multi-camera, voice-over. Integrates Pocket Radar over Bluetooth. Golf 3D data. | 2D skeleton tracking; auto-detect recording for golf and baseball; 2D-to-3D golf metrics [S10][S11] [Vendor claim] | Individual Standard US$9.99/mo or $99.99/yr; Premium US$14.99/mo or $149.99/yr; coach plans US$19.99–59.99/mo [S10]. **AU: Personal A$7.99/mo or A$81.99/yr; Individual Standard A$14.99/mo (A$39.99/quarter); Individual Premium A$22.99/mo; Coach Basic A$29.99/mo; Coach A$42.99/mo or A$399.99/yr; Coach Standard (1 seat) A$59.99/mo; Team/Academy A$129/mo** [S11] [Market data] | **4.8 (692) AU** [S11] | Tennis is not a featured sport on its website [S10]. Bought Hudl Technique in May 2021 [S12]. |
| **CoachNow** | Coaching communication plus an analysis suite across 60+ sports | "Skeleton tracking + angle detection" and "AI-enhanced tracking" [S15] [Vendor claim] | Analyze US$9.99/mo or **US$59/yr (≈A$84; shown as a discount from US$119)**; PRO US$49.99/mo or $499/yr (discounted from $600); Academy US$89.99/mo or US$899/yr [S15] [Market data] | not checked | No tennis-specific features [S15] |
| **Hudl Technique** | Formerly Ubersense; free slow-motion analysis | — | — | — | Sold to OnForm 17 May 2021 and discontinued that summer; video migration closed October 2021 [S12][S14] [Market data] |
| **Coach's Eye** (TechSmith) | Free or cheap mobile analysis | — | — | — | Retired after 11 years; TechSmith's retirement page confirms it "is no longer a working service" but gives no date. September 2022 comes from a competitor's blog only (month UNVERIFIED) [S14][S68] |
| **Dartfish** | Professional desktop and mobile analysis (tagging, Stromotion, Simulcam) | Automatic tracking and trajectories in the 360, Live S and Pro S tiers; the pricing page does not say which tier has pose/AI (UNVERIFIED) [S16] | Mobile **from €7/mo billed annually (≈A$136/yr)**; 360 €20/mo; Live S €80/mo; Pro S €180/mo [S16] [Market data] | not checked | Institutional and professional focus |
| **Kinovea** | Free, open-source desktop annotation: angles, distances, semi-automatic trajectory tracking, two-video sync | Semi-automatic tracking only | **Free** [S17] | n/a | Version 2025.2.0; Windows [S17]. Puig-Diví et al. (2019, *PLOS One*) found coordinate-based angle and distance measures valid, with intra-rater reliability of ICC = 1 (95% CI 0.99–1), at 90°–45° camera angles and 5 m. Error grew as the angle moved away from 90° (about 1.0–1.6 mm at 90° versus 5.7–7.1 mm at 45° on the x-axis), and the authors recommend an orthogonal (90°) view [S18] [Established; a wire lower-limb model in pendular motion, not athletes]. |

**What these mean for us.** These tools are the *instruments* a coach uses; none tells a lone recreational player what to change. Coaches in Australia may already use OnForm, CoachNow or Kinovea, so an export to them, or a coach-share view, is a cheap bridge into coaches' workflows. The Hudl Technique and Coach's Eye shutdowns left a gap for a low-cost mobile analysis tool, which a competitor calls a free-app gap [S14] [Vendor claim; Our inference]. A 2026 price survey by another vendor puts paid general-purpose analysis apps at about US$5–60 a month (VisualEyes US$4.99–14.99; OnForm US$19.99–59.99; CoachNow US$9.99–49.99) [S13] [Market data; vendor-authored].

---

## 5. Court-installed camera systems and B2B AI engines

- **PlaySight SmartCourt.**
  - Club-installed cameras with AI player and ball tracking and automatic highlights. At the November 2024 launch, AI highlights in the PlaySight app were expected to cost **under €5 (≈A$8)** per session, varying by club and country [S19] [Market data; a launch expectation, not a checked current price].
  - Since March 2026 it has been bookable through CourtReserve. Clubs typically set hourly rates of **US$3–8**, and AI analytics need a PlaySight subscription [S20] [Market data].
  - In June 2026 it was named exclusive AI video partner of Flyte Racquet Club (search-index summary; UNVERIFIED detail) [Market data].
  - The PlaySight website returned HTTP 522, so feature detail such as serve speed could not be verified (UNVERIFIED).
- **Wingfield** (Germany).
  - The Wingfield Box is installed at clubs. The baseline camera mounts centrally at **3–4 m** [S23] [Vendor claim].
  - The app offers AI highlights, placement maps, speed data, serve percentages and gamified drills scored 0–100 [S21] [Vendor claim].
  - Players can record some matches on their own smartphone for German ranking (LK) validation [S21][S22] [Vendor claim].
  - App Pro costs **US$9.99/mo or US$89.99/yr (≈A$128)**; rating **4.8 from 61** [S21] [Market data].
  - Box hardware is reportedly about €6,999 plus about €70/month (search snippet; UNVERIFIED).
  - 2025–26 updates: padel (November 2025), coach dashboard (December 2025), DUPR integration (September 2025), pickleball placement maps (February 2026) [S22] [Market data].
- **SportAI** (Oslo; founded 2023).
  - Licenses AI **technique** analysis to booking platforms, clubs, federations, retailers and broadcasters. Its overlays chart swing curves, strike timing, hip and shoulder rotation and swing velocity, and compare them with professionals [S25][S26][S27] [Vendor claim].
  - Raised a US$1.8 M seed round, closed in the weeks before 4 October 2024 (the exact month is UNVERIFIED) [S27] [Market data].
  - Partners: MATCHi (1M+ users, 2,600 venues, 30 countries), Save My Play, Rafa Nadal Academy [S25][S27] [Vendor claim].
  - Search-index summaries describe it as a TIME Best Invention 2025 (UNVERIFIED; not mentioned on SportAI's home page).
  - It now also runs a player-facing web product (open.sportai.com). SportAI's home page announces "SportAI Open Beta is live" (dated 10 September 2026) for coaches and players in tennis, padel and pickleball [S25] [Vendor claim]. Its content and pricing could not be loaded (UNVERIFIED).
  - No public validation data was found [S26] [Market data].

**What these mean for us.** Venue systems solve the camera-placement problem by fixing the camera high on the court, but they tie the player to a club and a booking. SportAI is the most likely route by which **validated-looking technique overlays** could reach Australian players through a booking app or club partner. It is a medium-term threat, and it is also a possible benchmark or licensing partner [Our inference].

---

## 6. Instruction content: TopCourt

- TopCourt offers video lessons from 50+ professionals, including Venus Williams, Chris Evert, Nick Kyrgios and Iga Świątek [S24] [Market data].
- **AU prices:** Basic **A$269.99/yr**; Gold **A$899.99/yr** [S24] [Market data]. The US Basic plan is US$179.99/yr (search-index summary) [Market data].
- It has 3 AU ratings. The AU listing's latest version is 4.4, released 29 February 2024, so the app has not been updated for about 19 months [S24] [Market data; confirmed in fact-check].
- It gives no personal feedback.

**What this means for us.** Recreational players already pay about A$270 a year for *generic* expert instruction. That supports a willingness to pay for personalised serve feedback at or below that level [Our inference].

---

## 7. AI tennis technique apps (the 2024–2026 wave)

| App (developer) | Claims for the serve | Validation published? | Price | Ratings (store) | Observations |
|---|---|---|---|---|---|
| **ServeAI** (serveaiapp.com) | Live skeleton guidance during capture; "measured motion signals"; focused feedback; **one drill + one cue**; deletion controls [S28] | None found | Not disclosed | Unknown | **Closest concept to our brief.** Web and app. |
| **Toach** (Yin Song) | Real-time **serve speed** in km/h or mph from iPhone; swing analysis (unit turn, takeback, contact point, and so on); AI "Coach Tina"; fence or tripod mount [S32] | None found | **A$14.99/mo; A$129.99/yr** (US$9.99 / $79.99); 7-day trial [S32] | 5.0 (6, US) | Speed method not disclosed; iOS 18.5+; collects health and contact data linked to identity [S32] |
| **Axel AI / TENNIS AI 2.0** (Tennis AI LLC, Delaware) | "107" (store) or "109" (website) biomechanical metrics across six stroke phases; live correction; 54 drills; LLM chat coach [S29][S30] | None found; claims alignment with ITF manuals [S29] | **A$9.99/mo; A$99.99/yr; A$2.99 per analysis** [S30]. Website: US$6.99/mo (20 analyses), US$69.99/yr [S29] | Not displayed (AU) | Claims 5,000+ users in 30+ countries [S29] [Vendor claim] |
| **NiceShot – AI Tennis Coach** (Shenzhen Lightyear-Wireless) | Pose-overlay comparison with professional demonstrations; swing-speed metrics; training heat-map calendar [S31] | None | **A$39.99/yr; A$49.99 lifetime** [S31] | 5.0 (1, AU) | Very cheap; says it collects no data [S31] |
| **Tennis AI: USTA–UTR Coach** (Pace Yazılım, Türkiye) | Serve technique scores (swing path, timing, contact point, balance, power); UTR and USTA rating guidance [S33] | None | US$5.99/wk; US$12.99/mo; **US$39.99/yr (≈A$57)**; US$29.99/yr promo [S33] | No rating | Uses UTR/USTA names in its title [S33] |
| **Shot AI** (Suhas Suren) | 12-point skeleton; Shot AI Score 0–10; phase-by-phase breakdown; voice coaching; golf, tennis and pickleball [S34] | None | US$14.99/mo; US$89.99/yr [S34] | 5.0 (2) | Multi-sport and generic |
| **SportsReflector** | Scores 0–100; joint angles; AR overlays; 25 sports [S35] | None | US$14.99/wk; US$59.99/mo; **US$399.99/yr (≈A$570)** [S35] | 4.1 (15) | Aggressive weekly pricing |
| **AXIFY** (Naoki Yamauchi) | 8 joint angles per frame, **on-device**; no account; side-by-side; annotation [S36] | None | US$5.99/mo; $49.99/yr; $149.99 lifetime; 3 free analyses then 1 a day [S36] | No rating | A privacy-first pattern worth noting |
| **ServeOn** (LMU Munich / EXIST-funded) | Apple Watch inertial analysis of the serve: acceleration, racquet rotation, toss timing and height; 3D swing reproduction [S37] | None found | Free | No rating | Last update February 2024; appears dormant [S37] |
| **First Serve: Tennis AI Tracker** | Manual match logging by Apple Watch triple-tap or iPhone [S38] | n/a | Free | 1.0 (1) | Not really AI |

**Pattern.** Every one of these apps shows a skeleton and a score. None publishes an accuracy study, none separates measured from estimated values, and most have very few ratings [S28–S38] [Market data; Our inference]. For the brief this is both an opportunity and a risk. Players have seen many "AI coach" apps with generic tips, so the category may be treated with scepticism. **Visible honesty** (evidence frames, confidence labels, an "experimental" tag) is a real way to stand out [Our inference].

---

## 8. Serve-speed apps and radar

| Tool | How it measures | Setup | Accuracy evidence | Price | Rating / status |
|---|---|---|---|---|---|
| **Speed Gun for Tennis** (James Kent) | The user **taps** at contact and again at arrival; speed = distance ÷ time over a preset distance (max 66.5 ft) | None | Reviewers cite large human timing error [S41] | Free; US$0.99 to remove ads [S41] | 3.9 (63); last update November 2022 [S41] |
| **Tennis Serve Tracker** (2117497 Ontario) | Recognises the court in every frame, reconstructs 3D ball coordinates and computes speed [S40] | iPad on the court | Developer claims it is often better than a radar gun [S40] [Vendor claim] | Free plus premium unlock (about the price of a can of balls) [S40] | 5.0 (1); last update February 2020 [S40] |
| **Tennis Serve Speed Tracker** (Andre Zenner; tennis-serve.com) | **Sound plus video**: detects racquet contact and bounce, reconstructs a 3D path with drag and gravity; you tap four service-box corners to calibrate (30–60 s) [S39] | Tripod near the net; a quiet setting | "Calibrated against a real radar gun" (YouTube comparison; no study) [S39] [Vendor claim] | Free download; **A$14.99 one-off Premium in-app purchase** (the listing ties the radar-calibrated speed algorithm to Premium) [S39] | No rating; v12.3 released 28 August 2026 [S39] |
| **Tennis Radar: Ball Speed Gun** (Jonathan Mercandalli) | Manual: the user marks the top and bottom of the racquet as a scale and the ball position 1–3 frames apart | Side-on, perpendicular view, 60–120 fps [S42] | None | US$4.99 / $0.99 [S42] | 5.0 (1) |
| **Pocket Radar** (Ball Coach PR1000-BC; Smart Coach SR1100) | Doppler radar | Hand-held, in line with the ball's flight | **±1 mph** [Vendor claim] [S43][S44]. Hernández-Belmonte & Sánchez-Pay (2021, *J Sports Sci*): 13 male recreational tennis players, 10 shots each (plus 11 soccer players), against a Stalker radar. Pooled across both sports: **ICC ≥ 0.98, bias ≤ 3.19 km/h, SDC ≤ 7.70 km/h**. In tennis the technical error (SDC 5.49 km/h) was far below shot-to-shot biological variability (≥ 21.95 km/h) [S46] [Established] | Ball Coach **US$299.99; A$489.95–A$499 in AU retail**; Smart Coach (app-connected video + speed) US$399.99 (≈A$570) [S43][S44][S45] [Market data] | Active. **Only the Smart Coach (SR1100) has Bluetooth/app support; the Ball Coach is "NOT COMPATIBLE" with the app** [S43][S44]. OnForm says Pocket Radar connects over Bluetooth, which implies the Smart Coach [S11] [Our inference] |

**Physics note.** A radar reading, the average over the flight (SwingVision) and a speed reconstructed from court calibration are **three different quantities** [Our inference]. Our app must say which one it shows.

**What this means for us.**

- Service-box corner calibration (Tennis Serve Speed Tracker) and stump calibration (Fulltrack) are proven ways to set up a court-plane model from a phone.
- Without a validation study, speed should be shown as an **estimate with a range**, or left out.
- An optional **Pocket Radar or manual radar entry** gives players who own one a real reference and gives us validation data [Our inference].

---

## 9. Tennis sensors: the graveyard

| Sensor | Fate | Date | Why |
|---|---|---|---|
| Zepp Tennis / Tennis 2 | Login and app infrastructure taken offline | about 2020 [S49] (secondary source only) | Zepp was reportedly bought by Huami (now Zepp Health) in 2018 (UNVERIFIED; not stated in S48). A May 2022 article said the sensor worked when all went well, but "75% of the time something goes wrong" [S48] [Market data] |
| Babolat POP wristband | App dead | 23 March 2021 (per S49 only; UNVERIFIED primary) | Partner PIQ Sport Intelligence ceased trading; Babolat stopped all connected-device sales and support on 1 March 2021 [S47][S49] [Market data] |
| Babolat Play racquets | Sales and support ended 1 March 2021; app kept only until **31 December 2021** | 2021 | Babolat stopped connected devices. Users called the racquets "electronically useless" [S47] [Market data] |
| HEAD Tennis Sensor | Removed from stores | 13 September 2021 (per vendor blog; UNVERIFIED) | Built on Zepp infrastructure [S49] |
| Sony Smart Tennis Sensor (SSE-TN1) | Service terminated | 30 September 2021 (per S49 only; Sony's own notice could not be retrieved, as the AU support page returned 403; UNVERIFIED primary) | The server-dependent app was switched off [S49] [Market data] |
| Qlipp | Status uncertain; the website showed no product information when fetched | 2026 | UNVERIFIED [S49] |

**Watch-based alternatives.** Apple Watch serve-speed estimates were described as inaccurate. Gyroscope-based apps were described as more erratic than camera systems [S6] [Market data].

**Adjacent evidence on inertial sensors.** A 2022 study of four commercial baseball bat sensors (Mizuno, Blast, Garmin, Diamond Kinetics) against 16-camera Vicon capture at 500 Hz found that all of them **underestimated** swing speed by 5–17%. Accuracy fell at high swing speeds (above about 31 m/s), and the sensors were not accurate enough to track changes within a player [S65] [Established].

**What this means for us.**

1. No hardware. The phone is enough.
2. **Players' data must survive the company**: exportable sessions, on-device copies, and a published data-portability promise.
3. Speed from a sensor on the wrist or racquet is not a shortcut to accuracy [Our inference].

---

## 10. Adjacent sports: patterns worth copying

### 10.1 Golf

- **Sportsbox AI.**
  - Builds 3D motion from **a single phone video**, with metrics such as sway, turn and tilt, tour benchmarks, practice mode with live data, and an AI assistant ("SAMI") [S51] [Vendor claim].
  - Its **own** validation used 30 golfers, one swing each, against AMM3D electromagnetic capture. It reports about **2° average angular difference** (2.2° at address, 2.5° at top, 2.0° at impact) and **0.2–0.6 in** linear difference [S50] [Vendor claim; not peer-reviewed].
  - Its accuracy depends on "best practices": camera placement, exposure, frame rate and lighting [S50].
  - **AU: A$25.49–A$174.99** for Player plans; Pro A$129.99–A$1,299.99; rating **4.9 (224)** [S51] [Market data].
- **V1 Golf.**
  - Manual drawing tools, automatic ball and skeleton trace, up to 240 fps slow motion, hundreds of professional model swings, drill library, and paid remote coaching memberships [S52][S53] [Vendor claim].
  - **US$9.99/mo or US$119.99/yr**; AU in-app purchases A$14.99–A$199.99; rating **3.7 (55) AU** [S52][S53] [Market data].
- **Swing Profile.**
  - Hands-free **auto-capture**: detects each swing, trims it and replays it in slow motion, then adds automatic swing plane, ball tracking and sway detection [S54] [Vendor claim].
  - **A$7.99–A$19.99/mo**; **4.5 (118) AU** [S54] [Market data].
  - Reviewers praise the instant replay after every shot [S54].
- **Rapsodo MLM2PRO.**
  - Radar plus dual cameras. It separates **measured** metrics (8, including ball speed and spin rate) from **calculated** ones (7, including carry) on its product page [S55] [Vendor claim].
  - **A$899 hardware** (on sale from A$1,099) plus a Premium membership: **A$299.99/yr**, A$549.99 for two years or A$999.99 lifetime (US$199.99/yr); purchases include a 45-day Premium trial [S55] [Market data; AU price confirmed in fact-check].

**Lesson.** The "measured versus calculated" split (Rapsodo) and auto-capture with instant replay (Swing Profile) map directly onto our brief [Our inference].

### 10.2 Baseball and softball pitching

- **Mustard** (QualiaOS).
  - Phone video produces 3D motion analysis. **Key frames are detected automatically**: first movement, max leg lift, foot strike and ball release. It adds a skeleton overlay, a "Report Card", drills and arm care, and records from front and open-side angles [S56] [Vendor claim].
  - US$7.99/mo to US$219.99/yr; **AU A$12.99/mo up to A$599.99 team**; **4.7 (204) US** [S56] [Market data].
- **PitchAI / ProPlayAI** (inside Driveline TRAQ).
  - Needs a single slow-motion landscape video of the whole delivery, with adequate lighting. It reports kinematic sequence, kinematics and kinetics [S58] [Vendor claim].
  - The peer-reviewed validation (Dobos et al., 2022, *Sports Biomechanics*) compared 10 pitchers against marker-based 3D capture. Each pitcher threw 2–3 maximum-effort fastballs. It found **time-series r² 0.69–0.98 and RMSE 4.37–20.78°**, depending on the joint. The arm angles were the worst: the preprint reports mean RMSE of about 14.1° for the glove arm and 12.3° for the throwing arm, against about 6.0° for the pelvis and trunk [S57] [Established]. One co-author (Boddy) is Driveline's founder, a conflict of interest [Our inference].
  - Driveline's free TRAQ facility tier includes **3 PitchAI reports per month** [S58] [Market data].

**Lesson.** A serve is an overhead throwing-like motion. Key-frame detection is feasible and valued, but distal (arm) angles from one 2D camera carry average errors of about 12–14°, and up to about 21° for the worst angle. We should show **positions and timing**, not exact elbow or shoulder angles [Our inference; Established for error sizes].

### 10.3 Cricket: Fulltrack AI (the closest analogue for ball metrics)

- **How it works.**
  - An iPhone or iPad on a tripod "taller than 60 inches" behind the bowler's stumps.
  - **Calibration by lining up both sets of stumps** with on-screen guides, after which virtual stumps overlay the real ones.
  - It then tracks automatically: speed, swing, spin, 3D trajectory, pitch maps and auto-clipped video [S59][S61] [Vendor claim].
- **Independent validation, speed.** Shorter, Tissera, Huynh & Benson (online October 2024; *IJSSC* 20(1):255–263, 2025) are from Swinburne, UniSA, UNE and La Trobe.
  - They compared **1,081 deliveries** against a Stalker Pro IIs radar.
  - The iPhone X was at 1.66 m, 4 m behind the stumps.
  - **Pace ICC 0.87–0.90, CV 2.6–3.1%; spin ICC 0.72–0.76.**
  - Fulltrack **overestimated** speed by 0.72–0.77 m/s for pace and 1.09–1.18 m/s for spin.
  - Limits of agreement exceeded the ±3% threshold.
  - The authors caution that the radar reference itself has been reported to overestimate ball speed against 3D capture (by about 1.7 m/s in an earlier study), so Fulltrack's true error is unknown.
  - In their introduction, the authors note that consumer devices at about 50 fps cannot capture the instant of release, a general point about 2D video rather than a finding of this study [S61] [Established].
- **Independent validation, landing position.** Tissera et al. (2024, *Sports Biomechanics*) compared **836 deliveries** against 3D motion capture.
  - **ICC > 0.96** for line and length. Length SEM was 0.47 m, about seven ball diameters.
  - Error depends on where the ball lands relative to the camera [S62] [Established].
- **Pricing.** AU in-app purchases: Individual A$29.99, A$107.99 or A$179.99; Individual+ Yearly A$450; Coach+ A$229; Coach A$719.99; Club A$149.99 or A$1,199.99. Rating **4.5 (136) AU** [S60] [Market data; corrected in fact-check, as the first draft omitted the A$450 individual tier]. Reviews complain about paywalls ("you have to pay for the most simple parts") [S60] [Market data]. A search-index summary says the free tier allows 75 deliveries a month (UNVERIFIED).

**Lesson for tennis serves.**

- **Calibrate on the court lines, which are known geometry**, the way Fulltrack uses stumps.
- **Landing position can be credible.** Placement in the service box is the tennis equivalent of line and length.
- **Speed from 30–60 fps phone video carries a bias of a few km/h and limits of agreement wider than coaches accept.** Show speed as an estimate and validate it against radar before calling it measured [Our inference].

### 10.4 Basketball: HomeCourt (NEX Team)

- Camera-only shot tracking: make or miss, shot chart by zone, release time, dribble speed, vertical jump, voice feedback and Apple Watch heart rate [S63] [Vendor claim].
- **AU: A$10.99/mo; A$95.99/yr**; rating **4.8 (2,500+)** [S63] [Market data].
- Complaints centre on **camera positioning limits**: errors when the device cannot meet height or distance requirements [S63] [Market data].

**Lesson.** HomeCourt is the proof that a **count-the-outcomes game loop** (makes and a zone chart) can sustain a large, well-rated consumer app at about A$96 a year. Serve-in counting with a landing map is the direct equivalent. Setup friction is the main pain point [Our inference].

### 10.5 Running: Ochy

- Produces "lab-quality" gait analysis from side and rear phone videos: cadence, ground contact time, joint angles and footstrike, plus corrective exercises [S64] [Vendor claim].
- It claims its methods are "underpinned by 200+ peer-reviewed studies", but it cites no validation study of its own [S64] [Vendor claim]. Pricing is not public.

**Lesson.** Pairing an observed fault with a corrective exercise is now expected; citing literature is not the same as validating the product [Our inference].

---

## 11. Master comparison table

Key: ● strong or core · ◐ partial · ○ absent or not found. AUD from the AU App Store unless marked ≈ (converted).

| Product | Serve technique (phases, key frames) | Serve outcome stats (in%, placement) | Speed (method) | Setup for a solo player | Independent validation | Price (AUD) | Rating | Biggest gap for our segment |
|---|---|---|---|---|---|---|---|---|
| **SwingVision** | ○ (none found) | ● in/out, placement, Goal Mode | ◐ average flight speed, vision | Elevated rear view (≥1.5 m; fence mount helps) | ◐ two small studies [S3][S4] | A$149.99–499.99/yr | 4.6 AU / 4.7 US | No mechanics; cost; elevation |
| **ServeAI** | ● skeleton, one cue, one drill (claimed) | ○ not described | ○ | Phone, live guidance | ○ | n/d | n/d | Unknown traction; no outcome stats |
| **Toach** | ◐ strokes; serve speed | ○ | ◐ claimed from iPhone, undisclosed | Fence or tripod | ○ | A$129.99/yr | 5.0 (6) | Unverified speed |
| **Axel AI / TENNIS AI 2.0** | ◐ "107–109 metrics" | ○ | ○ | Phone | ○ | A$99.99/yr | n/d | Metric overload; no validation |
| **NiceShot** | ◐ pro overlay | ○ | ◐ "swing speed" | Phone | ○ | A$39.99/yr | 5.0 (1) | Generic |
| **SportAI** (B2B) | ● technique overlays | ◐ | ○ | Club cameras or partner apps | ○ public | B2B | n/a | Not consumer-direct |
| **Wingfield** | ○ | ● with Box | ● Box | Club Box (3–4 m) | ○ | ≈A$128/yr app + club | 4.8 (61) | Venue-bound |
| **PlaySight** | ○ | ◐ | ◐ (UNVERIFIED) | Club cameras | ○ | ≈<A$8 per highlights (2024 expectation) | n/c | Venue-bound |
| **OnForm** | ◐ manual + skeleton | ○ | ◐ via Pocket Radar | Phone | ○ | from A$7.99/mo (Personal) | 4.8 (692) | Needs interpretation |
| **CoachNow** | ◐ manual + skeleton | ○ | ○ | Phone | ○ | ≈A$84/yr (Analyze, discounted) | n/c | Coach-centric |
| **Dartfish** | ◐ professional manual | ◐ tagging | ○ | Phone/PC | ○ | ≈A$136/yr (Mobile) | n/c | Professional complexity |
| **Kinovea** | ◐ manual angles and tracking | ○ | ◐ manual calibrated | Desktop | ● for static geometry [S18] | Free | n/a | Desktop, manual |
| **Tennis Serve Speed Tracker** | ○ | ◐ net clearance | ◐ sound + video + corner calibration | Tripod near the net | ○ | A$14.99 once | none | Single-purpose |
| **Pocket Radar** | ○ | ○ | ● Doppler, ±1 mph | Hand-held or tripod | ● [S46] | A$489.95–499 | n/a | Hardware, speed only |
| **TopCourt** | ○ (content only) | ○ | ○ | — | n/a | A$269.99/yr | 5.0 (3) | Not personal |
| *Analogue:* **Fulltrack AI** (cricket) | ○ | ● line and length | ● vision + stump calibration | Tripod behind stumps | ● [S61][S62] | A$29.99–450 (individual) | 4.5 (136) | — (pattern to copy) |
| *Analogue:* **Mustard** (baseball) | ● key frames, 3D | ○ | ○ | Phone, front or open side | ○ | from A$12.99/mo | 4.7 (204) | — |
| *Analogue:* **PitchAI** (baseball) | ● kinematics | ○ | ○ | Slow-motion phone video | ● [S57] | Free 3/mo via TRAQ | n/a | — |
| *Analogue:* **Sportsbox** (golf) | ● 3D from one phone | ○ | ○ | Phone, face-on or down-the-line | ◐ vendor [S50] | A$25.49–174.99 | 4.9 (224) | — |
| *Analogue:* **HomeCourt** (basketball) | ○ | ● makes, zones | ○ | Phone at set height and distance | ○ | A$95.99/yr | 4.8 (2.5k) | — |

n/d = not disclosed; n/c = not checked.

---

## 12. Australian App Store price snapshot (read 2026-09-27)

| App | AU monthly | AU yearly | Other AU in-app purchases |
|---|---|---|---|
| SwingVision Plus / Pro / Max | A$22.99 / 39.99 / 59.99 | A$149.99 / 299.99 / 499.99 | — [S2] |
| Toach Pro | A$14.99 | A$129.99 | — [S32] |
| TENNIS AI 2.0 (Axel AI) | A$9.99 | A$99.99 | A$2.99 per analysis [S30] |
| NiceShot | — | A$39.99 | A$49.99 lifetime [S31] |
| TopCourt | — | A$269.99 (Basic) / A$899.99 (Gold) | A$2.99–99.99 extras [S24] |
| OnForm | A$7.99 (Personal); A$14.99 (Individual Standard); A$22.99 (Individual Premium) | A$81.99 (Personal) | Coach A$29.99–59.99/mo or A$399.99/yr; Team A$129/mo [S11] |
| Tennis Serve Speed Tracker | — | — | Free download; A$14.99 one-off Premium [S39] |
| Sportsbox 3D Golf | range A$25.49–174.99 (Player) | | Pro A$129.99–1,299.99 [S51] |
| V1 Golf | range A$14.99–199.99 | | [S53] |
| Swing Profile | A$7.99–19.99 | | [S54] |
| Mustard | from A$12.99 | up to A$599.99 (team) | [S56] |
| Fulltrack AI | range A$29.99–179.99 (Individual) | A$450 (Individual+ Yearly) | Coach A$229–719.99; Club A$149.99–1,199.99 [S60] |
| HomeCourt | A$10.99 | A$95.99 | [S63] |

**Price anchors for an Australian recreational player** [Our inference]:

- Mass-market single-phone AI apps cluster at **A$95–A$150 per year** (HomeCourt, TENNIS AI 2.0, Toach, SwingVision Plus).
- Premium tennis tracking sits at **A$300–A$500 per year** (SwingVision Pro and Max).
- Generic expert content sits at about **A$270 per year** (TopCourt).
- A price of about **A$9.99–A$14.99 a month or A$79.99–A$119.99 a year** would sit below SwingVision Pro and in line with the best-rated single-phone analogues.

---

## 13. White space: what no one does well for recreational servers who practise alone

1. **Serve mechanics and serve outcomes in one loop.**
   - SwingVision knows *what happened*: in or out, where the ball landed, average speed [S1][S8].
   - The pose apps claim to know *how you moved* [S28–S36].
   - We found no product that links the two for a given session, for example "your toss drifted 20 cm right on the serves you missed long" [Our inference].
2. **One prioritised change, then proof it worked.**
   - ServeAI's "one drill, one cue" is the only similar concept found [S28].
   - We found no product that runs an explicit **before/after experiment**: practise the change, record again, compare toss consistency, in-rate and landing spread with confidence intervals [Our inference].
3. **Honest labelling of what was measured and how sure we are.**
   - Among the products we reviewed, only Rapsodo separates measured from calculated metrics [S55] [Our inference].
   - No tennis app labels metrics as measured, estimated, player-entered or unavailable.
   - No tennis app shows uncertainty.
   - Speed is where most tennis apps overclaim or leave the method unclear [S5][S32] [Our inference].
4. **A ground-level tripod as the main camera position.**
   - The incumbent and venue systems want **1.5–4 m of height** [S23][S66].
   - A lone player at a public court usually has a phone clamp or a short tripod.
   - We found no serve product designed first for a **side-on or rear-quarter tripod at 1–1.5 m**, the view that best shows serve phases [Our inference].
5. **Toss and rhythm statistics.** We found no product reporting any of these as trackable statistics [Our inference]:
   - toss height and toss-position consistency;
   - toss-to-contact timing;
   - contact height relative to body height;
   - landing position of the server's front foot.

   These are observable from one side view and are central to recreational serve coaching (see companion biomechanics research).
6. **Service-box calibration for placement from the serving end.**
   - Fulltrack shows that calibration on known geometry gives landing positions with ICC above 0.96 [S62].
   - Tennis Serve Speed Tracker already uses a four-corner service-box tap [S39].
   - We found no technique-focused tennis app that combines this with pose analysis [Our inference].
7. **Skill-level-appropriate coaching for UTR 1–7.** Most AI apps compare users with professionals (SportAI, NiceShot) or score against generic ideals (0–100) [S26][S31][S35]. A recreational player needs "the next best change for *you*", adapted to comfort and injury flags [Our inference].
8. **Data durability and privacy as selling points.**
   - The sensor shutdowns [S47][S49] and one report of a lost match upload on SwingVision [S1] show real user pain.
   - On-device processing (AXIFY) and clear deletion controls (ServeAI) are rare [S28][S36].
   - Australian privacy expectations make this a selling point (see the separate privacy research) [Our inference].
9. **Price.** A prominent Australian SwingVision review objects to A$300 a year [S2]; note that SwingVision's free tier rose to 8 HD hours a month in February 2026, so our free tier must beat a more generous baseline than the old 2 hours [S2]. A serve-only product at roughly half that, with a genuinely useful free tier, has room to position [Our inference].

---

## 14. Competitive threats

- **SwingVision adds pose-based serve technique analysis.** This is the biggest threat. It has the brand, the data (86M+ shots), the Apple relationship and a solo-serve Goal Mode already [S1][S7][S8]. Our defence is serve-specific depth, honest measurement, the ground-level view, the coaching loop, and price [Our inference].
- **SportAI reaches Australia through a booking or club partner**, bringing professional-comparison technique overlays at venues [S25][S27] [Our inference].
- **ServeAI or Toach mature** and win reviews first. They are cheap and fast-moving, and none has a moat except execution [Our inference].
- **Apple platform features.** Apple does not currently ship tennis serve analysis in Fitness or Watch (UNVERIFIED for 2026) [Our inference].

---

## Implications for the product

In priority order:

1. **Build statistics first on geometry we can calibrate.**
   - Ship **serve-in rate, landing map and landing spread** (dispersion ellipse) using **service-box line calibration**, a four-corner tap plus automatic line refinement.
   - Validate against manual annotation, as Fulltrack's validators did [S62].
   - Label these **Measured** only once validated. Until then use **Experimental**.
2. **Make toss and rhythm consistency the signature statistic.** Nobody else reports it [Our inference]. From one side or rear-quarter view, report:
   - toss apex height relative to player height;
   - toss lateral and forward drift;
   - toss-to-contact time;
   - contact height.

   Show each with within-session variability (SD) and a trend. This answers the brief's question "Is my toss becoming more consistent?".
3. **Treat speed carefully.**
   - v1 default is **Unavailable**, or an **"estimated range"** only when calibration and frame-rate prerequisites are met (≥120 fps preferred).
   - Always name the quantity (average versus peak) and never compare it with television radar.
   - Offer **optional Pocket Radar or manual radar entry**, labelled player-entered, and use those pairs to build our own validation set [S46][S61].
4. **Offer one coaching decision per session, with evidence and a re-test.**
   - One change, one cue, one drill, plus key-frame evidence (Mustard-style auto-detected phases [S56]).
   - Then a **"Did it work?" A/B comparison** next session with confidence bands. This is the core difference from both SwingVision and the pose apps.
5. **Design for a tripod at 1–1.5 m.**
   - Primary view: side-on or rear-quarter for technique.
   - Optional second phone or angle from behind and high to unlock placement.
   - Setup guidance with live framing checks, learning from HomeCourt's positioning complaints [S63] and Swing Profile's auto-capture [S54].
6. **Show errors in positions and timing, not precise joint angles.** Single-camera arm angles carry average errors of about 12–14°, and up to about 21° for the worst angle, in the PitchAI validation [S57]. Use qualitative or banded observations for distal joints.
7. **Publish a validation page.** Include sample size, reference method, error and failure cases for every metric. No tennis competitor does this; it is a credibility moat and PR material [Our inference].
8. **Pricing hypothesis for testing (AUD).**
   - Free: 3 analysed sessions a month, full toss and in-rate statistics, one coaching decision.
   - Paid: about **A$12.99/mo or A$99.99/yr**, positioned against SwingVision Pro at A$299.99 [S2].
   - Test sensitivity at A$79.99 and A$129.99 [Our inference].
9. **Promise data durability and privacy.** On-device processing where possible, local copies, export (CSV plus video), clear deletion, and no hardware dependency. Name the sensor shutdowns as the reason [S47][S49].
10. **Use coach tools as a channel, not a competitor.** Add a share or export view that OnForm, CoachNow and Kinovea users can open. Australian coaches can recommend the app for homework between lessons [S10][S15][S17] [Our inference].

---

## Open questions

1. **ServeAI.** Who is behind it, where is it launched (including Australia), what does it cost, how many users does it have, and what does "measured motion signals" mean? This needs a hands-on trial.
2. **SwingVision's serve technique roadmap.** Does "AI Coaching" (Max) already give serve mechanics feedback? The vendor pages could not be loaded, so this needs a hands-on trial on a paid tier.
3. **SwingVision's speed error at recreational serve speeds and low camera heights.** No study covers UTR 1–7 players or tripod-height cameras. We should run our own radar-paired test: SwingVision, our estimate, Pocket Radar and a Stalker if available.
4. **Current SwingVision free-tier allowance.** *Resolved in fact-check:* 8 HD hours a month since v11.9.50 (9 February 2026), per the App Store version notes [S2]. Still to check in the app: which statistics (serve speed, placement, Goal Mode) the free tier includes.
5. **Toach's serve-speed method.** How does it compute speed from an uncalibrated iPhone, and how accurate is it?
6. **SportAI's Australian partners.** Is SportAI, or a PlaySight or Wingfield install, live at any Australian venue or booking platform (for example through a club booking system)? Hand this to the Australian landscape research.
7. **Achievable accuracy at 60, 120 and 240 fps** for toss apex and contact detection on consumer iPhones outdoors. This is unknown and needs our own test set.
8. **PlaySight tennis statistics.** Serve speed and placement could not be verified because the site was down.
9. **Exchange rates.** *Updated in fact-check* to the RBA rates for 25 September 2026 (A$1.42 per US$, A$1.62 per €) [S67]. Recheck before any pricing decision, since the AUD moved about 1.2% against the USD between 23 and 25 September 2026 alone.
10. **Why players churn from SwingVision and the pose apps.** App Store reviews give some signals. Structured interviews with Australian recreational players are needed.

---

## Sources

All accessed 2026-09-27 unless noted.

- **S1** SwingVision: Tennis Pickleball, US App Store listing (ratings, in-app purchases, features, reviews). SwingVision Inc., 2026. https://apps.apple.com/us/app/swingvision-tennis-pickleball/id989461317 (the NZ listing, https://apps.apple.com/nz/app/swingvision-tennis-pickleball/id989461317, was also read for feature text and a lost-upload review).
- **S2** SwingVision: Tennis Pickleball, Australian App Store listing (AUD in-app purchases, 297 ratings, AU reviews). SwingVision Inc., 2026. https://apps.apple.com/au/app/swingvision-tennis-pickleball/id989461317
- **S3** Bilić Z, Dukarić V, Šanjug S, Barbaros P, Knjaz D. "The Concurrent Validity of Mobile Application for Tracking Tennis Performance." *Applied Sciences* 13(10):6195, 2023. https://doi.org/10.3390/app13106195 (abstract read through the Semantic Scholar API; the MDPI page returned 403).
- **S4** Choe J-P, Hwang I-W, Park J-H, Amo C, Lee J-M. "How valid is the commercially available tennis match analysis mobile application? Is it good enough?" *International Journal of Performance Analysis in Sport* 24(1):58–73, 2023/2024. https://doi.org/10.1080/24748668.2023.2268475 (abstract from https://sponet.de/Record/4086599 and https://khu.elsevierpure.com/en/publications/how-valid-is-the-commercially-available-tennis-match-analysis-mob/).
- **S5** "Swingvision Review and Interview." Tennisnerd.net, 30 October 2021. https://www.tennisnerd.net/tennis-tools/swingvision-review-and-interview/25702 (may be outdated for pricing).
- **S6** "Track Tennis on Apple Watch — SwingVision Tennis Stats Review." PersonalWellnessTracking.com, 10 February 2023. https://personalwellnesstracking.com/track-tennis-on-apple-watch-swingvision-tennis-stats-review/
- **S7** "The Real Data Behind Every NTRP Level." SwingVision Blog, 1 September 2026. https://blog.swing.vision/2026/09/01/the-real-data-behind-every-ntrp-level/ (see also "3.0 vs 4.0 Tennis Player Data", 10 August 2026, https://blog.swing.vision/2026/08/10/3-0-vs-4-0-tennis-player-data/).
- **S8** "How to Practice Tennis Alone and Actually Improve." SwingVision Blog, 19 August 2026. https://blog.swing.vision/2026/08/19/how-to-practice-tennis-alone-and-actually-improve/
- **S9** Aubone J-Y. "How I Use SwingVision to Help Players Get Better." Aubone Tennis, c. 2023/24. https://www.aubonetennis.com/blog/howiuseswingvision
- **S10** Onform pricing page. Onform Inc., 2026. https://www.onform.com/pricing (also https://onform.com/).
- **S11** Onform: Video Analysis App, Australian App Store listing. Onform Inc., 2026. https://apps.apple.com/au/app/id1490334045
- **S12** "Onform Acquires Hudl Technique." Onform, 17 May 2021. https://www.onform.com/post/onform-acquires-hudl-technique-app-from-hudl
- **S13** "How Much Do Video Analysis Apps Cost? 2026 Prices Compared." VisualEyes (a competing vendor), 28 August 2026. https://www.visualeyesapp.com/blog/video-analysis-app-pricing-compared
- **S14** "What Happened to Hudl Technique (and What to Use Instead)." VisualEyes (a competing vendor), 2026. https://www.visualeyesapp.com/blog/hudl-technique-replacement
- **S15** CoachNow membership plans. CoachNow, 2026. https://coachnow.com/pricing (also https://coachnow.com/).
- **S16** Dartfish plans and pricing. Dartfish SA, 2026. https://www.dartfish.com/plans/
- **S17** Kinovea home page (version 2025.2.0). Kinovea project, 2025–2026. https://www.kinovea.org/
- **S18** Puig-Diví A, et al. "Validity and reliability of the Kinovea program in obtaining angles and distances using coordinates in 4 perspectives." *PLOS One* 14(6):e0216448, 2019. https://doi.org/10.1371/journal.pone.0216448 (read at https://pmc.ncbi.nlm.nih.gov/articles/PMC6550386/).
- **S19** "PlaySight brings AI highlights to racquet sports." Broadcast, 18 November 2024. https://www.broadcastnow.co.uk/tech-innovation/playsight-brings-ai-highlights-to-racquet-sports/5199271.article
- **S20** "PlaySight SmartCourt now in CourtReserve." CourtReserve, 25 March 2026. https://courtreserve.com/courtreserve-playsight-integration-announcement/
- **S21** Wingfield Sports, US App Store listing. Wingfield GmbH, 2026. https://apps.apple.com/us/app/wingfield-tennis-pickleball/id1417782417
- **S22** Wingfield product updates. Wingfield GmbH, 2025–2026. https://www.wingfield.io/en/products/updates
- **S23** "3.1 Tennis: Mounting the Baseline Camera." Wingfield Help Centre, n.d. https://help.wingfield.io/en/mounting-baseline-camera
- **S24** TopCourt: Tennis & Pickleball, Australian App Store listing. TopCourt Inc., 2026. https://apps.apple.com/au/app/topcourt-tennis-pickleball/id1570477197
- **S25** SportAI home page. SportAI AS, 2026. https://sportai.com/
- **S26** "Game Changer: SportAI uses cutting-edge artificial intelligence to improve performance." Tennis.com, 30 November 2024. https://www.tennis.com/news/articles/game-changer-sportai-uses-cutting-edge-artificial-intelligence-to-improve-performance
- **S27** "AI Is Bringing Technique Coaching to Tennis, with Baseball and Cricket Next in Line." Leaders in Sport Performance Institute, 4 October 2024. https://leadersinsport.com/performance-institute/articles/ai-is-bringing-technique-coaching-to-tennis-with-baseball-and-cricket-next-in-line/
- **S28** ServeAI: tennis serve analysis. ServeAI, 2026. https://serveaiapp.com/en
- **S29** Axel AI by Tennis AI, product page. Tennis AI LLC, 2026. https://tennisai.net/app.html
- **S30** TENNIS AI 2.0 (Axel AI), Australian App Store listing. Tennis AI LLC, 2026. https://apps.apple.com/au/app/tennis-ai-2-0/id6738391148
- **S31** NiceShot – AI Tennis Coach, Australian App Store listing. Shenzhen Lightyear-Wireless Technology Co., 2026. https://apps.apple.com/au/app/niceshot-ai-tennis-coach/id6740051429
- **S32** Toach: AI Tennis Swing Coach, AU and US App Store listings. Yin Song, 2026. https://apps.apple.com/au/app/toach-ai-tennis-swing-coach/id6774433013 ; https://apps.apple.com/us/app/toach-ai-tennis-swing-coach/id6774433013
- **S33** Tennis AI: USTA–UTR Coach, US App Store listing. Pace Yazılım Tasarım A.Ş., 2026. https://apps.apple.com/us/app/tennis-ai-swing-coach/id6760717732
- **S34** Shot AI – Analyze Your Swing, US App Store listing. Suhas Suren, 2026. https://apps.apple.com/app/surge/id6753973996
- **S35** SportsReflector: AI Coach, US App Store listing. SportsReflector Inc., 2026. https://apps.apple.com/us/app/sportsreflector-ai-coach/id6759809796
- **S36** AXIFY: Sports Video Coaching, US App Store listing. Naoki Yamauchi, 2026. https://apps.apple.com/us/app/axify-sports-video-coaching/id6760361606
- **S37** ServeOn – Tennis App, US App Store listing. J. A. Brustle, 2024. https://apps.apple.com/us/app/serveon-tennis-app/id6471379978
- **S38** First Serve: Tennis AI Tracker, US App Store listing. Daniel Oren, 2025. https://apps.apple.com/us/app/first-serve-tennis-ai-tracker/id6449864480
- **S39** Tennis Serve Speed Tracker, Australian App Store listing and product page. Andre Zenner, 2026. https://apps.apple.com/au/app/tennis-serve-speed-tracker/id6741385759 ; https://www.tennis-serve.com/app
- **S40** Tennis Serve Tracker, Australian App Store listing. 2117497 Ontario Inc., 2020. https://apps.apple.com/au/app/tennis-serve-tracker/id981601460
- **S41** Speed Gun For Tennis, US App Store listing. James Kent, 2022. https://apps.apple.com/us/app/speed-gun-for-tennis/id1446168061
- **S42** Tennis Radar: Ball Speed Gun, US App Store listing. Jonathan Mercandalli, 2026. https://apps.apple.com/us/app/tennis-radar-ball-speed-gun/id6762805167
- **S43** Ball Coach Radar (Model PR1000-BC) product page. Pocket Radar Inc., 2026. https://www.pocketradar.com/products/ball-coach-radar
- **S44** Smart Coach Radar (Model SR1100) product page. Pocket Radar Inc., 2026. https://www.pocketradar.com/products/smart-coach-radar
- **S45** Pocket Radar Ball Coach AU retail listings. CMD Sports (A$489.95, sold out), https://cmdsports.com.au/products/pocket-radar-ball-coach ; Greatrex Sporting Goods (A$499), https://www.greatrex.com.au/pocket-radar-ball-coach-radar-model-pr1000-bc
- **S46** Hernández-Belmonte A, Sánchez-Pay A. "Concurrent validity, inter-unit reliability and biological variability of a low-cost pocket radar for ball velocity measurement in soccer and tennis." *Journal of Sports Sciences* 39(12):1312–1319, 2021 (online 30 December 2020). PMID 33377436. https://doi.org/10.1080/02640414.2020.1868090 (abstract through the Semantic Scholar API; the publisher page returned 403).
- **S47** "Babolat Pure Drive Play racket app discontinued and rendered useless." Talk Tennis forum (Tennis Warehouse), thread from 21 September 2022, quoting Babolat's 1 March 2021 notice. https://tt.tennis-warehouse.com/index.php?threads/babolat-pure-drive-play-racket-app-discontinued-and-rendered-useless.736762/
- **S48** "What happened to Zepp?" Racket Source, 13 May 2022. https://www.racketsource.com/articles/what-happened-to-zepp-84d401b1/
- **S49** "Which Tennis Sensors Still Work in 2026? Complete Guide." Auratide Collective (sells a competing sensor, so it has a commercial interest), 2026. https://www.auratidecollective.com/blogs/performance-lab/tennis-sensor-still-works-2026-complete-guide
- **S50** "Sportsbox AI Accuracy." Sportsbox AI Help Centre, n.d. https://help.sportsbox.ai/sportsbox-ai-accuracy
- **S51** Sportsbox 3D Golf, Australian App Store listing. Sportsbox AI, 2026. https://apps.apple.com/au/app/sportsbox-3d-golf/id1578921026
- **S52** V1 GOLF app page. V1 Sports, 2026. https://v1sports.com/athletes/v1-golf-app/
- **S53** V1 Golf: Golf Swing Analyzer, Australian App Store listing. V1 Sports, 2026. https://apps.apple.com/au/app/v1-golf-golf-swing-analyzer/id349715369
- **S54** Swing Profile Golf Analyzer, Australian App Store listing. Swing Profile, 2026. https://apps.apple.com/au/app/swing-profile-golf-analyzer/id1039981052
- **S55** Rapsodo MLM2PRO Launch Monitor + Golf Simulator (AU store). Rapsodo, 2026. https://rapsodo.com.au/products/mlm2pro-mobile-launch-monitor-golf-simulator-au
- **S56** Mustard: Pitching, US and AU App Store listings. QualiaOS Inc., 2026. https://apps.apple.com/us/app/mustard-pitching/id1526812408 ; https://apps.apple.com/au/app/mustard-pitching/id1526812408
- **S57** Dobos TJ, Bench RWG, McKinnon CD, Brady A, Boddy KJ, Holmes MWR, Sonne MWL. "Validation of pitchAI markerless motion capture using marker-based 3D motion capture." *Sports Biomechanics* 24(3):587–607 (online 21 November 2022; issue March 2025). https://doi.org/10.1080/14763141.2022.2137425 (abstract through the Semantic Scholar API; preprint at https://sportrxiv.org/index.php/server/preprint/view/101).
- **S58** PitchAI, Driveline Baseball page (TRAQ integration, free tier, video requirements), 2026. https://drivelinebaseball.com/pages/pitchai ; ProPlayAI PitchAI page, https://proplayai.com/pitchai/
- **S59** Fulltrack AI home page. Fulltrack AI, 2026. https://www.fulltrack.ai/
- **S60** Fulltrack AI, Australian App Store listing. Fulltrack AI, 2026. https://apps.apple.com/au/app/fulltrack-ai/id1568524044
- **S61** Shorter KA, Tissera K, Huynh M, Benson AC. "A comparison of Fulltrack AI application as an alternative to radar gun measured cricket ball delivery speed." *International Journal of Sports Science & Coaching* 20(1):255–263, 2025 (online 1 October 2024). https://doi.org/10.1177/17479541241284714 (full text read from the UNE repository: https://rune.une.edu.au/server/api/core/bitstreams/117c8d6b-dcc0-4848-bdbb-5fb90deae4b5/content).
- **S62** Tissera K, Shorter K, Huynh M, Benson A. "Reliability and validity of the fulltrack AI application to determine cricket bowling line and length compared to 3D motion capture." *Sports Biomechanics*, 2024. https://doi.org/10.1080/14763141.2024.2381108 (abstract through the Semantic Scholar API).
- **S63** HomeCourt: Basketball Training, Australian App Store listing. NEX Team Inc., 2026. https://apps.apple.com/au/app/homecourt-basketball-training/id1258520424
- **S64** Ochy: running gait analysis, home page. Ochy, 2026. https://www.ochy.io/
- **S65** Morishita Y, Jinji T. "Accuracy and Error Trends of Commercially Available Bat Swing Sensors in Baseball." *Sports (Basel)* 10(2):21, 2022. https://doi.org/10.3390/sports10020021 (read at https://pmc.ncbi.nlm.nih.gov/articles/PMC8879135)
- **S66** "How to Film Your Tennis Match for AI Analysis (2026 Guide)." UNFORCE (a competing vendor), 2026. https://unforce.io/how-to/film-your-tennis-match
- **S67** Exchange Rates (daily; AUD/USD 0.7019 and AUD/EUR 0.6170 for 25 September 2026). Reserve Bank of Australia, 2026. https://www.rba.gov.au/statistics/frequency/exchange-rates.html (added in fact-check).
- **S68** Coach's Eye retirement notice. TechSmith, n.d. https://go.coachseye.com/retirement/ (added in fact-check).

---

## Verification log (fact-check 2026-09-27)

**Method.** An independent fact-checker re-checked 40 decision-critical claims on 2026-09-27. The session's web-search budget was already used up, so no new keyword searches could be run. Instead, each claim was checked by fetching the primary source directly: live App Store listings (AU and US), publisher metadata (Crossref), abstracts (Semantic Scholar API, PubMed E-utilities, PMC), a full-text PDF (UNE repository, parsed locally), vendor pricing and help pages, and the Reserve Bank of Australia. Where the author's cited source did not support a claim, the fact-checker looked for another primary source before marking it UNVERIFIED. The edits above are marked "fact-check" or carry the corrected figures.

**Verdict key.** Confirmed = matches the primary source. Corrected = the number, attribution or wording was changed. Unverified = no primary source could be reached, so the claim is now flagged. Removed = the claim was deleted.

| # | Claim (as first written) | Verdict | What the primary source shows | Source |
|---|---|---|---|---|
| 1 | SwingVision AU prices: Plus A$22.99/A$149.99, Pro A$39.99/A$299.99, Max A$59.99/A$499.99 | Confirmed | Exact in-app purchase list on the AU listing | S2 |
| 2 | SwingVision US prices, 4.7 from about 4,900 US ratings, 4.6 from 297 AU ratings, Editors' Choice, iOS 18+ on A12 or later, 752 MB | Confirmed | All match the US and AU listings | S1, S2 |
| 3 | SwingVision free tier is about 8 HD hours a month (UNVERIFIED) | Corrected (upgraded to confirmed) | The version notes for v11.9.50 (9 February 2026) read "New Free Tier! Record 8 hours per month in HD". The 2-hour tier predates this. Open question 4 is marked resolved. | S2, S5 |
| 4 | "Australian reviewers complain about the price" | Corrected | The listing shows one prominent AU review ("Great App But Too Costly and Slow") that raises price and processing speed | S2 |
| 5 | SwingVision speed is about 20% below radar [S5][S6] | Unverified; citation corrected | S5 confirms "average ball speed" but gives no percentage. S6 does not discuss average versus peak. No fetchable source for 20% (swing.vision is a JavaScript app and help.swing.vision does not resolve). | S5, S6 |
| 6 | SwingVision claims within 10% for speed and 5% for placement at 60 fps; the reviewer questions the meaning; a gross error was observed | Confirmed (wording of the error example tightened) | As reported by the reviewer on 10 February 2023 | S6 |
| 7 | NTRP benchmark table: 86M shots, 250,000+ sessions, combined genders; all 25 values | Confirmed | All values match; the km/h conversions check out (for example 59.5 mph = 95.8 km/h) | S7 |
| 8 | Goal Mode, per-serve logging, "serve is highest-value" (tagged Coaching interpretation), toss to be watched rather than measured | Confirmed; tag corrected | The content matches the 19 August 2026 post. The "highest-value" line is vendor marketing, so it was relabelled [Vendor claim]. | S8 |
| 9 | Bilić et al. 2023: n = 5 elite male juniors; ICC stroke detection 0.97, placement 0.83–0.87, speed 0.76–0.80, rotation 0.76 | Confirmed | The abstract matches exactly (mean age 15.6) | S3 |
| 10 | Choe et al.: 6 players, 4 matches, 2 angles, 1,065 strokes; the optimal angle was better; IJPAS 24(1):58–73 | Confirmed | Online 9 October 2023; print 2 January 2024 | S4 |
| 11 | Pocket Radar validation: 13 recreational tennis players × 10 shots; ICC ≥ 0.98; bias ≤ 3.19 km/h; SDC ≤ 7.70 km/h | Confirmed, with a clarification | The thresholds are pooled across soccer (n = 11) and tennis (n = 13 men). Tennis SDC was 5.49 km/h against biological variability of at least 21.95 km/h. Citation pages added (39(12):1312–1319). | S46 (PMID 33377436) |
| 12 | Pocket Radar Ball Coach US$299.99 and ±1 mph; Smart Coach US$399.99; "OnForm integrates it over Bluetooth" | Confirmed on price and accuracy; integration corrected | The Ball Coach PR1000-BC is "NOT COMPATIBLE with Pocket Radar App". Only the Smart Coach SR1100 has Bluetooth, so the OnForm integration must be the Smart Coach. | S43, S44, S11 |
| 13 | Pocket Radar Ball Coach AU retail A$489.95–A$499 | Confirmed | CMD Sports A$489.95 (sold out); Greatrex A$499 (in stock) | S45 |
| 14 | Fulltrack speed (Shorter et al.): 1,081 deliveries; Stalker Pro IIs; iPhone X at 1.66 m, 4 m back; pace ICC 0.87–0.90; spin ICC 0.72–0.76; overestimation 0.72–0.77 and 1.09–1.18 m/s; limits of agreement > 3% | Confirmed; context added | Full text read. Added: the radar reference itself overestimates against 3D capture (about 1.7 m/s in earlier work), and the 50 fps remark is a general point in the introduction. The citation now gives 20(1):255–263 (online 1 October 2024). | S61 |
| 15 | Fulltrack landing (Tissera et al. 2024): 836 deliveries; ICC > 0.96; length SEM 0.47 m (seven ball diameters); error varies with position | Confirmed | The abstract matches (932 recorded, 836 analysed) | S62 |
| 16 | PitchAI (Dobos et al.): 10 pitchers; r² 0.69–0.98; RMSE 4.37–20.78°; arm angles worst; "arm angles about 12–21°" | Confirmed; refined | Preprint arm RMSE: glove arm 14.1°, throwing arm 12.3°, pelvis and trunk 6.0°. The text now says "average 12–14°, up to about 21°". The citation now includes print details (24(3):587–607, 2025). The Boddy conflict of interest is kept as [Our inference] and was not re-verified. | S57 |
| 17 | Kinovea (Puig-Diví 2019): "valid and reliable (ICC 1.0)"; "static rig" | Corrected | ICC = 1 is intra-rater reliability. The test object was a wire lower-limb model in pendular motion, not a static rig. The errors are 1.0–1.6 mm at 90° and 5.7–7.1 mm at 45°. | S18 |
| 18 | Sportsbox: 30 golfers, one swing each, AMM3D, about 2° (2.2 / 2.5 / 2.0°), 0.2–0.6 in | Confirmed (vendor-authored; correctly tagged [Vendor claim]) | Matches the help-centre page | S50 |
| 19 | Bat sensors: 4 sensors against 16-camera Vicon; underestimated 5–17%; worse above 30 m/s; could not track within-player change | Confirmed; detail added | Vicon at 500 Hz; the threshold is about 31.3 m/s; citation now gives *Sports* 10(2):21 | S65 |
| 20 | Babolat Play: sales and support ended 1 March 2021; app until 31 December 2021 | Confirmed | Babolat's notice as quoted in the forum thread | S47 |
| 21 | Sony (30 September 2021), HEAD (13 September 2021), Babolat POP (23 March 2021), Zepp (about 2020) shutdown dates | Unverified (primary) | All come only from S49, a site that sells a competing sensor. Sony's AU support page returned 403 and the Sony global pages returned 404. Flagged in the table and the executive summary. | S49 |
| 22 | Zepp bought by Huami in July 2018 [S48] | Unverified; attribution corrected | S48 does not mention the acquisition. Wikipedia pages could not be reached. S48's "75% of the time something goes wrong" quote is confirmed, but the "Bluetooth" detail is not in it and was removed. | S48 |
| 23 | OnForm bought Hudl Technique on 17 May 2021; the app was phased out that summer; migration closed October 2021 | Confirmed | OnForm's announcement and a VisualEyes blog | S12, S14 |
| 24 | Coach's Eye shut down September 2022 | Partly confirmed | TechSmith's page confirms retirement after 11 years (launched about 2011) but gives no date. The month rests on a competitor blog. | S68, S14 |
| 25 | SportAI: Oslo, founded 2023, US$1.8M seed in August 2024, MATCHi 1M+ users, 2,600 venues, 30 countries | Mostly confirmed; date corrected | Founding in 2023 confirmed by S26. The seed round "closed weeks before" 4 October 2024, so the month is unverified. MATCHi figures confirmed. The SportAI home page shows "Open Beta is live" dated 10 September 2026 (added). | S25, S26, S27 |
| 26 | SportAI TIME Best Invention 2025 | Unverified (unchanged) | Not on SportAI's home page, and no search was possible | S25 |
| 27 | FX working rates A$1.52 per US$ and A$1.75 per € | **Corrected** | RBA, 25 September 2026: AUD/USD 0.7019 (A$1.42) and AUD/EUR 0.6170 (A$1.62). All converted figures were recalculated: CoachNow ≈A$84, Dartfish ≈A$136, PlaySight ≈A$8, Wingfield ≈A$128, Tennis AI (USTA–UTR) ≈A$57, SportsReflector and Smart Coach ≈A$570. The AU-to-US App Store ratio analysis was updated. | S67 |
| 28 | OnForm AU pricing (Individual Standard A$14.99 was shown as the entry price) | Corrected | A cheaper Personal tier exists at A$7.99/mo or A$81.99/yr. Also listed: Individual Premium A$22.99 and Coach A$42.99/mo or A$399.99/yr. The US prices on the pricing page match. | S11, S10 |
| 29 | Fulltrack AU pricing "A$29.99–179.99 individuals, up to A$1,199.99 teams" | Corrected | Individual+ Yearly is A$450, Coach+ A$229, Coach A$719.99, and Club (not "team") A$149.99–A$1,199.99 | S60 |
| 30 | CoachNow US$59/yr (Analyze), PRO US$499/yr, Academy US$899/yr | Confirmed; note added | US$59 and US$499 are shown as discounts from US$119 and US$600 | S15 |
| 31 | Dartfish Mobile €7/mo billed annually; "Pose/AI only in top tier" | Price confirmed; pose/AI claim unverified | The pricing page does not say which tier has pose/AI | S16 |
| 32 | TopCourt A$269.99 and A$899.99 per year; 3 ratings; last update early 2024 (UNVERIFIED) | Confirmed; UNVERIFIED removed | v4.4 released 29 February 2024 | S24 |
| 33 | Rapsodo MLM2PRO A$899; 8 measured and 7 calculated metrics; AU Premium A$299.99/yr (UNVERIFIED) | Confirmed; UNVERIFIED removed | AU store lists A$299.99/yr, A$549.99 for two years and A$999.99 lifetime | S55 |
| 34 | HomeCourt A$10.99/mo and A$95.99/yr, 4.8 (2.5K), positioning complaints | Confirmed | Matches the AU listing | S63 |
| 35 | Toach A$14.99/A$129.99 with a 7-day trial and iOS 18.5+; TENNIS AI 2.0 A$9.99, A$99.99 and A$2.99 with "107 metrics"; NiceShot A$39.99 and A$49.99 with no data collected | Confirmed | Matches the AU listings; Axel's website "109 metrics", "5,000+ users" and US$6.99/US$69.99 also confirmed as vendor claims | S29–S32 |
| 36 | Tennis Serve Speed Tracker "A$14.99 one-off"; v12.3 August 2026 | Corrected (clarified) | Free download with an A$14.99 Premium in-app purchase (radar-calibrated speed is tied to Premium). v12.3 was released on 28 August. | S39 |
| 37 | Wingfield Pro US$9.99/mo and US$89.99/yr, 4.8 (61), LK smartphone validation, baseline camera at 3–4 m | Confirmed | Matches the US listing and the help centre | S21, S23 |
| 38 | PlaySight highlights "under €5"; CourtReserve integration March 2026 at US$3–8 an hour | Confirmed; wording tightened | "Under €5" was a November 2024 launch expectation. CourtReserve announced on 25 March 2026 that US$3–5 an hour is most common. | S19, S20 |
| 39 | UNFORCE guide: 2.4–3 m, "60 fps minimum", 1080p, landscape | Corrected | The guide recommends 60 fps but says 30 fps is acceptable. The height matches. | S66 |
| 40 | ServeAI: live skeleton guidance, "measured motion signals", one drill and one cue, deletion controls; pricing undisclosed | Confirmed (vendor claim) | Home page matches. No company, country, users or validation disclosed. | S28 |

**Evidence-tag audit.** One mislabel was fixed: the SwingVision "highest-value" line moved from [Coaching interpretation] to [Vendor claim]. Four shutdown dates rested on a commercially interested secondary source (S49) without saying so, and they are now flagged. The OnForm–Pocket Radar Bluetooth link is now tagged [Our inference]. The Sportsbox self-validation is correctly tagged [Vendor claim; not peer-reviewed]. The peer-reviewed studies (S3, S4, S18, S46, S57, S61, S62, S65) are correctly tagged [Established], and their small samples are disclosed. No invented citations or DOIs were found; every DOI checked resolves to the stated paper.

**Residual risk.** The main unverified items that could change a decision are: (a) the "about 20% below radar" SwingVision figure; (b) what SwingVision's Max "AI Coaching" covers; (c) the non-Babolat sensor shutdown dates; (d) SportAI's Australian presence. None of these changes the document's core conclusions. The corrections that matter most for decisions are the exchange rate (converted USD and EUR prices were about 7–8% too high) and SwingVision's larger free tier (8 HD hours a month), which raises the bar for our free experience.
