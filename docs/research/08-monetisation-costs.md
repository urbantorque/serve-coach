# 08 — Monetisation, cost per analysis, acquisition and validation (Australia)

**Prepared:** 2026-09-27 · **Scope:** comparable pricing in AUD, the cost of analysing each serve video under three architectures, subscription benchmarks, Australian acquisition channels, and the metrics and experiments needed to validate retention, coaching usefulness and willingness to pay · **Audience:** founder, product, engineering

---

## How to read this document

**Evidence labels:** [Established] peer-reviewed or strong consensus · [Coaching interpretation] expert practice, not directly proven · [Vendor claim] a company says so, unverified · [Market data] prices, benchmarks, participation figures · [Regulation] law or platform rule · [Our inference] our own reasoning or arithmetic. **UNVERIFIED** marks anything we could not confirm from a primary page.

**Currency.** The RBA published A$1 = US$0.7019 on 25 September 2026 [S40]. We therefore use **A$1.4247 per US$1** (rounded to A$1.42 in prose) and A$1.62 per €1. Companion document 01 used A$1.52 per US$1 [S71]; that working rate is now superseded, and USD conversions there read about 7% too high. Australian App Store prices include GST (see §3).

**Method and limits.** The session's web-search budget was exhausted before this workstream began. We therefore worked only from **direct fetches of known primary pages**: App Store listings, vendor pricing pages, AWS price-list files, Anthropic, Google and Apple documentation, RevenueCat's reports, and Australian coaching and venue sites. Where a figure comes from companion documents 01 or 02 (read on the same date) and we did not re-fetch it, the source line says so. The following pages returned 403, 404 or were JavaScript-only, so their details are UNVERIFIED:

- the ATO GST pages (the fact-check later retrieved the main ATO page by a direct HTTP request; see §3 and the verification log);
- WHOOP's Australian pages;
- UTR Power's Australian price;
- current Apple Ads (Search Ads) benchmark reports;
- YouTube channel statistics;
- Intuitive Tennis's video-analysis price.

---

## 1. Executive summary

1. **Price anchors in Australia fall into three bands** [Market data; Our inference]:
   - **Mass-market single-phone sports AI: about A$96–A$130 a year.**
     - HomeCourt: A$95.99/yr [S16].
     - Strava: A$99.99/yr [S18].
     - TENNIS AI 2.0: A$99.99/yr [S3].
     - Toach: A$129.99/yr [S2].
   - **Premium tennis tracking: A$150–A$500 a year.** SwingVision Plus, Pro and Max cost A$149.99, A$299.99 and A$499.99 [S1].
   - **Human feedback: A$50–A$85 for 30 minutes.** That is the price of a private lesson in Australian capitals [S23–S28].
2. **Recommended launch offer.**
   - Price: **A$14.99 a month or A$99.99 a year** ("Serve Coach Plus"), with a 7-day trial on the annual plan.
   - Price tests: A$79.99/yr and A$129.99/yr.
   - Also test a non-renewing **A$39.99 "season pass"** aligned with pennant seasons.
   - Net proceeds under the Small Business Program: **A$11.58 a month or A$77.26 a year** (§3).
   - The free tier should give away **one complete coaching loop** (baseline → change → re-test) and then meter analysed sessions [Our inference].
3. **Architecture drives cost more than model choice does** [Our inference; arithmetic in §4]. Marginal cost per *typical* active user (6 sessions a month):
   - **Fully on-device:** about **A$0.01 a month**.
   - **Hybrid** (on-device vision plus a cloud LLM for coaching text): **A$0.13–A$0.29**.
   - **Cloud** (GPU inference plus video storage in Sydney): **A$1.07–A$1.68**.

   Cloud processing does not break the paid tier. It does make a generous free tier expensive, because free users outnumber payers several times over.
4. **Cloud GPU arithmetic.**
   - A 1080p60 minute has 3,600 frames. At about 10 ms of GPU time per frame (pose plus ball detection plus decode), that is **36 GPU-seconds per video-minute**.
   - That costs **US$0.005–0.013 (A$0.007–0.019) per video-minute** at list prices on L4 or T4-class GPUs [S52–S56].
   - A dedicated AWS g6.xlarge in Sydney costs **US$1.0464 an hour, or about A$1,088 a month if always on** [S55]. At beta scale that idle floor is the dominant cloud cost, so serverless per-second GPUs are cheaper until utilisation is high [Our inference].
5. **LLM coaching text is cheap if it is fed structured metrics rather than video.**
   - Per session: about **A$0.011 on Claude Haiku 4.5** and **A$0.027 on Claude Sonnet 5**, using list prices of US$1/US$5 and US$2/US$10 per million tokens [S60] and the prompt caching described in §4.4.
   - Adding six key-frame images roughly doubles the Sonnet 5 cost, to about A$0.05 per session [S61].
   - Apple's on-device Foundation Models framework offers inference "free of cost" on supported devices [S51].
6. **Subscription benchmarks (RevenueCat 2026, Health & Fitness medians)** [S63] [Market data]:
   - **6.9%** download-to-trial (D30);
   - **37.7%** trial-to-paid;
   - **2.9%** download-to-paid (D35);
   - median prices **US$9.99 a month and US$39.94 a year**;
   - about **68% annual, 24% monthly and 4% weekly** by subscriptions sold (corrected by fact-check: the report's chart data give Health & Fitness 68.4% yearly and 23.8% monthly; one caption in the report wrongly calls the category "monthly-heavy").
   - Asia-Pacific, which includes Australia, is weaker: **31.9%** trial-to-paid and **2.4%** download-to-paid.
   - RevenueCat 2025: annual plans kept **44.1%** of subscribers after 12 months against **17.0%** for monthly plans [S64]. **Fact-check caveat:** the 2026 edition reports much lower *medians*: first annual renewal 25.2% across all apps (28.8% the prior period) and **24.6% for Health & Fitness**; Health & Fitness subscribers retained after one year are 24.4% (yearly) and 8.5% (monthly) [S63]. The two editions appear to use different bases (method UNVERIFIED), so plan on about **25%** first annual renewal, not 44%.
7. **Paid ads are unlikely to pay back at launch.**
   - At the median 2.9% download-to-paid, a A$40 cost per payer allows a maximum **cost per install of A$1.16** [Our inference].
   - We could not verify Australian Apple Ads cost-per-tap benchmarks (UNVERIFIED).
   - Launch acquisition should therefore run through **coaches, clubs and pennant teams, court-booking touchpoints and hitting-partner communities**.
   - Reach figures from doc 02 [S32–S37]:
     - 3,766 Tennis Australia coach members;
     - 419 Victorian Pennant teams;
     - more than 1 million online court-hire hours a year;
     - Facebook hitting-partner groups of 17.4K, 13.6K and 5.2K members.
8. **Validation should run as three gates:**
   - a closed beta;
   - an Australian soft launch;
   - a scale decision.

   Each gate has explicit thresholds (§8). Price A/B tests need about **2,500 installs per arm** to detect a 3% → 4.5% change in download-to-paid [Our inference], which is more than an Australian beta will produce. Early pricing evidence must therefore come from Van Westendorp / Gabor–Granger surveys and paywall fake-door tests.

---

## 2. Comparable pricing (AUD)

### 2.1 Tennis and serve apps

| Product | Monthly | Yearly | Other | Notes | Source |
|---|---|---|---|---|---|
| SwingVision Plus / Pro / Max | A$22.99 / A$39.99 / A$59.99 | A$149.99 / A$299.99 / A$499.99 | Free tier: **8 hours of HD recording a month** | 4.6★ (297 AU ratings); updated about 25 Sep 2026 | [S1] [Market data] |
| Toach Pro | A$14.99 | A$129.99 | 7-day trial | AI swing coach, claims serve speed | [S2] (via doc 01) |
| TENNIS AI 2.0 (Axel AI) | A$9.99 | A$99.99 | **A$2.99 per analysis** | A per-analysis price anchor | [S3] (via doc 01) |
| NiceShot | — | A$39.99 | A$49.99 lifetime | Low-price outlier | [S4] (via doc 01) |
| TopCourt (content) | — | A$269.99 Basic / A$899.99 Gold | — | Video lessons, no personal feedback | [S5] (via doc 01) |
| Intuitive Tennis membership | US$19.99 (≈A$28.48) | US$199.99 (≈A$284.92) | Separate "video analysis" and Zoom lessons; price not retrievable (403) | Currency shown as "$"; USD assumed (UNVERIFIED) | [S6] [Market data] |
| UTR Power (UTR Sports) | Country-based pricing since 2 Oct 2025; **AU price UNVERIFIED**; the help page says Australian players with a Tennis Australia ID get discounted rates | — | College US$149, high school US$99 | Features: two-decimal UTR, performance stats, "Rally" chatbot, partner discounts | [S7] [Market data] |

Two points stand out.

- **SwingVision's free tier is now 8 HD hours a month** [S1]. This resolves an open question in doc 01, which had it at 2 hours. Our free tier will be compared with a generous incumbent [Our inference].
- **TENNIS AI 2.0's A$2.99 per-analysis price** is the only per-use tennis price we found [S3]. It suggests a consumable "single analysis" purchase is acceptable in this category [Our inference].

### 2.2 Adjacent single-phone sports analysis apps (AU App Store, read 2026-09-27)

| App (sport) | AU prices | Rating | Source |
|---|---|---|---|
| HomeCourt (basketball) | A$10.99/mo; A$95.99/yr | 4.8★ (2.5K) | [S16] |
| Sportsbox 3D Golf | Player A$25.49 and A$174.99; Pro A$129.99 and A$1,299.99 (periods not labelled on the listing) | 4.9★ (224) | [S12] |
| V1 Golf | In-app purchases A$14.99–A$199.99 | 3.7★ (55) | [S13] (via doc 01) |
| Mustard (pitching) | Monthly Premium A$12.99; Athlete A$29.99 / A$149.99; Family A$39.99 / A$359.99; teams to A$1,199.99 | Not enough ratings shown | [S14] |
| Fulltrack AI (cricket) | Individual A$29.99 / A$107.99 / A$179.99; Individual + Yearly A$450; Coach A$229–A$719.99; Club A$149.99–A$1,199.99 | 4.5★ (136); reviews complain about paywalls | [S15] |

All rows are [Market data]. Sportsbox's A$25.49 and A$174.99 Player prices look like a monthly and annual pair [Our inference].

### 2.3 Consumer fitness subscriptions (willingness-to-pay context)

| Product | Price | Source |
|---|---|---|
| Strava | A$14.99/mo (App Store); **A$99.99/yr**; Family A$169.99/yr (4 accounts); **Strava + Runna A$199.99/yr**; 30-day trial | [S17][S18] [Market data] |
| Runna | Web: $19.99/mo, $119.99/yr (currency not shown; USD assumed, ≈A$28.48 / A$170.95; UNVERIFIED); 7-day trial. AU App Store lists "Runna Standalone" at A$29.99 (period not stated) | [S19][S18] |
| Oura membership | US$5.99/mo, US$69.99/yr (≈A$8.53 / A$99.71). AU price not listed; one AU review mentions about $10 a month (UNVERIFIED) | [S20][S21] |
| WHOOP | AU membership price **UNVERIFIED**. AU pages returned 403; the App Store listing shows no in-app prices; reviews mention about A$400/yr (weak evidence) | [S22] |

**Reading.** Australians already pay about **A$100 a year** for single-sport digital coaching and tracking (Strava, HomeCourt). A Strava + Runna bundle at A$199.99 shows that a "plan plus tracking" product can command about double that [Market data; Our inference].

### 2.4 Coach video tools

| Product | Price | Source |
|---|---|---|
| OnForm | Personal A$7.99/mo or A$81.99/yr; Individual Standard A$14.99/mo (A$39.99 quarterly); Individual Premium A$22.99/mo; Coach Basic A$29.99/mo; Coach A$42.99/mo or A$399.99/yr; Coach Standard (1 seat) A$59.99/mo; Team/Academy A$129/mo. 4.8★ (692) | [S9] [Market data] |
| CoachNow | Analyze US$9.99/mo or **US$59/yr (≈A$84)**; PRO US$49.99/mo or US$499/yr (≈A$711); Academy US$89.99/mo or US$899/yr (≈A$1,281). All plans list skeleton tracking and angle detection | [S10] [Market data; Vendor claim for features] |
| Hudl Technique | Discontinued after OnForm bought it (May 2021) | [S11] (via doc 01) |

**Reading.** A coach who already pays A$30–A$60 a month for OnForm will not pay again for serve analysis. That favours **free coach seats with the student paying** [Our inference].

### 2.5 Human coaching and court hire in Australia (sampled September 2026)

| Provider (city) | 30-min private | 60-min private | Shared / group | Paid video analysis advertised? | Source |
|---|---|---|---|---|---|
| Camperdown Tennis (Sydney) | A$85 (A$75 in 5-pack) | A$130 (A$120) | 1:2 A$150/hr; group of 4 A$200/hr; hitting partner A$100/hr | No | [S23] |
| City Community Tennis (Sydney) | — | A$125–A$140 (members A$110–A$125) | Shared 2–4 players A$168 | No | [S26] |
| Victorian Tennis Academy (Melbourne) | A$65–A$70 | A$110–A$115 (packs A$99–A$105) | Groups of 2–4 from A$53–A$58 per person | No | [S24] |
| Toptenn (Melbourne) | A$60–A$70 | A$100–A$110 | Groups of 3–6: A$115/hr | No | [S25] |
| Active Tennis Coaching (Canberra) | A$60 (5-pack) | A$98 (A$88 in 10-pack) | 3–4 players A$120/hr | No | [S27] |
| Tennis Approach (Perth) | A$60 (1–2 players) | A$110 | 9-week group A$260; Cardio A$32.50 | No | [S28] |

**Court hire.**

- Tennis World Melbourne: **A$35–A$46 an hour outdoors** and A$53–A$64 indoors. Non-members can book only 24 hours ahead [S29].
- Rushcutters Bay, Sydney: A$32 an hour [S30] (via doc 02).
- Wangaratta, regional Victoria: visitors from A$20 an hour, with PIN-code gate and light access [S31] (via doc 02).

All [Market data].

**Paid video analysis.** None of the seven Australian coaching providers we sampled advertises a standalone video-analysis product [S23–S28] [Market data]. Internationally, Intuitive Tennis sells one beside its US$19.99/mo membership [S6]. Our reading is that paid remote serve review is rare in Australian coach price lists [Our inference; small sample].

### 2.6 What the anchors imply

- **A$99.99/yr sits at the mass-market anchor.** It is:
  - the same as Strava and TENNIS AI 2.0;
  - A$4 above HomeCourt;
  - one-third of SwingVision Pro;
  - less than two 30-minute private lessons.

  [Our inference]
- **A$14.99/mo matches Strava and Toach**, and is about 20% of one hour's private lesson [Our inference].
- **The A$9.99/mo, A$39.99/yr tier is crowded with low-trust apps** (for example NiceShot at A$39.99/yr). For reference, the RevenueCat Health & Fitness median annual price is US$39.94 [S63], which is about **A$57** at our exchange rate, not A$39.99 (currency clarified by fact-check). Pricing at the bottom of the range would signal "another AI tip app" rather than a coach [Our inference].

---

## 3. Revenue mechanics: Apple commission, GST and payouts

- **Commission.**
  - The App Store Small Business Program charges **15%** to developers with no more than US$1M in proceeds in the prior and current calendar year. New developers qualify automatically [S41] [Regulation].
  - Outside the program, auto-renewing subscriptions pay 70% in year 1 and 85% after one year of paid service; free trials do not count towards that year. Small Business Program members get 85% from the start [S42] [Regulation].
- **GST.**
  - Australian App Store prices are shown GST-inclusive [S1][S71] [Market data].
  - Apple says proceeds and its commission are calculated **after the deduction of VAT** when tax rates change [S43] [Regulation]. We apply the same treatment to GST.
  - Since 1 July 2017, GST has applied to imported services and digital products (including apps) sold to Australian consumers, and electronic distribution platform (EDP) operators such as app stores can be the party responsible for that GST (ATO guidance LCR 2018/2). **Confirmed by fact-check** from the ATO page, retrieved by a direct HTTP request after WebFetch returned 403 [S46] [Regulation]. The page covers *offshore* suppliers; how GST works for an Australian-resident developer selling through Apple still needs accountant advice.
  - An Australian GST-registered developer should get accountant advice on the developer-side treatment (for example GST on Apple's commission invoices and input tax credits) (UNVERIFIED).
- **Payouts.** Apple pays within **45 days of the end of the fiscal month** [S44] [Regulation]. This matters for cash flow when paying coaches' referral fees.
- **Subscription tooling.** RevenueCat is free up to **US$2,500 monthly tracked revenue**, then 1% of tracked revenue, measured before Apple's cut [S47] [Market data].
- **Web sales (club or coach bundles).** Stripe charges **1.7% + A$0.30** for domestic cards and 3.5% + A$0.30 for international cards, GST-inclusive [S48] [Market data]. **Update from fact-check:** because the RBA is lowering interchange caps, Stripe's online domestic rate falls to **1.65% + A$0.30 from 1 October 2026**, and its international rate falls to **2.80% + A$0.30 from 1 April 2027** [S73] [Market data].
- **Purchase rules.**
  - Digital features must use in-app purchase.
  - Subscriptions must last at least 7 days and give ongoing value.
  - Trial terms must be disclosed.
  - Only *real-time* one-to-one services (such as a live Zoom lesson) may use other payment methods.
  - External purchase links are allowed without an entitlement only on the **US** storefront [S45] [Regulation].
  - An *asynchronous* coach video review sold in-app is not real-time, so it would need in-app purchase [Our inference].

**Proceeds per price point (A$; GST 10% removed first, then Apple's commission)** [Our inference; arithmetic]

| Consumer price | GST | Ex-GST | Apple 15% | **Proceeds (Small Business Program)** | Proceeds at 30% (reference) |
|---|---|---|---|---|---|
| A$9.99 /mo | 0.91 | 9.08 | 1.36 | **7.72** | 6.36 |
| A$12.99 /mo | 1.18 | 11.81 | 1.77 | **10.04** | 8.27 |
| A$14.99 /mo | 1.36 | 13.63 | 2.04 | **11.58** | 9.54 |
| A$19.99 /mo | 1.82 | 18.17 | 2.73 | **15.45** | 12.72 |
| A$39.99 season pass | 3.64 | 36.35 | 5.45 | **30.90** | 25.45 |
| A$79.99 /yr | 7.27 | 72.72 | 10.91 | **61.81** | 50.90 |
| **A$99.99 /yr** | 9.09 | 90.90 | 13.63 | **77.26** (A$6.44/mo) | 63.63 |
| A$129.99 /yr | 11.82 | 118.17 | 17.73 | **100.45** | 82.72 |

---

## 4. Cost to analyse each video

### 4.1 Workload assumptions

All assumptions are [Our inference], to be replaced by measurements.

- **One session is 25 serves.**
  - On-device auto-trimming keeps about 4 seconds per serve (toss to landing), so each session holds about **2 minutes of 1080p at 60 fps**, which is **7,200 frames**.
  - At about 100 MB per minute for HEVC 1080p60, the trimmed originals come to about **200 MB per session**. The file-size rate is UNVERIFIED.
  - A 720p playback proxy is about 50 MB, and about 10 key-frame JPEGs total about 1.5 MB.
- **Usage levels per active user a month:** light 3 sessions, typical 6, heavy 12.
- **Coaching text** is generated from *structured* outputs (metrics, phase timings, confidence flags, player profile, previous focus), not raw video. The components per call are:

  | Component | Tokens |
  |---|---|
  | Stable system prompt (framework, safety rules, cue and drill library extract) | about 4,000 |
  | Session-specific input | about 2,500 |
  | Output | about 900 |

  Newer Claude models (4.7 and later) use a tokenizer that produces about 30% more tokens for the same text [S60]. We therefore scale Sonnet 5 token counts by 1.3.

### 4.2 Fully on-device

- **What runs.**
  - Apple's Vision framework provides human body-pose detection on iOS 14 and later [S50].
  - A custom Core ML model can add ball detection and toss tracking.
  - Coaching text can come from a deterministic rules engine, or from Apple's **Foundation Models framework**. This gives on-device access to the Apple Intelligence model, works offline, and is "free of cost" [S51] [Vendor claim].
  - Foundation Models needs an Apple Intelligence-capable device, so older iPhones need a templated fallback (the device list is UNVERIFIED in this pass).
- **Compute scale.** For comparison, Ultralytics reports **YOLO26s-pose at 2.7 ms per frame** and **YOLO26n-pose at 1.8 ms** on an NVIDIA T4 with TensorRT (640 px input), and 40–85 ms per frame on CPU through ONNX [S49] [Vendor claim].
- **Time and battery (UNVERIFIED; needs device benchmarks)** [Our inference]:
  - At 5–10 ms per frame on the Neural Engine for pose plus ball detection, a 7,200-frame session takes about **40–70 seconds**.
  - At about 5 W for about 60 s, that is about 0.08 Wh, or **under 1% of a roughly 13 Wh iPhone battery**.
  - Subsampling to 30 fps outside the toss-to-contact window roughly halves this.
- **Marginal cloud cost: close to zero.** We allow **US$0.005 (A$0.007) per user a month** for analytics, crash reporting and remote configuration, assuming free tiers. User data stays on the device or in the user's own iCloud [Our inference].

### 4.3 Cloud GPU inference (per video-minute)

**Arithmetic.**

- 60 fps × 60 s gives **3,600 frames per video-minute**.
- A **baseline pipeline at about 10 ms of GPU time per frame** covers:
  - small pose model (about 2.7 ms on T4 [S49]);
  - small ball detector (about 3 ms, assumed);
  - decode and pre/post-processing (about 4 ms, assumed).

  This gives **36 GPU-seconds per video-minute**.
- A **heavier pipeline at about 30 ms per frame** (larger models, a temporal ball tracker, 2D-to-3D lifting) gives **108 GPU-seconds**.

**List prices, US$ (A$ at 1.4247).** The last two columns assume 100% utilisation.

| Provider and GPU | Price | Per video-minute @10 ms/frame | @30 ms/frame | Source |
|---|---|---|---|---|
| Modal L4 (serverless, per second) | US$0.000222/s (US$0.80/hr) | **US$0.0080 (A$0.011)** | US$0.024 (A$0.034) | [S52] |
| Modal T4 | US$0.000164/s | US$0.0059 (A$0.008) | US$0.018 (A$0.025) | [S52] |
| Replicate T4 (public models) | US$0.000225/s | US$0.0081 (A$0.012) | US$0.024 (A$0.035) | [S53] |
| RunPod serverless L4 | US$0.69/hr | US$0.0069 (A$0.010) | US$0.021 (A$0.030) | [S54] |
| RunPod Secure pod L4 | US$0.49/hr | US$0.0049 (A$0.007) | US$0.015 (A$0.021) | [S54] |
| **AWS g6.xlarge (1× L4), Sydney** | **US$1.0464/hr** on-demand | US$0.0105 (A$0.015) | US$0.031 (A$0.045) | [S55] |
| AWS g5.xlarge (1× A10G), Sydney | US$1.308/hr | US$0.0131 (A$0.019) | US$0.039 (A$0.056) | [S55] |
| AWS g6.xlarge, us-east-1 (reference) | US$0.805/hr; spot US$0.623 | US$0.0080 | US$0.024 | [S56] |

All prices are [Market data]; the per-minute columns are [Our inference].

**Notes on the price data.**

- Sydney on-demand prices are about 1.3 times us-east-1 for both g6 and g5 [S55][S56] [Our inference].
- An earlier reading of the AWS file seemed to show g6.2xlarge in Sydney priced *below* g6.xlarge. **Corrected by fact-check:** the file lists g6.2xlarge (Sydney, Linux, on-demand) at **US$1.2711/hr**, which is above g6.xlarge's US$1.0464. The earlier figure was a parsing error [S55].

**Complete per-session cost (2 video-minutes)** [Our inference]:

- **Modal L4, per job:** 72 s of GPU work plus 20 s of cold start or idle, 2 CPU cores and 16 GiB memory. That comes to **US$0.026 (A$0.037) per session**.
  - Modal applies **1.15–1.75 times** multipliers when a region is pinned [S52]. At the 1.75× worst case the cost is **US$0.046 (A$0.065)**. **Fact-check:** Modal's region guide lists narrow regions **"au" and "ap-melbourne"**, both at the 1.75× narrow-region multiplier. No Sydney-specific region is named [S74] [Vendor claim]. Separately, Modal's pricing page lists non-preemptible compute at **3× base prices** [S52], so do not assume non-preemptible capacity in these figures.
  - The heavy pipeline costs **US$0.067–0.117 (A$0.095–0.167)**.
- **AWS g6.xlarge in Sydney, dedicated.** At 50% utilisation a session costs **US$0.042 (A$0.060)**; at 15% it costs **US$0.14 (A$0.20)**.
  - **Always-on floor:** US$1.0464 × 730 h = **US$763.87 a month (A$1,088)**.
  - Demand at 1,000 active users × 6 sessions: **120 GPU-hours a month** (baseline) or 360 (heavy). That fills 16–49% of one instance.
  - Below a few thousand active users, serverless per-second billing is cheaper and simpler [Our inference].
- **Replicate** private deployments bill for setup and idle time as well as processing [S53] [Vendor claim]. That makes Replicate's economics like a dedicated instance at low volume [Our inference].

### 4.4 LLM coaching summaries (per analysed session)

**Prices** [S60][S62] [Market data]:

- **Claude Haiku 4.5:** US$1 input, US$5 output per million tokens; cache hits US$0.10; Batch API 50% off.
- **Claude Sonnet 5:** US$2 / US$10; cache hits US$0.20. Anthropic states the US$2/US$10 introductory price is now the standard price, and the planned 1 September 2026 increase will not happen.
- **Gemini 2.5 Flash:** US$0.30 / US$2.50.
- **Gemini 2.5 Flash-Lite:** US$0.10 / US$0.40.
- Google's page also lists a newer Flash model at US$0.75 / US$3.75 until 31 December 2026, doubling on 1 January 2027 [S62].

**Image tokens.** An image costs ⌈w/28⌉ × ⌈h/28⌉ visual tokens: a 1000×1000 key frame is **1,296 tokens** [S61] [Vendor claim].

**Per-session cost** (assumptions in §4.1; system prompt served from cache) [Our inference]:

| Model and input | US$ per session | A$ per session |
|---|---|---|
| Haiku 4.5, structured text, cached system prompt | 0.0074 | **0.011** |
| Haiku 4.5, uncached | 0.011 | 0.016 |
| Haiku 4.5 + 6 key frames (1000×1000) | 0.015 | 0.022 |
| Sonnet 5, text, cached (tokens ×1.3) | 0.019 | **0.027** |
| Sonnet 5, uncached | 0.029 | 0.041 |
| Sonnet 5 + 6 key frames | 0.035 | 0.050 |
| Gemini 2.5 Flash, text, uncached | 0.0042 | 0.006 |
| Gemini 2.5 Flash-Lite, text, uncached | 0.0010 | 0.001 |
| Apple Foundation Models (on-device) | 0 | 0 [S51] |
| Progress summary (8k in, 1k out): Haiku / Sonnet 5 | 0.013 / 0.034 | 0.019 / 0.048 |

**Caveats.**

- **Caching.** Prompt caching pays off after one cache read for the 5-minute cache and two reads for the 1-hour cache [S60]. The saving above depends on a shared system prompt being hit at least once every 5–60 minutes across all users. At beta volume, budget the uncached row [Our inference].
- **Data residency.** Claude's first-party API routes inference globally by default, and "US-only" inference costs 1.1 times as much. The pricing page lists no Australia-only option [S60] [Vendor claim]. The fact-check found that the `inference_geo` option applies only to Claude 4.6 and later models. **Haiku 4.5 does not support it**: a request that sets it returns an error [S60].
  - Bedrock and Vertex regional endpoints cost 10% more than global ones [S60]. Whether Claude is served from Sydney is UNVERIFIED.
  - Sending only **derived metrics, with no video, images or names**, keeps the cross-border disclosure small. The privacy workstream should confirm how APP 8 applies [Our inference].

### 4.5 Storage and egress

| Item | AWS S3, Sydney (ap-southeast-2) | Cloudflare R2 |
|---|---|---|
| Storage | **US$0.025/GB-month** (first 50 TB); Standard-IA US$0.0138 [S57] | **US$0.015/GB-month**; Infrequent Access US$0.01 [S59] |
| Requests | PUT US$0.0055 per 1,000; GET US$0.0044 per 10,000 [S57] | Class A US$4.50 per million; Class B US$0.36 per million [S59] |
| Egress to internet | **US$0.114/GB** for the first 10 TB after the global free tier [S58] | **Free** [S59] |
| Free tier | 100 GB a month of data transfer out to the internet, aggregated globally [S58] (confirmed by fact-check) | 10 GB-month, 1M Class A, 10M Class B [S59] |

All [Market data]. AWS price files were published on 26 September 2026 (S3) and 16 September 2026 (data transfer) [S57][S58].

**Worked example (cloud architecture, typical user)** [Our inference]:

- Keeping originals plus proxies for 90 days means 6 sessions × 3 months × 0.25 GB = **4.5 GB**.
- Storage costs US$0.11 a month on S3 Sydney, or US$0.07 on R2.
- Playback of two views per session from S3 is 0.6 GB × US$0.114 = **US$0.07 a month**; on R2 it is zero.
- In the **hybrid** architecture only key frames and a few highlight clips are backed up: about 10 MB per session kept for 12 months is about 0.7 GB, or **US$0.01 a month on R2**.

### 4.6 Per-active-user monthly cost model (three architectures)

**Assumptions** [Our inference; arithmetic]:

- **Hybrid:** on-device vision; one LLM call per session plus 2 progress summaries a month; about 10 MB per session backed up to R2 for 12 months; US$0.01 of API and backend.
- **Cloud:** Modal L4 at the 1.75× region multiplier; Sonnet 5 with 6 key frames; S3 Sydney storage and egress as in §4.5; US$0.02 of backend.

| Architecture | Light (3 sessions) | **Typical (6)** | Heavy (12) | What you get |
|---|---|---|---|---|
| **A. Fully on-device** | A$0.01 | **A$0.01** | A$0.01 | Offline, most private, lowest cost. Coaching text is templated or Foundation Models only; hardest to iterate models (needs app releases) |
| **B. Hybrid (Haiku 4.5)** | A$0.09 | **A$0.13** | A$0.21 | On-device statistics; cloud-quality coaching language; tiny data footprint off-device |
| **B′. Hybrid (Sonnet 5)** | A$0.20 | **A$0.29** | A$0.47 | Richer reasoning for the weekly "Did it work?" review |
| **C. Cloud (baseline pipeline)** | A$0.60 | **A$1.07** | A$2.02 | Server models can be updated daily; heavier models; easier validation logging. Video leaves the device |
| **C′. Cloud (heavy pipeline)** | A$0.90 | **A$1.68** | A$3.24 | 3D lifting, temporal ball tracker |

**Costs outside the table.**

- RevenueCat: 1% of gross revenue above US$2.5K MTR, about **A$0.15 per paying user a month** at A$14.99 [S47].
- Apple Developer Program: US$99 a year (the AU local price is UNVERIFIED).
- A dedicated GPU floor (A$1,088 a month for one Sydney g6.xlarge) if chosen.

**Unit economics check** [Our inference]:

- A typical **payer** on the hybrid architecture costs about 1–2% of monthly proceeds (A$0.13 against A$11.58) or about 2–5% of annual proceeds (A$6.44 a month). On the cloud architecture the figure rises to 9–26%.
- The real risk is **free users**. At a 2.9% download-to-paid rate [S63] there are roughly 30 non-paying installs per payer. If even 10 of them stay active a month with 3 sessions each, the burden per payer is:

  | Architecture | Free-user cost per payer a month |
  |---|---|
  | On-device | about A$0.07 |
  | Hybrid (Haiku) | A$0.90 |
  | Cloud | **A$6.00** |

  A$6.00 is half a monthly subscriber's proceeds, or all of an annual subscriber's monthly-equivalent proceeds.

**Recommendation:** architecture **B (hybrid)**.

- Run pose, toss, rhythm, landing and serve-count analysis on the device.
- Call Haiku 4.5 for per-session coaching text within a strict token budget. Reserve Sonnet 5 for paid weekly reviews.
- Use **opt-in** cloud upload of short clips, with consent, only for coach sharing and building the validation dataset. Store them in Sydney (S3) if privacy advice requires onshore storage. R2 is cheaper where egress matters.
- Keep a server-side GPU path (Modal or AWS) **for offline validation runs and model development, not for every user session** [Our inference].

---

## 5. Subscription benchmarks

**RevenueCat, State of Subscription Apps 2026.** Based on 115,000+ apps, US$16B of revenue and mainly 2025 data. The publication month is not stated [S63]. All [Market data].

| Metric | Health & Fitness median | Top quartile | Asia-Pacific median (includes AU) |
|---|---|---|---|
| D30 download-to-trial | **6.9%** | >23% | 5.7% |
| Trial-to-paid | **37.7%** | >51.4% | 31.9% |
| D35 download-to-paid | **2.9%** | >6.2% | 2.4% |
| Median price | **US$9.99/mo; US$39.94/yr** | — | — |
| Plan mix (subscriptions sold) | **68% yearly, 24% monthly, 4% weekly, 4% other** (corrected by fact-check from the report's chart data; the earlier version of this document had monthly and yearly swapped) | — | — |
| Trial length used | 54% of H&F apps use 5–9 days | — | — |
| RPI | — | — | D14 US$0.28; D60 **US$0.41** (corrected by fact-check; US$0.55 is North America's D60 median) |
| First annual renewal (median) | **24.6%** | — | 25.8% (APAC yearly) |
| Subscribers retained after 1 year (median) | Yearly 24.4%; monthly 8.5% | Yearly >37.0%; monthly >14.7% | — |

**Other 2026 findings** [S63]:

- **Paywall model.** Hard paywalls convert about **5 times better** than freemium at D35 (10.7% against 2.1%). Their **one-year retention is nearly identical**.
- **Trial timing.** 55% of 3-day trial cancellations happen on day 0; for 7-day trials, 39.8% cancel on day 0.
- **AI apps.** They earn **41% more revenue per payer but churn 30% faster**. This is a direct warning for an "AI coach" [Market data].
- **Involuntary churn.** About 14% of App Store cancellations are billing failures [Market data].
- **Country data.** There is no Australia-level breakdown; Australia sits inside Asia-Pacific [S63].

**RevenueCat 2025 edition** [S64] [Market data]:

- 12-month retention: **annual plans 44.1%** (down from 47.1%); **monthly plans 17.0%** (down from 18.8%). *Fact-check:* these figures are confirmed as published, but the **2026 edition's medians are much lower**. First annual renewal is 25.2% across all apps and 24.6% for Health & Fitness [S63]. The two editions probably measure different things (for example pooled rates against per-app medians); that explanation is UNVERIFIED. Use the 2026 medians for planning.
- Health & Fitness trial-to-paid: median **39.9%**, top 10% **68.3%**.
- Health & Fitness **refund rate 4.71%**, the second highest category.

**Engagement retention (secondary compilation of AppsFlyer, Adjust and data.ai data, 2026)** [S65] [Market data; secondary]:

| Retention | Health & Fitness median | Strong performers |
|---|---|---|
| Day 1 | 25% | 35–45% |
| Day 7 | 10% | 15–22% |
| Day 30 | 5% | 8–12% |

The same compilation says fitness apps swing more with the seasons than any other category. We found no *sports*-category or Australian retention figures (UNVERIFIED).

**Implications** [Our inference]:

1. **Push annual plans.** Annual retention is 2.6 times monthly retention [S64]. The 2026 Health & Fitness medians give about 2.9 times (24.4% against 8.5%) [S63]. Health & Fitness buyers already choose annual plans 68% of the time [S63]. Our pennant-season framing gives a natural reason to buy for the year.
2. **The first serve session needs a court visit, so a trial clock may run out before value arrives.** Offer the trial *after* the first analysed session, not at install. Test that against a trial at onboarding.
3. **Budget for Asia-Pacific's weaker conversion.** Planning figures: 2.4% download-to-paid and 32% trial-to-paid.

---

## 6. Proposed free and paid tiers (AUD)

**Design principles** [Our inference]:

- With on-device analysis, the free tier is limited for **monetisation**, not cost.
- The free tier must deliver the product's defining moment: *"I changed one thing, and here is evidence it worked."*
- Honesty and safety features (measurement labels, pain flags, export and deletion) are never paywalled.

| | **Free: "Serve Check"** | **Plus: "Serve Coach Plus"** |
|---|---|---|
| Price | A$0 | **A$14.99/mo or A$99.99/yr** (7-day trial on annual, offered after the first analysed session). Cells to test: A$79.99 and A$129.99/yr |
| Recording and replay | Unlimited recording and on-device replay with phase markers | Same, plus side-by-side with your own best serve and slow-motion overlays |
| Analysed sessions | **First loop free:** one full baseline analysis plus one re-test comparison. Then **2 analysed sessions per calendar month** | Unlimited |
| Statistics | Core measured stats: serve count, player-tagged serve-in rate, toss-height and toss-position consistency, rhythm, with confidence labels | All v1 metrics, landing map (with court calibration), two-angle mode, experimental metrics clearly labelled |
| Coaching | One current focus: one change, one cue, one drill | Adaptive focus progression by level, goals and comfort; drill plans; weekly "Did it work?" review |
| History and trends | Last 30 days | Unlimited history, trend dashboard, session-versus-session comparisons with uncertainty bands |
| Match link | — | Player-entered match log (first-serve %, double faults) linked to practice |
| Coach | Share one session link | Unlimited coach sharing (coach views free); coach-assigned focus |
| *Gap-fill flag (2026-09-27)* | *"Session link" and "coach views" imply hosted pages, which conflict with DECISIONS D8 (no account, no upload in v1). For v1, read both cells as an **export package through the iOS share sheet**: PDF one-pager, 3 key frames, ≤3 short clips and CSV. Add a coach "focus code" the player imports. Hosted links wait for a phase-2 consented coach workspace. See `gaps/australian-segment-evidence.md` §5.* | |
| Always free | Pain or injury flag with "see a qualified professional" guidance; CSV and clip export; deletion controls | — |

**Additional offers to test** [Our inference]:

- **Season Pass: A$39.99, non-renewing, 4 months** (proceeds A$30.90). Built for Victorian winter pennant (an 18-week season, UNVERIFIED) and WA summer pennant (14 weeks plus finals) [S72].
  - *Gap-fill correction (2026-09-27):* the 2026 TV Pennant runs **14 rounds from 2 May to 22 August, with finals to 12 September**, about 19 calendar weeks (TV Pennant Rules of Play 2026, App. B). The WA summer league runs 14 rounds plus 2 finals weeks from October to late March, with a December–February break (Tennis West AR 2024/25). A fixed 4-month pass bought at a pre-season check would lapse before VIC finals. Instead, end the pass on a **season date** ("Winter pass: to 30 September"; "Summer pass: to 31 March") or make it 5 months. Keep the A$39.99 price. See `gaps/australian-segment-evidence.md` §6.1 and §9.1.
- **Coach codes.** Apple offer codes (custom codes such as SPRINGPROMO) can give a coach's students one free month [S42]. The coach is paid a referral fee off-platform, for example **A$20 per converted annual plan** (about 26% of first-year proceeds).
- **Expert review add-on: about A$29.99 consumable**, asynchronous review by an accredited Australian coach, with a revenue share of about 60–70% to the coach. It is not real-time, so it must be sold through in-app purchase [S45]. Test in phase 2.
- **Club seats sold on the web (Stripe),** redeemable in the app under the multiplatform-services rule [S45]. **Resolved by fact-check:** guideline 3.1.3(b) lets an app unlock content bought on the web only if those items are *also available as in-app purchases* [S45] [Regulation]. Any club seat must therefore have an in-app equivalent. Whether offer codes may be bundled into paid club packages is still UNVERIFIED; the Review Guidelines do not address it.

**Why A$99.99/yr, and not SwingVision-level pricing** [Our inference]:

1. It matches what Australians already pay for Strava and HomeCourt [S16][S18].
2. It undercuts SwingVision Plus by A$50 and Pro by A$200. SwingVision Pro's A$300 price draws AU complaints [S1][S71].
3. It sits well below human feedback at about A$60–A$85 per 30 minutes [S23–S28].
4. It clears a sustainable contribution margin even with Sonnet-level weekly reviews:

   | Year-1 item per annual payer | Amount |
   |---|---|
   | Proceeds | A$77.26 |
   | Hybrid variable cost | A$1.56 |
   | RevenueCat | A$1.00 |
   | **Contribution** | **about A$74.70** |
   | Expected at the 2026 median first annual renewal of about 25% [S63] | **about A$93 over two years** (corrected by fact-check; the earlier A$107 assumed the 2025 edition's 44% [S64]) |

---

## 7. Acquisition channels in Australia

**Cost-per-install ceilings.** Allowable cost per install = allowable cost per payer × download-to-paid [Our inference]:

| Download-to-paid | Cost per payer A$40 | Cost per payer A$60 |
|---|---|---|
| 2.9% (H&F median) | CPI ≤ **A$1.16** | ≤ A$1.74 |
| 6.2% (top quartile) | ≤ A$2.48 | ≤ A$3.72 |

We could not verify current Australian Apple Ads benchmarks. The only benchmark we could open was a 2020 SplitMetrics report (Sports tap-through rate 3.25%), which is **outdated** [S67]. Apple itself claims **60%+ conversion** for top-of-search-results ads [S66] [Vendor claim].

**Our conclusion:** paid search is a test channel at launch, not the engine. Low-cost channels with trust built in come first [Our inference].

**Market size.** About 1.118 million Australians aged 15+ played tennis at least once in 2025 [S39] [Market data]. The channels below reach the organised, rated and court-booking part of that population.

| # | Channel | Reach evidence | Mechanism | First experiment | Success signal |
|---|---|---|---|---|---|
| 1 | **Coaches** (B2B2C) | **3,766** TA coach members (record, including more than 1,200 women) [S32]. The national figure is not broken down by level; in the ACT, 129 of 190 coach members are trainees [S32]; ATPCA accreditation is referenced by Sydney venues [S26] | Free coach seat; coach-assigned focus; students get a free month through offer codes [S42]; referral fee per paid annual | Recruit 20–30 coaches in Melbourne, Sydney and one regional hub; each invites 10 students | ≥30% of invited students activate; ≥15% of activated convert; coach NPS ≥40 |
| 2 | **Clubs and pennant** | 2,329 affiliated venues [S33]; Victorian Pennant **419 teams, 135 clubs** [S37]; ACT **499 adult teams** across four seasons [S32]; SA pennant team fee A$115 [S38] | Pre-season "Serve Check night" at clubs; captain packs; newsletter feature; season pass | 5 clubs before the October–November summer season | Installs per event ≥25; second-session rate ≥40% |
| 3 | **Tennis Australia, state bodies, UTR** | TA's AO StartUps program; UTR ratings drive pennant ordering [S72]; **UTR Power already bundles partner discounts** (Tennis Channel Plus, Tennis Warehouse) and runs referral codes [S7][S8] | Apply to AO StartUps; pitch a "UTR Power perk" | One partnership conversation per body in Q4 2026 | Named pilot or perk agreement |
| 4 | **Court-booking touchpoints** | More than 1M hours of online court hire in about 12 months to Oct 2024 [S34]; SportLogic **2.37M hours** booked in 2024 [S35]; PIN gate and light access at bookable courts [S31] | QR code on court gates (council or club permission); "record your serve" tip in booking confirmations through ClubSpark or SportLogic partners | QR test at 5–10 council courts | Scans per court-week; install-to-activation ≥40% |
| 5 | **Hitting-partner communities** | Facebook: Sydney Tennis Community **17.4K**, Melbourne Tennis Hitting Partners **13.6K**, Brisbane Tennis Players **5.2K** [S36] | Admin-approved beta calls; "serve clinic" content; founder-led posts | Recruit the closed beta (50–100 players) | ≥30% of respondents complete a first session |
| 6 | **Creators (Instagram, TikTok, YouTube)** | **Australian tennis creators not verified in this pass** (search budget exhausted; YouTube pages not fetchable) (UNVERIFIED). International coach-creators such as Intuitive Tennis sell memberships [S6] | Affiliate codes; licensed drill content; "validation page" collaborations | Shortlist 10 AU micro-creators by hand; 3 paid pilots | CPI ≤ A$1.50; activation ≥35% |
| 7 | **Apple Ads (search)** | Cost-per-tap auction; placements in Today tab, Search tab, search results and product pages [S66] | Exact-match keywords such as "tennis serve", "serve speed", "tennis coach", plus competitor brands | A$1,500 over 4 weeks after App Store listing optimisation | CPI ≤ A$1.50 (planning ceiling) |
| 8 | **Events** | AO in January; AO 1 Point Slam community events require a UTR / Tennis ID profile (event count UNVERIFIED) [S72]; seniors championships [S72] | "Serve check" booth with a radar gun, which also **collects paired radar data for validation** | One local tournament and one seniors event | Installs per hour; radar-paired clips collected |
| 9 | **PR from a public validation page** | No tennis competitor publishes accuracy data [S71] | Publish sample size, reference method, error and failure cases per metric | At launch | Earned media mentions; App Store featuring nomination |

**Seasonality.** Launch windows are **February–March** (before winter pennant) and **September–October** (before summer comps and the AO) [S72] [Our inference]. Fitness apps' retention varies most by season, so compare cohorts within the same quarter [S65].

---

## 8. Validation metrics and experiments

### 8.1 Definitions

All definitions are [Our inference]; instrument them in analytics from day one.

- **Setup success:** a recording passes framing, lighting and court-visibility checks on the first or second attempt.
- **Activation:** within 7 days of install, the user completes **one valid analysed session** (at least 10 serves detected, all framing checks passed) **and opens the coaching decision**.
- **"Aha" (loop completion):** a **second session within 14 days** that produces a "Did it work?" comparison of the focus metric.
- **Active week:** at least one analysed session in the ISO week.
- **Retained user (W4, W8):** active in week 4 or week 8 after activation.

For a weekly-habit app, **weekly** cohort retention is more meaningful than D1/D7/D30. We still report D1/D7/D30 to compare with category benchmarks.

### 8.2 Coaching usefulness (the product's core claim)

| Measure | Method | Target to proceed |
|---|---|---|
| Perceived usefulness | 1–5 rating on each coaching decision ("How useful is this change for you?") | ≥70% rate 4–5 |
| Adherence | "Did you practise the drill?" plus a practice-log entry before the next session | ≥50% of second sessions |
| Objective change | Focus metric (for example toss-position SD) improves by more than its **smallest detectable change** from our reliability study, after 2 practice sessions | ≥40% of users with a completed loop |
| Expert agreement | 2 accredited Australian coaches independently pick the top priority on 50 clips, blind to the app | Agreement with the app ≥70%; Cohen's κ ≥0.6 (UNVERIFIED as a norm; set by us) |
| Transfer to matches | Player-entered first-serve % and double faults in competition, compared before and after a practice block | Directional improvement; used for storytelling, not gating |
| Safety | Pain flags raised; share of flagged users shown "see a professional" guidance | 100% of flags show guidance; no diagnosis language in any output |
| Product–market fit | Sean Ellis survey question to weekly users: how would you feel if you could no longer use the product? The benchmark is **40% "very disappointed"**; Superhuman moved from 22% to 58% [S70] [Coaching interpretation] (here a startup-practice heuristic from about 100 startups surveyed by Sean Ellis; not peer-reviewed) | ≥30% at beta; ≥40% before scaling spend |

### 8.3 Willingness to pay

- **Van Westendorp Price Sensitivity Meter** (van Westendorp, ESOMAR 1976) [S68]. It asks four questions: too cheap, cheap/bargain, expensive, too expensive. The crossing points give the acceptable price range and the "optimal" point. It does **not** estimate demand [S68] [Established] (a widely used market-research method; the only source cited is a secondary summary on Wikipedia).
  - Run it with **n ≥ 200** Australian comp players recruited through clubs and Facebook groups, after they have seen a demo session.
  - Gate: the acceptable range contains **A$99.99/yr**.
- **Gabor–Granger** (Gabor and Granger, 1960s) [S69]. Present 4–5 prices (A$79.99, A$99.99, A$129.99, A$149.99) and measure purchase intent to derive a demand curve and a revenue-maximising price [Established] (method; secondary source only).
  - Stated intent overstates behaviour, so discount "definitely buy" responses (the discount factor is UNVERIFIED; calibrate against the fake-door test).
- **Fake-door and paywall price cells (beta).**
  - Show the paywall at the natural moment (after the first loop) with randomised price cells, before in-app purchase is live.
  - Measure "Start trial" taps, then explain that billing is not yet active and offer a founder discount.
  - Disclose the test honestly to comply with the trial-disclosure rules [S45].
- **Live paywall A/B tests** (RevenueCat Experiments or equivalent) at soft launch. The sample sizes below are why early pricing leans on surveys [Our inference; two-sided α = 0.05, power 0.8]:

  | Test | Installs or trials per arm |
  |---|---|
  | Download-to-paid 3% → 4.5% | **about 2,518 installs** |
  | Download-to-paid 3% → 5% | about 1,506 installs |
  | Trial-to-paid 30% → 40% | about 356 trials |
  | Trial start 10% → 15% | about 686 users |

### 8.4 Stage gates and thresholds

| Gate | Cohort | Proceed if… | Iterate if… | Stop or pivot if… |
|---|---|---|---|---|
| **1. Closed beta** (6 weeks, 50–100 players, 5–10 coaches) | Invited comp players (UTR ~3–7) | Setup success ≥80%; activation ≥50% of invitees; loop completion ≥40% of activated; usefulness ≥70%; PMF ≥30%; Van Westendorp range includes A$99.99; ≥60 radar-paired and annotated clips collected | Any metric within 20% of target | Activation <25% after two onboarding iterations, or usefulness <50% |
| **2. AU soft launch** (8–12 weeks, 1,000–3,000 installs) | Organic plus coach, club and community channels | D35 download-to-paid **≥2.5%** (APAC median 2.4% [S63]); trial-to-paid **≥35%** (H&F median 37.7%); W4 retention of activated ≥25%; D30 ≥8% (strong H&F [S65]); refund rate ≤5% (H&F 4.71% [S64]); annual ≥40% of new subscriptions; blended cost per payer ≤A$40 | Conversion 1.5–2.5% with strong usefulness: fix the paywall moment and tiering | Download-to-paid <1.5% **and** PMF <25% |
| **3. Scale** | Add paid channels | Download-to-paid ≥4–5% (heading to the 6.2% top quartile); paid CPI ≤ the ceiling in §7; first annual renewal cohort ≥30%, above the 2026 Health & Fitness median of 24.6% [S63] (corrected by fact-check; the earlier gate of ≥40% was anchored to the 2025 edition's 44.1% [S64], which is not comparable) | — | CPI persistently above the ceiling: stay community- and coach-led |

**Cost-per-analysis monitoring** (always on) [Our inference]:

- Log tokens, GPU-seconds and bytes stored per session.
- Alert if the hybrid cost per active user exceeds **A$0.40 a month**, or if the free-user burden exceeds **10% of paid proceeds**.

---

## Implications for the product

In priority order:

1. **Build the hybrid architecture.**
   - All v1 statistics and phase detection run on the device.
   - Haiku 4.5 writes per-session coaching text from structured metrics, with prompt caching and a hard token budget.
   - Sonnet 5 is reserved for paid weekly reviews.
   - This keeps the marginal cost at about **A$0.13 per typical active user a month** and makes a real free tier affordable (§4.6).
2. **Never send raw video to an LLM or a GPU by default.**
   - Cloud upload is opt-in, used for coach sharing and the validation dataset, stored in Sydney (S3) or on R2 as privacy advice requires.
   - A server GPU path exists for validation and model development only. Do not run an always-on g6.xlarge (A$1,088 a month) at beta scale.
3. **Launch price: A$14.99/mo or A$99.99/yr**, 7-day trial on annual, trial offered **after** the first analysed session.
   - Test A$79.99 and A$129.99 annual cells.
   - Test a non-renewing **A$39.99 season pass** for pennant players.
4. **Free tier = "first loop free" plus 2 analysed sessions a month**, with core measured stats and one focus. Safety, labels, export and deletion are always free (§6).
5. **Design the paywall around the "Did it work?" comparison.** That is the moment of proven value, and the metric most closely tied to conversion and retention.
6. **Acquisition order:** coaches (free seats, referral codes, about A$20 per converted annual) → clubs and pennant pre-season events → hitting-partner groups → QR codes at bookable courts → TA, UTR and AO partnership asks → Apple Ads as a capped A$1,500 test.
7. **Instrument activation, loop completion and weekly retention from the first build.** Build the in-app usefulness rating, drill-adherence log, PMF survey trigger and cost-per-session logging (§8).
8. **Run pricing research before in-app purchase goes live:** Van Westendorp (n ≥ 200), Gabor–Granger, and fake-door paywall cells. Live A/B tests cannot reach significance at Australian beta volumes.
9. **Plan for "AI app churn".** RevenueCat finds AI apps churn 30% faster [S63]. Counter it with visible evidence (key frames, confidence labels), a published validation page, coach involvement, and annual-plan framing. Base financial models on a first annual renewal of about **25%** (2026 Health & Fitness median 24.6% [S63]), not the 44% in the 2025 edition (fact-check correction).
10. **Time the launch to the season:** closed beta in October–November 2026 (summer comps), soft launch in February 2027 (before winter pennant), with January AO events used for radar-paired data collection and awareness.

---

## Open questions

1. **Australian Apple Ads benchmarks** (cost per tap and cost per install for tennis and fitness keywords) were not verifiable. A small live test is the fastest answer.
2. **Australian tennis creators:** who they are, how big their audiences are, and their rates. This needs a manual scan of Instagram, TikTok and YouTube (UNVERIFIED in this pass).
3. **UTR Power's AU price** and appetite to add a serve-analysis perk. **WHOOP and Oura AU membership prices** are not confirmed.
4. **On-device performance:** processing seconds, thermal throttling and battery per 2-minute 1080p60 session on iPhone 12 through 17. Our A$0 marginal-cost claim assumes acceptable time and battery; this is unmeasured.
5. **Foundation Models suitability:** is on-device output quality good enough for coaching text, and what share of the target audience's iPhones support Apple Intelligence?
6. **GST detail for an Australian developer** (commission invoices, input tax credits, registration timing). The fact-check confirmed the ATO's 1 July 2017 start date and the role of EDP operators for imported digital supplies [S46], but the treatment for a *resident* developer still needs accountant confirmation.
7. **Apple rules for club packs and coach codes:** can offer codes be distributed by clubs as part of paid memberships? (Answered by fact-check: web-sold club seats *must* also be offered in-app, under guideline 3.1.3(b) [S45].)
8. **Data residency for LLM calls:** is Claude available through a Sydney-region Bedrock endpoint, and does sending only derived metrics avoid APP 8 cross-border concerns? This goes to the privacy workstream.
9. **Real-world free-to-paid mix and active free users per payer,** which drive the free-tier cost burden (§4.6). Measure in the beta.
10. **Would coaches accept an off-platform referral fee,** and at what level (A$15–A$30 per annual)? Would TA or ATPCA endorse it?
11. **Does a trial offered after the first analysed session beat a trial at onboarding?** RevenueCat's hard-paywall data [S63] suggests testing both.
12. **Season-pass cannibalisation:** does a 4-month pass reduce annual-plan uptake among pennant players?

---

## Sources

All accessed 2026-09-27. "Via doc 01/02" means the figure was read by the companion research workstream on the same date and not re-fetched here.

- **[S1]** SwingVision: Tennis Pickleball — Australian App Store listing (AUD in-app purchases, free tier "8 hours per month in HD", 297 ratings). SwingVision Inc., 2026. https://apps.apple.com/au/app/swingvision-tennis-pickleball/id989461317
- **[S2]** Toach: AI Tennis Swing Coach — AU App Store listing. Yin Song, 2026. https://apps.apple.com/au/app/toach-ai-tennis-swing-coach/id6774433013 (via doc 01)
- **[S3]** TENNIS AI 2.0 — AU App Store listing. Tennis AI LLC, 2026. https://apps.apple.com/au/app/tennis-ai-2-0/id6738391148 (via doc 01)
- **[S4]** NiceShot – AI Tennis Coach — AU App Store listing. Shenzhen Lightyear-Wireless, 2026. https://apps.apple.com/au/app/niceshot-ai-tennis-coach/id6740051429 (via doc 01)
- **[S5]** TopCourt — AU App Store listing. TopCourt Inc., 2026. https://apps.apple.com/au/app/topcourt-tennis-pickleball/id1570477197 (via doc 01)
- **[S6]** Intuitive Tennis — home page (membership pricing; video-analysis and Zoom lesson links; linked pages returned 403). Intuitive Tennis, 2026. https://www.intuitivetennis.com/
- **[S7]** "What are Power Players?" — UTR Sports Help Center (country-based pricing from 2 Oct 2025; features; partner discounts). Universal Tennis, n.d. https://support.universaltennis.com/en/support/solutions/articles/9000158461-what-are-power-players-
- **[S8]** "Power Referral Codes" — UTR Sports Help Center. Universal Tennis, n.d. https://support.universaltennis.com/en/support/solutions/articles/9000277985-power-referral-codes
- **[S9]** Onform: Video Analysis App — AU App Store listing (AUD in-app purchases, 692 ratings). Onform Inc., 2026. https://apps.apple.com/au/app/id1490334045
- **[S10]** CoachNow — membership pricing. CoachNow, 2026. https://coachnow.com/pricing
- **[S11]** "Onform Acquires Hudl Technique". Onform, 17 May 2021. https://www.onform.com/post/onform-acquires-hudl-technique-app-from-hudl (via doc 01)
- **[S12]** Sportsbox 3D Golf — AU App Store listing. Sportsbox AI, 2026. https://apps.apple.com/au/app/sportsbox-3d-golf/id1578921026
- **[S13]** V1 Golf — AU App Store listing. V1 Sports, 2026. https://apps.apple.com/au/app/v1-golf-golf-swing-analyzer/id349715369 (via doc 01)
- **[S14]** Mustard: Pitching — AU App Store listing. QualiaOS Inc., 2026. https://apps.apple.com/au/app/mustard-pitching/id1526812408
- **[S15]** Fulltrack AI — AU App Store listing (136 ratings; paywall reviews). Fulltrack AI, 2026. https://apps.apple.com/au/app/fulltrack-ai/id1568524044
- **[S16]** HomeCourt: Basketball Training — AU App Store listing. NEX Team Inc., 2026. https://apps.apple.com/au/app/homecourt-basketball-training/id1258520424
- **[S17]** Strava — subscribe page (AUD pricing, family plan, Strava + Runna bundle, 30-day trial). Strava Inc., 2026. https://www.strava.com/subscribe
- **[S18]** Strava: Run, Bike, Walk — AU App Store listing (in-app purchases incl. Runna standalone A$29.99). Strava Inc., 2026. https://apps.apple.com/au/app/strava-run-bike-walk/id426826309
- **[S19]** Runna — pricing page. Runna, 2026. https://www.runna.com/pricing
- **[S20]** "Oura Membership" — Oura Help Center (US and EU prices). Oura Health Oy, n.d. https://support.ouraring.com/hc/en-us/articles/4409086524819-Oura-Membership
- **[S21]** Oura — AU App Store listing. Oura Health Oy, 2026. https://apps.apple.com/au/app/oura/id1043837948
- **[S22]** WHOOP — AU App Store listing (no in-app prices shown; AU website returned 403). WHOOP Inc., 2026. https://apps.apple.com/au/app/whoop/id933944389
- **[S23]** Camperdown Tennis — lesson pricing. 2026. https://www.camperdowntennis.com.au/lessonpricing
- **[S24]** Victorian Tennis Academy — private lessons. 2026. https://victennisacademy.com.au/private-lessons/
- **[S25]** Toptenn Tennis Coaching — private tennis coaching. 2026. https://www.toptenn.com.au/private-tennis-coaching
- **[S26]** City Community Tennis — private tuition for adults. 2026. https://www.citycommunitytennis.com.au/adult-coaching/private-tuition
- **[S27]** Active Tennis Coaching (Canberra) — private lessons. 2026. https://www.activetenniscoaching.com.au/private-lessons
- **[S28]** Tennis Approach (Cottesloe) — adults. 2026. https://tennisapproach.com.au/adults.html
- **[S29]** Tennis World — court hire, Melbourne. Tennis Australia, 2026. https://www.tennisworld.net.au/locations/melbourne/court-hire/
- **[S30]** Rushcutters Bay Park Tennis Courts — adult coaching (court hire A$32/hr). 2026. https://www.rushcuttersbaytennis.com.au/coaching/adult-coaching/ (via doc 02)
- **[S31]** Wangaratta Lawn Tennis Club — Book-a-Court (visitor rates, PIN access). n.d. https://www.wanglawntennis.com.au/bookacourt_1.html (via doc 02)
- **[S32]** Tennis ACT — Annual Report 2024–2025 (includes TA CEO report: 3,766 coach members, 100,000+ rated players; ACT league teams). 2025. https://www.tennis.com.au/content/dam/tennisaustralia/ma/act/documents/tennis-act-annual-report-2024-2025.pdf (via doc 02)
- **[S33]** Tennis Australia — Annual Report 2023–2024 (2,329 affiliated venues; AO StartUps). 2024. https://www.tennis.com.au/content/dam/tennisaustralia/documents/reports/annual-reports/tennis-australia-annual-report-2023-2024.pdf.coredownload.pdf (via doc 02)
- **[S34]** Australasian Leisure Management — "Growing participation sees Australian tennis reach one million hours of court hire", 1 Nov 2024. https://www.ausleisure.com.au/news/rising-participation-sees-australian-tennis-reach-one-million-hours-of-court-hire/ (via doc 02)
- **[S35]** Australasian Leisure Management — "SportLogic data powers two million hours of tennis court bookings", 2025. https://www.ausleisure.com.au/news/sportlogic-data-powers-two-million-hours-of-tennis-court-bookings/ (via doc 02)
- **[S36]** Facebook groups: Sydney Tennis Community https://www.facebook.com/groups/SydneyTennisCommunity/ ; Melbourne Tennis Hitting Partners https://www.facebook.com/groups/1542039909193398/ ; Brisbane Tennis Players https://www.facebook.com/groups/892680831229932/ (member counts via doc 02)
- **[S37]** The First Serve — Victorian Pennant State Grade Final (419 teams, 135 clubs), 4 Sep 2025. https://www.thefirstserve.com.au/post/i-woke-up-feeling-extra-nervous-victorian-pennant-state-grade-final (via doc 02)
- **[S38]** Tennis SA — Winter Pennant Regulations 2025 (team fee; UTR order of merit; search-excerpt content). 2025. https://www.tennis.com.au/sa/files/2025/04/Winter-Pennant-2025-Regulations.pdf (via doc 02)
- **[S39]** Australian Sports Commission — AusPlay tennis participation (1.118M adults 15+, 2025). 2026. https://www.ausport.gov.au/clearinghouse/research/archive/tennis (via doc 02)
- **[S40]** Reserve Bank of Australia — Exchange rates (A$1 = US$0.7019 on 25 Sep 2026; €0.6170). RBA, 2026. https://www.rba.gov.au/statistics/frequency/exchange-rates.html
- **[S41]** Apple — App Store Small Business Program. Apple Inc., 2026. https://developer.apple.com/app-store/small-business-program/
- **[S42]** Apple — Auto-renewable subscriptions (70%/85% net revenue rule; offer codes; win-back offers; Family Sharing). Apple Inc., 2026. https://developer.apple.com/app-store/subscriptions/
- **[S43]** Apple — App Store Connect Help: "Manage pricing for auto-renewable subscriptions" (proceeds and commission calculated after VAT deduction). Apple Inc., 2026. https://developer.apple.com/help/app-store-connect/manage-subscriptions/manage-pricing-for-auto-renewable-subscriptions
- **[S44]** Apple — App Store Connect Help: "Overview of receiving payments" (payment within 45 days of fiscal month end). Apple Inc., 2026. https://developer.apple.com/help/app-store-connect/getting-paid/overview-of-receiving-payments
- **[S45]** Apple — App Store Review Guidelines (3.1.1, 3.1.2, 3.1.3(b), 3.1.3(d), 3.1.3(e), 1.4.1). Apple Inc., 2026. https://developer.apple.com/app-store/review/guidelines/
- **[S46]** Australian Taxation Office — "GST on imported services and digital products". ATO, n.d. It returned HTTP 403 to WebFetch; the fact-check retrieved it by direct HTTP request on 2026-09-27. It confirms the 1 July 2017 start and EDP-operator guidance (LCR 2018/2). https://www.ato.gov.au/businesses-and-organisations/international-tax-for-business/gst-for-non-resident-businesses/gst-on-imported-services-and-digital-products
- **[S47]** RevenueCat — Pricing (free to US$2,500 MTR, then 1%). RevenueCat Inc., 2026. https://www.revenuecat.com/pricing/
- **[S48]** Stripe — Pricing, Australia (1.7% + A$0.30 domestic; 3.5% + A$0.30 international). Stripe, 2026. https://stripe.com/au/pricing
- **[S49]** Ultralytics — Pose estimation docs (YOLO26-pose speeds on CPU ONNX and T4 TensorRT). Ultralytics, 2026. https://docs.ultralytics.com/tasks/pose/
- **[S50]** Apple — VNDetectHumanBodyPoseRequest (Vision; iOS 14.0+). Apple Inc., 2026. https://developer.apple.com/documentation/vision/vndetecthumanbodyposerequest (read via the documentation JSON endpoint)
- **[S51]** Apple Newsroom — "Apple supercharges its tools and technologies for developers" (Foundation Models framework, on-device, offline, free inference), 9 June 2025. https://www.apple.com/newsroom/2025/06/apple-supercharges-its-tools-and-technologies-for-developers/
- **[S52]** Modal — Pricing (GPU per-second rates; CPU and memory; regional 1.15–1.75× multipliers). Modal Labs, 2026. https://modal.com/pricing
- **[S53]** Replicate — Pricing (hardware per-second rates; private model billing). Replicate, 2026. https://replicate.com/pricing
- **[S54]** RunPod — Pricing (pods and serverless). RunPod, 2026. https://www.runpod.io/pricing
- **[S55]** AWS — EC2 on-demand pricing data, Asia Pacific (Sydney), Linux (g6.xlarge US$1.0464/hr; g5.xlarge US$1.308/hr). Amazon Web Services, 2026. https://b0.p.awsstatic.com/pricing/2.0/meteredUnitMaps/ec2/USD/current/ec2-ondemand-without-sec-sel/Asia%20Pacific%20(Sydney)/Linux/index.json
- **[S56]** Vantage — g6.xlarge and g5.xlarge instance pages (base on-demand, spot and reserved prices; specs). Vantage, 2026. https://instances.vantage.sh/aws/ec2/g6.xlarge ; https://instances.vantage.sh/aws/ec2/g5.xlarge
- **[S57]** AWS Price List API — Amazon S3, ap-southeast-2 (publication 2026-09-26). Amazon Web Services. https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonS3/current/ap-southeast-2/index.json
- **[S58]** AWS Price List API — AWS Data Transfer, ap-southeast-2 (publication 2026-09-16). Amazon Web Services. https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AWSDataTransfer/current/ap-southeast-2/index.json
- **[S59]** Cloudflare — R2 pricing. Cloudflare, 2026. https://developers.cloudflare.com/r2/pricing/
- **[S60]** Anthropic — Pricing (Claude Haiku 4.5, Sonnet 5 and others; caching, batch, data-residency multipliers, tokenizer note). Anthropic, 2026. https://platform.claude.com/docs/en/about-claude/pricing
- **[S61]** Anthropic — Vision (image token formula; resolution tiers). Anthropic, 2026. https://platform.claude.com/docs/en/build-with-claude/vision
- **[S62]** Google — Gemini API pricing. Google, 2026. https://ai.google.dev/gemini-api/docs/pricing
- **[S63]** RevenueCat — State of Subscription Apps 2026 (115,000+ apps, US$16B revenue, mainly 2025 data). RevenueCat, 2026. https://www.revenuecat.com/state-of-subscription-apps/
- **[S64]** RevenueCat — State of Subscription Apps 2025 (12-month retention by plan; Health & Fitness trial-to-paid and refund rates). RevenueCat, 2025. https://www.revenuecat.com/state-of-subscription-apps-2025/
- **[S65]** UXCam — "Mobile App Retention Benchmarks" (2026 compilation of AppsFlyer, Adjust and data.ai data; secondary). UXCam, 2026. https://uxcam.com/blog/mobile-app-retention-benchmarks/
- **[S66]** Apple — Apple Ads for the App Store (cost-per-tap; placements; 60%+ conversion claim). Apple Inc., 2026. https://ads.apple.com/app-store
- **[S67]** SplitMetrics — Apple Search Ads Benchmarks Report 2020 (data March 2019–February 2020; **outdated**). SplitMetrics, 2020. https://splitmetrics.com/blog/apple-search-ads-benchmarks/
- **[S68]** Wikipedia — "Van Westendorp's Price Sensitivity Meter" (method summary; origin ESOMAR 1976). 2026. https://en.wikipedia.org/wiki/Van_Westendorp%27s_Price_Sensitivity_Meter
- **[S69]** Wikipedia — "Gabor–Granger method". 2026. https://en.wikipedia.org/wiki/Gabor%E2%80%93Granger_method
- **[S70]** Vohra, R. — "How Superhuman Built an Engine to Find Product/Market Fit", First Round Review (Sean Ellis 40% "very disappointed" benchmark). First Round Capital, n.d. https://review.firstround.com/how-superhuman-built-an-engine-to-find-product-market-fit/
- **[S71]** Companion research 01 — "Competitor and adjacent-app landscape (international)". Serve2 project, 2026-09-27. C:/Users/roger/OneDrive/Desktop/Serve2/docs/research/01-competitors-international.md
- **[S72]** Companion research 02 — "Australian tennis market and candidate customer segments" (pennant seasons, UTR use, AO 1 Point Slam, seniors comps). Serve2 project, 2026-09-27. C:/Users/roger/OneDrive/Desktop/Serve2/docs/research/02-australian-market.md
- **[S73]** Stripe Support — "Updates to card pricing in Australia from October 2026" (domestic online 1.65% + A$0.30 from 1 Oct 2026; international online 2.80% + A$0.30 from 1 Apr 2027). Stripe, 2026. https://support.stripe.com/questions/updates-to-card-pricing-in-australia-from-october-2026 (added by fact-check)
- **[S74]** Modal — "Region selection" guide (broad regions 1.15×, narrow regions 1.75×; narrow regions include "au" and "ap-melbourne"). Modal Labs, 2026. https://modal.com/docs/guide/region-selection (added by fact-check)

---

## Verification log (fact-check 2026-09-27)

An independent fact-checker re-verified the most decision-critical claims against primary pages on 2026-09-27. They used WebFetch and, where WebFetch failed or summarised badly, direct HTTP retrieval of the raw page or data files (RevenueCat chart data, AWS price files, the ATO page, the Tennis ACT PDF). The web-search budget was exhausted, so verification used direct fetches only. All arithmetic in §3, §4.3, §4.4, §4.6, §7 and §8.3 was recomputed: the proceeds table, the per-session LLM and GPU costs, the per-user cost model, the CPI ceilings and the A/B sample sizes (2,517 / 1,506 / 356 / 686 per arm) all reproduce.

| # | Claim checked | Verdict | Source |
|---|---|---|---|
| 1 | SwingVision AU prices: Plus A$22.99/A$149.99, Pro A$39.99/A$299.99, Max A$59.99/A$499.99; free tier 8 HD hours a month; 4.6★ from 297 ratings | Confirmed | [S1] |
| 2 | Toach Pro A$14.99/mo, A$129.99/yr; claims measured serve speed | Confirmed (speed claim is a [Vendor claim]) | [S2] |
| 3 | TENNIS AI 2.0: A$9.99, A$99.99/yr, A$2.99 per analysis | Confirmed | [S3] |
| 4 | Strava AU: A$14.99/mo, A$99.99/yr, Family A$169.99, Strava + Runna A$199.99, Runna standalone A$29.99 | Confirmed | [S18] |
| 5 | HomeCourt A$10.99/mo, A$95.99/yr; 4.8★ (2.5K) | Confirmed | [S16] |
| 6 | Intuitive Tennis US$19.99/mo, US$199.99/yr | Confirmed (currency still assumed to be USD) | [S6] |
| 7 | UTR Power country-based pricing since 2 Oct 2025; college US$149, high school US$99 | Confirmed; added that TA-ID holders in Australia get discounted rates; AU price still UNVERIFIED | [S7] |
| 8 | RBA rate A$1 = US$0.7019 (and €0.6170) on 25 Sep 2026 | Confirmed | [S40] |
| 9 | Apple Small Business Program: 15% commission, US$1M threshold, new developers qualify | Confirmed | [S41] |
| 10 | Subscriptions: 70% in year 1, then 85%; free trials excluded; SBP members get 85% from the start; custom offer codes | Confirmed | [S42] |
| 11 | Apple pays within 45 days of the end of the fiscal month | Confirmed | [S44] |
| 12 | Review Guidelines: links without an entitlement only on the US storefront; subscriptions of at least 7 days with ongoing value; only real-time one-to-one services exempt from IAP | Confirmed | [S45] |
| 13 | "Whether web-sold items must also be offered in-app" (was UNVERIFIED) | Corrected / resolved: 3.1.3(b) requires them to be available as IAP too | [S45] |
| 14 | GST on digital supplies from 1 July 2017; EDP operators responsible (was UNVERIFIED) | Confirmed (upgraded) | [S46] |
| 15 | RevenueCat: free to US$2,500 MTR, then 1%, measured before the platform cut | Confirmed | [S47] |
| 16 | Stripe AU 1.7% + A$0.30 domestic, 3.5% + A$0.30 international, GST-inclusive | Confirmed; updated with the cuts from 1 Oct 2026 (1.65%) and 1 Apr 2027 (2.80%) | [S48][S73] |
| 17 | Claude Haiku 4.5 US$1/US$5 (cache US$0.10); Sonnet 5 US$2/US$10 (cache US$0.20); intro price made standard; 1 Sep 2026 rise cancelled | Confirmed | [S60] |
| 18 | Claude 4.7+ tokenizer uses about 30% more tokens; caching pays off after 1 read (5-minute cache) or 2 reads (1-hour cache); US-only 1.1×; Bedrock/Vertex regional endpoints +10% | Confirmed; added that Haiku 4.5 cannot use `inference_geo` | [S60] |
| 19 | Image tokens ⌈w/28⌉ × ⌈h/28⌉; 1000×1000 = 1,296 | Confirmed | [S61] |
| 20 | Gemini 2.5 Flash US$0.30/US$2.50; Flash-Lite US$0.10/US$0.40; a newer Flash at US$0.75/US$3.75 doubling on 1 Jan 2027 | Confirmed (the newer models are Gemini 3.6, 3.7 and 3.8 Flash) | [S62] |
| 21 | Apple Foundation Models: on-device, offline, inference "free of cost" (9 June 2025) | Confirmed ([Vendor claim] tag is correct) | [S51] |
| 22 | YOLO26s-pose 2.7 ms and YOLO26n-pose 1.8 ms on T4 TensorRT; CPU ONNX 40–85 ms | Confirmed ([Vendor claim]) | [S49] |
| 23 | Modal L4 US$0.000222/s, T4 US$0.000164/s; region multipliers 1.15–1.75×; "whether an Australian region exists" (was UNVERIFIED) | Confirmed; corrected: "au" and "ap-melbourne" narrow regions exist at 1.75×; non-preemptible 3× noted | [S52][S74] |
| 24 | Replicate T4 US$0.000225/s; private models billed for setup and idle time | Confirmed | [S53] |
| 25 | RunPod L4: serverless US$0.69/hr, Secure pod US$0.49/hr | Confirmed | [S54] |
| 26 | AWS Sydney g6.xlarge US$1.0464/hr, g5.xlarge US$1.308/hr | Confirmed; g6.2xlarge note corrected (US$1.2711/hr, higher, not lower) | [S55] |
| 27 | S3 Sydney US$0.025/GB-month, PUT US$0.0055/1k, GET US$0.0044/10k; egress US$0.114/GB (first 10 TB); publication dates 26 and 16 Sep 2026 | Confirmed; free tier of 100 GB a month added | [S57][S58] |
| 28 | Cloudflare R2 US$0.015/GB-month (IA US$0.01), Class A US$4.50/M, Class B US$0.36/M, free egress, 10 GB free | Confirmed | [S59] |
| 29 | RevenueCat 2026 Health & Fitness: 6.9% D30 download-to-trial, 37.7% trial-to-paid, 2.9% D35 download-to-paid, US$9.99/US$39.94 medians; APAC 31.9% and 2.4%; hard paywall 10.7% against freemium 2.1%; AI apps 41% more revenue per payer and 30% faster churn; 14% billing-failure cancellations; day-0 trial cancellations 55.4% and 39.8% | Confirmed | [S63] |
| 30 | RevenueCat 2026 Health & Fitness plan mix "68% monthly, 28% annual" | **Corrected** to 68.4% yearly, 23.8% monthly, 4.0% weekly (chart data; the report's own caption contradicts its chart) | [S63] |
| 31 | RevenueCat 2026 APAC RPI D60 US$0.55 | **Corrected** to US$0.41 (US$0.55 is North America) | [S63] |
| 32 | RevenueCat 2025: annual 44.1% against monthly 17.0% 12-month retention; H&F trial-to-paid 39.9% (top 10% 68.3%); refund rate 4.71% | Confirmed as published; **flagged** because 2026 medians are much lower (first annual renewal 24.6% for H&F). The two-year value and the scale-gate threshold were corrected | [S64][S63] |
| 33 | AusPlay: 1.118M Australians aged 15+ played tennis in 2025 | Confirmed | [S39] |
| 34 | TA 3,766 coach members (record); 100,000+ rated players; 1M+ court-booking hours in 12 months; ACT 499 adult league teams | Confirmed; "many are trainees" narrowed to the ACT breakdown (129 of 190) | [S32] |
| 35 | Victorian Pennant 2025: 419 teams, 135 clubs | Confirmed | [S37] |
| 36 | Sean Ellis 40% PMF benchmark; Superhuman 22% → 58% | Confirmed; tag annotated as a practitioner heuristic | [S70] |
| 37 | Apple Ads: cost-per-tap; "over 60%" conversion for top-of-search ads | Confirmed ([Vendor claim]) | [S66] |
| 38 | Apple Developer Program US$99/yr | Confirmed (charged "in local currency where available"; AU amount still UNVERIFIED) | https://developer.apple.com/help/account/membership/program-enrollment |

**Tag honesty.**

- Two uses of the non-standard label "[Established method]" (Van Westendorp, Gabor–Granger) were changed to [Established], with a note that the only source is secondary (Wikipedia).
- The Sean Ellis PMF benchmark keeps [Coaching interpretation] but is annotated as a non-peer-reviewed startup heuristic.
- Vendor capability and performance claims (Foundation Models, Ultralytics speeds, CoachNow features, Toach speed, Apple Ads conversion) are correctly tagged [Vendor claim].
- No vendor claim was found labelled [Established].

**Not checked in this pass (remain as the author stated):**

- NiceShot, TopCourt, V1 Golf, Sportsbox, Mustard, Fulltrack, OnForm, CoachNow and Oura prices;
- Australian coach lesson prices [S23–S28];
- Facebook group sizes [S36];
- SportLogic's 2.37M hours [S35];
- the UXCam retention compilation [S65];
- SwingVision "AU complaints" about Pro pricing.
