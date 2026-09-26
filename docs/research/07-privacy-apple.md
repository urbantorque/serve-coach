# 07 — Australian privacy law and Apple App Store rules for release

**Topic:** What a virtual serve coach (video of people, pose data, serve statistics, optional pain/injury notes, subscriptions) must satisfy to launch on the Australian App Store.
**Research date:** 27 September 2026. All web sources accessed 2026-09-27 unless stated.
**Author:** Research team (privacy and platform stream).
**Status:** Research, not legal advice. Before launch, have an Australian privacy/consumer lawyer review the checklist in section 12 (budget estimate in Open questions).

**Evidence labels used.** [Regulation] = statute, legislative instrument, regulator guidance, or a binding platform rule that gates release (Apple's App Review Guidelines and Developer Program License Agreement are contractual, but they operate as release regulation for us). [Established] = strong consensus or settled fact. [Vendor claim] = a company describing its own product or behaviour. [Market data] = survey or market statistics. [Our inference] = our reasoning applied to the product. [Coaching interpretation] is not used in this file (no coaching claims here).

**Source limitations.** WebSearch quota was exhausted before this stream began, so every source below was opened directly by URL. Several primary sites refused automated access (HTTP 403): AustLII, the Federal Court judgments site, NSW legislation, the ATO, Tennis Australia. Where I relied on something I could not open, it is marked UNVERIFIED.

---

## Executive summary

1. **The Privacy Act 1988 probably binds us even while turnover is under AUD 3 million.** The small business exemption still exists and the 2026 exposure draft keeps it [S2][S9]. But it does not cover a business that provides a health service and holds health information (s 6D(4)(b)). A "health service" includes any activity intended to "assess, maintain or improve" someone's physical health (s 6FB) [S2]. OAIC guidance names gyms as health service providers [S12]. Pain/injury notes plus claims about improving physical performance put us close to that line. **Recommendation: plan to comply with the APPs from day one** [Our inference].
2. **Changes that have already commenced under the POLA Act 2024** [S1][S2] [Regulation]:
   - OAIC infringement notices and the new civil-penalty tiers (from 11 December 2024).
   - APP 11 now expressly requires technical and organisational security measures (11 December 2024).
   - Children's Online Privacy Code framework (11 December 2024).
   - Statutory tort for serious invasions of privacy (from 10 June 2025).
3. **Coming soon:**
   - **10 December 2026:** automated decision-making (ADM) transparency in privacy policies (new APPs 1.7–1.9) [S1][S2] [Regulation].
   - **By 10 December 2026:** the OAIC must register the **Children's Online Privacy Code**. The exposure draft consultation ran 31 March–5 June 2026. The commencement date is not yet set [S3][S4] [Regulation].
4. **"Tranche 2" is now a real draft Bill, but it is not law.** The Exposure Draft Privacy Amendment (Personal Data Protection) Bill 2026 was open for consultation from 31 August to 18 September 2026 [S7]. It proposes:
   - a "fair and reasonable" test that replaces APPs 3, 4 and 6
   - a stricter definition of consent
   - notice to the OAIC within 72 hours of an eligible data breach
   - erasure rights, but only against "large digital platforms".

   The small business exemption stays [S8][S9] [Regulation].
5. **Data classification:**
   - Video of an identifiable player is personal information.
   - Pain/injury notes are health information, which is **sensitive information** and needs consent to collect.
   - Pose/skeleton data is personal information when it is linked to a user. It is *not* "biometric" sensitive information unless it is used to identify or verify a person [S2][S10] [Regulation / Our inference].
6. **Apple's third-party AI rule (5.1.2(i), November 2025).** We must clearly disclose, and get explicit permission, before sending personal data to third-party AI [S30][S31] [Regulation]. We also:
   - must offer in-app account deletion if accounts exist (5.1.1(v)) [S30][S42]
   - must not store personal health information in iCloud (5.1.3(ii)) [S30]
   - must show a clear indication while recording (2.5.14) [S30].
7. **Age ratings.** Exercise recommendations mean at least **9+**. Infrequent medical/treatment information means **13+**, and frequent means **16+** [S37]. In Australia, 15+ was replaced by 16+ from 18 June 2026 [S35]. **Do not use the Kids Category** (1.3) [S30] [Regulation].
8. **Payments are unchanged in Australia despite *Epic v Apple*.** In August 2025 Justice Beach found that Apple's app-distribution and in-app payment restrictions breached s 46 of the Competition and Consumer Act [S51]. Even so, Apple's published external-purchase entitlements cover the EU/EEA, South Korea, Japan, Brazil and the Netherlands — not Australia [S47]. Guideline 3.1.1(a) still bans steering outside the US storefront [S30]. **Plan on IAP only**, with a 15% commission under the Small Business Program [S44][S45] [Regulation].
9. **An Australian-resident developer must hold an ABN and be GST-registered to sell paid apps (DPLA Schedule 2, Exhibit C).** Apple Pty Ltd issues the consumer tax invoices under a s 153-50 GST arrangement [S46] [Regulation]. An organisation account needs a D-U-N-S Number [S48][S49]. Guideline 5.1.1(ix) says apps that "require sensitive user information" should be submitted by a legal entity [S30].
10. **Recommended architecture: on-device by default.** Capture, pose estimation and metrics all happen on the phone. The core product needs no account. Cloud sync and AI are opt-in, per purpose. Pain notes stay on the phone only. Raw video auto-expires. If done well, this can support an App Store privacy label of "Data Not Collected" for the free tier [S38] [Our inference].

---

## 1. Which Australian privacy law applies to us?

### 1.1 The Privacy Act, APP entities and the small business exemption

- The Privacy Act 1988 (Cth) and its 13 Australian Privacy Principles (APPs) apply to "APP entities". For businesses, that generally means those with annual turnover above AUD 3 million [S6] [Regulation]. Current compilation: No. 104, in force from 4 June 2026 [S2].
- **Small business test (s 6D).** A business is small if its turnover for the previous financial year was AUD 3,000,000 or less. A new business applies the test to the current year [S2] [Regulation].
- **Exceptions that stop a small business being exempt (s 6D(4)) include** [S2] [Regulation]:
  - (b) providing a health service to another individual while holding any health information (other than in an employee record)
  - (c) disclosing personal information to anyone else for a benefit
  - (d) paying to collect personal information from anyone else
  - being a Commonwealth contracted service provider.

  A body corporate related to a non-small business is also not exempt (s 6D(9)).
- **"Health service" (s 6FB)** means an activity intended or claimed — by the individual *or* by the person performing it — to "assess, maintain or improve" the individual's physical or psychological health. It also covers activities to diagnose or treat an injury, or to record health for those purposes [S2] [Regulation].
- OAIC's Guide to health privacy lists "gyms and weight loss clinics" among health service providers [S12]. Its small business page confirms health service providers are covered whatever their turnover [S11] [Regulation].
- **Why this matters for us** [Our inference]:
  - Technique coaching alone is arguably a sporting service, not a health service.
  - But several features push it toward s 6FB: recording pain or injury, "injury-risk" flags, "protect your shoulder" messaging, and "improve your health" marketing.
  - Once we are a health service provider and hold any health information, the exemption is lost.
  - s 6FA(b) then makes **all** personal information collected in providing that service "health information", potentially including the videos [S2].
  - **Two design responses:**
    - Keep the product clearly a *sports performance* tool. Pain handling should be a referral prompt only, not a record.
    - Comply with the APPs anyway, because Apple's rules require most of the same practices regardless (section 9).
- **NSW overlay.** The NSW Health Records and Information Privacy Act 2002 applies to private health service providers, and to businesses with turnover over AUD 3 million that hold health information [S20] [Regulation]. Victoria and the ACT also have health-records statutes; whether they apply to small non-health businesses is UNVERIFIED.

### 1.2 Is our data personal, sensitive, health or biometric?

| Data we might handle | Current classification | Consequence | Basis |
|---|---|---|---|
| Serve video showing the player's body/face | Personal information (identifiable individual) | APPs apply; notice (APP 5), security (APP 11), cross-border rules (APP 8) | OAIC treats images/video of identifiable people as personal information [S10] [Regulation] |
| Same video, but analysed for a health purpose (e.g. injury screening) | Could become health information (sensitive) | Consent needed to collect (APP 3.3); higher breach risk | s 6FA(a)/(b) [S2] [Our inference] |
| Pose keypoints / skeleton time series, linked to an account | Personal information | As above | "Personal information" = information about an identified or reasonably identifiable individual [S10] [Regulation] |
| Pose keypoints used to identify or verify who the player is | **Sensitive** (biometric information used for automated biometric verification or identification; biometric templates) | Consent; strong security | s 6 "sensitive information" (d)–(e) [S2] [Regulation]. **We should never use pose data for identity** [Our inference] |
| Pain/discomfort/injury notes | **Health information → sensitive** | Express consent (APP 3.3); do not send to analytics/AI; Apple 5.1.3 limits apply | s 6FA(a)(i): information about health, including illness, disability or injury [S2] [Regulation] |
| Serve statistics (speed estimate, in-rate, toss height) | Personal information when linked to a user | Accuracy (APP 10) matters because these are inferences | OAIC: AI-generated or inferred information about a person is a "collection" under APP 3 [S15] [Regulation] |
| Age / date of birth of junior users | Personal information; triggers children's rules | See section 3 | [S4] [Regulation] |
| Precise location of the court over time | Personal information now. The 2026 exposure draft would make "precise geolocation tracking data" (within 500 m, held over time) **sensitive** | Avoid collecting; use coarse "venue" labels | [S8] [Regulation – proposed] |

**Age of consent.** OAIC guidance lets entities presume that individuals aged 15 or over can consent, and presumes under-15s cannot [S10] [Regulation].

---

## 2. Privacy and Other Legislation Amendment Act 2024 — what commenced when

The Act (No. 128 of 2024) received Royal Assent on **10 December 2024** [S1]. The authoritative commencement table [S1] and the Register's version history [S2] show:

| Change | Commencement | Status at 27 Sep 2026 | Relevance to us |
|---|---|---|---|
| Objects, APP codes, emergency declarations, **Children's Online Privacy Code framework (s 26GC)**, APP 11.3, APP 8.3 "whitelist" power, eligible data breach declarations (Sch 1 Pts 1–7) | 11 Dec 2024 | In force | Code must be registered within 24 months of assent; "child" = under 18 [S1] [Regulation] |
| **Penalty tiers and infringement notices** (Sch 1 Pt 8: ss 13G, 13H, 13K, 80UB) | 11 Dec 2024 | In force | See below [S1] [Regulation] |
| Federal Court orders, OAIC public inquiries, determinations, monitoring powers (Pts 9–14) | 11 Dec 2024 | In force | Wider OAIC toolkit [S1] |
| **Statutory tort for serious invasions of privacy** (Sch 2) | By Proclamation, or automatically 6 months after assent → **10 June 2025** | In force (Privacy Act Compilation 103 started 10 June 2025) | Applies to *everyone*, including small businesses [S1][S2] [Regulation] |
| **Automated decisions in privacy policies — APP 1.7–1.9** (Sch 1 Pt 15) | Day after 24 months from assent → **10 December 2026** | Scheduled; the Register shows a future version from 10 Dec 2026 | Privacy-policy content duty [S1][S2] [Regulation] |
| Doxxing offences (Sch 3) | 11 Dec 2024 | In force | Not directly relevant |

**Penalties and infringement notices** [S1][S2] [Regulation]:

- **Serious interference (s 13G)** — maximum civil penalty:
  - individuals: AUD 2.5 million
  - bodies corporate: the greatest of AUD 50 million; 3× the benefit obtained; or, if the court cannot determine the benefit, 30% of adjusted turnover (s 13G(3)).
- **Any interference (s 13H):** up to 2,000 penalty units for an individual.
- **Administrative breaches (s 13K):** up to 200 penalty units. These can be dealt with by an **infringement notice** or compliance notice. They include:
  - not having a privacy policy, or its content being deficient (APP 1.3/1.4)
  - APP 2.1 anonymity
  - direct-marketing opt-out failures (APP 7)
  - non-compliant data breach statements
  - from 10 December 2026, APP 1.7 (ADM content).
- For listed corporations, an infringement notice is 200 penalty units per contravention.
- For other bodies corporate, the Regulatory Powers Act default applies: the lesser of one-fifth of the maximum court penalty and 60 penalty units per contravention (s 104(2)). For s 13K that works out at 60 units [S58] [Regulation] (fact-check 2026-09-27: confirmed; previously marked UNVERIFIED).
- **Penalty unit value.** Crimes Act s 4AA set AUD 330, with CPI indexation on 1 July 2026 [S19]. The indexed value for contraventions on or after 1 July 2026 is **AUD 364** [S57] [Regulation]. At that value [Our inference]:
  - a single 60-unit infringement notice is AUD 21,840
  - a 200-unit notice (listed corporation) is AUD 72,800
  - the s 13H individual maximum (2,000 units) is AUD 728,000.

**Statutory tort — what it requires** (Privacy Act Sch 2, cl 7) [S1] [Regulation]:

- **Elements the plaintiff must prove:**
  - an invasion of privacy by *intruding upon seclusion* (which includes watching, listening to or recording private activities) or by *misusing information*
  - a reasonable expectation of privacy
  - the invasion was **intentional or reckless** (negligence is not enough)
  - the invasion was serious
  - privacy outweighs any countervailing public interest.
- Damage does not need to be proved.
- **Defences** include consent and lawful authority.
- **Limitation period:** one year from awareness or three years from the invasion; for minors, until their 21st birthday.
- **Damages cap:** non-economic plus exemplary damages are capped at the greater of AUD 478,550 or the defamation cap.
- Defendants under 18 are exempt.

**Relevance** [Our inference]: our realistic exposure is misuse of users' videos, especially of teenagers. Examples: re-using clips in marketing without consent, reckless security that leaks clips, or letting coaches share clips publicly. Bystanders filmed on a public court have a weak expectation of privacy, but children in frame raise that expectation (cl 7(5)(c) lists the plaintiff's age as a factor) [S1].

**ADM transparency (from 10 December 2026)** [S1] [Regulation]:

- **Trigger.** A computer program makes a decision (or does something substantially and directly related to one) that "could reasonably be expected to significantly affect the rights or interests of an individual", using their personal information.
- **What the privacy policy must then state:**
  - the kinds of personal information used
  - the kinds of decisions made solely by the program
  - the kinds of decisions it substantially assists.
- The Act's examples are benefits under law, contract rights, and access to significant services or support.
- **Our inference:** choosing a player's "single highest-value change" is unlikely to meet the "significantly affect" threshold. It does not affect contract rights or access to a significant service. We should still describe the automated analysis in the privacy policy (low cost, and it builds trust). We must avoid automated features that do cross the line, such as auto-suspending accounts or pricing individual users by profile.

---

## 3. Children's Online Privacy Code (teens aged 13–17)

- **Status.** The OAIC must develop and register the Code by **10 December 2026** [S1][S3]. The OAIC page (updated 5 August 2026) reports three consultation phases:
  - 337 children and parents in phase 1
  - 61 submissions on the issues paper
  - 425 child/family and 135 stakeholder submissions on the exposure draft, which was open 31 March–5 June 2026 [S3] [Regulation].
- **Commencement is not yet set.** The draft asks stakeholders to suggest a date [S4] [Regulation]. The OAIC consultation page (updated 20 August 2026) hosts the exposure draft and explanatory statement [S5].
- **Scope.** The Code automatically binds an **APP entity** that provides a social media service, relevant electronic service or **designated internet service** (Online Safety Act meanings) that is **likely to be accessed by children**, and is not providing a health service. The draft extends it to services "primarily concerned with the activities of children" (e.g. junior-sport tracking apps). "Child" means under 18 [S1][S4] [Regulation].
- **Key draft obligations** (Exposure Draft Explanatory Statement, section numbers are the draft's) [S4] [Regulation – draft]:

| Draft section | Obligation | Implication for a serve coach used by juniors [Our inference] |
|---|---|---|
| s 8 | Take reasonable, risk-based steps to establish user age, **or** apply the Code's protections to all users | Easiest path: apply child-level protections to everyone |
| s 9 | **High privacy by default**: by default collect only strictly necessary information; optional features off by default; applies to existing accounts at commencement | Cloud upload, sharing, AI and marketing all default off |
| ss 10–11 | Collection, use and disclosure must be consistent with the **best interests of the child**; direct marketing only with consent and in the child's interests | No growth-hacking of teen data |
| s 13 | A child **15+ can consent**; under 15 needs a person with parental responsibility, with reasonable verification | Parent consent flow for 13–14-year-olds |
| s 14 | Consent must be voluntary: no nudges, no bundled consent; a basic service must be available without consent to optional handling | Separate toggles for sync, AI, research, marketing |
| s 23 | Child-friendly privacy policy; default reading level for ages 10–12 if not targeted | Plain-language privacy summary |
| s 26 | Child-friendly explanation before relying on consent for **cross-border** disclosure | Matters if we use US AI/cloud |
| s 28 | Right to request information about handling, including **automated decision-making/profiling**; response in 30 days (60 with extension) | Build a "why did the app say this?" view |
| s 32 | **Destroy on request** (de-identification is not enough), with written confirmation | In-app delete-all, plus a server purge log |

- **Small businesses.** Because the Code binds only APP entities, a genuinely exempt small business is outside it. As section 1 explains, relying on that exemption is fragile for us [Our inference].
- **Social media minimum age (under 16).** In force since 10 December 2025, but it covers only "age-restricted social media platforms". Tests include: a sole or significant purpose of online social interaction, users linking or interacting with each other, and users posting material [S28][S36] [Regulation].
  - A coaching app with private, one-to-one coach sharing and no feed should fall outside [Our inference].
  - Adding public feeds, leaderboards with comments, or clip sharing would require a re-assessment.
  - Apple's age-rating questionnaire has included social-media capability questions since 9 July 2026. Answers are required for new submissions and updates from September 2026 [S53]. In Australia, an app that declares social-media capabilities is rated 16+ [S37].

---

## 4. "Tranche 2": Exposure Draft Privacy Amendment (Personal Data Protection) Bill 2026

The Attorney-General's Department released the exposure draft Bill and a consultation paper on **31 August 2026**. Submissions closed **18 September 2026** [S7]. The Bill "remains subject to further consideration by government" [S7]. It has not been introduced and has no commencement date [S9] [Regulation – proposed]. It bundles about 40 proposals [S8]. Items relevant to us:

- **Definitions** [S8]:
  - personal information becomes information that "relates to" an individual, with a new "reasonably identifiable" test
  - consent must be voluntary, informed, current, specific and unambiguous
  - "collects" expressly covers information generated or derived by AI or analysis
  - sensitive information adds precise geolocation tracking data and genomic information.
- **Fair and reasonable test** [S8]:
  - replaces APPs 3, 4 and 6 with one principle (legislated factors, holistic assessment)
  - the **best interests of the child** is a primary consideration
  - consent is still required to collect sensitive information or to "trade" personal information.
- **Direct marketing** [S8]: clarified to include group-level targeting.
- **Security and breaches** [S8]:
  - a duty to have practices to respond to breaches (e.g. a tested response plan)
  - a duty to mitigate harm
  - a statement to the Commissioner **within 72 hours** of forming reasonable grounds to believe an eligible breach occurred (the 30-day assessment duty stays).
- **Right to erasure** [S8]: only for "large digital platforms" (group revenue of AUD 500 million or more, or 2.5 million or more average monthly end users). It would not apply to us.
- **Small business exemption: retained.** The draft only makes technical edits to s 6D(4) (e.g. recasting para (c) around "trades") [S9]. Removing the exemption is not in this Bill.

**Implication** [Our inference]: design now to the "fair and reasonable" and 72-hour standards. They are cheap to meet at our scale, and the Children's Code already points in the same direction.

---

## 5. Overseas cloud and AI providers (APP 8), OAIC AI guidance

- **APP 8.1.** Before disclosing personal information to an overseas recipient, take reasonable steps (usually an enforceable contract) to ensure it is handled consistently with the APPs. Under s 16C we stay **accountable** for the recipient's breaches [S13] [Regulation].
- **Cloud storage can be a "use" rather than a "disclosure"** [S13] [Regulation]:
  - when the provider is contractually limited to storage and access
  - when subcontractors are bound the same way
  - when we keep "effective control" (access, retrieval, deletion, security settings).

  An AI API that *processes* our content to generate outputs is harder to fit into that exception. Treat it as a disclosure unless contracts clearly limit it [Our inference].
- **APP 8.2 exceptions** include consent after the individual is **expressly informed** that APP 8.1 will not apply [S13]. POLA added APP 8.3 (prescribed countries/schemes), but we found no evidence of any regulations prescribing countries yet (UNVERIFIED) [S1].
- **OAIC guidance on commercially available AI** (21 October 2024, updated 17 January 2025) [S15] [Regulation]:
  - use privacy by design and a PIA
  - do due diligence on the product
  - update privacy notices
  - as best practice, do not enter personal and especially sensitive information into public AI chatbots
  - APP 6 applies to secondary uses
  - APP 10 accuracy needs human oversight
  - AI-generated inferences are a "collection".
- **OAIC guidance on training AI models** (21 October 2024) [S16] [Regulation]:
  - re-using customers' data to train models is a secondary use
  - updating a privacy policy is generally **not** enough to change reasonable expectations
  - recordings of people often contain sensitive information needing consent
  - the OAIC advises consent and/or a meaningful opt-out.
- **Apple adds its own gate.** Guideline 5.1.2(i) requires clear disclosure *and explicit permission* before sharing personal data with third-party AI [S30][S31] [Regulation].
- **Enforcement signal.** The OAIC announced on 24 June 2026 that the Privacy Commissioner had found Medmate and Monash IVF interfered with privacy. Third-party **tracking pixels** on their websites collected sensitive health information without consent. The determinations are [2026] AICmr 40 and 41, both dated 11 June 2026 [S17] [Regulation].
  - Lesson: no ad or marketing pixels or SDKs anywhere near pain notes or video [Our inference].
- **Community sentiment** (ACAPS 2026, conducted by the Social Research Centre for the OAIC in March 2026, n = 1,511 adults, released 28 May 2026) [S18] [Market data]:
  - 87% are more concerned about privacy than five years ago
  - only 4% consider AI companies trustworthy
  - 68% would use digital services more if they knew their data was handled fairly.

  A visible on-device, no-training promise is therefore a marketing asset [Our inference].
- **Voluntary AI governance.** The Government's *Guidance for AI Adoption* sets out six essential practices; its implementation guidance was published on 5 May 2026 [S54] [Regulation – voluntary].

---

## 6. Notifiable Data Breaches (NDB) scheme

- **Who it applies to.** APP entities [S14] [Regulation].
- **What counts.** An *eligible* data breach is unauthorised access, disclosure or loss that is likely to cause serious harm and is not prevented by remedial action.
- **Assessment.** A suspected breach must be assessed reasonably and quickly, and we must take all reasonable steps to finish within **30 days** (s 26WH) [S2].
- **Notification.** Once there are reasonable grounds to believe an eligible breach occurred, notify the OAIC and affected individuals **as soon as practicable** [S2][S14].
- **Proposed change.** The 2026 exposure draft would add a **72-hour** deadline for the Commissioner statement [S8] [Regulation – proposed].
- **Scale of risk.** The OAIC reported that 2025 had the highest number of breach notifications since the scheme began in 2018 [S55] [Market data].
- **For us** [Our inference]: videos of teenagers and health notes are exactly the data types that make harm "serious". Keeping them on-device shrinks our breach surface to almost nothing.

---

## 7. Filming at tennis courts: surveillance-device laws, bystanders and minors

- **Patchwork laws.** Each state and territory has its own surveillance-device law. The ALRC (2014) described them as significantly inconsistent [S21] [Regulation]. **This source is 12 years old**, and at least South Australia has since replaced its statute (details UNVERIFIED). Key points from the ALRC:
  - **Optical (video) recording:**
    - Victoria's offence applies only to "private activities", and an activity carried on outside a building is not private.
    - NSW's optical offence turns on whether installing or using the device involved entry onto premises, or interfering with an object, without consent.
    - ACT, Qld, SA and Tas did not regulate optical devices at the time [S21].
  - **Audio (listening devices):**
    - Qld, Vic and NT allow a party to a conversation to record it.
    - Other jurisdictions restrict recording private conversations without consent [S21].
- **Practical reading for a player filming themselves on a public or club court** [Our inference]:
  - Video of your own serve on an open court is very unlikely to be an offence anywhere.
  - The riskier element is **audio** that picks up other people's conversations, especially in NSW, SA, WA, Tas and the ACT.
  - Venue rules (club/council filming policies, child-safe policies) may be stricter than the law. Tennis Australia's safeguarding pages could not be fetched (403), so this is UNVERIFIED.
- **Design responses** [Our inference]:
  1. Record **video only by default**. If ball-impact sound is used for timing, process it on-device into timestamps and discard the raw audio.
  2. The capture guide should tell players to frame themselves, avoid filming juniors on adjacent courts, and follow club rules.
  3. Offer optional background blur/crop before any upload or share.
  4. Never use bystander footage for anything, and keep bystanders out of training data.
  5. Apple 2.5.14 separately requires explicit consent and a clear visual indicator while recording [S30].

---

## 8. Consumer law, marketing and medical-device boundaries

### 8.1 Subscriptions and free trials (Australian Consumer Law)

- **Today.** The general ACL bans on misleading or deceptive conduct and unfair contract terms already apply to subscription design [Regulation] (Competition and Consumer Act 2010 Sch 2; statute not re-opened for this file).
- **Enforcement example.** The ACCC sued Microsoft on 27 October 2025. It alleges about 2.7 million Microsoft 365 subscribers were misled by being shown only two choices (pay 29–45% more for Copilot-bundled plans, or cancel), while a cheaper "Classic" plan was revealed only during cancellation. The case was ongoing when last reported [S26] [Regulation]. Its outcome as at September 2026 is UNVERIFIED.
- **Coming — unfair trading practices and subscription rules** [S22][S23][S24] [Regulation – proposed]:
  - Consumer ministers agreed the policy on 19 December 2025 [S24].
  - Treasury consulted on an exposure draft from 9–23 February 2026 [S22].
  - The draft explanatory materials say the Bill **commences 1 July 2027** [S23].
  - Whether the Bill has since been introduced or passed is UNVERIFIED.
- **What the draft proposes:**
  - A **general prohibition** on conduct that unreasonably manipulates consumers or distorts their decision environment (e.g. dark patterns). Maximum penalties match the ACL: the greatest of AUD 50 million, 3× the benefit, or 30% of adjusted turnover for companies [S23].
  - **Up-front disclosure** before a consumer enters a subscription.
  - **Free-trial notices:** the date the trial ends, the date by which to cancel, how to cancel, the price and terms after the trial. These must be given a reasonable time before liability to pay arises [S23].
  - **Periodic reminders:** every six months for indefinite subscriptions, and before renewal for fixed terms [S23].
  - An **easy, minimal-step way to cancel**, and online cancellation where the subscription was bought online [S23].
- **A separate June–July 2026 Treasury consultation** asked whether to extend these protections to small businesses buying like consumers [S25].
- **Apple's contractual rules on subscriptions** [S45][S46] [Regulation]:
  - Apple's subscription guidance requires the purchase flow to show the trial length and the post-trial price [S45].
  - DPLA Schedule 2 §3.8(b) requires clear disclosure of the title, length and price, plus links to our privacy policy and Terms of Use inside the app [S46].
  - §3.10 requires us to comply with all laws when promoting subscriptions [S46].
- **Our inference:**
  - We are the supplier; Apple acts as our agent [S46].
  - Relying on Apple's billing does not transfer our ACL duties.
  - Build our own in-app trial-ending reminder, and a one-tap "Manage subscription" link (Apple's `showManageSubscriptions`).
- **Caution on 12-month commitments.** On 27 April 2026 Apple announced monthly subscriptions with a 12-month commitment. They are available worldwide except the United States and Singapore, so Australia is included, from the iOS 26.5 release in May 2026 [S52]. Under ACL unfair-contract and upcoming unfair-practice rules they carry higher consumer-law risk. Avoid them at launch [Our inference].

### 8.2 Marketing messages (Spam Act 2003)

- **Commercial electronic messages** (email, SMS and other electronic messages) need **consent** (express or inferred). They must identify the sender and include a functional unsubscribe that is honoured within **5 working days** [S27] [Regulation].
- Asking for consent by email is itself a marketing message [S27].
- **Apple 4.5.4:** push notifications must not be used for promotions unless users explicitly opted in via in-app consent language, with an in-app opt-out [S30] [Regulation].
- Whether push notifications are "electronic messages" under the Spam Act is UNVERIFIED. Treat them as if they are [Our inference].

### 8.3 Therapeutic goods (TGA) boundary

- **Exclusion 14B.** TGA guidance (16 March 2026) says consumer software that promotes general health or wellness by non-invasively measuring a physical parameter such as **movement** can be excluded from medical-device regulation [S29] [Regulation].
- **Limits of the exclusion.** It does not apply if the software:
  - is intended for clinical practice, or
  - makes claims or treatment decisions about a serious disease, condition, ailment or defect [S29].
- Every function of a multi-function app must meet the exclusion [S29].
- **Our inference:** "shoulder injury risk scores", rehab programs or diagnosis-like outputs could pull the app into TGA scope and Apple 1.4.1 scrutiny. Pain handling must be "stop and see a qualified professional", with no triage.
- **Apple's medical-device declaration** (from 26 March 2026, for EEA/UK/US distribution) applies to apps whose primary or secondary category is **Health & Fitness** or Medical, or that declare frequent medical/treatment information. New apps must declare their regulated-medical-device status; existing apps must do so by early 2027 [S50] [Regulation].
  - Choosing **Sports** as the primary category and not Health & Fitness as the secondary avoids this step. If we do declare it, answer "No" [Our inference].

---

## 9. Apple App Store rules that gate release

The App Review Guidelines page shows a last-updated date of 8 June 2026 [S30]. Key changes:

- **13 November 2025:** 5.1.2(i) third-party AI disclosure, among other changes [S31].
- **6 February 2026:** anonymous/random chat is brought under 1.2 [S53].
- **8 June 2026:** revised kid and teen safety guidance in the Introduction; changes to 1.2, 4.3 and 4.5.3 [S32].

All rows below are [Regulation] (Apple platform rules) unless tagged otherwise.

| Guideline / rule | Requirement (paraphrased) | What we do |
|---|---|---|
| **5.1.1(i)** Privacy policy [S30] | Link in App Store Connect **and** in-app. Must list data collected, how and why; confirm third parties give equal protection; explain retention/deletion and how to revoke consent or request deletion | One privacy policy that also satisfies APP 1.4 and, later, APP 1.7 |
| **5.1.1(ii)–(iv)** Consent, minimisation, access [S30] | Consent even for "anonymous" data; purpose strings must fully describe use; request only data relevant to core function; use out-of-process pickers; don't force consent; offer alternatives when permission is denied | Camera-denied users can import clips via PHPicker; no contacts or location |
| **5.1.1(v)** Accounts [S30][S42] | No login if the app has no significant account features. If accounts exist, **in-app account deletion** of the account record and associated data (not just deactivation). Web deletion only via a direct link. Tell subscribers that billing continues via Apple and link to manage it. Revoke Sign in with Apple tokens | Free core without an account; delete-account screen with subscription notice |
| **5.1.1(ix)** [S30] | Apps in regulated fields **or that require sensitive user information** should be submitted by a legal entity, not an individual | Enrol as a company (Pty Ltd) |
| **5.1.2(i)** Sharing, incl. **third-party AI** (Nov 2025) [S30][S31] | Get permission before using or sharing personal data; clearly disclose where data will be shared, **including with third-party AI**, and get **explicit permission**; ATT for tracking; can't require push, location or tracking for functionality | Per-feature AI consent screen naming the provider, the data sent (e.g. "3 key frames, no audio, no notes") and retention |
| **5.1.2(ii)–(iii)** [S30] | No repurposing without further consent; no covert profiling | Separate opt-in for model improvement |
| **5.1.2(vi)** [S30] | Data from depth/facial-mapping tools (ARKit, Camera, Photo APIs) and HealthKit may not be used for marketing, advertising or use-based data mining | Pose/depth data used only for coaching |
| **5.1.3** Health [S30] | Health/fitness data from HealthKit, Motion & Fitness etc. not for advertising or data mining; **may not store personal health information in iCloud**; research needs consent and ethics approval | Pain notes on-device only (no CloudKit sync); any validation study with users goes through an HREC |
| **1.4.1** Medical [S30] | Greater scrutiny for apps that could give inaccurate health data or be used to diagnose or treat; must disclose methodology for accuracy claims about health measurements; remind users to see a doctor | No health measurements; publish our serve-metric methodology anyway (consistent with the product's "accuracy" principle) |
| **2.5.1 / 2.5.2** [S30][S46] | Public APIs only. Self-contained bundle; no downloading code that adds or changes features. The DPLA allows downloaded *interpreted* code only if it doesn't change the app's primary purpose or bypass security | If we use Capacitor, ship the web bundle in the binary; no remote-UI shells |
| **2.5.14** [S30] | Explicit consent **and** a clear visual/audible indicator when recording camera, microphone or screen | Prominent recording state; audio off by default |
| **3.1.1** IAP [S30] | Unlocking features or subscriptions requires IAP; non-subscription free trials via a zero-price non-consumable | Subscriptions via StoreKit 2 |
| **3.1.1(a)** Link-outs [S30][S47] | External purchase link entitlements only in specific storefronts; in every other storefront except the US, no buttons, links or calls to action to non-IAP purchasing | No web-checkout mentions in the Australian app |
| **3.1.2(a)–(c)** Subscriptions [S30][S45][S46] | Ongoing value; minimum 7-day period; available on all the user's devices; free trials allowed; describe clearly what the user gets before asking them to subscribe; DPLA Schedule 2 disclosures | Paywall lists concrete deliverables (analyses/month, history, comparisons) |
| **4.2** Minimum functionality [S30] | Must be more than a repackaged website; needs genuine app-like utility | Native capture, on-device analysis, offline use (see 4.2 risk note below) |
| **4.8** Login services [S30] | If we use third-party login (e.g. Google), also offer an equivalent privacy-preserving option (name/email only, email hiding, no ad tracking) | Offer Sign in with Apple alongside any social login |
| **4.5.4** Push [S30] | Not required for function; no sensitive data in pushes; promotional pushes only with explicit in-app opt-in | Practice reminders are functional; marketing pushes opt-in |
| **1.3 / 5.1.4** Kids [S30] | Kids Category apps: no third-party analytics or ads (narrow exceptions), parental gates; "For Kids" wording is reserved. Apps collecting minors' personal info must follow children's privacy laws | **Do not** choose the Kids Category; target 13+ usage with the protections in section 3 |
| **App privacy details** ("nutrition label") [S38] | Disclose all data collected by us and by SDKs. "Collect" means transmitted off-device and retained longer than needed to service the request in real time. On-device-only processing is not "collected". Categories include Health, Fitness, Photos or Videos, Other User Content | Free tier can honestly show "Data Not Collected" if nothing leaves the device (crash reporting also counts) [Our inference] |
| **Privacy manifest** (PrivacyInfo.xcprivacy) [S33][S39][S40] | Required since 1 May 2024. Declares tracking, collected data types and **required-reason APIs** (e.g. UserDefaults `CA92.1`; file timestamps in the app container `C617.1`; system boot time for elapsed time `35F9.1`; disk space before writing `E174.1`). Commonly used third-party SDKs need their own signed manifests | Include a manifest; audit SDKs |
| **Purpose strings** [S41] | `NSCameraUsageDescription` (required if using the camera); `NSMicrophoneUsageDescription` (required if using the mic); `NSPhotoLibraryAddUsageDescription` (add-only saving); `NSPhotoLibraryUsageDescription` (read/write). PHPicker imports need **no** library permission because the picker runs out of process | Request camera at first recording; no mic unless audio features are on; import via PHPicker |
| **Age rating** [S33][S35][S37][S53] | New questionnaire (13+/16+/18+ tiers) mandatory since 31 January 2026; social-media questions added 9 July 2026 and required from September 2026. "Health or wellness topics" (e.g. exercise recommendations) → **9+**; infrequent medical/treatment information → 13+; frequent → 16+. "Frequent contests" (e.g. sport or fitness competitions) → 13+. Australia: 15+ removed from 18 June 2026; 16+ for social media or loot boxes | Expect **9+** if injury content is referral-only and challenges/leaderboards stay occasional; answer honestly (2.3.6) |
| **Australian age assurance** [S34][S43] | From 24 February 2026 Apple blocks Australian users from downloading **18+** apps unless confirmed adult. The Declared Age Range API returns a user- or parent-declared age range | Not needed for a 9+/13+ app. Optional: use Declared Age Range to route 13–14-year-olds to parental consent |
| **SDK minimums** [S33][S53] | From 28 April 2026, builds with Xcode 26 / iOS 26 SDK; from 9 September 2026, iOS apps must target iOS 13 or later. From April 2027, uploads must use the iOS 27 SDK or later (announced 9 September 2026) | Build with the current Xcode (Xcode 27 for any submission from April 2027) |

**4.2 risk note for a web-wrapper (Capacitor) route** [Our inference]: a thin wrapper around a hosted web prototype is a common 4.2/2.5.2 rejection pattern. To reduce the risk:

- ship the bundle in the binary
- use native camera capture (AVFoundation) and on-device pose (Apple's Vision framework provides pretrained body-pose models [S56] [Vendor claim])
- support offline analysis
- use native IAP.

---

## 10. Payments, *Epic v Apple* (Australia), commission, GST and developer account

- ***Epic v Apple* (Federal Court of Australia).** On 12 August 2025 Justice Jonathan Beach read a summary of his judgments; redacted full reasons were to follow later. Note this was not a "summary judgment" in the procedural sense [S51] [Regulation]:
  - He found Apple breached s 46 of the Competition and Consumer Act (misuse of market power) by preventing side-loading on iOS and by preventing alternative in-app payment methods for digital purchases.
  - Google was found to have breached s 46 over Play billing and "Project Hug".
  - The result was reported as a partial win for Epic. Which of Epic's claims failed is UNVERIFIED, because the judgment could not be fetched.
  - The developer class actions succeeded, with damages to be assessed later.
  - Apple said it disagreed with parts of the ruling.

  Reporting at the time warned changes "could be a long time" coming [S51].
  - Whether remedies orders or an appeal decision have been made since then is **UNVERIFIED** (the court website returned 403).
  - **Practical status on 27 September 2026:** Apple's StoreKit external-purchase documentation lists the EU/EEA (and Russia), South Korea, Japan (iOS 26.2+), Brazil (iOS 26.5+) and Netherlands dating apps — **not Australia** [S47]. Guideline 3.1.1(a) still bans steering outside the US storefront [S30].
  - **Our inference:** for the Australian launch, assume IAP-only and no link-outs. Monitor for remedies orders, which could open alternative payments later.
- **Commission** [S44][S45][S46] [Regulation]:
  - Standard: 30%. Auto-renewing subscriptions drop to 15% after a subscriber has accrued one year of paid service.
  - **App Store Small Business Program:** 15% on paid apps and IAP (including first-year subscriptions) for developers with up to **USD 1 million** in proceeds in the prior calendar year across associated accounts (≈ AUD 1.54 million at an assumed AUD 1 = USD 0.65; exchange rate UNVERIFIED).
  - Enrolment takes effect 15 days after the end of the fiscal month in which it is approved.
- **GST** [S46] [Regulation]:
  - Under DPLA Schedule 2, Exhibit C, **an Australian-resident developer must have an ABN and be registered for GST** (or have applied) as a condition of the paid-apps schedule, and upload evidence within 30 days.
  - Apple Pty Ltd and the developer enter a **s 153-50 GST arrangement**: Apple Pty Ltd is deemed to make the supply to Australian consumers and issues the tax invoices; we are deemed to supply Apple and receive a recipient-created tax invoice.
  - **Our inference:** this is a contractual trigger for GST registration even below the usual statutory registration threshold (AUD 75,000 — not re-verified today because the ATO site returned 403).
- **Developer account** [S48][S49] [Regulation]:
  - **Individual** enrolment shows the person's legal name as seller and needs no D-U-N-S.
  - **Organisation** enrolment needs a legal entity (no trading names), someone with legal binding authority, a working website on the organisation's domain, and a **D-U-N-S Number**. It is free from Dun & Bradstreet and takes about 5 business days plus up to 2 more for Apple.
  - Fee: USD 99/year; the local AUD price is shown at enrolment (commonly AUD 149 — UNVERIFIED).
  - Recommendation: register a Pty Ltd first, get the D-U-N-S Number, then enrol as an organisation. Reasons: liability shield, seller name, 5.1.1(ix) [Our inference].

---

## 11. Recommended privacy architecture

**Principle: on-device by default, cloud by explicit choice, health data never leaves the phone** [Our inference, grounded in S2, S4, S15–S17, S30, S38].

**Data flow**

```
Camera (video only, audio off) ──► App sandbox (encrypted, iOS Data Protection)
        │                                   │
        ▼                                   ▼
On-device pose estimation (Vision)   Raw clip (auto-expires; user-set 7/30/90 days/keep)
        │
        ▼
Derived data: keypoints, phase timings, toss/contact metrics, key frames
        │                               │
        ▼                               ▼ (opt-in: "Back up & sync")
Local dashboard (no account)      AU-hosted backend (metrics + key frames; video only if chosen)
                                        │
                                        ▼ (opt-in per use: "Ask AI coach")
                              Third-party AI (named; minimal payload; no pain notes;
                              no-retention/no-training contract; APP 8 terms)
Pain/discomfort flag ──► on-device only; never synced, never sent to AI/analytics
```

**Components**

1. **Capture and analysis on the device.** Recording, pose estimation, phase segmentation and all "measured" and "estimated" statistics run locally. This removes APP 8 exposure, NDB exposure and privacy-label disclosures for the core loop.
2. **No account for the core product** (5.1.1(v)) [S30]. Local history works without sign-in. An account appears only when the user turns on backup, multi-device sync or coach sharing.
   - Offer Sign in with Apple plus email.
   - Include in-app account deletion with a subscription notice [S42].
3. **Storage and retention**:
   - Raw clips stay in the app sandbox, not the Photos library. "Save to Photos" is an explicit action using add-only permission [S41].
   - Default raw-video retention is 30 days on-device, with key frames and metrics kept. Users can pick 7, 30 or 90 days, or keep forever.
   - Server copies are deleted within 30 days of a delete request or account closure (backups rotate within 35 days).
   - We keep a destruction log so we can issue written confirmation, as the draft Children's Code s 32 requires [S4].
4. **Deletion controls.** Delete a serve, a session, all videos, or everything. Export (share sheet, JSON/CSV plus clips) before deleting. No "soft delete" beyond a 7-day undo shown in the UI.
5. **Consent flows (layered, unbundled)** [S4][S30]:
   - **First run:** a plain-language privacy summary ("Your videos stay on your phone").
   - **Camera:** OS prompt at the first recording, with a purpose string that states on-device analysis.
   - **Microphone:** requested only if the user enables sound-based contact timing.
   - **Separate toggles, all off by default:** backup/sync; coach sharing; AI coaching (names the provider and payload; 5.1.2(i)); "help improve the app" (model training, OAIC gen-AI guidance [S16]); marketing email (Spam Act) and marketing pushes (4.5.4).
   - **Age gate** (self-declared, or the Declared Age Range API): users under 15 need parental consent for any optional off-device processing; 15–17-year-olds consent themselves, but optional features stay off by default [S4][S10].
6. **Pain and injury handling.**
   - A single "any pain or discomfort?" check with a body-area tap, stored locally.
   - If pain is reported, coaching pauses load-increasing drills and shows "see a physiotherapist or doctor".
   - No diagnosis, scoring or rehab content (TGA 14B, Apple 1.4.1) [S29][S30].
   - Explicit consent under APP 3.3 at first use ("Store this note on this phone to adjust your drills?").
   - Never in iCloud [S30]. Never in analytics.
7. **Analytics and SDKs.**
   - No advertising SDKs, pixels or attribution SDKs, so no ATT prompt is needed.
   - Only first-party, aggregated, non-content telemetry, opt-in (or none at launch).
   - Crash reports only if they carry no video or notes.
   - A privacy manifest that covers every SDK [S39][S40].
8. **Cloud and AI vendor rules (if used).**
   - Hosting in an Australian region.
   - AI calls send the minimum (e.g. a few key frames or numeric features, never raw video by default), under contracts with no retention and no training (verify vendor terms at procurement).
   - APP 8 contract clauses, or an express-informed-consent screen for any overseas processing [S13].
   - A PIA before launch [S15].
9. **Transparency.**
   - A "Why this advice?" panel that shows the evidence frames and metrics behind each coaching decision. This serves the product, APP 1.7-style transparency, and draft Children's Code s 28 [S1][S4].
   - A privacy policy section on automated analysis.
10. **Security and breach readiness.**
    - iOS Data Protection (Complete until First User Authentication or stronger) for clips and notes.
    - TLS and encryption at rest on the server; least-privilege staff access; no production video access for staff by default.
    - A written, tested data breach response plan built to the 72-hour draft standard [S8].

---

## 12. Release checklist

**Legend.**

- **L** = legal requirement under Australian law (applies now, or at the date shown).
- **L\*** = legal requirement only if we are an APP entity (see section 1; we recommend assuming yes).
- **P** = Apple platform requirement (contractual/review gate).
- **BP** = best practice (not strictly required).

### 12A. Requirements (L, L\*, P)

| # | Item | Type | Source |
|---|---|---|---|
| 1 | Decide APP-entity status in writing (small business test; health-service analysis); default to complying | L\* | [S2][S11][S12] |
| 2 | APP 1 privacy policy (kinds of information, purposes, overseas disclosure and countries, access/correction, complaints) linked in App Store Connect and in-app | L\* + P (5.1.1(i)) | [S2][S30] |
| 3 | From **10 Dec 2026**: privacy policy states ADM information if any automated decision could significantly affect rights or interests (APP 1.7–1.9) | L\* | [S1] |
| 4 | APP 5 collection notice at the points of collection (camera, sync, pain note, account) | L\* | [S2] |
| 5 | Express consent before collecting pain/injury (health, sensitive) information (APP 3.3) | L\* | [S2][S10] |
| 6 | No use of video/notes for new purposes (e.g. model training) without consent or reasonable expectation (APP 6) | L\* + P (5.1.2(ii)) | [S16][S30] |
| 7 | Security incl. technical and organisational measures; destroy or de-identify when no longer needed (APP 11) | L\* | [S1][S2] |
| 8 | APP 8 steps (contracts, or express-informed consent) before any overseas disclosure, incl. AI APIs | L\* | [S13] |
| 9 | NDB process: 30-day assessment; notify OAIC and individuals as soon as practicable | L\* | [S2][S14] |
| 10 | Access and correction requests handled (APP 12/13) | L\* | [S2] |
| 11 | Do not intentionally or recklessly misuse user or bystander footage (statutory tort applies to everyone) | L | [S1] |
| 12 | Children's Online Privacy Code compliance **from its commencement date** (registered by 10 Dec 2026; date TBC) if we are an APP entity and likely accessed by under-18s | L\* (future) | [S3][S4] |
| 13 | ACL: no misleading claims about accuracy ("measured speed"), pricing or trials; fair contract terms | L | [S26] |
| 14 | Unfair trading practices / subscription rules **if enacted** (proposed commencement 1 July 2027): trial-end notices, 6-monthly reminders, easy online cancellation | L (future) | [S23] |
| 15 | Spam Act: consent, sender identification, unsubscribe within 5 working days for marketing email/SMS | L | [S27] |
| 16 | Stay inside the TGA wellness exclusion: no diagnosis/treatment claims about serious conditions | L | [S29] |
| 17 | ABN + GST registration (Australian resident) before accepting the Paid Apps schedule; upload evidence within 30 days | P (contract) | [S46] |
| 18 | Organisation enrolment: legal entity, D-U-N-S, website, binding authority | P | [S48][S49] |
| 19 | In-app account deletion (if accounts); subscription billing notice; Sign in with Apple token revocation | P (5.1.1(v)) | [S30][S42] |
| 20 | Explicit permission before sharing personal data with third-party AI or other third parties | P (5.1.2(i)) | [S30][S31] |
| 21 | No personal health information in iCloud; health/fitness data not for ads or data mining | P (5.1.3) | [S30] |
| 22 | Recording indicator plus explicit consent | P (2.5.14) | [S30] |
| 23 | Purpose strings: camera (and microphone if used); PHPicker for imports; add-only permission for saving | P | [S41] |
| 24 | Accurate App Privacy details (incl. SDKs) and privacy manifest with required-reason codes | P | [S38][S39][S40] |
| 25 | Age-rating questionnaire (incl. social-media questions) answered honestly | P (2.3.6) | [S30][S37][S53] |
| 26 | IAP for all digital unlocks; no external purchase links in Australia; subscription disclosures (title, length, price, links to privacy policy and Terms of Use) | P (3.1.1, 3.1.2; DPLA Sch 2 §3.8) | [S30][S46][S47] |
| 27 | Offer an equivalent private login if any social login is used | P (4.8) | [S30] |
| 28 | Not a repackaged website; no downloaded code that changes features | P (4.2, 2.5.2) | [S30][S46] |
| 29 | Build with Xcode 26 / iOS 26 SDK (or later); iOS 27 SDK required from April 2027 | P | [S33][S53] |

### 12B. Best practice (BP)

| # | Item | Why |
|---|---|---|
| 30 | On-device analysis by default; "Data Not Collected" label for the free tier | Removes most legal surface; strong trust signal (ACAPS: 87% more concerned about privacy) [S18][S38] |
| 31 | Apply Children's-Code-style protections to all users now: high privacy by default, unbundled consent, destroy-on-request with written confirmation, parental consent for under-15s | Future-proof for the Code and the "fair and reasonable" test [S4][S8] |
| 32 | Raw video auto-expiry (default 30 days) and granular delete/export | Data minimisation; less breach harm [S8] |
| 33 | Audio off by default; on-device derived timing only | Surveillance-device law patchwork [S21] |
| 34 | Capture guidance on bystanders and juniors; optional blur before upload | Tort and venue-rule risk [S1] |
| 35 | Privacy Impact Assessment and written AI vendor due diligence | OAIC AI guidance [S15] |
| 36 | 72-hour breach-notification readiness; tested response plan | Exposure draft [S8] |
| 37 | Our own trial-ending reminder and one-tap "Manage subscription" | Pre-empts the 2027 subscription rules [S23] |
| 38 | No 12-month-commitment monthly plans at launch | Consumer-law risk [S52] |
| 39 | "Why this advice?" evidence panel; publish metric methodology and accuracy | APP 10, 1.4.1 spirit, draft Code s 28 [S4][S30] |
| 40 | Primary category **Sports**; avoid a Health & Fitness secondary category unless needed | Avoids the medical-device declaration step [S50] |
| 41 | No ad/attribution SDKs or pixels; no ATT | Tracking-pixel determination [S17] |
| 42 | Legal review of the privacy policy, terms and paywall copy before submission | Residual uncertainty below |

---

## Implications for the product

Prioritised, most important first.

1. **Ship on-device analysis as the default architecture.**
   - Capture, pose, metrics and coaching logic all run on the phone. No account is needed for the free tier.
   - This single decision removes most APP 8, NDB, Children's Code and Apple 5.1.2 friction.
   - It also lets the free tier plausibly claim "Data Not Collected" [S38] [Our inference].
2. **Treat pain/injury as a referral switch, not a health record.**
   - One local-only discomfort flag with explicit consent.
   - Coaching pauses load-increasing drills and says "see a physiotherapist or doctor".
   - No risk scores or rehab. Never in iCloud, analytics or AI [S2][S29][S30].
3. **Assume we are an APP entity from day one.**
   - Write an APP-compliant privacy policy, including an automated-analysis section so we are ready for 10 December 2026.
   - Write collection notices, an access/correction process and an NDB plan [S1][S2].
4. **Build unbundled, default-off consent toggles** for sync, coach sharing, AI coaching, model improvement and marketing. Add a parental-consent path for under-15s, per the draft Children's Code s 9/13/14 [S4].
5. **Any cloud AI feature ships behind a 5.1.2(i) consent screen.**
   - The screen names the provider and the exact payload.
   - Payloads are minimal (key frames or numeric features).
   - Vendor contracts must bar retention and training.
   - Prefer Australian hosting [S13][S30][S31].
6. **Business setup before submission:**
   - Pty Ltd → ABN + GST registration → D-U-N-S → Apple organisation enrolment → Small Business Program (15%) [S44][S46][S48][S49].
7. **Monetise through IAP only in Australia**, with clear paywall deliverables and our own trial reminders. Avoid 12-month-commitment plans [S23][S30][S47].
8. **Capture guide defaults:** video only (audio off), frame yourself, avoid other juniors, respect club rules. Add optional blur before any sharing [S21] [Our inference].
9. **Age rating target 9+.** Keep medical/treatment content infrequent and referral-only. Do not enter the Kids Category. Answer the social-media questions "No" while there is no feed [S30][S37].
10. **Add deletion and retention UI to the first version**, not later: per-serve, per-session and all-data delete; raw-video auto-expiry; export; in-app account deletion when accounts arrive [S4][S30][S42].

---

## Open questions

1. **Health service status.** Would the OAIC regard a serve-technique app that records discomfort flags as a "health service" (s 6FB)? A short written legal opinion is recommended (indicative cost UNVERIFIED; budget roughly AUD 2,000–5,000 for a scoped advice — our estimate, not a quote).
2. **Children's Online Privacy Code.**
   - Final text, commencement date and transition period (due by 10 December 2026).
   - Whether the final version keeps "primarily concerned with children's activities" (relevant if we build junior or club features).
   - Whether OAIC guidance on "likely to be accessed by children" will treat a tennis app rated 9+ as in scope.
3. **Tranche 2.** Will the Personal Data Protection Bill be introduced in late 2026 or 2027, and in what commencement tranches? Will the "fair and reasonable" factors or the sensitive-information list change after consultation?
4. ***Epic v Apple* remedies.** Have remedies orders or appeals been decided? Will Apple introduce Australian external-purchase entitlements? (UNVERIFIED; court site inaccessible.)
5. **Unfair trading practices Bill.** Has it been introduced or passed? Is the commencement still 1 July 2027? How are IAP subscriptions treated where Apple is the billing agent?
6. **Current surveillance-device law in each state/territory** for recording audio at sports venues. The ALRC summary is from 2014, and SA's 2016 Act and any later reforms need checking.
7. **Venue rules.** Tennis Australia's safeguarding/photography policy and typical council or club filming rules (pages were inaccessible).
8. ~~Penalty unit value and RPA defaults~~ — resolved in the fact-check: AUD 364 from 1 July 2026 [S57]; RPA s 104(2) gives 60 units for a body corporate [S58].
9. **APP 8.3.** Have any countries or schemes been prescribed (e.g. for US AI providers)?
10. **Push notifications.** Do they count as "commercial electronic messages" under the Spam Act?
11. **Commercial figures.** Local AUD Apple developer fee, and current USD/AUD rate for the Small Business Program threshold.

---

## Sources

All accessed 2026-09-27. "API" means the file was retrieved through the Federal Register of Legislation's public API (api.prod.legislation.gov.au) because the HTML viewer is script-rendered.

- **S1** — *Privacy and Other Legislation Amendment Act 2024* (Cth), No. 128, 2024 (Replaced Authorised Version registered 11 June 2025). Parliament of Australia / Federal Register of Legislation, 2024. https://www.legislation.gov.au/C2024A00128/asmade/text (PDF via API), accessed 2026-09-27.
- **S2** — *Privacy Act 1988* (Cth), Compilation No. 104 (compilation date 4 June 2026, C2026C00227), plus the Register's version history (future version from 10 December 2026). Federal Register of Legislation, 2026. https://www.legislation.gov.au/C2004A03712/latest/text (PDF and versions via API), accessed 2026-09-27.
- **S3** — "Children's Online Privacy Code" (page updated 5 August 2026). Office of the Australian Information Commissioner (OAIC), 2026. https://www.oaic.gov.au/privacy/privacy-registers/privacy-codes/childrens-online-privacy-code, accessed 2026-09-27.
- **S4** — "Draft Explanatory Statement — Exposure Draft Children's Online Privacy Code" (Privacy (Children's Online Privacy) Code 2026). OAIC, 2026. https://www.oaic.gov.au/__data/assets/pdf_file/0019/262630/Draft-Explanatory-Statement-Exposure-Draft-Childrens-Online-Privacy-Code.pdf, accessed 2026-09-27.
- **S5** — "Draft Children's Online Privacy Code — consultation for industry, civil society, academia". OAIC, 2026. https://www.oaic.gov.au/engage-with-us/consultations/draft-childrens-online-privacy-code-consultation-for-industry,-civil-society,-academia, accessed 2026-09-27.
- **S6** — "Privacy" (privacy reforms; Privacy Regulations 2025). Attorney-General's Department, 2026. https://www.ag.gov.au/rights-and-protections/privacy, accessed 2026-09-27.
- **S7** — "Privacy Reform – Consultation on Exposure Draft legislation" (opened 31 August 2026, closed 18 September 2026). Attorney-General's Department, 2026. https://consultations.ag.gov.au/rights-and-protections/privacy-reform/, accessed 2026-09-27.
- **S8** — "Privacy Reform – Consultation Paper". Attorney-General's Department, 2026. https://consultations.ag.gov.au/rights-and-protections/privacy-reform/user_uploads/consultation_paper.pdf, accessed 2026-09-27.
- **S9** — "Exposure Draft Privacy Amendment (Personal Data Protection) Bill 2026". Attorney-General's Department, 2026. https://consultations.ag.gov.au/rights-and-protections/privacy-reform/user_uploads/exposure-draft-bill-2026.pdf, accessed 2026-09-27.
- **S10** — "Australian Privacy Principles guidelines — Chapter B: Key concepts". OAIC (current version). https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines/chapter-b-key-concepts, accessed 2026-09-27.
- **S11** — "Small business" (privacy guidance for organisations). OAIC. https://www.oaic.gov.au/privacy/privacy-guidance-for-organisations-and-government-agencies/organisations/small-business, accessed 2026-09-27.
- **S12** — "Guide to health privacy — Introduction and key concepts". OAIC. https://www.oaic.gov.au/privacy/privacy-guidance-for-organisations-and-government-agencies/health-service-providers/guide-to-health-privacy/introduction-and-key-concepts, accessed 2026-09-27.
- **S13** — "APP guidelines — Chapter 8: APP 8 Cross-border disclosure of personal information". OAIC. https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines/chapter-8-app-8-cross-border-disclosure-of-personal-information, accessed 2026-09-27.
- **S14** — "About the Notifiable Data Breaches scheme". OAIC. https://www.oaic.gov.au/privacy/notifiable-data-breaches/about-the-notifiable-data-breaches-scheme, accessed 2026-09-27.
- **S15** — "Guidance on privacy and the use of commercially available AI products" (published 21 October 2024; updated 17 January 2025). OAIC, 2024–25. https://www.oaic.gov.au/privacy/privacy-guidance-for-organisations-and-government-agencies/guidance-on-privacy-and-the-use-of-commercially-available-ai-products, accessed 2026-09-27.
- **S16** — "Guidance on privacy and developing and training generative AI models" (21 October 2024). OAIC, 2024. https://www.oaic.gov.au/privacy/privacy-guidance-for-organisations-and-government-agencies/guidance-on-privacy-and-developing-and-training-generative-ai-models, accessed 2026-09-27.
- **S17** — "Privacy Commissioner finds privacy breaches in third-party tracking pixel investigation" (published 24 June 2026; determinations [2026] AICmr 40 and 41 dated 11 June 2026; date corrected in fact-check). OAIC media release, 2026. https://www.oaic.gov.au/news/media-centre/privacy-commissioner-finds-privacy-breaches-in-third-party-tracking-pixel-investigation, accessed 2026-09-27.
- **S18** — "Australians more concerned about privacy as trust in AI languishes, survey finds" (Australian Community Attitudes to Privacy Survey 2026; published 28 May 2026 — date corrected in fact-check). OAIC media release, 2026. https://www.oaic.gov.au/news/media-centre/australians-more-concerned-about-privacy-as-trust-in-ai-languishes,-survey-finds, accessed 2026-09-27.
- **S19** — *Crimes Act 1914* (Cth) s 4AA (penalty units), Compilation No. 167 (27 August 2026, C2026C00368). Federal Register of Legislation, 2026. https://www.legislation.gov.au/C1914A00012/latest/text (PDF via API), accessed 2026-09-27.
- **S20** — "NSW privacy laws" (HRIP Act coverage). Information and Privacy Commission NSW. https://www.ipc.nsw.gov.au/privacy/nsw-privacy-laws, accessed 2026-09-27.
- **S21** — *Serious Invasions of Privacy in the Digital Era* (ALRC Report 123), Chapter 14 "Surveillance Devices". Australian Law Reform Commission, 2014 (may be outdated). https://www.alrc.gov.au/wp-content/uploads/2019/08/fr123_14._surveillance_devices.pdf, accessed 2026-09-27.
- **S22** — "Unfair trading practices – exposure draft" (consultation 9–23 February 2026). The Treasury, 2026. https://consult.treasury.gov.au/c2026-739506, accessed 2026-09-27.
- **S23** — Exposure draft explanatory materials, Treasury Laws Amendment (Unfair Trading Practices) Bill 2026. The Treasury, 2026. https://storage.googleapis.com/files-au-treasury/treasury/p/prj3ab7a24aa75262e9da14e/page/c2026_739506_explanatory_memorandum.pdf, accessed 2026-09-27.
- **S24** — "Unfair trading practices" Decision Regulation Impact Statement (19 December 2025). The Treasury, 2025. https://treasury.gov.au/publication/p2025-723145, accessed 2026-09-27.
- **S25** — "Unfair trading practices protections for small businesses" (consultation 3 June–10 July 2026). The Treasury, 2026. https://consult.treasury.gov.au/c2026-764649, accessed 2026-09-27.
- **S26** — "Microsoft in court for allegedly misleading millions of Australians over Microsoft 365 subscriptions" (27 October 2025). ACCC media release, 2025. https://www.accc.gov.au/media-release/microsoft-in-court-for-allegedly-misleading-millions-of-australians-over-microsoft-365-subscriptions, accessed 2026-09-27.
- **S27** — "Avoid sending spam". Australian Communications and Media Authority (ACMA). https://www.acma.gov.au/avoid-sending-spam, accessed 2026-09-27.
- **S28** — "Social media age restrictions". eSafety Commissioner, 2025–26. https://www.esafety.gov.au/about-us/industry-regulation/social-media-age-restrictions, accessed 2026-09-27.
- **S29** — "Understanding the general health or wellness software exclusion" (16 March 2026). Therapeutic Goods Administration, 2026. https://www.tga.gov.au/resources/guidance/understanding-general-health-or-wellness-software-exclusion, accessed 2026-09-27.
- **S30** — "App Review Guidelines" (last updated 8 June 2026). Apple Inc., 2026. https://developer.apple.com/app-store/review/guidelines/, accessed 2026-09-27.
- **S31** — "Updated App Review Guidelines now available" (13 November 2025). Apple Developer News, 2025. https://developer.apple.com/news/?id=ey6d8onl, accessed 2026-09-27.
- **S32** — "Updated Apple Developer Program License Agreement and App Review Guidelines now available" (8 June 2026). Apple Developer News, 2026. https://developer.apple.com/news/?id=a233fmpw, accessed 2026-09-27.
- **S33** — "Upcoming requirements". Apple Developer, 2026. https://developer.apple.com/news/upcoming-requirements/, accessed 2026-09-27.
- **S34** — "Age requirements for apps distributed in Brazil, Australia, Singapore, Utah, and Louisiana" (24 February 2026). Apple Developer News, 2026. https://developer.apple.com/news/?id=f5zj08ey, accessed 2026-09-27.
- **S35** — "Upcoming changes to age ratings in Australia and Vietnam" (21 May 2026). Apple Developer News, 2026. https://developer.apple.com/news/?id=yrrb45pw, accessed 2026-09-27.
- **S36** — "New Requirements for Social Media Apps in Australia" (8 December 2025). Apple Developer News, 2025. https://developer.apple.com/news/?id=y1bckxf8, accessed 2026-09-27.
- **S37** — "Age ratings values and definitions" (App Store Connect Help). Apple Inc., 2026. https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions, accessed 2026-09-27.
- **S38** — "App privacy details on the App Store". Apple Inc. https://developer.apple.com/app-store/app-privacy-details/, accessed 2026-09-27.
- **S39** — "Privacy manifest files" (documentation). Apple Inc. https://developer.apple.com/documentation/bundleresources/privacy-manifest-files, accessed 2026-09-27.
- **S40** — "Describing use of required reason API" and "NSPrivacyAccessedAPIType" (documentation). Apple Inc., 2026. https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api, accessed 2026-09-27.
- **S41** — Information property list keys NSCameraUsageDescription, NSMicrophoneUsageDescription, NSPhotoLibraryUsageDescription, NSPhotoLibraryAddUsageDescription; PHPickerViewController (documentation). Apple Inc. https://developer.apple.com/documentation/bundleresources/information-property-list/nscamerausagedescription (and sibling pages); https://developer.apple.com/documentation/photosui/phpickerviewcontroller, accessed 2026-09-27.
- **S42** — "Offering account deletion in your app". Apple Inc. https://developer.apple.com/support/offering-account-deletion-in-your-app/, accessed 2026-09-27.
- **S43** — "Declared Age Range" (documentation). Apple Inc., 2026. https://developer.apple.com/documentation/declaredagerange, accessed 2026-09-27.
- **S44** — "App Store Small Business Program". Apple Inc. https://developer.apple.com/app-store/small-business-program/, accessed 2026-09-27.
- **S45** — "Auto-renewable subscriptions". Apple Inc. https://developer.apple.com/app-store/subscriptions/, accessed 2026-09-27.
- **S46** — "Apple Developer Program License Agreement" incl. Schedule 2 (§§3.4, 3.8, 3.10) and Exhibit C §1.2 (Australia GST), and the interpreted-code clause (version current at access; Apple announced updates on 18 August 2026). Apple Inc., 2026. https://developer.apple.com/support/terms/apple-developer-program-license-agreement/, accessed 2026-09-27.
- **S47** — "External Purchase" (StoreKit documentation: EU/EEA and Russia, South Korea, Japan, Brazil, Netherlands). Apple Inc., 2026. https://developer.apple.com/documentation/storekit/external-purchase, accessed 2026-09-27.
- **S48** — "Enrollment" (Apple Developer Program). Apple Inc. https://developer.apple.com/programs/enroll/, accessed 2026-09-27.
- **S49** — "D-U-N-S Number" (Apple Developer Account Help). Apple Inc. https://developer.apple.com/help/account/membership/D-U-N-S, accessed 2026-09-27.
- **S50** — "Update on regulated medical device apps in the European Economic Area, United Kingdom, and United States" (26 March 2026). Apple Developer News, 2026. https://developer.apple.com/news/?id=nyqbfz1y, accessed 2026-09-27.
- **S51** — Josh Taylor, "Epic Games wins partial victory in Australian court against Apple and Google" (12 August 2025). The Guardian, 2025 (read via Internet Archive snapshot of 19 December 2025; the live page was also retrieved in the fact-check). https://www.theguardian.com/australia-news/2025/aug/12/fortnite-developer-epic-games-wins-australian-federal-court-apple-google, accessed 2026-09-27. The primary judgment (commonly cited as *Epic Games, Inc v Apple Inc* [2025] FCA 900 — citation UNVERIFIED) could not be fetched (HTTP 403).
- **S52** — "Now Available: Monthly Subscriptions with a 12-Month Commitment" (27 April 2026). Apple Developer News, 2026. https://developer.apple.com/news/?id=agq42lxe, accessed 2026-09-27.
- **S53** — Apple Developer News index (items including "Updated App Review Guidelines now available", 6 February 2026, and "Age rating questionnaire now includes social media questions", 9 July 2026). Apple Inc., 2026. https://developer.apple.com/news/, accessed 2026-09-27.
- **S54** — "Guidance for AI adoption" (implementation guidance published 5 May 2026). Department of Industry, Science and Resources, 2026. https://www.industry.gov.au/publications/guidance-for-ai-adoption, accessed 2026-09-27.
- **S55** — OAIC media centre listing, incl. "Data breach notifications increase to all-time high in 2025, new NDB stats show" (16 July 2026). OAIC, 2026. https://www.oaic.gov.au/news/media-centre, accessed 2026-09-27.
- **S56** — "Vision" framework and "DetectHumanBodyPoseRequest" (documentation). Apple Inc. https://developer.apple.com/documentation/vision, accessed 2026-09-27.
- **S57** — "Fines and penalties" (Table 1: penalty unit values; AUD 364 on or after 1 July 2026). Australian Securities and Investments Commission, 2026. https://asic.gov.au/about-asic/asic-investigations-and-enforcement/fines-and-penalties/, accessed 2026-09-27. (Added in fact-check.)
- **S58** — *Regulatory Powers (Standard Provisions) Act 2014* (Cth), Compilation No. 4 (C2024C00118), s 104(2) and s 82(5). Federal Register of Legislation, 2024. https://www.legislation.gov.au/C2014A00093/latest/text (Word file via API), accessed 2026-09-27. (Added in fact-check.)

---

## Verification log (fact-check 2026-09-27)

**Method.** An independent fact-checker re-verified the most decision-critical claims against primary sources. WebSearch and WebFetch quotas were exhausted, so pages were retrieved with direct HTTP requests. Legislation came from the Federal Register of Legislation API (Word/PDF). The Federal Court, AustLII and ACCC sites returned HTTP 403; the ACCC release was read from an Internet Archive copy.

| # | Claim (as originally written) | Verdict | Evidence / source |
|---|---|---|---|
| 1 | Small business exemption threshold is AUD 3 million; s 6D(4)(b) removes the exemption for health service providers holding health information | Confirmed | Privacy Act Compilation 104, s 6D(1), (4)(b) [S2]; OAIC small business page [S11] |
| 2 | s 6FB "health service" includes activity intended to "assess, maintain or improve" health; OAIC lists "gyms and weight loss clinics" | Confirmed | s 6FB(1)(a) [S2]; OAIC Guide to health privacy [S12] |
| 3 | Privacy Act Compilation No. 104 in force from 4 June 2026; future version from 10 Dec 2026; Compilation 103 from 10 June 2025 | Confirmed | Register API version list (C2026C00227; C2025C00378) [S2]. The Register also lists a 1 Jan 2027 version, from the Interactive Gambling Amendment (Gambling Reform) Act 2026, which is not relevant to us |
| 4 | POLA Act assent 10 Dec 2024; most of Sch 1 from 11 Dec 2024; statutory tort 10 June 2025; APP 1.7–1.9 (ADM) 10 Dec 2026 | Confirmed | POLA Act s 2 commencement table (replacement version, 11 June 2025) [S1] |
| 5 | s 13G maxima: AUD 2.5m (individuals); AUD 50m / 3× benefit / 30% adjusted turnover (bodies corporate) | Confirmed, wording refined | s 13G(2)–(3) [S2]. The 30% limb applies only when the benefit cannot be determined; text clarified |
| 6 | s 13H up to 2,000 units; s 13K up to 200 units; listed-corporation infringement notice 200 units | Confirmed | POLA Act Sch 1 Pt 8 text [S1] |
| 7 | Non-listed body corporate infringement notice: 60 penalty units (was marked UNVERIFIED) | Confirmed | RPA s 104(2)(b) and s 82(5) [S58] |
| 8 | Penalty unit AUD 330 "floor"; 60-unit notice ≈ AUD 19,800 | **Corrected** | Indexed to **AUD 364** from 1 July 2026 [S57]; Crimes Act s 4AA(3) [S19]. A 60-unit notice is now AUD 21,840 |
| 9 | Statutory tort damages cap AUD 478,550; limitation 1 year from awareness / 3 years from invasion | Confirmed | POLA Act Sch 2 [S1] |
| 10 | Children's Code must be registered by 10 Dec 2026; exposure draft consultation 31 Mar–5 Jun 2026; participation counts (337 / 61 / 425 / 135); commencement date not set | Confirmed | OAIC Code page (updated 5 Aug 2026) [S3]; Draft Explanatory Statement s 2 [S4]; POLA s 26GC(10) [S1] |
| 11 | Code binds APP entities providing social media / relevant electronic / designated internet services likely to be accessed by children and not providing a health service; draft s 13 sets the consent age at 15; draft s 32 is destroy-on-request | Confirmed | s 26GC(5) [S1]; Draft ES ss 13, 32 [S4] |
| 12 | Tranche 2 exposure draft (Personal Data Protection Bill 2026): consultation 31 Aug–18 Sep 2026; "subject to further consideration"; ~40 proposals; 72-hour Commissioner statement; large-platform erasure (AUD 500m revenue or 2.5m monthly end users); precise geolocation within 500 m; small business exemption retained with technical edits to s 6D(4) | Confirmed | AGD consultation page [S7]; Consultation Paper [S8]; Exposure Draft Bill items 2–6 [S9] |
| 13 | ACAPS 2026: n = 1,511; 87% more concerned; 4% trust AI companies; 68% would use services more; source dated 11 June 2026 | Figures confirmed; **date corrected** | OAIC media release published **28 May 2026**; fieldwork March 2026 by the Social Research Centre [S18] |
| 14 | Tracking-pixel findings against Medmate and Monash IVF "on 6 July 2026" | **Corrected** | Release published **24 June 2026**; determinations [2026] AICmr 40 and 41 dated 11 June 2026 [S17] |
| 15 | 2025 had the most NDB notifications since 2018 (16 July 2026 release) | Confirmed | OAIC media centre listing [S55] |
| 16 | Guideline 5.1.2(i) third-party AI disclosure and explicit permission, added 13 Nov 2025; guidelines last updated 8 June 2026 | Confirmed | App Review Guidelines [S30]; Apple news 13 Nov 2025 [S31] |
| 17 | 5.1.3(ii) no personal health info in iCloud; 2.5.14 recording consent and indicator; 5.1.1(ix) legal entity for sensitive info; 3.1.2(a) minimum 7-day subscription | Confirmed | App Review Guidelines text [S30] |
| 18 | No external-purchase link entitlement for Australia; 3.1.1(a) steering ban everywhere except the US storefront | Confirmed | StoreKit External Purchase documentation (EU/EEA and Russia, Korea, Japan, Brazil, Netherlands; no Australia) [S47]; guidelines 3.1.1(a) [S30] |
| 19 | Small Business Program: 15%, USD 1m threshold, adjustment 15 days after the end of the fiscal month | Confirmed | Apple SBP page [S44] |
| 20 | Age ratings: health/wellness topics 9+; infrequent medical 13+; frequent 16+; Australia 15+ removed 18 June 2026; AU 16+ for social media or loot boxes; questionnaire deadline 31 Jan 2026 | Confirmed; **frequent contests → 13+ added** | Age ratings reference [S37]; Apple news 21 May 2026 [S35]; upcoming requirements [S33] |
| 21 | Social-media questionnaire "since September 2026" | **Corrected** | Questions available from 9 July 2026, required from September 2026 [S53] |
| 22 | Apple blocks Australian users from 18+ apps unless confirmed adult from 24 Feb 2026 | Confirmed | Apple news 24 Feb 2026 [S34] |
| 23 | Xcode 26 / iOS 26 SDK from 28 Apr 2026; iOS 13 minimum target from 9 Sep 2026 | Confirmed; **iOS 27 SDK from April 2027 added** | Upcoming requirements [S33]; Apple news 9 Sep 2026 [S53] |
| 24 | Regulated medical-device declaration (26 Mar 2026) applies to EEA/UK/US apps in Health & Fitness or Medical categories, or with frequent medical info | Confirmed | Apple news 26 Mar 2026 [S50] |
| 25 | 12-month-commitment monthly subscriptions "launched in Australia on 27 April 2026" | **Corrected** | Announced 27 Apr 2026 for all storefronts except the US and Singapore, available from iOS 26.5 (May 2026) [S52] |
| 26 | *Epic v Apple*: 12 Aug 2025, Beach J, s 46 breaches (side-loading, in-app payments); class actions succeeded; Apple disagreed | Confirmed (core findings) | Guardian report [S51] |
| 27 | Beach J "delivered a summary judgment"; "Epic's other claims failed" | **Corrected** | He read a summary of his judgments, which is not a summary judgment. Which claims failed is UNVERIFIED. The neutral citation [2025] FCA 900 is still UNVERIFIED (court site and AustLII returned 403) |
| 28 | DPLA Exhibit C: Australian residents need an ABN and GST registration (evidence within 30 days); s 153-50 arrangement with Apple Pty Ltd | Confirmed | DPLA Exhibit C §1.2 [S46] |
| 29 | Organisation enrolment needs a legal entity, D-U-N-S and a website; fee USD 99 | Confirmed | Apple enrolment page [S48] |
| 30 | Local AUD developer fee "commonly AUD 149" | Unverified | Apple shows the local price only during enrolment; left marked UNVERIFIED |
| 31 | ACCC v Microsoft (27 Oct 2025): ~2.7m subscribers; price rises of 45% (Personal) and 29% (Family); hidden "Classic" plans | Confirmed | ACCC media release (Internet Archive copy) [S26]. The case outcome is still UNVERIFIED |
| 32 | Unfair trading practices Bill commences 1 July 2027; penalty maxima AUD 50m / 3× / 30% | Confirmed | Treasury exposure-draft EM paras 1.40, 1.151 [S23]. Consultation dates 9–23 Feb 2026 [S22] could not be re-checked (script-rendered page) |
| 33 | Social media minimum age in force 10 Dec 2025; "sole or significant purpose" / linking / posting tests | Confirmed | eSafety [S28]; Apple news 8 Dec 2025 [S36] |
| 34 | Spam Act unsubscribe honoured within 5 working days | Confirmed | ACMA [S27] |
| 35 | TGA exclusion 14B guidance (16 Mar 2026) covers non-invasive measurement of movement; excludes clinical use and serious-condition claims | Confirmed | TGA guidance [S29] |
| 36 | OAIC AI-products guidance dated 21 Oct 2024, updated 17 Jan 2025 | Confirmed | OAIC page [S15] |
| 37 | NSW HRIP Act covers private health service providers and businesses over AUD 3m that hold health information | Confirmed | IPC NSW [S20] |
| 38 | AI adoption implementation guidance published 5 May 2026 (six essential practices) | Confirmed | DISR/NAIC page [S54] |

**Evidence-tag review.** Most tags are honest:
- Apple rules are labelled [Regulation] with a clear explanation.
- The one vendor capability claim (Vision body pose) is labelled [Vendor claim].
- Inferences are labelled [Our inference].

One change: the ACL general-prohibition statement was relabelled from [Established] to [Regulation]. The claims that remain UNVERIFIED are the *Epic* neutral citation and remedies, the AUD developer fee, the USD/AUD rate, the ACCC v Microsoft outcome, the current state surveillance-device statutes, and Tennis Australia's venue policies.
