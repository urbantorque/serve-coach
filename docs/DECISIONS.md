# Product decisions (v1)

Decisions made by the product lead after the research sweep (docs/research/01-09). Specs must follow these; if a spec author believes one is wrong, they flag it rather than silently diverging.

## D1. One primary camera view: side-on, hitting-arm side (revised 2026-09-27 after gap study)
- Camera on the server's hitting-arm side (right side for a right-hander), on the baseline extension, lens pointing along the baseline at the server (the baseline runs into the centre of the screen). **1x lens**, stabilisation off where possible.
- **Placement follows a framing rule, not a fixed distance.** In the server's plane the frame must reach from below the feet to at least **4.5 m** (4.3 m accepted, with a toss peak above the frame estimated and labelled; 4.7 m target). A live headroom check computes the frame top from the standing player and blocks recording below 4.3 m. (gaps/recreational-reference-ranges §6, gaps/side-view-geometry-contradictions §6)
- **Default set-up: portrait, 7-8 m from the centre mark** (between courts or just outside the doubles alley), phone 1.3-1.6 m high, level. Portrait puts the long axis of the sensor on the vertical serve motion. That gives a frame top of about 5 m and roughly 450 px of player height at 1080p, against about 290 px for landscape at the fence. [Our inference: 26 mm-equivalent video FOV, long-side half-angle about 31-33°]
- **Alternative: landscape at the side fence**, 8.5-9.5 m from the centre mark, 1.4-1.8 m high, level or tilted up by at most a few degrees. Prefer 4K here because pixel density is lower. A measured upward tilt of 5° or less may be used when closer; pitch is read from motion sensors and removed in software (rotation homography on keypoints). Uncorrected tilt is not allowed.
- **60 fps default**. 120/240 fps improves timing precision and is required for anything speed-related. 30 fps is accepted with reduced timing precision.
- **What the side view measures:** movement in the vertical plane along the serve direction:
  - toss peak height and forward placement, and the drop from peak to contact;
  - contact height and forward position;
  - rhythm;
  - leg drive (hip rise from the lowest point to contact, and drive time);
  - landing distance;
  - shoulder tilt at the trophy position.
- **What the side view cannot measure:** knee bend (the knees point at the camera at the trophy position) and shoulder-over-shoulder tilt or forward lean at contact.
- Known bias: a toss 0.3 m nearer the camera than the body reads about 8-12 cm high, and a 10 cm sideways toss spread adds 2-4 cm of apparent height spread. Absolute toss height is therefore `estimated`, and the consistency copy says so.
- **Second angle (optional, "outcomes view")**: a raised rear view behind the server with both service boxes visible. It unlocks:
  - toss left/right drift;
  - a knee-bend band (the knee nearer the camera is in profile);
  - shoulder-over-shoulder at contact;
  - experimental automatic in/out and placement (after a four-corner court tap);
  - experimental average speed from contact to a bounce located in video;
  - later, two-phone 3D toss.

  Statistics are **never mixed across views**.

## D2. Honesty labels on every number
`measured` | `estimated` | `player-entered` | `experimental` | `unavailable`, each with a reason code, a glyph and text chip. Coaching insights also carry an evidence tier: `research-backed` | `coach-recommended` | `experimental`. No unlabelled numbers anywhere.

**D2 addenda (2026-09-28):**
- **Capture quality** is a data-quality gate, not a serve statistic. It keeps its own rule so it is never hidden: it is always shown, and it carries the `experimental` label ("Automatic check, experimental") until its checks pass validation on real footage. Its info sheet says the checks have only been tested on simulated footage.
- **Validation levels are cumulative.** A metric reaches V2 (real footage, annotated) only after V1 (synthetic), and V3 (radar/reference instrument) only after V2. Statuses can move up only through a documented validation run.
- **Contact-height acceptance threshold** is 2.5% of standing height, as in metrics.json. METRICS.md prose should match it.
- **Fused-event disagreement:** when independent timing signals disagree beyond their stated uncertainty (audio contact vs wrist apex vs ball track), every value that depends on that event is downgraded or withheld. A single wrong event must never produce a confident-looking `estimated` value.

## D3. Outcomes in single-view mode are player-entered
Serve-in / net / long / wide, serve number (1st/2nd), intended type (flat/slice/kick) and target zone (T/body/wide) are tagged per serve in a fast review flow, or entered as a session tally. Linking per-serve tags to measured mechanics is a signature insight (e.g. "serves that went in had a toss 12 cm further forward").

## D4. Speed and spin
- Spin rate: always `unavailable`, with a one-line explanation.
- Serve type: `player-entered` intent.
- Speed: `unavailable` by default. `experimental` **range only** when all of these hold: side view, 120 fps or more, clean ball detections just after contact, height scale known, and a target tag (T/body/wide) that bounds the ball's angle out of the image plane. In the rear outcomes view, a second experimental path uses average speed from contact to a bounce located in video. **The side view never uses audio flight time**: the bounce is out of frame and its distance unknown, giving about ±20% error. Audio is used only to time contact. It is processed into timestamps and raw audio is not kept. Always name the quantity (peak vs average), round it, and show a range. A radar or Pocket Radar reading can be entered as `player-entered` and becomes validation data.

## D5. Hero metrics
Toss consistency is the lead: apex height spread, forward/back spread, and drop from apex to contact.

Next come:
- contact height (as a ratio of standing height);
- rhythm (release-to-contact time and its spread);
- landing distance;
- **leg drive**: hip rise from the lowest point to contact, as a % of height, plus drive time.

**Shoulder tilt at the trophy position** appears as a player-relative band (low / typical / high) backed by a key frame.

In the side view, **knee bend is not shown as a band**. Loading depth (hip drop) is described, never turned into a "bend more" instruction; an optional experimental "deep bend: yes/no" flag is allowed. A knee-bend band appears only when the rear view is recorded. Shoulder-over-shoulder at contact is a rear-view band.

No 2D band is compared with published trunk angles (for example 48° or 25 ± 7°), because their definitions differ.

Never show precise distal-joint angles, racket drop, external rotation, pronation or racket-head speed.

## D11. Launch segment (from research 10)
- **Primary: "comp-night regulars".** Adults of about 30-55, UTR about 3-7, who play weekly night comp or pennant, starting in metro Melbourne. Their pain is a serve that fails on match night: too few first serves in, and double faults in front of the team.
- **Secondary: solo court-bookers.** Improving adults who book courts to practise alone.
- Coaches are the lead acquisition channel, not a paying segment.
- Juniors, masters-specific features and speed-seekers are deferred. The closed beta is for users aged 18 and over.

## D6. One coaching decision per session
Priority: safety gate (pain) → detection confidence → earlier-chain faults before later ones (toss/loading before contact/finish) → biggest outcome gap → the player's goal. Output: one focus, the evidence (key frame beside the player's own best serve, plus 1-2 stats), one cue (an analogy for UTR 1-3, a target/outcome cue for UTR 4-7) and one drill (5-10 min, solo, at a public court with a ball basket). The loop is an "experiment": practise, re-test, then a matched comparison ("Did it work?") with an honest verdict.

## D7. Statistics honesty
n on every rate, Wilson intervals, "X of N serves measured", matched comparisons only (same view, serve side, 1st/2nd), verdicts as words ("likely better", "too early to tell") with "about N more serves to confirm". Process metrics (toss spread, rhythm) lead progress because they are less noisy than serve-in %.

## D8. Privacy and storage
Analysis runs on the device. No account and no upload in v1. MediaPipe telemetry is blocked by CSP. Raw video retention is the player's choice (keep, auto-delete after 30 days (default), or delete after analysis while keeping stats and key frames). Delete per serve, session or everything. Export as JSON/CSV. Pain notes stay local-only and act as a referral switch, never a health record.

## D9. Platform
v1 is a phone-first PWA (Vite + React + TypeScript) with a framework-free analysis engine. The iOS route: Capacitor shell first, with native AVFoundation capture (locked exposure/fps) and Apple Vision / Core ML pose as native plugins, then a full native app if metrics justify it. Any cloud AI (coaching phrasing) is optional, off by default, and consent-gated per App Store 5.1.2(i). It sends structured metrics only, never video.

## D10. IA
Four tabs, **Today, Record, Sessions, Progress**, plus a profile sheet (goals, comfort/pain, storage & privacy, how we measure, experimental toggle, plan).
