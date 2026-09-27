# DESIGN.md: Serve Coach visual system (v1)

**Status:** v1 specification, 27 September 2026 (revised the same day for the revised D1, D4, D5 and new D11; see the revision log at the end). **Owner:** product design.
**Scope:** the visual and interaction source of truth for the phone-first PWA in `app/` and its Capacitor iOS shell. It covers the design direction, tokens (colour, type, space, shape, elevation, motion), the honesty system (data states, verdicts and evidence tiers), components, charts, video overlays, the screen layouts at 390 × 844 (and the camera screens at 844 × 390 for the landscape set-up), copy tone, accessibility and Tailwind v4 / React implementation.
**Authority:** this file overrides the generic `design-taste-frontend` skill wherever they conflict (user instruction). It follows `docs/DECISIONS.md` (D1–D11, D1/D4/D5 as revised on 27 Sep 2026) and the launch segment in D11 and `docs/research/10-segment-decision.md`. Numbers for framing, bands and plausibility come from `docs/research/gaps/side-view-geometry-contradictions.md` ("gap geometry") and `docs/research/gaps/recreational-reference-ranges.md` ("gap ranges"). Where it narrows or questions another spec it says so in §15.
**Read with:** `docs/specs/METRICS.md` + `metrics.json` (metric ids, names, rounding, statuses, reason codes, verdict rules), `docs/specs/COACHING.md` + `coaching-library.json` (focus content, overlays, pain screen copy), `docs/specs/CAPTURE.md` (setup copy, framing checks, court diagrams), `docs/specs/ARCHITECTURE.md` (module map, data types, storage and deletion flows), `docs/PRODUCT.md`.

**Tags.** [Established] = platform standard or peer-reviewed finding. [Coaching interpretation] = expert practice. [Our inference] = our design reasoning. Research is cited as (research NN [Sx]). Contrast ratios in this file were computed with the WCAG 2.x relative-luminance formula; palette checks were run with the dataviz skill's `validate_palette.js` (OKLab ΔE ×100, Machado 2009 CVD simulation). Both scripts are reproducible from the hex values given here.

**Metric ids** are the canonical shared ids (METRICS.md, `metrics.json`, ARCHITECTURE `MetricId`):
- toss: `toss-apex-height`, `toss-forward`, `toss-drop`, `toss-height-spread`, `toss-forward-spread` (rear view: `toss-lateral`, `toss-lateral-spread`);
- contact and timing: `contact-height-ratio`, `contact-forward`, `rhythm-release-to-contact`, `rhythm-spread`, `trophy-pause`;
- legs (side view): `leg-drive` (hip rise from the lowest point to contact, % of height), `drive-time`, `loading-depth` (descriptive hip drop, never a "bend more" instruction), `deep-bend-flag` (experimental);
- posture bands: `shoulder-tilt-trophy` (side view, player-relative band); `knee-bend-band` and `shoulder-over-shoulder-contact` (**rear view only**; the second is experimental);
- `landing-distance`, `repeatability`;
- outcomes: `serve-in-rate`, `first-serve-in-rate`, `double-faults`, `placement-zone`, `serve-type-mix`;
- speed and spin: `speed-experimental` (side view, ≥ 120 fps, target tag), `speed-average-rear` (rear view, experimental), `speed-radar-entered`, `spin` (always unavailable);
- `serve-count`, `capture-quality`, plus METRICS additions such as `second-serve-in-rate`, `contact-height-spread` and `retoss-count`.

`trunk-tilt-band` is **removed** (replaced by `shoulder-tilt-trophy`), and `knee-bend-band` never appears in a side-view layout. Player-facing names come from `metrics.json`, never from this file.

---

## 0. Design read and dials

**Reading this as:** a phone-first, evidence-first sports-analysis app for **comp-night regulars** (D11: adults of about 30–55, UTR about 3–7, who play weekly night comp or pennant, starting in metro Melbourne; closed beta 18 and over; secondary: solo court-bookers), used court-side in bright Australian sun and at home in the evening, with a calm, instrument-like language, leaning toward Tailwind v4 CSS-variable tokens, one athletic grotesk (Archivo, variable width), Phosphor icons in one weight and hand-built SVG charts.

| Dial | Value | Why |
|---|---|---|
| `DESIGN_VARIANCE` | 3 | A tool people open weekly under time pressure. Predictable, symmetrical layouts; the data and the player's own video carry the interest. |
| `MOTION_INTENSITY` | 3 | Calm Technology asks for the smallest possible amount of attention (research 09 [S81]). Motion only for feedback and state change; nothing loops except live recording state. |
| `VISUAL_DENSITY` | 5 | Denser than a landing page (stats, charts, per-serve marks) but one primary chart per card and one decision per screen (research 09 §5). |

**What this file replaces in the taste skill** (it is aimed at landing pages): hero, eyebrow, bento, logo-wall, marquee and stock-image rules do not apply. The app's imagery is the player's own video, key frames and diagrams. Adopted from the skill: the anti-default discipline (no AI-purple, no Inter + slate, no glow, no gradient text), one accent, the colour and shape consistency locks, button and form contrast checks, full state cycles (empty, loading, error), `prefers-reduced-motion`, dual theme from day one, no pure `#000`/`#fff` in the standard themes, no emoji, no em dashes in UI copy, and a pre-flight check (§14).

**Direction: "Chalk and Optic".** Cool chalk-white and graphite neutrals with a faint court-green tint (the colour of painted lines on an acrylic court, not warm paper), one optic ball-yellow accent used as a fill for "the one thing to do now", and an Okabe–Ito-derived blue and vermillion for data meaning. Typography is Archivo, a grotesk built for high-performance print and screen use, with numbers set slightly wide like a scoreboard. The premium feel comes from restraint: generous spacing, hairlines instead of boxes where possible, exact numbers only where they are earned, and an honest label on everything.

---

## 1. Design principles

1. **One decision per screen.** Every screen answers one question and has at most one primary (optic) button. The session report leads with one sentence and one focus, not a grid of tiles (research 09 §0 item 1, [S1][S4]; D6).
2. **Show the evidence, then the number.** Observations open on the player's own key frame with the overlay that proves them; statistics sit beside the serve marks they came from. Every serve is a dot the player can tap (research 09 [S63][S64]).
3. **Honest by construction.** No number renders without its data state (measured, estimated, player-entered, experimental, unavailable), its n, and an interval where it matters (D2, D7). Unavailable is a normal, explained outcome with a reason and an unlock path, never a blank or a guess. Uncertainty is stated in words first ("Likely better"), then numbers.
4. **Readable at arm's length in full sun.** Court-side screens assume glare, sweat and a phone about 6–10 m from the player (upright beside the court by default, or sideways at the fence; D1): big targets (44 pt minimum, 64+ pt for tagging and record controls), heavy luminance contrast, one-word distance states, and a court-side contrast mode that switches on automatically for recording (research 09 §10).
5. **Calm, never gamified.** No streaks, confetti, badges, scores out of 100, red/green deltas or celebratory motion. Rest and missed weeks are normal. Encouraging, specific and plain (research 09 [S27][S30][S81]; §11).
6. **Colour is a second channel.** Meaning is carried by position, shape, glyph and words; colour reinforces it. The data palette is validated for colour-vision deficiency, and every chart has a text summary and a table view (research 09 [S74][S76][S77]).
7. **The player owns the footage.** Storage state, retention dates and delete controls are visible where video appears, not buried in settings (D8).

---

## 2. Colour

### 2.1 Roles

| Role | What it does | Where it may appear | Where it may not |
|---|---|---|---|
| **Neutrals** (chalk and graphite) | Surfaces, text, lines | Everywhere | — |
| **Optic** (the one accent) | Marks "the one thing to do now": primary button, selected tab, Ready state, the focus marker, the current-serve skeleton on video | Fills with ink on top; in dark mode also glyphs and focus rings | Text or thin lines on light surfaces (1.2:1); chart data marks on light surfaces; decoration |
| **Signal** (blue, vermillion, neutral grey) | Data meaning with a direction: in / fault, better / worse, this session vs context | Chart marks, glyphs in chips, video-free diagrams | Body text (text stays ink, §2.6), buttons, backgrounds larger than a chip |
| **Categorical** (3 slots) | Identity of series that have no good/bad meaning | Charts only | Anywhere a signal colour is already on screen in the same chart |
| **Critical** | Pain referral and irreversible deletion only | Referral cards, "Call 000", delete confirmations | Anything else. It is not a "bad result" colour |
| **Video overlay** | Drawing on top of footage | Video player and key frames | UI chrome |

### 2.2 Core tokens

Three token sets: **Day** (light), **Night** (dark) and **Court-side** (high contrast, light-based; §2.4). Token names are CSS custom properties; §13 maps them to Tailwind.

| Token | Day | Night | Court-side | Use |
|---|---|---|---|---|
| `--bg` | `#F1F3EF` | `#0B0F0D` | `#FCFDFB` | Page background |
| `--surface` | `#FAFBF8` | `#141916` | `#FCFDFB` | Cards, sheets, tab bar, chart surface |
| `--surface-2` | `#E6EAE4` | `#1C221E` | `#EEF1EC` | Grouped rows, chip fills, segmented tracks, skeletons |
| `--surface-inverse` | `#1A201C` | `#EBEFE9` | `#060907` | Toasts, video control pills |
| `--ink-inverse` | `#F1F3EF` | `#121714` | `#FCFDFB` | Text on `--surface-inverse` |
| `--line` | `#D3D9D1` | `#29312C` | `#5B655D` (2 px) | Hairline dividers (decorative) |
| `--line-strong` | `#7D887F` | `#66716A` | `#3A423C` | Control borders, chart baselines, input outlines (≥ 3:1) |
| `--ink` | `#121714` | `#EBEFE9` | `#060907` | Primary text, values, icons |
| `--ink-2` | `#3C453F` | `#B5BEB6` | `#1D2520` | Secondary text, units, labels |
| `--ink-3` | `#58625A` | `#8D978F` | `#2F3832` | Tertiary text, captions, axis labels |
| `--ink-disabled` | `#8F9890` | `#5D665F` | `#6B746C` | Disabled labels only (exempt from contrast minimums) |
| `--optic` | `#D4EE48` | `#D4EE48` | `#D4EE48` | Accent fill |
| `--optic-press` | `#C4DE36` | `#C4DE36` | `#C4DE36` | Pressed accent fill |
| `--on-optic` | `#121714` | `#121714` | `#060907` | Text and icons on optic |
| `--optic-edge` | `#6F7F12` | `#D4EE48` | `#060907` | 1 px edge on optic fills in Day (2 px in Court-side) so the shape survives glare and CVD |
| `--focus` | `#121714` | `#D4EE48` | `#060907` | 2 px focus ring, 2 px offset |
| `--good` | `#0072B2` | `#3D9DE0` | `#0072B2` | Signal: in, better, "this session" emphasis |
| `--good-soft` | `#E1EDF4` | `#14293A` | `#E1EDF4` | Chip fill behind a good glyph |
| `--bad` | `#D55E00` | `#DB6B2E` | `#B04A00` | Signal: fault, worse |
| `--bad-soft` | `#F7E7DC` | `#3A2317` | `#F7E7DC` | Chip fill behind a bad glyph |
| `--neutral` | `#7F8981` | `#6C766E` | `#5B655D` | Signal: untagged, before, baseline, "about the same" |
| `--band` | `#DCE2DA` | `#252C27` | `#D5DBD3` under a 45° hatch (§2.4) | Typical-range bands, "about the same" zones |
| `--attention` | `#9A5A00` | `#E0A040` | `#7A4600` | Glyph for capture Fair / Limited and "needs a change" |
| `--critical` | `#A3261E` | `#FF8A7A` | `#8F1F18` | Pain referral, destructive text |
| `--critical-soft` | `#F6E1DE` | `#3D1C19` | `#F6E1DE` | Referral card fill |
| `--on-critical` | `#FAFBF8` | `#121714` | `#FCFDFB` | Label on a critical fill (Call 000, final delete) |
| `--scrim` | `rgb(10 14 12 / 0.45)` | `rgb(0 0 0 / 0.6)` | `rgb(6 9 7 / 0.6)` | Behind sheets |

The Day neutrals are cool with a faint green tint, deliberately outside the warm cream/beige family the taste skill bans. `--bg` and `--surface` differ by about 3% luminance: cards read as a quiet lift, and a 1 px `--line` edge carries the separation in Day.

### 2.3 Contrast of text and UI pairs (computed)

WCAG targets: text 4.5:1 below 18 pt regular / 14 pt bold, 3:1 above; graphics and control boundaries 3:1 (research 09 [S5][S77]). Every text pair passes AA; primary and secondary text pass AAA (7:1) in all three sets.

| Pair | Day | Night | Court-side | Requirement |
|---|---|---|---|---|
| `--ink` on `--bg` | 16.2 | 16.6 | 19.6 | text 4.5 |
| `--ink` on `--surface` | 17.5 | 15.3 | 19.6 | text 4.5 |
| `--ink` on `--surface-2` | 14.9 | 13.9 | 17.6 | text 4.5 |
| `--ink-2` on `--bg` | 8.9 | 10.1 | 15.4 | text 4.5 |
| `--ink-2` on `--surface` | 9.6 | 9.3 | 15.4 | text 4.5 |
| `--ink-2` on `--surface-2` | 8.2 | 8.5 | 13.8 | text 4.5 |
| `--ink-3` on `--bg` | 5.7 | 6.4 | 11.9 | text 4.5 |
| `--ink-3` on `--surface` | 6.1 | 5.9 | 11.9 | text 4.5 |
| `--ink-3` on `--surface-2` | 5.2 | 5.4 | 10.6 | text 4.5 |
| `--ink-inverse` on `--surface-inverse` | 14.8 | 15.6 | 19.6 | text 4.5 |
| `--on-optic` on `--optic` | 13.9 | 13.9 | 15.4 | text 4.5 |
| `--on-optic` on `--optic-press` | 12.0 | 12.0 | 13.2 | text 4.5 |
| `--optic` fill vs `--bg` | 1.2 | 14.8 | 1.3 | none (the edge carries the boundary) |
| `--optic-edge` vs `--surface` | 4.3 | 13.7 | 19.6 | boundary 3 |
| `--line-strong` vs `--surface` | 3.5 | 3.5 | 10.2 | boundary 3 |
| `--line-strong` vs `--bg` | 3.3 | 3.8 | 10.2 | boundary 3 |
| `--line` vs `--surface` | 1.4 | 1.3 | 5.9 | decorative only in Day/Night |
| `--focus` vs `--surface` | 17.5 | 13.7 | 19.6 | 3 |
| `--ink` on `--good-soft` | 15.2 | 12.8 | 16.8 | text 4.5 |
| `--good` glyph on `--good-soft` | 4.4 | 5.0 | 4.4 | graphic 3 |
| `--good` mark on `--surface` | 5.0 | 6.0 | 5.1 | graphic 3 |
| `--ink` on `--bad-soft` | 15.0 | 12.6 | 16.6 | text 4.5 |
| `--bad` glyph on `--bad-soft` | 3.2 | 4.3 | 4.6 | graphic 3 |
| `--bad` mark on `--surface` | 3.7 | 5.2 | 5.4 | graphic 3 |
| `--neutral` mark on `--surface` | 3.5 | 3.8 | 5.9 | graphic 3 |
| `--attention` glyph on `--surface` | 5.3 | 7.9 | 7.6 | graphic 3 |
| `--critical` text on `--surface` | 7.1 | 7.8 | 8.7 | text 4.5 |
| `--critical` text on `--critical-soft` | 5.9 | 6.7 | 7.0 | text 4.5 |
| `--ink` on `--critical-soft` | 14.5 | 13.1 | 15.9 | text 4.5 |
| `--on-critical` on `--critical` fill (Call 000 button) | 7.1 (`#FAFBF8`) | 7.9 (ink `#121714`) | 8.7 (`#FCFDFB`) | text 4.5 |

`--band` (1.2–1.4:1 vs surface) is a background region, not information-bearing on its own; its edge value is always also stated in text ("usual 12 to 15 cm").

### 2.4 Court-side contrast mode (sun-readable)

Research 09 §10 asks for a high-contrast court-side appearance for recording screens, tested in Australian midday sun. Dark themes lose badly to reflections outdoors, and saturated tints wash out, so the mode is light-based and luminance-only.

**When it is on**
- Automatically on every live camera screen (set-up choice, live framing, serving-spot states, countdown, recording, tally), in either orientation, whatever the theme, unless the player turns "Court-side contrast" to **Off** in Profile → Appearance.
- Everywhere when the player picks **Always**, or when `prefers-contrast: more` is set and the player has not chosen otherwise.
- The recording screen itself is black (OLED power and heat, CAPTURE §9.9) with Court-side type rules applied to its few elements.

**What changes** (beyond the token values in §2.2)
- No translucency or blur anywhere; every surface is opaque.
- All borders 2 px; `--line` becomes a visible 2 px `#5B655D` divider.
- Text: minimum rendered size 15 px (footnote and caption styles step up), weights +100 (400 → 500, 600 → 700). `--ink-3` is nearly as dark as `--ink-2`; hierarchy comes from size and weight, not grey.
- Optic fills get a 2 px ink edge. Selected states use ink fill with `--ink-inverse` text instead of optic where the element is smaller than 44 × 32.
- Chart marks grow 25% (r 4 → 5), lines 2 → 3 px, and the typical-range band is drawn as a 45° hatch (1.5 px `--line-strong` strokes, 6 px pitch) instead of a flat tint, so it survives glare. This is the dataviz skill's texture channel, triggered by an accessibility setting.
- Icons 24 → 28 px.
- A one-time tip on the setup screen: "Turn your screen brightness up. We can't do it for you from the browser." (Web pages cannot set brightness, CAPTURE §9.9.)

### 2.5 Data colour jobs

v1 needs four colour jobs. Status and signal colours never double as categorical slots, and no chart mixes signal and categorical colour (dataviz skill: "never both in one chart").

**a. Signal (fixed meaning).**

| Signal | Day | Night | Meaning |
|---|---|---|---|
| `--good` | `#0072B2` (Okabe–Ito blue) | `#3D9DE0` | Serve in; verdict better; "this session / after" emphasis |
| `--bad` | `#D55E00` (Okabe–Ito vermillion) | `#DB6B2E` | Fault (net, long, wide); verdict worse |
| `--neutral` | `#7F8981` | `#6C766E` | Untagged serve; "before" or baseline; about the same |

Validated pair (all pairs, as scatter and maps need): Day worst CVD ΔE 21.9 (protan), normal-vision ΔE 31.2; Night CVD 24.4, normal 28.9; Court-side (`#0072B2` / `#B04A00`) CVD 22.4, normal 27.8. All clear the ≥ 8 CVD target and ≥ 15 normal floor, and all marks clear 3:1 against their surface. Research 09 notes that the HIG cautions about blue–orange pairs (research 09 [S5]); here blue and vermillion are never the only cue (shape and text always accompany them, §2.6), and the computed separation under protanopia and deuteranopia is large.

**b. Emphasis (the default for comparisons).** "This session / after" in `--good`, everything else in `--neutral`. Before/after charts, sparklines (latest point) and toss maps use emphasis, not categorical colour (dataviz: emphasis is the most underused form).

**c. Categorical (identity only, 3 slots, fixed order).** Used only when two or three series with no good/bad meaning must share one plot, for example deuce vs ad toss clouds in the rear view.

| Slot | Day | Night | Court-side |
|---|---|---|---|
| 1 | `#0072B2` | `#3D9DE0` | `#0072B2` |
| 2 | `#009E73` | `#12A07A` | `#009E73` |
| 3 | `#D55E00` | `#DB6B2E` | `#B04A00` |

All-pairs validation: Day worst CVD ΔE 11.0 (deutan), normal 18.7; Night CVD 10.6 (protan), normal 16.2; Court-side CVD 11.5 (deutan), normal 18.7; all ≥ 3:1 on their surface. **Cap: three series.** A fourth folds into "Other" in `--neutral` or goes to small multiples. Slots 1 and 3 share hues with the signal pair, so a categorical chart must never also show outcomes or verdicts.

**d. Sequential.** Not used in v1. If a density view is added later, use the dataviz reference blue ramp (steps 250–650) validated with `--ordinal`.

### 2.6 Serve outcome marks (the "serve dot" vocabulary)

Every place a single serve appears as a mark (strip plots, toss maps, the service-box map, the serve strip in a report, the tagging progress bar, legends and the tagging buttons themselves) uses the same geometry. These are data marks drawn as SVG primitives by chart code, not icons.

| Outcome | Mark (at 8 px nominal) | Colour | Text label |
|---|---|---|---|
| In | Filled circle, r 4 | `--good` | "In" |
| Net | Filled triangle, point up, 9 px wide × 8 px tall | `--bad` | "Net" |
| Long | Cross (two 2.5 px strokes at ±45°, 8 px span) | `--bad` | "Long" |
| Wide | Cross, as Long | `--bad` | "Wide" |
| Fault (tally only, type unknown) | Cross | `--bad` | "Fault" |
| Let | Not plotted; listed as "1 let (not counted)" | — | "Let" |
| Untagged | Filled circle, r 3 | `--neutral` | "Not tagged" |
| Excluded by the player | Not plotted; "1 serve excluded" in the caption | — | — |

Long and Wide share a mark because in the side view they are both player-entered faults; the service-box map separates them by position (§9.6) and every legend and tooltip names them in words. All marks carry a 2 px ring in the chart surface colour so they stay legible where they overlap (dataviz marks spec).

**Text never wears a signal colour.** Values, labels and legends are `--ink`, `--ink-2` or `--ink-3`; the coloured mark or glyph beside the text carries the meaning (dataviz non-negotiable).

### 2.7 Video overlay palette

Footage has unpredictable backgrounds (blue or green acrylic, sky, fences, trees), so every overlay stroke has a dark halo: the same path drawn first 2 px wider in `#0B0F0D` at 70% opacity.

| Overlay element | Colour | Stroke | Contrast vs halo |
|---|---|---|---|
| Current serve skeleton | `--optic` `#D4EE48` | bones 3 px, joints r 3.5 | 14.8 |
| Comparison ("ghost") skeleton | `#F4F6F2` at 85% | bones 2.5 px, dashed 6/4 | 17.7 |
| Ball positions and toss path | `#56B4E9` (Okabe–Ito sky blue) | dots r 3, path 2 px | 8.4 |
| Measurement lines (contact height, toe line, hip path) | `#F4F6F2` | 2 px | 17.7 |
| Measurement labels | `#F4F6F2` text on a `#0B0F0D` 72% pill, 13 px semibold | — | 17.7 |
| Recording indicator | `#E5322D` dot + white "Recording" | — | 4.4 on black |

Pose confidence (research 09 [S20]; METRICS visibility threshold 0.5): joints with visibility ≥ 0.7 are drawn at full opacity; 0.5–0.7 at 45% opacity with dashed bones; below 0.5 they are hidden, together with any bone that touches them. Face landmarks are never drawn. Overlays never animate on their own; they follow the playhead.

---

## 3. The honesty system

This is the product's signature. Every number carries one of the five D2 states; coaching claims carry one of three evidence tiers; comparisons carry one of the verdict words. Each is told apart by **glyph + word + container style**, never by colour alone (research 09 §3.3, [S6][S76]).

### 3.1 Data-state glyph and chip system

| State (`MetricStatus`) | Glyph (Phosphor, regular) | Chip label | Chip container | How the number is written | Chart mark style |
|---|---|---|---|---|---|
| `measured` | `RulerIcon` | Measured | Solid `--surface-2` fill, no border | Plain value: "0.92 s", "14 serves" | Solid mark |
| `estimated` | `ApproximateEqualsIcon` | Estimate | Solid `--surface-2` fill, no border | "≈" before the value, plus a range line: "≈ 2.56 m", "likely 2.49 to 2.63 m" | Solid mark with a translucent interval band (25% of mark colour) |
| `player-entered` | `PencilSimpleLineIcon` | You logged | Transparent, 1 px `--line-strong` solid outline | Plain value with its source: "8 of 12 in" | Hollow ring, 2 px stroke, no fill |
| `experimental` | `FlaskIcon` | Experimental | Transparent, 1 px `--line-strong` **dashed** (3/2) outline | Always a rounded range with "about" and the quantity named: "about 130 to 145 km/h, speed just after contact" (side view) or "about 110 to 125 km/h, average to the bounce" (rear view). Never a single number, never decimals (D4) | Dashed ring (1.5 px, 3/2), no fill |
| `unavailable` | `EyeSlashIcon` | Not available | No container: glyph + text in `--ink-3` | No number and no dash. The reason phrase replaces the value: "Needs a view from behind", "Needs 120 fps" | Absent. A ghost row in lists explains why |

The container styles deliberately echo the chart marks: solid (measured), solid with a band (estimated), hollow (player-entered), dashed (experimental), absent (unavailable). A player who learns one learns the other.

**Chip anatomy.** Height 24 px (inside a 44 px hit area when tappable), pill radius, padding 4 px / 8 px, glyph 14 px in `--ink-2`, label caption style (0.75 rem, 600) in `--ink-2`, 4 px gap. Tapping any chip opens the Metric info sheet for that metric at "How sure we are". Compact variant (glyph only, 20 × 20) is allowed only inside per-serve tables and chart legends where a full legend row names the glyphs on the same screen; it always has an accessible name ("Estimate").

**Why `EyeSlashIcon`, not a lock.** Research 09 §3.3 proposed a lock glyph. A lock reads as "paid feature" in almost every subscription app, and Serve Coach has a Plus tier, so a lock would suggest that paying unlocks spin or speed. Unavailable means "we can't see it from this footage", which the eye-slash says directly. Plus features are marked with a text "Plus" badge (§8.21), never a lock.

**Reason text.** The phrase that replaces an unavailable value is the reason code's short form (≤ 4 words); the unlock hint from `metrics.json` appears on tap. Short forms (DESIGN owns these; METRICS owns the hints):

| Reason code | Short form on tiles |
|---|---|
| `NEEDS_REAR_VIEW` | Needs a view from behind |
| `NEEDS_SIDE_VIEW` | Needs the side view |
| `VIEW_MISMATCH` | Not from this view |
| `FPS_TOO_LOW` | Needs 60 fps (speed: Needs 120 fps) |
| `TARGET_NOT_TAGGED` | Tag your target |
| `APEX_EXTRAPOLATED` (downgrade, shown beside the value) | Peak estimated |
| `TILT_UNKNOWN` (downgrade, shown beside the value) | Phone tilt unknown |
| `BOUNCE_NOT_LOCATED` | Bounce not found |
| `EXCLUDED_BY_QUALITY` | Not measured |
| `TIME_BASE_UNKNOWN` | Frame timing unclear |
| `PLAYER_HEIGHT_MISSING` | Add your height |
| `FEET_NOT_VISIBLE` | Feet out of frame |
| `BALL_NOT_TRACKED` | Ball not tracked |
| `APEX_OUT_OF_FRAME` | Toss left the frame |
| `TOO_FEW_SERVES` | Needs {n} serves |
| `NOT_ENTERED` | Tag your serves |
| `NEEDS_CALIBRATION` | Tap the court corners |
| `EXPERIMENTAL_HIDDEN` | Experimental (off) |
| `NOT_MEASURABLE` | Not measurable by phone |
| `NOT_IMPLEMENTED` | Coming later |
| `CAMERA_MOVED`, `CAMERA_TILTED` | Phone moved / Phone tilted |
| `POSE_LOW_QUALITY`, `OCCLUDED` | Body not clear |
| Any other | Couldn't see this clearly |

### 3.2 Validation level (a separate, quieter layer)

METRICS §1.3 caps each metric's state by its validation level. Before real-footage validation (V2), almost every metric is **Estimate**, which is honest but does not tell the player that the method itself is still unproven on real courts. The design therefore adds one quiet, non-chip layer:

- **Metric info → "How sure we are"** always states the level in words: V0 "Not yet checked", V1 "Checked on simulated serves. Real-court check in progress.", V2 "Checked against hand-marked real video", V3 "Checked against a physical reference (radar, measuring pole or a second camera)".
- **Session report footer**, while any shown metric is below V2: one line with `InfoIcon`: "Early version: our measurements are checked on simulated serves, not yet on real courts. How we measure ›". It is not repeated per tile.
- This replaces the alternative of stamping "Experimental" on every hero metric (which, by D2 and METRICS §1.5, would hide them from headlines and coaching). See the flag in §15.

### 3.3 Uncertainty presentation rules

1. **n on every rate and spread**, written "8 of 12" (D7). Rates below 10 serves show no percentage and no band (METRICS §4.1).
2. **Intervals as ranges in words** in tiles: "likely 2.49 to 2.63 m". In charts, as a translucent band or a gradient interval bar, never a T-shaped error bar (research 09 [S66][S67]).
3. **Per-serve dots before summaries.** Where space allows, show the serves themselves (a strip) next to the summary (research 09 [S63][S64]).
4. **Early reads.** Provisional values (METRICS §4.1) carry the text "Early read" beside the state chip and are drawn with `--ink-3` marks in trends. They never appear in a headline.
5. **Near the measurement limit.** Spreads flagged `nearMeasurementLimit` read "≤ 4 cm" with the line "At the limit of what we can measure."
6. **Bands, never angles, and only against the player's own serves** (D5). `shoulder-tilt-trophy` (side view) and the rear-only `knee-bend-band` and `shoulder-over-shoulder-contact` read as three player-relative words, "Lower than your usual", "Typical for you", "Higher than your usual", always with the key frame that shows them. The `leg-drive` band uses the same three words beside its % of height. Until 2 matched sessions exist, the reference is the session's own serves and the tile says so ("Compared with today's other serves"). Degrees are never displayed, and no band is ever compared with published trunk angles (for example 48° or 25 ± 7°) or with professional centre-of-mass rise, because the definitions differ (D5; gap geometry §4–5).
7. **Say what this view cannot see.** A side-view layout never contains a knee-bend band, a knee angle or shoulder tilt at contact. Their slots are unavailable ghost rows reading "Needs a view from behind" (D1).
8. **Loading depth is a description.** `loading-depth` renders as a sentence with a value and chip ("Your hips dropped about 6% of your height before rising"), never as a band, never with the word "bend", and never next to a "more" or "deeper" suggestion. The experimental `deep-bend-flag` is a yes/no row ("Deep knee bend: yes"); "little bend" is never shown (D5; gap geometry §3.3).
9. **Precision** follows METRICS §4.9; the display layer never adds digits.
10. **Ranges** use "to" in text ("12 to 15 cm") for clarity and screen readers. Compact axis ticks and tooltips may use a hyphen ("12-15"), with an `aria-label` that says "to". No en or em dashes in UI strings.
11. **Negative positions** are written as directions, not signs: "5 cm behind your front toe", not "−5 cm".
12. **Side-view toss bias is stated, not hidden** (D1). Wherever `toss-apex-height` or `toss-height-spread` from the side view is explained (toss hero tile footnote, Metric info), one line says so: "From the side, a toss nearer the camera than your body reads a little high, and a little sideways wobble adds a few centimetres to the spread." A peak fitted above the picture carries "Peak estimated" beside its chip (`APEX_EXTRAPOLATED`); more than about 0.5 m above the picture it is unavailable ("Toss left the frame").
13. **Provisional club-player bands** (gap ranges §7, UTR 1–7) appear only in Metric info under "Typical for club players (provisional)", in words such as tight / typical / scattered, never good / bad, and never in tiles, headlines or charts. A player's band word changes only when the estimate crosses an edge by more than the stated margin (hysteresis, owned by METRICS).
14. **Plausibility** (gap ranges §8; values owned by METRICS). A hard-rejected serve stays visible in the serve index and strip with a "Not measured" chip and counts in "X of N measured". A soft-flagged serve keeps its mark; its serve-index button adds a 12 px `WarningCircleIcon` in `--attention` (dashed rings stay reserved for experimental marks), and its callout and Serve detail add a "Check this serve" tertiary link. A contact height above 1.62 × height also shows "Is your height right?" with a link to About you.

### 3.4 Evidence tier chips (coaching claims, COACHING §13)

| Tier | Glyph | Chip label | Container |
|---|---|---|---|
| `research-backed` | `BooksIcon` | Research-backed | Solid `--surface-2` |
| `coach-recommended` | `ChalkboardTeacherIcon` | Coaches recommend | Solid `--surface-2` |
| `experimental` | `FlaskIcon` | Experimental | Dashed outline (same as the data state) |

The tier chip sits on the focus card beside the focus title. Tapping it opens "How we know", which names the population studied ("in skilled adult players") per COACHING §13.

### 3.5 Verdict vocabulary ("Did it work?", trends)

One display vocabulary for every verdict id across METRICS §4.5, COACHING §12.4 and ARCHITECTURE `VerdictWord` (ids differ between specs; see §15).

| Display words | Maps from ids | Glyph | Glyph colour | Chip fill |
|---|---|---|---|---|
| Clearly better | `clearly-better`, `clear-improvement` | `CheckCircleIcon` | `--good` | `--good-soft` |
| Likely better | `likely-better` | `CircleHalfIcon` | `--good` | `--good-soft` |
| About the same | `no-clear-change` | `EqualsIcon` | `--ink-2` | `--surface-2` |
| Too early to tell | `too-early`, `too-early-to-tell` | `HourglassMediumIcon` | `--ink-2` | `--surface-2` |
| Likely worse | `likely-worse` | `CircleHalfIcon` mirrored (scaleX −1) | `--bad` | `--bad-soft` |
| Clearly worse | `clearly-worse`, `clear-decline` | `MinusCircleIcon` | `--bad` | `--bad-soft` |
| Not comparable yet | `not-comparable` | `CircleDashedIcon` | `--ink-2` | transparent, 1 px dashed `--line-strong` |
| Not a clear trend yet | trend "too early" (METRICS §4.6) | `HourglassMediumIcon` | `--ink-2` | `--surface-2` |

Rules: the words always come first and are never replaced by an arrow. The follow-up clause ("About 10 more serves to confirm", "This session was ad court; your experiment is on the deuce court") is body text next to the chip, not inside it. Worse verdicts are phrased gently (COACHING §12.5) and never styled as an error.

### 3.6 Capture quality line

Sits directly under every session headline (METRICS §3.25, CAPTURE §8.4). One line, footnote style:

`CheckCircleIcon` **Capture: Good** · 14 of 16 serves measured
`WarningCircleIcon` (`--attention`) **Capture: Fair** · 11 of 16 serves measured
  Next time: move the phone one step back ›
`WarningIcon` (`--attention`) **Capture: Limited** · 6 of 16 serves measured
  What happened ›

The "Next time" and "What happened" lines are a second `footnote` line (one middot per line at most). The internal 0–100 score is never shown (METRICS §3.25). Tapping opens the capture detail sheet listing every non-passing check with its message and glyph.

---

## 4. Typography

### 4.1 Family

**Archivo** (Omnibus-Type, OFL-1.1), self-hosted from **`@fontsource-variable/archivo`** (v5.3.0 at the time of writing), imported as `@fontsource-variable/archivo/wdth.css`. That file declares `font-family: 'Archivo Variable'` with `font-weight: 100 900` and `font-stretch: 62% 125%`, split into latin, latin-ext and vietnamese subsets by `unicode-range`, with `font-display: swap`.

- **Why Archivo:** a grotesk designed for high-performance typography in print and on screen, with open, unambiguous figures and a width axis. Wide figures (112%) read like a scoreboard and stay legible at a distance; the normal width keeps body text compact on a 390 px screen. It is not one of the LLM-default faces (Inter, Geist) and not a serif (the taste skill bans serif for data UI).
- **Figures:** the Archivo sources define `tnum`, `pnum`, `lnum`, `zero`, `case` and `frac` features (checked in the upstream `Archivo.glyphs` source). **Verify in the built woff2** during implementation with a unit test that measures the advance width of "1" and "0" under `font-variant-numeric: tabular-nums`; if the Google build dropped `tnum`, fall back to `@fontsource-variable/geist` for numerals only and record the change here.
- **Fallback stack:** `'Archivo Variable', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`.
- **Payload:** only latin and latin-ext woff2 files are precached (Vietnamese is left to `unicode-range`). Measure the two files in the build report; budget ≤ 150 KB combined.
- **One family.** No mono, no serif, no italic file. Emphasis uses weight. Coaching cues are set in regular weight inside typographic quotation marks (“ ”), not italics.

### 4.2 Type scale

Sizes are in `rem` so they follow the user's text size. In browsers 1 rem = 16 px. On iPhone the root is set from `-apple-system-body` (§13.4), so 1 rem = 17 pt at the default Dynamic Type size and the scale lands on HIG sizes (body 17, footnote 13, large title 34).

| Token | Size (rem / px at 16) | Line height | Weight | Width | Figures | Use |
|---|---|---|---|---|---|---|
| `display` | 2 / 32 | 1.15 | 650 | 100 | proportional | Large titles on tab roots (Today, Record, Sessions, Progress) |
| `title-1` | 1.5 / 24 | 1.25 | 620 | 100 | proportional | Focus title, screen titles in pushed screens, Compare verdict sentence |
| `title-2` | 1.25 / 20 | 1.3 | 600 | 100 | proportional | Session headline sentence, card titles, experimental speed ranges in tiles |
| `headline` | 1 / 16 | 1.375 | 600 | 100 | proportional | List row titles, button labels, tile labels in Court-side |
| `body` | 1 / 16 | 1.5 | 400 | 100 | proportional | Paragraphs, drill steps |
| `callout` | 0.9375 / 15 | 1.45 | 400 | 100 | proportional | Card body, "why it matters" |
| `subhead` | 0.9375 / 15 | 1.35 | 500 | 100 | proportional | Units beside values, secondary lines |
| `footnote` | 0.8125 / 13 | 1.4 | 450 | 100 | tabular | Captions, n lines, capture line, chart labels |
| `caption` | 0.75 / 12 | 1.35 | 600 | 100 | tabular | Chip labels, axis ticks, phase labels |
| `metric` | 1.75 / 28 | 1.1 | 620 | 112 | proportional | Values in metric tiles |
| `metric-hero` | 2.75 / 44 | 1.05 | 650 | 112 | proportional | One hero value per view (Metric info, Compare) |
| `timer` | 4 / 64 | 1 | 600 | 112 | **tabular** | Drill timer, countdown, recording timer |
| `distance-word` | 9.375 / 150 | 1 | 750 | 112 | — | One-word serving-spot states (§10.3) |
| `cue` | 1.75 / 28 | 1.2 | 500 | 100 | — | The coaching cue on Focus & drill |

Rules:
- **Minimum rendered size 12 px** (Court-side 15 px). Nothing below `caption`.
- **Proportional figures for standalone values; tabular figures where digits must align or tick:** lists and tables of numbers, axis ticks, per-serve drawers, counters, timers, progress counts ("Tracking serve 7 of 12"). This reconciles research 09 §5 (tabular numerals for stats) with the dataviz rule that big standalone numbers look loose in tabular figures.
- Headings use `text-wrap: balance`; body uses `text-wrap: pretty`. Body line length ≤ 60 characters on phones (the 350 px column does this by itself).
- Sentence case everywhere. **No uppercase tracked eyebrows.** Section labels are `footnote` 600 in `--ink-3`, sentence case ("Your focus", "Your serve today").
- Letter-spacing: `display` and `metric-hero` −0.01 em; everything else 0.
- Units are `subhead` in `--ink-2` after a thin space: "0.92 s", "11 cm", "1.46 × your height".

### 4.3 Number and unit formatting (display layer)

| Case | Format | Example |
|---|---|---|
| Measured value | value + unit | 0.92 s |
| Estimated value | ≈ + value + unit; range line below | ≈ 2.56 m / likely 2.49 to 2.63 m |
| Ratio | two decimals + " × your height" | 1.46 × your height |
| Rate | k of n, then % from n ≥ 10 | 8 of 12 in (67%) |
| Spread | the metric's name + a distance; "SD" and "±" are never shown. Metric info explains spread once as "the typical distance of a toss from your average" | Toss height spread 11 cm |
| Timing spread | milliseconds (values under 0.1 s read poorly as seconds) | Rhythm spread 45 ms |
| Band (player-relative) | word, share | Typical for you, 9 of 12 serves |
| Share of height (`leg-drive`, `loading-depth`) | whole percent + " of your height" | 9% of your height |
| Yes/no flag (`deep-bend-flag`) | word, share | Deep knee bend: yes on 4 of 12 serves |
| Experimental | "about" + outward-rounded range + quantity | about 130 to 145 km/h, speed just after contact |
| Player-entered | value + source line | 142 km/h, from your radar |
| Unavailable | reason short form (§3.1) | Needs 120 fps |
| Durations under 1 s | seconds with two decimals | 0.92 s (METRICS rounds to 10 ms) |
| Dates | "Sat 26 Sep", "26 Sep 2026" in exports; relative "Yesterday" only in lists | — |
| Thousands | comma | 1,284 |

Australian English throughout: metres, centimetres, practise (verb) / practice (noun), colour, racquet.

---

## 5. Layout, space, shape and elevation

### 5.1 Screen frame (390 × 844 reference: iPhone 12–15 class)

| Region | Size | Notes |
|---|---|---|
| Top safe area | 47 px | `env(safe-area-inset-top)` |
| App bar | 52 px | Inline title; tab roots add a 44 px large-title row that collapses on scroll |
| Content column | 350 px wide | 20 px side gutters (`px-5`); 16 px minimum at the narrowest supported width (320 px) |
| Tab bar | 56 px + bottom safe area (34 px) | Hidden on full-screen flows (camera, tagging, drill player, compare video full-screen) |
| Bottom action bar (optional) | 76 px + safe area | Sticky primary action on long pushed screens (Focus & drill, Compare) |

Content viewport on a tab root: 844 − 47 − 52 − 90 = 655 px (611 px while the large title is expanded).

**Camera orientation follows the D1 set-up, portrait by default.** The whole app is designed portrait-first at 390 × 844. The camera flow (set-up choice, live framing, serving-spot states, countdown, recording) has two variants, chosen on R2 (§10.3):
- **Upright (portrait), the default:** 390 × 844, the same frame as every other screen. The long side of the sensor lies along the vertical serve motion (D1). No rotation is ever asked for.
- **Sideways at the fence (landscape), the alternative:** 844 × 390, safe insets 47 px on the notch side and 21 px at the bottom. Only this variant asks the player to turn the phone ("Turn your phone sideways", `DeviceRotateIcon`, static in reduced motion), and it never blocks: the prompt also offers "Film upright instead".

A PWA cannot lock orientation on iOS, so non-camera screens simply reflow when the phone is turned (single column, max width 560 px centred). If the phone's orientation stops matching the chosen set-up during framing, one instruction pill says so and offers the switch ("Phone is sideways. Turn it upright, or switch to the fence set-up"), because the framing guidance differs between the two. In the native shell the app UI is portrait-locked and capture orientation is set on the capture connection (ARCHITECTURE §15); the landscape camera screens render their 844 × 390 layout rotated inside the portrait web view.

**Recorded clips come in both orientations**, so every playback surface has a landscape-clip and a portrait-clip layout (§8.11, §8.12, §10.7, §10.8). The video box height is capped at 45% of the viewport (380 px at 844), which keeps the scrubber, transport and tagging controls on screen whatever the clip.

**Wider screens** (iPad, desktop testing): content max width 560 px, centred; charts keep their phone proportions.

### 5.2 Spacing scale (px, 4-point grid)

`4, 8, 12, 16, 20, 24, 32, 40, 48, 64`. Tailwind `--spacing: 4px`, so `p-4` = 16 px. Spacing is in px on purpose: text grows with Dynamic Type, layout rhythm does not balloon.

| Use | Value |
|---|---|
| Screen gutter | 20 |
| Card padding | 16 (20 on the focus card) |
| Gap between cards | 12 |
| Gap between sections | 32 |
| Label to value | 4 |
| Value to caption | 4 |
| Chip gap | 8 |
| Tile grid gap | 12 |
| List row vertical padding | 12 (min row height 56) |
| Button stack gap | 12 |

### 5.3 Shape (radius rule, one system)

| Element | Radius |
|---|---|
| Interactive controls (buttons, tag buttons, inputs, segmented controls) | 14 px |
| Containers (cards, focus card, video frame inside a card, toasts) | 20 px |
| Sheets (top corners) | 28 px |
| Media inside a container (key frames, thumbnails) | 10 px |
| Labels and toggles (chips, pills, tab indicator, switches, progress bars) | full |
| Full-bleed video at the top of Serve detail and Tagging | 0 |

Rule: controls 14, containers 20, labels full, media 10. No other radii.

### 5.4 Elevation and surfaces

| Level | Day | Night | Court-side | Used by |
|---|---|---|---|---|
| 0 Page | `--bg` | `--bg` | `--bg` | Screen background |
| 1 Card | `--surface` + 1 px `--line` | `--surface`, no border | `--surface` + 2 px `--line` | Cards, tiles, focus card |
| 2 Floating chrome | `--surface` at 88% + `backdrop-filter: blur(20px) saturate(140%)` + top 1 px `--line` | same with `--surface` at 88% | opaque `--surface`, 2 px top border | Tab bar, sticky filter row, bottom action bar |
| 3 Sheet | `--surface`, shadow `0 -12px 40px rgb(18 23 20 / 0.14)` | `--surface-2`, no shadow, 1 px `--line` top edge | opaque, 2 px ink top edge | Sheets, menus |
| 4 Toast | `--surface-inverse` | `--surface-inverse` | `--surface-inverse` | Toasts |

Translucency is limited to the navigation layer (Liquid Glass guidance: glass for controls and navigation, not content, research 09 [S13]). Under `prefers-reduced-transparency: reduce` and in Court-side mode, level 2 is opaque. Shadows are tinted to the graphite hue and only used for sheets; cards never have shadows.

**z-index scale** (in `ui/tokens/z.ts`): content 0, sticky header 10, tab bar 20, video controls 30, sheet 40, toast 50, full-screen camera and recording 60.

### 5.5 Touch targets

| Element | Minimum |
|---|---|
| Any tappable element | 44 × 44 px (HIG default, research 09 [S5]); visual size may be smaller with an expanded hit area |
| Primary and secondary buttons | 52 px tall, full column width in cards and sheets |
| Frame-step and playback controls | 48 × 48 px |
| Tagging outcome buttons | 169 × 88 px (two columns) |
| Record, Stop, Ready | 72 px circle (Stop 88 px on the recording screen) |
| Body-check answers | 52 px tall full-width buttons |
| Chart marks | 24 px hit radius via a nearest-point layer (§9.1) |
| Spacing between adjacent targets | ≥ 8 px |

Sweaty or gloved hands and a phone held one-handed at the fence argue for the larger sizes on every court-side screen (research 09 §6.3).

---

## 6. Iconography

- **Library:** `@phosphor-icons/react` 2.1.10 (already a dependency). Import the `…Icon`-suffixed names (for example `FlaskIcon`); the unsuffixed names are deprecated in 2.1.
- **One weight: `regular`.** Set once with `IconContext.Provider value={{ weight: 'regular', size: 24, color: 'currentColor' }}` at the app root. No `fill`, `duotone` or `bold`. Selection is shown by the optic indicator and label weight, not by filled icons.
- **Sizes:** 24 px default, 20 px in list rows and chips-with-text at 14 px, 28 px in Court-side, 32 px in empty states, and the serving-spot glyph at 55% of the screen's short side (portrait: the width; landscape: the height; about 214 px either way).
- Icons inherit `currentColor`; they are `--ink` or `--ink-2` except the glyphs listed in §3 and the optic tab indicator.
- Decorative icons get `aria-hidden="true"`; icon-only buttons get an `aria-label`.
- **Never hand-draw icons.** The outcome marks (§2.6), court diagrams and chart geometry are data drawings, not icons.

| Meaning | Icon |
|---|---|
| Today tab | `HouseIcon` |
| Record tab | `VideoCameraIcon` |
| Sessions tab | `ListBulletsIcon` |
| Progress tab | `ChartLineUpIcon` |
| Profile | `UserCircleIcon` |
| Measured / Estimate / You logged / Experimental / Not available | `RulerIcon` / `ApproximateEqualsIcon` / `PencilSimpleLineIcon` / `FlaskIcon` / `EyeSlashIcon` |
| Research-backed / Coaches recommend | `BooksIcon` / `ChalkboardTeacherIcon` |
| Focus marker, focus phase | `TargetIcon` |
| Cue | `ChatTextIcon` |
| Drill, timer | `TimerIcon` |
| Log practice | `NotePencilIcon` |
| Re-test | `ArrowsClockwiseIcon` |
| Compare, side by side / ghost | `SquareSplitVerticalIcon` / `GhostIcon` |
| Frame back / forward | `CaretLeftIcon` / `CaretRightIcon` |
| Previous / next serve | `SkipBackIcon` / `SkipForwardIcon` |
| Play / pause / replay | `PlayIcon` / `PauseIcon` / `ArrowCounterClockwiseIcon` |
| Skeleton, toss path, contact line, leg drive (hip rise) overlays | `PersonSimpleIcon` / `TennisBallIcon` / `ArrowLineUpIcon` / `ArrowFatLinesUpIcon` |
| Set-up: upright (default) / sideways at the fence; turn the phone | `DeviceMobileIcon` / `DeviceMobileIcon` rotated 90° / `DeviceRotateIcon` |
| Video zoom: fit the frame / zoom to the player | `CornersInIcon` / `CornersOutIcon` |
| Capture good / fair / limited | `CheckCircleIcon` / `WarningCircleIcon` / `WarningIcon` |
| Level, steady, light, frame rate checks | `ArrowsHorizontalIcon` / `HandPalmIcon` / `SunIcon` / `FilmStripIcon` |
| Phone position | `DeviceMobileCameraIcon` |
| Wind | `WindIcon` |
| Body check, referral | `HeartbeatIcon`, `FirstAidIcon` |
| Match log | `FlagPennantIcon` |
| Storage, delete, export | `HardDrivesIcon`, `TrashIcon`, `ExportIcon` |
| How we measure, info | `InfoIcon` |
| Close, more | `XIcon`, `DotsThreeIcon` |
| Import a video | `FilmReelIcon` |

---

## 7. Motion

Motion communicates feedback and state change only. Library: `motion` 13 (`motion/react`), CSS transitions for simple state changes.

### 7.1 Tokens

| Token | Value | Use |
|---|---|---|
| `--dur-press` | 100 ms | Button and chip press feedback |
| `--dur-fast` | 160 ms | Chip swaps, toggles, overlay switch, selection |
| `--dur-base` | 220 ms | Screen push, card expand, verdict reveal |
| `--dur-sheet` | spring (stiffness 420, damping 42, mass 1): settles in about 300 ms without overshoot | Sheets |
| `--dur-chart` | 360 ms | First reveal of a chart on the first view of a new report only |
| `--ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` | Entering and moving |
| `--ease-exit` | `cubic-bezier(0.4, 0, 1, 1)` | Leaving |

### 7.2 Rules

- Animate `transform` and `opacity` only.
- **Press:** `scale(0.98)` for 100 ms; no ripple.
- **Screen push:** incoming screen translates 24 px from the right with opacity 0 → 1 (220 ms); back reverses. No full-width slides.
- **Sheets:** spring up from the bottom; scrim fades 160 ms.
- **Verdict reveal:** chip fades in and rises 4 px (220 ms) after the chart settles. No count-up numbers, no confetti, no sounds.
- **Charts:** on the first view of a new session report, marks fade in left to right over 360 ms (per-mark delay ≤ 20 ms, total cap 360 ms). Revisits render static.
- **Processing:** the determinate progress bar eases between reported values (250 ms), never faster than real progress (ARCHITECTURE §5.8, research 09 [S10][S11]).
- **Tagging:** the tapped button flashes to its pressed state; the progress segment fills with the outcome mark (160 ms); the next serve starts 300 ms later.
- **Recording dot:** steady, not pulsing (calm, and saves attention). The timer ticks each second.
- **Video:** never autoplays on scroll; the serve loop in Tagging plays once and stops on the contact frame.
- **Nothing loops indefinitely** apart from an active camera preview and an active video the player started.

### 7.3 Reduced motion (`prefers-reduced-motion: reduce`)

| Element | Standard | Reduced |
|---|---|---|
| Screen push | 24 px slide + fade 220 ms | Fade 120 ms |
| Sheet | Spring from bottom | Fade 120 ms, appears in place |
| Chart reveal | Staggered fade 360 ms | Static |
| Verdict reveal | Fade + 4 px rise | Static |
| Tagging advance | 160 ms fill + 300 ms delay, auto-plays next serve | Instant fill; next serve shows its contact frame, player taps Play |
| Serve loop in Tagging and Serve detail | Plays once on open | Opens paused on the key frame |
| Turn-phone prompt (landscape set-up only) | Icon rotates | Static icon with the words |
| Video zoom (fit / player) | 220 ms scale | Instant |
| Progress bar easing | 250 ms ease | Jumps to value |
| Press scale | 0.98 | Colour change only |

---

## 8. Components

Each component lists anatomy, sizes, states and accessibility. React names and props are in §13.6. "Tappable" always means a ≥ 44 × 44 px hit area.

### 8.1 App bar

- Height 52 px below the top safe area; background level 2 (translucent) once content scrolls under it, transparent at rest.
- **Tab roots:** large title (`display`) in a 44 px row under the bar, left-aligned at the gutter; collapses into a centred `headline` title after 32 px of scroll. Right slot: Profile button (`UserCircleIcon`, 44 × 44) on Today only; other roots have none (Profile is reachable from Today and from Sessions' overflow).
- **Pushed screens:** left back button (`CaretLeftIcon` + previous title, max 12 characters, else "Back"); centred `headline` title (truncate to 1 line); right slot for one icon action (`DotsThreeIcon` menu or `ExportIcon`).
- Never more than one text action in the bar. Never an optic button in the bar.

### 8.2 Tab bar

- Four tabs, fixed order: **Today, Record, Sessions, Progress** (D10), single-word labels (research 09 [S12]).
- Height 56 px + bottom safe area; level 2 surface; top 1 px `--line`.
- Each item: icon 24 px above a `caption` label; whole quarter-width column is the hit area.
- **Selected:** a 56 × 32 px pill behind the icon in `--optic` with a 1 px `--optic-edge` (Day), icon `--on-optic`, label `--ink` weight 700. **Unselected:** icon and label `--ink-3`, weight 600.
- Court-side: selected pill is `--ink` with `--ink-inverse` icon (a small optic pill does not survive glare).
- Badge: none. No counters, no red dots. The only indicator allowed is "Re-test ready" as a text line on Today, not on the tab.
- Hidden on full-screen flows; returns with a 160 ms fade.
- Accessibility: `role="tablist"` pattern via `nav` + `aria-current="page"` on the selected link.

### 8.3 Buttons

| Variant | Visual | Label | Height | Use |
|---|---|---|---|---|
| **Primary** | `--optic` fill, 1 px `--optic-edge` (Day), 2 px ink edge (Court-side), radius 14 | `headline` `--on-optic`, optional 20 px leading icon | 52 | The one thing to do on this screen. Max one per screen or sheet |
| **Secondary** | `--surface` fill, 1 px `--line-strong` border | `headline` `--ink` | 52 (44 compact) | Alternatives next to a primary, standalone actions |
| **Tertiary** | No container | `headline` `--ink`, 1 px underline at 3 px offset for links that leave the screen | 44 | "Why this focus?", "How we measure" |
| **Destructive** | `--surface` fill, 1 px `--line-strong` border | `headline` `--critical` with `TrashIcon` | 52 | Delete actions; always followed by a confirmation sheet |
| **Critical fill** | `--critical` fill | `headline` `--on-critical` | 56 | Only "Call 000" and the final "Delete everything" confirm |
| **Icon** | No container, or `--surface-2` circle 44 | Icon 24 | 44 | Toolbars, video controls |

States: pressed = `--optic-press` (primary) or `--surface-2` (others) + scale 0.98; focus-visible = 2 px `--focus` ring at 2 px offset; disabled = `--surface-2` fill, `--ink-disabled` label, no border, `aria-disabled` with a reason in the helper text ("Add your height to continue"). Loading = label replaced by "Saving…" text (no spinner in the button). Labels are 1–3 words and never wrap; if a label would wrap at 320 px it is shortened. One label per intent across the app (for example "Record re-test" everywhere, never "Re-test now" elsewhere).

### 8.4 Segmented control and choice chips

- **Segmented control** (2–4 mutually exclusive options that switch a view: "Side by side | Ghost", "Deuce | Ad", "First | Second"): 36 px track (`--surface-2`, radius 14) inside a 44 px hit row; selected segment `--surface` with 1 px `--line-strong` and `headline` label; unselected `subhead` `--ink-2`. Court-side: selected = `--ink` fill, `--ink-inverse` label. `role="radiogroup"`.
- **Choice chips** (block settings, onboarding answers, tag attributes): pill, 36 px visual / 44 px hit, `subhead` label. Unselected: 1 px `--line-strong` outline. Selected: `--ink` fill, `--ink-inverse` label, leading `CheckIcon` 16 px (so selection is not colour-only). Never optic (optic is reserved for the primary action).
- **Filter row** (Progress, Sessions): one row of chips above everything it scopes, horizontally scrollable with 20 px end padding; the first chip summarises ("Side view · Deuce · First serves") and opens a sheet (dataviz: filters in one row above the charts).

### 8.5 List rows

Min 56 px; 12 px vertical padding; leading 40 × 40 media (key-frame thumbnail radius 10, or a 24 px icon in a 40 px `--surface-2` circle); title `headline`; secondary line `footnote` `--ink-2` (max 1 line, truncate); trailing value (tabular) and/or `CaretRightIcon` 20 px `--ink-3`. Dividers: 1 px `--line` inset to the text start, only between rows, never above the first or below the last. Grouped lists sit in a level 1 card.

**Session row** (Sessions tab): thumbnail (the session's representative key frame), title "Sat 26 Sep", secondary "Side view · 14 serves", trailing capture glyph (Good/Fair/Limited glyph with a visually hidden word) and chevron. The headline sentence is the third line in `footnote` `--ink-2`, 2 lines max.

### 8.6 Status chip and `MetricValue`

Defined in §3.1. `MetricValue` is the only way a metric number reaches the screen: it takes a `MetricValue` or `SessionMetric` object, formats it (§4.3), prefixes "≈" for estimates, writes ranges and renders the chip. It refuses to render (and logs in development) if `status` is missing. §13.7 describes the test that enforces this.

### 8.7 Metric tile

**Standard tile** (half column: 169 × min 132 px; padding 16; level 1 card):

```
┌──────────────────────────┐
│ Toss-to-hit time         │  label: footnote 600 --ink-2, 2 lines max
│ 0.92 s                   │  value: metric (28, wdth 112) + unit subhead --ink-2
│ usual 0.88 to 0.98 s     │  context: footnote --ink-3 (usual range, or likely range)
│ 12 of 14 serves          │  n: footnote tabular --ink-3
│ [Ruler Measured]         │  status chip, bottom-left
└──────────────────────────┘
```

- Tappable as a whole; opens Metric info. `aria-label` reads the full sentence: "Toss-to-hit time, 0.92 seconds, measured, usual range 0.88 to 0.98 seconds, 12 of 14 serves."
- **Estimated:** value "≈ 2.56 m" (the ≈ in `--ink-3`), context "likely 2.49 to 2.63 m".
- **Early read:** a text badge "Early read" (`caption`, 1 px `--line-strong` outline pill) after the status chip.
- **Band tile** (`shoulder-tilt-trophy` in the side report; `knee-bend-band` and `shoulder-over-shoulder-contact` in the rear report only): full width; left a key-frame thumbnail in the clip's orientation (96 × 54 for a landscape clip, 54 × 96 for a portrait clip) with the band's overlay (`shoulder-line` on the trophy frame; `knee-rear` or `shoulder-over-shoulder` on the rear frames, §8.11); right: label, the player-relative band words in `title-2` ("Higher than your usual"), the reference line in `footnote` `--ink-3` ("compared with your usual", or "compared with today's other serves" before 2 matched sessions), share line "9 of 12 serves", chip. No number and no degrees. The two rear bands are experimental while METRICS says so: dashed chip, toggle only.
- **Leg-drive tile** (`leg-drive` with `drive-time`; D5 hero, side view): full width, level 1 card, padding 16:

  ```
  ┌──────────────────────────────────────┐
  │ Leg drive                            │  label footnote 600 --ink-2
  │ ┌────┐  Hips rose ≈ 9% of your height│  value: metric (the ≈ 9%) + "of your height" subhead
  │ │ kf │  Typical for you              │  band words: headline, player-relative
  │ │    │  Drive time 0.34 s            │  drive-time value: subhead, with its compact chip
  │ └────┘  12 of 14 serves              │  n: footnote tabular --ink-3
  │ [≈ Estimate]                         │  chip
  │ Before that, your hips dropped about │  loading-depth description line (below),
  │ 6% of your height.  [≈]              │  footnote --ink-2 + compact chip
  └──────────────────────────────────────┘
  ```

  The key frame (96 × 54 landscape clip, 54 × 96 portrait clip) is the contact frame with the `hip-rise` overlay drawn from the lowest mid-hip point to the mid-hip at contact (§8.11). Tapping opens Metric info for `leg-drive`; the drive-time value opens its own. The band words follow §3.3 rule 6; drive time is a player-relative trend only (no band). No population values, no "jump", no "push harder".
- **Loading-depth line** (`loading-depth`, `DescriptionLine`): one `footnote` sentence with its value and compact chip, placed in the leg-drive tile (above) and in Serve detail's drawer. No band word, no "bend", no comparison word ("more", "deeper", "not enough"); §3.3 rule 8.
- **Deep-bend row** (`deep-bend-flag`, experimental, toggle only): a 56 px list row in the Experimental group: `FlaskIcon`, "Deep knee bend", value "Yes on 4 of 12 serves" (or "No"), dashed Experimental chip. It never reads "little bend" and never feeds a cue.
- **Outcome tile** (`first-serve-in-rate`, `second-serve-in-rate`): value "8 of 12 in" (`metric` for the k, `subhead` for "of 12 in"), then a 137 × 12 px Wilson bar (§9.8), then "likely 39% to 86%" once n ≥ 10, chip "You logged".
- **Experimental tile** (only when the toggle is on): value in `title-2` ("about 130 to 145 km/h"), quantity line naming what was measured ("speed just after contact" for `speed-experimental`; "average speed to the bounce" for `speed-average-rear`), chip "Experimental" (dashed). Sits in its own "Experimental" group at the end of the stats list, never among hero tiles. The side-view speed tile exists only when every D4 condition held (≥ 120 fps, clean ball detections just after contact, height scale known, a T / Body / Wide target tag); otherwise the speed row is a ghost row with the first missing condition ("Needs 120 fps", "Tag your target"). There is never a side-view speed from sound.
- **Unavailable ghost row** (not a tile): a 56 px list row with `EyeSlashIcon`, the metric name, the reason short form in `--ink-3`, and a trailing tertiary link "How to unlock" or "Why". Grouped under "Not available from this session". Every side-view report carries ghost rows for **Knee bend** and **Shoulder tilt at contact** ("Needs a view from behind"), plus Spin ("Not measurable by phone") and Speed when its conditions fail.
- **Hero tile (toss consistency)** is a full-width card: two values side by side (Height spread, Front-to-back spread), each with chip, n and usual range, above a 318 × 180 px toss map (§9.4). It is always the first stats card (D5, research 10 M2). In a side-view session its last line is a `footnote` with `InfoIcon`: "From the side, this includes a little sideways toss wobble. More ›" (§3.3 rule 12; the full sentence is in Metric info).

**Grid:** `grid-template-columns: repeat(auto-fit, minmax(10.5rem, 1fr))` with 12 px gap. Because the minimum is in rem, tiles drop to one column automatically at large Dynamic Type sizes.

### 8.8 Focus card

The heart of Today and the session report (D6, COACHING §8; research 09 §9).

**Full variant** (Today; 350 px wide, radius 20, padding 20, level 1 card with a 4 px `--optic` inset bar along the top edge inside the radius):

```
┌──────────────────────────────────────┐
│▀▀▀▀ (4 px optic top bar)              │
│ Your focus            [Books Research-backed]
│ Steady toss height                    │ title-1
│ ┌───────────────┐ ┌───────────────┐   │ two key frames 151 × 85, radius 10
│ │ Serve 7 (typ.)│ │ Your best     │   │ apex-scatter overlay on the left frame
│ └───────────────┘ └───────────────┘   │ captions footnote below each
│ Toss height spread  17 cm             │ 1–2 stat rows: label, value, chip
│ usual 12 to 15 cm  [≈ Estimate]       │
│ ─────────────────────────────────     │
│ “Lift it like an elevator.”           │ cue: title-2 500, ChatTextIcon 20 left
│ Fence-line toss ladder · 8 min        │ drill row: headline + TimerIcon
│ [ Start drill                       ] │ primary
│ [ Log practice ]   Why this focus?    │ secondary (compact) + tertiary
│ ─────────────────────────────────     │
│ Re-test: 12 first serves, deuce side  │ footnote, ArrowsClockwiseIcon
│ Sore today? Tell us before you serve ›│ footnote, HeartbeatIcon
└──────────────────────────────────────┘
```

- **Evidence frames follow the clip's orientation.** Landscape clips: two 151 × 85 frames above the stat rows (as drawn). Portrait clips (the D1 default): two 9:16 frames of 72 × 128 on the left, with the stat rows stacked in the 146 px column to their right, so the card is the same height (about 147 px for frames, captions and stats) and the primary stays above the fold. Both frames in a pair always share one orientation; a pair from different set-ups is never shown (the "your best" frame falls back to this session's best).
- **Primary button logic** (one primary): before any logged practice, **Start drill**; after at least one logged practice, **Record re-test** (and "Start drill" becomes secondary). On a match day, the pre-match card (§8.8, variant) sits above and has no primary.
- **Evidence rule:** only measured or estimated stats appear here (research 09 §9; COACHING §8.2). If both of an item's stats are experimental at runtime, the tier chip shows Experimental and the stat rows are replaced by the key frames plus one sentence.
- **Compact variant** (session report): title, tier chip, one key frame (left, 120 × 68 for a landscape clip, 68 × 120 for a portrait clip), cue on one line, tertiary "See the drill ›". No buttons other than the tertiary link; the report is for understanding, Today is for doing.
- **Keep going variant** (`keep-going`): title "Nothing clear to change", body "Keep building consistency. Your toss and timing were steady on most serves.", no cue and no drill; primary "Record next session", secondary "Log practice".
- **Capture fix variant** (gate `low-confidence` or `too-few-serves`): `WarningCircleIcon`, title "We couldn't see enough to coach this time", the single capture fix from CAPTURE §8.4, primary "Set up camera".
- **Referral variant** (gate `pain-referral`): no focus content at all; the pain-pause card replaces the focus card: `FirstAidIcon` in `--critical`, "Coaching is paused. Your stats are safe.", the referral text from COACHING §10.3, and one secondary button "It's settled" (runs the body check). While a referral is active, **no cue, drill or re-test appears anywhere** (PRODUCT §7.7): the pre-match card, the warm-up entry, the experiment strip, "Try the other cue" and re-test reminders are hidden on every screen. Stats, videos, logs and recording stay available.
- **"My coach's focus"** (research 10 M8): a pinned focus shows the line "Pinned from your coach" with `PushPinIcon` above the title; evidence still shows.
- **Pre-match card** (research 10 M10; match day only, set from "Which night do you usually play?", from 12:00 on that day): a slim card above the focus card: `FlagPennantIcon` "Comp night tonight", the current cue in `title-2`, and "5-minute warm-up routine ›". No new focus, no primary button. Hidden while a referral is active.

### 8.9 Key-frame strip

- Event thumbnails in time order (ARCHITECTURE §5.5 `KeyFrameEvent`, one list shared with PRODUCT §6.6): **Release, Apex, Trophy, Lowest hip, Contact, Landing**, plus Setup first and Recovery last when detected. "Lowest hip" is the leg-drive and loading-depth frame (D5). Captions use the player glossary (§11): "Release", "Peak", "Top of swing", "Lowest point", "Contact", "Landing".
- Thumbnails follow the clip's orientation: **88 × 50** (16:9) for landscape clips, **50 × 88** (9:16) for portrait clips; radius 10, caption below; 8 px gaps; horizontal scroll with scroll snap; 20 px end padding. Six portrait thumbnails (6 × 58 − 8 = 340 px) fit the column without scrolling; with Setup and Recovery the strip scrolls. The focus event is scrolled into view on open.
- **Current phase:** 2 px `--ink` ring (Night: `--optic`) at 2 px offset.
- **Focus event:** `TargetIcon` 14 px + the word "Focus" beside the caption ("Peak · Focus"); not colour alone.
- Missing event (confidence < 0.5 or not found): thumbnail slot in `--surface-2` with `EyeSlashIcon` and "Not clear on this serve"; not tappable.
- Tap seeks the player to the event's frame (paused).
- Thumbnails come from stored key frames, so the strip works when the video was deleted (D8 "delete after analysis").

### 8.10 Phase timeline (scrubber)

Sits directly under the video (full width, 20 px gutters), 56 px tall:

- Track: 8 px tall, radius full, divided into the seven phase spans with 2 px `--surface` gaps (the dataviz surface gap). Spans alternate `--surface-2` and `--band` so neighbours are distinguishable; the focus phase span is `--ink-3` with a `TargetIcon` above it.
- No labels under the track; the current phase name is in the readout, and every span has an accessible name.
- Event ticks: 2 px × 14 px `--ink` lines at toss release, apex, trophy, lowest hip, contact and landing (the key-frame strip's events).
- Playhead: 2 px `--ink` line spanning 24 px, with a 16 px circular handle (`--surface` fill, 2 px `--ink` border); drag anywhere on the 56 px row. Hit area is the full row.
- Readout right-aligned above the track: "Frame 142 · 2.37 s" (`footnote` tabular) and the current phase name.
- Keyboard: Left/Right = 1 frame, Shift + Left/Right = 10 frames, Home/End = serve start/end, number keys 1–7 = phases. `role="slider"` with `aria-valuetext="Contact, frame 142 of 229"`.

### 8.11 Video player (serve playback)

The screen is portrait; the clip may be either orientation (D1: portrait is the default set-up, landscape at the fence the alternative). Aspect ratio is always preserved (research 09 [S8]; PRODUCT §6.6). Letterbox and pillarbox bars are `#0B0F0D`.

| Clip | Video box | Clip drawn at | Notes |
|---|---|---|---|
| Landscape (16:9) | 390 × 219, full-bleed | 390 × 219 | As before |
| Portrait (9:16), **Fit** (default) | 390 × 380 (45% of an 844 px viewport; `min(45dvh, 693px)`) | 214 × 380, pillarboxed and centred | The whole recorded frame; the player is about 90 px tall |
| Portrait, **Player** zoom | 390 × 380 | Scaled so the region from 0.2 m below the feet to 0.3 m above the highest toss peak in the session fills the box height (about 2 × at the default set-up, where the frame is about 8 m tall at the server), centred on the player's column, cropping any width beyond 390 px; drag to pan sideways | The player is about 180 px tall. Overlays, labels and hit areas scale with it. The zoom choice is remembered on the phone, not per serve |

- **Zoom toggle** (portrait clips only): a 44 px inverse pill at the video's bottom-right, `CornersOutIcon` "Zoom to you" / `CornersInIcon` "Whole frame"; shown with the controls and always in the accessibility tree. Frame stepping, overlays and the scrubber work identically in both zoom states.
- The video box never exceeds 45% of the viewport, so the phase timeline, transport and overlay chips always start above 60% of the screen height, whatever the clip.

On the video:
- **Top-left:** serve label pill "Serve 7 of 14" (`--surface-inverse` at 72%, `footnote` 600 `--ink-inverse`, radius full).
- **Top-right:** outcome tag pill "In" with the outcome mark (tap to change), or "Tag" if untagged.
- **Bottom:** a 48 px gradient scrim (`#0B0F0D` 0 → 55%) only while controls are visible; no controls float over the middle of the frame.
- **Tap on video** toggles controls; controls auto-hide after 3 s of playback (never while paused).

Below the video (on `--bg`, not over footage, so they stay readable in sun):
1. Phase timeline (§8.10).
2. **Transport row** (48 px buttons, centred): `CaretLeftIcon` (−1 frame), `PlayIcon`/`PauseIcon`, `CaretRightIcon` (+1 frame); left: speed chip "¼×" / "1×" toggle; right: `SkipBackIcon` / `SkipForwardIcon` for previous / next serve. Long-press on a frame-step button repeats at 10 frames a second. Frame stepping uses frame-accurate decode on the web and `AVPlayerItem.step(byCount:)` natively (research 09 [S19]).
3. **Overlay chips** (one at a time, research 09 §6.3): a radio group of choice chips: `PersonSimpleIcon` Body, `TennisBallIcon` Toss, `ArrowLineUpIcon` Contact, `ArrowFatLinesUpIcon` Legs, None. The row scrolls horizontally with 20 px end padding (§8.4 filter-row pattern) and scrolls the selected chip into view. Default: the focus item's overlay (COACHING §8.1 `evidence.overlay`), otherwise Body. Body draws the skeleton, and on the trophy frame also the `shoulder-line`; Legs draws `hip-rise`. Each chip label names what it draws; the overlay legend appears as one `footnote` line under the chips ("Faded joints: we're less sure where they are").
4. **Stat drawer** (§8.15 sheet, peek detent): peek shows three values for this serve (landscape clip) or two (portrait clip, because the video box is taller), the focus metric first, each with `MetricValue`; expanded shows every per-serve metric grouped by phase, including the loading-depth line (§8.7), with unavailable rows at the end.

**When the video was deleted:** the player becomes key-frame stepping: the seven key frames with overlays, the transport row steps between phases, and a line "Video deleted after analysis. Key frames kept." with `HardDrivesIcon`.

**Overlay drawings** (COACHING §8.1 ids; colours §2.7):

| Overlay id | Drawing |
|---|---|
| `apex-scatter` | Every serve's apex in this stratum as sky-blue dots (r 3, halo) on the key frame; this serve's apex larger (r 5) with a 2 px white ring; a 1 px white horizontal tick at the median height labelled "Your usual height" |
| `apex-vs-toe` | Vertical 2 px white line up from the front toe; sky-blue apex dot; label "12 cm in front of your toe" (or "behind") |
| `toss-arc` | Sky-blue ball positions from apex to contact joined by a 2 px path; label "Dropped 38 cm before contact" |
| `contact-height-line` | Horizontal 2 px white line at contact height across the player's column; label "1.46 × your height" |
| `contact-vs-toe` | Vertical toe line and the contact point (sky-blue dot r 5); label with the forward distance |
| `hip-path` | Mid-hip trace from toss release to contact as a 2 px white path; the lowest point marked with a 6 px white ring. Descriptive label only: "Hips dropped 6% of your height" (`loading-depth`). No band word, never "bend" |
| `hip-rise` | Contact frame (or the lowest-point frame when stepping): a 1 px white horizontal tick at the lowest mid-hip height, a second at the mid-hip height at contact, joined by a 2 px vertical white bracket beside the body (away from the toss side); label "Rose 9% of your height in 0.34 s" (`leg-drive`, `drive-time`). Never "jump" or "push" |
| `shoulder-line` | Trophy frame (side view): a 3 px white line through both shoulder landmarks (rectified), extended 20% past each shoulder; the player's usual line from the reference serves as a 2 px ghost-style dashed line (§2.7) pivoting on the mid-shoulder; label is the player-relative band word ("Higher than your usual"). Never degrees |
| `knee-rear` | Rear view only: hip–knee–ankle segments of the knee nearer the camera, 3 px white; label is the band word. Never degrees |
| `shoulder-over-shoulder` | Rear view only, contact frame: shoulder line as `shoulder-line`, with the usual line; label is the band word led by a 12 px `FlaskIcon` (experimental) |
| `timing-strip` | Not drawn on video; shown as the strip plot under the player (§9.3, rhythm) |
| `landing-marks` | Front-foot landing positions of every serve as white ticks on the floor row, relative to the start-toe line; label "Landed 34 cm into the court" (METRICS §7 flag 4 wording: "from your start position") |
| `outcome-tally` | Not drawn on video; the service-box map (§9.6) |
| `none` | Nothing |

Labels on video use the pill style from §2.7, placed at the end of the line away from the player's body, never overlapping the head.

### 8.12 Compare view (side by side and ghost)

Entry: "Compare" on Serve detail, the focus card's key frames, and the experiment result. Pick the other serve from a sheet: "Your best serve", "Last session", "Before the drill" (research 09 §6.3); never a professional (COACHING §8.1).

- **Segmented control** at the top: "Side by side | Ghost".
- **Side by side, landscape clips:** two 16:9 players stacked vertically, each 390 × 219, each with a label pill ("Today, serve 7" / "Your best, 12 Sep"). One shared phase timeline and transport row below both.
- **Side by side, portrait clips (the D1 default):** two 9:16 players in left and right halves, each 187 × 332 with a 16 px gap, each with its label pill at the top (truncated to "Today, 7" / "Best, 12 Sep" if needed). One shared phase timeline and transport row below both, starting at y 99 + 332 + 8. The Player zoom (§8.11) applies to both halves together.
- **Mixed orientations** (an upright clip against one filmed sideways at the fence): left and right halves, each clip fitted into 187 × 332 (the landscape clip letterboxed at 187 × 105, vertically centred), with the line "Filmed from different spots" under the players. Any statistic shown beside them carries the set-up note (ARCHITECTURE soft factors). Playback is **phase-synced**: each clip's phases are time-warped piecewise-linearly so toss release, trophy, contact and landing coincide (research 09 §6.1). The readout shows both clips' real times ("Contact: 0.92 s vs 0.88 s after release").
- **Ghost:** one player. The comparison serve's skeleton is drawn in the ghost style (§2.7) over the current video, aligned at the contact frame, scaled by standing body height in pixels and anchored at the start toe. A second chip "Show video ghost" (off by default) blends the comparison video at 40% opacity, enabled only when both clips come from the same camera set-up (same session or matched set-up); otherwise it is disabled with the reason "Different camera position".
- Labels "Solid: today · Dashed: your best" sit under the player as a legend (shape, not colour).
- With the device rotated to landscape while in Compare, landscape clips go to left and right halves; portrait clips keep left and right halves at full height.

### 8.13 Verdict block

Used on Compare, the experiment card and Progress tiles.

- **Large** (Compare): verdict chip at 36 px height with `headline` label and 20 px glyph; below it the sentence in `title-1` ("Your toss height spread went from 17 cm to 11 cm."), then `callout` `--ink-2` context ("13 serves each, same side view, deuce, first serves"), then the confirmation line with `HourglassMediumIcon` when present ("About 10 more serves to confirm").
- **Compact** (tiles and lists): 28 px chip with `caption` label, plus a one-line `footnote` context.
- A guard metric line sits beneath when METRICS §4.5 supplies one ("…but first serves in dropped a little; worth a look").
- Same-session re-test (CAPTURE §5.5 Experiment template): extra line "Compared within one session. Check again next time."

### 8.14 Tagging pad and tally counter

**Tagging pad** (per-serve outcome, research 10 M4 target: under 2 s per serve). The pad sits at the **same y on every serve and every clip orientation** (top at y 478 on a 390 × 844 screen, §10.8), because the video box above it is a fixed 390 × 219 in Tagging:

```
┌──────────────────┐ ┌──────────────────┐
│  ●  In           │ │  ▲  Net          │   169 × 88 each, radius 14
└──────────────────┘ └──────────────────┘   mark 16 px + label title-2
┌──────────────────┐ ┌──────────────────┐
│  ✕  Long         │ │  ✕  Wide         │   Long: ArrowUpIcon 16 after the label
└──────────────────┘ └──────────────────┘   Wide: ArrowsHorizontalIcon 16
   Let · Skip · Undo                        tertiary row, 44 px
```

- Buttons: `--surface` fill, 1 px `--line-strong`, the outcome mark (§2.6) at 16 px and the word. Pressed: `--surface-2` + scale 0.98 + the mark fills the button's left edge area for 160 ms. The layout is fixed so muscle memory works: In top-left, Net top-right, Long bottom-left, Wide bottom-right.
- Court-side: 2 px ink borders, labels 700.
- Keyboard: I, N, L, W; Space = replay; Z = undo.
- Accessibility: each button `aria-label="In"` etc.; after a tag, a polite live region says "Serve 7: in. Serve 8 of 15."
- **Serve attributes row** above the pad: segmented "1st | 2nd" and "Deuce | Ad", prefilled from the block card; an optional "Aimed at: T | Body | Wide" chip row appears when the block had a target. Changing an attribute applies to this serve and all following serves until changed again (sticky), shown by the text "Applies to the rest of this block".
- **Point-play mode** (double faults, METRICS §3.19): after a 1st serve tagged as a fault, the next serve is automatically set to "2nd"; after an in or a 2nd serve, it resets to "1st". A `footnote` line explains once: "We'll switch between first and second serves for you."

**Tally counter** (session tally, D3; CAPTURE §3.7 step 5): one big stepper "Serves in" (value `metric-hero` tabular, − and + buttons 64 × 64), with "of 15" beside it; three optional compact steppers for Net, Long, Wide (44 px buttons). Fault total must equal serves − in; if the optional counters don't add up, show "3 faults not sorted" in `--ink-3` rather than blocking.

### 8.15 Sheets

- Bottom sheets, radius 28 top corners, grabber 36 × 5 px (`--ink-3` at 40%) with a 44 px drag zone, level 3 surface, `--scrim` behind.
- Detents: **peek** (content height, max 40%), **medium** (50%), **large** (92%). Sheets that ask a question open at content height.
- Always a visible close affordance: `XIcon` button (44) top-right or a "Done" text button; swipe-down and Escape also close unless the sheet guards unsaved input ("Discard this log?").
- Focus is trapped while open and returns to the trigger on close. `role="dialog"`, `aria-modal="true"`, labelled by the sheet title (`title-2`).

**Sheet catalogue**

| Sheet | Contents | Primary |
|---|---|---|
| Body check (COACHING §10.1) | Shown before **every** recording and every logged practice; never skipped by a template, a recent answer or a re-test (PRODUCT §6.16). Title "Quick body check", question "How's your body today?", three full-width 52 px buttons: "All good", "A bit sore or tight", "It hurts". Follow-ups replace the content in place | none; each answer is the action |
| Red-flag questions (COACHING §10.2) | Checkbox list (each row 56 px, `CheckSquareOffsetIcon` states), two buttons "One or more of these" / "None of these" | none |
| Referral card (COACHING §10.3) | Full-height sheet that cannot be swiped away until acknowledged. Emergency: `--critical-soft` fill, `FirstAidIcon` 32 in `--critical`, `title-1` "Please stop and call 000 now.", body, Critical-fill button "Call 000" (a `tel:000` link). See a doctor today and Stop and book: `--surface` card, `FirstAidIcon` in `--critical`, copy from COACHING, secondary "OK" | "Call 000" (emergency only) |
| Practice log (COACHING §12.2) | Prefilled fields as choice chips; note field 140 characters with counter; body answer runs the body check if not "fine" | "Save log" |
| Match log (research 10 M6) | "Comp night, Tue 22 Sep" date chip; steppers for double faults and service games; optional "Rough first-serve %" slider in 10% steps labelled "rough"; "Did you use your cue?" Yes / No / Forgot; every field shows the "You logged" chip style | "Save" |
| Capture detail | Every non-passing check as a list row (glyph + message + fix) | none |
| Compare picker | Three rows: Your best serve / Last session / Before the drill, each with thumbnail and date; disabled rows show why ("No matched session yet") | none |
| Paywall (after the first "Did it work?" verdict, research 10 M9) | See §10.13 | "Start 7-day trial" |
| Confirm delete | Names exactly what goes and what stays (ARCHITECTURE §8.3), Destructive button; "Delete everything" requires typing "delete" | Destructive (not optic) |

### 8.16 Empty states

Centred in the available space, max width 300 px: 32 px icon in a 64 px `--surface-2` circle, `headline` title, `callout` `--ink-2` body (≤ 2 lines), one button. Never an illustration.

| Where | Title | Body | Action |
|---|---|---|---|
| Today, no sessions | Record your first serves | 15 serves from one side, about 10 minutes. We'll find one thing to work on. | Primary "Set up camera"; tertiary "See a sample session" |
| Sessions, none | No sessions yet | Your sessions will appear here after your first recording. | Secondary "Go to Record" |
| Progress, baseline building | Building your baseline | 1 of 2 matched sessions. Record another from the same side to see trends. | Secondary "Record" |
| Outcomes untagged | Tag your serves to see this | In, net, long or wide takes about 2 seconds a serve. | Secondary "Tag serves" |
| Compare, nothing matched | Nothing to compare yet | Compare needs another session from the same side, view and serve. | none |
| Search or filter, no match | No sessions match | Try a different side or view. | Tertiary "Clear filters" |

### 8.17 Loading and skeletons

- Local data loads fast; show nothing for the first 150 ms, then a skeleton that matches the final layout (tiles as `--surface-2` blocks with radius, text lines as 12 px bars). **No shimmer** (calm); static blocks.
- Recomputing (for example after tagging changes a rate): keep the previous render at 60% opacity with a small `footnote` "Updating…" line; no layout jump (dataviz: refetch keeps the frame).
- Errors: inline in the affected card with `WarningCircleIcon`, a plain sentence and one retry action. Toasts are only for transient confirmations.

### 8.18 Processing indicator

See §10.4 for the screen. Component anatomy:

- **Stage list:** four rows in the order ARCHITECTURE §5.8 reports them: "Finding serves", "Tracking the toss", "Timing each phase", "Choosing your focus". Each row: status glyph (done `CheckIcon` in `--ink`; active: a 20 px determinate ring in `--ink` showing that stage's fraction; waiting: 20 px `--line-strong` outline circle) + label + live detail in `footnote` tabular ("9 found", "serve 7 of 12").
- **Overall bar:** 6 px, radius full, track `--surface-2`, fill `--ink` (Night: `--optic`), percentage right-aligned in `footnote` tabular. ETA text appears only after 5 s of measured throughput: "About 1 minute left".
- No indeterminate spinners anywhere in the app. If a stage cannot report progress, its row shows the elapsed time instead.

### 8.19 Toasts

Level 4 (`--surface-inverse`), radius 20, 16 px padding, sits 12 px above the tab bar (or the bottom safe area), max width 350, max 2 lines of `callout` `--ink-inverse`, optional one text action in `--ink-inverse` weight 700 with an underline (optic text would fail on Night's light inverse surface). Duration 4 s, or 8 s when it carries Undo (ARCHITECTURE §8.3). `role="status"` (polite). Used for: "Serve deleted. Undo", "Practice logged", "Exported 3 files". Never for errors that need action, never for marketing.

### 8.20 Live capture checklist item

Used on the live framing checklist (bottom tray in the portrait set-up, right rail in the landscape set-up) and in the capture detail sheet. Row 44 px (38 px when non-interactive on the camera screen): glyph (pass `CheckCircleIcon` in `--ink`; warn `WarningCircleIcon` in `--attention`; block `XCircleIcon` in `--attention`; not yet checked `CircleDashedIcon` in `--ink-3`) + label ("Level", "In frame", "Room above", "Room ahead", "Steady", "Light", "Ball seen", "60 fps", "Size") + short value in `footnote` tabular. The word always states the result, so the glyph is never alone. The portrait tray shows glyph + word only; values appear in the capture detail sheet and the landscape rail.

D1 thresholds as the rows show them (CAPTURE §9 owns the checks; values from gap ranges §6 and gap geometry §6):

| Row | Pass | Warn (Ready still allowed) | Block |
|---|---|---|---|
| Room above (frame top at the player, from the standing player, rectified, minus the 0.12 m toss allowance) | "4.6 m, needs 4.5" | 4.3 to 4.5 m: "4.4 m. Very high tosses will be estimated" | Measured below 4.3 m: "4.1 m, needs 4.5". "Record anyway" is not offered for a measured block (D1) |
| Level (pitch from motion sensors) | Level within 2°, or "Tilted 3°, corrected" up to 5° | — | Measured above 5°: "Tilted 7°". Not overridable. Motion permission denied: warn "Level by eye" (tilt unknown) |
| Size (standing player in pixels) | 250 px or more | Below 250 px: "Small in frame. Use 4K" (common sideways at the fence on 1080p) | — |

### 8.21 Badges and banners

- **Plus badge:** text "Plus" in a pill with 1 px `--line-strong` outline, `caption` 600. Marks features in the paid tier. No lock glyphs.
- **Early read badge:** §8.7.
- **Sample data banner** (ARCHITECTURE §11): full-width 36 px bar under the app bar, `--surface-2`, `InfoIcon` + "Sample data · synthetic player" (PRODUCT §4.4 rule 11) + "Remove" text button on Profile only. Present on every screen showing demo data. The sample clips use the D1 default set-up (portrait), so the sample shows the portrait-clip layouts.
- **Experimental section header:** `FlaskIcon` + "Experimental" + one line "Not yet checked against a radar or measured marks. Not used for coaching."

### 8.22 Inputs

- Labels above inputs (`footnote` 600 `--ink-2`), helper text below (`footnote` `--ink-3`), error text below in `--critical` with `WarningCircleIcon`. No placeholder-as-label.
- Text and number inputs: 52 px tall, radius 14, `--surface` fill, 1 px `--line-strong`, focus = 2 px `--focus` ring. Court-side: 2 px ink border.
- **Height input** (onboarding O5 and profile, needed for centimetres): a cm stepper from 140 to 210 whose value is also typeable (PRODUCT §6.1); stored in metres; helper "We use it to turn your video into centimetres. It never leaves this phone." A soft-flagged value (gap ranges §8) asks for confirmation inline; nothing outside 140 to 210 can be entered.
- **Steppers:** − / value / + with 44 px buttons (64 px for the tally's main counter); value tabular.
- **Sliders:** only for the rough first-serve % (10% steps, labelled stops); thumb 28 px, track 6 px; `aria-valuetext` in words.

### 8.23 Switch

51 × 31 px visual in a 44 px row; track off `--surface-2` with 1 px `--line-strong`; on = `--optic` with `--optic-edge` border (Day) and a `CheckIcon` 12 px inside the knob, so the state is not colour-only. Knob `--surface`. Court-side: on = `--ink` track.

---

## 9. Charts

All charts are hand-built SVG (ARCHITECTURE §14: no chart library), sized for a 318 px card interior, built on one shared anatomy. Statistics (Wilson, intervals, SWC, verdicts) come from `analysis/metrics/stats.ts`; charts never compute statistics themselves.

### 9.1 Shared anatomy and rules

- **Container:** a level 1 card holding a `<figure>`. The title row is an information-rich sentence in `headline` that states the takeaway, not just the metric name (research 09 [S1][S4]): "Toss height spread: 11 cm, inside your usual range". The data-state chip sits on the title row's right. A `footnote` subtitle names the matched conditions in words: "Side view, deuce, first serves".
- **Plot:** full card width (318 px); explanation text above the plot, never beside it (research 09 §5).
- **Axes:** at most 3–4 ticks with round values (research 09 [S2]); tick labels `caption` tabular `--ink-3`, placed inside the plot above their gridline to save width. Gridlines 1 px solid `--line`; the baseline 1 px `--line-strong`. Never dashed gridlines. Fixed domains where the ends mean something (rates 0–100%).
- **Direction hint:** metrics where lower is better carry a `footnote` note with `ArrowDownIcon` 12 px: "Lower is steadier". Never green-up / red-down arrows.
- **Marks:** lines 2 px round-join; markers r 4 (8 px) with a 2 px ring in the chart surface colour (keeps marks ≥ 3:1 even where they sit on a `--band` region); interval bands at 22% (CI80) and 12% (CI95) of the mark colour, radius full; dashed strokes **only** for experimental marks. Serve marks always use the outcome vocabulary (§2.6).
- **Hollow marks** mean a plotted continuous value is player-entered (match-log series, radar speeds). Unit charts of tagged outcomes (the service-box map, rate unit rows) use the normal outcome marks, with the "You logged" chip on the chart.
- **Legend:** for two or more series, a legend row above the plot using the actual mark shapes (not boxes), plus direct labels on the latest or selected point. Single series: no legend; the title names it.
- **Selection (touch first):** tap a mark to select it. The nearest mark within 24 px wins (a Voronoi-style nearest-point layer, not the 8 px painted mark). The selected mark gets a 2 px `--ink` ring; a callout pill (`--surface-inverse`, `footnote`) shows the **value first**, then its label: "3.42 m · Serve 7, in". Tap elsewhere to clear. Keyboard: Tab focuses the chart, arrow keys move between marks, Enter opens the serve, Escape clears. Same content on focus as on tap.
- **Table view:** every chart has a "Show as table" tertiary toggle under it that reveals a `<table>` with the same rows, including each row's state chip and n. Tooltips and callouts never hold information that the table lacks (dataviz: tooltips enhance, never gate).
- **Screen readers:** the `<figure>` is labelled by its visible title and described by its visible subtitle and summary; the SVG is `aria-hidden="true"`; the table is the accessible equivalent. In the iOS shell, charts later expose `AXChartDescriptor` (research 09 [S18]).
- **Insufficient data:** the plot area is replaced by the reason in `callout` `--ink-2` with the state glyph: "Needs 8 serves from one side. You have 6."
- **Consistency:** the same metric uses the same y-domain in every small multiple and in its tile, trend and Metric info views (research 09 [S1]).
- **Motion:** §7.2 chart reveal only on the first view of a new report.

### 9.2 Sparkline with typical-range band

Used in Progress question tiles (318 × 72 plot), Metric info (318 × 180 plot with axes) and optionally inside metric tiles (137 × 28, no axes).

- **x:** matched sessions in order (not calendar days), the last 8 at most, equally spaced; the rightmost point sits 28 px from the right edge to leave room for its label.
- **y:** the metric's fixed display domain (`metrics.json` display domain if defined; otherwise the span of all plotted values and the band, padded by 10% each side).
- **Typical-range band ("usual"):** a full-width `--band` rectangle from the lowest to the highest value of the player's previous matched sessions (up to 6 before the latest, provisional sessions excluded), drawn only when there are at least 2 such sessions. A `caption` label "usual" sits inside its left end. The same numbers appear in text on the tile ("usual 12 to 15 cm") (Tufte's normal-range band, research 09 [S72]). METRICS owns the final definition of "usual" (§15).
- **Line and points:** 2 px `--ink-2` line; points r 3 `--ink-2` with surface ring; provisional sessions ("early read") r 2 `--ink-3`.
- **Latest point:** r 5 in `--good` with a surface ring, direct label (value, `footnote` 600 `--ink`) above it, or below if within 16 px of the top.
- **Player-entered series** (for example first serves in per session): hollow points (2 px ring, no fill); the latest is a 2.5 px `--good` ring.
- **Metric info detail variant:** adds axes, and each session point carries a vertical gradient interval (8 px wide, CI80 at 22% and CI95 at 12% of `--ink-2`, radius full) instead of error bars (research 09 [S66][S67]).
- **Under the plot:** the trend verdict (compact verdict block, §8.13) with n: "Last 5 matched sessions". Before 3 matched sessions: "Building your baseline (1 of 2 sessions)" and no verdict (METRICS §4.1).

### 9.3 Serve strip (dot plot of serves)

Used in the session report ("All serves"), the rhythm view (`timing-strip`), Metric info and experiment detail.

- One row per group, row height 56 px, plot width 318 px, x-axis at the bottom (3 ticks, units in the last tick label: "3.2", "3.4", "3.6 m").
- **Marks:** one per serve, outcome vocabulary (§2.6), r 4 with surface ring. **Beeswarm:** a mark that would overlap an earlier one by more than 3 px moves up, then down, in 9 px steps (max ± 2 steps); beyond that, marks overlap and the tap layer still separates them.
- **Median:** a 2 px × 28 px `--ink` tick with the label "median 3.42 m" (`footnote`) above, flipped to the side with more room.
- **Usual range:** `--band` rectangle behind the row from the player's previous matched sessions, labelled "usual".
- Per-serve estimate intervals are not drawn in the strip (clutter); they show in the callout and in Serve detail.
- **Metric switcher** (session report): segmented control above the strip: "Toss height | Contact | Timing". Switching keeps the selected serve.
- **Serve index** (companion row above the strip in the report): one 36 × 44 button per serve in order, showing the outcome mark and the serve number (`caption` tabular), horizontally scrollable. Excluded serves show `EyeSlashIcon`. Tapping opens Serve detail.

### 9.4 Toss map (apex positions)

The hero chart (D5; research 10 M2). Hero tile: 318 × 180. Metric info: 318 × 240.

- **Side view axes:** x = `toss-forward` (cm from the start toe; positive = into the court), **always drawn with "into court" to the right**, whichever way the net faces in the video (left-handers and camera side are normalised). y = apex height above the floor, labelled in metres (the ratio to standing height appears in Metric info).
- **Equal scale:** 1 cm is the same number of px on both axes, so the width and height of the cloud can be compared by eye. Domain: centred on this session's centroid, spanning max(80 cm, 1.3 × the data extent) horizontally; the vertical span follows from the aspect ratio and grows (with the horizontal) if the data need it.
- **References:** a vertical 1 px `--line-strong` line at x = 0 labelled "Front toe" (`caption`, top). If 0 is outside the domain, an edge label "Front toe 45 cm ←" instead. Two horizontal gridlines at round heights (for example 3.3 m, 3.5 m), labelled at the left.
- **"Your usual area":** an ellipse from the player's previous matched sessions' apexes, sized to hold about two-thirds of them (bivariate normal, 1.5 SD), filled `--band` with a 1 px `--line-strong` edge and a `caption` label "usual". Shown only with ≥ 2 previous matched sessions.
- **Marks:** each serve's apex in the outcome vocabulary. **Centroid:** a 12 px "+" in 2 px `--ink`.
- **Readouts** (in the tile, not on the plot): "Height spread 11 cm" and "Front-to-back spread 8 cm", each with its chip and n.
- **Estimate note:** per-serve uncertainty is not drawn on the map. The shared errors (body height, tilt, the toss sitting nearer the camera than the body) move the whole cloud rather than widening it (METRICS §1.2; D1: about 8 to 12 cm high for a toss 0.3 m nearer the camera), which Metric info explains in one sentence: "The whole cloud could sit a few centimetres higher or lower; its spread is more certain than its position." The side-view sideways-wobble line (§3.3 rule 12) sits under the map.
- **Peaks above the picture** (`APEX_EXTRAPOLATED`): drawn as normal marks plus a 1 px `--ink-2` vertical interval line (their wider uncertainty) and counted in the caption: "2 peaks were above the picture and are estimated." Apexes marked unavailable are not plotted and are counted: "1 toss left the frame."
- **Domain guard:** the y-domain never extends past the plausibility bounds (gap ranges §8); a soft-flagged apex (for example above 4.6 m) is plotted with the §3.3 rule 14 treatment, a hard-rejected one is not plotted.
- **Axis titles:** "Into court →" (bottom right) and "Toss height" (top left), `caption` `--ink-3`.
- **Rear view variant:** x = `toss-lateral`, "Towards your hitting arm →"; experimental styling (dashed rings) while `toss-lateral` is experimental.
- **Signature insight overlay** (METRICS §4.7): when an outcome-linked contrast surfaces, the map shows the centroid of "in" serves and of faults as two labelled "+" marks ("In: +", "Faults: +") joined by a 1 px `--ink-2` line with the difference as a label ("12 cm"). The sentence above reads as association, never cause: "Your serves that went in tended to have the toss further in front."

### 9.5 Rhythm view

The `timing-strip` overlay (COACHING §8.1) is a serve strip (§9.3) with x = `rhythm-release-to-contact` in seconds (two decimals), the median tick, the usual band, and the readout "Rhythm spread 45 ms" in the header. `trophy-pause` is added as a second row only when the experimental toggle is on, with dashed marks.

### 9.6 Service-box map (where serves landed)

318 × 300. Answers "Where are my serves landing?" (research 09 §5).

**Geometry (schematic top-down view from the server's end).** Only the target service box is drawn, to scale (4.115 m wide × 6.40 m deep, ratio 1 : 1.555), at 150 × 233 px, centred. The net is its near (bottom) edge as a 3 px `--ink-2` line extending 40 px each side; the service line is the top edge; box lines 2 px `--ink-2`; box fill `--surface-2`.
- **Zones:** three equal columns labelled at the top inside the box in `caption`. Deuce target box, seen from the server: **Wide | Body | T** from left to right. Ad target box: **T | Body | Wide**. (The deuce server serves across to the box whose outer sideline is on their left.)
- **Fault strips (no fill, `caption` labels in `--ink-3`):** "Net" strip 32 px below the net line; "Long" strip 32 px above the service line; "Wide" strip 40 px outside the outer sideline.

**Side view (player-entered, the v1 default).**
- Each tagged serve is one unit mark (8 px on a 12 px grid) packed into its cell: in serves in their logged result zone; net faults in the Net strip under the column they were aimed at (or centred if no target was logged); long faults in the Long strip; wide faults in the Wide strip.
- In serves with no zone logged are packed in a row under the diagram: "In, zone not logged: 5".
- Each cell shows its count in `headline` tabular at its top-right. More than 12 marks in a cell: show one mark and the count only.
- Chip on the title row: "You logged". Caption: "Schematic: each mark is a serve you logged, in the zone you logged. It isn't a measured landing spot."
- Under the diagram: "On target: 7 of 11 (you logged)" when targets were tagged.

**Rear view (experimental auto outcomes, only with the rear "View from behind" and the toggle on).**
- Bounce points at their calibrated court positions: in = dashed ring r 4 in `--good`; fault = cross at 60% opacity inside a dashed 10 px ring in `--bad`.
- "Close call" bounces (METRICS §3.18) get a 14 px dashed ring in `--attention` and are counted separately: "3 close calls (you decide)".
- The uncertainty ellipse is drawn only for the selected mark.
- Chip "Experimental". Rear and side statistics are never shown on the same map (D1).

### 9.7 Before / after comparison with interval bars

The chart under every "Did it work?" verdict (§10.11) and in experiment detail. 318 × 176.

- **Rows:** "Before" and "After" (row labels in a 64 px left column, `footnote` 600, with "3 sessions, 38 serves" under each in `caption`). Before is `--neutral`, After is `--good` (emphasis form, §2.5b).
- **Per-serve marks:** r 3.5 dots in the row colour, beeswarmed within ± 14 px of the row centre (frequency framing, research 09 [S63][S64]).
- **Interval bar (gradient interval, not an error bar):** two nested rounded bars centred on the row: CI95 10 px tall at 12% of the row colour, CI80 10 px tall at 22%; the estimate as a 2 × 18 px tick in the full row colour. Values in the table view and in the sentence above.
- **"About the same" zone:** a `--band` vertical band spanning both rows, centred on the Before estimate ± the metric's SWC (METRICS §4.5), labelled "About the same" at its top in `caption`. The After interval clearing this band is exactly what "Clearly better" means, so the picture and the verdict agree.
- **Axis:** 3 ticks; direction label at the axis end for lower-is-better metrics ("← Steadier").
- **Spread metrics** (the D5 heroes): the main plot's x is the spread itself (cm); each row shows the spread estimate tick with its CI80/CI95 bars (chi-square or bootstrap, METRICS §4.3) and no per-serve dots. Below it, two 318 × 40 "evidence" strips (one per row) show each serve's distance from its own session's median, so the player can see the cloud tighten. Title of the evidence strips: "Each serve's distance from its session's middle".
- **Rates:** x = 0–100% (fixed); each row shows the Wilson CI80/CI95 bars and, instead of dots, a unit row of n tiny outcome marks (in circles first, then faults), so "8 of 12" is visible as marks.
- **Unmatched:** the chart is replaced by the verdict "Not comparable yet" and the reason.

### 9.8 Wilson interval bar (inline, for rates in tiles)

137 × 12 px. No filled track (a progress-bar look would imply a target): a 1 px `--line-strong` baseline from 0 to 100% with 2 px ticks at 0, 50 and 100; the Wilson CI95 as a 6 px rounded bar at 25% of `--good`; the observed rate as a 2 × 12 px `--ink` tick. Shown only when n ≥ 10 (METRICS §4.1); below that the tile shows "7 of 9 in" and the unit marks instead.

### 9.9 Match nights beside practice (research 10 M6)

Two small multiples stacked with a shared x-axis of season weeks (318 × 64 each): top, the focus process metric per practice session (solid points); bottom, double faults per comp night (hollow points, player-entered). Separate y-axes in separate plots, never a dual-axis chart. Caption: "Comp nights are your own log. We show them next to practice, not combined." No verdict is computed across the two.

### 9.10 Court and set-up diagrams (CAPTURE §4)

Drawn as SVG with these tokens so they match the charts: court surface `--surface-2`; court lines 2 px `--ink-2` (3 px `--ink` in Court-side); the phone as `DeviceMobileCameraIcon` 24 px in `--ink` (drawn upright for the default set-up and turned 90° for the fence set-up); the sun as `SunIcon` in `--attention`; field-of-view wedge `--good` at 12% fill with 1 px `--good` edges; dimension lines 1 px `--ink-3` with 6 px end ticks and `caption` labels measured **from the centre mark** (D1): "7-8 m from the centre mark" and "1.3-1.6 m high" for the default (upright, between courts or just outside the doubles alley, level); "8.5-9.5 m from the centre mark" and "1.4-1.8 m high" for the fence set-up. The side-elevation diagram marks the framing rule, not a distance: a dashed 1 px `--ink-3` line at 4.5 m labelled "Top of the picture: 4.5 m or more above the court at you", with the phone's field-of-view wedge reaching it; the top-down player as a 14 px circle head and a 28 × 6 px shoulder bar in `--ink`, labelled "You"; ball positions on the side-elevation toss arc as 4 px `--good` dots every 8 px (diagrams may use dotted paths; data charts may not). Cross and tick marks in Diagram B's inset use `XIcon` and `CheckIcon`, never emoji. Alt text from CAPTURE §4.

---

## 10. Screens (390 × 844)

Wireframes show y-positions in CSS px from the top of the screen (status bar included). Illustrative values in wireframes are **examples, not data**. Copy in quotes is final unless marked *[placeholder]*; coaching and capture strings come from COACHING.md and CAPTURE.md.

Flow map (D10; research 09 §13):

```
Onboarding (O1-O9) → Sample report or Record
Today ─┬─ Focus & drill → Drill player → Body check → Practice log
       ├─ Record re-test ─┐
Record (setup) ───────────┴→ Body check (every time) → Set-up choice (upright default / sideways at the fence)
   → Live framing → Serving-spot states → Countdown → Recording → Tally → Processing
   → Session report → Serve detail → Compare
                    → Tagging
Sessions → Session report
Progress → Trend (Metric info) / Experiment → Compare ("Did it work?") → Paywall (first time)
Profile (from Today) → Goals, Comfort, Storage & privacy, How we measure, Appearance, Plan
```

### 10.1 Onboarding (first run)

**PRODUCT §6.1 owns the steps, options, copy and stored fields; this section mirrors them exactly (O1–O9) and adds only the visual treatment.** Short, one question per screen, every optional step skippable, no deck of tutorial cards; camera and motion permissions are asked only at the first Live framing, and there is no paywall before the first report (research 09 §8, [S9][S80]; research 10 M1).

**Question screen template** (O2–O8):

```
 47 │ (<)          ● ● ● ○ ○ ○ ○ ○ ○        │ app bar: Back (always, except O1) + progress dots
 99 │ How do you play?                     │ title-1, one question
155 │ ┌ choice row 64 ───────────────────┐ │ full-width choice rows (radio or multi-select,
    │ └──────────────────────────────────┘ │ CheckIcon when selected, §8.4); none preselected
    │ ...                                  │ follow-up questions reveal in place below
    │ Helper or safety line                │ footnote --ink-2
754 │ ┌ bottom action bar ───────────────┐ │ primary "Continue", disabled with a helper until
    │ │ [ Continue                     ] │ │ a required answer exists; "Skip" tertiary for
    │ └──────────────────────────────────┘ │ optional steps
```

- **Progress dots:** nine 6 px dots, 8 px apart, centred in the app bar: done `--ink-3` fill, current `--ink` fill, upcoming 1 px `--line-strong` ring. No "Step 3 of 9" text on screen; the accessible name is "Question 3 of 9".
- **Equal-weight choices** (O7 comfort consent, O8 usage counts): two secondary buttons of identical size side by side (169 × 52), never optic and never primary + tertiary, so neither answer is nudged (APP 3.3 express consent).
- **Error saving:** inline under the question, `WarningCircleIcon` + "We couldn't save that. Try again." The answers stay on screen.

| # | Screen | Visual treatment | Options (PRODUCT §6.1, verbatim) | Stored as |
|---|---|---|---|---|
| O1 | Welcome | Title "Serve Coach" (`title-1`); the line in `title-2`, 4 short lines; a non-interactive preview of the sample toss map rendered by the real components from the demo seed (318 × 180, caption "Sample: a computer-generated player"); "Everything stays on this phone." in `callout` `--ink-2` with `ShieldCheckIcon`; primary **Get started** | "Film a few serves. See what your toss is doing. Practise one change. Find out if it worked." | none |
| O2 | Age | Two 64 px rows; tapping one is the answer (no Continue). **No** replaces the screen with the message in `title-2` and no further steps; nothing is stored. Back returns to the question | "Are you 18 or over?" **Yes** / **No**. No: "Serve Coach is for adults while we're in beta. We'd love to have you when it opens up." | `ageBand = '18-plus'` |
| O3 | How you play | Four multi-select rows; the last is exclusive (selecting it clears the others, and the reverse). If any comp is chosen, "Which night do you usually play?" reveals below as day chips in two rows (Mon–Thu, Fri–Sun; 44 px, 8 px gaps) with **Skip** | **Pennant** · **Night comp or association** · **Another league** · **No comp: social hits or booked courts** | `playStyle[]` (`pennant`, `night-comp`, `other-league`, `no-comp`), `matchNights[]` |
| O4 | Goal (M1) | Four 64 px rows, **none preselected**, in this order. Choosing the last reveals its safety line in `footnote` with `HeartbeatIcon` | "What costs you points on serve?" **Double faults** · **Not enough first serves in** · **Not enough pace** · **Serving feels like hard work**. Last: "If something hurts, see a physio or GP. This setting just keeps sessions gentler." | `goal` |
| O5 | About you | Height: stepper in cm (140 to 210), empty until set, − / + 44 px, the value also typeable; "Why?" tertiary reveals the reason line. A soft-flagged height (below 145 or above 205 cm, gap ranges §8) asks "Just checking: 1.43 m?" inline. Hand: segmented **Right** / **Left**, none preselected | "Your height" · Why: "We use it to turn your video into centimetres. It never leaves this phone." · "Which hand do you serve with?" | `heightM`, `handedness` |
| O6 | Level | UTR: decimal field (1.00 to 16.50) with a secondary "I don't have one". If none: three 64 px rows. **Skip** keeps the middle option. Footnote "You can change this any time." | "Do you have a UTR?" · "Which sounds most like you?" **Still getting my serve going** / **I get most serves in but want more** / **I play competition or pennant** | `utr?`, `level` |
| O7 | Comfort | Six multi-select rows (**None** exclusive), the two lines in `footnote`; if any area is chosen, the save question reveals with equal-weight buttons | "Any areas to go easy on?" **Shoulder** · **Elbow or wrist** · **Back** · **Hip, knee or ankle** · **Somewhere else** · **None**. PRODUCT §6.1 and COACHING §10.3 lines. "Save these on this phone so we can adjust your drills? They never leave this phone." **Save on this phone** / **Don't save** | `comfortRegions[]` (local only), `consents.comfort` |
| O8 | Privacy | Title in `title-1`; four rows with `ShieldCheckIcon`; the counts question (equal-weight buttons) appears **only if the D8 amendment is accepted**; "Privacy policy" tertiary link | "Your serve stays on your phone" + the four PRODUCT §6.1 lines; optional "Help us improve Serve Coach by sharing anonymous usage counts?…" **Share counts** / **Don't share** | `consents.usageCounts` |
| O9 | Ready | Title in `title-1`; primary **See a sample session**; secondary **Set up my first recording**; note in `footnote` `--ink-3` | "Want to see how it works first?" Note: "The sample uses a computer-generated player, analysed by the real engine." | none |

Computed at the end (not shown): `inSegment` (D11, from `playStyle`) and `levelBand`.

**After O9, the sample session** (PRODUCT §7.1): the **Session report** (§10.6) with the demo seed and the sample banner. Three one-line coach marks, shown once, one at a time, as small anchored callouts (not modal) and skippable: the headline "One sentence first", a label chip "Every number says how we got it", the focus card "One change, with a cue and a drill". Tapping the evidence frame opens Serve detail on the apex frame with the hint "Tap a phase to jump there". The end card "Ready to record yours?…" carries primary **Set up my first session**.

### 10.2 Today

Purpose: "What should I do now?" (research 09 §13.1). One primary action, contextual.

```
  0 ┌──────────────────────────────────────┐
    │ status bar                           │
 47 │                          (UserCircle)│ app bar 52
 99 │ Today                                │ display (large title)
139 │ Sunday 27 September                  │ footnote --ink-3
167 │ ┌ Pre-match card (match days) ─────┐ │ 72 tall, only on match day
    │ │ FlagPennant Comp night tonight    │ │
    │ │ “Lift it like an elevator.”       │ │ title-2
    │ └──────────────────────────────────┘ │
251 │ ┌ Focus card (full, §8.8) ──────────┐ │ top optic bar
    │ │ Your focus     [Research-backed]  │ │
    │ │ Steady toss height                │ │
    │ │ [key frame]  [your best]          │ │
    │ │ Toss height spread 17 cm ≈ usual..│ │
    │ │ “Lift it like an elevator.”       │ │
    │ │ Fence-line toss ladder · 8 min    │ │
624 │ │ [ Start drill                   ] │ │ primary, visible above the fold
688 │ │ [Log practice]   Why this focus?  │ │
    │ │ Re-test: 12 first serves, deuce   │ │
    │ │ Sore today? Tell us first ›       │ │
    │ └──────────────────────────────────┘ │
754 │ Today | Record | Sessions | Progress │ tab bar 56 + 34
    └──────────────────────────────────────┘
below the fold:
    ┌ Experiment strip ──────────────────┐   "Day 3 of your toss experiment.
    │ 2 practices logged. Re-test ready."│    ArrowsClockwiseIcon; tap → Compare/Record
    └────────────────────────────────────┘
    ┌ Last session ──────────────────────┐   date, "Side view, 14 serves"
    │ headline sentence (2 lines)        │   capture line (§3.6)
    │ Open report ›                      │   tertiary
    └────────────────────────────────────┘
    ┌ Comp night log ────────────────────┐   "How did Tuesday go?" (morning after a
    │ Log it in 20 seconds ›             │    match night only; opens Match log sheet)
    └────────────────────────────────────┘
```

- **Primary action:** "Start drill" until a practice is logged, then "Record re-test"; "Record your first serves" for new players (empty state §8.16). Never two optic buttons.
- **Baseline building** (first sessions): the experiment strip reads "Building your baseline: 1 of 2 sessions" with a secondary "Record" button.
- **Referral active** (PRODUCT §6.2 priority 1 and §7.7: no drills or cues during a pain pause): the pain-pause card (§8.8 referral variant) sits at y 167 in the focus card's place. **Hidden:** the pre-match card and its warm-up entry, the focus card, the experiment strip ("Re-test ready"), re-test lines and "Try the other cue". **Kept:** the last-session card and the comp-night log (records, not coaching). No optic button on the screen; "It's settled" on the card is the only action. On the Record tab the templates stay usable under the line "Coaching is paused. Recording is still available if you're comfortable.", and the Re-test template is not pinned.
- **Rest weeks:** nothing changes colour or scolds; after 14 days without a session the last-session card says "Welcome back. Your focus is where you left it." No streak counters anywhere.
- Pull-to-refresh: none (local data).

### 10.3 Record: set-up, live framing, recording, tally

**R1 Set-up (portrait, Record tab root)**

```
 47 │ app bar                              │
 99 │ Record                               │ display
151 │ Session plan                         │ footnote label
175 │ ( ) Check-in          15 serves  30 m│ radio cards 64 each (PRODUCT §6.3.1,
239 │ (•) Experiment        30 serves  45 m│ research 10 M3). A due Re-test is pinned
303 │ ( ) Second-serve check-in  15    30 m│ first and preselected
367 │ ( ) Both sides        30 serves  45 m│
431 │ ( ) View from behind             ›   │ optional rear view (D1 second angle)
503 │ This block                           │
527 │ ┌ Side    [Deuce] [Ad]            ┐  │ choice chips, prefilled from the
    │ │ Serves  [First] [Second]        │  │ active experiment's stratum
    │ │ Mostly  [Flat][Slice][Kick][Mixed] │ optional
    │ │ Aiming  [T][Body][Wide][Mixed]  │  │ optional; one target is needed for a speed range
    │ │ Wind    [Calm][Breezy][Windy]   │  │
    │ └────────────────────────────────┘  │
    │ FilmStrip 60 fps (recommended)    › │ list row → frame-rate sheet (CAPTURE §3.3)
    │ Hit-sound timing: Off             › │ list row → opt-in sheet (CAPTURE §7.2)
    │ Before you head out               › │ list row
    │ FilmReel Import a video           › │ list row
664 │ ┌ bottom action bar ───────────────┐ │ level 2, above the tab bar
    │ │ [ Set up camera                ] │ │ primary
    │ └──────────────────────────────────┘ │
754 │ tab bar                              │
```

- When a re-test is due, the plan is preselected and the block card is locked to the experiment's stratum with the line "Matched to your experiment" and `PushPinIcon`; "Change" unlocks it with a warning that the comparison will say "Not comparable yet". While a referral is active the Re-test is not pinned (§10.2).
- **Aiming and speed** (D4): with experimental metrics on and a frame rate of 120 fps or more, a `footnote` under Aiming reads "For a speed range, pick one target: T, Body or Wide." Mixed or no target leaves speed unavailable with "Tag your target".
- **Hit-sound timing** row (D4): off by default; its sheet says the sound only times contact, is turned into timestamps on the phone and is never kept, and is never used for speed.
- Tapping **Set up camera**: **body check sheet, every time** (COACHING §10.1; PRODUCT §6.16: before every recording, never skipped by a template or a recent answer) → first time only, "Filming at the courts" sheet (CAPTURE §7.1) → **R2 set-up choice** → first time only, camera and motion permission pre-alerts, each with one "Continue" button (research 09 [S14]; motion is needed to measure and remove tilt, D1) → R3.
- A status row appears at the top while an analysis runs: "Analysing Sat 26 Sep: 64%" › Processing.

**R2 Set-up choice** (portrait, full screen, Court-side). One question: where the phone goes. The default is preselected; the player's last choice is remembered (`captureDefaults.orientation`, ARCHITECTURE §7.1), but the card order never changes. Copy is *[placeholder]* until CAPTURE §2–3 is revised to D1.

```
 47 │ (<)                                  │
 99 │ Where will your phone go?            │ title-1
155 │ ┌ (•) Upright beside the court ────┐ │ radio card, 168 tall; "Recommended" caption pill
    │ │ [top-down diagram, 120 × 72]      │ │ §9.10 style: phone 7-8 m from the centre mark
    │ │ 7 to 8 m from the centre mark,    │ │ callout
    │ │ between courts or just outside    │ │
    │ │ the doubles alley. Phone 1.3 to   │ │
    │ │ 1.6 m high, level.                │ │
    │ └──────────────────────────────────┘ │
335 │ ┌ ( ) Sideways at the fence ───────┐ │ radio card, 168 tall
    │ │ [top-down diagram, 120 × 72]      │ │ phone at the side fence
    │ │ 8.5 to 9.5 m from the centre mark,│ │
    │ │ at the side fence. Phone 1.4 to   │ │
    │ │ 1.8 m high. Use 4K if you can.    │ │
    │ └──────────────────────────────────┘ │
523 │ Either way: on your hitting-arm side,│ footnote --ink-2
    │ 1x lens, lens pointing along the     │
    │ baseline at you.                     │
754 │ [ Continue ]                         │ bottom action bar, primary
```

- The two cards differ by word, diagram and phone glyph (`DeviceMobileIcon` upright / turned 90°), not colour. Neither states a single fixed distance as the rule: the live check decides (D1 framing rule), and both cards say "We'll check the picture is tall enough."
- **Turn prompt, sideways set-up only** (full screen, Court-side): `DeviceRotateIcon` 96 px turning (static in reduced motion), `title-1` "Turn your phone sideways", `callout` "Standard 1x lens, lens pointing along the baseline at you." Secondary "Film upright instead" switches the set-up. It clears itself as soon as the phone is sideways. The upright default never shows a turn prompt.

**R3 Live framing** (Court-side tokens, CAPTURE §9, Diagram C). Two variants, one behaviour.

*R3-P, upright (default), 390 × 844.* The preview is the whole 9:16 frame that will be recorded, 390 × 693 from y 0, never cropped, so the guides match the file.

```
  0 ┌──────────────────────────────────────┐ preview 390 × 693 (status bar over it)
 55 │(X)  ┌ one instruction pill ──┐  (spk)│ pill 52 tall, max 270 wide; X and speaker 44
    │     └────────────────────────┘       │
    │ ░░░░░ toss room (top 20%) ░░░░░░░░░░ │ y 0-139, white 12%, label "Toss room"
    │         ┆ stand-here ┆               │ vertical band, 30-70% of the width
    │         ┆            ┆               │
346 │   ──────┆─── ○ ──────┆──── Level     │ horizon line + centre dot (level phone)
    │         ┆            ┆               │
470 │ ─ ─ ─ ─ ┆ feet here  ┆ ─ ─ ─ ─ ─ ─ ─ │ feet line (about 68% of the preview height
    │                                      │ at the default set-up; drawn at the detected feet)
563 │ ┌ checklist rail, 3 × 3 ───────────┐ │ opaque --surface, 2 px ink edge, cells 116 × 38:
    │ │✓ Level   ✓ In frame ! Room above │ │ glyph + word only (§8.20); collapsible to one
    │ │✓ Ahead   ✓ Steady   ✓ Light      │ │ chip "8 of 9 ready" with a 44 px handle
    │ │· Ball    ✓ 60 fps   ✓ Size       │ │
693 ├──────────────────────────────────────┤ bottom tray, opaque --surface, 2 px ink top edge
705 │ (8 of 9 ›)      ( ◉ )        (···)   │ Record 72 px centred; chip opens capture detail;
781 │                 Ready                │ menu 44
810 │ safe area                            │
844 └──────────────────────────────────────┘
```

*R3-L, sideways at the fence (the alternative), 844 × 390:*

```
x: 0                                                              844
  ┌───────────────────────────────────────────────────────────────┐
  │(X)        ┌ one instruction pill ────────┐        ┌ rail 208 ┐│ y 12
  │           │ ArrowsHorizontal Level the phone        │✓ Level   ││
  │   ░░░░░░░░░░░░ toss zone (top 20%, white 12%) ░░░░░│✓ In frame││
  │           ┆ stand-here band ┆                     │! Room abv││
  │           ┆ (35-60% width)  ┆   level guide ─○─   │✓ Room ahd││
  │           ┆                 ┆                     │✓ Steady  ││
  │           ┆                 ┆                     │✓ Light   ││
  │ ─ ─ ─ ─ ─ ┆ feet about here ┆─ ─ ─ ─ ─ ─ ─ ─ ─ ─ │· Ball    ││
  │                                                   │✓ 60 fps  ││
  │                                      (···)  ( ◉ Ready )       │ y 300
  └───────────────────────────────────────────────────────────────┘
```

- Preview full-bleed in both variants; guides in white at 60% with the dark halo (§2.7); guides may be dashed (they are not data).
- **One instruction pill** (top centre): opaque `--surface`, 2 px ink border, radius full, glyph 28 + `title-2` 700: exactly one instruction at a time, the most important (CAPTURE §3.2). Orientation mismatch is one of its instructions (§5.1).
- **Checklist** (§8.20): the portrait rail at the bottom of the preview (glyph + word), the landscape rail on the right (208 px, collapsible with a 44 px handle, glyph + word + value). Both collapse to one chip "8 of 9 ready". "Room above" is the D1 framing rule (frame top at least 4.5 m at the player; 4.3 to 4.5 m accepted with "Very high tosses will be estimated"); "Level" reports a measured tilt up to 5° as "Tilted 3°, corrected" (removed in software, D1); "Size" asks for 4K below 250 px of player height (mostly the fence set-up on 1080p).
- **Record button** (72 px circle; portrait: bottom centre of the tray; landscape: bottom right): Ready = `--optic` fill, 2 px ink edge, `RecordIcon` 32 in ink, label "Ready" under it; not ready = `--surface` fill, ink edge, label "1 fix" (the instruction pill says which). Tapping when not ready shakes nothing; it shows the pill instruction again. **"Record anyway"** in the `DotsThreeIcon` menu overrides the other checks (downgrades are recorded, CAPTURE §9.8) but is **not offered** while a measured frame top is below 4.3 m or a measured tilt is above 5° (D1: the check blocks recording; ARCHITECTURE §5.1). When those two cannot be measured (player not found, motion permission denied) it is offered, and the clip carries `TILT_UNKNOWN` or the post-hoc headroom check.
- **Close** (top left, 44): inverse pill with `XIcon`.
- Level guide: horizon line and centre dot per CAPTURE Diagram C, solid with the word "Level" when within 2°.

**R4 Serving-spot states** (full-bleed in the set-up's orientation, shown automatically once the player has stood at the spot for 1 s; CAPTURE §9.7)

The player is about 6 to 9 m from the phone in the upright set-up (nearer when serving on the camera-side court, further on the other) and about 7.5 to 10.5 m in the fence set-up, so the state is carried by the field colour, a very large glyph and **one word**, plus sound. [Our inference, arithmetic: on a 460 ppi phone 1 CSS px ≈ 0.166 mm, and a 6/6 letter subtends 5 arcminutes. Landscape: a 150 px word has a cap height of about 105 px ≈ 17 mm (assuming a cap height of about 0.7 em, to verify in Archivo), legible to about 11 m. Portrait: the longest word ("Step in") must fit 358 px, which allows about 92 px at wdth 112 and weight 750; its cap height of about 64 px ≈ 10.7 mm is legible to about 7.4 m, which covers the camera-side court in the upright set-up; further away, the field colour, glyph and sound carry the state. The instruction at 34 px is readable at about 2.5 m, when the player walks back.]

| State | Field | Glyph (55% of the short side, about 214 px) | Word (portrait about 92 px, landscape 150 px; 750, wdth 112) | Instruction line (34 px) | Sound |
|---|---|---|---|---|---|
| Ready | `--optic` | `CheckIcon` in ink | Ready | "Walk back and tap Record" | Two-tone chime |
| Phone back | `#FCFDFB` | `HandPalmIcon` | Back | "Phone back 2 steps" | Low tone |
| Phone closer | `#FCFDFB` | `HandPalmIcon` | Closer | "Phone closer 1 step" | Low tone |
| Raise phone | `#FCFDFB` | `HandPalmIcon` | Higher | "Raise the phone a little" | Low tone |
| Level | `#FCFDFB` | `HandPalmIcon` | Level | "Level the phone" | Low tone |
| Hold still | `#FCFDFB` | `HandPalmIcon` | Still | "Hold still" | Low tone |
| Step in | `#FCFDFB` | `HandPalmIcon` | Step in | "Step into the picture" | Low tone |
| Practice toss | `#FCFDFB` | `TennisBallIcon` | Toss | "Toss one ball and catch it" | Single soft tone |

- **Portrait layout:** glyph centred at y 180 to 394; word centred at about y 430 to 530; instruction line at about y 570, 2 lines max, centred, 32 px side margins. **Landscape layout:** glyph left of centre, word and instruction to its right (as before).
- Ready and the change states differ by field colour, glyph shape, word and sound, so no single channel carries the meaning. Ink on optic is 15.4:1; ink on the near-white field is 19.6:1.
- Optional spoken phrase via `speechSynthesis` (en-AU voice where available), on by default during set-up (CAPTURE §9.7), switchable with a `SpeakerHighIcon` / `SpeakerSlashIcon` toggle in R3.

**R5 Countdown** (the set-up's orientation): `--surface-inverse` field, numerals in `timer` style at 240 px `#FCFDFB` tabular, centred (two digits are about 320 px wide, so they fit portrait); `footnote` "Walk to your spot" at 17 px; beeps each second, chime at zero (CAPTURE §9.9). Tap anywhere to cancel.

**R6 Recording** (the set-up's orientation): true black (`#000`, the one allowed pure black, for OLED power and heat). Top-left: 12 px `#E5322D` dot + "Recording" (17 px 600 white) + timer `00:42` (28 px tabular white) (App Store 2.5.14 indicator, CAPTURE §7.2). Stop: an 88 px circle with a 4 px white ring and a 32 px rounded red square, label "Stop" under it; bottom centre in portrait (top of the circle at y 700), bottom right in landscape. One `footnote` line at 60% white: "Tap Stop when you're back". Nothing else: no live counters, no preview (CAPTURE §9.9). Pitch and roll keep logging for tilt correction; a bump that pushes the measured tilt past 5° is reported afterwards, not during recording.

**R7 Tally** (works in either orientation; shown in portrait here)

```
 47 │ (X)                                  │
 99 │ CheckCircle Saved: 5:12, 1080p, 60 fps│ footnote
139 │ While it's fresh:                    │ title-1
    │ how many went in?                    │
235 │     ( − )     11     ( + )           │ tally counter, metric-hero tabular
    │              of 15                   │
347 │ Faults (optional)                    │
371 │ Net [−] 1 [+]  Long [−] 2 [+]  Wide [−] 1 [+]
455 │ You can tag each serve after analysis│ footnote --ink-3
672 │ [ Analyse                          ] │ primary
736 │   Skip for now                       │ tertiary
```

- "Serves in" defaults to empty (no preselected number); Analyse is enabled without it (outcomes stay `unavailable`, `NOT_ENTERED`).
- For the Second-serve check-in template the question reads "How many second serves went in?"

### 10.4 Processing

Pushed from Tally; the tab bar stays visible so the player can wander, and the Record tab shows the status row.

```
 47 │ < Record        Analysing            │ app bar
115 │ ┌ Clip card ───────────────────────┐ │ thumbnail 64 × 36 (36 × 64 upright) + "Sat 26 Sep, 5:12"
    │ │ Side view, deuce, first serves    │ │ + "1080p, 60 fps"
    │ └──────────────────────────────────┘ │
211 │ ✓  Finding serves          14 found  │ stage rows 56 each (§8.18)
267 │ ◔  Tracking the toss    serve 7 of 14│
323 │ ○  Timing each phase                 │
379 │ ○  Choosing your focus               │
451 │ ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬ 64%   │ overall bar
475 │ About 1 minute left                  │ footnote, after 5 s only
515 │ ┌ First serves ready ──────────────┐ │ appears on the first serve-ready event
    │ │ [thumb] Serve 1 is ready.         │ │ secondary "Watch serve 1"
    │ │ Watch it while we finish.         │ │
    │ └──────────────────────────────────┘ │
635 │ Keep Serve Coach open while it       │ footnote --ink-3 (ARCHITECTURE §5.8)
    │ analyses. It takes about a minute.   │
700 │   Cancel analysis                    │ tertiary; confirm sheet: "Keep the 5
754 │ tab bar                              │  serves already done?"
```

- Live region: stage changes are announced politely ("Timing each phase"); the percentage is not announced continuously.
- **Paused** (app backgrounded, ARCHITECTURE §5.9): the active stage row reads "Paused while Serve Coach was in the background" and a secondary "Resume" button appears.
- **Failed** (ARCHITECTURE §5.12): the stage row shows `WarningCircleIcon` and the plain message, with one action ("Try again", "Choose another video"). Completed serves are kept and listed.
- **Done:** replaces itself with the Session report (220 ms fade). A single notification "Your session is ready" only in the native shell and only with consent (research 09 [S15]).

### 10.5 Sessions (tab root)

Large title "Sessions"; filter row (§8.4: view, side, serve); grouped by month ("September 2026"); session rows (§8.5). Overflow on each row (swipe left or long-press): Export, Delete. Demo sessions carry the sample banner and are grouped at the end under "Sample". Empty state §8.16.

### 10.6 Session report

Order fixed by research 09 §13.4: headline → capture → focus → stats → all serves → how we measured.

```
 47 │ < Sessions   Sat 26 Sep   (Export)  │ app bar; overflow: Export, Delete
 99 │ Side view, deuce, first serves, 60 fps│ footnote --ink-3
123 │ Your toss height was steadier than   │ title-2, 2 lines max, ink
    │ usual. Contact was often behind you. │
183 │ ✓ Capture: Good · 12 of 14 serves    │ capture line (§3.6)
215 │ ┌ Focus card (compact) ────────────┐ │ 150 tall
    │ │ [kf] Your focus  [Coaches recommend]
    │ │      Toss slightly more in front  │ │
    │ │      “Toss to one o'clock.”       │ │
    │ │      See the drill ›              │ │
    │ └──────────────────────────────────┘ │
389 │ Your serve today                     │ section label
413 │ ┌ Hero: toss consistency ──────────┐ │ §8.7 hero tile: two values + toss map
    │ │ Height spread 11 cm [≈ Estimate]  │ │ 318 × 180 map
    │ │ Front-to-back 8 cm  [≈ Estimate]  │ │
    │ │ [toss map]                        │ │
    │ └──────────────────────────────────┘ │ ~ 330 tall
755 │ ┌ Contact height ┐ ┌ Toss-to-hit ──┐ │ 2-col tiles (§8.7), heroes 2-4
    │ ┌ Rhythm spread  ┐ ┌ Landing ──────┐ │
    │ ┌ Leg drive (full, §8.7) ──────────┐ │ hero 5: hip rise % + band words, drive time,
    │ │ [kf] Hips rose ≈ 9% of your height│ │ hip-rise key frame; loading-depth line at
    │ │      Typical for you · 0.34 s     │ │ the bottom ("Before that, your hips dropped
    │ │ Before that, hips dropped ≈ 6%... │ │ about 6% of your height."), no band word
    │ └──────────────────────────────────┘ │
    │ ┌ Shoulder tilt, top of the swing ─┐ │ band tile (shoulder-tilt-trophy): trophy key
    │ │ [kf] Higher than your usual       │ │ frame with shoulder-line overlay; "compared
    │ │      compared with your usual     │ │ with your usual"; no degrees
    │ └──────────────────────────────────┘ │
    │ Outcomes                             │
    │ ┌ First serves in ┐ ┌ Double faults┐ │ You logged
    │ ┌ Where they landed (§9.6) ────────┐ │
    │ ┌ Signature insight (if any) ──────┐ │ "Your serves that went in tended to..."
    │ More measurements (collapsed)      › │ toss height, toss in front, drop, contact in
    │                                      │ front, contact spread, re-tosses
    │ Not available from this session      │ ghost rows: Knee bend and Shoulder tilt at
    │                                      │ contact "Needs a view from behind"; Speed
    │                                      │ "Needs 120 fps" or "Tag your target"; Spin
    │                                      │ "Not measurable by phone"
    │ All serves                           │ serve index + serve strip (§9.3)
    │ How we measured ›                    │ list row → Metric info index
    │ Info Early version: checked on       │ validation footer (§3.2)
    │ simulated serves only. ›             │
    │ HardDrives Video kept until 26 Oct.  │ storage line; "Keep this video" tertiary
    │ Keep this video                      │
```

- **Headline sentence** rules: one or two short sentences, max 2 lines at default text size; cites only measured or estimated values; compares with the player's own usual, never with a norm; no numbers unless they are the point. Generated from a template set owned by COACHING/PRODUCT; DESIGN owns the length and style.
- **Strata:** if the session has more than one stratum (for example Both sides), a segmented control under the meta line switches the whole report ("Deuce | Ad"); stats are never pooled across strata (METRICS §1.6).
- **Untagged outcomes:** the Outcomes section shows the empty state "Tag your serves to see this" with "Tag serves" (secondary) → Tagging.
- **Experimental group** (toggle on): after "Not available", `FlaskIcon` header "Experimental" with its one-line disclaimer, then experimental tiles and rows: the deep-bend row (§8.7), speed just after contact (only when every D4 condition held), pause at the top (`trophy-pause`), serve shape repeatability.
- **Goal order** (PRODUCT §6.5) reorders the hero tiles; for `more-pace` the rows are toss consistency, contact height, **leg drive**, **shoulder tilt at the top of the swing**, landing. The knee and trunk bands are gone from every order.
- **Rear-view report** ("View from behind", never pooled with the side view, D1): the toss hero uses `toss-lateral-spread` ("Toss left-right", experimental styling while experimental); band tiles for **knee bend** (`knee-bend-band`, back knee, `knee-rear` overlay) and **shoulder tilt at contact** (`shoulder-over-shoulder-contact`, experimental, toggle only); the service-box map in its rear variant (§9.6); `speed-average-rear` as an experimental tile ("average speed to the bounce", toggle only, needs the bounce found in video). Its ghost rows are the side-only metrics ("Needs the side view"), including leg drive and shoulder tilt at the top of the swing.
- **Demo:** the sample banner under the app bar.

### 10.7 Serve detail

**Landscape clip** (sideways at the fence):

```
 47 │ < Report   Serve 7 of 14    (···)    │ overflow: Compare with your best, Exclude this serve, Delete serve
 99 │▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│ video 390 × 219, opens on the focus
    │▓ [Serve 7 of 14]          [● In]   ▓│ event's key frame (evidence-first,
    │▓        (overlay drawn)            ▓│ research 09 §6.3)
318 │▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
326 │ Contact           Frame 142 · 2.37 s │ phase timeline (§8.10), 56
382 │ [¼×]  (<)  (▶)  (>)   (|<) (>|)      │ transport row 48
442 │ [Body] [Toss] [Contact] [Legs] [No…  │ overlay chips (one at a time; row scrolls)
490 │ Faded joints: we're less sure there. │ footnote legend line
514 │ [Release][Peak][Top][Lowest][Cont…   │ key-frame strip (§8.9), 88 × 50 thumbnails
590 │ ( Compare with your best )           │ secondary 44 compact
650 │ ┌ Stat drawer (peek) ──────────────┐ │ sheet peek 160 + safe area
    │ │ Contact height ≈ 1.44 × height    │ │ three values for this serve,
    │ │ Toss in front   ≈ 6 cm            │ │ focus metric first
    │ │ Toss-to-hit     0.94 s            │ │
844 └──────────────────────────────────────┘
```

**Portrait clip** (the D1 default set-up; also the sample session):

```
 47 │ < Report   Serve 7 of 14    (···)    │ same overflow
 99 │▓▓▓▓▓▓▓┌────────────────────┐▓▓▓▓▓▓▓▓│ video box 390 × 380 (45% of 844): the 9:16 clip
    │[Serve 7]│                  │  [● In]│ at 214 × 380, pillarboxed ("Whole frame"), or
    │▓▓▓▓▓▓▓│  (overlay drawn)   │▓▓▓▓▓▓▓▓│ zoomed to the player, about 2 × ("Zoom to you",
    │▓▓▓▓▓▓▓│                    │▓▓▓▓▓▓▓▓│ §8.11). Pills sit in the box corners, over the
    │▓▓▓▓▓▓▓│                    │ (Zoom) │ bars in Fit; zoom pill bottom-right
479 │▓▓▓▓▓▓▓└────────────────────┘▓▓▓▓▓▓▓▓│
487 │ Contact           Frame 142 · 2.37 s │ phase timeline (§8.10), 56
543 │ [¼×]  (<)  (▶)  (>)   (|<) (>|)      │ transport row 48
599 │ [Body] [Toss] [Contact] [Legs] [No…  │ overlay chips (row scrolls)
651 │ Faded joints: we're less sure there. │ footnote legend line
690 │ ┌ Stat drawer (peek) ──────────────┐ │ sheet peek 120 + safe area: two values,
    │ │ Contact height ≈ 1.44 × height    │ │ focus metric first. Medium detent opens with
    │ │ Toss in front   ≈ 6 cm            │ │ the key-frame strip (50 × 88 thumbnails) and
844 └──────────────────────────────────────┘ "Compare with your best", then every value
```

- The phase timeline, transport and overlay chips start at the same y for every serve of the session, so frame stepping never moves under the thumb. Their y differs between the two clip orientations only (326 vs 487).
- No tab bar (pushed full screen); swipe left/right on the video area (outside the scrubber) moves between serves. In Player zoom, a horizontal drag pans instead; serve-to-serve then uses the transport's previous/next buttons.
- Outcome pill on the video opens a small tag sheet with the tagging pad (§8.14).
- **Excluded serve:** a banner under the video "Excluded from your stats" with "Include again".
- **Deleted video:** key-frame stepping (§8.11).

### 10.8 Tagging

Full screen, no tab bar; designed for one-thumb use right after a block (research 10 M4: under 2 s per serve). **The video box is a fixed 390 × 219 for both clip orientations, so the pad never moves** (§8.14). A landscape clip fills it. A portrait clip is scaled so the region from 0.2 m below the feet to 0.3 m above the session's highest toss peak fills the 219 px height (about 240 px wide, pillarboxed and centred); the sky above and the court in front of the camera are cropped. There is no zoom control here: the purpose is to jog the memory of where the ball went, not to inspect.

```
 47 │ (X)   Tag serves          7 of 15    │ app bar; X = save and exit
 99 │▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│ video box 390 × 219 (either clip orientation): plays this serve once
    │▓                           (Replay)▓│ from toss release to 1.5 s after
318 │▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│ contact, then holds (reduced motion: paused)
330 │ ●●▲●✕●○○○○○○○○○                      │ progress row: tagged marks, then
    │                                      │ empty rings for untagged (22 px cells)
366 │ [ 1st | 2nd ]      [ Deuce | Ad ]    │ segmented, prefilled, sticky
418 │ Aimed at [T] [Body] [Wide]           │ only if the block had a target
478 │ ┌─────────────┐ ┌─────────────┐      │ tagging pad (§8.14) 2 × 2,
    │ │ ●  In        │ │ ▲  Net       │      │ 169 × 88 each
578 │ ┌─────────────┐ ┌─────────────┐      │
    │ │ ✕  Long ↑    │ │ ✕  Wide ↔    │      │
666 │   Let      Skip      Undo            │ tertiary row 44
760 │   Use a tally instead                │ tertiary
```

- After the last serve: a summary sheet "8 of 15 in. 3 net, 3 long, 1 wide." with "Done" (primary) and "Review tags" (tertiary).
- Tags can be changed later from Serve detail. Point-play mode (§8.14) is on for the Second-serve check-in and when the player chooses "Tag as points".

### 10.9 Focus & drill

Pushed from the focus card. Bottom action bar holds the primary.

```
 47 │ < Today                     (Info)   │ Info → "Why this focus?" sheet (COACHING §7.6)
 99 │ Steady toss height                   │ title-1
139 │ [Books Research-backed]              │ tier chip
179 │ ┌ Evidence ────────────────────────┐ │ two key frames with overlay: 151 × 85
    │ │ [serve 7]        [your best]      │ │ (landscape clips) or 151 × 268 (portrait
    │ │                                   │ │ clips, 9:16, filling the 318 interior);
    │ │                                   │ │ captions; 1-2 stat rows with chips below.
    │ │                                   │ │ Portrait pushes the sections below down
    │ │                                   │ │ by 183 px; the page scrolls
    │ │ Toss height spread 17 cm ≈        │ │
    │ │ usual 12 to 15 cm, 13 of 14 serves│ │
    │ └──────────────────────────────────┘ │
383 │ Why it matters                       │ section label
407 │ When the toss peaks at a different   │ callout, exactly 2 sentences (COACHING §14)
    │ height each time, your swing has...  │
487 │ Your cue                             │
511 │ “Lift it like an elevator.”          │ cue style 28 px
559 │ Try the other cue ›                  │ tertiary (analogy ↔ outcome register)
599 │ Your drill                           │
623 │ Fence-line toss ladder · 8 min       │ headline + TimerIcon
    │ Set-up paragraph                     │ callout
    │ 1. Toss 5 balls without swinging...  │ numbered steps, body
    │ 2. ...                               │
    │ Goal: 14 of 20 tosses peak on line   │ success criterion: surface-2 block,
    │                                      │ TargetIcon, headline
    │ Easier version ›   Harder version ›  │ regression / progression (unlocked per
    │                                      │ COACHING §12.2)
    │ Stop if anything hurts ›             │ footnote, HeartbeatIcon (always visible)
754 │ ┌ bottom action bar ───────────────┐ │
    │ │ [ Start drill                  ] │ │ primary
    │ └──────────────────────────────────┘ │
```

**Drill player** (full screen, keeps the screen awake where supported):

```
 47 │ (X)  Fence-line toss ladder          │
139 │            07:42                     │ timer 64 px tabular, counts down
239 │ Step 2 of 4                          │ footnote
263 │ Serve 20 balls at a comfortable pace,│ title-2
    │ swinging at every toss.              │
383 │ Tosses on your line                  │ label
407 │   ( − )      9 of 20      ( + )      │ big counter; + is 88 × 88
543 │ “Lift it like an elevator.”          │ cue reminder, callout --ink-2
623 │ [ Next step                        ] │ secondary
687 │ [ Finish and log                   ] │ primary (appears on the last step)
751 │   Stop: something hurts              │ tertiary → body check flow
```

- Finishing opens the Practice log sheet prefilled (COACHING §12.2), with the counted successes filled into `successCriterionMet`.
- Audio: optional spoken cue at each step start (off by default; research 09 open question 8).

### 10.10 Progress

Answers "Is my toss becoming more consistent?", "Am I getting more first serves in?", "Did this change improve my serve?" (the brief; research 10 §2.3).

```
 47 │ app bar                              │
 99 │ Progress                             │ display
151 │ [Side view, deuce, first serves ▾]   │ filter row (scopes everything below)
207 │ ┌ Season strip ────────────────────┐ │ "Spring comp: week 8 of 14"
    │ │ ○ Pre-season  ● Mid-season  ○ End │ │ checks as 3 labelled nodes (research 10 M9)
    │ └──────────────────────────────────┘ │
291 │ ┌ Is my toss getting more         ┐  │ question tile: title = question,
    │ │ consistent?                      │  │ then the answer sentence (headline):
    │ │ Height spread 11 cm, below your  │  │ "Height spread 11 cm, below your usual"
    │ │ usual.                [≈ Estimate]│  │
    │ │ [sparkline + usual band 318 × 72] │  │
    │ │ (Likely better) Last 5 sessions   │  │ compact verdict
    │ └──────────────────────────────────┘  │ ~ 230 tall
533 │ ┌ Am I getting more first serves in?┐ │ per-session hollow points (You logged),
    │ │ 38 of 60 in over 4 sessions       │ │ rolling Wilson band; message
    │ │ (Too early to tell) About 190 more│ │ "About 190 more serves to confirm.
    │ │ serves...                         │ │  Toss spread will show change sooner."
    │ └──────────────────────────────────┘ │
754 │ tab bar                              │
below the fold:
    Is my rhythm steady?                     (rhythm-spread tile)
    Am I contacting the ball higher?         (contact-height-ratio tile)
    Am I using my legs?                      (leg-drive tile: hip rise as % of height per
                                              matched session with the usual band; answer
                                              "Hips rose 9% of your height, about your usual";
                                              drive time in the tile's detail. Side view only)
    Experiments                              list rows: "Steady toss height,
                                              3 Oct to 10 Oct" + compact verdict → Compare
    Comp nights                              match-log small multiples (§9.9)
    Export for your coach ›                  (research 10 M12)
```

- Tile order is fixed: toss consistency first (D5, research 10 M2), then the goal-linked outcome (first serves in or second serves in, depending on the goal), then rhythm, then contact, then leg drive (D5 hero; PRODUCT §3.2 "Am I using my legs?"). Shoulder tilt, loading depth and the deep-bend flag have no Progress tile: they are descriptive or player-relative bands, not trends to chase.
- The leg-drive tile never shows a population value or a target, and its answer sentence never asks for more ("Your hips rose a little less than usual" is allowed; "Drive harder" is not).
- **Baseline building:** tiles show the empty state and "1 of 2 sessions"; no sparklines with one point.
- Switching the filter re-renders every tile; colours never change with the filter (dataviz: colour follows the entity).

### 10.11 Compare ("Did it work?")

Pushed from an experiment row, the Today experiment strip, or automatically after a re-test is analysed.

```
 47 │ < Progress   Did it work?            │
 99 │ (CircleHalf Likely better)           │ large verdict chip 36
147 │ Your toss height spread went from    │ title-1
    │ 17 cm to 11 cm.                      │
223 │ 13 serves each, same side view,      │ callout --ink-2
    │ deuce, first serves.                 │
279 │ Hourglass About 10 more serves to    │ footnote
    │ confirm.                             │
327 │ ┌ Before / after (§9.7) ───────────┐ │ 318 × 176 + evidence strips 2 × 40
    │ └──────────────────────────────────┘ │
583 │ First serves in: 7 of 13, then 9 of  │ guard metric line (METRICS §4.5), You logged
    │ 13 (you logged).                     │
639 │ [ Side by side | Ghost ]             │ segmented
683 │ ┌ video compare (§8.12) ───────────┐ │ stacked players, below the fold
    │                                      │
754 │ ┌ bottom action bar ───────────────┐ │
    │ │ [ Record re-test               ] │ │ primary (varies, below)
    │ └──────────────────────────────────┘ │
```

- **Primary by verdict** (COACHING §12.5): Clearly better → "Choose next focus"; Likely better → "Record re-test"; About the same (2+ re-tests) → "Try the other cue"; Too early → "Record re-test"; Worse → "Try the easier drill"; Not comparable → "Record matched session".
- "How this verdict works ›" (tertiary) opens Metric info at the comparison section.
- **First verdict ever:** after the verdict renders and settles (not before), the paywall sheet may open once (research 10 M9). The verdict itself is always visible free.

### 10.12 Profile

A large sheet (92%) opened from Today's `UserCircleIcon`, with its own navigation stack (pushed pages slide inside the sheet).

```
┌ grabber ─────────────────────────────┐
│ You                              Done │ title-1 + text button
│ 1.78 m, right-handed, UTR 4.5 (you   │ footnote; tap → Your serve
│ logged). Night comp on Tuesdays.     │
│ Goal: fewer double faults.           │
│ ─ Coaching ──────────────────────────│
│ Your serve                         › │ PRODUCT §6.13: height, hand, level, goal,
│                                      │ how you play, match nights, season (edits
│                                      │ single O3-O6 answers, same options as §10.1)
│ Comfort and body                   › │ comfort settings, body-check history
│ My coach's focus                   › │ research 10 M8
│ ─ Data ──────────────────────────────│
│ Storage and privacy                › │ see below
│ How we measure                     › │ Metric info index
│ Experimental metrics          [ off ]│ switch (§8.23) + one-line disclaimer
│ ─ App ───────────────────────────────│
│ Appearance                         › │ System / Day / Night; Court-side contrast:
│                                      │ On camera screens (default) / Always / Off
│ Plan: Free                         › │ Plus badge if subscribed
│ Sample data                  Remove  │ only while demo data exists
│ About and legal                    › │ privacy policy, licences, version
└──────────────────────────────────────┘
```

**Storage and privacy page** (D8; ARCHITECTURE §8):
- Summary card: "On this phone: 1.2 GB of video, 34 MB of stats" (`footnote` tabular) and "Protected from automatic clean-up: Yes" (or "No. Add Serve Coach to your Home Screen, or export regularly.").
- "Keep videos": radio rows "Keep", "Delete after 30 days (default)" with 7/30/90 chips, "Delete after analysis (keep stats and key frames)". Honest footnote: "Videos older than 30 days are deleted the next time you open Serve Coach."
- "Export": secondary "Export JSON and CSV"; checkboxes "Include comfort notes" (off), "Include pose data" (off).
- Destructive group: "Delete all videos", "Delete everything" (typed confirm).
- Privacy facts, one per row with `ShieldCheckIcon`: "Analysis runs on this phone.", "No account. Nothing is uploaded.", "Comfort answers never leave this phone."

### 10.13 Paywall (sheet)

Opened once after the first "Did it work?" verdict, and from Profile → Plan. Calm and plain (no countdowns, no strike-through prices, no pre-ticked upsells).

```
│ Keep your experiments going          │ title-1
│ Plus gives you unlimited analysed    │ callout, 3 short lines max
│ sessions, full history and trends,   │
│ and side-by-side with your best serve│
│ ( ) Yearly   A$99.99   7-day trial   │ radio cards 64; prices from research 08 §6,
│ ( ) Monthly  A$14.99                 │ final values owned by PRODUCT.md
│ ( ) Season   A$39.99   to 31 Mar     │ test cell only (research 10 M9)
│ Always free: pain check, export and  │ footnote with ShieldCheckIcon
│ deletion.                            │
│ [ Start 7-day trial                ] │ primary
│ [ Not now                          ] │ secondary, same size
│ Restore purchase · Terms · Privacy   │ footnote links (the one middot rule is
│                                      │ relaxed here to two for legal links)
```

### 10.14 Metric info ("How we measure", per metric)

A pushed page (inside Profile's stack or from any chip or tile). Content comes from `metrics.json` and METRICS.md §6.

```
 47 │ < Back   Toss height consistency     │
 99 │ 11 cm                [≈ Estimate]    │ metric-hero + chip; "Early read" if so
155 │ Sat 26 Sep, 12 of 14 serves          │ footnote
187 │ What it is                           │ section label
    │ How much your toss peak height varies│ callout, 2 sentences max
    │ from serve to serve.                 │
    │ Your trend                           │ sparkline detail variant (§9.2) 318 × 180
    │ [chart] Show as table                │ with table toggle
    │ How we measure it                    │ numbered steps (3-5), plain words, with a
    │ 1. We find the top of each toss...   │ small diagram where it helps
    │ What it needs                        │ prerequisite checklist: glyph + word +
    │ ✓ Side view   ✓ 60 fps   ✓ Height    │ state for this session
    │ How sure we are                      │ validation level (§3.2), typical error in
    │ Checked on simulated serves. Real-   │ words ("about ±2 cm per serve at 60 fps"),
    │ court check in progress.             │ what can shift it
    │ Known limits                         │ METRICS §6 items that apply; for side-view toss
    │ From the side, a toss nearer the     │ metrics always the §3.3 rule 12 sentence (bias
    │ camera reads a little high...        │ and sideways-wobble inflation, D1)
    │ Typical for club players             │ provisional recreational band (gap ranges §7),
    │ (provisional): 8 to 20 cm. Yours:    │ words tight / typical / scattered, never good
    │ typical.                             │ or bad (§3.3 rule 13)
    │ For context                          │ published reference ranges, labelled with
    │ Professional women: about 6 cm       │ the population and never framed as targets
    │ (8 players). Not a target.           │ (research 06 [S8] via METRICS §3.6)
```

- **No outside comparison for bands and legs.** Metric info for `shoulder-tilt-trophy`, `knee-bend-band`, `shoulder-over-shoulder-contact`, `leg-drive`, `drive-time` and `loading-depth` has no "Typical for club players" or "For context" section. It explains the player-relative reference instead ("Compared with your own usual serves") and says why: published trunk angles and professional centre-of-mass rise measure different things (D5). `loading-depth` adds: "This is a description. Deeper isn't the goal."
- **What this view can't see.** A side-view session's Metric info for knee bend or shoulder tilt at contact leads with "Needs a view from behind", one sentence on why ("From the side, your knees point at the camera at the top of the swing") and a link to set up the view from behind.
- For unavailable metrics the page leads with the reason and the unlock steps, for example speed: "Record at 120 fps or more from the side, with your height entered and one target tagged (T, Body or Wide). Turn on experimental metrics." It never offers sound as a way to get speed from the side (D4). For `spin`, the METRICS §3.24 explanation.

---

## 11. Copy tone

**Voice:** a calm, experienced club coach standing next to you at the fence. Warm, specific, brief, second person, Australian English. Honest about uncertainty without hedging every line. COACHING §14 governs coaching strings; CAPTURE §3 governs set-up strings; this section governs everything else and the shared rules.

**Rules**
1. Lead with the takeaway in plain words, then the number: "Your toss was steadier than usual: spread 11 cm (usual 12 to 15)."
2. One idea per sentence; sentences under about 20 words; UI labels 1–3 words.
3. Uncertainty in words first: "likely", "too early to tell", "about". Never "maybe" or "might" stacked twice.
4. Compare only with the player's own serves. Published values appear only in Metric info, labelled with the population, as context ("Not a target").
5. Associations are never causes: "Serves that went in tended to…", not "Your toss caused…".
6. No exclamation marks, no emoji, no em or en dashes, no "AI", "smart", "magic", "perfect", "crush", "level up", "streak", "unlock your potential". Nothing gamified.
7. Never blame: no "wrong", "bad serve", "failed". Worse results are phrased as normal parts of change (COACHING §12.5).
8. Health: never name a condition, estimate severity or promise prevention (COACHING §10, §14). Referral copy is used exactly as COACHING writes it.
9. Errors say what happened and what to do, in that order: "We couldn't find a serve in this video. Try a clip where you're side-on and fully in the picture."
10. Buttons are verbs: "Start drill", "Record re-test", "Log practice", "Tag serves", "Export". One label per intent across the app.
11. Sentence case everywhere, including buttons and titles.
12. **Legs and posture are described, not demanded** (D5; gap Kovacs §5 T1). Never "bend more", "bend deeper", "get lower", "jump higher", "push harder" or "explode", and never "little bend". Leg drive and hip drop are reported against the player's own serves. No screen prescribes a toss height; the toss copy talks about steadiness and the player's own drop.
13. **Name what the view can't see** instead of hiding it: "Knee bend: Needs a view from behind" (D1).

**Player-facing glossary** (never show the internal term)

| Internal | Player sees |
|---|---|
| stratum, matched | "same set-up" ("Compare sessions from the same side, view and serve.") |
| standard deviation, spread | "spread", explained once in Metric info as "the typical distance of a toss from your average" |
| confidence interval | "likely range", "likely 2.49 to 2.63 m" |
| provisional | "early read" |
| SWC | "a change worth noticing"; the chart zone is "About the same" |
| capture quality usable / poor | Fair / Limited |
| player-entered | "You logged" |
| key frame | "frame" ("Frame from serve 7") |
| phases | Setup, Toss, Loading, Drive, Contact, Landing, Recovery |
| trophy | "loading" (the phase), "the top of your swing" in coaching copy and key-frame captions ("Top of swing") |
| apex | "peak" |
| lowest hip (event) | "lowest point" |
| hip rise (`leg-drive`) | "leg drive", "your hips rose 9% of your height" |
| hip drop (`loading-depth`) | "hip drop", "your hips dropped about 6% of your height" (a description) |
| shoulder-line angle (`shoulder-tilt-trophy`) | "shoulder tilt at the top of your swing"; band words "lower than your usual / typical for you / higher than your usual" |
| portrait / landscape set-up | "upright beside the court" / "sideways at the fence" |
| `serve-in-rate` | "Serves in" |

**Notifications** (native shell, consent first, research 09 [S15]): only "Your session is ready." and an opt-in re-test reminder: "Ready to re-test your toss? 12 serves, same set-up." Nothing else, ever.

**Examples**

| Surface | Do | Don't |
|---|---|---|
| Session headline | "Your toss height was steadier than usual. Contact was often behind you." | "Great session! Your serve score is 78." |
| Unavailable | "Speed: Needs 120 fps" | "Speed: —" or "Speed: 142.7 km/h" from 30 fps |
| View limits | "Knee bend: Needs a view from behind" | A knee band from the side view |
| Legs | "Your hips rose 9% of your height, typical for you." | "Bend your knees more." / "Jump higher." |
| Verdict | "Likely better. About 10 more serves to confirm." | "You improved 35%!" |
| Rate | "8 of 12 in (you logged)" | "67% first serves" with no n |
| Capture | "Capture: Fair. Next time, move the phone one step back." | "Poor video quality detected." |
| Rest | "Welcome back. Your focus is where you left it." | "You broke your 3-week streak." |

---

## 12. Accessibility checklist

Target: WCAG 2.2 AA throughout, AAA for primary and secondary text, HIG accessibility guidance (research 09 §10).

**Perception**
- [ ] Every text pair meets §2.3 (automated token test, §13.7).
- [ ] Graphics and control boundaries ≥ 3:1: chart marks, chips' outlines, input borders, the optic edge (research 09 [S77]).
- [ ] Nothing relies on colour alone: data states (glyph + word + container), outcomes (shape + word), verdicts (glyph + words), capture quality (glyph + word), selection (check glyph or weight), Ready (field + glyph + word + sound) (research 09 [S76]).
- [ ] Categorical and signal palettes validated for protanopia and deuteranopia (§2.5); re-run the validator whenever a hex changes.
- [ ] Court-side contrast mode available and automatic on camera screens; `prefers-contrast: more` honoured.
- [ ] `forced-colors: active`: chips, marks and focus rings use system colours (`CanvasText`, `Highlight`); outcome shapes remain; bands switch to the hatch.
- [ ] Video overlays have a dark halo and never carry information that is not also in the stat drawer.

**Operation**
- [ ] Every target ≥ 44 × 44 px, with ≥ 8 px between adjacent targets; court-side controls at the larger sizes in §5.5 (research 09 [S5]).
- [ ] All flows work with VoiceOver and a keyboard (desktop testing): logical focus order, visible 2 px focus ring, focus trapped in sheets and returned on close.
- [ ] Charts: tap-to-select with a 24 px nearest-point radius, keyboard navigation, and a table view.
- [ ] The scrubber is a `slider` with frame-step keys; frame stepping never requires a drag.
- [ ] No time limits, except the countdown, which can be cancelled; toasts with Undo last 8 s and Undo is also available from the affected screen where possible.
- [ ] Tagging works without looking at the video (buttons in fixed positions, spoken confirmation).

**Understanding**
- [ ] Every chart has a visible title sentence that states the takeaway, and a subtitle naming the set-up.
- [ ] Plain-language glossary (§11); Metric info for every number.
- [ ] Error messages name the problem and the fix.
- [ ] `lang="en-AU"`; numbers and ranges have `aria-label`s in words ("12 to 15 centimetres", "8 of 12 serves in").

**Adaptation**
- [ ] Dynamic Type up to 200%: rem-based type, px-based spacing, tiles collapse to one column, no truncation of values (labels may wrap), app bar titles truncate with the full title in the accessible name.
- [ ] Portrait layouts reflow at 320 px wide without horizontal scroll.
- [ ] Reduced motion (§7.3) and reduced transparency (§5.4) honoured.
- [ ] Audio cues (chimes, speech) always have a visual equivalent; visual states always have an optional audio equivalent on camera screens.

**Testing**
- [ ] Playwright at 390 × 844 in Day, Night and Court-side for every screen in §10, with screenshots reviewed and the console read (user instruction; ARCHITECTURE §13 flow 9). Camera screens (R2–R6) in both set-ups: upright at 390 × 844 and sideways at 844 × 390. Serve detail, Compare, Tagging and the focus card with both a portrait and a landscape clip fixture, asserting that the tagging pad's top is at the same y for both.
- [ ] Manual VoiceOver pass on an iPhone before TestFlight.
- [ ] Outdoor check at midday in full sun on at least two iPhone models (research 09 §10), recorded as a short note with photos of the screen.
- [ ] Include colour-vision-deficient and large-text participants in beta usability testing, and test decision quality (did the player choose the right practice action), not only liking (research 09 [S65], Implications 12).

---

## 13. Implementation notes (Tailwind v4, React 19)

### 13.1 Files

```
app/src/ui/
  styles/tokens.css        tokens (§13.2); imported by src/index.css after '@import "tailwindcss"'
  styles/base.css          html/body, Dynamic Type, focus ring, reduced-motion and forced-colors rules
  theme/ThemeProvider.tsx  resolves scheme + Court-side, sets data attributes, updates meta theme-color
  theme/useCourtSide.ts    wraps camera screens: sets data-contrast="court" on their root
  components/              §8 components (one file each) + index.ts
  charts/                  §9 charts, ChartFrame, beeswarm.ts, nearestPoint.ts, TableView.tsx
  overlays/                canvas renderers for §8.11 overlay ids and the skeleton
  screens/                 §10 screens
  copy/strings.ts          UI strings not owned by metrics.json or coaching-library.json
public/theme-init.js       blocking head script: applies data-theme before first paint (CSP 'self' allows it)
```

`src/main.tsx` imports `@fontsource-variable/archivo/wdth.css` once. Install: `npm install @fontsource-variable/archivo` (not yet in `package.json`; everything else used here already is: `tailwindcss` 4.3.3, `@tailwindcss/vite`, `@phosphor-icons/react` 2.1.10, `motion` 13.4.4).

### 13.2 Tokens (`tokens.css`)

The current placeholder tokens in `src/index.css` (`--surface`, `--ink`, `--accent`…) are superseded by these. Theme selection is by attribute so a subtree (the camera flow) can switch to Court-side without affecting the rest.

```css
/* Day (default) */
:root {
  color-scheme: light;
  --bg: #f1f3ef; --surface: #fafbf8; --surface-2: #e6eae4;
  --surface-inverse: #1a201c; --ink-inverse: #f1f3ef;
  --line: #d3d9d1; --line-strong: #7d887f;
  --ink: #121714; --ink-2: #3c453f; --ink-3: #58625a; --ink-disabled: #8f9890;
  --optic: #d4ee48; --optic-press: #c4de36; --on-optic: #121714; --optic-edge: #6f7f12;
  --focus: #121714;
  --good: #0072b2; --good-soft: #e1edf4; --bad: #d55e00; --bad-soft: #f7e7dc;
  --neutral: #7f8981; --band: #dce2da; --attention: #9a5a00;
  --critical: #a3261e; --critical-soft: #f6e1de; --on-critical: #fafbf8;
  --cat-1: #0072b2; --cat-2: #009e73; --cat-3: #d55e00;
  --scrim: rgb(10 14 12 / 0.45);
  --sheet-shadow: 0 -12px 40px rgb(18 23 20 / 0.14);
  --glass: color-mix(in srgb, var(--surface) 88%, transparent);
  --border-w: 1px;
  --dur-press: 100ms; --dur-fast: 160ms; --dur-base: 220ms; --dur-chart: 360ms;
}
/* Night */
[data-theme='dark'] {
  color-scheme: dark;
  --bg: #0b0f0d; --surface: #141916; --surface-2: #1c221e;
  --surface-inverse: #ebefe9; --ink-inverse: #121714;
  --line: #29312c; --line-strong: #66716a;
  --ink: #ebefe9; --ink-2: #b5beb6; --ink-3: #8d978f; --ink-disabled: #5d665f;
  --optic-edge: #d4ee48; --focus: #d4ee48;
  --good: #3d9de0; --good-soft: #14293a; --bad: #db6b2e; --bad-soft: #3a2317;
  --neutral: #6c766e; --band: #252c27; --attention: #e0a040;
  --critical: #ff8a7a; --critical-soft: #3d1c19; --on-critical: #121714;
  --cat-1: #3d9de0; --cat-2: #12a07a; --cat-3: #db6b2e;
  --scrim: rgb(0 0 0 / 0.6);
  --sheet-shadow: 0 0 #0000;
}
/* Court-side: on <html> (Always) or on a camera-screen root (automatic) */
[data-contrast='court'] {
  color-scheme: light;
  --bg: #fcfdfb; --surface: #fcfdfb; --surface-2: #eef1ec;
  --surface-inverse: #060907; --ink-inverse: #fcfdfb;
  --line: #5b655d; --line-strong: #3a423c;
  --ink: #060907; --ink-2: #1d2520; --ink-3: #2f3832; --ink-disabled: #6b746c;
  --on-optic: #060907; --optic-edge: #060907; --focus: #060907;
  --good: #0072b2; --good-soft: #e1edf4; --bad: #b04a00; --bad-soft: #f7e7dc;
  --neutral: #5b655d; --band: #d5dbd3; --attention: #7a4600;
  --critical: #8f1f18; --critical-soft: #f6e1de; --on-critical: #fcfdfb;
  --cat-1: #0072b2; --cat-2: #009e73; --cat-3: #b04a00;
  --scrim: rgb(6 9 7 / 0.6);
  --sheet-shadow: 0 0 #0000;
  --glass: var(--surface);
  --border-w: 2px;
}

/* Remove Tailwind's default palette so only these tokens can be used. */
@theme {
  --color-*: initial;
}

@theme inline {
  --color-bg: var(--bg); --color-surface: var(--surface); --color-surface-2: var(--surface-2);
  --color-surface-inverse: var(--surface-inverse); --color-ink-inverse: var(--ink-inverse);
  --color-line: var(--line); --color-line-strong: var(--line-strong);
  --color-ink: var(--ink); --color-ink-2: var(--ink-2); --color-ink-3: var(--ink-3);
  --color-ink-disabled: var(--ink-disabled);
  --color-optic: var(--optic); --color-optic-press: var(--optic-press);
  --color-on-optic: var(--on-optic); --color-optic-edge: var(--optic-edge);
  --color-focus: var(--focus);
  --color-good: var(--good); --color-good-soft: var(--good-soft);
  --color-bad: var(--bad); --color-bad-soft: var(--bad-soft);
  --color-neutral: var(--neutral); --color-band: var(--band); --color-attention: var(--attention);
  --color-critical: var(--critical); --color-critical-soft: var(--critical-soft);
  --color-on-critical: var(--on-critical);
  --color-cat-1: var(--cat-1); --color-cat-2: var(--cat-2); --color-cat-3: var(--cat-3);
  --shadow-sheet: var(--sheet-shadow);
}

@theme {
  --font-sans: 'Archivo Variable', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  --spacing: 4px;
  --radius-control: 14px; --radius-card: 20px; --radius-sheet: 28px; --radius-media: 10px;
  --text-display: 2rem;      --text-display--line-height: 1.15;  --text-display--font-weight: 650; --text-display--letter-spacing: -0.01em;
  --text-title-1: 1.5rem;    --text-title-1--line-height: 1.25;  --text-title-1--font-weight: 620;
  --text-title-2: 1.25rem;   --text-title-2--line-height: 1.3;   --text-title-2--font-weight: 600;
  --text-headline: 1rem;     --text-headline--line-height: 1.375; --text-headline--font-weight: 600;
  --text-body: 1rem;         --text-body--line-height: 1.5;
  --text-callout: 0.9375rem; --text-callout--line-height: 1.45;
  --text-subhead: 0.9375rem; --text-subhead--line-height: 1.35;  --text-subhead--font-weight: 500;
  --text-footnote: 0.8125rem; --text-footnote--line-height: 1.4;
  --text-caption: 0.75rem;   --text-caption--line-height: 1.35;  --text-caption--font-weight: 600;
  --text-metric: 1.75rem;    --text-metric--line-height: 1.1;    --text-metric--font-weight: 620;
  --text-metric-hero: 2.75rem; --text-metric-hero--line-height: 1.05; --text-metric-hero--font-weight: 650;
  --text-cue: 1.75rem;       --text-cue--line-height: 1.2;       --text-cue--font-weight: 500;
  --text-timer: 4rem;        --text-timer--line-height: 1;       --text-timer--font-weight: 600;
  --ease-standard: cubic-bezier(0.2, 0, 0, 1);
  --ease-exit: cubic-bezier(0.4, 0, 1, 1);
}

@custom-variant dark (&:where([data-theme='dark'], [data-theme='dark'] *));
@custom-variant court (&:where([data-contrast='court'], [data-contrast='court'] *));

@utility font-wide { font-stretch: 112%; }
@utility glass {
  background: var(--glass);
  -webkit-backdrop-filter: blur(20px) saturate(140%);
  backdrop-filter: blur(20px) saturate(140%);
}
```

Usage: `bg-surface text-ink rounded-card border border-line`, `text-metric font-wide`, `bg-optic text-on-optic border border-optic-edge rounded-control`, `tabular-nums`, `court:border-2`, `duration-(--dur-fast)`.

### 13.3 Theme resolution

- Stored in Dexie `settings` under `'theme'` as `{ scheme: 'system' | 'light' | 'dark', courtSide: 'camera' | 'always' | 'off' }` (ARCHITECTURE §7.1 lists a `'theme'` key; this is its value shape), mirrored to `localStorage` only for first paint.
- `public/theme-init.js` (loaded with a plain `<script src>` in `<head>`, CSP `'self'`) reads the mirror and `matchMedia('(prefers-color-scheme: dark)')` and sets `document.documentElement.dataset.theme` before the body renders. It also sets `data-contrast="court"` when `courtSide === 'always'`, or when `prefers-contrast: more` matches and the player has not chosen.
- `ThemeProvider` keeps the attribute in sync with `matchMedia` changes and settings, and updates both `<meta name="theme-color">` tags (Day `#f1f3ef`, Night `#0b0f0d`).
- `useCourtSide()` is used by every camera screen root: `<div data-contrast={courtSide !== 'off' ? 'court' : undefined}>`.
- Wrap all `localStorage` access in try/catch; the app must render correctly without it.

### 13.4 Base styles and Dynamic Type

```css
html {
  font-family: var(--font-sans);
  font-size: 100%;
  -webkit-text-size-adjust: 100%;
  background: var(--bg);
  color: var(--ink);
  -webkit-font-smoothing: antialiased;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}
/* iPhone: follow Dynamic Type. Touch-only so desktop Safari (13 px system body) is unaffected. */
@supports (font: -apple-system-body) {
  @media (hover: none) and (pointer: coarse) {
    html { font: -apple-system-body; font-family: var(--font-sans); }
  }
}
body { min-height: 100dvh; font-size: var(--text-body); line-height: 1.5; }
:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
[data-contrast='court'] { font-weight: 500; }
[data-contrast='court'] .glass { -webkit-backdrop-filter: none; backdrop-filter: none; }
@media (prefers-reduced-transparency: reduce) { .glass { background: var(--surface); -webkit-backdrop-filter: none; backdrop-filter: none; } }
@media (forced-colors: active) { .chip, .btn { border: 1px solid CanvasText; } }
```

Verify on device (iOS Safari standalone and the Capacitor WKWebView) that `-apple-system-body` scales `rem` with the Text Size setting; if WKWebView ignores it, read the content size category natively and set `html { font-size }` from the Capacitor shell.

### 13.5 Motion in code

- CSS: `transition-[opacity,transform] duration-(--dur-fast) ease-standard motion-reduce:transition-none`.
- `motion/react`: `const reduce = useReducedMotion()`; pass `initial={reduce ? false : {...}}`. Sheets use `transition={{ type: 'spring', stiffness: 420, damping: 42 }}` or a 120 ms fade when reduced.
- Never animate width, height, top or left. No `window.addEventListener('scroll')`; collapse the large title with an `IntersectionObserver` sentinel.
- Every `useEffect` that starts an animation, a timer or a `requestAnimationFrame` loop returns a cleanup.

### 13.6 Component inventory (React)

```ts
// Honesty system
StatusChip({ status: MetricStatus; reasonCode?: ReasonCode; compact?: boolean; onOpenInfo?: () => void })
EvidenceTierChip({ tier: 'research-backed' | 'coach-recommended' | 'experimental' })
VerdictChip({ verdict: VerdictDisplayId; size?: 'compact' | 'large' })   // VerdictDisplayId = §3.5 rows
MetricValue({ metricId: MetricId; value: MetricValue | SessionMetric; size?: 'inline' | 'metric' | 'hero' })
CaptureQualityLine({ overall: 'good' | 'usable' | 'poor'; measured: number; detected: number; tip?: string })

// Building blocks
Button({ variant: 'primary' | 'secondary' | 'tertiary' | 'destructive' | 'critical'; icon?: Icon; compact?: boolean })
Segmented<T>({ options: { value: T; label: string }[]; value: T; onChange(v: T): void; label: string })
ChoiceChips<T>({ options; value: T | T[]; multiple?: boolean; onChange })
ListRow({ title; subtitle?; leading?; trailing?; onPress? }), Switch, Stepper, Sheet({ detent, title, onClose, guard? })
Toast (useToast().show({ message, action? })), EmptyState({ icon, title, body, action? }), Skeleton
OutcomeMark({ outcome: 'in' | 'net' | 'long' | 'wide' | 'fault' | 'untagged'; size?: number; experimental?: boolean })

// Tiles and cards
MetricTile({ metricId; session: SessionMetric; usual?: [number, number]; onOpen })
BandTile({ metricId: 'shoulder-tilt-trophy' | 'knee-bend-band' | 'shoulder-over-shoulder-contact'; view: CameraView; ... })
  // refuses (dev throw + test) to render a rear-only id in a side-view session (D1)
LegDriveTile({ legDrive: SessionMetric; driveTime: SessionMetric; loadingDepth?: SessionMetric; keyFrame: KeyFrameRef })
DescriptionLine({ metricId: 'loading-depth'; value })   // sentence + compact chip; no band, never "bend"
FlagRow({ metricId: 'deep-bend-flag'; value })          // experimental yes/no; never "little bend"
OutcomeTile, UnavailableRow, TossHeroTile, SignatureInsightCard
FocusCard({ decision: CoachingDecision; variant: 'full' | 'compact'; experiment?: Experiment; onStartDrill; onLogPractice; onRetest })
PreMatchCard, ExperimentStrip, SessionHeadlineCard, SeasonStrip

// Camera (both D1 set-ups)
SetupChoice({ value: CameraOrientation; onChange })      // R2; 'portrait' default
LiveFraming({ orientation: CameraOrientation; checks: FramingCheck[] })   // R3-P / R3-L
ServingSpotState({ state; orientation: CameraOrientation }), Countdown, RecordingScreen
TurnPrompt()                                              // landscape set-up only; never blocks

// Video
ServePlayer({ serve: ServeAnalysis; source: 'video' | 'keyframes'; clipOrientation: CameraOrientation;
              zoom: 'fit' | 'player'; boxHeight?: number; overlay: OverlayId; onOverlayChange; onTag })
PhaseTimeline({ phases: PhaseSpan[]; events: ServeEvents; frame: number; onSeek(frame: number): void })
KeyFrameStrip({ frames: KeyFrameRef[]; events: KeyFrameEvent[]; current: KeyFrameEvent; focus?: KeyFrameEvent;
                orientation: CameraOrientation; onSelect(e: KeyFrameEvent): void })
CompareView({ current: ServeRef; other: ServeRef; mode: 'side' | 'ghost' })   // stacked (landscape clips) or halves (portrait / mixed)
TagPad({ onTag(o: Outcome): void; onUndo; onSkip; onLet }), TallyCounter

// Charts (ui/charts)
ChartFrame({ title; subtitle; status?: MetricStatus; table: TableSpec; children })
Sparkline, ServeStrip, ServeIndex, TossMap, ServiceBoxMap, BeforeAfter, WilsonBar, MatchPracticeMultiples
```

`MetricId`, `MetricStatus`, `ServePhase`, `PhaseSpan`, `ServeEvents`, `KeyFrameEvent`, `CameraOrientation`, `CameraView`, `CoachingDecision`, `Experiment` come from `analysis/types.ts` and ARCHITECTURE §6; UI code never redefines them.

### 13.7 Enforcement (tests and lint)

1. **Status on every number:** `MetricValue` throws in development when `status` is missing; a UI test renders every screen with fixture data and asserts every `[data-metric]` element has a `data-status` attribute and a visible chip or state text (research 09 Implications P0).
2. **Contrast:** `tokens.test.ts` parses `tokens.css` and asserts every pair in §2.3 meets its requirement for all three token sets.
3. **Palette:** `npm run check:palette` runs the six-check validator (vendored from the dataviz skill into `tools/`) on the signal and categorical sets in both modes; CI fails on any FAIL.
4. **Copy lint:** a test scans `ui/copy/strings.ts`, `metrics.json` player-facing strings and `coaching-library.json` for `—`, `–` (outside source citations), `!`, emoji ranges and the never-say list (§11 rules 6 and 12); the formatter replaces en dashes in ranges with "to".
5. **Targets and overflow:** Playwright at 390 × 844 measures every interactive element's box (≥ 44 × 44) and asserts `scrollWidth === clientWidth` on each screen, in Day, Night and Court-side.
6. **Font features:** a unit test confirms tabular figures are active (equal advance widths for "1" and "0" with `tabular-nums`).
7. **Reduced motion:** Playwright with `reducedMotion: 'reduce'` checks that no element has a running CSS animation and that the tagging video does not autoplay.
8. **View honesty (D1, D5):** a UI test renders a side-view session fixture and asserts there is no `[data-metric]` for `knee-bend-band`, `shoulder-over-shoulder-contact`, `speed-average-rear` or `trunk-tilt-band` other than an unavailable ghost row, that the ghost rows "Needs a view from behind" exist, that no element shows a degree sign next to a band, and that the copy-lint never-say list (§11 rule 12) finds nothing in rendered text.
9. **Orientation:** the same fixtures with a portrait and a landscape clip assert that the video box is at most 45% of the viewport height and the tagging pad's top y is identical.

### 13.8 Charts and overlays in code

- Charts are React components returning SVG with `viewBox` in CSS px and `width="100%"`; text is SVG `<text>` using the same font tokens; a `ResizeObserver` recomputes layouts only when the card width changes.
- Hit testing: a transparent `<rect>` over the plot receives pointer events; `nearestPoint.ts` finds the closest mark within 24 px (quadtree when n > 50).
- `beeswarm.ts` is deterministic (stable for the same data) so marks do not jump between renders.
- Statistics come from `analysis/metrics/stats.ts` (Wilson, Newcombe, SD intervals, SWC, "N more serves"). Charts receive precomputed intervals.
- Overlays draw on a `<canvas>` sized to the video's displayed box × `devicePixelRatio`, redrawn on `requestVideoFrameCallback` (web) or per stepped frame; pose confidence rules per §2.7.

### 13.9 iOS shell notes (Capacitor)

- Status bar style follows the theme (dark text in Day and Court-side, light in Night); the recording screen forces light text on black.
- `viewport-fit=cover` is already set in `index.html`; all fixed bars use `env(safe-area-inset-*)`.
- Native haptics (later, via a plugin) on: tag recorded (light), Ready (success), verdict shown (none; calm).
- Native capture (ARCHITECTURE §15) must keep the R2–R7 layouts in both set-ups; the native plugin supplies the preview behind the same web overlay. The app UI is portrait-locked; the capture orientation is set on the capture connection (portrait by default, landscape for the fence set-up), and the landscape camera screens render their 844 × 390 layout rotated inside the portrait web view, driven by the device attitude.

---

## 14. Pre-flight checklist (run before calling any UI work done)

- [ ] Design read and dials unchanged, or this file updated.
- [ ] Only tokens from §2 and §13.2; no raw hex in components; one accent (optic) used only for its roles.
- [ ] One primary button per screen or sheet; labels ≤ 3 words and never wrapping at 320 px.
- [ ] Every number has a data-state chip, n and an interval where it matters; unavailable shows a reason, never a dash.
- [ ] Verdicts use the §3.5 words; no arrows alone, no red/green deltas.
- [ ] Radii follow the rule (controls 14, containers 20, sheets 28, media 10, labels full).
- [ ] Charts: takeaway title, state chip, ≤ 4 ticks, no dashed gridlines, surface rings on marks, table view, 24 px hit radius.
- [ ] Outcome marks use the §2.6 vocabulary everywhere, including tagging buttons and legends.
- [ ] Day, Night and Court-side all checked on screen at 390 × 844; console clean; no horizontal scroll. Camera screens checked upright and sideways; playback screens checked with a portrait and a landscape clip.
- [ ] No side-view knee band, shoulder-over-shoulder band, degrees, "bend more" or population comparison for legs or posture (D1, D5).
- [ ] Reduced motion and reduced transparency behave per §7.3 and §5.4.
- [ ] Empty, loading, processing, error and deleted-video states exist for the screen.
- [ ] Copy self-audit: every visible string re-read against §11; no em or en dashes, no exclamation marks, no emoji; Australian spelling.
- [ ] No streaks, badges, scores, confetti or marketing prompts.
- [ ] Icons are Phosphor regular `…Icon` names only; no hand-drawn icons.
- [ ] `web-design-guidelines` review run on changed files; Playwright screenshots reviewed; `playwright-cli close-all` at the end (user instruction).

---

## 15. Flags for other specs and for DECISIONS.md

1. **Unvalidated metrics: Estimate vs Experimental (D2, METRICS §1.3, research 10 §7.2).** Research 10 says toss, contact and rhythm metrics should "carry the `experimental` state and wording" until real-footage validation passes. METRICS caps them at `estimated` after synthetic validation (V1). If they were `experimental`, D2 and METRICS §1.5 would hide them from headlines and coaching, and the hero metrics would disappear from the product. **This file follows METRICS** (Estimate chip) and adds the validation-level layer in §3.2 (a report footer and "How sure we are" text) so the player is still told that the methods are checked on simulated serves only. D2 should name validation level as a separate dimension from data state.
2. **Verdict ids and words differ across specs.** METRICS §4.5 (`clearly-better`, `too-early`), COACHING §12.4 (`clear-improvement`, `clear-decline`, `too-early-to-tell`) and ARCHITECTURE §6.5 (`VerdictWord`, which lacks the "clearly" pair) disagree, and COACHING says "Clear improvement" where METRICS says "Clearly better". §3.5 maps all of them to one display vocabulary using the METRICS words. ARCHITECTURE's `VerdictWord` should add the two "clearly" ids with one spelling.
3. **"Usual" range needs one definition.** §9.2 proposes "the lowest to highest value of up to 6 previous matched sessions (at least 2)" for bands and "usual 12 to 15" text. METRICS §4.6 mentions a grey personal-range band but does not define it. METRICS should own the definition; this file will follow.
4. **CAPTURE §9.7 serving-spot text.** "Text 2 cm tall" with one to three words fits neither orientation alongside a large glyph. §10.3 R4 uses one word plus the glyph, field colour and sound, with the full instruction in smaller text for when the player walks back: 150 px (about 17 mm cap height, legible to about 11 m) in the fence set-up, and about 92 px in the upright default, the largest size at which "Step in" fits 358 px (about 10.7 mm, legible to about 7.4 m; the upright player is about 6 to 9 m away, so beyond 7.4 m the field colour, glyph and sound carry the state). The Archivo cap height and widths must be verified in the built font.
5. **Unavailable glyph and dash.** Research 09 §3.3 proposed a lock; §3.1 uses `EyeSlashIcon` so "not measurable here" never looks like a paid feature, and never a dash. PRODUCT §6.5 item 9 and §6.14 still say "—" with "the lock glyph"; they should point to §3.1.
6. **Dashes in copy.** METRICS and `metrics.json` examples use en dashes in ranges ("about 140–155 km/h") and in names ("Toss front–back consistency"). The display layer writes "to" in ranges and hyphens in names; `metrics.json` player-facing names should drop en dashes so the formatter does not have to rewrite them.
7. **Rhythm units.** METRICS shows `rhythm-release-to-contact` in ms (rounded to 10 ms) and spreads to 5 ms. This file displays durations as seconds with two decimals (identical precision, easier to read: "0.92 s") and timing spreads in milliseconds ("45 ms"), with the unit explained in Metric info. METRICS should confirm.
8. **Theme setting shape.** ARCHITECTURE §7.1 `SettingKey 'theme'` needs the value shape in §13.3 (scheme plus Court-side preference).
9. **Paywall prices** in §10.13 are research 08 §6 proposals and test cells; PRODUCT.md owns the final prices and the season-pass end dates (research 08 gap-fill correction).
10. **CAPTURE is still landscape-only** (§2 "Orientation: landscape", the Diagram B "Portrait: loses your landing" inset, the `cq.orientation` check that warns on portrait, and 7–9 m or 1.5–1.9 m placements). The revised D1 makes portrait at 7–8 m from the centre mark the default and landscape at the fence the alternative. This file follows D1 (§5.1, §9.10, §10.3); CAPTURE's set-up copy, diagrams and `cq.orientation` should follow, and R2's copy is a placeholder until they do.
11. **PRODUCT §6.2 card table: referral suppression.** PRODUCT §7.7 says no drills or cues are shown during a pain pause, but the §6.2 table does not say which Today cards hide. This file hides the match-day card and its warm-up entry, the focus card, the experiment strip, re-test lines and "Try the other cue", and keeps the last-session and match-log cards (§10.2). PRODUCT §6.2 should add the same suppression column.
12. **PRODUCT §6.5 stats order for `more-pace`** still lists "Knee bend band · Trunk tilt band". Under the revised D5 these become leg drive and shoulder tilt at the top of the swing (§10.6). PRODUCT §6.9 tile 4 should also add leg drive, as PRODUCT §3.2 already points "Am I using my legs?" to it (§10.10).
13. **ARCHITECTURE `ProfileRecord.ageBand`** offers `'under-15' | '15-17' | '18-plus'`, but onboarding (PRODUCT §6.1 O2, mirrored in §10.1) can only produce `'18-plus'` in the closed beta (D11). For the beta the type should be `'18-plus'` only, with the public-release bands pending the privacy owner's decision.
14. **Overlay ids** (COACHING §8.1 owns them). This file adds drawings for `hip-rise`, `shoulder-line`, `knee-rear` and `shoulder-over-shoulder`, keeps `hip-path` as a description only, and drops `trunk-line` with `trunk-tilt-band` (§8.11). COACHING §8.1 and `coaching-library.json` should use these ids or say which to rename.
15. **"Trophy" in player-facing names.** §11 keeps "trophy" out of player copy ("the top of your swing"). PRODUCT §5.1 names `shoulder-tilt-trophy` "Shoulder tilt at the trophy position". `metrics.json` owns the name; this file's wireframes use "Shoulder tilt, top of the swing" as a placeholder and suggest "Shoulder tilt at the top of your swing".
16. **New reason-code short forms** requested by ARCHITECTURE §17 item 8 are in §3.1 (`NEEDS_REAR_VIEW`, `NEEDS_SIDE_VIEW`, `TARGET_NOT_TAGGED`, `APEX_EXTRAPOLATED`, `TILT_UNKNOWN`, `BOUNCE_NOT_LOCATED`, `EXCLUDED_BY_QUALITY`). `VIEW_NOT_SUPPORTED` is no longer in ARCHITECTURE's list and was replaced by these.

---

## 16. Sources

Research (project documents, cited as research NN [Sx]):
- `docs/research/09-ux-benchmarks.md`: [S1] Charting data, [S2] Charts, [S4] WWDC22 "Design app experiences with charts", [S5] HIG Accessibility, [S6] HIG Color, [S8] Playing video, [S9] Onboarding, [S10][S11] Progress indicators and Loading, [S12] Tab bars, [S13] Materials (Liquid Glass), [S14] Privacy, [S15] Notifications, [S16] Camera Control, [S18] AXChartDescriptor, [S19] `step(byCount:)`, [S20] Vision body pose, [S27][S30] Gentler Streak, [S63][S64] quantile dotplots, [S65] uncertainty evaluation survey, [S66][S67] error bars, [S72] Tufte sparklines, [S74] Okabe and Ito, [S76][S77] WCAG 1.4.1 and 1.4.11, [S81] Calm Technology; §3.3 data-state proposal; §5 chart vocabulary; §6 playback; §13 IA.
- `docs/research/10-segment-decision.md`: §2 persona, §7.1 M1–M14 requirements, §7.2 must-nots, §7.3 spec changes.
- `docs/research/08-monetisation-costs.md` §6: tier and price proposals.
- `docs/research/06-capture-protocol.md` [S8] (professional toss variability, via METRICS §3.6).
- Gap studies (27 Sep 2026): `docs/research/gaps/side-view-geometry-contradictions.md` §0, §1, §3.3–3.4, §4, §5, §6.1–6.9, §7 ("gap geometry": framing rule, tilt rectification, toss-offset bias, leg-drive proxies, what the side view cannot see, audio speed removal); `docs/research/gaps/recreational-reference-ranges.md` §0, §6.1–6.4, §7, §8 ("gap ranges": capture envelope, provisional UTR 1–7 bands, plausibility bounds); `docs/research/gaps/australian-segment-evidence.md` §1, §9.2 (D11 segment, onboarding answers); `docs/research/gaps/intuitive-tennis-kovacs-primary-content.md` §5 (no "bend more", no prescribed toss height, landing as a result).
- Specs: `docs/DECISIONS.md` D1–D11 (D1, D4, D5 revised 27 Sep 2026); `docs/PRODUCT.md` §4.4, §5.1, §6.1–6.9, §6.16, §7.1, §7.7; `docs/specs/METRICS.md` §0, §1.3, §1.5, §3.6–3.25, §4.1–4.9, §6, §7; `docs/specs/COACHING.md` §1, §7.6, §8, §10, §12, §13, §14; `docs/specs/CAPTURE.md` §3, §4, §5.5, §7, §8.4, §9, §15; `docs/specs/ARCHITECTURE.md` §3, §5.1, §5.5, §5.6, §5.8–5.12, §6, §7.1, §8, §11, §13, §14, §15, §17.

External references checked for this file (27 September 2026):
- `@fontsource-variable/archivo` 5.3.0 package metadata and `wdth.css` (jsDelivr): family "Archivo Variable", weight 100–900, width 62–125%, OFL-1.1, subsets latin, latin-ext, vietnamese.
- Archivo source `sources/Archivo.glyphs` (github.com/Omnibus-Type/Archivo): defines `tnum`, `pnum`, `lnum`, `zero`, `case` and `frac`; Omnibus-Type describes Archivo as designed for high-performance typography in print and digital.
- `@phosphor-icons/react` 2.1.10 in `app/node_modules`: every icon name used in this file was checked to exist; `…Icon` names are the current exports.
- The dataviz skill's reference method and `validate_palette.js` (six checks, Machado 2009 CVD model) and the `design-taste-frontend` skill (anti-default, colour, typography, accessibility and pre-flight rules).

---

## Revision log (2026-09-27)

Revised against the revised `docs/DECISIONS.md` (D1, D4, D5, new D11), the canonical metric ids and the gap studies of the same day.

**Decision-driven changes**
- **D1 camera and framing.** The camera flow is portrait-first: a new R2 set-up choice (upright beside the court, 7–8 m from the centre mark, 1.3–1.6 m high, level, the default; sideways at the fence, 8.5–9.5 m, 1.4–1.8 m, 4K preferred). Portrait wireframes for live framing (toss room at the top, checklist rail at the bottom), serving-spot states, countdown and recording; landscape kept as the variant; the turn prompt appears only for the fence set-up and never blocks (§5.1, §10.3). The framing rule replaces fixed distances: "Room above" passes at a 4.5 m frame top, accepts 4.3–4.5 m with "Very high tosses will be estimated", and blocks below 4.3 m without a "Record anyway" override; a measured tilt up to 5° shows as "corrected", above 5° blocks (§8.20, §10.3 R3). Diagram labels are measured from the centre mark and show the 4.5 m frame-top line (§9.10). Side-view toss bias and sideways-wobble inflation are stated in copy and Metric info (§3.3 rule 12, §8.7, §9.4). Principle 4 distances corrected.
- **D1 portrait clips.** Every playback surface now has a portrait-clip layout: video box capped at 45% of the viewport with a "Zoom to you" option (§8.11), 9:16 key frames and evidence frames (§8.8, §8.9, §10.9), side-by-side compare in left and right halves (§8.12), and a Tagging video box fixed at 390 × 219 so the pad never moves (§8.14, §10.8).
- **D4 speed.** No side-view speed from sound anywhere; the side-view experimental range needs ≥ 120 fps, clean detections, a height scale and a target tag ("Tag your target"); rear `speed-average-rear` is "average speed to the bounce"; hit-sound timing row says it only times contact (§3.1, §4.3, §8.7, §10.3 R1, §10.14).
- **D5 metrics.** `trunk-tilt-band` removed; no side-view knee band. Added: the leg-drive tile (hip rise % of height, band words against the player's own serves, drive time, `hip-rise` overlay), the descriptive loading-depth line (no band, never "bend"), the experimental deep-bend row, the `shoulder-tilt-trophy` band tile with the `shoulder-line` overlay and "compared with your usual", rear-only band tiles for `knee-bend-band` and `shoulder-over-shoulder-contact`, "Needs a view from behind" ghost rows, a leg-drive Progress tile, the lowest-hip key frame, and no comparison with published trunk angles or professional centre-of-mass rise (§3.3 rules 6–8, §8.7, §8.9, §8.11, §10.6, §10.10, §10.14, §11 rules 12–13, §13.6, §13.7).
- **Gap studies.** Provisional club-player bands only in Metric info (§3.3 rule 13); plausibility hard-reject and soft-flag treatments (§3.3 rule 14, §9.4); apex-above-frame "Peak estimated" (§3.3, §9.4); new reason-code short forms (§3.1).
- **D11.** Design read names comp-night regulars in metro Melbourne and the 18+ beta (§0); onboarding captures play style and match nights (§10.1); Profile shows them (§10.12).
- **Canonical ids.** Metric id list replaced (header); components typed to the new ids (§13.6); flag 7 on D1 geometry deleted and flags renumbered; new flags 10–16 (§15).

**Reviewer issues**

| # | Severity | Issue | Decision | Reason |
|---|---|---|---|---|
| 1 | critical | Landscape-only camera flow blocks the D1 portrait default | Accepted | Revised D1 makes portrait the default; R2 is now the set-up choice, portrait R3–R6 added, landscape kept as the variant, labels "7-8 m from the centre mark", flag 7 deleted |
| 2 | major | Body check skipped within 2 hours; coaching shown during a referral | Accepted | PRODUCT §6.16 and COACHING §10.1 require it every time and PRODUCT §7.7 shows no drills or cues in a pain pause; exemption removed, pre-match card, warm-up entry and experiment strip hidden; PRODUCT §6.2 change raised as flag 11 (outside this file) |
| 3 | major | Playback layouts assume 16:9 clips | Accepted | A 9:16 clip at full width would push every control off screen; 45% cap with zoom, 9:16 thumbnails and frames, left/right compare, fixed tagging pad y |
| 4 | major | Knee and trunk band tiles in the side report; no leg-drive or shoulder-tilt components | Accepted | Revised D5 and the canonical ids; components and Progress tile added as proposed |
| 5 | major | Onboarding differs from PRODUCT §6.1 and cannot produce `playStyle` for `inSegment` | Accepted | §10.1 now mirrors PRODUCT O1–O9 options and stored fields exactly; the ARCHITECTURE `ageBand` change is outside this file and raised as flag 13 |
