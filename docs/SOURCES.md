# Sources

A consolidated bibliography of the outside sources behind Serve Coach's decisions, specs and launch documents. Everything was accessed on **27 September 2026** unless noted. Full reference lists, access notes and fact-check logs live in the research files (`docs/research/01`–`10` and `docs/research/gaps/`); this page groups the sources that matter, says what each one supports, and names the documents that rely on it.

**How to read it.**
- **Cited as** gives the research file and source number, for example "08 [S1]" means `docs/research/08-monetisation-costs.md`, source S1.
- **Relied on by** names our documents: DECISIONS (D1–D11), PRODUCT, METRICS, COACHING, CAPTURE, ARCHITECTURE, DESIGN, MONETISATION, LAUNCH_AU, FUNCTIONAL_STATUS, LIMITATIONS, IOS_ROUTE.
- The groups keep three kinds of evidence apart:
  1. **Established research** (§1): peer-reviewed findings, clinical guidance and standard methods.
  2. **Coaching interpretation** (§2): expert practice, useful but not directly proven.
  3. **Vendor claims** (§3): what a company says about its own product, unverified by us.

  Market data (§4), regulation and platform rules (§5), and engineering documentation (§6) follow.
- **UNVERIFIED** means the research team could not open or confirm the primary page.

**Citing is not endorsement.** Serve Coach is independent. It is not affiliated with, sponsored by or endorsed by any coach, company or body listed here. Coaching ideas are written in our own words and carry an evidence tier, never a person's name; names appear only as neutral citations (gap study on Intuitive Tennis and Kovacs §6; ACL s 18 and s 29).

---

## 1. Established research

### 1.1 Serve biomechanics

Relied on by: DECISIONS D1, D5, D6; METRICS (definitions, reference ranges, bands); COACHING (fault library, priority rules); CAPTURE (what each view can see).

| Source | URL | Cited as | Supports |
|---|---|---|---|
| Kovacs M, Ellenbecker T (2011). An 8-stage model for evaluating the tennis serve. *Sports Health* 3(6):504–513 | https://pmc.ncbi.nlm.nih.gov/articles/PMC3445225/ | 03 [S1]; 04 [S12] | The phase model the engine and coaching use |
| Elliott B (2006). Biomechanics and tennis. *Br J Sports Med* 40:392–396 | https://pmc.ncbi.nlm.nih.gov/articles/PMC2577481/ | 03 [S2] | Kinetic chain overview |
| Elliott B, Fleisig G, Nicholls R, Escamilla R (2003). Technique effects on upper limb loading in the tennis serve. *J Sci Med Sport* 6(1):76–87 | http://biomechanics.stanford.edu/me337/projects/elliot03.pdf | 03 [S3] | Little front-knee flexion raises shoulder and elbow loads without adding speed |
| Fleisig G, Nicholls R, Elliott B, Escamilla R (2003). Kinematics used by world-class players to produce high-velocity serves. *Sports Biomech* 2(1):51–64 | https://pubmed.ncbi.nlm.nih.gov/14658245/ | 03 [S4] | Segment contributions to racket speed |
| Girard O, Micallef JP, Millet GP (2005). Lower-limb activity during the power serve. *Med Sci Sports Exerc* 37(6):1021–1029 | https://pubmed.ncbi.nlm.nih.gov/15947729/ | 03 [S6] | Contact height about 1.43–1.49 × standing height; elite vs beginner leg forces |
| Girard O, Micallef JP, Millet GP (2007). Influence of restricted knee motion during the flat first serve. *J Strength Cond Res* 21(3):950–957 | https://pubmed.ncbi.nlm.nih.gov/17685715/ | 03 [S7] | Restricting the knees cut ball speed about 15–17% at every level (leg drive is a hero metric) |
| Hornestam JF et al. (2021). Effects of knee flexion on serve performance of intermediate players. *Sensors* 21(16):5254 | https://pmc.ncbi.nlm.nih.gov/articles/PMC8398391/ | 03 [S8] | One of the few intermediate-level samples |
| Reid M, Elliott B, Alderson J (2008). Lower-limb coordination and shoulder joint mechanics in the tennis serve. *Med Sci Sports Exerc* 40(2):308–315 | https://doi.org/10.1249/mss.0b013e31815c6d61 | 03 [S9]; 04 [S28] | Foot-up and foot-back are both valid |
| Martin C et al. (2014). Energy flow analysis during the serve: injured vs non-injured players. *Am J Sports Med* | https://doi.org/10.1177/0363546514547173 | 03 [S10] | Poor sequencing links to injury |
| Martin C, Touzard P, Fourel L, Pluim BM (2026). Serve biomechanics, joint load and overuse injuries: a narrative review. *Sports Med Open* 12:42 | https://pmc.ncbi.nlm.nih.gov/articles/PMC13069043/ | 03 [S15]; 04 [S26] | Injury epidemiology; the thin injury-link evidence |
| Touzard P et al. (2019). The "waiter's serve" and upper-limb loads in young elite players. *Eur J Sport Sci* 19(6) | https://doi.org/10.1080/17461391.2018.1539527 | 03 [S16]; 04 [S27] | Waiter's tray raises loads with no speed benefit |
| Reid M, Whiteside D, Elliott B (2011). Serving to different locations: set-up, toss and racket kinematics. *Sports Biomech* 10(4):407–414 | https://pubmed.ncbi.nlm.nih.gov/22303790/ | 03 [S20]; 04 [S30] | Professionals disguise the toss across targets |
| Whiteside D, Elliott B, Lay B, Reid M (2013). Successful and unsuccessful serves across the elite pathway. *Hum Mov Sci* | https://doi.org/10.1016/j.humov.2013.06.003 | 03 [S23] | Faulted serves differ mainly in ball projection, not one body fault (why the ins-and-misses insight may be null) |
| Whiteside D, Giblin G, Reid M (2014). Redefining spatial consistency in the ball toss of the professional female serve. ISBS proceedings | https://ojs.ub.uni-konstanz.de/cpa/article/download/6097/5577/0 | 06 [S8] | Within-player toss SD reference (6.0 cm vertical) |
| Newton O, Girard O, Chin A, Reid M (2025). The tossing arm and head and serve kinematics. *Eur J Sport Sci* | https://pmc.ncbi.nlm.nih.gov/articles/PMC12294548/ | 03 [S27]; 04 [S29] | Tossing-arm timing changes toss height and placement |
| Vacek J et al. (2025). Toss zenith, impact height, shoulder strength and serve speed in juniors. *J Funct Morphol Kinesiol* 10(4):438 | https://pmc.ncbi.nlm.nih.gov/articles/PMC12641958/ | 03 [S28] | Impact height correlates with speed; lower variability matters |
| Mendes PC et al. (2013). Variability of the serve toss under artificial crosswind. *J Sports Sci Med* | https://pubmed.ncbi.nlm.nih.gov/24149810/ | 03 [S29] | Experienced servers stabilise the vertical toss |
| Jacquier-Bret J, Gorce P (2024). Kinematics at key points of the serve: systematic review and meta-analysis. *Front Sports Act Living* | https://www.frontiersin.org/journals/sports-and-active-living/articles/10.3389/fspor.2024.1432030/full | 03 [S31] | Pooled angles are noisy; why D5 never compares 2D bands with published angles |
| Brito AV et al. (2024). Biophysical characterisation of the serve: scoping review. *J Sci Med Sport* | https://doi.org/10.1016/j.jsams.2023.10.018 | 03 [S32] | Research gaps: beginners, women, left-handers, kick and slice |
| Wood D, Reid M, Elliott B, Alderson J, Mian A (2023). The expert eye? Inter-rater comparison of elite serve kinematics. *J Sports Sci* | https://doi.org/10.1080/02640414.2023.2298102 | 03 [S33]; 06 [S3] | Experts rate key features reliably from 2D video (elite players only) |
| Campbell A et al. (2013). Lumbar loading in the elite adolescent serve. *Med Sci Sports Exerc* | https://doi.org/10.1249/mss.0b013e31828bea5e | 03 [S36]; 04 [S31] | Lumbar loading; juniors deferred |
| Kovacs MS, Ellenbecker TS (2011). A performance evaluation of the tennis serve. *Strength Cond J* 33(4):22–30 | https://doi.org/10.1519/SSC.0b013e318225d59a | gap Kovacs [A67] | Companion to the 8-stage model |

### 1.2 Injury, pain and referral guidance

Relied on by: COACHING §10 (body check, red flags, referral cards); PRODUCT §6.16; LAUNCH_AU §5.

| Source | URL | Cited as | Supports |
|---|---|---|---|
| British Elbow & Shoulder Society (2014). Commissioning guide: subacromial shoulder pain | https://bess.ac.uk/wp-content/uploads/2020/06/Subacromial-Shoulder-Commissioning-Guide_final1.pdf | 03 [S55] | Shoulder red flags and referral timing |
| Australian Commission on Safety and Quality in Health Care (2022). Low Back Pain Clinical Care Standard | https://www.safetyandquality.gov.au/sites/default/files/resources/attachments/low_back_pain_clinical_care_standard.pdf | 03 [S56] | Back-pain red flags |
| Vervaecke AJ et al. (2026). Arm dominance and shoulder abnormalities in senior high-level players. *Orthop Traumatol Surg Res* | https://doi.org/10.1016/j.otsr.2026.104641 | 02 [S46] | 78.8% of 113 senior players had structural shoulder abnormalities (single cross-sectional study) |

### 1.3 Motor learning and feedback

Relied on by: DECISIONS D6 (one cue, one drill); COACHING (cue registers, practice design); LIMITATIONS §1.

| Source | URL | Cited as | Supports |
|---|---|---|---|
| Wulf G (2013). Attentional focus and motor learning: a review of 15 years. *Int Rev Sport Exerc Psychol* 6(1):77–104 | https://golfwell.co/wp-content/uploads/2015/10/Wulf_AF_review_IRSEP_2013.pdf | 04 [S37] | External-focus cues |
| Chua LK et al. (2021). Superiority of external attentional focus: meta-analyses. *Psychol Bull* 147(6):618–645 | https://doi.org/10.1037/bul0000335 | 04 [S38] | Moderate benefit (retention g ≈ 0.58) |
| McKay B et al. (2024). Reporting bias, not external focus: a robust Bayesian meta-analysis. *Psychol Bull* 150(11):1347–1362 | https://sportrxiv.org/index.php/server/preprint/view/304 | 04 [S39] | After bias correction the effect may be near zero, so cues are A/B tested, not marketed as proven |
| Carnero-Díaz Á et al. (2025). Effects of analogy instruction in motor skills: meta-analysis. *Psychol Sport Exerc* 76:102766 | https://doi.org/10.1016/j.psychsport.2024.102766 | 04 [S46] | Analogy cues help, mostly for novices (the UTR 1–3 register) |
| Meier C et al. (2020). Analogy and explicit instructions and tennis-serve performance. *Front Psychol* | https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2020.00002/full | 04 [S47] | The only tennis-serve analogy trial: similar gains either way |
| Krause L, Farrow D, Buszard T, Pinder R, Reid M (2019). Representative learning design in tennis practice tasks. *Psychol Sport Exerc* 41:36–45 | https://doi.org/10.1016/j.psychsport.2018.11.008 | 04 [S51] | Drill design changes what is practised |
| Czyż SH et al. (2024). Contextual interference and transfer: meta-analysis. *Front Psychol* | https://pmc.ncbi.nlm.nih.gov/articles/PMC11349744 | 04 [S52] | Blocked vs random practice |
| McKay B et al. (2022). Reduced relative feedback frequency: meta-analysis. *Psychol Sport Exerc* 61:102165 | https://www.sciencedirect.com/science/article/abs/pii/S1469029222000334 | 04 [S54] | Feedback fading |
| Han Y et al. (2022). Feedback for motor skill learning in PE: trial sequential meta-analysis. *Int J Environ Res Public Health* 19(22):15361 | https://pmc.ncbi.nlm.nih.gov/articles/PMC9690366/ | 04 [S56] | Visual plus verbal feedback beats verbal alone (why a key frame sits beside the cue) |
| van Wieringen PCW et al. (1989). Video feedback and learning the serve by intermediate players. *J Sports Sci* 7:153–162 | https://www.tandfonline.com/doi/abs/10.1080/02640418908729833 | 04 [S57] | No added benefit of video over coaching (why we never claim video alone improves serves) |
| van der Meer BR et al. (2024). Self-controlled video feedback and tactical learning in tennis. *Res Q Exerc Sport* 95(2) | https://doi.org/10.1080/02701367.2023.2275801 | 04 [S60] | Let players choose when to review |

### 1.4 Computer vision, pose, ball and speed measurement

Relied on by: DECISIONS D1, D4, D5; METRICS; CAPTURE; ARCHITECTURE; FUNCTIONAL_STATUS.

| Source | URL | Cited as | Supports |
|---|---|---|---|
| Bazarevsky V et al. (2020). BlazePose: on-device real-time body pose tracking. arXiv:2006.10204 | https://arxiv.org/abs/2006.10204 | 05 [S6] | The MediaPipe pose model family we bundle |
| Washabaugh EP et al. (2022). Accuracy of open-source pose estimation for gait. *Gait Posture* 97:188–195 | https://doi.org/10.1016/j.gaitpost.2022.08.008 | 05 [S12] | 2D pose within a few degrees in-plane for slow movement |
| Wade L et al. (2023). 2D frontal and sagittal markerless motion capture. *PLoS One* | https://pmc.ncbi.nlm.nih.gov/articles/PMC10635560/ | 05 [S14] | As above |
| Fukushima T et al. (2024). Human pose estimation for motion capture in sports: validation. *Sports Eng* 27 | https://doi.org/10.1007/s12283-024-00460-w | 05 [S16] | Fast sports: MAE about 9–10° |
| Baldinger M, Reimer LM, Senner V (2025). Camera viewing angle and OpenPose validity. *Sensors* 25(3):799 | https://pmc.ncbi.nlm.nih.gov/articles/PMC11819822/ | 05 [S17] | 45° off-plane: RMSE 15–37°, so angles are bands, never degrees |
| Dobos TJ et al. (2022/2025). Validation of pitchAI markerless motion capture. *Sports Biomech* 24(3):587–607 | https://doi.org/10.1080/14763141.2022.2137425 | 01 [S57] | Single-camera arm angles err 12–14°, up to about 21° (D5: no distal-joint angles) |
| Huang Y-C et al. (2019). TrackNet: tracking high-speed tiny objects in sport. arXiv:1907.03698 | https://arxiv.org/abs/1907.03698 | 05 [S24] | Ball-tracking approach |
| Cross R. Ball trajectories: factors influencing flight (book chapter; year UNVERIFIED) | https://physics.usyd.edu.au/~cross/TRAJECTORIES/42.%20Ball%20Trajectories.pdf | 05 [S33] | Average flight speed ≈ 0.83 × launch speed (why average speed is not radar speed) |
| Cant O, Kovalchik S, Cross R, Reid M (2020). Validation of ball spin estimates from multi-camera tracking. *J Sports Sci* 38(3) | https://doi.org/10.1080/02640414.2019.1697189 | 05 [S44] | Even Hawk-Eye spin errs by hundreds of rpm (D4: spin always unavailable) |
| Caprioli L et al. (2025). Tennis timing by acoustic detection: pilot study. *J Funct Morphol Kinesiol* 10(1):47 | https://pmc.ncbi.nlm.nih.gov/articles/PMC11843912/ | 05 [S40] | Racket-impact sounds detected 81–96% of the time; audio times contact, not speed |
| Hernández-Belmonte A, Sánchez-Pay A (2021). Validity of a low-cost pocket radar in soccer and tennis. *J Sports Sci* 39(12):1312–1319 | https://doi.org/10.1080/02640414.2020.1868090 | 01 [S46] | A pocket radar is an acceptable validation reference |
| Bilić Z et al. (2023). Concurrent validity of a mobile app for tracking tennis performance. *Appl Sci* 13(10):6195 | https://doi.org/10.3390/app13106195 | 01 [S3]; 05 [S36] | SwingVision serve-speed ICC 0.76–0.80 (5 juniors) |
| Choe J-P et al. (2023/24). How valid is a commercial tennis match-analysis app? *Int J Perf Anal Sport* 24(1):58–73 | https://doi.org/10.1080/24748668.2023.2268475 | 01 [S4]; 05 [S37] | Accuracy drops at sub-optimal camera angles |
| Shorter KA et al. (2025). Fulltrack AI vs radar for cricket delivery speed. *Int J Sports Sci Coach* 20(1):255–263 | https://doi.org/10.1177/17479541241284714 | 01 [S61]; 05 [S38] | Calibrated single-phone speed: good but biased |
| Tissera K et al. (2024). Fulltrack AI line and length vs 3D motion capture. *Sports Biomech* | https://doi.org/10.1080/14763141.2024.2381108 | 01 [S62]; 05 [S39] | Calibrated landing positions ICC > 0.96 |

### 1.5 Statistics and showing uncertainty

Relied on by: DECISIONS D7; METRICS §4; DESIGN (uncertainty display).

| Source | URL | Cited as | Supports |
|---|---|---|---|
| Agresti A, Coull BA (1998). Approximate is better than "exact" for binomial intervals. *Am Stat* 52(2):119–126 | https://doi.org/10.1080/00031305.1998.10480550 | 09 [S69] | Wilson-type intervals on every rate |
| Hopkins WG (2000). Measures of reliability in sports medicine and science. *Sports Med* 30(1):1–15 | https://doi.org/10.2165/00007256-200030010-00001 | 09 [S70] | Typical error and smallest worthwhile change |
| NIST/SEMATECH e-Handbook: chi-square test for the standard deviation; intervals for proportions | https://www.itl.nist.gov/div898/handbook/eda/section3/eda358.htm | 06 [S31][S32] | How many serves a session needs |
| Kay M et al. (2016). User-centred uncertainty visualisation on mobile. CHI | https://doi.org/10.1145/2858036.2858558 | 09 [S63] | Showing ranges on a phone |
| Correll M, Gleicher M (2014). Error bars considered harmful. *IEEE TVCG* 20(12) | https://doi.org/10.1109/TVCG.2014.2346298 | 09 [S66] | Interval bars design |
| Belia S et al. (2005). Researchers misunderstand confidence intervals. *Psychol Methods* 10(4):389–396 | https://doi.org/10.1037/1082-989X.10.4.389 | 09 [S67] | Verdicts in words, not bare intervals |

---

## 2. Coaching interpretation (expert practice, not directly proven)

Relied on by: COACHING (fault → cue → drill library, disagreements, priority rule); DECISIONS D6; PRODUCT §2.3. The gap study `gaps/intuitive-tennis-kovacs-primary-content.md` re-checked what these coaches actually teach in free material and corrected several attributions.

### 2.1 Dr Mark Kovacs and the Kovacs Institute

| Source | URL | Cited as | Supports |
|---|---|---|---|
| The 80/20 principle applied to the tennis serve (Patiño T and the Ki team), Kovacs Academy, 2022 | https://kovacsacademy.com/2022/03/08/the-80-20-principle-applied-to-the-tennis-serve/ | 04 [S14]; gap [A57] | "Probably over 80%" of serve problems start at the toss and loading stages: our earlier-chain-first rule. No dataset published |
| Back leg serving: the most important on-court drill, Kovacs Academy, 2020 | https://kovacsacademy.com/2020/01/24/back-leg-serving-the-most-important-on-court-drill-you-can-do-to-improve-your-serve/ | 04 [S16] | Speed of the back hip's rise matters more than depth |
| Tennis Serve Screen, Kovacs Institute | https://kovacsinstitute.com/servescreen.html | 04 [S21]; gap [A62] | Filming checkpoints; a US$499 human-review price anchor |
| Kovacs M, "The science of your serve" (Tennis Congress talk to competitive adults), 2025 | https://www.youtube.com/watch?v=krKYy4eqgdQ | gap [A46] | Cues for competitive adults; toss height "err lower" |
| About Dr Mark Kovacs | https://kovacsinstitute.com/drmarkkovacs.html | 04 [S13] | Credentials |

### 2.2 Intuitive Tennis (Nikola Aracic)

| Source | URL | Cited as | Supports |
|---|---|---|---|
| The Intuitive Serve (41 lessons), course page | https://www.intuitivetennis.com/products/the-intuitive-serve | 03 [S53]; 04 [S2] | Fundamentals-then-rhythm philosophy (paid lesson content UNVERIFIED) |
| Problems at the Rec Level (video category) | https://www.intuitivetennis.com/problems-at-the-rec-level | 04 [S4] | The richest recreational fault taxonomy found |
| The Passive Leg Drive (YouTube, 2019) | https://www.youtube.com/watch?v=3Tzk6IAH4VQ | 03 [S54]; gap [A10] | Legs react rather than push |
| Fake Pronation (YouTube, 2020) | https://www.youtube.com/watch?v=MyCjfoKddaA | 04 [S11]; gap [A22] | Conscious pronation is late and useless |
| Toss Arm Drop (YouTube, 2019) | https://www.youtube.com/watch?v=g65JysBvGoE | gap [A14] | Never pull the toss arm down consciously |
| How to Fix the Waiter Tennis Serve (YouTube, 2020) | https://www.youtube.com/watch?v=n5_J-eEQjLc | gap [A25] | Waiter's-tray fix |
| Intuitive Tennis membership (home page, pricing) | https://www.intuitivetennis.com/ | 04 [S1]; 08 [S6] | US$19.99 a month, US$199.99 a year (currency assumed) |

Platform terms matter here: YouTube and the course platform license personal viewing only, so the app links out and never embeds, quotes or re-hosts this material (gap [A43][A44]).

### 2.3 Tennis Australia, ITF and Australian skill-acquisition researchers

| Source | URL | Cited as | Supports |
|---|---|---|---|
| Buszard T, Reid M, Farrow D, Masters R (2013). Implicit motor learning: designing practice for performance. *ITF Coaching & Sport Science Review* 21(60):4–7 | https://itfcoachingreview.com/index.php/journal/article/download/448/1220/1831 | 04 [S48] | Errorless practice, one-image analogies, "marginal perception" (practitioner journal, grounded in lab studies) |
| Regan L (2025). A constraints-led approach to coaching the serve. *World Tennis Coaching & Sport Science Review* 33(97):31–35 | https://itfcoachingreview.com/index.php/journal/article/view/319 | 04 [S49] | Always swing at the toss; constraints over part-practice (the author says these are untested) |
| Martin C (2015). Foot-up or foot-back? *ITF Coaching & Sport Science Review* | https://itfcoachingreview.com/index.php/journal/article/view/154 | 03 [S57] | Both stances valid |
| Tennis Australia coaching courses and workshops (returned HTTP 403; current curriculum UNVERIFIED) | https://www.tennis.com.au/clubs-coaches-officials/coaches/courses-workshops | 04 [S77] | Not relied on |
| Tennis Australia, Safeguarding Children Code of Conduct (2023), cl. 11.10 | https://www.tennis.com.au/content/dam/tennisaustralia/documents/policies/safeguarding/safeguarding-children-code-of-conduct.pdf.coredownload.pdf | 06 [S41] | Filming etiquette around juniors |

Reid, Whiteside, Elliott, Girard and colleagues' peer-reviewed work is listed under §1.1.

### 2.4 Online coaches

| Source | URL | Cited as | Supports |
|---|---|---|---|
| Essential Tennis (I. Westermann): toss, tossing-arm myth, leg-drive timing, second-serve spin | https://www.essentialtennis.com/fix-your-serve-toss/ | 04 [S66]–[S71] | Fault explanations; second-serve spin cue ideas |
| Feel Tennis (T. Mencinger): serve technique, waiter's serve, pronation drills | https://www.feeltennis.net/serve-technique/ | 04 [S62]–[S65] | Relaxation; beginner progressions |
| Online Tennis Instruction (F. Meier): serve drills | https://www.onlinetennisinstruction.com/tennisserve/ | 04 [S72] | Drill ideas |

### 2.5 Practitioner heuristics used for product decisions

| Source | URL | Cited as | Supports |
|---|---|---|---|
| Vohra R. How Superhuman built an engine to find product/market fit (Sean Ellis 40% "very disappointed" test), First Round Review | https://review.firstround.com/how-superhuman-built-an-engine-to-find-product-market-fit/ | 08 [S70] | PMF gate thresholds (a startup heuristic, not peer-reviewed). Relied on by MONETISATION §8 |
| Van Westendorp price sensitivity meter; Gabor–Granger method (secondary summaries) | https://en.wikipedia.org/wiki/Van_Westendorp%27s_Price_Sensitivity_Meter ; https://en.wikipedia.org/wiki/Gabor%E2%80%93Granger_method | 08 [S68][S69] | Pricing research before in-app purchase. Relied on by MONETISATION §8, NEXT_STEPS §7 |

---

## 3. Vendor claims and product listings

What companies say about their own products. Prices read from App Store listings are market data; feature and accuracy statements are vendor claims. Relied on by: PRODUCT §2 (positioning); MONETISATION §2, §4; DECISIONS D4 (speed caution).

### 3.1 Tennis competitors

| Source | URL | Cited as | Supports |
|---|---|---|---|
| SwingVision, Australian App Store listing | https://apps.apple.com/au/app/swingvision-tennis-pickleball/id989461317 | 01 [S2]; 08 [S1] | A$149.99–A$499.99 a year; free tier 8 HD hours a month; Australian price complaints |
| SwingVision blog: "The real data behind every NTRP level" (2026) | https://blog.swing.vision/2026/09/01/the-real-data-behind-every-ntrp-level/ | 01 [S7] | First serves in about 53–56% at every level (vendor data, mostly US match play) |
| SwingVision blog: "How to practice tennis alone" (2026) | https://blog.swing.vision/2026/08/19/how-to-practice-tennis-alone-and-actually-improve/ | 01 [S8] | Goal Mode already targets solo serve practice |
| SwingVision review and interview, Tennisnerd (2021) | https://www.tennisnerd.net/tennis-tools/swingvision-review-and-interview/25702 | 01 [S5] | Speed is average ball speed, not radar speed |
| ServeAI | https://serveaiapp.com/en | 01 [S28] | Closest concept (one cue, one drill); no pricing or validation found |
| Toach, TENNIS AI 2.0, NiceShot, TopCourt (Australian App Store listings) | https://apps.apple.com/au/app/toach-ai-tennis-swing-coach/id6774433013 ; https://apps.apple.com/au/app/tennis-ai-2-0/id6738391148 ; https://apps.apple.com/au/app/niceshot-ai-tennis-coach/id6740051429 ; https://apps.apple.com/au/app/topcourt-tennis-pickleball/id1570477197 | 01 [S30]–[S32], [S24]; 08 [S2]–[S5] | Price anchors; unvalidated "AI coach" claims |
| Tennis AI smartphone app (Adelaide, 2020), SA Department for Trade and Investment | https://dti.sa.gov.au/articles/tennis-ai-smartphone-app | 10 [N6] | The only Australian precedent found |
| Pocket Radar Ball Coach product page and Australian retailers | https://www.pocketradar.com/products/ball-coach-radar ; https://cmdsports.com.au/products/pocket-radar-ball-coach | 01 [S43][S45] | Radar for validation (A$489.95–A$499 in Australia) |
| Babolat Play discontinuation notice (quoted on Talk Tennis) | https://tt.tennis-warehouse.com/index.php?threads/babolat-pure-drive-play-racket-app-discontinued-and-rendered-useless.736762/ | 01 [S47] | Server-dependent sensors died: why data durability and export matter |

### 3.2 Adjacent sports and coach tools

| Source | URL | Cited as | Supports |
|---|---|---|---|
| OnForm, Australian App Store listing | https://apps.apple.com/au/app/id1490334045 | 01 [S11]; 08 [S9] | Coaches already pay for video tools, so coach seats are free |
| CoachNow pricing | https://coachnow.com/pricing | 08 [S10] | Coach tool prices |
| HomeCourt, Australian App Store listing | https://apps.apple.com/au/app/homecourt-basketball-training/id1258520424 | 08 [S16] | A$95.99 a year anchor |
| Strava subscribe page and App Store listing | https://www.strava.com/subscribe ; https://apps.apple.com/au/app/strava-run-bike-walk/id426826309 | 08 [S17][S18] | A$14.99 / A$99.99 anchor |
| Fulltrack AI, Australian App Store listing | https://apps.apple.com/au/app/fulltrack-ai/id1568524044 | 08 [S15] | Paywall complaints in reviews |

### 3.3 Technology vendors

| Source | URL | Cited as | Supports |
|---|---|---|---|
| Google, MediaPipe Pose Landmarker guide; BlazePose GHUM 3D model card | https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker ; https://storage.googleapis.com/mediapipe-assets/Model%20Card%20BlazePose%20GHUM%203D.pdf | 05 [S4][S5] | The bundled pose model (`docs/MODELS.md`) |
| Apple, VNDetectHumanBodyPoseRequest and Vision body-pose docs | https://developer.apple.com/documentation/vision/vndetecthumanbodyposerequest | 05 [S1][S2]; 07 [S56]; 08 [S50] | Native pose option; no heel or toe points (IOS_ROUTE) |
| Apple Newsroom, Foundation Models framework "free of cost" (9 June 2025) | https://www.apple.com/newsroom/2025/06/apple-supercharges-its-tools-and-technologies-for-developers/ | 08 [S51] | On-device coaching text option |
| Ultralytics pose docs (YOLO26 speeds) | https://docs.ultralytics.com/tasks/pose/ | 08 [S49] | GPU time per frame in the cloud-cost model |
| Modal, Replicate, RunPod, AWS (Sydney), Cloudflare R2 pricing | https://modal.com/pricing ; https://replicate.com/pricing ; https://www.runpod.io/pricing ; https://b0.p.awsstatic.com/pricing/2.0/meteredUnitMaps/ec2/USD/current/ec2-ondemand-without-sec-sel/Asia%20Pacific%20(Sydney)/Linux/index.json ; https://developers.cloudflare.com/r2/pricing/ | 08 [S52]–[S59], [S74] | Cloud cost per analysis (MONETISATION §4) |
| Anthropic pricing and vision docs; Google Gemini pricing | https://platform.claude.com/docs/en/about-claude/pricing ; https://platform.claude.com/docs/en/build-with-claude/vision ; https://ai.google.dev/gemini-api/docs/pricing | 08 [S60]–[S62] | Hybrid coaching-text cost (not built) |
| Apple Ads (60%+ conversion claim) | https://ads.apple.com/app-store | 08 [S66] | Capped Apple Ads test |

---

## 4. Market data

### 4.1 Australian participation and competition

Relied on by: DECISIONS D11; research 10 segment decision; PRODUCT §1; MONETISATION §7, §10; LAUNCH_AU §1, §7.

| Source | URL | Cited as | Supports |
|---|---|---|---|
| Australian Sports Commission, AusPlay tennis (2025) | https://www.ausport.gov.au/clearinghouse/research/archive/tennis | 02 [S1]; 08 [S39] | 1.118M Australians 15+ played tennis in 2025 |
| AusPlay National Participation Report (Nov 2022) | https://www.playaustralia.org.au/sites/default/files/LibraryDownloads/AusPlay-National-Sport-and-Physical-Activity-Participation-Report-November-2022.pdf | 02 [S4] | 437,000 players aged 35–54 |
| Tennis Australia Annual Report 2023–24 | https://www.tennis.com.au/content/dam/tennisaustralia/documents/reports/annual-reports/tennis-australia-annual-report-2023-2024.pdf.coredownload.pdf | 02 [S7]; 08 [S33] | 2,329 affiliated venues; AO StartUps |
| Tennis ACT Annual Report 2024–25 (with TA CEO report) | https://www.tennis.com.au/content/dam/tennisaustralia/ma/act/documents/tennis-act-annual-report-2024-2025.pdf | 02 [S8]; 08 [S32] | 3,766 TA coach members; 100,000+ rated players; 499 ACT adult teams |
| Tennis Victoria Annual Report 2022–23 | https://www.tennis.com.au/vic/files/2023/10/Tennis-Victoria-Annual-Report-2022-23-1.pdf | 10 [N1] | Pennant 3,808 players, 388 teams; retention about 60% season to season |
| The First Serve: Victorian Pennant State Grade Final (2025) | https://www.thefirstserve.com.au/post/i-woke-up-feeling-extra-nervous-victorian-pennant-state-grade-final | 02 [S13]; 08 [S37] | 419 teams, 135 clubs in 2025 |
| TROLS and NENTG | https://trols.org.au/ ; https://trols.org.au/nentg/index.php | 10 [N4][N5] | 12 Melbourne associations; spring 2026 season began 3 August |
| WDTA night tennis (Whites Lane Mulgrave TC) | https://play.tennis.com.au/whiteslanemulgravetennisclub/Competitions/WDTANight | 10 [N3] | Weeknight comps; light money A$8 a week |
| Tennis Victoria 2026 Pennant rules and FAQs (search excerpts only; UNVERIFIED) | https://www.tennis.com.au/vic/doc/2026-pennant-rules | 10 [N7] | UTR playing order |
| Australasian Leisure Management: one million court-hire hours (2024); SportLogic 2.37M hours (2025) | https://www.ausleisure.com.au/news/rising-participation-sees-australian-tennis-reach-one-million-hours-of-court-hire/ ; https://www.ausleisure.com.au/news/sportlogic-data-powers-two-million-hours-of-tennis-court-bookings/ | 02 [S36][S37]; 08 [S34][S35] | Court-booking reach for QR codes |
| Facebook hitting-partner groups (Sydney 17.4K, Melbourne 13.6K, Brisbane 5.2K members) | https://www.facebook.com/groups/1542039909193398/ | 02 [S43]–[S45]; 08 [S36] | Beta recruitment channel |
| Tennis Australia, Tennis Infrastructure Planning resource (2018) | https://www.tennis.com.au/wp-content/uploads/2013/04/TA-National-Tennis-Facility-Planning-and-Development-Guide.pdf | 02 [S41] | 250–350 lux courts (night capture) |

### 4.2 Coaching and court prices (sampled September 2026)

Relied on by: MONETISATION §2; research 10 §4.2.

| Source | URL | Cited as |
|---|---|---|
| Camperdown Tennis lesson pricing (Sydney) | https://www.camperdowntennis.com.au/lessonpricing | 08 [S23] |
| Victorian Tennis Academy private lessons (Melbourne) | https://victennisacademy.com.au/private-lessons/ | 08 [S24] |
| Toptenn private coaching (Melbourne) | https://www.toptenn.com.au/private-tennis-coaching | 08 [S25] |
| City Community Tennis (Sydney); Active Tennis Coaching (Canberra); Tennis Approach (Perth) | https://www.citycommunitytennis.com.au/adult-coaching/private-tuition ; https://www.activetenniscoaching.com.au/private-lessons ; https://tennisapproach.com.au/adults.html | 08 [S26]–[S28] |
| Tennis World court hire, Melbourne | https://www.tennisworld.net.au/locations/melbourne/court-hire/ | 08 [S29] |

### 4.3 Subscription, retention and acquisition benchmarks

Relied on by: MONETISATION §3, §8, §9, §10; PRODUCT §9.2.

| Source | URL | Cited as | Supports |
|---|---|---|---|
| RevenueCat, State of Subscription Apps 2026 | https://www.revenuecat.com/state-of-subscription-apps/ | 08 [S63] | Health & Fitness medians: 2.9% download-to-paid, 37.7% trial-to-paid, 24.6% first annual renewal; APAC 2.4% and 31.9%; AI apps churn 30% faster |
| RevenueCat, State of Subscription Apps 2025 | https://www.revenuecat.com/state-of-subscription-apps-2025/ | 08 [S64] | Refund rate 4.71% (the 44.1% annual retention figure is not comparable with 2026) |
| UXCam retention benchmarks (secondary compilation) | https://uxcam.com/blog/mobile-app-retention-benchmarks/ | 08 [S65] | D1/D7/D30 benchmarks |
| SplitMetrics Apple Search Ads benchmarks 2020 (**outdated**) | https://splitmetrics.com/blog/apple-search-ads-benchmarks/ | 08 [S67] | Why the Apple Ads test is needed |
| Reserve Bank of Australia exchange rates (25 September 2026) | https://www.rba.gov.au/statistics/frequency/exchange-rates.html | 01 [S67]; 08 [S40] | A$1.4247 per US$1 |
| Stripe Australia pricing and October 2026 changes | https://stripe.com/au/pricing ; https://support.stripe.com/questions/updates-to-card-pricing-in-australia-from-october-2026 | 08 [S48][S73] | Web sales for club seats (later) |
| OAIC, Australian Community Attitudes to Privacy Survey 2026 | https://www.oaic.gov.au/news/media-centre/australians-more-concerned-about-privacy-as-trust-in-ai-languishes,-survey-finds | 07 [S18] | 87% more concerned about privacy; on-device is a selling point |

---

## 5. Regulation and platform rules

Relied on by: LAUNCH_AU (throughout); PRODUCT §11; ARCHITECTURE §9, §15; DECISIONS D8, D9; IOS_ROUTE. **This is not legal advice; LAUNCH_AU marks where advice is needed.**

### 5.1 Australian privacy law

| Source | URL | Cited as | Supports |
|---|---|---|---|
| *Privacy Act 1988* (Cth), Compilation No. 104 (4 June 2026) | https://www.legislation.gov.au/C2004A03712/latest/text | 07 [S2] | APPs; small-business exemption and the health-service exception (s 6D(4)(b), s 6FB) |
| *Privacy and Other Legislation Amendment Act 2024* (Cth) | https://www.legislation.gov.au/C2024A00128/asmade/text | 07 [S1] | Penalties; statutory tort (10 June 2025); ADM transparency APP 1.7–1.9 (10 December 2026); Children's Code framework |
| OAIC, Children's Online Privacy Code page and exposure-draft explanatory statement | https://www.oaic.gov.au/privacy/privacy-registers/privacy-codes/childrens-online-privacy-code ; https://www.oaic.gov.au/__data/assets/pdf_file/0019/262630/Draft-Explanatory-Statement-Exposure-Draft-Childrens-Online-Privacy-Code.pdf | 07 [S3][S4] | Registration by 10 December 2026; commencement not set; draft obligations |
| Attorney-General's Department, privacy reform exposure draft (2026) | https://consultations.ag.gov.au/rights-and-protections/privacy-reform/ | 07 [S7]–[S9] | Proposed "fair and reasonable" test and 72-hour breach statement (not law) |
| OAIC APP guidelines, Chapter B (key concepts) and Chapter 8 (cross-border) | https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines/chapter-b-key-concepts ; https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines/chapter-8-app-8-cross-border-disclosure-of-personal-information | 07 [S10][S13] | Video as personal information; consent age; APP 8 |
| OAIC, small business and guide to health privacy | https://www.oaic.gov.au/privacy/privacy-guidance-for-organisations-and-government-agencies/organisations/small-business ; https://www.oaic.gov.au/privacy/privacy-guidance-for-organisations-and-government-agencies/health-service-providers/guide-to-health-privacy/introduction-and-key-concepts | 07 [S11][S12] | Gyms are named as health service providers |
| OAIC, Notifiable Data Breaches scheme | https://www.oaic.gov.au/privacy/notifiable-data-breaches/about-the-notifiable-data-breaches-scheme | 07 [S14] | 30-day assessment; notify as soon as practicable |
| OAIC guidance on commercially available AI, and on training generative AI | https://www.oaic.gov.au/privacy/privacy-guidance-for-organisations-and-government-agencies/guidance-on-privacy-and-the-use-of-commercially-available-ai-products | 07 [S15][S16] | Rules for any future cloud AI |
| OAIC, tracking-pixel determinations (June 2026) | https://www.oaic.gov.au/news/media-centre/privacy-commissioner-finds-privacy-breaches-in-third-party-tracking-pixel-investigation | 07 [S17] | No ad or tracking SDKs |
| ALRC Report 123, Chapter 14 Surveillance devices (2014; may be outdated) | https://www.alrc.gov.au/wp-content/uploads/2019/08/fr123_14._surveillance_devices.pdf | 07 [S21] | Audio off by default |

### 5.2 Consumer law, marketing and therapeutic goods

| Source | URL | Cited as | Supports |
|---|---|---|---|
| Treasury, unfair trading practices exposure draft and explanatory materials (2026) | https://consult.treasury.gov.au/c2026-739506 | 07 [S22][S23] | Proposed subscription rules from 1 July 2027: trial-end notices, reminders, easy cancellation |
| ACCC v Microsoft media release (27 October 2025) | https://www.accc.gov.au/media-release/microsoft-in-court-for-allegedly-misleading-millions-of-australians-over-microsoft-365-subscriptions | 07 [S26] | Subscription dark-pattern enforcement |
| *Competition and Consumer Act 2010*, Schedule 2 (ACL) ss 18, 29 | https://www.legislation.gov.au/C2004A00109/latest/text | gap [A76] | No misleading accuracy or endorsement claims |
| ACMA, avoid sending spam | https://www.acma.gov.au/avoid-sending-spam | 07 [S27] | Marketing email consent and unsubscribe |
| TGA, general health or wellness software exclusion (16 March 2026) | https://www.tga.gov.au/resources/guidance/understanding-general-health-or-wellness-software-exclusion | 07 [S29] | Stay a wellness tool: no diagnosis or treatment claims |
| eSafety, social media minimum age | https://www.esafety.gov.au/about-us/industry-regulation/social-media-age-restrictions | 07 [S28] | No feed, so outside the under-16 rules |

### 5.3 Apple rules and program documentation

| Source | URL | Cited as | Supports |
|---|---|---|---|
| App Review Guidelines (last updated 8 June 2026) | https://developer.apple.com/app-store/review/guidelines/ | 07 [S30]; 08 [S45] | 1.4.1, 2.5.2, 2.5.14, 3.1.1, 3.1.2, 4.2, 5.1.1, 5.1.2(i), 5.1.3 |
| Apple Developer News: third-party AI rule (13 Nov 2025); upcoming requirements; age rating changes | https://developer.apple.com/news/?id=ey6d8onl ; https://developer.apple.com/news/upcoming-requirements/ ; https://developer.apple.com/news/?id=yrrb45pw | 07 [S31][S33][S35] | 5.1.2(i); SDK deadlines (iOS 27 SDK from April 2027); Australian age tiers |
| Age ratings values and definitions | https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions | 07 [S37] | 9+ target |
| App privacy details; privacy manifest files; required-reason APIs | https://developer.apple.com/app-store/app-privacy-details/ ; https://developer.apple.com/documentation/bundleresources/privacy-manifest-files ; https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api | 07 [S38]–[S40] | "Data Not Collected"; `PrivacyInfo.xcprivacy` |
| Purpose strings (camera, microphone, photo library) and PHPicker | https://developer.apple.com/documentation/bundleresources/information-property-list/nscamerausagedescription ; https://developer.apple.com/documentation/photosui/phpickerviewcontroller | 07 [S41] | Info.plist strings in `app/ios` |
| Offering account deletion in your app | https://developer.apple.com/support/offering-account-deletion-in-your-app/ | 07 [S42] | 5.1.1(v) when accounts exist |
| Small Business Program; auto-renewable subscriptions | https://developer.apple.com/app-store/small-business-program/ ; https://developer.apple.com/app-store/subscriptions/ | 07 [S44][S45]; 08 [S41][S42] | 15% commission; offer codes; trial rules |
| Apple Developer Program License Agreement, Schedule 2 and Exhibit C | https://developer.apple.com/support/terms/apple-developer-program-license-agreement/ | 07 [S46] | ABN and GST requirement; subscription disclosures |
| StoreKit External Purchase (no Australian entitlement) | https://developer.apple.com/documentation/storekit/external-purchase | 07 [S47] | In-app purchase only in Australia |
| Enrolment and D-U-N-S | https://developer.apple.com/programs/enroll/ ; https://developer.apple.com/help/account/membership/D-U-N-S | 07 [S48][S49] | Organisation enrolment steps |
| Regulated medical device apps update (26 March 2026) | https://developer.apple.com/news/?id=nyqbfz1y | 07 [S50] | Sports category, not Health & Fitness |
| The Guardian, *Epic v Apple* in the Federal Court (12 August 2025) | https://www.theguardian.com/australia-news/2025/aug/12/fortnite-developer-epic-games-wins-australian-federal-court-apple-google | 07 [S51] | Payment rules unchanged in practice |
| Apple, monthly subscriptions with a 12-month commitment (27 April 2026) | https://developer.apple.com/news/?id=agq42lxe | 07 [S52] | Avoid at launch |

### 5.4 Tax and payments

| Source | URL | Cited as | Supports |
|---|---|---|---|
| ATO, GST on imported services and digital products | https://www.ato.gov.au/businesses-and-organisations/international-tax-for-business/gst-for-non-resident-businesses/gst-on-imported-services-and-digital-products | 08 [S46] | GST on app sales; accountant advice still needed for a resident developer |
| App Store Connect Help: subscription pricing; receiving payments | https://developer.apple.com/help/app-store-connect/manage-subscriptions/manage-pricing-for-auto-renewable-subscriptions ; https://developer.apple.com/help/app-store-connect/getting-paid/overview-of-receiving-payments | 08 [S43][S44] | Proceeds after tax; 45-day payment |
| RevenueCat pricing | https://www.revenuecat.com/pricing/ | 08 [S47] | Free to US$2,500 monthly tracked revenue |

---

## 6. Engineering documentation

Relied on by: ARCHITECTURE §15; CAPTURE §9–§10; IOS_ROUTE; LIMITATIONS §3.

| Source | URL | Cited as | Supports |
|---|---|---|---|
| Can I use: WebCodecs; MDN compat data for VideoDecoder, AudioDecoder, requestVideoFrameCallback | https://caniuse.com/webcodecs ; https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/VideoDecoder.json | 05 [S62]–[S65] | Safari 26 for full WebCodecs; iOS 26.0 deployment target |
| AVFoundation: custom exposure, frame-rate ranges, intrinsics, stabilisation; `ProcessInfo.thermalState` | https://developer.apple.com/documentation/avfoundation/avcapturedevice/setexposuremodecustom(duration:iso:completionhandler:) ; https://developer.apple.com/documentation/avfoundation/avcapturedevice/format/videosupportedframerateranges ; https://developer.apple.com/documentation/foundation/processinfo/thermalstate-swift.property | 05 [S59]–[S61]; 06 [S16]–[S23] | Native capture plugin design |
| Photos: high-frame-rate subtype, original versions, PHPicker representation mode | https://developer.apple.com/documentation/photos/phassetmediasubtype/videohighframerate ; https://developer.apple.com/documentation/photosui/phpickerconfigurationassetrepresentationmode | 05 [S53]–[S57] | Importing slow-motion originals |
| Capacitor, "Updating to 8.0" (Xcode 26+, Node 22+, SPM by default); `@capacitor/ios` 8.5.2 source in `app/node_modules` | https://capacitorjs.com/docs/updating/8-0 | ARCHITECTURE [A2][A3] | SPM template; WKWebView permission and range handling (IOS_ROUTE) |
| WebKit, "Updates to Storage Policy" (origin quotas, eviction, `persist()`) | https://webkit.org/blog/14403/updates-to-storage-policy/ | ARCHITECTURE [A1] | Storage limits in the web app and WKWebView |
| WebCodecs Fundamentals, HEVC support matrix (third-party measurement) | https://webcodecsfundamentals.org/codecs/hevc.html | ARCHITECTURE [A4] | Some iPhone HEVC files may not decode in WebCodecs |
| Mains electricity by country; flicker (secondary) | https://en.wikipedia.org/wiki/Mains_electricity_by_country | 05 [S66]; 06 [S36] | 50 Hz mains, 100 Hz flicker under court lights |

---

## 7. Internal evidence

These are our own files, not outside sources. They are listed so claims can be traced.

| File | What it is |
|---|---|
| `validation/results/metrics/SUMMARY.md`; `app/src/analysis/metrics/validation-summary.json` | Metric accuracy on 122 synthetic clips (the basis of every status in FUNCTIONAL_STATUS) |
| `validation/results/smoke/SUMMARY.md` | Pipeline smoke run on 65 clips, including the privacy probe |
| `validation/results/ui/integrated/report.json` and screenshots | End-to-end flows in headless Edge |
| `validation/synthetic/manifest.json`; `tools/synth/README.md` | The synthetic corpus and how it is generated |
| `docs/research/gaps/*.md` | Gap studies: segment evidence, recreational reference ranges, side-view geometry, Intuitive Tennis and Kovacs primary content |
