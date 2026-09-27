# Australian iOS launch path

**Prepared 27 September 2026.** A realistic route from today's web prototype to an App Store launch in Australia, with dated milestones. It draws on research 07 (privacy and Apple rules), research 08 (pricing, gates), research 10 (segment and channels), ARCHITECTURE §15 (iOS route) and CAPTURE §10 (native capture).

> **This is research, not legal advice.** Items marked **Get legal advice** need an Australian privacy or consumer lawyer before we rely on them. Research 07 estimates A$2,000–5,000 for a scoped written opinion (our estimate, not a quote; research 07 open question 1).

**Labels used below.** **Requirement (law)**: Australian law that applies now or on the date shown. **Requirement (law, if APP entity)**: applies if we are covered by the Privacy Act, which we assume (§3). **Requirement (Apple)**: App Review Guidelines or the Developer Program License Agreement (contractual, but they gate release). **Best practice**: not strictly required.

## 1. Timeline at a glance

| When | Milestone | Exit criterion |
|---|---|---|
| **28 Sep – 6 Nov 2026** | Foundations: company, Apple account, advisers, Mac, internal TestFlight of the current web app, annotation dry run on team-filmed footage ("Check this serve" is built) | Organisation enrolment approved; the shell runs on one iPhone; the first real-footage agreement report exists |
| **Nov 2026 – Jan 2027** | Evidence and native capture: real-footage and radar validation sprint in Melbourne, native capture plugin, clinician review, privacy policy (ADM section by 10 Dec) | Clinician-approved copy; capture plugin passes device QA; validation data collected |
| **Feb – Mar 2027** | TestFlight closed beta, 18+, Melbourne comp players, timed to the February association seasons and the pennant pre-season | Gate 1 (§7) and the validation gate (§6) |
| **Apr 2027** | App Store submission (iOS 27 SDK required from April 2027) | Approved build with in-app purchase |
| **May – Jul 2027** | Soft launch, Australian storefront only, from pennant round 1 | Gate 2 (§7) |
| **Aug 2027 onward** | Scale decision: Perth and Canberra for the October summer comps, then Adelaide and Brisbane | Gate 3 (§7) |

**Why later than research 08** (closed beta Oct–Nov 2026, soft launch Feb 2027): that plan assumed a web beta. A TestFlight beta needs a company, a D-U-N-S Number, Apple enrolment, a Mac and native capture, and the public launch must wait for real-footage validation and clinician review. A web (PWA) pilot can still run in Nov–Dec 2026 alongside the validation sprint if we want early usage signals *[our inference]*.

**Season anchors.** The 2026 TV Pennant ran 14 rounds from 2 May to 22 August, with finals to 12 September (research 08 §6, gap-fill; TV Pennant Rules of Play 2026). **2027 dates are UNVERIFIED**; if the pattern holds, round 1 is in early May 2027. Melbourne association spring seasons are already under way (NENTG started 3 August 2026, research 10 [N5]); the February association seasons are the next entry window (research 10 §6).

## 2. Business setup (Phase 0: 28 Sep – 30 Oct 2026)

| Step | Target date | Type | Detail |
|---|---|---|---|
| Register a **Pty Ltd** with ASIC | by 9 Oct | Best practice, strongly recommended | Liability shield; the company becomes the seller name. Guideline 5.1.1(ix) says apps that "require sensitive user information" should be submitted by a legal entity; pain notes are health information (research 07 §10, [S30]). Check the current ASIC fee |
| **ABN and GST registration** | by 9 Oct | **Requirement (Apple)** | DPLA Schedule 2, Exhibit C: an Australian-resident developer selling paid apps must hold an ABN and be registered for GST, and upload evidence within 30 days. Apple Pty Ltd issues consumer tax invoices under a s 153-50 arrangement (research 07 [S46]). **Get accountant advice** on the developer-side GST treatment (research 08 open question 6) |
| Domain and a simple website on it | by 9 Oct | **Requirement (Apple)** for organisation enrolment | Also hosts the privacy policy and support page |
| **D-U-N-S Number** | request by 9 Oct | **Requirement (Apple)** for organisation enrolment | Free from Dun & Bradstreet; about 5 business days (research 07 [S48][S49]) |
| **Apple Developer Program, organisation** | by 23 Oct | **Requirement (Apple)** | Legal entity (no trading names), a person with binding authority, website, D-U-N-S. US$99 a year; the AUD price is shown at enrolment (UNVERIFIED). Apple can take up to 2 more business days after D-U-N-S (research 07 §10) |
| **App Store Small Business Program** | apply once enrolled | Best practice (commercial) | 15% commission up to US$1M proceeds a year; takes effect 15 days after the end of the fiscal month in which it is approved (research 07 [S44]) |
| Brief a **privacy lawyer** | by 16 Oct | **Get legal advice** | APP-entity and health-service question, privacy policy, collection notices, beta consent form (§3) |
| Brief a **sports physiotherapist or sports physician** | by 16 Oct | Release blocker (COACHING §10) | Review the body-check, red-flag and referral copy (§5) |
| **Mac with Xcode 26** (Xcode 27 for uploads from April 2027) | by 23 Oct | **Requirement (Apple)** | Builds from 28 April 2026 need the iOS 26 SDK; from April 2027, the iOS 27 SDK (research 07 [S33][S53]). Capacitor 8 needs Xcode 26+ (ARCHITECTURE §15.1); Xcode 27 compatibility is UNVERIFIED |
| Internal TestFlight of the current web app in the Capacitor shell | by 30 Oct | Engineering | Proves the shell and WKWebView analysis on a real iPhone ([IOS_ROUTE.md](IOS_ROUTE.md)). Internal testers first; external testers need Beta App Review (ARCHITECTURE §15.2 step 10) |

## 3. Privacy and data (applies from the beta)

**Our position:** assume we are an **APP entity** from day one. The small-business exemption (turnover ≤ A$3M) does not cover a business that provides a "health service" and holds health information (Privacy Act s 6D(4)(b)), and s 6FB defines a health service broadly ("assess, maintain or improve" physical health). Pain notes plus performance claims put us close to that line (research 07 §1.1). **Get legal advice** on this in writing.

| Item | Type | What we do | Source |
|---|---|---|---|
| APP 1 privacy policy, linked in App Store Connect and in the app | Requirement (law, if APP entity) + Requirement (Apple 5.1.1(i)) | Kinds of information, purposes, overseas disclosure (none today), access and correction, complaints, retention and deletion | research 07 §12 items 2, 10 |
| **Automated decision-making transparency** (APP 1.7–1.9), from **10 December 2026** | Requirement (law, if APP entity), triggered by decisions that could "significantly affect" rights or interests | Choosing a practice focus probably does not meet that threshold, but we describe the automated analysis in the policy anyway (low cost, builds trust). **Get legal advice** on the threshold | research 07 §2 |
| APP 5 collection notices at camera, import, comfort notes | Requirement (law, if APP entity) | Short notices on those screens | research 07 §12 item 4 |
| Express consent before storing pain or discomfort notes (APP 3.3) | Requirement (law, if APP entity) | Built: consent question on first use; notes stay on the phone | research 07 §1.2; COACHING §10 |
| No personal health information in iCloud (5.1.3); never in analytics or AI | Requirement (Apple) | Pain notes local only, never synced | research 07 §9 |
| **Children's Online Privacy Code** | Requirement (law, if APP entity), **from its commencement date** | The OAIC must register it by 10 December 2026; the commencement date is not set. It binds APP entities whose service is likely to be accessed by children and is not a health service. **The closed beta is 18+**; decide the public-release age policy once the final Code is published. **Get legal advice** | research 07 §3; research 10 §7.2 |
| Notifiable Data Breaches plan | Requirement (law, if APP entity) | Written plan: assess a suspected breach within 30 days, notify the OAIC and individuals as soon as practicable. Design to the proposed 72-hour statement (draft Bill 2026, not law) | research 07 §6 |
| Statutory tort for serious invasions of privacy (in force 10 June 2025) | Requirement (law, applies to everyone) | Never reuse player or bystander footage without consent; secure storage | research 07 §2 |
| Audio off by default; video-only recording | Best practice (surveillance-device laws differ by state) | Built: the in-app recorder is video-only; hit-sound timing is opt-in and keeps only timestamps | research 07 §7 |
| Capture guidance on bystanders, juniors and club rules | Best practice | In the set-up guide | research 07 §7; research 06 §11 |
| **App Privacy details: "Data Not Collected"** | Requirement (Apple) to answer accurately | True today: nothing leaves the device. Any upload (usage counts, crash reports, cloud AI, sync) changes the answer | research 07 §9 [S38] |
| **Privacy manifest** (`PrivacyInfo.xcprivacy`) | Requirement (Apple, since 1 May 2024) | Added: no tracking, no tracking domains, no collected data, no required-reason APIs used yet. Update when native plugins land | research 07 [S39][S40]; [IOS_ROUTE.md](IOS_ROUTE.md) |
| Permission strings | Requirement (Apple) | Camera; photo library read (original slow-motion files); add-only save to Photos; motion. **No microphone** (video only). Imports through PHPicker need no library permission | research 07 [S41]; CAPTURE §10 |
| Recording indicator and explicit consent (2.5.14) | Requirement (Apple) | Built in the web recorder; iOS adds its own camera indicator | research 07 §9 |
| **Account deletion in the app** (5.1.1(v)) | Requirement (Apple), **when accounts exist** | No accounts in v1. If sync or coach accounts arrive: delete the account and its data in the app, tell subscribers billing continues through Apple, revoke Sign in with Apple tokens | research 07 §9 [S42] |
| **Consent before sending data to third-party AI** (5.1.2(i)) | Requirement (Apple), **if cloud AI is added** | Not built. If added: a per-feature consent screen naming the provider and the payload (structured metrics only, never video or pain notes), APP 8 steps for overseas processing, no-retention/no-training terms | research 07 §5, §9; D9 |
| APP 8 cross-border steps | Requirement (law, if APP entity), only if data goes overseas | Nothing leaves the device today | research 07 §5 |
| Privacy Impact Assessment | Best practice | Before any upload feature | research 07 §12B |
| Children's-Code-style defaults for everyone (high privacy by default, unbundled consent, destroy on request) | Best practice | Mostly true by design (no upload, no account) | research 07 §12B |

## 4. Apple platform rules that gate release

| Rule | Type | What we do |
|---|---|---|
| **4.2 Minimum functionality**: more than a repackaged website | Requirement (Apple); **highest review risk for a Capacitor app** | Mitigations (research 07 §9; ARCHITECTURE §15.2 step 8): web bundle inside the binary (no remote URL); native AVFoundation capture with locked frame rate and exposure; on-device analysis that works offline; native share and Save to Photos; haptics; native in-app purchase. App Review notes point to "See a sample session" so reviewers can see the analysis without a court. If rejected after native capture, that is one of the triggers for going fully native (ARCHITECTURE §15.3) |
| 2.5.2 self-contained bundle; no downloaded code that changes features | Requirement (Apple) | No live-update service |
| 1.4.1 medical: extra scrutiny for health data; disclose methodology for accuracy claims; remind users to see a doctor | Requirement (Apple) | No health measurements. "How we measure" publishes methods and synthetic results; referral cards send pain to a professional (§5) |
| Age rating questionnaire (13+/16+/18+ tiers; social-media questions required from September 2026) | Requirement (Apple) to answer honestly (2.3.6) | Target **9+**: exercise recommendations = 9+; infrequent medical or treatment information = 13+; frequent = 16+; frequent contests = 13+. Keep medical content infrequent and referral-only; answer "No" to social-media features while there is no feed. Never the Kids Category (1.3) (research 07 [S37]) |
| Category | Best practice | Primary **Sports**, not Health & Fitness, which avoids the regulated-medical-device declaration for EEA/UK/US distribution (research 07 §8.3) |
| 3.1.1 in-app purchase for all digital unlocks; 3.1.1(a) no links or calls to action to other purchasing outside the US storefront | Requirement (Apple) | StoreKit subscriptions only in Australia. *Epic v Apple* (Federal Court, August 2025) has not produced an Australian external-purchase entitlement (research 07 §10) |
| 3.1.2 subscriptions: at least 7 days, ongoing value, describe what the user gets; DPLA Schedule 2 §3.8 disclosures (title, length, price, links to privacy policy and Terms of Use) | Requirement (Apple) | Paywall lists concrete deliverables; trial length and post-trial price shown before purchase ([MONETISATION.md](MONETISATION.md) §6) |
| Restore purchases; one-tap manage subscription | Expected by App Review for restore (guideline 3.1.1 asks for a restore mechanism; not re-checked in research 07); best practice for the manage link (research 07 §8.1) | The Plan screen has a placeholder Restore button; wire it to StoreKit |
| 4.5.4 push: no promotions without explicit in-app opt-in | Requirement (Apple) | Only functional local notifications (analysis ready, re-test reminder), opt-in |

## 5. Health claims and pain content

- **Stay inside the TGA wellness exclusion** (Requirement, law). Consumer software that non-invasively measures movement for general wellness can be excluded from medical-device regulation, but not if it is intended for clinical practice or makes claims about a serious condition (research 07 §8.3 [S29]). No injury-risk scores, no rehab programs, no diagnosis.
- **Pain handling is referral-only.** One local-only discomfort check; coaching pauses load-increasing drills and shows referral cards (Call 000; GP, physio or sports doctor; healthdirect). Never a diagnosis, never "prevents injury" or "reduces pain" (COACHING §10; research 10 §7.2).
- **Clinician review is a release blocker.** An Australian physiotherapist or sports physician must review the body-check, red-flag and referral copy before the external beta (COACHING §10; PRODUCT §11 item 6). The healthdirect number (1800 022 222) is marked "verify before release" in COACHING §10.
- **No accuracy claims we have not validated** (Requirement, ACL misleading conduct, research 07 §12 item 13). App Store copy leads with "a toss you can trust" and "fewer double faults", not speed (research 10 §7.2). "How we measure" must match the current validation level.

## 6. Native build and the validation gate

**Native plugins** (Phase 1, Nov 2026 – Jan 2027; plan and Swift interfaces in [IOS_ROUTE.md](IOS_ROUTE.md)):
1. **Capture** (`ServeCapture`, AVFoundation): fixed frame rate (60 default; 50/100 under lights; 120/240 for speed sessions), locked exposure (1/1000 s or shorter in daylight), focus and white balance locked after framing, 1x lens, stabilisation off, per-frame CoreMotion attitude, thermal state, video-only file (CAPTURE §10).
2. **Files** (`ServeFiles`): PHPicker import including original slow-motion files, free-space check, Save to Photos (add-only), share.
3. **Pose** (`ServePose`, Apple Vision / Core ML), **behind a flag**: Vision has no heel or toe points, which landing distance needs, so MediaPipe stays the default until a benchmark shows parity (ARCHITECTURE §15.2 step 6).
4. **Background processing**: the web engine needs the app open ("Keep Serve Coach open while it analyses"); native analysis could continue in the background later. Local notifications for "Your session is ready" (PRODUCT §5.3).

**Real-footage and radar validation gate** (must pass before the public launch, by about 31 March 2027):
- Tooling: built in `33ac31f` and not yet used on real footage.
  - "Check this serve" marks events, points and radar readings, blinded to the app's values, and exports JSON.
  - `tools/validate/annotation-eval.ts` pools the exports into the agreement report ([NEXT_STEPS.md](NEXT_STEPS.md) §2).
- Protocol: METRICS §5.6 V2. At least 8 players (3+ women, 1+ left-hander, 2+ aged 40 or over), 150+ serves per metric, both side set-ups, 3+ conditions including 2 lit courts (LED and metal halide), 60 fps plus a 120/240 fps subset; test–retest on 6+ players across sessions 2+ days apart; two annotators on 25%+ of serves. Consent in writing; adults only; footage filmed by the team or shared by players, never downloaded (founder instruction).
- Radar (for any speed claim): a radar behind the server, 200+ serves across speeds (METRICS §5.6 V3). Without it, speed stays unavailable or experimental.
- Pass: the METRICS §5.6 acceptance table for the hero metrics (toss consistency, contact height, rhythm, leg drive). Metrics that fail stay `experimental` and are not advertised.

## 7. Beta, soft launch and scale

**Closed beta (TestFlight), target 1 February – mid-March 2027**
- 18+ only (research 10 §7.2), Melbourne comp-night regulars screened with the in-segment definition (research 10 §2.1): 20–30 players first, growing to 50–100, plus 5–10 coaches.
- Recruited through coaches, associations and the Melbourne hitting-partner Facebook group ([MONETISATION.md](MONETISATION.md) §7), timed to the February association seasons and pennant pre-season, when teams are graded.
- Beta consent covers: the app's on-device processing, any footage shared for validation (separate, optional), survey participation. **Get legal advice** on the consent form.
- Everything unlocked; the paywall is a fake door that records intent (research 08 §8.3).
- **Gate 1:** set-up success ≥ 80%, activation ≥ 50%, loop completion ≥ 40% of activated, usefulness ≥ 70%, PMF ≥ 30%, Van Westendorp range includes A$99.99, ≥ 60 consented annotated or radar-paired clips (research 08 §8.4). Requires instrumentation that the build does not have yet (FUNCTIONAL_STATUS §7).

**Submission, April 2027**
- Build with the iOS 27 SDK. In-app purchases: subscription group with annual A$99.99 (7-day trial) and monthly A$14.99; season pass A$39.99 (non-renewing, ends on a season date).
- Our own trial-ending reminder and a one-tap "Manage subscription" link (Best practice now; the proposed ACL subscription rules would require trial-end notices, six-monthly reminders and easy online cancellation from **1 July 2027 if enacted**, research 07 §8.1). No 12-month-commitment monthly plans (Best practice, consumer-law risk).
- Spam Act: consent, sender identification and unsubscribe within 5 working days for any marketing email (Requirement, law; research 07 §8.2).

**Soft launch, target early May – July 2027**: Australian storefront only, from pennant round 1. 8–12 weeks, 1,000–3,000 installs. Capped A$1,500 Apple Ads test. **Gate 2:** download-to-paid ≥ 2.5%, trial-to-paid ≥ 35%, W4 ≥ 25% of activated, refunds ≤ 5%, blended cost per payer ≤ A$40 (research 08 §8.4).

**Scale, August 2027 onward:** if gate 2 passes, Perth and Canberra for the October summer comps, the Australian Open (January 2028) for radar booths and awareness, then Adelaide and Brisbane (research 10 §1, §6). Gate 3 before paid channels: download-to-paid ≥ 4–5%, first annual renewal ≥ 30%.

## 8. Risks to this timeline

| Risk | Effect | Mitigation |
|---|---|---|
| 4.2 rejection of the Capacitor app | Weeks lost | Native capture and IAP before submission; sample session for reviewers; fully native fallback (ARCHITECTURE §15.3) |
| Validation gate fails | No public accuracy claims | Launch with the failing metrics experimental, or delay; never advertise unvalidated numbers |
| Children's Code commencement or content is stricter than expected | Age policy and consent flows change | Keep 18+ until advised; Children's-Code-style defaults for everyone |
| WKWebView analysis too slow or killed by memory limits on older iPhones | Poor experience | Device budgets in the first TestFlight; native pose; go-native triggers (ARCHITECTURE §15.3) |
| Xcode 27 and Capacitor 8 incompatibility | Cannot upload from April 2027 | Test on Xcode 27 in Phase 1; plan a Capacitor update |
| Clinician review requests substantive changes | Beta slips | Book the review in October |
