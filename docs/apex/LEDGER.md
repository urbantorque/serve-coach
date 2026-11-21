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
  - **What there is to read.** Five licensed clips, every one 640 by 480 or
    smaller: three measured (`0SAQUE` and `Saque_con_pelota`, side-on at 320
    by 240; `Blaz_Rola_NCAAs_2013`, from behind the far baseline at 640 by
    480), `Sharapova_Amelia_Island` refused as not a serve, and
    `Saque_reves` refused, rightly: it is a table tennis serve, which N2.1
    recorded as "not taken for a serve" without naming the sport.
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

## Wave 2. The report and the coaching

## Wave 3. The loop and the studio

## Wave 4. The front door

## Wave 5. Close
