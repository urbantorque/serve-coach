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
   under the filmstrip. It downloads `<clip>.fixture.json`: the pose output for
   every tracked frame, plus what the engine currently detected — *not* the
   video, which never leaves the page.
3. Move the file into this folder.

## Labelling one

The downloaded file has the engine's own answers pre-filled in `expect` and a
`"_UNVERIFIED": true` flag. **Those answers are not ground truth** — they are
what the engine said, which is the thing being tested. Go through them:

- Replace the `label` with a real description: player, hand, camera angle, frame
  rate, phone. The coverage table below is unreadable without it.
- Scrub the clip and correct each keyframe time in `expect.keyframes` by eye.
  Delete any you cannot pick confidently; a wrong label is worse than none.
- Delete every entry in `expect.metrics` except values you have measured
  independently — contact height against a mark on a wall, knee angle with a
  protractor on a paused frame, drop-to-contact from counting frames. A value
  copied from the engine's own output asserts only that the engine is
  reproducible, which is not what this suite is for.
- Write an `expect.metricSource` note for each metric you kept, saying how you
  measured it. One per metric, and the schema check rejects the file without
  them. It is not paperwork: it is the step that makes pasting the app's own
  number an explicit false statement rather than a box left empty.
- Fill in `expect.handedness` and `expect.view` from what you can see.
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

## What to collect

The suite is only as good as its spread. Aim to cover:

| Axis | Wanted |
| --- | --- |
| Camera | side-on, front, behind, and one deliberately bad angle |
| Frame rate | 30 fps, 60 fps, and 120/240 fps slow motion |
| Player | right and left handed; an adult and a junior |
| Framing | one filmed close, one from the back fence, one with feet cropped |
| Conditions | bright sun, floodlit, cluttered background, someone walking behind |
| Non-serves | a rally, a practice swing, someone standing still — all `rejected: true` |

Twelve clips chosen across those axes are worth more than fifty of the same
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

The other thing the gate cannot see: a fixture that widened its own `tolerance`
until nothing could fail it. The schema check refuses an allowance more than
three times the default for that unit, which is the "do not widen `tolerance`"
line above made enforceable rather than advisory.
