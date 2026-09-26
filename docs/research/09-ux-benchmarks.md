# 09 · UX and data-visualisation benchmarks for a calm, premium serve coach

*Research date: 27 September 2026. Scope: UX patterns from premium health, fitness and sports-analysis apps that apply to a phone-first serve coach. The flow under study is Record → Analyse → Understand (annotated playback and stats) → Practise (one cue, one drill) → Compare next session. Written in Australian English. Evidence labels: [Established] (peer-reviewed or strong consensus, including platform standards), [Coaching interpretation], [Vendor claim], [Market data], [Regulation], [Our inference]. Prices are as displayed on 27 September 2026. USD and EUR are converted at US$1 = A$1.4234 and €1 = A$1.6225 (ExchangeRate-API, updated 26 Sep 2026) [S83].*

---

## 0. Bottom line

1. **Premium apps lead with one sentence and one number, then let people drill down.** Apple's chart guidance says to keep a chart simple and let people choose when they want more detail. Its WWDC22 sessions recommend a headline that states the takeaway ("Sales for the past 30 days are up 12%…") above a small static chart that opens a detailed one [S1][S3][S4] [Established]. Oura cut its app from five tabs to three (Today, Vitals, My Health) in October 2024 for the same reason [S34] [Vendor claim]. For us: every session opens with a headline and one focus, not a grid of metrics [Our inference].
2. **The best products spell out what is measured and what is inferred.** Rapsodo lists 8 measured and 7 calculated MLM2PRO values, and shows spin only with its RPT balls [S61]. FlightScope says indoor spin on Mevo+ needs metallic dots or RCT balls [S62]. The WHOOP API gives every recovery one of three states (`SCORED`, `PENDING_SCORE`, `UNSCORABLE`) and a `user_calibrating` flag [S36] [Vendor claim]. We should do the same with five visible data states: Measured, Estimated, Player-entered, Experimental and Unavailable. Each should be told apart by shape and text, not colour alone [Our inference, aligned with 05-cv-feasibility §10 [S84]].
3. **"Am I improving?" is answered against a personal baseline, over matched conditions, in words.** Apple compares 7-day with 28-day training load and names the result on a five-step scale from "well below" to "well above" [S23]. Oura compares 14-day weighted averages with a two-month baseline [S33]. Strava's Matched Activities compare only efforts on the same route [S38] [Vendor claim]. Sports-science reliability work says a change should beat the measure's typical error before it counts as real [S70][S71] [Established].
4. **Session-level serve statistics are noisy, and the UI must say so.** On 12 of 20 first serves in (60%), the 95% Wilson interval is 39–78%. At 60 of 100 it is still 50–69%. Detecting a true rise from 50% to 60% with 80% power needs about 388 serves in each period [Our inference; method [S69]]. SwingVision's own data from more than 250,000 sessions show first-serve-in % varies little between NTRP 3.0 (53.3%) and 5.0 (55.5%) [S45] [Vendor claim]. So first-serve-in % alone makes a weak progress headline.
5. **For lay users, show individual outcomes as dots rather than error bars.** Quantile dotplots gave transit decisions 97% of optimal payoff, 5 percentage points better than showing no uncertainty, and beat text descriptions of uncertainty [S64] [Established]. Error bars are often misread, even by researchers (n = 473) [S67] [Established]. Every serve is already a natural "dot", which suits per-serve strip plots and court maps [Our inference].
6. **Video evidence should be phase-indexed, confidence-aware and comparable.** Coaching tools such as Onform, V1 Golf, Dartfish and Sportsbox share a set of features: frame stepping, 2D skeleton, side-by-side, overlay ("ghost"), key positions and multi-angle views [S50][S52][S54][S56] [Vendor claim]. Apple's pose API says to discard zero-confidence joints and wants the subject to be at least one-third of the frame height [S20] [Established, platform documentation]. Our overlay should fade or hide low-confidence joints and jump straight to the frame that supports each coaching point [Our inference].
7. **Calm means small, trustworthy and non-punitive.** Gentler Streak won the 2024 Apple Design Award for Social Impact for an encouraging, rest-friendly tone [S27][S28]. Since watchOS 11, Apple lets people pause Activity rings without breaking streaks [S23]. Calm Technology principles ask for the "smallest possible amount of attention" [S81]. Streak guilt, red deltas everywhere and marketing pushes do not fit [Our inference].
8. **Recommended information architecture: four tabs (Today · Record · Sessions · Progress) plus a profile sheet.** The one-cue, one-drill focus card lives on Today. Each Session report follows Headline → Evidence → Stats → Practise plan → "How we measured" (§13).

---

## 1. Method and limitations of this review

- **Approach.** We fetched primary pages directly: Apple Human Interface Guidelines (HIG) JSON endpoints, Apple developer documentation, Apple Newsroom, vendor sites and help centres, App Store (AU) listings, and paper metadata from OpenAlex and Semantic Scholar. The session's web-search quota ran out before this topic started, so we reached sources by known URLs rather than by searching. Coverage is therefore narrower than a search-led review.
- **No hands-on app testing.** Nothing here comes from using the apps. Interaction details come from vendor documentation, App Store text and help articles, so fine-grained UI behaviour (exact animations, how a badge looks) is **UNVERIFIED** unless a source describes it.
- **Pages that could not be read:** WHOOP's consumer site and support centre (HTTP 403 or script-rendered), SwingVision's marketing, guide and FAQ pages (script-rendered, title only), Garmin Approach R10 product pages, Trackman parameter pages (404), and Apple's Health Highlights support page (not reachable at the URL tried). Claims about those products lean on the sources that did load, and gaps are marked.
- **Currency.** Most sources date from 2024–2026. Apple's Activity Trends (90 vs 365 days) comes from a 2019 announcement and may have changed since. The Tennisnerd SwingVision review dates from 2021 and is used only for history. It describes the app cutting dead time between points so an hour-long set plays back in about 20 minutes or less, and quotes 2021 pricing of US$149.99/yr [S47].

---

## 2. Benchmark scan

### 2.1 What each product teaches us

| Product | Strongest pattern relevant to us | Evidence | Caveat |
|---|---|---|---|
| **Oura** | Three-tab IA (Today, Vitals, My Health), replacing five tabs (Home, Readiness, Sleep, Activity, Resilience); announced 3 October 2024 [S34]. Readiness 0–100 with named bands: Optimal 85–100, Good 70–84, Fair 60–69, Pay attention 0–59 [S33]. Contributors shown as labelled bars on the same scale. Oura frames Readiness as a holistic picture of recent activity, sleep and body signals [S32]. Balance contributors compare 14-day weighted averages with a two-month baseline [S33]. The copy normalises variation ("Some variation… is a good thing") [S33]. | Vendor claim | A composite score works for Oura because it has years of validation and a physiological rationale. A composite "serve score" would have neither (§7). |
| **Oura Advisor** (launched 31 Mar 2025) | AI guidance with a user-chosen tone ("conversational" or "direct"), a reviewable and deletable memory, and an explicit admission that it can make mistakes [S35]. | Vendor claim | Chat is not a substitute for a single, clear coaching decision. |
| **WHOOP** | Recovery 0–100% with explicit scoring states and a calibration flag in the data model [S36]. AI coaching ("WHOOP Coach", powered by OpenAI) since September 2023 [S37] (date from Wikipedia, a secondary source; WHOOP's and OpenAI's primary pages returned HTTP 403 at fact-check). | Vendor claim | Colour bands (commonly given as green 67–100%, yellow 34–66%, red 0–33%) are **UNVERIFIED**, because WHOOP pages returned 403. |
| **Apple Watch / Fitness / Health** | Training Load compares the last 7 days with the last 28 and names the result as well below, below, steady, above or well above [S23]. Vitals shows a "typical range" and notifies only when two or more metrics fall outside it [S23]. Rings can be paused without losing streaks [S23]. Activity Trends compare 90 days with 365 and coach when a trend turns down [S22] (2019, may be outdated). Cardio Fitness gives no estimate until the watch has been worn for 24 hours and several outdoor walks, runs or hikes are logged. Its supported range is 14–65 mL/kg/min [S25]. | Vendor claim / platform | Apple says a redesigned Health app is coming late in 2026 [S26]. Details **UNVERIFIED**. |
| **Strava** | Matched Activities compare efforts on the same route, with a trend line, a yellow dot for the fastest effort and an orange dot for the current one [S38]. Fitness & Freshness is an interactive chart with tappable days [S39]. Athlete Intelligence adds plain-language AI summaries with a four-level feedback control and a hide option. It **does not** summarise elevation, estimated power, perceived exertion or cadence [S40]. Strava announced a definitive agreement to acquire Runna on 17 April 2025 [S85]; Wikipedia dates the completed acquisition to May 2025 [S41]. | Vendor claim | Some of these features are subscriber-only [S38][S40]. |
| **Runna** | The onboarding survey (level, goal, availability) builds a personalised plan, and the app then leads with that day's workout. It names coaching credentials [S42]. US$19.99/mo (A$28.45) or US$119.99/yr (A$170.79) [S42]. | Vendor claim / Market data | Running plans are more structured than serve practice. We borrow the "today's session" framing, not the plan length. |
| **Gentler Streak** | Won the 2024 Apple Design Award for Social Impact [S27][S28]. "Activity Path" gives daily, 10-day and 30-day views of a personal range. Rest counts as part of fitness, and a companion character keeps the tone non-judgemental [S30]. | Vendor claim; award is a primary source | Pricing was not visible on the page fetched. |
| **Athlytic** | Minimal dashboard: Recovery 0–100%, Exertion 0–10 and a personal "Target Exertion Zone" [S31]. US$4.99/mo (A$7.10) or US$29.99/yr (A$42.69) [S31]. | Vendor claim | The brief calls Athlytic an Apple Design Award winner. It does **not** appear among the 2024 or 2025 winners or finalists [S28][S29], and its own site lists MacStories awards instead [S31]. Earlier years were not checked (**UNVERIFIED**). |
| **SwingVision** | Pairs video with speed and placement per shot. "Goal Mode" gives real-time audio call-outs of speed and accuracy on target zones [S44]. Apple Watch integration [S43]. AU prices: Plus A$22.99/mo or A$149.99/yr, Pro A$39.99/mo or A$299.99/yr, Max A$59.99/mo or A$499.99/yr [S43]. Publishes level benchmarks drawn from more than 250,000 sessions [S45][S46]. | Vendor claim / Market data | How the app presents setup and uncertainty could not be verified (script-rendered pages). |
| **Sportsbox AI** (golf) | 3D avatar from a single camera, key positions, comparison with elite "ranges", 2D-overlay and 3D-avatar comparison, and a Practice Mode with live data tiles [S49][S50]. Publishes its accuracy method: about 2° mean difference from AMM 3D mocap in 30 golfers, valid only "in these conditions" [S48]. | Vendor claim | Its accuracy study is self-published. |
| **Onform** (absorbed Hudl Technique, 2021) | Frame-by-frame and slow motion, drawing tools, 2- or 4-angle multicam, 2D skeleton tracking on **every** paid tier, voice-over and side-by-side comparison over time [S51][S52][S53]. Athlete tiers US$9.99–14.99/mo (A$14.22–21.34) [S52]. | Vendor claim / Market data | Built for coaches: powerful but dense. |
| **V1 Golf** | Side-by-side and **overlay** comparison, a pro-swing library and skeletal tracking [S56]. 240 fps slow-motion review is mentioned in a user review on the listing, not in the vendor's feature text [S56]. A$14.99/mo or A$99.99/yr [S56]. | Vendor claim | Rated 3.7/5 (55 ratings) in AU [S56], which suggests usability friction (Our inference). |
| **Dartfish** | SimulCam (overlays two performances) and StroMotion (a stroboscopic sequence) in its top tier. Mobile tier is €7/mo (A$11.36) and Pro S is €180/mo (A$292.05) [S54][S55]. | Vendor claim / Market data | Pro tools. The mechanisms of both features were not described on the pages fetched. |
| **Fulltrack AI** (cricket) | Tripod taller than 60 in (about 1.5 m), stump-based calibration and a "30 second setup". It warns that bad calibrations lead to bad tracking [S57]. AU IAPs from A$29.99 [S58]. | Vendor claim | Its App Store text makes no accuracy statement [S58]. |
| **HomeCourt** (basketball) | Low-friction setup: prop the phone against a water bottle, or use a tripod for advanced tracking. Real-time shot tracking [S59][S60]. HomeCourt Plus A$10.99/mo or A$95.99/yr [S60]. | Vendor claim | The AU listing's version history shows the latest version as 3.34, released 20 January 2022 (confirmed at fact-check). That the app is in maintenance mode is Our inference (**UNVERIFIED**). |
| **Rapsodo MLM2PRO** (golf) | Clearly separates **measured** values (ball speed, club speed, launch angle, launch direction, club path, angle of attack, and spin rate and axis with RPT balls only) from **calculated** ones (carry, total, side carry, descent angle, apex, smash factor, shot type) [S61]. Device A$899 (a reduced price; listed RRP A$1,099), membership A$299.99/yr (also A$549.99 for two years, A$999.99 lifetime) [S61]. | Vendor claim / Market data | This is the clearest public example of labelling data provenance. |
| **Apple "Action & Vision" sample** | Reference flow for sports CV: tripod, detect the playing area, run a scene-stability check across frames, detect the player, then analyse and show speed and type [S21]. | Platform documentation | This is sample code, not a shipping app. |

### 2.2 Price context for adjacent analysis and coaching apps

| App | Price (original) | AUD | Source |
|---|---|---|---|
| SwingVision Plus / Pro / Max (monthly) | A$22.99 / A$39.99 / A$59.99 | same | [S43] |
| SwingVision Plus / Pro / Max (yearly) | A$149.99 / A$299.99 / A$499.99 | same | [S43] |
| Runna | US$19.99/mo; US$119.99/yr | A$28.45; A$170.79 | [S42] |
| Athlytic | US$4.99/mo; US$29.99/yr | A$7.10; A$42.69 | [S31] |
| Onform Individual Standard / Premium | US$9.99 / US$14.99 per month | A$14.22 / A$21.34 | [S52] |
| Sportsbox AI Premium (web) | 9.16/mo; currency and billing period not stated (possibly an annual price shown per month; USD assumed, **UNVERIFIED**) | ≈A$13.04 | [S49] |
| Sportsbox 3D Golf (AU App Store) | Player A$25.49 and A$174.99; Pro A$129.99 and A$1,299.99 (billing periods not labelled on the listing) | same | [S50] |
| V1 Golf Plus | A$14.99/mo; A$99.99/yr | same | [S56] |
| HomeCourt Plus | A$10.99/mo; A$95.99/yr | same | [S60] |
| Dartfish Mobile / 360 / Pro S | €7 / €20 / €180 per month (annual billing) | A$11.36 / A$32.45 / A$292.05 | [S54] |

[Market data] Pricing belongs to a separate workstream. It is listed here only because perceived price shapes how "premium" the experience has to feel.

---

## 3. Presenting uncertainty and data quality

### 3.1 What the research says

- **Frequency formats beat abstract intervals for everyday decisions.** Kay et al. (CHI 2016) designed mobile bus-arrival displays and proposed **quantile dotplots** as a small-screen way to show continuous uncertainty. Probability estimates from dotplots were less variable (by about 1.15 times) than those from density plots [S63] [Established]. In an incentivised follow-up, quantile dotplot decisions reached 97% of optimal expected payoff, 5 percentage points above a no-uncertainty control. CDF plots did about as well, and both beat text descriptions of uncertainty [S64] [Established].
- **Error bars are misread.** In a survey of 473 researchers, many misjudged when two means with CI or SE bars were significantly different [S67] [Established]. Correll and Gleicher found that bar-plus-error-bar charts bias inference, and that gradient or violin encodings serve a general audience better [S66] [Established]. Hypothetical outcome plots (animated draws) gave more accurate judgements than error bars or violins when comparing two or three quantities [S68] [Established].
- **Evaluation is hard.** A survey of 86 user studies of uncertainty visualisation found that evaluations lean heavily on performance and accuracy measures, which may not match how people actually reason with uncertain information, and recommends assessing judgement and decisions under uncertainty instead [S65] [Established]. For us, that means testing whether players make the right practice decision, not whether they can read a chart [Our inference].

### 3.2 What premium products do

| Pattern | Example | Transfer to serve coach |
|---|---|---|
| **Explicit scoring states** | WHOOP API: `SCORED`, `PENDING_SCORE`, `UNSCORABLE`, plus `user_calibrating` [S36] | Every metric on every serve carries a state. "Unscorable" is a normal, explained outcome: "Toss left the frame". It is not hidden. |
| **Calibration before claims** | Apple Cardio Fitness needs 24 h of wear and several outdoor workouts before its first estimate [S25]. Oura uses a two-month baseline [S33]. | No trends until the player has two sessions of eight or more usable serves from the same view. Until then, say "Building your baseline (1 of 2 sessions)". |
| **Measured vs calculated lists** | Rapsodo: 8 measured, 7 calculated. Spin only with RPT balls [S61]. | A "How we measured" sheet for each metric: method, prerequisites, typical error and validation status. |
| **"Unavailable unless…" prerequisites** | FlightScope indoor spin needs metallic dots or RCT balls [S62]. | Show "—" and a reason, such as "Needs rear view + court calibration", with an "Unlock" link to the capture guide. Never a blank or a guess. |
| **Conditional accuracy claims** | Sportsbox gives its about-2° agreement for stated conditions only [S48]. Fulltrack warns that bad calibration means bad tracking [S57]. | Tie each accuracy statement to capture conditions, and downgrade the data state when conditions are not met. |
| **Categories instead of false precision** | Oura bands [S33]. Apple Training Load's five-step labels [S23]. | For 2D angles with ±10–15° error (see [S84]), show categories such as "Deep / Moderate / Shallow knee bend", not "37.4°". |
| **Keep low-grade data out of the narrative** | Strava Athlete Intelligence skips elevation, estimated power, perceived exertion and cadence [S40]. | The AI or template coaching summary may only cite **Measured** or **Estimated** values, and never **Experimental** ones. |

### 3.3 Proposed data-state system (visual grammar)

Following WCAG 1.4.1 and Apple's colour guidance, colour is never the only signal. Each state has its own glyph, text and style [S6][S76] [Established → Our inference for the specific design].

| State | Meaning (matches [S84]) | Number style | Glyph + label | Charts |
|---|---|---|---|---|
| **Measured** | Computed directly from footage and validated (e.g., serve count, phase timing, toss spread in relative units) | Plain value, tabular numerals | none needed; "Measured" in info sheet | Solid dots/lines |
| **Estimated** | Model-based, with an error band (e.g., toss height, contact height, placement zone) | Range or "≈" with a band: "≈ 2.6–2.8 m" | "≈ Est." chip | Dot plus a translucent band, or gradient interval (after [S66]) |
| **Player-entered** | From the player (e.g., serve in/out in side-only mode, intended serve type, UTR) | Plain value | Pencil glyph + "You logged" | Hollow dots |
| **Experimental** | Not yet validated (e.g., speed, net clearance, landing distance) | Always a range, rounded, never decimals ("about 130–145 km/h") | Flask glyph + "Experimental" | Dashed outline. Off by default and never in headlines |
| **Unavailable** | Cannot be derived from this footage (e.g., spin rpm; placement from a side-only view) | "—" | Lock glyph + reason + "How to unlock" | Absent. A ghost row explains why |

**Session capture-quality indicator** [Our inference]: *Good / Fair / Limited*, each with plain reasons such as "Toss left frame on 3 of 12 serves" or "Low light: timing ±2 frames". It sits under the session headline and links to the fix. This follows WHOOP's scored/unscorable model [S36] and Apple Vision's per-joint confidence [S20].

### 3.4 Worked example: how noisy is "first serves in"?

Wilson score intervals, recommended over the textbook Wald interval for small samples [S69] [Established]. The calculations are ours [Our inference]:

| Serves in / attempted | Observed | 95% interval |
|---|---|---|
| 12 / 20 | 60% | 38.7–78.1% |
| 18 / 30 | 60% | 42.3–75.4% |
| 30 / 50 | 60% | 46.2–72.4% |
| 60 / 100 | 60% | 50.2–69.1% |

To detect a true rise from 50% to 60% (two-sided α = 0.05, 80% power), each period needs about **388 serves**. From 50% to 65% needs about 170, and from 50% to 70% about 93 [Our inference]. Design consequences:

- Show n next to every rate ("12/20"). Show the interval as a light band, and use a verbal verdict rather than a bare arrow.
- Pool **matched** sessions for trend verdicts, for example a rolling three-session window, and say how many more serves would settle the question: "About 60 more serves would make this clear."
- Put more weight on process metrics with lower noise per serve, such as toss spread and contact-point spread. These are measured on every serve and their systematic errors cancel [S84].

---

## 4. Answering "Am I improving?"

### 4.1 Patterns observed

- **Short-window vs long-window comparison with named outcomes.** Apple: 7 vs 28 days on a five-step scale [S23]. Activity Trends: 90 vs 365 days, with coaching when a trend dips [S22]. Oura: 14-day weighted averages vs a two-month baseline [S33]. [Vendor claim]
- **Typical range, then alert only on meaningful deviation.** Apple Vitals notifies only when two or more overnight metrics leave their typical range [S23]. Tufte's sparklines put a grey normal-range band behind the line so deviations stand out [S72]. Few's bullet graph uses 2–5 qualitative ranges in shades of grey rather than hues, partly for colour-blind viewers [S73]. [Vendor claim for Apple; established design practice (not peer-reviewed) for Tufte and Few]
- **Like-for-like comparison.** Strava Matched Activities group efforts by route (start, end, direction, distance) [S38]. The serve equivalent is a *matched session*: same camera view, same serve side (deuce or ad), same serve (first or second) and the same intended type [Our inference].
- **Measurement-error thresholds.** Hopkins explains that limits of agreement (±2.77 × typical error, i.e. 1.96 × √2 × typical error) act as a reference range: a change inside them is normal variation, and a change outside them suggests a real change [S70][S71] [Established]. Hopkins himself adds that limits of agreement are too large as a reference range for decisions about an individual's change and prefers working from the typical error [S71], so a ±2.77 × TE threshold is a conservative choice, not his recommendation [Our inference].
- **Level benchmarks are weak targets.** SwingVision's data show first-serve-in % almost flat across NTRP 3.0–5.0 (53.3–55.8%). First-serve speed moves more (59.5 → 74.8 mph, about 96 → 120 km/h) [S45] [Vendor claim]. For recreational players, comparison with their own baseline is more useful than a level norm [Our inference].

### 4.2 Proposed "improvement" language

| Verdict | Rule (per metric; our proposal) | UI |
|---|---|---|
| **Clear improvement** | Change beyond the metric's minimal detectable change (or the 95% interval excludes the baseline), in matched sessions | Filled check glyph + "Clear improvement" |
| **Likely improvement** | Direction is consistent, but the interval overlaps the baseline | Half-filled glyph + "Trending better. About N more serves to confirm" |
| **Within your normal range** | Inside the typical-error band | Grey band + "About the same as usual" |
| **Likely / clear decline** | Mirror of the above | Words first. Colour is only a secondary cue, never red alone |
| **Not enough data** | Fewer than 8 usable serves, or unmatched conditions | "Not comparable yet", with the reason |

Illustrative example (not real data): "Toss spread (side to side): 14 cm → 9 cm across 12 serves each, matched behind view. **Clear improvement.**" The number is a relative measure (Measured), and the verdict names the view it applies to [Our inference].

---

## 5. Keeping charts readable on a phone

Platform guidance (HIG and WWDC22) [S1][S2][S3][S4] [Established]:

- **Keep charts simple and use progressive disclosure.** Small static charts sit high in the hierarchy and open larger interactive versions. Values, context and state should carry over when a small chart expands [S1][S4].
- **Write an information-rich title or summary** that states the change and the total, not just the metric name [S4]. Critical information must never need interaction to reveal it. Keep y-axis labels short in compact layouts, prefer familiar tick intervals (0, 5, 10), and fix the axis range when the minimum and maximum mean something [S2].
- **Keep a consistent chart language across screens**, deviating only to highlight a difference [S1].
- **Choose marks by purpose.** Bars compare categories, lines show change over time, and points show individual values, outliers and clusters. Combining points with lines shows a trend and its evidence together [S2].
- **Swift Charts** provides `PointMark`, `LineMark`, `AreaMark`, `RuleMark`, `RectangleMark`, `BarMark` and `SectorMark`, and has VoiceOver support built in [S17]. The framework itself runs on iOS 16+, but `SectorMark`, built-in chart scrolling (`chartScrollableAxes`) and selection (`chartXSelection`) need iOS 17+ [S86]. A deployment target of iOS 17 or later avoids hand-rolled fallbacks [Our inference]. `AXChartDescriptor` (iOS 15+) supplies titles, summaries, axes and series for Audio Graphs [S18].

Serve-specific chart vocabulary [Our inference, built on [S2][S63][S72][S73]]:

| Question | Chart (phone) | Marks |
|---|---|---|
| "Where did my toss go?" | **Toss map**: apex positions as dots on a player-centred grid (behind view = lateral; side view = forward), with a personal-range ellipse | `PointMark` + `AreaMark`/ellipse path |
| "Is my toss becoming more consistent?" | **Spread sparkline** per session with a grey typical-range band and the latest point labelled | `LineMark` + `PointMark` + `RectangleMark` band |
| "Am I getting more first serves in?" | Per-session **dot with Wilson band** and "n/N" label. Rolling three-session line | `PointMark` + `RuleMark` interval + `LineMark` |
| "Where are my serves landing?" | **Service-box map** with shape-coded outcomes (● in, ✕ out, ▲ net), zone counts in text, and a "close call" ring inside the error ellipse | Custom court path + `PointMark` with symbol shapes |
| "Is my rhythm consistent?" | **Strip plot** of toss release → contact time per serve (ms), median line | `PointMark` + `RuleMark` |
| "How high do I contact?" | **Bullet graph**: today's range vs personal range (grey intensities) | `BarMark` + `RectangleMark` ranges |
| "Did this change work?" | **Before / after dot plots** stacked vertically on one shared axis, with a verdict sentence above | `PointMark` × 2 groups |

Readability rules [Established → Our inference]:

- One primary chart per card. At most 3–4 y-axis ticks. Label points directly instead of using legends (Okabe and Ito advise labelling directly on the figure [S74]).
- Use tabular (monospaced) numerals for stats so digits line up [S7].
- Use a consistent y-scale across small multiples of the same metric, so session tiles can be compared by eye [S1].
- On phones roughly 375–440 pt wide (approximate, **UNVERIFIED** per model), give the plot area full width and put the explanation text above the chart, not beside it [S2].

---

## 6. Video playback, annotation and comparison

### 6.1 Patterns in coaching tools

| Feature | Where seen | Notes |
|---|---|---|
| Frame-by-frame stepping, slow motion | Onform, V1 Golf [S51][S56] | iOS: `AVPlayerItem.step(byCount:)` with `canStepForward`/`canStepBackward` [S19] |
| Drawing and angle tools | Onform, Dartfish ("measure angles and times") [S51][S54] | Manual tools suit coaches. For players, auto-annotation with confidence is better [Our inference] |
| 2D skeleton overlay | Onform (every tier), V1 Golf [S52][S56] | Apple Vision gives 19 joints with per-joint confidence. Ignore joints at confidence 0. The subject should fill at least one-third of the frame height [S20] |
| Side-by-side over time | Onform, V1 Golf, Sportsbox [S51][S56][S50] | Sync by **phase** (e.g., toss release, contact), not by clock time [Our inference] |
| Overlay / "ghost" | V1 Golf overlay, Sportsbox 2D and 3D overlay, Dartfish SimulCam [S56][S50][S55] | Align on the contact frame and scale by player height in pixels. A fixed camera is needed [Our inference] |
| Key positions / stroboscopic sequence | Sportsbox key positions, Dartfish StroMotion [S50][S55] | Maps onto our phase strip: setup, toss release, trophy/loading, drive, contact, landing, recovery |
| Multi-angle | Onform 2- or 4-angle multicam [S52] | A second angle unlocks placement or forward toss. The UI should show what each angle adds |
| Voice-over / audio | Onform voice-over; SwingVision Goal Mode audio call-outs [S52][S44] | A short audio cue during the practice drill fits the "one cue" idea [Our inference] |

### 6.2 Apple platform constraints

- Use the system player where possible for familiar behaviour, and always keep the original aspect ratio. If a custom player is needed, model its behaviour on the system player [S8] [Established, platform guidance].
- Liquid Glass (iOS 26) is for the controls and navigation layer, not content. Over video, use the clear variant with a dimming layer of about 35% when the video is bright. Respect Reduce Transparency and Increase Contrast [S13].
- Respect Reduce Motion: cut auto-play loops and swap animated transitions for fades [S5].

### 6.3 Proposed "evidence-first" playback [Our inference]

1. Open on the **evidence frame** for the session's focus (e.g., the contact frame with the toss-to-contact offset drawn), not at 0:00.
2. A **phase strip** under the video (7 thumbnails) lets players tap a phase to jump there. The frame for the focus phase is marked with a glyph and a label, not colour alone.
3. **Overlays can be toggled one at a time:** skeleton (low-confidence joints faded, 0-confidence joints hidden [S20]), toss path, contact marker, and a court box when calibrated. Only one overlay is on by default, to avoid clutter.
4. A **per-serve stat drawer** shows that serve's values with data-state chips.
5. **Compare:** pick "My best serve", "Last session" or "Before the drill". Choose side-by-side or ghost, phase-synced, with a scrub bar that moves both clips.
6. **Frame-step buttons** of at least 44 × 44 pt (the HIG default control size [S5]; our choice, since outdoor use with sweaty hands argues against smaller targets), plus swipe gestures to scrub.

---

## 7. Capture guidance and live framing

Benchmarks:

- **Apple's Action & Vision sample** runs this sequence: fixed tripod, detect the play area, check scene stability by registering consecutive frames, detect the person, then analyse [S21] [Established, platform sample].
- **Apple Vision** wants the subject at least one-third of the frame height and warns that flowing clothing and crowds reduce accuracy [S20].
- **Fulltrack:** tripod over 60 in (about 1.5 m), stump calibration, "30 second setup", and a warning that poor calibration ruins tracking [S57] [Vendor claim].
- **HomeCourt:** lowest-friction option (prop the phone on a water bottle), with a tripod for advanced tracking [S59] [Vendor claim].
- **HIG Camera Control:** keep the overlay UI minimal so it does not hide the viewfinder [S16].

Proposed live framing checklist [Our inference; details in 06-capture-protocol]:

| Check | Pass condition (v1) | Feedback if failing |
|---|---|---|
| Phone steady | Frame-to-frame shift below threshold for 2 s (image registration, per [S21]) | "Hold still. Lean the phone on the fence or use a mount" |
| Player size | Person height ≥ ⅓ of frame [S20] and full body visible | "Move the phone closer" or "Step into the box" outline |
| Toss room | Headroom above the player is at least about one extra body height | "Tilt up. Your toss needs space" |
| View recognised | Side or behind view detected from the court lines and the player's orientation | Chip: "Side view: timing, toss height, contact" |
| Light | Exposure and shutter within limits. Flicker check under lights [S84] | "Low light: timing will be less precise" (downgrade, not block) |
| Frame rate | 60 fps or more available | "Switch to 60 fps for timing" |

Design rules [Our inference]: every check has a text label and a glyph, not just a green or red dot [S6]. The Record button says **Ready** only when the core checks pass. "Record anyway" stays available but downgrades data states (e.g., toss height becomes Unavailable). An Apple Watch or voice "start" helps players who are on their own.

---

## 8. Onboarding, permissions, waiting and notifications

- **Onboarding** should be "fast, fun, and optional". Teach through interaction, defer permissions until a feature needs them, and do not ask for ratings or purchases before people have used the app [S9] [Established, platform guidance]. NN/g advises brief, optional onboarding, advises against deck-of-cards tutorials, and prefers contextual help. Customising content (fitness level, goals) is a legitimate onboarding step [S80] [Established, practitioner research].
- **Permissions:** ask for camera access when the player first taps Record. A pre-alert screen may have only one "Continue" button. Purpose strings should say exactly why, and the app should process on-device where possible [S14]. For imports, prefer limited photo access ("Select Photos") [S14].
- **Waiting:** people lose focus after about 10 s. Longer operations need a percent-done indicator and a way to interrupt [S78]. In a single study reported by NN/g, people shown a moving progress bar were willing to wait about three times longer on average than people shown no indicator [S79]. Apple says to use determinate indicators when possible, report progress accurately (no 90% in 5 s followed by a stalled last 10%), describe steps specifically rather than "Loading", let people cancel, and let them do other things while content loads [S10][S11] [Established].
  - Our proposal: staged progress such as "Finding serves (9 found)… Tracking the toss… Timing each phase… Choosing your focus". Analysis runs in the background, and a single notification says "Your session is ready". Players who stay in the app can watch the first finished serve while the rest process [Our inference].
- **Notifications:** get consent first. Send only timely, high-value messages, with no marketing and no telling people to perform tasks in the app [S15]. For us, that means "analysis ready" and optionally one opt-in re-test reminder [Our inference].

**Proposed first-run sequence** [Our inference]:
1. Value screen (one sentence, one sample session animation, skippable).
2. Three quick questions: level (UTR optional, player-entered), main goal (more first serves in / more pace / less effort or pain-free), and dominant hand plus height (needed for scale).
3. "Try it on a sample serve": interactive playback of a bundled clip teaches the phase strip and data states by doing [S9].
4. Record → camera permission requested in context → live framing checklist.
5. First analysis → focus card. Paywall or trial prompts only **after** the first report (per HIG [S9]).

---

## 9. From analysis to "next action"

Benchmarks: Runna leads with the day's workout [S42]. Oura's Today tab gives need-to-know insights first [S34]. Oura Advisor lets people pick a tone and edit its memory [S35]. Strava's AI summaries have a feedback control and can be hidden [S40]. Apple's Workout Buddy speaks generated encouragement drawn from the wearer's workout data and fitness history, processed with Apple Intelligence on a nearby supported iPhone and voiced by a text-to-speech model built from Fitness+ trainer voices (English only at launch) [S24]. Gentler Streak and Apple's ring pause make rest and interruption normal [S30][S23]. [Vendor claim]

**Proposed focus card** [Our inference; coaching content comes from 03- and 04- research]:

```
YOUR FOCUS THIS WEEK
Toss slightly more in front
Evidence ▸ contact was behind your head on 8 of 12 serves  [Measured]
          ▸ key frame: Serve 7, contact              [tap to view]
Cue       "Toss to 1 o'clock, hit up and out"
Drill     Toss-and-catch on a target, 3 × 10 (≈5 min)
[ Start drill ]   [ Log practice ]   [ Why this? ]
Re-test   Record 12 serves, same side view — we'll compare
Comfort   Any pain? ▸ stop and see a qualified professional
```

Rules [Our inference]:
- **One** focus at a time, chosen by expected value and confidence. If no issue clears the confidence bar, say "Nothing clear to change. Keep building consistency" rather than inventing a flaw.
- The explanation cites only Measured or Estimated evidence, never Experimental (following Strava's exclusion rule [S40]).
- The re-test uses the **same capture preset** so the comparison is matched (after [S38]).
- The pain or injury prompt points to a qualified professional and never offers a diagnosis. The tone stays encouraging, in line with Gentler Streak and Oura's copy [S30][S33].

---

## 10. Accessibility baseline for mobile data visualisation

| Requirement | Target | Source |
|---|---|---|
| Text contrast | 4.5:1 up to 17 pt; 3:1 at 18 pt+ or bold | HIG [S5] [Established] |
| Graphical-object contrast (chart lines, dots, zones) | 3:1 against adjacent colours | WCAG 2.2 SC 1.4.11 [S77] [Established] |
| Colour not the only cue | Pair every colour with a shape, text or pattern | WCAG SC 1.4.1 [S76]; HIG [S5][S6] |
| Colour-vision deficiency | About 1 in 12 Caucasian men (8%), 1 in 20 Asian men (5%) and 1 in 25 African men (4%) have red–green colour-vision deficiency [S74]. Avoid red–green and blue–orange contrasts [S5]. Use the Okabe–Ito palette (commonly given as #E69F00, #56B4E9, #009E73, #F0E442, #0072B2, #D55E00, #CC79A7, #000000; hex values as widely reproduced, check against the source figure) | [S74][S5] |
| Dynamic Type | Support 200% or more. Minimum 11 pt on iOS. Stack layouts at accessibility sizes and keep truncation to a minimum | [S5][S7] |
| Touch targets | Use 44 × 44 pt, the HIG's default control size on iOS (the HIG lists 28 × 28 pt as the absolute minimum), with about 12 pt padding around bezelled and 24 pt around borderless elements | [S5] |
| VoiceOver and Audio Graphs | Every chart has meaningful accessibility labels describing what the data means, plus `AXChartDescriptor` | [S2][S18] |
| Motion | Honour Reduce Motion: fades instead of zooms, no looping auto-play | [S5] |
| Sunlight and outdoor courts | Test in bright sunlight and in increased-contrast mode. Offer a high-contrast "court-side" appearance for recording screens | HIG colour guidance on testing under varied lighting [S6]; the court-side mode is Our inference |
| Cultural colour meaning | Do not rely on red meaning "bad" | [S6] |

---

## 11. Twenty design patterns to adopt

| # | Pattern | Seen in | How it applies to the serve coach | Evidence |
|---|---|---|---|---|
| 1 | **Headline first**: one plain-language sentence plus one number with context above any chart | HIG and WWDC22 [S1][S4]; Oura Today [S34] | "Your toss was your most consistent yet: spread 9 cm (usual 12–15)" | Established + Vendor claim |
| 2 | **Five visible data states** (Measured, Estimated, Player-entered, Experimental, Unavailable), each with a distinct glyph and label | Rapsodo [S61]; WHOOP states [S36] | Chips on every stat and tooltip, plus a "How we measured" sheet | Vendor claim → Our inference |
| 3 | **Ranges, not false precision**, for estimates. Experimental values are always rounded ranges | Sportsbox conditional accuracy [S48]; uncertainty research [S64][S66] | "≈ 2.6–2.8 m toss height". Speed "about 130–145 km/h (Experimental)" only when its prerequisites are met | Established (uncertainty research) + Vendor claim → Our inference |
| 4 | **Per-serve dot plots** as the default uncertainty display (frequency framing) | Quantile dotplots [S63][S64] | Every serve is a dot. Sessions appear as dot clusters with a median | Established |
| 5 | **Capture-quality indicator** with reasons and a fix link | WHOOP `UNSCORABLE` / calibrating [S36]; Fulltrack calibration [S57] | "Fair: toss left frame on 3 of 12 serves → Tilt phone up" | Vendor claim → Our inference |
| 6 | **"How to unlock"** for unavailable metrics | FlightScope and Rapsodo spin prerequisites [S62][S61] | "Placement: needs a rear view and a court tap-calibration (2 min)" | Vendor claim |
| 7 | **Calibration period** before trends | Apple Cardio Fitness [S25]; Oura baseline [S33] | "Building your baseline: 1 of 2 sessions" | Vendor claim |
| 8 | **Personal typical-range band** behind trends | Apple Vitals [S23]; Tufte [S72]; Few [S73] | Grey band = your last-N-sessions range; the latest point is labelled | Vendor claim + established design practice (not peer-reviewed) |
| 9 | **Short vs long window, named on a five-step scale** | Apple Training Load [S23]; Activity Trends [S22] | "Last 2 sessions vs last 8: toss spread *below usual* (better)" | Vendor claim |
| 10 | **Matched comparisons only** | Strava Matched Activities [S38] | Trends filter by view, serve side, first or second serve, and intended type | Vendor claim → Our inference |
| 11 | **Experiment card**: "Did this change work?" with honest verdicts and a serves-needed estimate | Hopkins typical error [S70][S71]; Wilson intervals [S69] | Before/after dot plots plus "Likely improvement: about 40 more serves to confirm" | Established (statistical methods) → Our inference (verdict design) |
| 12 | **Progressive disclosure**: small static chart → interactive detail, keeping state | WWDC22 [S4] | Progress tab tiles open detailed trend views | Established |
| 13 | **Small multiples and sparklines** on consistent scales | Tufte [S72]; HIG consistency [S1] | Progress tab: one sparkline tile per key question | Established design practice (platform guidance; not peer-reviewed) |
| 14 | **Evidence-first playback** with a phase strip | Sportsbox key positions [S50]; Onform frame-stepping [S51] | Video opens on the focus frame. Seven-phase thumbnails | Vendor claim → Our inference |
| 15 | **Phase-synced side-by-side and ghost overlay** | V1 Golf [S56]; Dartfish SimulCam [S55]; Sportsbox overlay [S50] | Compare with "best serve" or "before drill", aligned on contact | Vendor claim |
| 16 | **Confidence-aware skeleton**: fade low-confidence joints, hide zero-confidence ones, one overlay at a time | Apple Vision docs [S20] | Joint dots shrink or fade with confidence. No jittering limbs | Established (platform) |
| 17 | **Live framing checklist** with stability and subject-size checks; "Ready" only when the core checks pass | Action & Vision [S21]; Vision one-third rule [S20]; HomeCourt/Fulltrack [S59][S57] | Text-plus-glyph checklist over a minimal viewfinder [S16] | Established (platform) + Vendor claim |
| 18 | **Staged, determinate, background processing** with a single "ready" notification | HIG [S10][S11]; Nielsen [S78]; NN/g [S79] | "Timing each phase (7 of 12)". Cancellable. Watch finished serves early | Established |
| 19 | **One focus card**: evidence, cue, drill, log, re-test | Runna "today" [S42]; Oura Today [S34] | See §9. Nothing else competes for the primary button | Vendor claim → Our inference |
| 20 | **Calm, non-punitive tone and rest-friendly progress** | Gentler Streak (ADA 2024) [S27][S30]; Apple ring pause [S23]; Calm Technology [S81] | No streak shaming. "Rest week" pauses reminders. Encouraging but honest copy | Vendor claim + Our inference |

(Accessibility (§10) and just-in-time permissions with on-device-first privacy (§8) are baseline requirements rather than optional patterns.)

---

## 12. Ten anti-patterns to avoid

| # | Anti-pattern | Why it fails | Instead |
|---|---|---|---|
| 1 | **Precise speed or spin from footage that cannot support it** (e.g., "142.7 km/h" from a 30 fps side view; any rpm figure) | Violates the brief and invites mistrust. Phone video cannot measure serve spin [S84]. App Review 1.4.1 already requires disclosed methodology for health-measurement accuracy claims, which shows where platform expectations point (applicability to sports metrics is Our inference) [S82] | Experimental range with prerequisites, or "—" with an unlock path |
| 2 | **Black-box composite "Serve Score" (0–100)** | No validation behind it. It hides which component changed and invites gaming | Separate, named metrics plus one focus. At most, a descriptive "consistency" summary made of visible parts |
| 3 | **Declaring improvement from one small session**, with green or red arrows on every tile | 12/20 vs 10/20 is noise (the intervals overlap heavily; §3.4) | Matched, pooled verdicts with n and a typical-range band |
| 4 | **Colour-only encodings** (red/green in-out maps, red deltas) | About 8% of Caucasian men have red–green colour-vision deficiency [S74]. Breaches WCAG 1.4.1 [S76] | Shapes, text labels and Okabe–Ito colours |
| 5 | **Jittery full skeletons and 0.1° angle read-outs** | 2D angles carry ±10–15° error or more off-plane [S84]. Low-confidence joints mislead [S20] | Confidence-faded joints, angle categories, and evidence frames |
| 6 | **Dashboard overload**: 15+ tiles on first view, or pro-player norms as targets | Contradicts the HIG's "keep it simple" advice [S1]. Oura moved from five tabs to three [S34]. Level norms barely separate levels for in-rate [S45] | Headline, one focus, then up to three key-question tiles |
| 7 | **Deck-of-cards onboarding, permission barrage, paywall before value** | NN/g and the HIG both advise against it [S80][S9] | Interactive sample-serve tutorial, in-context permissions, paywall after the first report |
| 8 | **Indeterminate spinner for a multi-minute analysis that blocks the app** | People lose focus beyond about 10 s. Vague "Loading" copy [S78][S10] | Staged determinate progress, background processing, cancel, early preview |
| 9 | **Streak guilt, nagging or marketing notifications** | Clashes with a calm brand, and the HIG discourages marketing notifications [S15][S30] | One "analysis ready" push and an optional, opt-in re-test reminder |
| 10 | **Hidden storage, upload-everything defaults, no deletion** | Health and fitness users expect data control (Apple's own Health messaging leads with on-device encryption [S26]). Guideline 5.1.1 requires in-app account deletion when accounts exist [S82] | Settings → Storage: keep clips on device by default, auto-delete originals after analysis (optional), delete a session or all data in two taps |

---

## 13. Proposed information architecture

### 13.1 Tabs

The HIG says tab bars are for navigation, not actions. Keep tabs few, avoid a "More" tab, and label each tab with a single word [S12]. Oura's three-tab model shows how far consolidation can go [S34]. We propose **four tabs**, with Record as a destination (capture setup), not a bare action button [Our inference].

| Tab | Purpose | Key content | Flow stage |
|---|---|---|---|
| **Today** | "What should I do now?" | Focus card (cue, drill, log, re-test), last session headline, "Record session" primary button, baseline progress while calibrating | Practise, Compare |
| **Record** | Set up and capture | Capture presets (Side view: timing and toss; Behind view: placement), live framing checklist, serve-side and first/second toggles, intended serve type, import from Photos | Record |
| **Sessions** | History and reports | Session list (date, view, n serves, headline, capture quality) → Session report → Serve detail → Compare | Analyse, Understand |
| **Progress** | "Am I improving?" | Three to four question tiles (toss consistency, first serves in, rhythm, contact), experiments ("Did this change work?"), matched-session filter | Compare |
| *(Profile sheet, top-right avatar)* | Settings and trust | Level (UTR, player-entered), goals, comfort and pain flags, height and hand, **Storage & privacy**, **How we measure**, Experimental metrics toggle, subscription | — |

### 13.2 Screen hierarchy

```
Today
 ├─ Focus card ─▶ Drill player (timer, audio cue) ─▶ Log practice
 ├─ Re-test prompt ─▶ Record (preset pre-filled, matched)
 └─ Last session headline ─▶ Session report
Record
 ├─ Preset picker (Side | Behind | Both*)      *second phone or later session
 ├─ Live framing checklist ─▶ Recording (serve counter, voice/Watch start/stop)
 └─ Import from Photos (limited picker)
      └─ Processing (staged, cancellable, background) ─▶ notification
Sessions
 └─ Session report
     1. Headline + capture quality
     2. Your focus (evidence frame, cue, drill)       ── same card as Today
     3. Stats (Measured first; Estimated with bands; Unavailable rows with "unlock")
     4. All serves strip (filter: in/out, first/second, flagged)
     5. How we measured (per-metric method, error, status)
     └─ Serve detail: video + phase strip + overlay toggles + stat drawer
         └─ Compare: vs best serve | vs last session | vs before drill (side-by-side | ghost)
Progress
 ├─ Question tiles (sparkline + verdict + n)
 │    └─ Trend detail (dot plot, typical-range band, matched filter, AX audio graph)
 └─ Experiments ("Toss in front: 3 Oct → 10 Oct") ─▶ before/after dot plots + verdict
Profile sheet
 └─ Goals · Comfort · Storage & privacy · How we measure · Experimental toggle · Plan
```

### 13.3 How the flow maps to screens

| Stage | Primary screen | What the user sees in under 5 seconds |
|---|---|---|
| Record | Record → framing checklist | "Ready: side view, full body, toss room OK" |
| Analyse | Processing | "Timing each phase (7 of 12). You can leave; we'll notify you" |
| Understand | Session report → Serve detail | Headline, capture quality, evidence frame, 3–5 stats with data-state chips |
| Practise | Focus card → Drill player | One cue, one drill, a timer, "Log practice" |
| Compare | Re-test → Experiment result | Before/after dot plots, a verdict word, n, and "About N more serves to confirm" if needed |

### 13.4 Session report wireframe (phone, top to bottom)

```
Sat 26 Sep · Side view · 14 serves (12 usable)     Capture: Good ⓘ
────────────────────────────────────────────────────────────────
Your toss was more repeatable than usual; contact was often behind you.
────────────────────────────────────────────────────────────────
[ Focus card: Toss slightly more in front ▸ evidence frame thumbnail ]
────────────────────────────────────────────────────────────────
Toss spread (side view)      9 cm   usual 12–15   ● Measured    ▁▂▃▂▁
Toss→contact time          0.92 s   usual 0.88–0.98 ● Measured  ▂▂▃▂▂
Contact height          ≈ 2.55–2.70 m  ≈ Est.                   [bullet]
First serves in            8/12 (you logged)  ✎ Player-entered  [dot+band]
Serve speed                 —   🔒 Needs behind view + calibration  Unlock ›
Spin                        —   🔒 Not measurable from phone video   Why ›
────────────────────────────────────────────────────────────────
All serves ▸ ●●●●✕●●●▲●●●   (tap any serve)
How we measured ›
```

(Values are illustrative, not measured data.)

---

## Implications for the product

1. **P0 – Build the data-state system first.** Add a `dataState` field (measured | estimated | playerEntered | experimental | unavailable) plus `reasonCode` to every metric value in the data model. Give each state its own glyph, text chip and chart style, and lint the UI so no number renders without a state. Coaching text may cite only measured or estimated values.
2. **P0 – Make the Session report headline-first.** Order: one sentence, capture quality, focus card, then 3–5 stats. Cap the first screen at one chart. Put a "How we measured" sheet in every report.
3. **P0 – Use honest comparison logic.** Show n with every rate and Wilson intervals as bands. Use matched-session filters and the five-level verbal verdicts. Show "about N more serves to confirm" rather than a bare arrow. Lead progress with low-noise process metrics (toss and contact spread, rhythm), with first-serve-in % as a supporting stat.
4. **P0 – Ship the live framing checklist:** stability, subject at least one-third of frame height, toss headroom, view detection, light/flicker and fps. "Ready" gating with "record anyway" downgrades.
5. **P0 – Make playback evidence-first.** Open on the focus frame, show the seven-phase strip, one overlay at a time, a confidence-faded skeleton and 44 pt frame-step controls, and phase-synced side-by-side or ghost comparison.
6. **P1 – Build the Progress tab** from three or four question tiles using sparklines with typical-range bands, plus an "Experiments" list that links each practice focus to a re-test and a verdict.
7. **P1 – Process in the background** with staged determinate progress, cancel, early viewing of finished serves and a single "ready" notification. No marketing pushes.
8. **P1 – Meet the accessibility baseline in the design system:** Okabe–Ito palette, shape-coded outcomes, tabular numerals, Dynamic Type to 200% with stacked layouts, `AXChartDescriptor` on every chart, Reduce Motion variants and a high-contrast court-side mode tested in Australian midday sun.
9. **P1 – First run:** a skippable value screen, three content questions, an interactive sample-serve tutorial, camera permission at first Record, and the paywall only after the first report.
10. **P2 – Tone and care:** encouraging copy with no streak guilt, a "rest week" pause, and a pain flag on the focus card that routes to a qualified professional.
11. **P2 – Storage & privacy screen:** on-device by default, optional auto-delete of originals after analysis, per-session and full deletion, and clear labels for anything processed off-device.
12. **Validation of the UX itself:** test whether players make the *right practice decision* and interpret the verdicts correctly (decision-quality testing, per [S65]), not just whether they "like" the charts. Include colour-vision-deficient and large-text participants.

## Open questions

1. **Thresholds for verdicts.** What typical error and minimal detectable change apply to each Measured metric (toss spread, contact spread, rhythm) for recreational players? This needs test–retest data from our own sample clips before the verdict wording can go live.
2. **Composite summary or not.** Would a transparent "consistency" summary (built from visible components) help retention without the pitfalls of a black-box score? Needs A/B testing.
3. **Record as a tab vs a floating action.** Does a Record tab (destination) outperform a single prominent button on Today in first-week activation? The HIG favours navigation-only tabs, but the flow is capture-heavy.
4. **Showing Experimental speed at all.** Does a rounded Experimental speed range raise trust and engagement, or does it anchor players on an unvalidated number? Should it stay off by default until radar validation passes?
5. **Dotplots vs bands in practice.** Do recreational players read per-serve dot plots and Wilson bands correctly on a phone in daylight? The CHI transit studies [S63][S64] suggest yes, but the context differs.
6. **Sources we could not open.** WHOOP's current colour bands and home design, SwingVision's in-app setup and uncertainty UI, Garmin R10's measured vs estimated list, and whether Athlytic won an Apple Design Award before 2024 all remain **UNVERIFIED**. They should be checked hands-on with the apps.
7. **Apple Health redesign (late 2026).** Apple says a redesigned Health app is coming [S26]. Its new patterns for trends and insights may shift user expectations and should be reviewed at launch.
8. **Audio and Watch cues during drills.** Would spoken cues (in the style of SwingVision Goal Mode or Workout Buddy) help solo practice, or break the calm experience? This is worth a small field test at Australian public courts.

---

## Sources

- **S1** "Charting data", Human Interface Guidelines. Apple. 2025–2026 (current version). https://developer.apple.com/design/human-interface-guidelines/charting-data (read via JSON endpoint) — accessed 2026-09-27
- **S2** "Charts", Human Interface Guidelines. Apple. 2025–2026. https://developer.apple.com/design/human-interface-guidelines/charts — accessed 2026-09-27
- **S3** "Design an effective chart" (WWDC22 session 110340). Apple. 2022. https://developer.apple.com/videos/play/wwdc2022/110340/ — accessed 2026-09-27
- **S4** "Design app experiences with charts" (WWDC22 session 110342). Apple. 2022. https://developer.apple.com/videos/play/wwdc2022/110342/ — accessed 2026-09-27
- **S5** "Accessibility", Human Interface Guidelines. Apple. 2025–2026. https://developer.apple.com/design/human-interface-guidelines/accessibility — accessed 2026-09-27
- **S6** "Color", Human Interface Guidelines. Apple. 2025–2026. https://developer.apple.com/design/human-interface-guidelines/color — accessed 2026-09-27
- **S7** "Typography", Human Interface Guidelines. Apple. 2025–2026. https://developer.apple.com/design/human-interface-guidelines/typography — accessed 2026-09-27
- **S8** "Playing video", Human Interface Guidelines. Apple. 2025–2026. https://developer.apple.com/design/human-interface-guidelines/playing-video — accessed 2026-09-27
- **S9** "Onboarding", Human Interface Guidelines. Apple. 2025–2026. https://developer.apple.com/design/human-interface-guidelines/onboarding — accessed 2026-09-27
- **S10** "Progress indicators", Human Interface Guidelines. Apple. 2025–2026. https://developer.apple.com/design/human-interface-guidelines/progress-indicators — accessed 2026-09-27
- **S11** "Loading", Human Interface Guidelines. Apple. 2025–2026. https://developer.apple.com/design/human-interface-guidelines/loading — accessed 2026-09-27
- **S12** "Tab bars", Human Interface Guidelines. Apple. 2025–2026. https://developer.apple.com/design/human-interface-guidelines/tab-bars — accessed 2026-09-27
- **S13** "Materials" (Liquid Glass), Human Interface Guidelines. Apple. 2025–2026. https://developer.apple.com/design/human-interface-guidelines/materials — accessed 2026-09-27
- **S14** "Privacy", Human Interface Guidelines. Apple. 2025–2026. https://developer.apple.com/design/human-interface-guidelines/privacy — accessed 2026-09-27
- **S15** "Notifications", Human Interface Guidelines. Apple. 2025–2026. https://developer.apple.com/design/human-interface-guidelines/notifications — accessed 2026-09-27
- **S16** "Camera Control", Human Interface Guidelines. Apple. 2024–2026. https://developer.apple.com/design/human-interface-guidelines/camera-control — accessed 2026-09-27
- **S17** "Swift Charts" framework documentation. Apple. 2022–2026. https://developer.apple.com/documentation/charts — accessed 2026-09-27
- **S18** "AXChartDescriptor" documentation. Apple. 2021–2026. https://developer.apple.com/documentation/accessibility/axchartdescriptor — accessed 2026-09-27
- **S19** "step(byCount:)", AVPlayerItem documentation. Apple. n.d. https://developer.apple.com/documentation/avfoundation/avplayeritem/step(bycount:) — accessed 2026-09-27
- **S20** "Detecting human body poses in images", Vision documentation. Apple. n.d. https://developer.apple.com/documentation/vision/detecting-human-body-poses-in-images — accessed 2026-09-27
- **S21** "Building a feature-rich app for sports analysis" (Action & Vision sample). Apple. 2020–2026. https://developer.apple.com/documentation/vision/building-a-feature-rich-app-for-sports-analysis — accessed 2026-09-27
- **S22** "watchOS 6 advances health and fitness capabilities for Apple Watch". Apple Newsroom. June 2019. https://www.apple.com/newsroom/2019/06/watchos-6-advances-health-and-fitness-capabilities-for-apple-watch/ — accessed 2026-09-27
- **S23** "watchOS 11 brings powerful health and fitness insights". Apple Newsroom. June 2024. https://www.apple.com/newsroom/2024/06/watchos-11-brings-powerful-health-and-fitness-insights/ — accessed 2026-09-27
- **S24** "watchOS 26 delivers more personalized ways to stay active and connected". Apple Newsroom. June 2025. https://www.apple.com/newsroom/2025/06/watchos-26-delivers-more-personalized-ways-to-stay-active-and-connected/ — accessed 2026-09-27
- **S25** "About Cardio Fitness on Apple Watch" (HT211856). Apple Support. n.d. https://support.apple.com/en-us/HT211856 — accessed 2026-09-27
- **S26** "Health" product page. Apple. 2026. https://www.apple.com/health/ — accessed 2026-09-27
- **S27** "Apple announces winners of the 2024 Apple Design Awards". Apple Newsroom. June 2024. https://www.apple.com/newsroom/2024/06/apple-announces-winners-of-the-2024-apple-design-awards/ — accessed 2026-09-27
- **S28** "Apple Design Awards 2024". Apple Developer. 2024. https://developer.apple.com/design/awards/2024/ — accessed 2026-09-27
- **S29** "Apple unveils winners and finalists of the 2025 Apple Design Awards". Apple Newsroom. June 2025. https://www.apple.com/newsroom/2025/06/apple-unveils-winners-and-finalists-of-the-2025-apple-design-awards/ — accessed 2026-09-27
- **S30** "Gentler Streak" product page. Gentler Stories d.o.o. 2026. https://gentlerstories.com/gentlerstreak/ — accessed 2026-09-27
- **S31** "Athlytic" product page. Athlytic. 2026. https://www.athlyticapp.com/ — accessed 2026-09-27
- **S32** "Readiness Score" (blog). Oura Health. n.d. https://ouraring.com/blog/readiness-score/ — accessed 2026-09-27
- **S33** "Readiness Score" (support article). Oura Health. n.d. https://support.ouraring.com/hc/en-us/articles/360025589793-Readiness-Score — accessed 2026-09-27
- **S34** "The new Oura app experience". Oura Health. 3 Oct 2024. https://ouraring.com/blog/new-oura-app-experience/ — accessed 2026-09-27
- **S35** "Oura Advisor". Oura Health. 31 Mar 2025 (updated 2026). https://ouraring.com/blog/oura-advisor/ — accessed 2026-09-27
- **S36** "Recovery" (API data model). WHOOP Developer. n.d. https://developer.whoop.com/docs/developing/user-data/recovery/ — accessed 2026-09-27
- **S37** "Whoop (company)". Wikipedia. 2026. https://en.wikipedia.org/wiki/Whoop_(company) — accessed 2026-09-27 (secondary source; used only for launch dates)
- **S38** "Matched Activities". Strava Support. n.d. https://support.strava.com/hc/en-us/articles/216918597-Matched-Activities — accessed 2026-09-27
- **S39** "Fitness & Freshness". Strava Support. n.d. https://support.strava.com/hc/en-us/articles/216918477-Fitness-Freshness — accessed 2026-09-27
- **S40** "Athlete Intelligence on Strava". Strava Support. 2024–2026. https://support.strava.com/hc/en-us/articles/26786795557005-Athlete-Intelligence-on-Strava — accessed 2026-09-27
- **S41** "Strava". Wikipedia. 2026. https://en.wikipedia.org/wiki/Strava — accessed 2026-09-27 (secondary source; acquisition date only)
- **S42** Runna home page. Runna. 2026. https://www.runna.com/ — accessed 2026-09-27
- **S43** "SwingVision: Tennis Pickleball", App Store (Australia). SwingVision Inc. 2026. https://apps.apple.com/au/app/swingvision-tennis-pickleball/id989461317 — accessed 2026-09-27
- **S44** "How to practice tennis alone and actually improve". SwingVision blog. 19 Aug 2026. https://blog.swing.vision/2026/08/19/how-to-practice-tennis-alone-and-actually-improve/ — accessed 2026-09-27
- **S45** "The real data behind every NTRP level". SwingVision blog. 1 Sep 2026. https://blog.swing.vision/2026/09/01/the-real-data-behind-every-ntrp-level/ — accessed 2026-09-27
- **S46** "3.0 vs 4.0 tennis player data". SwingVision blog. 10 Aug 2026. https://blog.swing.vision/2026/08/10/3-0-vs-4-0-tennis-player-data/ — accessed 2026-09-27
- **S47** "SwingVision review and interview". Tennisnerd. 30 Oct 2021. https://www.tennisnerd.net/tennis-tools/swingvision-review-and-interview/25702 — accessed 2026-09-27 (historical; outdated pricing)
- **S48** "Sportsbox AI accuracy". Sportsbox AI Help Center. n.d. https://help.sportsbox.ai/sportsbox-ai-accuracy — accessed 2026-09-27
- **S49** Sportsbox AI home page. Sportsbox AI. 2026. https://www.sportsbox.ai/ — accessed 2026-09-27
- **S50** "Sportsbox 3D Golf", App Store (Australia). Sportsbox AI. 2026. https://apps.apple.com/au/app/sportsbox-3d-golf/id1578921026 — accessed 2026-09-27
- **S51** Onform home page. Onform. 2026. https://onform.com/ — accessed 2026-09-27
- **S52** "Pricing". Onform. 2026. https://www.onform.com/pricing — accessed 2026-09-27
- **S53** "Onform acquires Hudl Technique app from Hudl". Onform. May 2021. https://www.onform.com/post/onform-acquires-hudl-technique-app-from-hudl — accessed 2026-09-27
- **S54** "Plans". Dartfish. 2026. https://www.dartfish.com/plans/ — accessed 2026-09-27
- **S55** Dartfish home page. Dartfish. 2026. https://www.dartfish.com/ — accessed 2026-09-27
- **S56** "V1 Golf: Golf Swing Analyzer", App Store (Australia). V1 Sports. 2026. https://apps.apple.com/au/app/v1-golf-golf-swing-analyzer/id349715369 — accessed 2026-09-27
- **S57** Fulltrack AI home page. Fulltrack AI. 2026. https://www.fulltrack.ai/ — accessed 2026-09-27
- **S58** "Fulltrack AI", App Store (Australia). Fulltrack AI. 2026. https://apps.apple.com/au/app/fulltrack-ai/id1568524044 — accessed 2026-09-27
- **S59** HomeCourt home page. NEX Team. n.d. https://www.homecourt.ai/ — accessed 2026-09-27
- **S60** "HomeCourt: Basketball Training", App Store (Australia). NEX Team. listing as fetched. https://apps.apple.com/au/app/homecourt-basketball-training/id1258520424 — accessed 2026-09-27
- **S61** "MLM2PRO Mobile Launch Monitor & Golf Simulator" (AU). Rapsodo. 2026. https://rapsodo.com.au/products/mlm2pro-mobile-launch-monitor-golf-simulator-au — accessed 2026-09-27
- **S62** "Mevo+". FlightScope. 2026. https://flightscope.com/products/mevo-plus — accessed 2026-09-27
- **S63** Kay M, Kola T, Hullman J, Munson S. "When (ish) is my bus? User-centered visualizations of uncertainty in everyday, mobile predictive systems". CHI 2016. DOI 10.1145/2858036.2858558. Metadata and abstract via https://api.openalex.org/works/doi:10.1145/2858036.2858558 — accessed 2026-09-27
- **S64** Fernandes M, Walls L, Munson S, Hullman J, Kay M. "Uncertainty displays using quantile dotplots or CDFs improve transit decision-making". CHI 2018. DOI 10.1145/3173574.3173718. Via https://api.openalex.org/works/doi:10.1145/3173574.3173718 — accessed 2026-09-27
- **S65** Hullman J, Qiao X, Correll M, Kale A, Kay M. "In pursuit of error: A survey of uncertainty visualization evaluation". IEEE TVCG 25(1), 2019 (online 2018). DOI 10.1109/TVCG.2018.2864889. Via https://api.openalex.org/works/doi:10.1109/TVCG.2018.2864889 — accessed 2026-09-27
- **S66** Correll M, Gleicher M. "Error bars considered harmful: Exploring alternate encodings for mean and error". IEEE TVCG 20(12), 2014. DOI 10.1109/TVCG.2014.2346298. Via https://api.openalex.org/works/doi:10.1109/TVCG.2014.2346298 — accessed 2026-09-27
- **S67** Belia S, Fidler F, Williams J, Cumming G. "Researchers misunderstand confidence intervals and standard error bars". Psychological Methods 10(4):389–396, 2005. DOI 10.1037/1082-989X.10.4.389. Via https://api.openalex.org/works/doi:10.1037/1082-989X.10.4.389 — accessed 2026-09-27
- **S68** Hullman J, Resnick P, Adar E. "Hypothetical outcome plots outperform error bars and violin plots for inferences about reliability of variable ordering". PLoS ONE 10(11), 2015. DOI 10.1371/journal.pone.0142444. Via https://api.openalex.org/works/doi:10.1371/journal.pone.0142444 — accessed 2026-09-27
- **S69** Agresti A, Coull BA. "Approximate is better than 'exact' for interval estimation of binomial proportions". The American Statistician 52(2):119–126, 1998. DOI 10.1080/00031305.1998.10480550. Via https://api.openalex.org/works/doi:10.1080/00031305.1998.10480550 — accessed 2026-09-27
- **S70** Hopkins WG. "Measures of reliability in sports medicine and science". Sports Medicine 30(1):1–15, 2000. DOI 10.2165/00007256-200030010-00001. Via https://api.openalex.org/works/doi:10.2165/00007256-200030010-00001 — accessed 2026-09-27
- **S71** Hopkins WG. "Precision of measurement" (A New View of Statistics). Sportscience. 2000. https://www.sportsci.org/resource/stats/precision.html — accessed 2026-09-27
- **S72** Tufte E. "Sparkline theory and practice" (from *Beautiful Evidence*, 2006, pp. 46–63). edwardtufte.com. n.d. https://www.edwardtufte.com/notebook/sparkline-theory-and-practice-edward-tufte/ — accessed 2026-09-27
- **S73** Few S. "Bullet Graph Design Specification". Perceptual Edge. date not captured (**UNVERIFIED**). https://www.perceptualedge.com/articles/misc/Bullet_Graph_Design_Spec.pdf — accessed 2026-09-27
- **S74** Okabe M, Ito K. "Color Universal Design (CUD): How to make figures and presentations that are friendly to colorblind people". J*Fly. 2002/2008 (version date **UNVERIFIED**). https://jfly.uni-koeln.de/color/ — accessed 2026-09-27
- **S76** "Understanding SC 1.4.1: Use of Color" (WCAG 2.2). W3C WAI. 2023–2026. https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html — accessed 2026-09-27
- **S77** "Understanding SC 1.4.11: Non-text Contrast" (WCAG 2.2). W3C WAI. 2023–2026. https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html — accessed 2026-09-27
- **S78** Nielsen J. "Response times: The 3 important limits". Nielsen Norman Group. 1993 (updated since). https://www.nngroup.com/articles/response-times-3-important-limits/ — accessed 2026-09-27
- **S79** Sherwin K. "Progress indicators make a slow system less insufferable". Nielsen Norman Group. 26 Oct 2014 (reports a University of Nebraska–Lincoln study; single study, not independently re-checked). https://www.nngroup.com/articles/progress-indicators/ — accessed 2026-09-27
- **S80** Kendrick A. "Mobile-app onboarding: An analysis of components and techniques". Nielsen Norman Group. 21 Jun 2020. https://www.nngroup.com/articles/mobile-app-onboarding/ — accessed 2026-09-27
- **S81** Case A. "Principles of Calm Technology". calmtech.com. n.d. https://calmtech.com/ — accessed 2026-09-27
- **S82** "App Review Guidelines" (1.4.1, 2.5.1, 5.1.1, 5.1.3). Apple. 2026. https://developer.apple.com/app-store/review/guidelines/ — accessed 2026-09-27
- **S83** "Latest USD rates". ExchangeRate-API (open access). Updated 26 Sep 2026 00:02 UTC (USD→AUD 1.423404; USD→EUR 0.877267). https://open.er-api.com/v6/latest/USD — accessed 2026-09-27
- **S84** Internal project document: "05 · Computer-vision feasibility" (feasibility matrix, data states, error estimates). Serve2 research team. 27 Sep 2026. `C:/Users/roger/OneDrive/Desktop/Serve2/docs/research/05-cv-feasibility.md` — accessed 2026-09-27
- **S85** "Strava to acquire Runna, a leading running training app". Strava Press. 17 Apr 2025. https://press.strava.com/articles/strava-to-acquire-runna-a-leading-running-training-app — accessed 2026-09-27 (added at fact-check)
- **S86** "SectorMark", "chartScrollableAxes(_:)" and "chartXSelection(value:)" documentation (platform availability metadata). Apple. 2023–2026. https://developer.apple.com/documentation/charts/sectormark ; https://developer.apple.com/documentation/swiftui/view/chartscrollableaxes(_:) ; https://developer.apple.com/documentation/swiftui/view/chartxselection(value:) — accessed 2026-09-27 (added at fact-check)

---

## Verification log (fact-check 2026-09-27)

Independent fact-check of the most decision-critical claims. The session's WebSearch quota was exhausted, so every check below used a direct WebFetch of the primary page (or the paper's OpenAlex record) rather than a search. Where an author's link was the only primary source, it was re-opened and read in full; where a better primary source existed (Strava press release, Apple API availability metadata), it was used instead.

| # | Claim as written (short) | Verdict | Evidence / source |
|---|---|---|---|
| 1 | SwingVision AU prices: Plus A$22.99/mo, A$149.99/yr; Pro A$39.99/mo, A$299.99/yr; Max A$59.99/mo, A$499.99/yr | Confirmed | AU App Store listing, all six IAPs match (rating 4.6 from 297 ratings; v11.9.66) [S43] |
| 2 | SwingVision >250,000 sessions; first-serve-in 53.3% (3.0) to 55.5% (5.0), range 53.3–55.8%; first-serve speed 59.5 → 74.8 mph (≈96 → 120 km/h) | Confirmed | SwingVision blog: "86 million" shots across "250,000+" sessions; 4.5 = 55.8%, 5.0 = 55.5%; conversions check out [S45]. Label stays Vendor claim |
| 3 | Wilson 95% intervals (12/20 → 38.7–78.1% … 60/100 → 50.2–69.1%) and ≈388 / 170 / 93 serves per period for 50→60/65/70% at 80% power | Confirmed | Recomputed independently (pooled-variance two-proportion formula gives 387.3, 169.3, 93.0; unpooled gives 385, 167, 91) |
| 4 | Exchange rates US$1 = A$1.4234, €1 = A$1.6225 (26 Sep 2026) | Confirmed | open.er-api.com: AUD 1.423404, EUR 0.877267 (→ €1 = A$1.6225) [S83] |
| 5 | Runna US$19.99/mo, US$119.99/yr; names coaching credentials | Confirmed | Runna home page [S42]. AUD App Store price not checked (listing URL tried returned 404); AUD figures are conversions |
| 6 | Athlytic US$4.99/mo, US$29.99/yr; not an Apple Design Award winner 2024/2025; site lists MacStories awards | Confirmed | Athlytic site (MacStories Selects Best Watch App 2025; no ADA claim) [S31]; 2024 ADA winners list has no Athlytic [S27] |
| 7 | Oura moved from five tabs to three (Today, Vitals, My Health) in October 2024 | Confirmed (clarified) | Oura blog dated 3 Oct 2024; wording changed to "announced" because rollout timing is not stated [S34] |
| 8 | Oura Readiness bands 85–100 / 70–84 / 60–69 / 0–59; 14-day weighted average vs two-month baseline; "Some variation… is a good thing" | Confirmed | Oura support article [S33] |
| 9 | Oura Advisor launched 31 Mar 2025 with Conversational/Direct tone, reviewable/deletable memories, admits mistakes | Confirmed | Oura blog, 31 Mar 2025 [S35] |
| 10 | WHOOP API states `SCORED`, `PENDING_SCORE`, `UNSCORABLE` and a `user_calibrating` flag | Confirmed | WHOOP developer docs [S36]. Note: the docs list `user_calibrating` without explaining it |
| 11 | WHOOP AI coaching via OpenAI since September 2023 | Unverified (secondary only) | Only Wikipedia confirms; BusinessWire and OpenAI pages returned HTTP 403. Caveat added in §2.1 |
| 12 | Gentler Streak won the 2024 Apple Design Award for Social Impact | Confirmed | Apple Newsroom 2024 ADA winners [S27] |
| 13 | Apple Training Load 7 vs 28 days on five named levels; Vitals alerts when two or more metrics are outside typical range; rings can be paused without affecting streaks | Confirmed | Apple Newsroom, watchOS 11 [S23] |
| 14 | Apple Activity Trends 90 vs 365 days with coaching on a downward trend | Confirmed (2019 source; may be outdated) | Apple Newsroom, watchOS 6 [S22] |
| 15 | Apple Cardio Fitness: 24 h wear plus several outdoor walks/runs/hikes before first estimate; range 14–65 mL/kg/min | Confirmed | Apple Support HT211856 [S25] |
| 16 | Strava bought Runna in May 2025 | Corrected | Strava announced the definitive agreement on 17 Apr 2025 [S85]; Wikipedia dates completion to May 2025 [S41] |
| 17 | Strava Athlete Intelligence excludes estimated power, perceived exertion, cadence; four-level feedback; can be hidden; subscriber-only | Corrected (minor) | Strava support also excludes **elevation**; four feedback levels plus "Hide" confirmed [S40] |
| 18 | Strava Matched Activities: same route (start, end, direction, distance); yellow = fastest, orange = current; subscriber-only | Confirmed | Strava support [S38] |
| 19 | Rapsodo MLM2PRO: 8 measured, 7 calculated; spin only with RPT balls; device A$899; membership A$299.99/yr | Confirmed, with clarification | Rapsodo AU: A$899 is a reduced price (RRP A$1,099); also 2-year A$549.99 and lifetime A$999.99 [S61] |
| 20 | Sportsbox: about 2° mean difference from AMM 3D in 30 golfers, conditional on set-up | Confirmed | Sportsbox help centre: 2.2°, 2.5°, 2.0° at address/top/impact; 30 golfers, one swing each; self-published, so stays Vendor claim [S48] |
| 21 | Sportsbox AU IAPs "Player A$25.49; Pro A$129.99" | Corrected (incomplete) | Listing also shows Player A$174.99 and Pro A$1,299.99; periods not labelled [S50]. Web "$9.16/mo" currency and billing still UNVERIFIED [S49] |
| 22 | V1 Golf A$14.99/mo, A$99.99/yr; 3.7/5 from 55 ratings; overlay, skeletal tracking, 240 fps | Corrected (minor) | Prices and rating confirmed; 240 fps appears only in a user review, not vendor feature text [S56] |
| 23 | Onform athlete tiers US$9.99–14.99/mo; 2D skeleton on every paid tier; 2- or 4-angle multicam | Confirmed | Onform pricing page [S52] |
| 24 | Dartfish Mobile €7/mo, Pro S €180/mo; SimulCam and StroMotion only in top tier | Confirmed | Dartfish plans ("Starting from 7€/month"; SimulCam & StroMotion exclusive to Pro S) [S54] |
| 25 | HomeCourt Plus A$10.99/mo, A$95.99/yr; last update January 2022 | Confirmed | AU listing: v3.34 on 20/01/2022 [S60]; "maintenance mode" remains inference |
| 26 | Fulltrack: tripod taller than 60 in, stump calibration, "30 second setup", bad calibration → bad tracking | Confirmed | Fulltrack AI home page [S57] |
| 27 | Kay et al. 2016: quantile dotplots reduce variance of probability estimates ≈1.15× vs density plots | Confirmed | OpenAlex abstract [S63] |
| 28 | Fernandes et al. 2018: dotplots 97% of optimal payoff, ≈5 pp above control; CDFs nearly as good; both beat text | Confirmed | OpenAlex abstract (97%, 95% CI 95–98%; +5 pp, 95% CI 2–8) [S64] |
| 29 | Belia et al. 2005: 473 researchers misjudged CI/SE bars | Confirmed | OpenAlex record, Psychological Methods 10(4):389–396 [S67] |
| 30 | Correll & Gleicher 2014; Hullman et al. 2015 HOPs better for 2–3 quantities | Confirmed | OpenAlex abstracts; HOPs showed no advantage for single-quantity questions [S66][S68] |
| 31 | Hullman et al. survey: 86 studies; performance/satisfaction measures "overstate how rational users are" | Corrected (paraphrase tightened) | Abstract says evaluations over-rely on performance/accuracy measures and recommends judging decisions under uncertainty; the "rational" wording was not in the abstract [S65] |
| 32 | Hopkins: change inside ±2.77 × typical error is normal variation | Confirmed, caveat added | Hopkins derives 2.77 = 1.96 × √2, but also says limits of agreement are too large for decisions and prefers typical error [S71] |
| 33 | Apple Vision: 19 body points; ignore zero-confidence points; subject ≥ one-third of image height; flowing clothing and crowds reduce accuracy | Confirmed | Apple Vision documentation (JSON endpoint) [S20] |
| 34 | Action & Vision sample: tripod, board detection, image-registration stability check, body-pose detection, speed and throw type | Confirmed | Apple sample documentation [S21] |
| 35 | Swift Charts marks incl. `SectorMark`, scrolling and selection, "runs on iOS 16+" | Corrected | Framework is iOS 16+, but `SectorMark`, `chartScrollableAxes` and `chartXSelection` are iOS 17+ [S86]; `AXChartDescriptor` iOS 15+ confirmed [S18] |
| 36 | HIG touch targets "44 × 44 pt minimum"; 12/24 pt padding; text contrast 4.5:1 / 3:1; Dynamic Type ≥200% | Corrected (minor) | HIG accessibility lists 44 × 44 pt as the **default** and 28 × 28 pt as the minimum; other figures confirmed [S5] |
| 37 | Liquid Glass: controls/navigation layer only; 35% dark dimming layer over bright content | Confirmed | HIG Materials [S13] |
| 38 | Workout Buddy uses "on-device workout data" | Corrected | Apple: processed "with Apple Intelligence" on a nearby supported iPhone; English only at launch [S24] |
| 39 | Apple Health redesign "coming late 2026"; on-device encryption messaging | Confirmed | apple.com/health [S26] |
| 40 | App Review 1.4.1 requires disclosed data and methodology for health-measurement accuracy claims; 5.1.1(v) in-app account deletion | Confirmed | App Review Guidelines [S82] |
| 41 | Okabe & Ito: 1 in 12 Caucasian, 1 in 20 Asian, 1 in 25 African men; label directly | Corrected (precision) | Figures refer to **red–green** colour blindness in males; direct labelling advice confirmed. Hex values are not on the fetched page (already hedged) [S74] |
| 42 | NN/g: moving progress bar → willing to wait ≈3× longer; S79 author/date "not captured" | Confirmed; citation completed | Katie Sherwin, 26 Oct 2014; single University of Nebraska–Lincoln study [S79] |
| 43 | Nielsen 10 s limit; percent-done indicator and a way to interrupt | Confirmed | NN/g, 1993 (updated 2014) [S78] |
| 44 | NN/g onboarding: against deck-of-cards, brief and optional, contextual help, content customisation OK (Kendrick, 21 Jun 2020) | Confirmed | NN/g [S80] |
| 45 | WWDC22 headline example "Sales are up 12%…"; small static chart leading to a detailed one; preserve values, context and state | Confirmed | WWDC22 session 110342 transcript [S4] |
| 46 | Calm Technology: "smallest possible amount of attention" | Confirmed | calmtech.com (Amber Case) [S81] |
| 47 | Gentler Streak Activity Path daily / 10-day / 30-day; rest-friendly streaks; companion character | Confirmed | Gentler Streak site (companion named Yorhart; no pricing shown) [S30] |
| 48 | SwingVision Goal Mode audio call-outs of speed and accuracy; Tennisnerd 2021 US$149.99/yr and ≈20-minute playback of an hour | Confirmed; wording fixed | Goal Mode confirmed [S44]. Tennisnerd refers to an hour-long **set**, not "an hour of practice" [S47] |

**Evidence-tag adjustments.** §4.1 "typical range" bullet relabelled to separate Apple (Vendor claim) from Tufte and Few (design practice, not peer-reviewed). §11 patterns 3, 8, 11, 13 and 20 were downgraded or split: vendor examples and design-practice sources had been labelled "Established" alone, and pattern 20 used "Coaching interpretation" for a design principle. Vendor accuracy claims (Sportsbox, Rapsodo, FlightScope, SwingVision benchmarks) were already labelled Vendor claim and stay that way.

**Not checked (out of the top-priority set):** FlightScope Mevo+ spin requirement [S62], Tufte and Few specifics [S72][S73], Agresti–Coull bibliographic details [S69], WCAG 1.4.11 3:1 figure [S77], HIG onboarding, permissions and notification wording [S9][S14][S15], Onform's 2021 Hudl Technique acquisition [S53], Fitness & Freshness [S39].
