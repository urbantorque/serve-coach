# Monetisation plan (Australia)

**Status, 27 September 2026:** a plan. Nothing is sold yet. The prototype's Plan screen takes no payment ([FUNCTIONAL_STATUS.md](FUNCTIONAL_STATUS.md) §7). Prices are GST-inclusive AUD. Exchange rate A$1.4247 per US$1, the RBA rate for 25 September 2026 (research 08 [S40]).

**Where the numbers come from.** Research 08 (pricing, costs, benchmarks, channels, gates), research 01 (competitors), research 10 (segment and channels), research 07 (Apple and consumer-law rules), and PRODUCT §5.2, §6.15 and §10. Anything we worked out ourselves is marked *[our inference]*, and the arithmetic is shown.

## 1. Summary

1. **Price:** Serve Coach Plus at **A$14.99 a month or A$99.99 a year**, with a 7-day free trial on the annual plan only. Test cells: A$79.99 and A$129.99 a year, and a non-renewing **A$39.99 season pass** (research 08 §6).
2. **Free tier:** the first full loop free (baseline, practice, re-test, verdict), then 2 analysed practice days a month. Every measurement, the safety features, export and deletion are always free (PRODUCT §5.2).
3. **Paywall moment:** straight after the first "Did it work?" verdict, never before the first report (research 08 Implication 5; research 10 M9).
4. **Cost to serve is close to zero** because analysis runs on the phone: about A$0.01 per active user a month, against A$0.13 for a hybrid design and A$1.07 for cloud processing (research 08 §4.6).
5. **Acquisition is coach- and club-led, Melbourne first.** Paid search is a capped test, not the engine (research 08 §7; research 10 §6).
6. **Scale is modest.** The primary segment can validate the product and fund a lean team; it is not a large company on its own (research 10 §5.4).

## 2. Comparable pricing (AUD, App Store Australia unless noted)

| Product | Monthly | Yearly | Note | Source |
|---|---|---|---|---|
| SwingVision Plus / Pro / Max | A$22.99 / A$39.99 / A$59.99 | A$149.99 / A$299.99 / A$499.99 | Free tier 8 HD hours a month; outcome stats from a raised rear camera | research 01 [S2]; research 08 [S1] |
| Toach Pro | A$14.99 | A$129.99 | 7-day trial; claims serve speed | research 08 [S2] |
| TENNIS AI 2.0 (Axel AI) | A$9.99 | A$99.99 | **A$2.99 per analysis**, the only per-use tennis price found | research 08 [S3] |
| NiceShot | — | A$39.99 | A$49.99 lifetime; low-price outlier | research 08 [S4] |
| TopCourt (lessons, no feedback) | — | A$269.99 Basic | | research 08 [S5] |
| HomeCourt (basketball) | A$10.99 | A$95.99 | | research 08 [S16] |
| Strava | A$14.99 | A$99.99 | Strava + Runna A$199.99 a year | research 08 [S17][S18] |
| OnForm (coach video tool) | A$7.99–A$59.99 | A$81.99–A$399.99 | Coaches already pay for this | research 08 [S9] |
| Private lesson, 30 min | — | — | A$60–A$85 in capital cities; A$60–A$70 in Melbourne | research 08 [S23]–[S28] |

**Reading** *[our inference, research 08 §2.6]*: A$99.99 a year sits on the mass-market anchor (Strava, TENNIS AI 2.0; A$4 above HomeCourt), is one-third of SwingVision Pro, and costs less than two 30-minute private lessons. The A$39.99-a-year band is crowded with low-trust apps; pricing there would signal "another AI tip app".

## 3. What we keep from each sale

Apple's Small Business Program charges 15% to developers with up to US$1M in proceeds; subscriptions get 85% from the first year (research 08 [S41][S42]). Apple calculates commission after tax, so we remove the 10% GST first (research 08 [S43]). *Get accountant advice* on the developer-side GST treatment (research 08 §3).

Proceeds = price ÷ 1.1 × 0.85:

| Plan | Price | Ex-GST | Apple 15% | **Proceeds** |
|---|---|---|---|---|
| Monthly | A$14.99 | A$13.63 | A$2.04 | **A$11.58** |
| Season pass (non-renewing) | A$39.99 | A$36.35 | A$5.45 | **A$30.90** |
| Annual, test cell | A$79.99 | A$72.72 | A$10.91 | **A$61.81** |
| **Annual** | **A$99.99** | A$90.90 | A$13.63 | **A$77.26** (A$6.44 a month) |
| Annual, test cell | A$129.99 | A$118.17 | A$17.73 | **A$100.45** |

Apple pays within 45 days of the end of the fiscal month (research 08 [S44]). RevenueCat, if used, is free up to US$2,500 of monthly tracked revenue, then 1% (research 08 [S47]).

## 4. Cost per analysis: on-device, hybrid, cloud

### 4.1 Workload (research 08 §4.1, all assumptions until measured)

- One session = 25 serves, trimmed to about 4 s each, so **2 minutes of 1080p60 = 7,200 frames**.
- A typical active user analyses 6 sessions a month (light 3, heavy 12).
- Coaching text, where used, is written from structured metrics: about 4,000 cached system-prompt tokens, 2,500 session tokens in and 900 out per call.

### 4.2 Per session

| Architecture | Arithmetic | US$ | **A$** |
|---|---|---|---|
| **On-device** (what we built) | Pose, ball and statistics run on the phone. Marginal server cost is nil | 0 | **≈ 0** |
| **Hybrid**, Haiku 4.5 text, cached prompt | 4,000 × US$0.10/M + 2,500 × US$1/M + 900 × US$5/M = 0.0004 + 0.0025 + 0.0045 | 0.0074 | **0.011** |
| Hybrid, Haiku 4.5, uncached (beta volume) | 6,500 × US$1/M + 900 × US$5/M | 0.011 | 0.016 |
| Hybrid, Sonnet 5 text, cached (tokens × 1.3 for the newer tokenizer) | 5,200 × 0.20 + 3,250 × 2 + 1,170 × 10, per million | 0.019 | 0.027 |
| **Cloud GPU**, Modal L4, baseline pipeline | 7,200 frames × 10 ms = 72 GPU-s, + 20 s cold start = 92 s × US$0.000222/s = US$0.020 GPU; with CPU and memory US$0.026; × 1.75 for an Australian region | 0.046 | **0.065** |
| Cloud, plus Sonnet 5 with 6 key frames | add US$0.035 | 0.081 | 0.115 |

Sources: research 08 §4.3–4.4, [S52][S60][S61][S74]. Prices are list prices at 27 September 2026.

**What we measured on-device** (headless Edge on a shared laptop, synthetic clips; engine-pipeline report and `validation/results/ui/harden-performance`): about 60 ms of pose inference per frame, and 97–141 s to analyse an 8-serve, 73.5 s clip, depending on machine load. Battery and time on an iPhone are **not measured** (research 08 open question 4). The on-device cost is zero in money, not in the player's time.

### 4.3 Per active user a month (research 08 §4.6)

| Architecture | Light (3) | **Typical (6)** | Heavy (12) |
|---|---|---|---|
| **A. On-device** (allowance for optional crash reporting or config) | A$0.01 | **A$0.01** | A$0.01 |
| B. Hybrid (Haiku 4.5) | A$0.09 | **A$0.13** | A$0.21 |
| B′. Hybrid (Sonnet 5) | A$0.20 | A$0.29 | A$0.47 |
| C. Cloud (baseline) | A$0.60 | **A$1.07** | A$2.02 |

Typical hybrid check: 6 × A$0.011 + 2 progress summaries × A$0.019 + about A$0.03 of storage and API = A$0.13. Typical cloud check: 6 × (A$0.065 + A$0.050) + 2 × A$0.048 + about A$0.29 of storage, egress and backend = A$1.07 *[our arithmetic on research 08's inputs]*.

**The real cost risk is free users** (research 08 §4.6). At 2.9% download-to-paid there are about 30 free installs per payer. If 10 of them analyse 3 sessions a month, each payer carries A$0.07 (on-device), A$0.90 (hybrid) or **A$6.00 (cloud)** a month of free-user cost. That is why the free tier is only affordable on-device, and why v1 stays on-device (D8, D9).

## 5. Free tier and Plus

| | **Free: Serve Check** | **Plus: Serve Coach Plus** |
|---|---|---|
| Price | A$0 | A$14.99 a month or A$99.99 a year (7-day trial on annual) |
| Recording, import, annotated replay | Unlimited | Same |
| Analysed sessions | **First loop free** (a baseline and one matched re-test with its verdict), then **2 analysed practice days a month**. Over-limit recordings are kept and queued, never lost | Unlimited |
| Measurements | Every metric from either view, with labels, n and intervals. Experimental toggle free | Same, plus suggested outcome tags from the view from behind (experimental) |
| Coaching | One focus: cue, drill, practice log, "Why this focus?", "My coach's focus" | Progressions and regressions, unlimited experiments, a weekly "Did it work?" review |
| History and comparison | All sessions viewable; trends over the last 30 days | Unlimited trends; compare any two sessions; ghost overlay; season timeline |
| Comp nights | Match log entry and the pre-match card | Season view: practice beside comp nights, never pooled |
| Coach | One-page summary, key frames and CSV for any session | Multi-session progress summary |
| **Always free** | Body check, pain gate and referral cards; honesty labels; "How we measure"; export; every deletion and retention control; the sample session | |

**Why this shows genuine value** *[our inference, PRODUCT §5.2]*: the product's defining moment is "I changed one thing, and here is evidence it worked." The free tier delivers that moment in full before we ask for money. Gating individual numbers would make the free coaching decision unexplainable, and charging for unvalidated experimental metrics would contradict the honesty positioning.

## 6. The paywall moment: "Did it work?"

**Triggers** (PRODUCT §6.15):

| Trigger | When | Style |
|---|---|---|
| **T1 (default)** | After the first "Did it work?" verdict and its next-step button | Inline card, shown once, then a sheet on tap |
| T2 | Starting a third analysed day in a calendar month | The queued state with "See Plus" |
| T3 | Tapping a Plus feature (ghost compare, any-session compare, history beyond 30 days, season view) | Sheet naming the feature |
| Test cell A | After the first analysed report | Inline card (research 08 open question 11) |

**Never** before the first report, during set-up or recording, on body-check, referral, export, deletion or privacy screens, or more than once a day outside T3.

**Content and rules** (research 07 §8.1, §9; DPLA Schedule 2 §3.8):
- Annual and monthly shown equally clearly, plus "Not now" as visible as the plan buttons.
- Trial terms in plain words: "Free for 7 days, then A$99.99 a year. Cancel any time before {date} and you won't be charged. We'll remind you 2 days before." Links to Terms of Use and Privacy Policy; **Restore purchases**.
- No countdown timers, no fake scarcity, no 12-month-commitment monthly plans. One tap to Apple's manage-subscriptions screen. Our own trial-ending reminder.

**Why here:** the verdict is the moment of proven value and the step most tied to retention (research 08 Implication 5). The first court visit comes before any value, so a trial offered at install can expire before the player sees anything; offer it after the first analysed session and test that against an onboarding trial (research 08 §5, implication 2).

**Build status** (updated 28 September 2026): T1 (a card below the first "Did it work?" verdict), T2 (a notice and sheet on Processing past 2 analysed days a month after the free first loop; it only notifies) and T3 (the ghost overlay or the season view tapped) are wired, with the once-a-day rule and no offers for sample data, during a pain pause or for Plus. The Plan screen takes `?via`, `?feature` and `?from`. Plan taps remain a fake door that records intent and says Plus is not on sale (research 08 §8.3).

**Paywall test in the beta (product decision, 28 September 2026; PRODUCT §5.3):** everything is unlocked for beta testers. Each moment shows a non-blocking "Plus preview" sheet instead of the offer: "Beta: this is unlocked for you", what Plus will include, the proposed price, and one tap on "Would you pay A$99.99 a year for this?" (Yes / Maybe / No), then Continue. T3 opens the feature first and previews at most once a feature a day. Each answer is a local beta event, `plus_wtp_answered` {trigger t1/t2/t3, wtp yes/maybe/no, price annual-99-99}, shown in Profile > Beta data and in the tester's exported report; nothing is sent. Read it beside `paywall_viewed`: the share of "Yes" per moment is the willingness-to-pay signal for §8. The Plan screen's "Test the after-beta limits" switch restores the free plan's locks and the T3 offer on one phone for testing; "Test Plus" still unlocks them.

## 7. Acquisition channels, Melbourne first

Order and dates follow research 10 §6, adjusted to the launch path in [LAUNCH_AU.md](LAUNCH_AU.md).

| # | Channel | Reach evidence | First move and timing | Success signal |
|---|---|---|---|---|
| 1 | **Coaches who teach comp adults** (lead channel; free coach view, not a paying segment) | 3,766 TA coach members (research 08 [S32]) | Recruit 20–30 Melbourne coaches, Oct–Dec 2026. One free month for students through Apple offer codes; about A$20 per converted annual plan, paid off-platform (about 26% of first-year proceeds) | ≥ 30% of invited students activate; ≥ 15% of activated convert (research 08 §7) |
| 2 | **Melbourne associations** | 12 associations on TROLS; NENTG 41 sections; WDTA night tennis (research 10 [N3]–[N5]) | Email all 12 plus WDTA with a free Serve Check night and an anonymised aggregate report; ask to join Dec–Jan pre-season emails for February seasons | ≥ 3 associations agree within 4 weeks |
| 3 | **Pennant clubs and captains** | Victorian Pennant 419 teams, 135 clubs (research 08 [S37]) | Serve Check nights at 5 clubs, Feb–Apr 2027 (pennant pre-season); captain's pack onboards a team | ≥ 25 installs per event; ≥ 40% second-session rate |
| 4 | **State events** | Country Week 2023: 205 teams, 1,293 players (research 10 [N1]) | Radar "serve check" booth that also collects consented radar-paired clips for validation | Installs per hour; clips collected |
| 5 | **Court QR codes** | 1M+ online court-hire hours a year; SportLogic 2.37M hours in 2024 (research 08 [S34][S35]) | QR codes on gates at 5–10 council and club courts, with permission, from the soft launch | Scans per court-week; ≥ 40% install-to-activation |
| 6 | **Hitting-partner Facebook groups** | Melbourne Tennis Hitting Partners 13.6K members (research 08 [S36]) | Admin-approved beta calls to recruit the closed beta, screened with the in-segment definition (research 10 §2.1) | ≥ 30% of respondents complete a first session |
| 7 | **Tennis Australia, Tennis Victoria, UTR** | AO StartUps; UTR Power already bundles partner perks (research 08 [S7][S33]) | One conversation per body in Q4 2026 | A named pilot or perk |
| 8 | **Apple Ads** | Break-even cost per install about A$1.16 at median conversion | A capped **A$1,500 over 4 weeks**, after App Store listing optimisation, during the soft launch | Cost per install ≤ A$1.50 |

**Sequence, Melbourne first** (channel numbers from the table above; dates follow [LAUNCH_AU.md](LAUNCH_AU.md) §1):

| Window | Moves | Anchor |
|---|---|---|
| Oct – Dec 2026 | Recruit 20–30 Melbourne coaches (1). One conversation each with Tennis Australia, Tennis Victoria and UTR (7). Price survey through associations and groups (§8) | Spring comps are mid-season (NENTG started 3 August, research 10 [N5]); coaches line up students before summer |
| Dec 2026 – Jan 2027 | Email the 12 TROLS associations and WDTA (2). Admin-approved beta calls in the Melbourne hitting-partner group (6) | Pre-season emails for the February seasons (research 10 §6) |
| Feb – Mar 2027 | TestFlight closed beta. Serve Check nights at 5 pennant clubs with a captain's pack (3). A radar booth at a state event if its dates fit (4; dates not researched) | February association seasons; pennant pre-season grading |
| May – Jul 2027 | Soft launch: QR codes at 5–10 courts (5); the capped A$1,500 Apple Ads test (8); captain's packs at round 1 | Pennant round 1, early May if the 2026 pattern holds (2027 dates UNVERIFIED) |
| Aug 2027 on | Only after gate 2: Perth and Canberra coaches and clubs (1, 3) for the October summer comps; an Australian Open radar booth in January 2028 | Gate 3 before any paid channel scales |

Adelaide and Brisbane come after Perth and Canberra (research 10 §1).

**Cost-per-install ceiling** = allowable cost per payer × download-to-paid. At A$40 per payer and 2.9% download-to-paid, CPI must be ≤ A$1.16 (research 08 §7). Australian Apple Ads benchmarks could not be verified (research 08 open question 1), so the test is the fastest answer.

## 8. Validation metrics and stage gates

Definitions (research 08 §8.1; PRODUCT §9.1): **activation** = within 7 days of install, one valid analysed session (≥ 10 serves detected, capture Fair or better) and the coaching decision opened; **loop completion** = a matched re-test within 14 days that produces a verdict; **W4** = active in week 4 after activation.

| Gate | Cohort | Proceed if | Stop or pivot if |
|---|---|---|---|
| **1. Closed beta** (TestFlight, 6 weeks) | 20–30, growing to 50–100 comp players 18+, and 5–10 coaches, Melbourne | Set-up success ≥ 80% · activation ≥ 50% of invitees · loop completion ≥ 40% of activated · usefulness ≥ 70% rate 4–5 · PMF "very disappointed" ≥ 30% · Van Westendorp range includes A$99.99 · ≥ 60 consented annotated or radar-paired clips · tagging ≤ 2 s per serve median · 100% of pain flags show referral guidance | Activation < 25% after two onboarding iterations, or usefulness < 50% |
| **2. AU soft launch** (8–12 weeks, 1,000–3,000 installs) | Organic plus coach, club and community channels | D35 download-to-paid ≥ 2.5% · trial-to-paid ≥ 35% · W4 of activated ≥ 25% · D30 ≥ 8% · refunds ≤ 5% · annual ≥ 40% of new subscriptions · blended cost per payer ≤ A$40 · in-segment share ≥ 50% | Download-to-paid < 1.5% **and** PMF < 25% |
| **3. Scale** | Add paid channels | Download-to-paid ≥ 4–5% · paid CPI at or under the ceiling · first annual renewal ≥ 30% | CPI stays above the ceiling: remain coach- and community-led |

Benchmarks behind the thresholds (RevenueCat 2026, Health & Fitness medians; research 08 [S63]): download-to-paid 2.9% (Asia-Pacific 2.4%), trial-to-paid 37.7% (APAC 31.9%), first annual renewal 24.6%, refunds 4.71% (2025 edition, research 08 [S64]).

**Pricing evidence before in-app purchase goes live** (research 08 §8.3): Van Westendorp (n ≥ 200 comp players who have seen a demo) and Gabor–Granger at A$79.99 / A$99.99 / A$129.99 / A$149.99, then fake-door paywall cells in the beta. Live A/B tests need about 2,500 installs per arm to detect 3% → 4.5% download-to-paid, which an Australian beta cannot produce.

**Instrumentation gap** (updated 28 September 2026): the build now keeps local usage counts (Profile → Beta data: activation, loop completion, active weeks, usefulness, Plus offers seen) and exports a JSON beta report the tester chooses to send ([FUNCTIONAL_STATUS.md](FUNCTIONAL_STATUS.md) §7). There is still no upload, so gates rest on testers sending reports. D8 also rules out upload. Options (PRODUCT §9.4): an opt-in, counters-only upload after a D8 amendment, or consented "send my beta report" exports plus interviews, which is weaker evidence.

## 9. Unit economics

| Per annual payer, year 1 | A$ | Basis |
|---|---|---|
| Proceeds | 77.26 | §3 |
| Variable cost, on-device (typical user) | 0.12 | A$0.01 × 12 months |
| Coach referral fee, when the payer came from a coach | 20.00 | research 08 §6 |
| RevenueCat, only above US$2,500 a month of revenue | about 1.00 | research 08 §6 |
| **Contribution, coach-referred** | **about 56** | |
| **Contribution, direct** | **about 76** | |

- With the 2026 Health & Fitness first annual renewal of about 25%, a direct annual payer is worth about A$77.26 + 0.25 × A$77.26 ≈ **A$97 over two years** before costs *[our arithmetic; research 08 §6 gives about A$93 after hybrid costs]*. Plan on 25%, not the 44% of the 2025 edition (research 08 [S63][S64]).
- A monthly payer yields A$11.58 a month; Health & Fitness keeps only 8.5% of monthly subscribers for a year (research 08 [S63]). Push annual.
- On a hybrid design a typical payer costs 1–2% of monthly proceeds; on cloud, 9–26% (research 08 §4.6).
- AI apps earn 41% more per payer but churn 30% faster (research 08 [S63]). Our counter: visible evidence, honesty labels, a published validation page, coach involvement.

## 10. A simple 12-month scenario (from the soft launch, May 2027 to April 2028)

**Assumptions** (all *[our inference]* unless cited):
- Installs over 12 months: conservative 3,000, base 6,000, upside 12,000. The soft-launch gate expects 1,000–3,000 in 8–12 weeks (research 08 §8.4); the national comp pool is about 40,000–60,000 adults (research 10 §5.2).
- Download-to-paid: 1.5% (the gate-2 stop line), 2.4% (APAC median, research 08 [S63]), 4.5% (the gate-3 target).
- Paid mix: 65% annual, 25% monthly, 10% season pass (Health & Fitness sells 68% annual, research 08 [S63]).
- Monthly subscribers pay on average 3, 4 or 5 months in the year.
- 30% of annual payers come through coaches (A$20 each).
- 25% of installs are active in an average month, for 3 months each. On-device variable cost A$0.01 per active user a month.
- Fixed launch costs counted: Apple Developer Program US$99 (≈ A$141; the AUD price is shown only at enrolment, research 07 §10), the A$1,500 Apple Ads test, and one Pocket Radar Ball Coach for validation, counted at A$495 (Australian retail A$489.95–A$499, research 01 [S45]). **Not counted:** company registration, legal advice (research 07 estimates A$2,000–5,000 for a scoped opinion), clinician review, any Mac, and anyone's time.

| | Conservative | Base | Upside |
|---|---|---|---|
| Installs | 3,000 | 6,000 | 12,000 |
| Download-to-paid | 1.5% | 2.4% | 4.5% |
| Payers | 45 | 144 | 540 |
| Annual / monthly / season | 29 / 11 / 5 | 94 / 36 / 14 | 351 / 135 / 54 |
| **Proceeds** (after GST and Apple) | **A$2,790** | **A$9,345** | **A$36,607** |
| Coach referral fees | A$176 | A$562 | A$2,106 |
| On-device variable cost | A$23 | A$45 | A$90 |
| Counted fixed costs | A$2,136 | A$2,136 | A$2,136 |
| **Contribution before unpriced costs** | **about A$455** | **about A$6,600** | **about A$32,300** |
| Same scenario on cloud processing (variable cost) | A$2,408 | A$4,815 | A$9,630 |
| Paid acquisition per payer: (Apple Ads + coach fees) ÷ payers, against the A$40 gate | A$37 | A$14 | A$7 |

Proceeds check (base, unrounded payer counts): 93.6 × A$77.26 + 36 × 4 × A$11.58 + 14.4 × A$30.90 = A$7,232 + A$1,668 + A$445 ≈ A$9,345.

Acquisition check (conservative): (A$1,500 + A$176) ÷ 45 payers = A$37.23. It is under the A$40 ceiling only because the scenario counts no staff time or event costs. The conservative case sits at the gate-2 stop line for download-to-paid (1.5%).

**Reading:** year one is a validation year, not a business year. Even the upside case pays for a lean team only if costs stay near zero, which is the case for on-device processing and the reason the free tier can exist. The same base case on cloud processing would spend about half its proceeds on compute.

## 11. Open questions and advice needed

1. **Accountant:** GST for an Australian-resident developer selling through Apple (commission invoices, input tax credits) (research 08 open question 6).
2. **Legal:** whether offer codes can be bundled into paid club packages; web-sold club seats must also exist as in-app purchases under guideline 3.1.3(b) (research 08 [S45]).
3. Would coaches, Tennis Australia or ATPCA accept an off-platform referral fee, and at what level (A$15–A$30 per annual)?
4. Does a trial after the first analysed session beat a trial at onboarding?
5. Does the season pass cannibalise annual plans? End it on a season date ("Winter pass: to 30 September") rather than after 4 months, so it does not lapse before finals (research 08 §6, gap-fill correction).
6. Is A$99.99 viable for the secondary segment (solo court-bookers), or do they need A$79.99 (research 10 §12)?
