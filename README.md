# Serve Coach

Tennis serve coaching from one phone clip, read entirely on your device.

Film a serve. The app finds the six key positions in the motion, measures your
toss, loading, swing, contact and rhythm against published serves, and hands
back two to four fixes in the order that causes the others, worst cause first,
each with a drill on a ladder of steps. It says how sure it is, and refuses a
clip it cannot read rather than guess.

Your video never leaves the device. There is no account. The app is a service
worker that checks for its own updates, and, only if the owner switches Plus
on, asks a payment function for a signed pass; no request carries your video
or anything measured from it, and everything works with the network off.

## Quick start

```bash
npm install
npm run dev
```

The first `dev` or `build` fetches what the app needs to run offline, once: the
pose model (about 9 MB), the racket detector (about 4.6 MB) and the MediaPipe
WASM runtime, and it generates the icons (`npm run setup:assets` on its own).
That is the only time the project touches the network.

```bash
npm test          # every suite, in Node, no browser
npm run build     # typecheck and the production build into dist/
npm run release   # the gate, then dist/ served and checked offline in a browser
```

**On a phone.** Host `dist/` on any static host over HTTPS, open it, add it to
the home screen, and tap **Download now to use offline** while you have signal
(about 57 MB). After that it works in aeroplane mode. Adding it to the home
screen matters: on iOS an installed app is exempt from Safari's seven-day
clearance of site storage. Without a host, `npm run build` then
`npm run preview:lan` serves the build over HTTPS on your network, with a
one-time certificate the phone trusts (steps on the page it prints).

**Under a subdirectory**, set `BASE_PATH`: `BASE_PATH=/serve-coach/ npm run build`.
It drives the asset URLs, the worker's scope, the manifest and the model paths.

**Launch settings** (all optional; without them the app is free and makes no
payment request): `VITE_SITE_URL`, `VITE_SITE_OPERATOR`, `VITE_SITE_CONTACT`,
`VITE_PAYMENTS`, `VITE_PRICE_LINE`, `VITE_ENTITLEMENT_PUBLIC_JWK`. The steps
only the owner can take are in `docs/next/OWNER-STEPS.md`.

## How to film

1. **Side-on, four to five metres away**, level with the baseline.
2. **Whole body in frame, feet included**, with room above the racket.
3. **One serve, three to five seconds**: start before the hands go down.
4. **Slow motion if your phone has it**: more frames of the swing.

A front or back view works too, without the one reading only a side view sees
(how far in front contact is). For a serve speed, turn the phone on its side and
stand it six to seven metres back. A long clip of a whole practice becomes a
session, read a serve at a time.

## What it does

- **Reads one serve.** MediaPipe and RTMPose find the body; the engine levels
  the camera, finds the keyframes, measures each reading against a band that a
  study or real serve motion supports, and diagnoses faults in causal order.
  Readings no band supports are shown and never graded.
- **Coaches.** The first screen answers how did I do, what do I fix and what do
  I do now, over the player's own footage. Injury warnings lead. Each fix opens
  to a lesson and a ladder of drills, checked by filming a basket.
- **Against your own serve.** Each serve read against your usual and your best,
  past your own measured noise; what your fastest and in-court serves share,
  past chance only.
- **Over time.** A programme towards one goal, Progress as the shape of the
  serve, speed by trip, and second serves as their own view.
- **Says how sure it is.** The `/accuracy` page is built from the tables the
  engine grades with: how far each reading wobbles, how often a steady serve
  keeps its grade, and what it cannot see.

## Where things are

| Path | What |
|---|---|
| `src/lib/analysis/` | The engine: pure TypeScript, no DOM |
| `src/lib/analysis/coaching.ts` | Every graded reading's band, its source and its words |
| `src/lib/analysis/tiers.ts` | The diagnosis ladder; records in `docs/next/measurement-records.md` |
| `src/screens/`, `src/components/` | The app, in React |
| `src/lib/billing/`, `functions/` | Plus, built to be switched on (off by default) |
| `src/dev/` | The rig, the mocap bench and the demos (`?demo=`) |
| `DESIGN.md` | The visual source of truth |
| `STATUS.md` | What works, what is open, and how to resume |
| `docs/next/` | The current programme, its ledger and the owner's steps |
| `docs/history/` | Finished ledgers, and the full design record this file replaced |

## Testing

The engine is tested in Node with no browser and no framework:
`scripts/run-tests.mjs` bundles each suite with esbuild and runs it. The suites
drive a parametric synthetic serve (`syntheticServe.ts`) dialled from the
quantities a coach would name, so a test can dial in one fault and assert the
app names that fault and no other; forty serves from the University of Bath's
motion capture, filmed by a virtual phone, check the bands against real motion;
and a few public clips check the pipeline on real footage. Screens are rendered
to HTML and held to the copy rules (first person, 25 words a line, no jargon
without a tap to explain it), the design tokens and contrast, and size budgets.

## Privacy

The video is read from a local object URL and never sent anywhere. Reports live
in IndexedDB on the device; a clip is kept with its report only if you turn
that on in Settings. Older reports are pruned to their numbers when space runs
short (a report with no pictures left costs 25 to 40 kB), and a report that
could not be saved says so. The whole history exports to a file and imports
again, merging rather than replacing, so a backup never rolls back newer work.

## The design record

Source comments cite `README.md` for the long record of how each part came to be
what it is: the measurements, the bands, the refusals and the tests. That record
is now `docs/history/README-design-record.md`, unchanged.
