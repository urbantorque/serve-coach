# Training the engine on real serves

What a folder of clips is worth, what it is not worth, and the order to spend
effort in.

This is the answer to "can the app improve itself from real footage — pro clips
off the internet, or a folder of club players?" The short version: **yes, but
almost none of the value is where it looks like it is.** The obvious plan is to
collect clips and check the engine's numbers against them. That plan does not
work, for a reason worth being precise about, and there are three other things
the same clips are extremely good for.

---

## The thing that does not work, and why

`src/lib/analysis/__tests__/fixtures/README.md` already says it: a clip is worth
nothing to the test suite until a human has scrubbed it frame by frame and
measured something independently. The engine's own answer cannot be the label,
because the engine's answer is the thing being tested.

Footage off the internet makes this *worse*, not better. Nobody put a protractor
on Federer's knee. There is no ground truth attached to a YouTube clip, and there
is no way to derive one from the pixels that is not just another estimator with
its own errors — at which point the question becomes which estimator to believe,
which is the question we started with.

So: **more clips do not produce more ground truth.** Ground truth is produced by
a person with a paused frame, and that rate is about one clip an hour. Six of
those clear the gate in the fixtures README and they are still the plan.

**Copyright, briefly.** Do not commit clips. It is not necessary and it is not
ours to do: the corpus format below stores *pose landmarks*, not pixels — the
video never leaves the machine it was analysed on, exactly as it never leaves a
player's phone. Landmark JSON is derived data of a completely different
character, and it is also two orders of magnitude smaller.

---

## The three things the same clips are worth

### 1. Invariance — needs no labels at all

**Status: built. `src/lib/analysis/invariants.ts`, exercised by
`__tests__/invariants.test.ts`.**

Nobody has to know what the knee angle really was to know it must not change when
the clip is mirrored, or scaled, or sampled at half the rate. A serve filmed once
is one serve; the same serve transformed is a second reading of the same truth.
Five transforms are wired up, each modelling a real way of filming:

| Transform | What it proves |
| --- | --- |
| mirrored | the other hand is read the same way — one player in ten |
| half the frame rate | a 30 fps phone reads the same serve as a slow-motion one |
| filmed from further back / closer | every height really is a ratio of the player |
| phone 6° off level | the levelling pass recovers a tilt rather than claiming to |

This is where the engine actually breaks, and it broke immediately: running the
harness against the synthetic rig — before any footage — found that **the roll
correction is applied to image landmarks only, so every measurement read as a
direction in world space keeps the tilt.** Contact depth moves half its target
band on a 6° roll. That is recorded as a known gap in `invariants.ts` rather than
fixed, because fixing it moves stored values and wants one real tilted clip
behind it.

A hundred unlabelled clips make this stronger the day they land. Each one is
five more readings of a property that must hold.

**What it cannot do:** an engine that reported every knee angle as 90° would pass
every invariance check ever written. This is necessary and nowhere near
sufficient.

### 2. Distribution — needs one word per clip

**Status: not built. This is the next thing worth building.**

Label each clip `pro` or `club`. That is one word, takes a second, and needs no
expertise beyond knowing which folder you dropped it in. Then assert *rankings*
rather than values:

- Pros should land inside the target bands far more often than club players.
- The tier estimator should put them higher.
- The flaw detector should fire less, and on different flaws.
- `NOISE_FLOOR` in `tiers.ts` — how far each signal wanders between two readings
  of the same serve — is measured today from an ensemble the rig generates. A
  pro hitting six near-identical serves in one clip is a real measurement of the
  same thing.

This is the layer that can move the five `UNCALIBRATED` entries in `tiers.ts`,
and it is the only one that can, because a band is a claim about a population and
a population is what this produces. If the engine reports that pros have shallow
racket drops, the engine is wrong, and no amount of reasoning about the code
would have said so.

Watch for the trap: pro footage is filmed by broadcasters from angles and
distances no phone ever sees, so a "pros score worse" result is at least as
likely to be about the camera as about the players. Club footage filmed the way
the app asks for it is worth more than tour footage, for this and for everything
below.

### 3. Ground truth — the expensive one, unchanged

The fixtures README's six clips. Nothing here replaces them.

One cheap improvement is available and worth taking: **keyframe times are the
label a non-expert can give accurately**, and they are the highest-leverage one,
because every measurement is taken *on* a keyframe — a trophy 100 ms out poisons
four measurements downstream of it. Scrubbing a clip and tapping six times is a
thirty-second job. Angles need a protractor and an hour; times do not. A
keyframe-only fixture is a legitimate fixture and the schema already supports one
(delete the metrics you did not measure — "a wrong label is worse than none").

---

## What to collect, in priority order

1. **Club players, filmed the way the app asks** — side-on, 4–5 m, whole body,
   3–5 seconds. This is the population the app is for, and every layer above uses
   it. Twenty of these beat two hundred of anything else.
2. **The same player, same serve, filmed twice at once** — two phones, or one clip
   trimmed two ways. This is the only real measurement of `NOISE_FLOOR` there is.
3. **Left-handers.** `handedness.test.ts` now proves the *engine* is chirally
   symmetric, which is a real result and says nothing about how the pose model
   behaves on a real left arm. Only footage answers that.
4. **Deliberately bad clips** — feet cropped, filmed from the fence, someone
   walking through, a rally, a practice swing, somebody standing still. Refusals
   are behaviour with their own failure modes, and "the app refused a real serve"
   is a complaint this project has already had.
5. **Pro footage last.** It is the easiest to obtain and the least useful:
   broadcast angles, unknown frame rates, no ground truth, and a population the
   app does not coach.

---

## How to hand a folder over

Clips stay where they are. Put them anywhere — `clips/` in this repo is
gitignored for the purpose — and drop the folder onto the app in a dev build.
Each clip is analysed on the device exactly as a player's own would be, and what
comes back out is landmark JSON, one file per clip.

```bash
npm run dev
```

Open `?corpus`, pick the folder, and let it run. Nothing is uploaded; this is the
same pipeline the app uses, with the report replaced by a download.

Then the invariance harness runs over the corpus rather than over the rig, and
the distribution report becomes possible. Both read landmark dumps, so neither
ever needs the video again.

---

## The honest summary

- Unlabelled footage: **immediately useful**, via invariance. Already built, and
  it has already found one real defect with no footage at all.
- Weakly labelled footage (`pro`/`club`): **the highest-value thing not yet
  built**, and the only route to calibrating a band.
- Ground truth: **still six clips and a protractor**, still the thing the
  accuracy claims rest on, still not shortened by any of the above.

The one framing to avoid is "train the model on more data". There is no model
being trained here — the pose estimator is MediaPipe's and is fixed, and
everything downstream of it is explicit geometry with thresholds a human chose.
What footage buys is not learning. It is the ability to tell whether those
choices were right, which this repo has been honest about not having.
