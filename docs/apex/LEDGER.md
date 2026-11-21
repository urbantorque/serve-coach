# The Apex programme: ledger

One line per item, ticked when it lands, with what it turned out to be and how
it was proved. The plan is `docs/apex/HANDOVER.md`; the six areas are A to F.
Newest at the bottom of each wave. A measured "not adopted" is a result.

Branch `apex`, cut from `main` at `b4d0e80` on 2026-11-22.

## Wave 0. Ground

- [x] **A0.1 The baseline.** The gate on `apex` as cut: typecheck, eslint,
  build and 2,359 checks, all green. The `apex-before` shots in
  `docs/lift/apex-before/` (50 files at 390 by 844) and
  `docs/lift/apex-before-laptop/` (48 at 1440 by 900), none failed. The first
  attempt found the dev server down and every shot refused; the server was
  started again and the whole set retaken.
- [ ] **A0.2 The owner's three inputs, asked once.** Their own serves, the
  WebKit and Firefox download, and more licensed footage (handover section 7).

## Wave 1. Truth and the moment

- [x] **A1.1 N2.8's two questions, asked of real footage: the 3D knee
  straightens on one leg, and MediaPipe heavy is no better. Heavy not
  adopted.** `scripts/real-probe.mjs` reads every clip in `bench-data/clips/`
  (and `bench-data/own/` when it exists) with the app's own `analyzeServe` in
  the dev server, keeps every pose sample, and asks inside the serve the
  engine found (ready to contact) how far MediaPipe's 3D knee angle sits from
  the picture's at the deepest picture bend, and whether either wrist jumps
  more than 0.3 of a body height in one frame between the trophy and just past
  contact. `src/lib/pose/devModels.ts` lets a bench page swap in a bigger
  model from `bench-data/models/`; `import.meta.env.DEV` is false in a build,
  so the app always fetches its own. Results in
  `docs/apex/bench/real-probe.json` and `real-probe-heavy.json`.
  - **What there is to read.** Four licensed tennis clips, every one 640 by
    480 or smaller: three measured (`0SAQUE` and `Saque_con_pelota`, side-on
    at 320 by 240; `Blaz_Rola_NCAAs_2013`, from behind the far baseline at
    640 by 480), and `Sharapova_Amelia_Island` refused as not a serve. A
    fifth, `Saque_reves`, was a table tennis serve; it is out of the benches
    and the results (A1.2).
  - **The 3D knee, with the app's model.** On both side-on clips one knee
    agrees with the picture at its deepest bend (2.2 and 3.2 degrees apart)
    and the other reads 19.1 and 13.5 degrees straighter in 3D. On the Rola
    clip, filmed from in front, the gaps are 63 and 19 degrees, but a picture
    angle from the front is not the true angle, so that clip says little.
    This is the same direction as the drawn body (55 degrees straighter in
    N2.8), smaller, and on one leg. The trophy and knee bend stand on the 3D
    knee, so it remains the engine's main suspect; two low-resolution clips
    are not enough to change what it reads.
  - **The wrist at contact.** No arm read hanging down at contact on the side-on
    clips: `Saque_con_pelota` had no jump past 0.3, `0SAQUE` had two on the
    racket wrist (0.34 and 0.41) in the last 0.1 s before contact, which is the
    speed of a real hand there at 30 frames a second. The Rola clip had one,
    on the tossing wrist after the trophy. N2.8's raised-arm failure did not
    show on real footage, on three serves.
  - **MediaPipe heavy, not adopted.** Against the full model on the same
    clips: the 3D knee further from the picture (15.7 to 46.7 degrees
    straighter on the side-on clips), eight wrist jumps on the Rola serve
    where full had one, reads 1.1 to 1.6 times slower, and on `0SAQUE` a
    different serve of the clip chosen. Nothing it read was better.
  - **Next.** Whether the trophy and knee bend should be read off the picture
    when the camera is side-on needs the mocap bench and the retest bench run
    both ways, and real footage sharper than 320 by 240 to settle it: owner
    serves, or more licensed clips (both asked, A0.2).
- [x] **A1.2 Tennis only.** The owner's call: the app is about tennis serves
  and nothing else. `Saque_reves` (a table tennis serve) is out of
  `bench-data/clips/` and its attribution, the clip bench, the retest bench's
  default set and both probe results; two comments that used it as an example
  now describe the failure without it. The app itself already refused it as
  "not a serve", and still refuses any clip with no tennis serve in it.

- [x] **B1.0 The report moment, three takes, on a Claude Design canvas.**
  "Serve Coach: the report moment, three takes" (artifact
  `aab94563-67dd-45e8-9e8d-90c98a49fbfb`): today's report beside A, the held
  frame (the serve stops on the fault, today in coral, the target in lime, the
  score small under the fix), B, four areas in place of one score, and C, the
  change since the player's best serve, each at 390 by 844 and 1440 by 900, on
  a licensed frame ("Blaž Rola NCAAs 2013" by ZooTennis.com, CC BY 3.0). The
  pick is with the owner; the recommendation is A, with C as what A becomes
  from the second trip on. B is honest only if every area is graded, and
  contact is shown and never graded.
  - **What the canvas gets wrong, found building it.** Take A draws the lime
    target as a redrawn leg on the photograph. The app refuses that for an
    angle measured in 3D (`targetShape.ts`: no image-space construction
    re-measures to a world angle), and A1.1 has just shown the 3D knee
    disagreeing with the picture. On the player's own footage the target is
    the target shape, a diagram in its own plane, captioned "Shape to aim
    for"; only a height fault's ghost (`ghostFor`) may sit on the body.
- [x] **B1.1 The fix shows the shape to aim for, and the held frame plays
  again.** Common to all three takes, so built before the pick.
  - **The shape to aim for under the fix, on a laptop.** `faultMetric`
    (`lib/lookFor.ts`) finds the card row the leading fault is read from (the
    row `faultMoment` already took the held moment from), and `targetDrawn`
    (`analysis/targetShape.ts`) is every reason `TargetShape` withholds a
    figure, now in one place the report and the card both ask. Drawn on 1 of 7
    dialled serves: a low contact; the toss arm, leg drive and clean serves
    have no figure, which is the rule. `heldTarget.test.ts` proves the report
    draws it exactly when the row would, with its caveat, and never inside the
    band or on a soft reading.
  - **Not on a phone, yet.** Under the fix it pushed "What to do now" behind
    the action bar at 375 by 812, undoing N7.8; as a plate on the picture it
    covered the score, and cutting it down would drop the viewpoint line the
    figure must carry. It goes on the picture once the score leaves it, which
    is the design pick. Hidden below 1024 px until then.
  - **The key's swatch was lime beside a coral line**, on every card that
    draws a figure: the line takes the status colour and the swatch did not.
    It does now, so "You" is keyed in the colour it is drawn in.
  - **Play it again.** A glass button on the held frame replays the clip into
    the hold (the stage is keyed, so each press is a fresh reveal), hidden
    while it plays and under a warning, where the picture is short. Proved in
    Chrome on `Saque_con_pelota`: hidden during the replay, the picture moving
    mid-way, and the same held frame after.
  - `?demo=held-target` opens a report led by a low contact.

## Wave 2. The report and the coaching

## Wave 3. The loop and the studio

## Wave 4. The front door

## Wave 5. Close
