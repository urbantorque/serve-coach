# Ground-truth fixtures

Real clips, hand-labelled, that the engine is checked against.

The synthetic rig in `../syntheticServe.ts` proves the maths is self-consistent.
It cannot prove the engine agrees with reality — it has no motion blur, no
rolling shutter, no far-side leg inferred from behind a torso, and its world `z`
is exact where MediaPipe's is the noisiest number it produces. Hip–shoulder
separation and shoulder tilt are computed almost entirely from that `z`. Until
there are recorded fixtures here, those two measurements are untested against
anything real.

## Capturing one

1. `npm run dev`, analyse the clip in the browser.
2. On the report, in dev builds only, there is a **Save as test fixture** button
   under the filmstrip. It asks you to describe the clip — who, which hand,
   which angle, which frame rate, which phone — and writes nothing until you do.
   Then it downloads `<clip>.fixture.json`: the pose output for every tracked
   frame, plus what the engine currently detected — *not* the video, which never
   leaves the page.
3. Read the console. It prints everything still standing between that file and a
   fixture the suite will accept, in the validator's own words. That list is the
   rest of this page, generated rather than remembered.
4. Move the file into this folder.

## Labelling one

The downloaded file has the engine's own answers pre-filled in `expect` and a
`"_UNVERIFIED": true` flag. **Those answers are not ground truth** — they are
what the engine said, which is the thing being tested. Go through them:

- Scrub the clip and correct each keyframe time in `expect.keyframes` by eye.
  Delete any you cannot pick confidently; a wrong label is worse than none.
- Fill `expect.metrics` with values you have measured independently — contact
  height against a mark on a wall, knee angle with a protractor on a paused
  frame, drop-to-contact from counting frames. **Check the unit** against
  `_engineUnits`, which names the unit each measurement is compared in: heights
  are in the player's own standing heights rather than in metres, so a tape
  measure's answer needs dividing before it means anything here. A value copied
  from the engine's own output asserts only that the engine is reproducible,
  which is not what this suite is for.
- Write an `expect.metricSource` note for each metric you kept, saying how you
  measured it. One per metric, and the schema check rejects the file without
  them. It is not paperwork: it is the step that makes pasting the app's own
  number an explicit false statement rather than a box left empty.
- Confirm `expect.handedness` and `expect.view` against the clip. They arrive
  prefilled with the engine's own read, which makes them the two assertions in
  the file that pass by construction until a human has agreed with them — and
  handedness labelled by a human is the only thing that catches a clip mirrored
  by a front-facing camera.
- Remove the `"_UNVERIFIED"` flag and delete the `_engine…` keys. The suite fails
  loudly while any of them are present, so an unlabelled dump cannot quietly
  masquerade as a validated fixture. The `_engine…` keys are there so you can see
  what the engine said while you correct it — the validator also compares them
  value-for-value against your `expect`, and names any entry you left exactly as
  the engine printed it.

Check your work without touching the suite:

```
node scripts/replay-fixture.mjs path/to/clip.fixture.json
```

That runs the real engine over the fixture and prints a field-by-field diff —
your label, the engine's answer, the error and how much of the tolerance it
used. Loop on that until you are happy, **then** add it to `index.ts`.

A disagreement is a finding. Check your label first; if the label is right, the
engine is wrong and that is the entire reason this folder exists. Do not widen
`tolerance` to make it green.

## Looking across the clips

Give it more than one file and it also prints a row per measurement over all of
them:

```
node scripts/replay-fixture.mjs src/lib/analysis/__tests__/fixtures/*.fixture.json
```

```
Across 6 clips (engine minus label, in the measurement's own unit)
  ✓ metric kneeBend      n=6  -1.799 … +2.803  median -0.098  31% of ±9 on clip-b
```

One clip answers "did the engine agree with this label". Every question this
folder actually exists to settle is plural — is the allowance on contact height
right, does the trophy land late on everybody or only on this player, is a
signal steady enough to grade at all — and each of those is a distribution, not
a comparison.

Read `n` first. Two clips is an anecdote with an average, and a tidy median next
to `n=2` is the easiest way there is to talk yourself into a band; the tool says
so out loud under any row resting on fewer than three.

It reports a spread and never proposes a band. A tool that suggested one from
six clips would be inventing exactly the number `UNCALIBRATED` in `tiers.ts`
refuses to invent, and it would arrive wearing the authority of having been
computed.

## What to film

This is the list to take to a court. Six clips clear the gate; they are chosen
so that no two of them prove the same thing, which is why the order matters more
than the count.

Every clip follows the four rules in the top-level `README.md` — side-on and
4–5 m away unless the row says otherwise, whole body in frame with room above
the racket, three to five seconds, one serve — except where a row deliberately
breaks one of them, which is the point of that row.

### The six that clear the gate

| # | Film | Phone | What it proves |
| --- | --- | --- | --- |
| 1 | Right-handed adult, side-on | 30 fps | The everyday case. Every keyframe, every angle and every height against one clip a human has scrubbed. If this one disagrees, nothing below matters yet. |
| 2 | The same player, same angle | slow motion, 120 or 240 fps | Timing survives frame rate. Drop-to-contact is about a sixth of a second, so at 30 fps it is four or five samples wide; this is the clip that says whether the engine reads the same serve the same way with thirty. |
| 3 | The same player, front-on or from behind | 30 fps | The view detection does what it claims: contact-depth is *dropped* rather than guessed, and the measurements that survive still read true. Also the first real test of hip–shoulder separation from a view where the shoulder line is not pointing at the lens. |
| 4 | **Left-handed** adult, side-on | 30 fps | A left-hander is not a mirrored right-hander to a pose model. The racket arm is the one the torso occludes on a side-on clip, so which arm holds the racket decides which measurements survive at all. |
| 5 | The left-hander, front-on or angled | 60 fps | The third frame rate, and the second hand seen from the second view — the combination neither 3 nor 4 covers on its own. |
| 6 | Right-handed adult, side-on, **feet deliberately out of frame** | 30 fps | `scaleFromTorso`. Every height in the report is a ratio of standing height, so this is the clip that says whether the fallback measures the same serve or a different one. Expect the heights to be marked approximate; that is the fixture passing, not failing. |

**Do not mirror a clip in a video editor to produce row 4.** A mirrored
right-hander is exactly what a front-facing phone camera produces, the app
already treats that as an artifact to be diagnosed, and the pose model's
behaviour on a real left arm is the thing being tested. Ask somebody at the
club. If nobody left-handed is available, the gate stays red and it is right to
— five clips of one hand is a suite that is green against half the players this
app has.

### Beyond the six

The gate cannot read any of these, and the count going quiet is not a claim they
are covered. They are where the engine will actually break.

| Film | What it proves |
| --- | --- |
| A junior, filmed close | Every ratio is against the player's own body, so a short player filmed near should measure the same as a tall one filmed far. This is the clip that says whether that is true. |
| From the back fence | Where the tracker gives up. `MIN_FRAME_HEIGHT_SHARE` and `HANDS_SEEN_FLOOR` are conventions with a test around them, not findings — see the comment above them. Footage is the only thing that turns them into measurements. |
| Bright sun, and floodlit | Two different failures: blown highlights lose a white shirt against a white wall, and floodlights add motion blur by dropping the shutter speed. |
| A cluttered background, or somebody walking behind | The hand-off check. The pose model is asked for one body and picks one every frame with no obligation to pick the same one twice. |
| Somebody else's ball in shot | The ball tracker demands a free-fall arc with the curvature the player's own height implies. This is the clip that says whether that is enough. |
| A rally, a practice swing, somebody standing still | `rejected: true`. A refusal is a behaviour with a failure mode of its own, and the app refusing a real serve is the complaint this project has already had. |

Twelve clips chosen across these rows are worth more than fifty of the same
player filmed the same way.

## The gate

`index.ts` sets `MINIMUM_RECORDED`. `fixtureGate()` reads it, and the three
states are three different claims rather than a severity ramp:

| Recorded fixtures | Suite | Why |
| --- | --- | --- |
| none | warns | Nothing filmed yet, and the code says so everywhere it would otherwise be overclaiming. Nothing false is being stated. |
| some, below the minimum | **fails** | The dangerous state. Every "unvalidated against real footage" caveat in the repo is now false, and what replaces it is a green suite covering one player, one hand, one frame rate. |
| at or above the minimum, all filmed the same way | **fails** | Same claim, same footage, more of it. |
| at or above the minimum, spread across hands, views and frame rates | quiet | |

The middle rows are red on purpose and stay red until the spread above exists.
It is the honest report of a half-built validation set, not a bug to route
around. Synthetic fixtures do not count towards the minimum.

The gate counts three of the axes in the table above — handedness, camera view
and frame rate — because those are structured fields it can read. Player build,
framing and lighting live in the `label` prose, and nothing checks them; the
count being quiet is not a claim that those are covered.

A `rejected: true` clip counts towards the minimum and is not part of the
spread. It has no handedness and no view, because a clip of somebody standing
still has no answer to give, and being asked for one is not a gap anybody can
close by filming. A set of nothing but refusals still fails, and says so in
those words rather than as three complaints about missing labels.

The other thing the gate cannot see: a fixture that widened its own `tolerance`
until nothing could fail it. The schema check refuses an allowance more than
three times the default for that unit, which is the "do not widen `tolerance`"
line above made enforceable rather than advisory.
