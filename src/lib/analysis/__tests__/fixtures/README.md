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

- Scrub the clip and correct each keyframe time in `expect.keyframes` by eye.
  Delete any you cannot pick confidently; a wrong label is worse than none.
- Delete every entry in `expect.metrics` except values you have measured
  independently — contact height against a mark on a wall, knee angle with a
  protractor on a paused frame, drop-to-contact from counting frames. A value
  copied from the engine's own output asserts only that the engine is
  reproducible, which is not what this suite is for.
- Fill in `expect.handedness` and `expect.view` from what you can see.
- Remove the `"_UNVERIFIED"` flag. The suite fails loudly while it is present, so
  an unlabelled dump cannot quietly masquerade as a validated fixture.

Then add it to `index.ts`.

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
