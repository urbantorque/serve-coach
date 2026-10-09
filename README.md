# Serve Coach

Frame-by-frame tennis serve analysis that runs entirely on your device.

Film one serve. The app finds the six key positions in the motion, measures
twenty things about your toss, loading, swing, contact and rhythm, and hands
back the two to four changes worth making, in the order that causes the
others — worst cause first, each with a drill. Two of the twenty come from the
ball and are absent when it cannot be found.

Your video is never uploaded. There is no account and no server: nothing you
film, and nothing measured from it, leaves the device. The app itself is a
service worker and it does check for its own updates, so a devtools network
tab is not empty — but no request carries your data, and everything works with
the network off.

---

## Quick start

```bash
npm install
```

```bash
npm run dev
```

The first `dev` or `build` vendors what the app needs to run offline: it
downloads the pose model (~9 MB) and the racket detector (~4.6 MB) once, copies the MediaPipe WASM runtime out of
`node_modules` into `public/`, and generates the app icons. That step is
`npm run setup:assets` if you want it on its own — re-running is safe, it skips
whatever is already there. It is the only time the project touches the network.

Other commands:

```bash
npm test
```

```bash
npm run build
```

To use it at the court, build and host `dist/` on any static host over HTTPS,
open it on your phone, and add it to your home screen. Tap **Download now to
use offline** on the home screen while you still have signal — that fetches the
57 MB of pose model, racket model, swing-refinement model and both WASM runtimes and caches them. After that the app works
with the network switched off entirely, including in aeroplane mode on a court
with no signal. Running an analysis fetches the same assets, so the badge also
turns itself green the first time you use the app for real; the button exists
so that getting ready does not require analysing something first.

**Hosting under a subdirectory.** By default the build assumes it owns the whole
origin. To serve it from a path — a GitHub Pages project site, a staging folder,
a page inside an existing club website — set `BASE_PATH`:

```bash
BASE_PATH=/serve-coach/ npm run build
```

That one value drives the asset URLs, the service worker's scope, the manifest's
`start_url`, and the runtime paths the pose model and WASM runtime are fetched
from. Getting it wrong does not produce a broken layout, it produces an app that
cannot load its model and so cannot do anything at all — which is why it is one
setting rather than four.

**Adding it to the home screen is not cosmetic.** On iOS an installed app is
exempt from Safari's seven-day clearance of site storage; a bookmarked one is
not. That exemption is the difference between a training history that survives
between sessions and one that quietly disappears — see **Privacy** below.

---

## How to film

The measurements are only as good as the clip. Four things matter:

1. **Side-on, 4–5 metres away**, level with the baseline.
2. **Whole body in frame, feet included**, with room above the racket at full
   stretch. Every height is measured against your own body, so cropped feet
   make the numbers fuzzier.
3. **Three to five seconds, one serve.** Start before the hands go down, stop
   after you land.
4. **Slow motion if your phone has it.** The racket travels from behind your
   back to the ball in about a sixth of a second.

A front or back view works too — you get everything except how far in front of
your body contact happens, which only a side view can see. The app detects the
camera angle and drops that one measurement rather than guessing at it.

---

## What it measures

Six keyframes are located in the motion — **ready, toss, trophy, racket drop,
contact, finish** — and each fundamental is measured on the frame where it
actually happens.

| Area | Measurements |
| --- | --- |
| **Toss** | how high the ball actually goes, tossing-arm extension at release, release height, how long the arm stays up, sideways drift of the toss path |
| **Loading** | knee bend at the trophy, hip–shoulder separation, shoulder tilt, leg drive |
| **Swing** | racket drop depth, hitting elbow at the drop, drop-to-contact time |
| **Contact** | contact height, whether you hit the ball at its peak or waited for it to drop, arm extension, body extension, contact point in front |
| **Rhythm** | motion length, share of the motion spent after the trophy, whether both arms arrive together |

Every measurement is scored against a target band, with a plain-English
explanation of what the number means and — only when it needs one — what to
change. Spatial measurements are divided by the player's own standing height,
so they mean the same thing for a junior filmed close up and an adult filmed
from the back fence.

**The ball, not just the arm.** Two measurements come from tracking the ball
itself in the pixels — how high the toss really goes, and, scored under Contact
rather than Toss, whether you hit it at the top of its flight or stood waiting
for it to fall. Neither is visible from the arm, and both are among the first
things a coach looks at. The ball is found by demanding that a run of candidate
blobs fit a free-fall arc with the curvature the player's own height implies,
which is what stops a passing bird or somebody else's ball being reported as
your toss. When it cannot be found — against a cluttered background, or simply
out of frame above you — those two measurements are absent rather than guessed.

**Which serve you were hitting.** A good kick serve makes contact more over the
head than in front, and needs more shoulder tilt than a flat one. Judged against
flat-serve targets it scores badly for doing exactly what a kick serve should,
so the report says which serve it assumed and lets you change it. Switching is
instant — the serve type moves the targets, not the measurements.

**Every measurement carries its own confidence.** Degradation is local, not
global: cropped feet bend every height ratio and leave the joint angles
untouched; too few frames through the swing softens only the swing timing; legs
that never load make the trophy position hard to place and soften the four
things measured there. Numbers the app cannot stand behind are marked
approximate, are given a reduced vote in their area's score, and can never
become the "work on this next" advice. Being sent to fix a fault the app cannot
actually see is the fastest way to lose a player who knows their own serve.

**Poor light degrades the whole body at once, and confidence follows it down
smoothly, before there is a cliff.** Every other clip problem here is local —
one limb, one moment. Dusk is not: the tracker gets a little less sure of
everywhere at the same time, and the numbers it reports do not move, only how
much the app is willing to stand behind them — the toss, the trophy, the
contact, all softened together rather than one card quietly going first. Below
a visibility floor the clip is refused outright rather than measured at a
confidence too low to mean anything, which is a real edge rather than a
number that simply gets smaller forever.

**Bad clips are caught in two seconds, not thirty.** Before committing to the
full pipeline the app samples a handful of frames and checks the framing. If
nobody is in shot, or the player is too far away to measure, it says so
immediately — while you are still on court holding the phone, which is the only
moment "step closer and film it again" is worth anything. Cropped feet alone are
survivable and produce a real report with the heights marked approximate.

**Several serves in one clip.** Film a whole basket if that is easier. Each
serve shows up as a peak in hand height; the app finds them all, reports on the
last one by default — the one you just hit — and lets you switch to any other
without re-filming.

**Consistency across a basket.** A clip with more than one serve in it is
measured all the way through before the report appears — one video pass per
serve, with a row filling in on the analysing screen as each lands, and whatever
was measured kept if you stop it early. The report then opens on the serve you
just hit with the basket's verdict beside the serve picker, and the full spread
sits below the fix. It used to be a button under the report that most people
never pressed, which made the app's own argument — that the gap between your
best serve and your worst one matters more than the average — something it
stated and did not act on. One serve tells you about that serve; several tell you
about the technique, and for a club player the gap between the best and worst
serve is usually a bigger problem than the average.

**And which serve was the good one.** The spread rows say how far each element
travelled and say it anonymously — "struck below full reach → struck at full
racket reach" is true of the basket and names neither serve. A player standing
on a court can count their serves, so the panel now names both: the best and the
worst by the same score already on the chips, and the three measurements where
they differed. Only differences big enough to be said in different words are
printed. Two serves can differ by a real number of degrees and both read "arm
dead straight", and pointing at that pair would be pointing at something the
player cannot see in their own clip.

Underneath that, the two serves as pictures: the same six positions, the good
serve beside the bad one, each still already carrying the tracked skeleton and
the angle that position is judged on. It is the one place in the report where
somebody sees their own good trophy position next to their own bad one, which is
what a coach does with a phone at the net.

Those twelve images are never stored. Nearly all of a saved report's size is its
keyframe stills, which is why old reports lose their stills before they lose
anything else — filing twelve more under the heading of a comparison would make
the comparison the largest thing in the record. So the pictures last as long as
the clip is open and a re-opened report has the words instead, which say the
same thing and cost nothing.

Getting them at all meant separating three decisions that had been sharing one
name. `skipThumbnails` also turned off the framing preflight and the ball pass —
a whole second pass over the video, per serve — so the only way to keep a swept
serve's stills was to buy eight ball passes with them. That is why the serves in
a basket had no stills, and it was never a decision anybody took about stills. Each element is scored on
how little it moved relative to its own target band, ordered worst first. The
headline score leans on the least repeatable elements rather than the flat
average — a serve is a chain, and one toss that wanders ruins it however steady
everything else was.

**Frame by frame.** The player steps one tracked frame at a time, which is how
you actually read a serve — the difference between a good contact and a poor one
is a couple of frames wide. Stepping moves sample to sample rather than by a
fixed time, because landmarks only exist where the video was tracked and landing
between two of them would draw a stale skeleton over a fresh picture.

Keyboard: `←` `→` step a frame, `space` plays, `1`–`6` jump to the six key
positions, `home` and `end` go to the ends. The scrubber is a real slider, and
the keyframe stills are buttons — everything the player does is reachable
without a mouse.

**The keyframe stills carry the tracking.** The video is never stored, so the six
stills are all that outlives a session — which is why the skeleton and the angle
each position is judged on are drawn onto them at capture time, rather than only
existing in the live player.

**Record it here, and glance at it between serves.** The viewfinder that checks
your framing can also record, off the same stream it is already watching, where
the browser will record something the app can then read back. The loop it
replaces was minutes long — film in the camera app, stop, leave it, find the clip
in the picker — and every step of that is spent not serving.

A clip recorded that way lands on a glance rather than the report: the score, the
one thing to change, and a button back to the viewfinder. The report is the right
screen for somebody sitting down with their serve and the wrong one for somebody
holding a basket of balls, and it is one tap away. The glance runs no analysis of
its own and ranks nothing differently — it is the same report with less of it said
at once — and a clip the engine could not read gets the refusal with no score
attached, because there is no room here for the caveats the report carries.

**And it remembers the serve before it.** Every glance used to be amnesiac:
serve four was told about its worst fault with no idea that serve three had been
told the same thing, so a player doing exactly what the app asked got the
identical sentence back and no sign that anything had changed. The glance now
carries one extra line saying whether the *previous* serve's named fault moved —
"closer than your last serve", "still there", "not on this one". The report is
the wrong place for that: it is read afterwards, and by then the basket is over.

What counts as a move is `NOISE_FLOOR` (`analysis/tiers.ts`) and not a threshold
of its own — the same measured figures `flaws.ts` reads to decide a fault is real
rather than a re-roll of the tracker's noise. A change smaller than that is
reported as no change. The consequence is deliberate: on `hip_lead_ms`, whose
floor is 76 ms, almost every honest improvement will read as "no change yet",
which is the truth about what a phone can see. `analysis/carryForward.ts`
compares `FlawFinding.miss` — how far outside its band the signal landed, in the
signal's own units — rather than the score, which moves with twenty other
measurements at once, and it refuses outright when the serve type or the target
tier changed between the two serves, when either reading is under the evidence
bar, or when the later clip could not take the reading at all. Every refusal is
silence, because this screen has no room for a caveat. Nothing is stored, counted
or rewarded: it is one observation about two serves, and it goes when the trip
does. `?demo=glance-move`, and `-cleared`/`-same`/`-wider`, show the four states.

**A joint warning stands on its own fault, named.** The three flags used to
read raw signals against thresholds of their own, below the faults they warn
about, and with no noise floor. So "Watch your wrist" could sit above a report
that never named the grip. Its second witness, the forearm's turn through the
ball, is under-resolved: a 76° floor, where real serves turn about 93°. That
made it true on every real serve and proof of nothing.

Since L1.3, each flag needs its fault named on a firm reading:
- the tray for the elbow and wrist;
- `posture_collapse` for the lower back;
- `shallow_drop` for the shoulder.

The tray card now claims only the palm facing the sky. It cites Touzard 2019:
higher elbow and wrist loads for the same ball speed. The back card cites
Campbell 2013, and no longer gives a count of serves no study gives.

On the six real Bath serves under noise, nothing is raised from the guide's
placement (0 of 144 takes), and the rig's clean serve raises nothing. From the
back fence the fold's own take-to-take noise, about ±10° on a real serve,
reaches its 29° line on 4 of 144 takes. That is pinned as a KNOWN check in
`triage.test.ts` rather than hidden behind a threshold of the warning's own.

**A joint warning that keeps coming back is counted, and the denominator is the
hard part.** `triage` has always raised injury flags on the serve in front of it
and the report has always printed them, but a wrist is not hurt by one serve, and
every flag the app ever raised was already sitting in storage unread. The
progress sheet now leads with any that recur: "Your lower back has folded under
the swing on 3 of your last 6 trips."

Counted in trips rather than serves (`analysis/strain.ts`, joined to `tripsOf` by
`recurringStrainOf` in `progress.ts`) — nine flagged serves in one afternoon are
one bad afternoon, not nine pieces of evidence. Two trips is the floor, because
one occurrence is the report's own job; six answerable trips is the window; and a
pattern last raised more than one trip ago goes silent rather than following
somebody around after they have fixed it.

The denominator only counts trips that could have answered *for that flag*. A
refused clip raises no flags and neither does one whose spine was never visible,
so counting either as a clean trip would manufacture good news about somebody's
back — constraint 1 inverted and pointed at the one subject where being wrong
costs a joint. Readability is decided by `INJURY_INPUTS`/`injuryInputsRead` in
`triage.ts`, the same table `injuriesIn` guards itself with, so the two answers
cannot drift apart. Unlike every record in `progress.ts` this is confined by
neither serve type nor rubric era: a joint has the same range on a kick serve as
on a flat one, which is why `injuriesIn` reads against absolute limits in the
first place.

**And it says when one has stopped.** `clearedStrain` reads the same count the
other way: a pattern that was recurring and has not been raised for three
answerable trips reads "Your wrist has stopped turning hard through the ball on
your last 5 trips", with the same rule in `--great` instead of `--work`. The
floor is three rather than two, and the asymmetry against the warning is
deliberate — the cost of a premature warning is a player checking their back, and
the cost of a premature all-clear is a player no longer watching something they
still do, so the threshold that ends a warning is harder to reach than the one
that starts it. It is bounded by `STRAIN_WINDOW` at the far end too, so the
subject closes rather than becoming furniture, and it can only be said about a
pattern `recurringStrain` would itself have reported at the time it was last
raised. Refused trips clear nothing: a run with nothing measured in it is not
evidence of a fix. The block's heading follows what it holds — "What keeps coming
back" while anything is live, "What has stopped" when only the cleared lines
remain. `?demo=history` seeds both at once: a back on three of the last six
trips, and a wrist stopped five trips ago, each earning its flag through
`injuriesIn` rather than having it written on.

**The injury card on the report carries its own history.** A warning read once is
a warning dismissed, and the card is the one moment somebody is actually reading
about that joint — so where there is a history behind it, it ends with "Also on 2
of your 6 trips before this one." `strainBehind` counts trips *strictly before*
this serve's own: counting the viewed serve's trip would make the sentence depend
on whether the report had reached storage yet, and counting forward from it would
have a reopened report claim a history it did not have when it was filed — the
mistake `bestGapLine` was shipped with and redesigned out of. One prior trip is
enough, because the serve being read about is itself the second, which is the
same `MIN_STRAIN_TRIPS` floor counted from the other end. It takes the card's own
body voice rather than a style of its own: written first as a dimmer caveat and
looked at, which made the strongest fact on the card the quietest thing on it.

**And the glance carries it onto the court.** The report is read afterwards,
sitting down, by which time the basket is over — so the one screen where a joint
warning can still change what happens is the between-serves glance, and it now
shows one: "That is your lower back on 3 of your last 6 trips." It is the only
thing on that screen not about the next serve. Everything else there answers
"what do I change now"; this answers "how many more of these should I hit
today", which only somebody holding a basket can act on.

Gated twice (`glanceStrain` in `progress.ts`): it must be a live recurring
pattern by `recurringStrain`'s own floor and window, **and** the serve just hit
must have raised that same flag. The second gate is what keeps it from nagging —
a warning about a back that did not fold on the serve in front of somebody is a
non-sequitur between serves, and this screen is the one where a sentence nobody
asked for costs a serve not hit. One flag, never a list. Silent on a refused clip
for free, since `triage` returns an empty `injury_risk` on anything it rejects.
The sentence is the shortest of the three forms and a test asserts it stays that
way. It reuses `.glance-move`'s box with a `--work` rule down the side rather
than shrinking the report's injury card, and the whole screen still fits a phone
without scrolling. `?demo=glance-strain`.

**Shoulder external rotation can be read, at about 10° of deviation — and the
first attempt to check that was wrong.** It is the joint angle a serve's racket
drop is actually made of, and the engine only ever approximated it:
`shoulder_load_no_drop` pairs drop depth against contact height rather than
reading a rotation.

The first sweep used `trophyForearmDrop`, concluded the angle was ungradeable,
and was measuring the wrong thing. That dial is a **hand translation in metres,
not a rotation** — past about 0.3 it stops laying the arm over and starts
lengthening the forearm, to 1.40× the upper arm at 0.4 and 3.35× at 0.8 where a
real one is about 0.8×. The deviation that "exploded" was an arm straightening
out, not a camera failing. The bound is now documented on that dial and pinned in
`invariants.test.ts`, so a future dial turned up to make a fault "more extreme"
fails instead of quietly stretching an arm, and `DEMO_DIALS.injury` moved from
0.4 to 0.25 — which raises the wrist flag on 20 of 24 noise realisations, exactly
the rate 0.4 managed, while posing an arm that exists.

`trophyExternalRotation` is the dial that actually asks the question. It rotates
the wrist about the shoulder→elbow axis *after* the elbow is solved, so the elbow
lies on the axis and no segment length can change — the property the other dial
does not have — weighted to the trophy and gone again by the drop, and an exact
no-op at zero so every band ever set against this rig's numbers is untouched.

Swept against the same ensemble every `NOISE_FLOOR` figure came from, the reading
tracks the dial at a gain of about 0.8 over a 48° span, with deviation **flat at
9.4–11.8°** rather than exploding. A floor set the way every other one was —
1.5× the deviation — would be **15°, leaving 3.15 usable steps**. For scale,
`palm_to_sky_deg`'s floor is 11 and the engine grades it; `hip_lead_ms`'s is 85
and it is `UNDER_RESOLVED`. So this sits on the gradeable side.

Nothing computes it yet, and that is deliberate. A floor is the first number a
graded signal needs, not the last — bands per tier, a place in the hierarchy and
copy all have to come from somewhere, and the 19.7° offset at zero and the 0.8
gain are properties of the reference frame rather than of a shoulder. Both need
real footage before a player is told anything in degrees.

**And it is now taken on every serve.** `Diagnosis.externalRotation` carries the
angle, the visibility it was read at, and its *lever* — how much of the forearm
actually sat across the upper arm's axis. That third number is the one that
decides whether the angle exists: a forearm folded almost along the humerus has
nothing perpendicular to rotate, so its direction round the axis is whatever the
noise says. Below a quarter of the forearm's length the reading is refused
outright, which is also the correct answer to "how externally rotated is a
straight arm" — the question does not apply.

It sits beside `chain` and on identical terms: **data only**, never in
`signals`, so it cannot vote on a tier, pair into an injury flag or become an
instruction. `UNCALIBRATED` in `tiers.ts` records why, and `depth.test.ts`
enforces the pair — a measurement the ensemble produces with no entry, or an
entry nothing produces, both fail the build. Adding the angle made that check go
red first time, which is the check working. The ensemble now derives the
deviation itself rather than trusting a number written in a comment, and gets
**9.4°**, reproducing the sweep.

**A camera angle that could not be read is now told apart from one that reads
45°.** `estimateYaw` returns 45 from two failure exits — no body height to divide
a shoulder span by, and no frame offering two shoulders — and 45 is also what a
camera standing at the corner genuinely measures. Two places in the engine
already conflate the two and are right to: `axes.ts` gives image x to no axis
either way, and `diagnose.ts` records that the same tie deletes three timings.
For them the answer really is the same on both readings.

It is not the same for anything comparing two serves. Two clips filmed at a true
45° agree that the camera did not move between them; two clips whose yaw could
not be read agree on nothing at all, and their difference is zero for the one
reason a gate must never accept. Same number, opposite verdicts. So
`Spatial.yaw_measured` labels the fallback rather than leaving it to be inferred,
and it rides onto the stored report through `triage.quality` — where a comparison
between two saved serves has to read it, the frames being long gone by then.

**No reading moved.** `yaw_deg` is unchanged in both cases, deliberately, so
every band derived against it stays exactly where it was. A report stored before
the field existed reads as *not* measured rather than as measured: the field
exists to refuse a pair whose angle was never read, and defaulting an unknown row
the other way would wave through precisely the pairs it was added to stop.

**A band on the absolute is now ruled out, not pending.** The reference frame was
checked against a second one — the shoulder line — rather than argued about, and
the three results point different ways. On a clean rig **both frames report 14.4°
for every 15° of real rotation, identically, at every step**: two independent
references seeing the same change means the change belongs to the arm and not to
the frame, so a band on a *delta* is defensible in principle. (The gain is 0.96
here; the 0.8 seen under the modelled camera is the unsigned angle biasing
towards the middle of its range under noise, not the geometry moving.) But the
same arm reads **44.5° against the trunk and 149.1° against the shoulder line** —
there is no zero to put a band around. And switching frames does not fix it, it
moves it: 30° of spine lean shifts the trunk frame **15.1°**, a whole noise
floor, while 30° of shoulder tilt shifts the shoulder frame **35.3°**, most of
the signal. Spine lean is not hypothetical here — it is the signal the lumbar
injury flag is read from, so a delta measured across two serves whose posture
differed is partly a change in posture. All three are pinned in `depth.test.ts`
on a clean rig with one seed, because each is a systematic rather than a noise
question.

**The landing is refused by the serve's own clock, not by a number of seconds.**
The reading taken past contact has a floor under it: a finish too close to the
ball has not landed yet, and before that floor existed it reported a confident
zero — "finished perfectly square, and we are certain" — from a clip that simply
stopped. The floor was derived by cutting one serve shorter and shorter and
watching the reading collapse, and it was written down as **0.3 seconds**, which
is what that serve's clock happened to call it.

Two ordinary clips have another clock. A deliberate server takes 1.7 s from ready
to contact where a quick one takes 1.1 — a spread this repo's own sweeps already
dial — and a time-stretched slow-motion file spreads the same serve over several
times as many seconds of file, which is the filming this document recommends four
sections above. Both push the identical fall further down the clock, and both err
the same way: the floor admitted a finish that had fallen a fraction as far as
the one the derivation accepted. At four times stretched it admitted a finish
**5.5% of the way through the motion** and called what it found there a landing.

So the floor is now a share of the serve — 0.258 of ready-to-contact — and the
denominator is what the code measures rather than what the rig dials. Those are
not the same number and the gap is a fifth of the answer: the rig's default
motion is 1.35 s, but `findReady` starts 12% up from rest, so `contactT - ready.t`
on that same serve reads **1.16 s**, and it reads 1.167 / 1.160 / 1.150 s at
30 / 50 / 120 fps with no spread across seeds. Dividing by the dial would have
given 0.222 and quietly loosened the guard on every ordinary clip while claiming
to leave it alone. 0.258 reproduces the 0.30 s floor to within a millisecond, so
nothing filmed at an ordinary tempo moves at all, and a serve slower than about
2.2 s now refuses where it used to answer.

**Which is the honest answer rather than the complete one.** The refusal is
correct and the reading is still missing on those clips, because `keys.finish` is
itself placed a fixed 0.5 s past contact — so on a stretched clip the app is now
declining to read a landing rather than misreading one. Every phase window in
`phases.ts` is a fixed number of file seconds, and swept against the rig from 1×
to 8× stretched the damage is ordered: **contact never moves** (error ≤ 0.02 s at
every stretch, because it is found by search rather than by offset), **ready
starts drifting at 1.5×** (0.35 s, reaching 2.35 s at 4×), and **toss holds until
3× and then goes** (0.07 s at 3×, 0.76 s at 4×, 3.03 s at 6×, where the trophy
collapses onto it). Recorded here rather than fixed, because sizing those windows
by the serve's own length is a change to the most load-bearing file in the engine
and every noise floor in `tiers.ts` was derived against their current values.

**Slow motion is now read on the serve's clock, when the app can tell how slow
it is.** The paragraph above is still true of a stretched clip read at face
value. What changed is that the app can now usually find out the factor, and then
it does not read the clip at face value:

- **The file says so.** Android writes the capture rate beside the playback rate
  (`com.android.capture.fps`), and `pose/container.ts` reads it by walking box
  headers to the `moov`: a handful of small reads, wherever the phone put it.
  The ratio is the stretch exactly.
- **The ball says so.** iPhone exports bake the slow motion into the timestamps
  and leave no tag, but gravity cannot be stretched without showing it. A toss
  tracked at a quarter of gravity in file seconds is a two-times clip, at a
  sixteenth a four-times one. `analysis/slowMotion.ts` runs the tracker at the
  gravity of each stretch a phone produces (1, 2, 4, 8) and keeps the fit that
  rounds back to the factor it searched at. The ball is believed only when the
  swing and the whole motion also come out at human speed under that factor.
  The probe is a whole pixel pass, so it runs only when the serve read at face
  value is slower than a real-time one.

With a factor in hand, the serve is read again with a window sized for the real
motion: four times the file for a four-times clip, which also samples the swing
four times as densely. The engine then measures a copy of the frames on the
serve's clock. The frames, phases and ball on the report stay on the file's
clock, because every seek, still and overlay is. On the rig, a four-times clip
read this way measures what the real-time serve does to the tenth of a
millisecond: drop to contact 145.8 ms, keyframes on the same rows. The slow-motion
hedge lifts, and the ball the tracker used to reject as too slow to be a ball is
measured. Neither source, or a disagreement between the ball and the motion,
leaves the clip at one and the hedge in place: an unknown stretch is never
guessed.

**And the confound turns out to be arithmetic rather than a model.** Swept across
a grid of four rotations by four leans, the shift lean causes is **15.0, 15.0,
16.0 and 15.0°** at rotations of 0, 20, 40 and 60 — a spread of one degree across
the whole range. The two quantities are separable, so `ER_LEAN_SENSITIVITY`
(0.5° of reading per degree of lean) is a number rather than a fitted
relationship, and subtracting it recovers the upright reading to within two
degrees — a budget made of 1.0° of integer rounding on two readings plus 0.25° of
coefficient residual, not a tolerance chosen to pass.

Nothing subtracts it in `diagnose`. The engine returns what it measured; a
corrected number that silently differs from the geometry is the kind of confident
adjustment this codebase does not make in the data layer, and the coefficient is
rig-derived — good enough to decide whether a comparison is worth making, not
good enough to change a reading nobody can check. `signals.spine_lean_deg` is on
the same diagnosis, so any consumer holding two serves has both halves. What the
constant is *for* is bounding a delta: two serves whose lean differs by ten
degrees carry five degrees of false rotation change between them, a third of this
reading's own floor, before the shoulder has done anything.

**Storing a serve as motion is affordable, but only one way of doing it is.** A
saved report drops its frames and keeps six keyframe JPEGs, so "best against
latest" can only ever be two photographs. Storing the pose track instead would
make it two skeletons — and whether that is possible turns entirely on the
encoding, measured off real rig frames in `footprint.test.ts`:

| encoding | one serve |
| --- | --- |
| whole frames, as `JSON.stringify` produces them | **277 kB** |
| image landmarks only, three decimals, flat arrays | **21.5 kB** |

The six stills already on a report cost 24–48 kB, so the drawable form is not a
new storage problem — it is a cheaper one. The naive form is several times the
report it would attach to. Three decimals is the precision decision and it is
checked rather than chosen: on normalised coordinates that is at most **0.54 px
at 1080p**, where two decimals would be five pixels and a visibly wrong elbow.

**The six keyframes are now kept as a body, and the blank filmstrip is fixed.**
`Analysis.poses` (`storage/poseTrack.ts`) carries one row per keyframe — image
landmarks only, three decimals, flat arrays — at about **2.7 kB** against the
24–48 kB the six JPEGs cost. That is why it survives the prune the photographs do
not: past `KEEP_STILLS` a report used to render six grey boxes, and it now draws
what the tracker actually saw, through the same `drawSkeleton` the player and the
live stills use.

Deliberately not a replacement photograph. It shows the measured body on the
report's own background — no court, no fence, no light, no grip — so nobody who
has seen both can mistake one for the other, because they carry different
information. It is also the only part of a report that outlives the rest, and it
contains no image of anybody, which is a privacy property worth having on exactly
that part.

Rows are positional: `keyframePoses` writes one per entry of the report's own
`phases` array and the filmstrip reads it back by the same index, because a row
that lined up with the wrong keyframe would caption a trophy position as a
contact — confidently mislabelled, which is worse than a grey box. Both doors are
guarded: `readKeyframePoses` drops malformed rows on the way out of storage, and
`poseFrameAt` refuses a wrong-length row on the way into the drawing loop, since a
live analysis reaches the report without a round trip through storage. Nothing
that did not survive is invented — a rebuilt frame has no world landmarks and no
timestamp, so nothing downstream can read a joint angle off a body with no depth.

Only the keyframes, not the whole swing. The full track is 21.5 kB and would make
a saved serve replayable as motion, which is what this format is shaped to grow
into; six poses fix a defect that is on screen today, and a format that ships
with a reader is worth more than one that ships with a plan.

**And it did grow into it.** `swingTrack` writes the whole swing on every
analysis (`analyze.ts`), `readSwingTrack` reads it back through `normalise`, and
`replayFrom`/`trackFrameAt` turn it into the instants `TrackPlayer` draws — so a
saved serve replays as motion rather than as six photographs. `poses` stays on
the type for reports written before tracks existed, and because the prune
ladder's downgrade turns a track back into one. The paragraph above described the
numbers a writer would need; the writer exists.

**Two saved swings, drawn on top of each other.** `pairTracks` (`trackPair.ts`)
answers the question `poseTrack.ts`'s header worked out on the rig: what is left
on screen once the filming is taken out. Translating to the hip centre and
scaling by shoulder-to-ankle removes distance and framing — a ±15% zoom drops
from 0.083 body heights to 0.0009, a pan to exactly zero — and the transform is
taken once, at contact, rather than per frame, because the hip centre rising
between the trophy and contact *is* the leg drive and a per-frame version would
subtract it.

What it cannot remove is camera angle, which is a projection change rather than a
similarity transform, at about 0.0072 body heights per degree. Two noise
realisations of one identical serve sit 0.0341 apart and five degrees of camera
costs 0.0352 — the same thing — so five degrees is the gate, and past it the
phone is contributing more than the tracker. The other refusals are the two
cross-session rules everything else in the app already carries (one rubric, one
serve type), an unmeasured camera angle on either side (`Spatial.yaw_measured`,
which exists for exactly this), a contact that was never tracked, and a body
whose hips, shoulders or ankles were out of frame at contact.

Nothing below the hips is returned at all. Taking the trophy knee from 133° to
166° — no leg load whatever — moves the worst drawn landmark 0.0387 against that
0.0341 floor, so a player told to watch their legs against a ghost would be
watching noise. The ankles are still read, because a shoulder-to-ankle length is
a measurement; a drawn foot would be a claim about where it was.

Every refusal is an enum rather than a sentence, and every one is silent. This is
an extra picture on a report that is complete without one, so a screen explaining
at length why it will not show a comparison nobody asked for is worse than one
that simply does not offer it.

**And it is drawn.** `drawPairedGhost` puts the older swing under the newer one
in `TrackPlayer`, dashed, in `PALETTE.ghost` — the ink that already existed for
"the same player somewhere they were not", which describes a target pose and
another of your own serves equally well. No new colour. Dashed and dim is the
whole distinction from a tracked body, so a solid line of that colour would read
as a second measurement, and the dash is restored before anything tracked is
drawn.

**Where it lives is not where the round expected.** The plan was to build the
same-session case first, since two serves from one basket share a camera and
clear the 5° gate for free. That case never reaches this player: `TrackPlayer`
renders only when there is no video, and a basket always has one. The comparison
this screen can actually make is against `previous` — the last report of the same
serve type — which is the case the yaw gate was written for, and the case where
how often two clips from one trip agree on camera angle is still an open
question.

**Court lines are refused, and the arithmetic is why.** They are the enabler for
the three things every player asks for — foot faults, placement, where the ball
landed — so the refusal is stated with a number. The app asks for a player
filling a useful share of the frame, and at what good footage looks like — a
1.8 m player at 0.54 of frame height — a 16:9 frame spans about **5.9 m** at the
player's distance. A singles court is 8.23 m between the sidelines. They are not
in shot.

Only at the framing floor, one step above "too far away", does the visible width
reach the court at 10.7 m, and that is where every pose reading the report is
built from is already soft — so buying court lines by filming from there means
paying for them with the serve. What would change it is a camera further back or
a second device, and not smoothing or a better model: the lines are not faint,
they are absent.

**The stance is one the camera cannot see, and the round said the opposite.** R60
proposed reading platform against pinpoint from ankle separation over time, on
the grounds that the back foot sliding up is a large, slow motion along the axis
the camera sees best. It is along the axis a side-on camera sees worst: a serve
stance is apart along the player's depth axis, and image x is 99% depth at 82°.
Measured at `ready` in image units, eight seeds per angle, the separation reads
0.0407 at 30°, 0.0301 at 45°, 0.0175 at 60° and **0.0050 at 82°** — against a
noise floor of 0.0030 that does not move, because jitter is a fraction of the
frame and does not care where the camera stands. Side-on the stance is smaller
than twice its own noise.

It is genuinely readable face-on, at seven to ten times its noise, and that is
not a route: the app asks for side-on because face-on loses the depth readings
the rest of the report is made of, and that trade has nothing to do with feet. So
the reading is refused rather than hedged, and what would move it is a second
camera or a foot-contact model — not smoothing, which is where a rebuild would
otherwise start, because the signal is not noisy but absent.

**And the gate is affordable, which was not obvious.** The worry about refusing
a camera difference over 5° is that the *reading* might wander further than that
between two takes of an identical camera — in which case the ghost never appears
for anybody. Twelve seeds at each of six dialled angles say otherwise: from 60°
up, every pair of takes agrees inside the gate (spread 5.0, 5.0 and 3.0 degrees
at 60, 75 and 82), so the whole budget stays available for the camera actually
moving. At 30° only 83% of pairs agree, and that is structure rather than luck —
the reading is `acos(span / SHOULDER_SPAN_RATIO)`, whose derivative is unbounded
face-on and smallest side-on, so the estimator is best conditioned exactly where
this app is used. How often two clips *from one trip* agree is still unknown,
because that is a fact about how people film and there are no fixtures yet.

One limit came out of the same sweep and is worth knowing: the reading saturates.
75° reads 78.0, 82° reads 84.3, and 88° reads only 85.1, so past roughly 82 it
stops tracking the camera. That is fine for a gate on the difference between two
readings and would not be fine for grading the absolute. Nothing grades it.

The pose model stops while recording. The player has stopped aiming and started
serving, so there is no verdict left to read, and a hardware encoder is running on
the same stream shortly before the analysis needs the GPU.

A note on durations in this document, and in the source. "Half a minute" for an
analysis pass has been this codebase's figure since the MVP baseline commit and
appears in roughly seventeen files, justifying real decisions — why the framing
preflight is worth two seconds, why a rescore is arithmetic rather than a
re-read. **It was never measured.** Every pass now records what it actually cost
on `Analysis.cost`, which rides into an exported backup, so `COURT-CHECK.md`
step 8 can answer it from a phone by reading a field. Until those numbers come
back, read every duration in this repo as an estimate from before anything timed
itself.

**What this phone can do.** Open the app at `?check`, or tap it at the foot of
the history sheet, and it says what this particular browser will record, what it
will open, whether the camera and the offline download are there, and how much
room the browser has given it. It makes no request and stores nothing.

It exists because the recording path used to choose a container by an ordering
that assumed what a browser can decode, and never asked. The ordering is a good
guess and it was the whole of the reasoning: whatever the encoder accepted first
was handed back. On any browser where the guess is wrong, the player serves, the
file lands, and nothing opens it — which is the exact failure the ordering exists
to avoid, surviving inside it. Printing the two columns beside each other is what
made that visible, so they are still printed beside each other.

**The recorder now asks both questions.** A container this browser will not play
back is not the container it records in, whatever the ranking says. Where there
is no `canPlayType` to ask, the answer falls back to encoder support alone —
absence of evidence must not delete a working button, which is the same rule the
analysis path follows when a threshold cannot be read. A browser that records
only what it cannot open gets no record button and says so, because a control
that produces a file the app then refuses is worse than no control, and the file
picker is a first-class path rather than a degraded one.

The check also asks about HEVC, which is the same failure arriving through the
file picker instead: Chrome on Windows answers no, which is why an iPhone clip
that plays perfectly in the camera roll cannot be read.

`COURT-CHECK.md` is the twenty-minute list that uses it: nine steps in order,
each saying what it proves, ending in what to send back. The first three are
worth doing without a racket — they cover what this browser will record and
whether the app really works with the network off, which are the two things most
likely to be silently wrong.

The whole thing is also one block of text, always on screen and always
selectable, with a copy button as an accelerator rather than as the only way
out — `navigator.clipboard` is refused often enough on a phone that a button
which is the only route strands somebody. **The user agent is deliberately
absent.** It is the field most likely to identify one person's device across
sites, and it adds nothing the rest of the block says: a UA string is what you
read when you want to *guess* at capabilities, and every line there is the
capability itself, asked directly. Leaving it out is also what makes the block's
vocabulary finite — a test walks the report and fails on any string outside a
fixed list, so a field added later cannot quietly carry a file name or a serve
into something the player is being invited to paste to somebody.

**Save or share a report.** One button renders the score, the thing to work on,
the five areas and the annotated keyframes into a single image, and hands it to
the share sheet or saves it. That is the only way anything leaves the app, and it
is the player who does it — the app itself never sends anything anywhere.

The target dial goes with it, because it is drawn into the still rather than
composed on screen — a shared card showing a bare arc where the report shows an
arc, a band and a reading would be the quieter claim about the same serve, and
the honest half is the one that would have been lost. The two paired comparisons
do not. That card is one serve; a pair is a statement about a set of them, and
half a comparison shared without its dates or serve numbers is a picture of two
serves with nothing saying which is which.

**Show me the fault.** Under the top drill, "Show me" plays two model serves
side by side on one clock: the same serve with the fault and without it. Both
come from the synthetic rig (`lib/faultDemo.ts`), built on the phone when asked,
so no footage is stored or downloaded. A left-hander sees left-handed bodies.

Each demonstration has to earn its place twice (`faultDemo.test.ts`). The engine
must name the fault on the left body and not on the right. The two bodies must
also differ by at least a tenth of body height at the moment the fault is judged,
because two identical figures under "this fault" and "the fix" teach nothing.
Five faults pass: the tray grip, the posture collapse, the collapsed elbow, the
shallow drop and the low contact. Three were built, measured and left out. The
hip-before-shoulder timing fault is never more than 0.016 body heights apart. An
early shoulder turn faces the lens on a side-on camera. And a toss that wanders
is about a ball the drawing does not show.

Side by side rather than as a dashed ghost under the fault, which was tried
first. That ghost is dim on purpose and drawn from the hips up, and two bodies a
fault apart overlap almost everywhere, so the one difference was the hardest
thing on screen to see.

**The two ball targets were set against the wrist, and now follow the ball.**
The toss band was argued from contact height. But contact height is the wrist,
and at contact the ball sits about a quarter of a body height above it. So the
toss ceiling (1.72× standing height) sat below every published toss peak in
skilled servers. Measured from this app's ankle line, those run 1.82–2.08 (Newton
2025, Vacek 2025, and WTA players in Gao 2026), so the app told all of them their
toss was too high. The fall-before-contact band (0–0.09) was worse. Skilled
servers let the ball fall 0.56–0.94 m from its apex before impact, about a third
of a second, so the old band called every one of them late. The toss ceiling is
now 2.1 at every level. The fall band is 0–0.55, so only a ball left to drop over
a metre is flagged, and the copy and readouts say "falls into your swing" where
they used to praise only the peak. Both are measured on the ball itself, so the
published numbers apply directly. The floors are unchanged, for want of club
data. `SCORING_VERSION` moves to 3, which also covers the knee-bend reopening.

**"The arm goes first" is retired, and "your legs sit the serve out" replaces it.**
The old fault graded whether the hips turned before the shoulders. The research
says that order is not the fault it looks like. Olympic servers' upper torsos
peak before their pelvis (Fleisig 2003). In 347 professional serves, segment
order did not predict ball speed (van Trigt 2024). And the reading's own noise
floor was above the miss it called serious. It is still measured and shown; it
is no longer named.

What the evidence does tie to an arm-only serve is legs that do not lift the
body into the ball. A serve with no leg drive cost about a tenth of racket speed
and saved the shoulder nothing (Reid, Elliott & Alderson 2008), and
professionals' centre of mass rises 15.8 ± 3.4% of height from its lowest point
to impact (Deghaies 2026). The engine already measured the hips' rise from the
trophy to contact, the steadiest reading it has: vertical is vertical from every
camera, and it varies by 0.006 between filmings. It sat ungraded only because
nothing gave it a scale, and now something does. `no_leg_drive` grades it on a
ladder that starts just above a serve that only straightens (0.05) and stays
under the professional mean less one deviation at the top (0.11). It sits in
the fix order straight after the toss, which is Kovacs's priority.

**Every drill is a rung on a ladder.** The drill under the top fix says which
step it is ("step 3 of 5"), and "All steps" opens the rest. You get one thing to
feel, the steps from most guided to most like a match, an easier way in, the
mistake people make doing it, and when to move up: the fault gone from four or
five of your next six serves. The engine judges that at your own target, not by
a second threshold (`analysis/progressions.ts`).

The ladders follow Dr Mark Kovacs's order of priorities: grip, then toss, then
legs. They draw on drills from Feel Tennis, Essential Tennis, Top Tennis
Training, the USTA and the ITF's constraints-led coaching. Every cue points at
the ball, the racket or the court, because outward-focused cues moved serve
accuracy in the research. No step holds a position: a pose practised mid-swing is
how a player learns the stop-and-restart hitch, and a check enforces this.
Writing them replaced three drills a coach would not hand out:
- a pause at the drop, now overhead throws;
- a two-second sink at the bottom, now Kovacs's back-leg serve;
- a whole basket on tiptoe, now "hit up and out".

Those three survived on the area cards, the practice card and the fallback
focus, along with "freeze at the trophy", "reach and freeze" and a held hang
under the elbow. Since L1.4 none of them can reach a player; the check now
reads every drill any surface can hand out, 224 of them, every serve type and
axis included.

There is also one source per fault. A card row that reads the same number as
a fault (`CARD_SIGNAL`) hands out that fault's ladder, on the rung the player
is on (`drillForMetric`). So the practice card and the plan can no longer give
two exercises for one fault, and a kick history gets the kick drill.

**A basket checks the step.** When a basket is swept from a report, the serves
just read are counted against the top fix's ladder (`checkDrill`). A serve is
clean when the fault was looked for, could be seen, and was not named. A serve
the fault could not be judged on counts for neither side, so a step is never
passed on serves nobody could read. Enough clean serves earn "Move up a step".
A basket that mostly still shows the fault offers the step before. Too few
readable serves earns "film a few more". Moving is always the player's tap: a
ladder that moved itself would be one nobody trusted. The rung is remembered per
fault (`prefs.ladder`), and the report's drill follows it. `?demo=basket` shows
the state where the fault is still there, and `&passed` the move up.

**What to practise.** Any single report picks the weakest thing in that serve,
which on a given day might just be the serve you happened to film. Across trips
to the court the app looks for the thing that is *still* wrong — ranked by lowest
average rather than by whoever lost the most recent report — and says whether it
is actually moving. Trips rather than reports is what makes that a claim about
weeks: five reports can all be one afternoon, and one afternoon's variance is
not persistence. Being told to work on the same thing forever, with no sense
of whether it is working, is the fastest way to stop bothering.

**"Stuck" and "never tried it" are different answers.** A measurement flat across
five trips means one thing if the player has been drilling it and something
else entirely if they have not, and nothing in the record could tell those apart
— so the card said the same thing to both. There is now one tap to say the drill
was done, and four sentences where there was one: drilled and moving, drilled and
not moving, never logged, and no records at all. The last stays separate on
purpose. A history from before the button existed is not evidence that somebody
has not been practising.

Drilled and not moving is the one worth having. It says to take that one to a
coach, because a player who has done the work and watched the number sit still
is being failed by "spend your time here", and hearing it a fourth time is how
somebody stops opening the app.

There is no streak, no badge and no congratulation for the tap. What it records
is evidence, and an app that celebrates it is asking to be tapped — which fills
the record with drills nobody did and makes the sentence above worthless.

It also says what to *groove*, which is a different question from what to fix.
Ranking by score cannot see a measurement that lands in its band every time and
wanders right across it — and for a club player that wandering is usually what
is costing them the point. The element that came out least repeatable in more
than one basket gets a sentence under the drill: a second thing to work on when
it is a different measurement, and a stronger reason to stay on the first when
it is the same one. It is read off the same trend the progress screen draws
rather than worked out again, because two screens with their own opinion about
which element wanders would eventually disagree in front of the player.

**Then, and now.** A chart says the number went from 58 to 66. It cannot show
that the racket now falls behind the back where it used to stop at the shoulder,
and that is the thing somebody wants to see after six weeks of the same drill. So
the progress view puts the oldest serve that still has pictures beside the newest
one, the same six positions paired up — the same grid the basket comparison uses,
because they are the same picture with different captions.

The oldest that still has pictures, rather than a fixed distance back: stills
survive on the newest twenty reports and are dropped from everything older, so
that is the widest honest comparison there is. Asking for "three months ago"
would quietly return whatever happened to still have images. Both serves have to
be the same type, from the same scoring era, and at least a day apart — two
reports from one afternoon are one trip to the court, and showing them under a
heading about progress would call an hour's variation improvement.

**Progress over time.** Saved reports feed a trend view: overall score by
session, and what changed per fundamental since your last serve. Because a
single serve is noisy, the headline figure is a rolling average of your last
three rather than whichever one you just hit, and any change under 3 points is
shown as "no real change" rather than dressed up as progress.

---

## How it works

```
video file
   ↓  seek frame by frame (no playback, no upload)
MediaPipe Pose Landmarker  →  33 landmarks per frame, 2D image + 3D world
   ↓
phase detection            →  the six keyframes
   ↓
biomechanics               →  joint angles, heights, timings
   ↓
scoring + coaching copy    →  report
```

Everything is in `src/lib`:

| File | Responsibility |
| --- | --- |
| `pose/poseEngine.ts` | loads the model and WASM; owns the per-landmarker video clock |
| `vision/objectEngine.ts` | loads the COCO object detector for the racket; mirrors `poseEngine.ts`, draw-only, feeds no score |
| `pose/extract.ts` | samples the video and runs detection |
| `pose/playerCrop.ts` | points the pose model at the server: one padded square per read window from the object detector's tallest person, or the whole frame when the player is already big enough or cannot be found |
| `pose/rtmpose.ts` | RTMPose's crop and SimCC decode, and how its joints are folded into a MediaPipe frame — arms, knees and ankles only, hand and foot points carried along, hips and world landmarks left alone |
| `pose/refineEngine.ts` | loads RTMPose-s on ONNX Runtime's WASM backend and reads one pose inside a box; the swing refinement's engine |
| `pose/skeleton.ts` | draws the tracked body — shared by the player and the stills |
| `framing/judge.ts` | the live framing verdict, before the player has filmed anything |
| `framing/access.ts` | why a live camera preview failed to start, and what to say about it |
| `framing/record.ts` | records off the viewfinder's own stream, and picks the container |
| `share/reportCard.ts` | renders a report as one shareable image |
| `analysis/serves.ts` | picks out each serve in a multi-serve clip |
| `analysis/consistency.ts` | compares the same measurements across a basket |
| `analysis/carryForward.ts` | whether the fault the last serve was told about actually moved on this one |
| `analysis/strain.ts` | which joint warnings keep recurring across recent trips, and over how many that could have answered |
| `practice.ts` | finds the weakness that persists across trips to the court |
| `progress.ts` | the trend view, the then-and-now comparison, the six-week milestone, the trip streak, the best consistency gap swept, the best score, the recurring-strain join, and what counts as one trip |
| `screenFlow.ts` | every legal move between screens, as data a test can walk — describes `App.tsx`, never drives it |
| `backStack.ts` | the phone's back gesture: one history entry per open screen or sheet, so back closes the top one instead of the app. `components/useBackLayer.ts` is its hook |
| `dev/demoRoutes.ts` | the dev-only `?demo` routes — basket, glance and its verdicts, a refused clip, a seeded season — out of `App.tsx`, dynamically imported so none of it ships |
| `trackPair.ts` | whether two saved swings may be drawn on top of each other, and where the older one goes |
| `storage/sessionKey.ts` | one stored report per serve, not per analysis run |
| `storage/db.ts` | the reports, and separately the drills the player says they did |
| `analysis/phases.ts` | finds the six keyframes |
| `analysis/metrics.ts` | turns landmarks into measurements |
| `analysis/coaching.ts` | target bands, serve types, every line of coaching copy, one drill per fault |
| `analysis/anatomy.ts` | says each measurement as a body position instead of a number |
| `analysis/kinematics.ts` | the motion as continuous series: rotation, spine, palm, and their rates |
| `analysis/tiers.ts` | the rating ladder, and the band one rung above the player |
| `analysis/flaws.ts` | named breakdowns, their evidence, and which cause which |
| `analysis/diagnose.ts` | the diagnostic pass, out as one JSON object |
| `analysis/spatial.ts` | which way is up, where the camera stood, and whether depth is readable |
| `analysis/kalman.ts` | holds a landmark through blur, and scores how degraded or how frozen the track is |
| `analysis/triage.ts` | the primary fault as stored data, or the reason the clip could not be read |
| `analysis/verdict.ts` | the same walk continued into the two-to-four plan the player reads |
| `analysis/syntheticServe.ts` | a parametric serve with no camera — drives the tests and the `?demo` report |
| `analysis/voice.ts` | the house style as code: strips filler, caps length, lints the copy |
| `analysis/confidence.ts` | how far to trust each measurement, and why |
| `analysis/geometry.ts` | angles, smoothing, scoring curve |
| `analysis/axes.ts` | which body axis the camera's image x actually measured |
| `analysis/racket.ts` | where the racket is, inferred from the hand |
| `analysis/groundTruth.ts` | fixture format and validator for real labelled clips |
| `analysis/framingIssues.ts` | is this clip framed well enough to measure, and the thresholds that decide — split out of `groundTruth.ts` so the fixture schema is not weight on every first paint |
| `fixturePlan.ts` | the six clips the fixture shoot needs, in order — bound by a test to the three axes the gate actually counts |
| `vision/ballTrack.ts` | finds the tossed ball in the pixels |
| `storage/backup.ts` | persistence, export and import of the history |
| `selfCheck.ts` | what this browser will record, open, store and show, asked on the device |
| `footprint.ts` | what an analysis is holding in bytes, and what it cannot count |
| `analysis/analyze.ts` | orchestrates the above |

### Decisions worth knowing about

**The report never shows the number it measured.** Everything spatial is a ratio
of standing height, because that is what survives a change of camera — and
"1.38×" is a coordinate multiplier that means nothing to a player. Each
measurement carries a ladder of body positions instead (`analysis/anatomy.ts`),
so the card reads "peaks a ball above the racket" and the target underneath it
is read back through the same ladder. The value is still on the report object
for fixtures, the consistency sweep and the dev tools; it just never reaches the
screen.

**Targets are one rung above the player, never a fixed standard.** The
measurements are scored against bands describing a well-struck serve, which is
the right thing to score and the wrong thing to *aim* at — a club player asked
for a tour racket drop has been handed a target indistinguishable from none, and
on the flexibility-bound signals, chasing one is how people get hurt.
`analysis/tiers.ts` carries a ladder anchored at four rating points, and the
diagnostic pass always hands back the band belonging to the tier above the
player. Give it a rating and it uses it; give it nothing and it estimates one
from the serve, deliberately pessimistically.

**One answer, or an honest refusal.** A club serve has six things wrong with it
and most of them are downstream of the first, so `analysis/triage.ts` collapses a
diagnosis to a single instruction using a hierarchy — grip, toss, posture, drop,
sequencing, contact. Whatever the deepest fault is, the shallowest one wins, and
a flaw already attributed to another detected flaw is never chosen. When the clip
itself cannot carry an answer — nobody visible, too few frames through the swing,
a hand smeared past recognition — it returns a reason and nothing else, because
half an answer off a clip that bad is the half the player would act on.

**Every window is measured in seconds, never in frames.** Two frames is 16 ms of
slow motion and 66 ms on a phone. Windows counted in frames therefore mean
different things on different clips, and one of them used to average the two
ends of a pronation measurement into each other and report an ordinary serve as
a pushed contact. A test now reads the same serve at 24, 30, 50 and 120 fps and
fails if the verdict moves.

**A requested sampling time and an achieved one are not the same number.**
Every derivative in `kinematics.ts` already divided by the real gap between two
samples rather than assuming a fixed rate — that half of "frames are not evenly
spaced" was already handled. The other half was not: `extractFrames` asked the
video to seek to an evenly-spaced grid of times and then recorded the sample
under the time it *asked for*, not the time `video.currentTime` actually landed
at. A decoder does not seek to an exact instant, it snaps to the nearest real
frame — a few milliseconds off target on an ordinary seek, not only on the rare
one that times out — so every one of those careful per-sample derivatives was
computing an exact answer from an admittedly inexact input. `pose/extract.ts`
now files every sample under where the seek actually landed.

**The diagnosis is data, and only data.** `analysis/diagnose.ts` returns numbers,
booleans and enums: signals, named flaws with the band they missed, severity,
and which flaw caused which. No sentence is composed anywhere in that path — a
test walks the output and fails on any string that is not an identifier. It also
never returns a frame or a landmark, so a stored report cannot pin a decoded
clip in memory.

**The house style is enforced by a test, not a style guide.** Coaching copy rots
towards the polite, the hedged and the long, a word at a time. `analysis/voice.ts`
caps every line at two sentences and twenty-five words, strips openers and
hedges, and lints the whole copy database in `__tests__/copy.test.ts` — a
pleasantry fails the build. Copy marks its instruction with `**double
asterisks**`, which is the only thing rendered in bold and is flattened for the
share card.

Since L1.5 the editor also reads what it used to miss: drill names, labels,
fault and injury titles, ladder cues and phase captions, plus the sentences
built at runtime. That means every practice headline for every label and
branch, and every toss placement.

It also holds "drop" to the racket. A verb form is caught unless it follows
"racket", and so is the noun bolted to anything else ("the ball drop").

The pass it came with rewrote lines a twice-a-month player tripped on:
- "Tossing arm stays up" is now the label "Tossing arm timing", since it read
  as praise at the head of the plan;
- the racket drop no longer asks for the hand "down your back";
- the best-serve line speaks in readouts, not figures;
- tosses are placed in foot-lengths (a foot is about 15% of stature);
- a stuck reading is sent to a coach only after four logged sessions of its
  drill, not two;
- the early-turn cue no longer asks for no turn before contact;
- the kick drill tosses above the head, not over the hitting shoulder.

**Joint angles come from the 3D world landmarks, not the image.** An angle
measured in the image plane changes when the camera moves. Shoulder tilt is the
clearest case: filmed side-on the shoulder line points nearly at the camera, its
horizontal component collapses, and a real 20° tilt projects as 60°+. For the
same reason every horizontal ratio is normalised by body height rather than
shoulder width, which foreshortens to almost nothing side-on.

**The toss and the racket drop are postures, not places.** They are tracked as
hand height *relative to the shoulder*, which is unaffected by the player
leaving the ground. Tracking them in absolute height lets the leg drive corrupt
them — a player who holds the tossing arm up while launching has a hand that
keeps rising even as the arm folds. Contact is the exception and is measured in
absolute height, because it genuinely is a place: the highest the hand gets.

**Each keyframe is bounded by an independently-found one.** The racket drop is
the lowest point *after the trophy*, not the lowest point in the second before
contact — early in the motion the racket simply hangs by the hip, which is
further below the shoulder than the drop ever gets. Searching a fixed window
finds whatever sits at the window's edge, and which one wins changes with the
frame rate.

**Sampling is capped at 32 fps.** Phone video is almost universally 30 fps, so
sampling faster re-reads the same decoded frames at ~55 ms apiece and learns
nothing. Slow-motion footage still gets more samples through the swing, because
it spreads the same motion over more seconds of file.

**And spending that budget unevenly cannot help, because of where it binds.** The
obvious improvement is to thicken the sampling around contact and thin the
lead-in, where nothing but the ready pose is measured. It is not buildable, and
the reason is a clean anti-correlation rather than a difficulty. The budget binds
only on a span wider than `MAX_FINE_FRAMES / FINE_FPS`, 3.75 s — which is the
5-second blind fallback (24 fps) and a single-pass clip at its longest
(26.7 fps). A located window spans 2.7 s and spends 86 of its 120 frames, capped
by the frame rate rather than by the budget. And the contact time is known in
exactly the one case with frames to spare: the blind fallback is by definition
the window where the scan found nothing to aim at, and a clip short enough to be
read in one pass is never scanned at all. There is nothing to weight around in
either window that would benefit. Had they overlapped, the ceiling was 5.33
samples through the swing against the fallback's 4.00 — one sample, on the path
that most often ends in "I could not find a serve in that clip". Pinned in
`robustness.test.ts` by a check written to go red if a located window ever starts
binding the budget, which is the condition that would make it worth revisiting.

**An area with nothing graded is left out, not scored 0.** Rhythm grades a
single row, the share of the motion after the trophy. That row leaves the card
whenever the trophy lands on the toss, which happens on the commonest club
serve: straight legs and no racket drop. The empty area used to score 0 and be
weighted into the overall, about 9 points on that serve. It was also drawn as a
ring badged "Needs work", and the next serve that had the row reported "Rhythm
+83". Now the overall is the weighted mean of the areas that were graded
(`overallOf`). The card says "Not measured on this clip" with no ring or status
colour, and no trend or delta is drawn into or out of the empty area
(`isMeasured`).

`isMeasured` reads the shape of the stored area rather than a stored flag: a
graded row never scores under the curve's floor of 30, so an area at 0 with no
rows can only be an empty one. Reports saved before the rule therefore read
the same way, with no migration. The change folds into scoring version 5.
Pinned in `collapsedSwing.test.ts`.

**The plan pays the confidence costs the card pays.** The card marks a number
down for what it rests on beyond its landmarks:
- the height recovered from the torso, when the feet were cropped;
- a trophy found from the arms;
- a hand and a ball that disagree about contact;
- a smeared swing.

The diagnosis read the same numbers off the same frames priced on visibility
alone. So the card could call contact height approximate while the plan named
`low_contact` as the first fix at full confidence. Now every diagnosis signal
that shares a quantity with a card row pays that row's costs. `restingTrust`
and `blurTrust` in `confidence.ts` serve both places, so the two cannot drift
apart.

`triage` then leads on a firm finding whenever one exists. That is the card's
`SOFT_MEASUREMENT` line, the same rule `pickFocus` has always applied. The rest
of the plan lists firm findings before soft ones, each group in causal order.

The sideways lean is the other half. It is read from the world skeleton across
the hip line, and by contact the hips face the net. So from the side that line
runs along the lens and the reading is a guess at depth: it is hedged by
`DEPTH_COLLAPSED` there and no longer names `posture_collapse` or raises the
lower-back flag. From behind the baseline it lies across the picture and is
read as before. `angleReach.ts` now sends a side-on player behind the baseline
to check it. Pinned in `robustness.test.ts`, `flaws.test.ts` and
`angleReach.test.ts`.

**One place to start.** A basket report used to give three different first
instructions on one screen:
- the basket's line beside the serve chips said "groove that one thing before
  anything else";
- "Work on this next" directly under it named something else;
- the practice card under that could repeat the focus drill word for word.

Home did the same, with "Working on" from the season's weakest reading beside
"This week" from the last report's plan.

Since L1.6:
- the basket line defers to the plan ("groove it once your first fix holds");
- the practice card keeps its season line and its log but prints no second
  copy of a drill the focus already gives (`sameAsFocus`);
- Home shows "Working on" only when it agrees with the week's plan;
- the season's pick ignores readings the card marked approximate, as the plan
  and `pickFocus` do.

**A report is never traded for an error.**
- **A failed sweep keeps the report.** A basket sweep that found too few
  readable serves used to replace the report it started from with "I could
  only read one of those serves". That first serve had already been read,
  judged and saved. Now the report stays, with one line saying why there is no
  comparison (`withoutComparison`).
- **A refused clip is not swept.** Its own read was not believed, so the app no
  longer spends a minute on six more passes over the same footage.
- **A refused serve inside a sweep counts as unclear.** It reaches no chip,
  spread or best-against-worst.
- **The wrong-hand error no longer points at a missing badge.** The app retries
  a wrong-hand clip with the other hand on its own, so when both hands fail the
  player is no longer told to tap a badge on a report that does not exist.

The report's own serve is still read again by the sweep. The full read has the
ball and the refinement that swept serves skip, so putting it in the spread
would compare unlike numbers.

**The report's focus ranks over every measurement, not over the areas.** An area
score is an average, so the weakest area is not reliably where the worst fault
lives — a player with rigid legs could otherwise be told to work on their tempo
because Rhythm averaged a little below Loading, while the knee bend that
actually cost them the serve went unmentioned.

**Measuring a whole basket scans the clip once.** The scan covers the entire
video while each extraction covers only a couple of seconds of it, so repeating
the scan per serve was the most expensive thing the pipeline did — about 40% of
the total work for a three-serve comparison.

**Locating serves costs a fixed budget, not one proportional to the clip.** Every
sample is a video seek plus a pose detection, roughly 55 ms, and that floor is set
by decoding rather than by anything here. Sampling the whole clip at a fixed rate
therefore cost 55 ms for every 83 ms of footage: a three-minute basket spent over
two minutes finding serves before it measured one, and a ten-minute clip — well
inside the size the app accepts — spent seven. Since the app actively suggests
filming a basket, that had to be bounded.

The scan now spends a fixed number of frames however long the clip is, in two
passes. A coarse pass spread across the whole clip finds roughly where the reach
peaks are; a second pass re-reads a second either side of each candidate at the
full rate. The refinement is what makes the cap safe: sampling coarsely does not
move a serve, but it under-reads how high the hand got, and `findServes` discards
any peak more than a tolerance below the best — so an under-read serve is not
merely imprecise, it is dropped, and the player is told one of their serves could
not be read. Spending the samples where the answer lives gives better peak
heights than a uniform scan at four times the cost. A thirty-minute clip went
from 21,600 frames to at most 596: 420 for the coarse pass, plus the twenty-odd
frames the refinement spends on each of up to eight candidates.

Both passes land on one grid across the whole clip rather than being laid out from
each candidate, so windows around two serves close together genuinely share their
frames instead of each paying for the same instants.

**The tracking is checked for staying on one person.** The pose model is asked for
one body and chooses which one every frame, with no obligation to pick the same
one twice — so a coach standing to one side, or somebody on the next court, can
take over mid-clip and the report is then assembled from two different people.
Nothing else in the pipeline can see it: every landmark is present, visibility
stays high, and the numbers look entirely ordinary.

Physics gives it away. Hips are the steadiest thing on a serving body: across
24–120 fps, and including the leg drive, they never move more than about 0.03 of
standing height between samples. A hand-off to somebody a metre away moves them
half a body height in a single frame. Past a threshold five times the fastest real
motion, the app says so and halves the confidence — not another weighted term,
because no amount of good light and frame rate makes a report built from two
bodies trustworthy.

**That check cannot see a hand-off between serves, only inside one.** A
basket is measured one serve at a time, each read from its own window, ready
to finish — so a coach who serves once in the middle of it produces a serve
with nothing to jump *from*, and the comparison happily lines their numbers up
against the player's own. What a fixed camera can still say is whether the
serves agree on whose body it was filming: standing height should hold
steady, filmed from one spot in one session, and a serve that reads clearly
taller or shorter than the rest gets a note on the comparison rather than a
silent blend of two people's serves.

**The scale reference avoids extremes of noisy data.** Every height in the report
is a ratio against the player's standing height, so a bias in that one number
bends all of them at once. Taking the highest head position and the lowest foot
position would do exactly that — the extreme samples of a jittery series are by
construction the ones noise pushed furthest, so the body would measure taller the
worse the tracking got, silently shrinking every ratio. The ground comes from the
median foot position across the stance; standing height comes from the median
head position over the opening of the motion, before the player sinks into the
load.

**Joint angles are read from positions averaged over a frame either side.** An
angle near full extension is under-read on noisy tracking: 180° is a ceiling, so
jitter on a nearly-straight limb can bend it but cannot straighten it past flat,
and the error does not cancel out. Left alone, a genuinely straight arm measures
bent — and arm extension is one of the measurements that tells a player to change
something. Averaging positions first (they *do* have symmetric, cancelling noise)
cuts that error by about two thirds. Every angle read this way sits at an
extremum of its own motion, where the value is locally flat, so the window costs
no real accuracy.

**Clips that are not serves are rejected rather than scored.** A serve lifts the
racket hand from around the hip to well above the head; if that did not happen,
the app says so and explains how to film it instead of reporting confident
nonsense. It also reports a confidence figure and flags what degraded it.

**"Not a serve" and "cannot read that file" are different answers.** A clip the
browser cannot decode is usually HEVC — which iPhones record by default, Safari
plays, and Chrome on Windows frequently will not. The file looks perfect in the
camera roll, so a generic decode error reads as the app being broken and leaves
nothing to act on. The app names the codec and points at the iPhone setting that
changes it. Telling that player to keep their feet in frame would send them off
to refilm something that fails identically.

**The wrong hand is diagnosed as the wrong hand.** Selecting the wrong serving
hand makes the app watch the tossing arm, which never sweeps from hip to
overhead — so it used to report "that does not look like a serve" about a serve
that plainly was one, with filming advice that could not fix it. It now checks
the other arm before rejecting, and says which hand it actually saw. The usual
cause is a front-facing camera mirroring the clip.

**Handedness reads a gap in time, which is why noise does not touch it.** Which
arm holds the racket is decided by which one peaks *later* — the tossing arm
early, the racket arm at contact — and that gap, measured in seconds, is wide
enough that ordinary tracking jitter has never once closed it in testing: swept
across sixty realisations of poor-light noise, zero flipped. Camera-angle
detection shares the same landmarks and is not nearly so settled: it recovers
the angle from a shoulder span, and the arithmetic that does it grows far more
sensitive to noise the more face-on the camera stands. A clip too face-on to
read depth from is still almost never confidently read as one that can be, but
a clip only a couple of degrees inside the readable range is over-hedged as
unreadable more often than not — a real cost in lost readings, measured and
tracked rather than fixed, because the two fixes tried each helped one camera
angle and made another worse.

**The first-run guide is one sheet with three reasons to open it, and it has to
remember which.** Analyse a serve, Record now and Check your framing first are
three different destinations after the four filming rules and the hand
question — a file picker, the phone's camera app, and the live viewfinder —
and until this was named as `firstRunIntent` the guide only ever knew one of
them: finishing it always opened the file picker, whatever had actually been
tapped. A first run through Check your framing first had no route through the
guide at all and skipped it entirely; a first run through Record now landed on
a generic file browser instead of the camera. Both are the same root cause,
fixed once: the continue button reads which of the three it is about to do,
and finishing branches on it — reusing the same `framingNonce` counter
`Glance`'s "Record another" already bumps to open the viewfinder, rather than
inventing a second way to ask for it.

**Reading the rules and stating a hand are two different facts, not one.**
The interstitial above gated on a single flag, `seenFilmingGuide`, for both
whether to show the four filming rules and whether to ask which hand serves —
so a stranger who read "How to film it" on the home screen first, unprompted,
then tapped Analyse a serve, would see the identical four rules again before
being asked for a hand never actually collected. The fix is not "stop asking
after the rules are read": that would let the same stranger skip the hand
question entirely, since nothing else on the path asks for it and every swing
measurement is read off the racket arm the hand names. `Home.tsx`'s gate is
now `needsHandedness`, true only until a hand is stored — the read-only guide
sheet marks `seenFilmingGuide` on its own close, and the interstitial it
shares with the first run reads that flag itself to decide whether `FilmingGuide`
renders inside it this time, always asking the hand regardless.

**"Record now" is two different technical routes to the same promise, and
most phones only need to know about the better one.** The live preview in
`FramingCheck.tsx` — a real-time verdict on angle, tilt and framing while the
phone is being aimed, with a record button of its own once the shot is right
— is the thing an operating system's camera app cannot do, because nothing in
it has ever seen this engine. It used to be reachable only from a strap below
two buttons that both read as "hand me a file," worded as a mere preview
rather than as a way to actually record. A player standing on a court who
wants to record now had an obviously-labelled button for exactly that already
on screen, and it was the blind one: `capture="environment"` on a hidden file
input, straight to the phone's own camera app, no feedback until the analysis
came back — an estimated half a minute, see the note above. Both routes still exist — the preview can
fail to start on a denied permission or an unsupported browser, and
`FramingCheck` already has a message for that, pointing back at the camera
app and the file picker exactly as before — but which one answers to "Record
now" is decided once, by `previewSupported()`, before either button ever
renders. Where the preview can run, "Record now" opens it; the blind hand-off
is now the fallback's job alone, not a second, competing "Record now" a
player has to choose between with nothing on screen to say why. Desktop is
untouched: `coarse` gates the promoted button out entirely there, and "Check
your framing first" stays a strap, the only route in since a laptop never had
the blind button at all.

**Logging a drill used to cost three taps and a screen the report never
mentioned; now it costs one, on the screen that names the fault.** "I did
this drill" lived only on `PracticeCard`, and `PracticeCard` rendered only
inside the progress sheet — reachable from a fresh report by backing out to
the home screen, tapping "Your form" (itself only offered once two serves
exist), and scrolling down. Nothing on the report a player has just read said
this control existed anywhere. The fix carries no new logic: `practice`,
`logDrill` and `undoDrill` were already computed once at the top of `App.tsx`
from the full session history, already stable across renders via
`practiceRef`, already exactly what the progress sheet's card used. `Report`
now takes the same three as props and renders the same `PracticeCard`,
unmodified, right after "Work on this next" — its own per-serve causal fix,
a different question from the season-long one `practice` tracks, which is why
the two sit stacked rather than merged. Both call sites get it, a fresh
analysis and a reopened saved one alike, since `practice` is computed from
history rather than from whichever report happens to be open. Absent exactly
where the progress sheet's copy was already absent — a player with fewer than
two comparable sessions has nothing to log yet, which is a real fact about a
first serve and not a gap this round invented one to fill.

**The overlay already does not care how long the clip is; now something
would fail if that stopped being true.** `PosePlayer`'s trail and the ball
flight both looked like an obvious place for a slow phone to fall behind on
a long recording — a trail "can be fifty frames long," per its own comment,
and a naive read of that comment would worry a much longer one draws more.
It does not, and had not for some time: the trail buckets into six
alpha-graded polylines regardless of how many sampled frames sit between
`from` and `to`, and the flight path bucket into eight regardless of how
many points `ballMarkerAt` evaluated the fitted curve at. What was missing
was proof rather than a reading of the bucketing code, so `drawing.test.ts`
now drives the same `drawSkeleton` `PosePlayer` calls at ten times the
sampled frames and ten times the flight-path length and counts the
`stroke()` calls a canvas would actually have to rasterise — the real cost,
which does not move. A wall-clock timing check was tried alongside it and
dropped: the test stub allocates an object and stringifies a colour on every
`lineTo`, work no real canvas does, and that bookkeeping cost swamped the
sub-millisecond durations involved badly enough to fail the same assertion
on some runs and pass it on others — a flaky check is worse than none, so
the timings are printed for a human to read and never asserted on. No code
in `PosePlayer.tsx` or `skeleton.ts` changed; this round's deliverable is the
proof that what is there already holds, pinned so a future change that
reintroduces per-segment strokes fails a test instead of a phone.

**Accessibility is fixed by subtraction and addition, never by touching a
pixel.** Phase 3's close-out audited the four surfaces added since the last
pass — `Glance`, `FramePair`, the target dial, `DeviceCheck` — against the
standard the rest of the app already meets: the global `:focus-visible`
ring, the blanket `prefers-reduced-motion` reset in `tokens.css`, and the
`role="status" aria-live="polite"` pattern `Analyzing`/`FramingCheck`/the
player's caption already use for an outcome nobody would otherwise hear.
Three real gaps closed, all through attributes with no rendered footprint.
`Glance`'s lead score — the first thing on the screen, deliberately unlabelled
so a caption is not a second sentence under the ring — read as a bare "68"
to a screen reader with nothing nearby saying what it counted; wrapped in
`role="img"` with `aria-label={\`Score ${score} out of 100\`}`, which
collapses the ring to one accessible node instead of removing the visible
label the design deliberately does not have. `FramePair`'s best-against-worst
comparison carried that claim in colour alone — `figure:first-child`'s green
caption — so a colour-blind or screen-reader reading of "#1" beside "#3" said
nothing about which was which; a new `leftIsBetter` prop feeds a
`.sr-only` " — the better serve" / " — the worse serve" pair, passed `true`
only by `ConsistencyPanel`, whose `leftCaption`/`rightCaption` are built from
`pair.best`/`pair.worst` and can honestly claim it. `DeviceCheck`'s copy
button changed its own visible label on success or failure and told nobody
listening; a `sr-only` `role="status" aria-live="polite"` region now says the
same outcome in words, matching the pattern already established elsewhere
rather than inventing a new one.

Found and not fixed, because fixing it is a rendering change and this round's
own rule was zero of those: the same `figure:first-child` colour rule
`FramePair` shares with the then/now comparison in `App.tsx` assumes left is
always the better serve, which is only true by construction for the basket
caller. "Then, and now" orders by date, not by score — a player whose serve
has gone backwards over six weeks still sees the older, worse one tinted as
if it were the good one. Named in `FramePair.tsx`'s own doc comment and in
`NEXT.md`'s R21 entry for a future round that is allowed to move a pixel.

The target dial — the joint-angle callout drawn on the keyframe strip —
turned out to already meet the standard, measured rather than assumed:
every value it draws has a textual twin in the fundamentals list below it
(`MetricBar`'s own readout and "Aim for" line), its accent colour
(`PALETTE.active`, the app's one lime accent) computes to roughly 9.7:1
against the plate it sits on even assuming the worst-case background a
translucent plate could be composited over, and its redraws were already
proven flat against clip length by R20. Nothing to fix without moving a
pixel that was not already fixed.

**A basket gets its own share card, built from what already survives without
the clip.** `reportCard.ts`'s own doc comment already explains why the
single-serve card never carried the best-against-worst or then-against-now
comparisons: "half of a comparison, shared without the dates or serve
numbers that give it meaning, is a picture of two serves with nothing
saying which is which." That reasoning is about *pictures* — the paired
keyframe stills, which never survive a reopened report and were never
going to survive a shared PNG either. It does not reach `Consistency`
itself: the score, which serve was which, the differences between the best
and the worst, all already read as words rather than images, and
`ConsistencyPanel` proves every one of them survives with no clip behind it
every time a stored report reopens. So `renderBasketCard` draws exactly
that — score, per-serve chips, best-against-worst in the same body-language
phrases the panel uses, and the two things `Consistency` already flags as
worth naming, `weakest`/`steadiest` — and deliberately not the other
nineteen measured spreads a basket can carry, on the same restraint the
single-serve card already applies to itself: a card that printed everything
would not be a card read at the net, it would be the panel again in a
different frame. `possibleHandoff` — the caution that the serves being
compared may not be the same body — draws too, ahead of the comparison it
qualifies, because leaving out the one sentence that says "read this
carefully" would be the confident-nonsense failure this whole codebase is
built against, aimed at a coach who never opens the app to see the panel's
own warning.

A real bug was caught building this, not assumed away: the first version
right-aligned the best and worst readouts a fixed 200px apart, which
collided into unreadable overlapping text the moment a coaching phrase
("Struck at full racket reach" against "Struck below full reach") ran wider
than the gap — confirmed by actually rendering the card against the demo
basket rather than trusting the layout math. Stacked instead: each value on
its own line, sized to the full card width, so nothing about the layout
depends on how long a given fault's readout happens to be.

**Sharing a file is not one question, it is four, and only two of the
answers were being asked.** `navigator.share` existing was already treated
as "try it" through a `canShare` check and a try/catch — but `canShare`
existing was never questioned, and neither was what to do when it did not.
`attemptShare` (`reportCard.ts`) pulls the decision out where it can
actually be tested, the same move `record.ts`'s `recordingType` already
made for a `MediaRecorder` that exists without recording anything readable.
Two real gaps closed by asking the same "what if the capability check
itself is unreliable" question this codebase already asks everywhere else:
a `canShare` that throws used to propagate as an unhandled rejection out of
the whole share flow instead of falling back to a download, and a browser
with `share` but no `canShare` — an older or partial implementation — was
refused a share attempt entirely for lacking a check newer than the
capability itself, the identical mistake `recordingType` already guards
against for a missing `canPlayType`. Both fixed the same way: a throwing or
absent capability check reads as "try it", never as a hard no, and the
existing try/catch around `share()` itself is what actually decides
success, cancellation or fallback. Eight tests in
`share/__tests__/reportCard.test.ts` drive every combination with a fake
`navigator` — no browser, no OS share sheet, needed to exercise a decision
that was previously only ever run for real, once, by whichever browser
happened to be open.

**Export and import both already work; the step between them was never
mentioned.** Walked live as a stranger rather than assumed from reading
`StoragePanel.tsx`: every button does what it says — "Export N serves"
downloads a real file and reports the count, "Import from a file" reads it
back and merges rather than replaces, and every failure mode tried (a
picked file that is not JSON, one that is JSON but not a Serve Coach
backup, an import of the same data twice) produces a plain sentence a
non-technical player could act on rather than a stack trace. The gap was
never in either button. It was in what happens *between* them: the panel's
own copy says "moving it is the only way your history follows you to a new
phone" and then gives no instruction on how — a promise made and left
unkept in the same sentence, for the one use case backup exists to serve.
A technical player already knows a downloaded file can be emailed,
AirDropped or put in a cloud drive; a non-technical one, reading a sentence
that names a destination and not a route, does not. Replaced with three
concrete, platform-agnostic ways to move a file and where it lands on the
other end — one sentence longer, zero new UI, the same `sheet-note` class
the old copy already used.

**A trip to the court was never missing, only unnamed.** `progress.ts`'s
`thenAndNow` has refused to compare two reports filed minutes apart since it
was written, in a comment that already says "the same trip to the court" —
a 24-hour threshold, `MIN_THEN_AND_NOW_GAP_MS`, living inline in the one
function that needed it, untested on its own. `sameTrip(a, b, gapMs)` gives
that comparison a name and a signature instead of a comment a second caller
would have had to read and reconstruct by hand. No behaviour changed and no
new persisted type was built: nothing in this codebase asks to store a trip,
reference one by id, or query every trip in a date range, which is the
difference between `clipIdOf` (extracted because two callers, `progress.ts`
and `consistency.ts`, both already needed to collapse by clip) and a `Trip`
row (which nothing yet asks for). Naming the concept surfaced a real, if
separate, cost of not having reckoned with it sooner: `findPracticeFocus`'s
`PRACTICE_WINDOW = 5` counted sessions, not trips, so a player who records
several serves in one sitting through the coached live preview — the
default mobile path since R18 — could fill that entire window with one
visit's own variance rather than the cross-visit persistence the feature's
own doc comment says it exists to catch. Named in `NEXT.md` for a future
round rather than fixed there, and closed by R38: `tripsOf` in `progress.ts`
cuts a history into visits by chaining the same `sameTrip` threshold, and
the window takes the last five of those and every serve on them. The two
things that made it look like a redesign both turned out not to be.
`PracticeFocus.sessionsConsidered` did not change meaning — it counts serves
either way, and "across your last 7 flat serves" is as true of two trips as
"across your last 5" was of five reports. And a player on their first visit
still gets the card: one trip is all the history there is, so the window is
that trip and the floor stays two comparable serves. What changed is only
that one visit can no longer crowd out the four before it.

**A milestone that cannot be produced by a tap.** `PracticeCard`'s drill
button has always been "deliberately not a streak, a badge or a
congratulation" — logging a rep gets no reward, because a control that
celebrates the tap fills the record with drills nobody did. R26 asked for a
milestone that survives that same rule, stretched from a single rep to a
training block. `sixWeekMilestone` (`progress.ts`) is one sentence, on the
home screen's "Your form" card, that says how a real span of practice —
six weeks, confined to the current rubric era for the same reason every
other comparison in this file is — actually went: the score the player's
first serve got, against `recentAverage` now. It reports whichever way the
number moved. A stretch that went backwards gets a sentence too, in the same
plain tone as one that improved, because a milestone that only speaks up on
good news is a quieter version of the badge this feature exists to not be —
the same standard `DeviceCheck` already holds for the device itself. Nothing
new to look at: the sentence uses the existing `.progress-foot` class
verbatim, appears once six real weeks have actually passed, and is absent
entirely until then. Fifteen tests in `lib/__tests__/progress.test.ts`
(shared with R25's `sameTrip`/`thenAndNow`, both newly covered there too)
pin the boundary, the flat case, the regression case and the guard against
measuring across a recalibration.

**The progress sheet is now a screen, `screens/Progress.tsx`.** It held a
hero score, the strain lines, the records, two share cards, the practice
card, the then-and-now pictures, three charts and a table inside a panel
capped at 88% of the viewport, with a grip that promised a glance. It now
has the report's frame — a page, a back arrow, the phone's back gesture —
and takes its selectors with it, so `App.tsx` no longer computes eleven of
them on every render for a sheet that was usually closed. The paragraph
below is kept as the record of the round it describes; "sheet" there is
this screen.

**"Then, and now" is not two sheets deep — it is one tap and about one
scroll, measured rather than taken on the round's own word.** The premise
this round opened with turned out to be wrong, the same way a live walk has
found a wrong premise before (R18 on "Record now", R20 on the frame budget):
`onShowProgress` has exactly one caller, `Home.tsx`'s own progress card, and
tapping it opens `sheet === 'progress'` directly — one `<Sheet>`, not two.
Measured on a 375×812 viewport with two seeded sessions ten days apart: the
"Then, and now" heading sits 686px into a sheet whose own visible height is
634px — 1.08 screens of scrolling past the hero score and the practice
card, not a second sheet behind a second tap. Reachability, as asked for, is
already good, and forcing a change to a path that already works would have
been the failure `LOOP.md` names explicitly — inventing a change to make a
round feel productive.

What is worth noting instead: R26, landed one round before this one, already
gives the exact "here is what changed" signal this round was reaching for,
for free and at zero taps. `sixWeekMilestone`'s sentence sits on the same
home-screen card that opens this sheet, stating the first-serve-to-now
comparison in words before anyone has tapped anything — the teaser this
round might otherwise have had to build now already exists, built for a
different stated reason (a non-gamified milestone) that happens to answer
this one too.

**Phase 4's own copy pass, closing it out.** Every player-facing line added
across this whole engineering programme (R4 through R27) was read by hand
against the twenty-five-word cap and the coach-jargon list — windmill,
cartwheel, back-scratch, the chain, head speed — none of which the
automated lint reaches, because `copy.test.ts` only walks the coaching
copy database (`METRICS`, `FUNDAMENTALS`, `DRILLS`, `AXIS_COPY`,
`VERDICT_TABLES` and the rest of `coaching.ts`/`verdict.ts`/`flaws.ts`),
none of which this programme ever touched — every new sentence lived in
component JSX or in `progress.ts`/`reportCard.ts`'s own generated strings,
outside anything the test suite already checks. One real violation:
`StoragePanel.tsx`'s own R24 fix, tightening a promise the panel used to
make and never keep, had itself grown a thirty-six-word second sentence
in the course of naming three transfer methods. Tightened to twenty-four,
same three methods, same meaning, no clause lost. Everything else audited
clean — `FramePair`'s screen-reader text, `DeviceCheck`'s status
announcements, `Glance`'s score label, the basket card's canvas text,
`ConsistencyPanel`'s share button, `sixWeekMilestone`'s three sentence
templates, the guide-first sheet's titles and button labels — no coach
jargon anywhere, nothing reusing a word the app already owns.

**Zero egress was a comment; now it is a test.** `LOOP.md`'s constraint 7
says the policy in prose — no network call after load beyond the pose model
and the WASM runtime, no analytics, no remote logging — and nothing had
ever checked it. `lib/__tests__/egress.test.ts` scans every `.ts`/`.tsx`
file under `src` (72 of them) for every syntactic way a browser starts a
request — `fetch`, `XMLHttpRequest`, `sendBeacon`, `WebSocket`,
`EventSource`, `new Image()` — and asserts the result is exactly two named,
justified call sites: `poseEngine.ts`'s one `fetch` for the pose model
(same-origin, once per session, behind a singleton guard — the WASM runtime
beside it is fetched the same way from inside MediaPipe's own library code,
traced by hand into `node_modules` to confirm it targets the same
same-origin path rather than a Google-hosted one), and `reportCard.ts`'s
`new Image()`, which only ever loads a `data:` URI already held in memory
and so never reaches the network stack at all. A third check reads
`index.html` itself for an external URL, since a remote font or an
analytics tag there would be egress none of the TypeScript scan could see.
Text-matched rather than parsed on purpose — over-matching a comment that
merely mentions one of these names is the failure mode to court, not the
one to fear, and the allow list is checked against what the scan actually
found rather than assumed. Verified with a canary: a temporary `fetch(...)`
call dropped into an unrelated file failed the test immediately, with the
exact file and pattern named, then was reverted.

No `@types/node` in this project, and this test needed `fs`, `path` and
`process.cwd` — the same trade `harness.ts` already makes for
`process.exit`, hand-declared rather than pulling in a dependency for three
calls. `fs`/`path` needed `@ts-expect-error` rather than a `declare module`:
TypeScript's bundler resolution already recognises those names as real,
typeless modules, so declaring them fresh reads as augmenting something
that exists rather than describing something new, and augmentation of a
module with no prior declaration is itself an error.

**An export was disclosed after the button that creates it, not before.**
`StoragePanel.tsx`'s copy already named "keyframe pictures" — R24 wrote
that sentence — but it sat below the Export button as a clause inside
instructions for moving the file to a new phone, the one place on the
panel a player who already knows what they came to do has least reason to
read before tapping. Confirmed what is actually in the file rather than
trusted the reading of `buildBackup`: a live-generated export of one
report carried six base64 PNG stills at 26 KB total for a single serve
with placeholder images — a real one runs 27–80 KB per still, and up to
twenty recent reports keep all six of theirs, so a full history's export
can carry more than a hundred real photographs of whoever was on court,
not an abstraction. Split the one sentence in two and moved the half that
says what is inside ahead of the buttons: "An export is one file holding
your scores and real photos of you serving, not just numbers." The half
that says how to move the file to a new phone stays below the buttons,
where it belongs — that part is instructions for after the decision, not
a fact that should shape it. No new UI, no new colour: the same
`sheet-note` class, split and reordered.

**A non-video file used to be confidently misdiagnosed as HEVC.** Stress
testing the five named cases — a thirty-minute clip, a one-frame clip, a
rotated clip, 4K, and a file that is not a video at all — found that four
were already handled, three of them provably so:

- **A one-frame clip** refuses with "That clip is too short to read." —
  `frames.length < 8` in `phases.ts`, already pinned by
  `engine.test.ts`'s `rejects a clip too short to read`.
- **A thirty-minute clip** never gets read in full regardless of size:
  `readWindow` in `extract.ts` bounds the densely-sampled span to
  `FALLBACK_SPAN` (5 s) once a clip runs past `SINGLE_PASS_SECONDS`, already
  covered by `robustness.test.ts`'s existing cases at up to 30 s, and
  `analyze.ts` prints an on-report warning past `LONG_CLIP_SECONDS` naming
  the actual cost ("Long clip, so most of the wait went on finding the
  serves. Trim to the serves before you upload.").
- **4K** cannot enlarge the canvases pose detection or the keyframe stills
  are drawn into: `readBitmaps`/`captureThumbnails` in `extract.ts` both
  cap canvas width (256px, 420px) regardless of `video.videoWidth`, so a
  4K source is scaled down before a pixel is read, not after.
- **A rotated clip** — container rotation metadata — is corrected by the
  browser's own `<video>` decoder before this app ever sees a pixel, a web
  platform guarantee rather than something to build against. Camera *tilt*,
  a different and real concern, already has its own measured, tested
  refusal path from Phase 2's roll-correction work.

None of the four above could be re-verified against a genuine 30-minute,
4K or rotated file in an environment with no camera and no real footage —
stated plainly rather than claimed: this is a reading of the code and its
existing tests, not a fresh live reproduction, for these three.

**The fifth was not already handled, and was live-verified.** A plain
text file renamed to look like a video — `type: 'text/plain'` — reached
`describeDecodeFailure` in `extract.ts`, which reads one `MediaError` code
for two different situations (a real video this browser cannot decode, and
a file that was never a video) and, on a browser reporting no HEVC support,
guessed the first for both: "This browser cannot play that video... it is
most likely HEVC", with hints about an iPhone camera setting that had
nothing to do with the actual file. Confidently wrong, not merely
unhelpful, and on exactly the browsers most likely to lack HEVC support —
most non-Safari ones — and so most likely to hit this path. Fixed with
`looksLikeNonVideo` (`extract.ts`), checked in `App.tsx`'s `run()` before
the decoder is ever asked: a container MIME type the browser has already
positively named as something other than video or audio is caught early,
with an honest message. A real HEVC `.mov`/`.mp4` is untouched — the check
reads the container type, not the codec — and an empty type or an
`audio/*` one is deliberately left alone, so a browser declining to guess
is not read as a refusal and an audio-only file still gets `loadVideo`'s
own more specific "There is no picture in that file." Pulled out as a pure
function specifically so this could be pinned by a test rather than a live
walk each time: four checks in the new `lib/pose/__tests__/extract.test.ts`
(the first this file has ever had), and live-verified against a text file,
an image file, a garbage-content-but-correctly-typed `video/mp4`, and an
empty-type file — the last two confirming the fix touches only what it
should.

**The animation loop runs only while the clip is moving.** It used to run for as
long as the report was on screen — sixty redraws a second of a paused picture
that had not changed, which on a phone shows up as the handset getting warm
rather than as a bug. Paused, the overlay is redrawn only when something about
it actually changes.

**A frozen track is a different failure from a jittery one, and needed a
different check.** A hand smeared by fast motion produces a noisy track that
the existing blur statistic is built to catch — large frame-to-frame swings
around the true path. A hand MediaPipe has lost behind the body for a stretch
often does the opposite: the model holds roughly still on its last plausible
guess rather than declining, at full visibility, because it is obliged to
return a wrist every frame and a learned prior about where wrists plausibly
sit is not noisy. That read as a *clean* track to a statistic built on
curvature — a racket wrist frozen for half a second through the drop scored
zero blur, and `dropDepth` came back a confident, invented number. The engine
now also asks whether the racket hand travelled at all through the
drop-to-contact window — the one stretch of any serve guaranteed to be a
large, fast excursion — and a track that did not is refused rather than
measured, whatever its curvature says.

**A curvature match is not enough to say two points came from the same
object.** The toss is found by fitting a run of candidate blobs to a
free-fall arc — but that fit only ever reads *height* against time, because
that is where gravity shows up, and it has nothing to say about *width*. Two
background objects each on their own smooth path — another ball, a bird, a
reflection, the ordinary clutter of a busy court — can each contribute a few
frames whose height happens to sit near one shared parabola, and the search
had no way to know those points came from different things: measured across
hundreds of simulated clips with two or three such objects and no real ball
anywhere, a false toss was reported in a quarter of them. A real ball has no
sideways acceleration worth modelling, so its accepted points sit close to
one straight line; points stitched together across two objects drifting in
different directions do not, and the fit is now checked for that too — which
took the same measurement to one in fourteen, and a harder stress test of
pure decorrelated noise, with no coherent object in frame at all, from 85%
of trials to none.

**A detector the engine cannot resolve is withdrawn, not hedged.** Hedging is for
a number that is roughly right; it is the wrong answer for one that is a coin
flip, because the softest caveat still leaves an accusation on the card.
`pancake_contact` was named on 10% of serves the rig calls clean, so it is now
measured and never reported to a player, and `pronation_deg` is graded against
nothing. Two registers record the two ways this happens and both are printed by
the suite as standing warnings: `UNDER_RESOLVED` in `analysis/tiers.ts` for a
signal that moves further between two takes of one serve than the band it would
be graded against — `hip_lead_ms` deviates 57 ms against a 45 ms serious miss —
and `UNCALIBRATED` for the opposite, a signal steady enough to grade with no
honest band to grade it against. The five-link kinetic chain is entirely in the
second: the wrist link holds to 0.5 ms across the noise ensemble where trunk
rotation read from world *z* moves 53 ms, and not one of the five names a flaw,
because nothing here can say what a good one looks like.

**There is one honest use of that register, and the report now makes it.** A
number with no band is still a number, and the difference between two of one
player's own serves needs no band at all — it needs only that the change is
bigger than whatever else could have caused it. `Consistency.uncalibrated`
carries those: `external_rotation_deg` is the first, bounded against posture by
`ER_LEAN_SENSITIVITY`, which measures 0.5° of false rotation per degree of spine
lean and is *additive* (15.0, 15.0, 16.0, 15.0° across four rotations by four
leans), so two serves whose lean differs by L carry 0.5 × L degrees of change
the shoulder never made. Anything at or under that is refused outright rather
than hedged, and the bound is stored beside the delta because it is the entire
licence for printing it — a stored row that no longer clears its own bound is
dropped on the way back out.

The landing is the second entry, and its bound is a different kind of thing.
Nothing can fake a landing offset the way posture fakes a shoulder rotation — it
is read off image x, what the camera measured rather than depth a network
inferred, and it is the best-conditioned reading in the register. What can fake
it is noise, so the bound is the noise: the two measured deviations in
quadrature, `hypot(0.0028, 0.0045)` ≈ 0.0053 body heights. **Not the 0.0035
floor**, which is where a square landing sits rather than how far a reading of it
wanders — two landings 0.0045 apart look real against that floor and are barely
one deviation of a difference. Against a measured span of 0.0035 to 0.0657 the
bound is about a twelfth of the range, so this entry refuses often. That is the
truth about the reading.

Its sentence grades nothing, and one adjective is the whole risk. `offset` is
unsigned, so the app does not know which way the body went, and ungraded, so it
does not know that further was worse — a serve hit with intent finishes
travelling, and a professional lands well across their front foot on purpose. So
it says the player finished further across their feet on one serve than another,
and "fell", "lost", "off balance" and "collapsed" are each asserted against.

**And the sentence says a direction, not a figure.** The obvious line is "your
shoulder laid back 18° further on serve 4 than on serve 1", which is honest and
which `voice.ts` refuses: no line may carry a raw measurement, because a readout
speaks in body language. The usual escape is `readoutOf`, and it is shut here —
a ladder in `anatomy.ts` is a set of absolute stops, and this reading is in
`UNCALIBRATED` precisely because it has no zero to put stops around. So the
direction ships and the magnitude does not, which is a smaller claim than the
round wanted and the largest one the app is entitled to make.

**A finding, not a change: `consistency-foot` is the quietest text on a panel
read at a court in sun.** Measured live on the rendered report — `rgb(123, 135,
153)` on `rgb(20, 24, 34)`, **4.87:1 at 11.5px**. It passes AA by 0.37 and sits
well under AAA's 7:1, and it is the class the two existing basket findings
already use, so the new line joined them rather than shouting over its own
siblings. For comparison on the same panel: `.spread-detail` and the headline
paragraph both measure 6.89:1, and `.spread-label` 15.77:1. Raising the token is
a decision about every surface using it, not one this round is entitled to make.

**The editor now reads the components too, and found eight lines it had never
seen.** `copy.test.ts` is one of three critics this repo keeps in executable
form, and it walks six data tables. Every sentence written straight into JSX was
unchecked — ninety-six of them across twenty-five components, of which fifteen
fail the house voice. Seven are the lint being wrong and each says how: two chart
labels where a leading "Overall" reads as a preamble in a sentence and does not
in a heading, two lines on the dev-only corpus screen, two privacy statements
where the passive *is* the claim (an active rewrite needs a subject, and the
whole promise is that there is no "we" doing the keeping), and the export warning
where "not just numbers" is a hedge carrying the meaning.

Eight were real: a filler "just", two passives, and five lines running 26 to 30
words against a cap of 25. All eight are fixed, and none lost a fact to gain a
word — the storage panel's transfer line is 24 words with all three of R24's
transfer methods still in it, because the fix was a full stop where an em dash
was rather than a deletion. Cutting them would have been one round undoing
another to please a lint, and the lint would have gone green.

The scan is text-matched rather than parsed, and its allow list is checked
against what the scan actually found — the trade `egress.test.ts` makes, for the
same reason. A regex cannot tell a sentence from a label, so the answer is to
write down every match with a verdict rather than tune the pattern until the
output looks tidy. What it cannot see is written at the function: anything
interpolated, since it skips braces entirely.

One of the eight contradicts this project's own record. R28, a phase close-out,
reported tightening the storage panel's transfer line to fit the cap it was
auditing everything else against. It measures 26 words. Whether it drifted since
or was never under is not recoverable — what is recoverable is that a close-out
claimed a fix that does not hold, and nothing could have said so, because no gate
had ever read that file.

**Fixing what makes a number ungradable does not make it gradable.** The chain's
span is measured in milliseconds and therefore grades tempo: the same serve
served slowly has a longer chain, so a band in milliseconds would mark a
deliberate server as having no sequence at all. Dividing by how long the motion
took is the obvious repair, it is now computed, and it stays in `UNCALIBRATED`
for two separate reasons the suite prints on every run. The division removes most
of the dependence and not all of it — swept at 1.1, 1.35 and 1.7 seconds the raw
span spreads 58% about its own mean and the ratio still spreads 21%, because the
span is not in fact proportional to the motion. And even at zero, being
scale-free is what a quantity needs before a band could exist, not a band:
nobody here knows what this number should be for a club player, and the rig
cannot be asked, because every track in it hangs off one normalised phase
schedule. The note this replaces recorded that ratio as scale-free to within 5%
and stated neither its frame rate nor its dials. It does not reproduce, which is
why the sweep is now printed rather than transcribed.

**Image x is not "sideways" — it is whichever body axis the camera laid across
the sensor.** Toss drift was read straight off image x and called sideways by
the metric, by the flaw and by the copy. Filmed side-on, the angle this app
recommends, image x is 0.99 front-to-back and 0.14 across the body, so the number
was depth drift wearing the wrong name — and the drill handed out for it was
"stand side-on beside a fence and brush the ball past it", which constrains the
axis nobody had measured. `analysis/axes.ts` now owns that conversion and nothing
else re-derives it; the axis travels from the reading through the flaw to
`FLAW_DRILL_BY_AXIS`, so a toss that wandered forwards is drilled forwards.
The band moved with it honestly: the depth case keeps its calibration because
dividing by a 0.99 gain shifts it under one percent, and the lateral case is
marked provisional, because until the rig gained a lateral dial there was no way
to drive that axis at all.

**The ghost is drawn only where a translation can express the correction, and
never over a number the app has hedged.** Showing a target beats stating one, but
a picture asserts more than a sentence does. The ghost is a rigid translation of
the player's own tracked body, so it can say "be higher" and cannot say anything
about a joint angle — the trophy ghost was withdrawn for that reason, not because
the knee is hard to see. Its legs are not drawn, because lifting them implied a
leg drive of 0.305 against the serve's real 0.089 and quietly reassigned the fix
to a card scored separately. The gap line ends at the near edge of the target
band rather than its middle, which at one dial was overstating the player's
actual shortfall by 7.6×. A measurement below `SOFT_MEASUREMENT`, or absent, gets
no ghost at all.

**The live framing check borrows every threshold and admits what it cannot
tell.** A viewfinder with its own idea of good enough would wave through clips
the upload path then throws out, so `lib/framing/judge.ts` owns the *order* of
what to say and not one number: cropping and distance come from
`framingIssues`, which of them refuse from `blockingFramingIssue`, camera angle
from `DEPTH_YAW_RANGE`, tilt from `NOTABLE_ROLL`. The sharpest thing it does is
refuse to overclaim: roll is the angle of the player's own standing axis off
image vertical, and a leaning player and a tilted phone produce that reading
identically — so the cue names the picture, offers both fixes and says it cannot
tell which. A test rotates the body about the ankles on a level phone and asserts
both cases give the same words, so the admission cannot be edited back out.

**A severely rotated clip is refused rather than measured through a clamp.**
Every height and axis in this app assumes image y is vertical, which is only
true if a clip's rotation was honoured on the way in — a real test of that
needs a genuinely mis-rotated file from a real phone, which is the same block
`COURT-CHECK.md` is already waiting on. What can be checked is the reachable
proxy: `estimateRoll` clamps its own reading to ±25° so the correction it
drives never over-rotates a frame, and that clamp could have quietly meant a
clip actually rotated 60 or 89 degrees got corrected as if it were a mild 25
and then reported in full. It does not — the confidence cost the roll drives
already pushes a clip that far off level under `LIMITS.spatial` on its own,
so it is refused rather than measured through the clamp, at every severity
tested from 30° to 89°.

---

**The swing is timed between samples, with a fit that respects its shape.**
Contact, the drop and the toss are peaks, and every timing on the report —
drop to contact, motion length, the share after the trophy — is a difference
between two of them. Read as whole samples on a ±1-sample smoothed series,
drop to contact came out **+31 ms long at 30 fps and +45 ms at 24** on the rig
(16 seeds, typical landmark noise): smoothing drags a lopsided peak toward its
slow side, and contact rises fast and falls slowly. `refineExtremum` in
`phases.ts` times each peak where the rising line through the two samples
before it crosses the falling line through the two after — exact for a peak
with two different slopes. A parabola was tried first and was worse, because it
assumes symmetry. Same rig and noise: +10 ms at 30 fps, +15 at 24, +5 at 60;
RMS 35 → 14 ms at 30 fps. Positional readings still use the sampled frame,
which is an observation rather than an interpolation.

## Testing

```bash
npm test
```

The analysis engine is pure TypeScript with no DOM dependency, so it is tested
in Node with no browser and no test framework — `scripts/run-tests.mjs` bundles
it with esbuild and runs it.

The tests drive a **parametric synthetic serve** (`analysis/syntheticServe.ts`)
built from the quantities a coach would name: knee bend, shoulder tilt, hip and
shoulder rotation, where the hands are, how long the motion takes, and where the
camera is. That means a test can dial in a specific fault and assert the app
reports *that* fault and not some other one — and can check a measurement reads
back the value it was built from.

Covered: keyframe order and position, handedness (both hands), rejection of
non-serves, measurement accuracy against dialled-in values, invariance to camera
angle and frame rate, splitting a multi-serve clip into individual serves, and
that scoring stays sane under absurd input.

**Does the advice survive the noise?** Accuracy on clean landmarks is not the
same question as reliability on real ones. A second suite runs an ensemble — the
same serve under two dozen independent noise realisations at the jitter level
MediaPipe actually produces — and asserts not that the numbers are right but
that they do not move enough to change what the player is told. It is a ratchet:
a change that makes the pipeline noticeably noisier turns this red while every
accuracy test still passes. It found three real faults on its first run, all of
which are fixed and now have regression tests:

- The contact-depth measurement took its *sign* from the difference of two
  single jittering landmarks, so noise could mirror it — turning a contact 20 cm
  in front into one 20 cm behind, and the best measurement in the serve into the
  worst. It is now fitted across the whole trophy-to-contact sweep, and dropped
  entirely when there is too little sideways travel to call.
- The trophy was the knee-angle minimum and nothing else. On a player who barely
  bends, that series is flat to within its own jitter and the minimum landed
  wherever the noise dipped — the trophy wandered over 0.4 s of a 1.35 s motion,
  for exactly the stiff-legged club player this app is for. It now falls back to
  the arms when the legs give no signal; the wander is 0.02 s.
- Cropped feet did not trigger the torso fallback, because MediaPipe places
  off-frame ankles somewhere near the edge of the picture rather than declining
  to place them. Standing height came out finite and wrong, and every height in
  the report was divided by it — while the report told the player their heights
  were "estimated from your upper body", which was not true. The check is now on
  whether the ankles were *seen*.

**Ground-truth fixtures.** `src/lib/analysis/__tests__/fixtures/` holds real
clips, hand-labelled, stored as the pose output rather than the video — a few
hundred kilobytes instead of a few hundred megabytes, and hermetic, so a
regression can only come from the analysis code. Dev builds have a **Save as
test fixture** button on every report that produces a labelling draft.

The draft is built to fail, and it says how. It asks for a description before it
will write a file at all — the placeholder used to be the default value of that
field, so the commonest way to produce an unlabelled fixture was to do nothing,
and the validator only said so three steps later once the file was already in
`RECORDED` and the suite was red for what read like a code fault. It writes the
unit each measurement wants beside the measurement, because `expect.metrics` is
compared in the engine's own units and a labeller holding a tape measure has no
way to know that contact height is counted in the player's own standing heights.
And it prints what is left to do, derived from the validator rather than written
out, so a rule added to the gate appears in the list the same day.

The folder is currently empty, and the suite says so loudly: hip–shoulder separation
and shoulder tilt are computed almost entirely from world-space `z`, which the
rig models as exact and MediaPipe emphatically does not, so those two are
unvalidated against anything real until it is not.

**Is the heap flat across repeated analyses?** Object URLs, the extraction
canvases, the pose landmarker and `MediaRecorder`'s chunk buffer are all real
browser objects a Node test cannot see. `src/dev/leakProbe.ts` pushes a blank
recorded clip through the real `analyzeServe` pipeline ten times in a row in a
running browser — same decoder, same object URL lifecycle, same landmarker a
real serve uses — and reads the JS heap between each. Run across ten analyses it
oscillated in a 0.66 MB band with no upward trend, after an initial drop as
start-up buffers freed. It cannot reach `captureThumbnails` or `findBall`,
because both need a serve the pipeline actually finds, and a blank clip is
refused before either runs — the same missing-real-footage block the fixture
shoot and the court trip are already waiting on.

During development, `?demo` renders a report from a simulated serve,
`?demo=live` also mounts the player, `?demo=basket` shows the consistency
comparison, and `?demo=glance`, `?demo=glance-refused` and `?demo=glance-move`
(plus `-cleared`, `-same`, `-wider`) show the on-court screen's branches — so the
UI can be worked on without filming anything. **The routes** are dev-only and are
compiled out of a production build.

The rig behind them is not, and should not be: `dev/sampleAnalysis.ts` is also
what the home screen's **See an example report** is built from, so it ships as a
6.7 kB chunk that is fetched only when somebody presses that button. The line
that used to sit here said all of it was absent from the production bundle,
which a build listing disproves in one glance.

**A re-analysis is a correction, not a new serve.** Telling the app it read the
wrong hand, or flicking between the serves in one clip, re-runs the pipeline —
so reports are keyed by the clip and the serve within it rather than by when
they were produced. Otherwise each correction files a duplicate, which then
shows up as an extra point on the trend chart and eats a slot in the window the
practice advice looks across.

**Reports outlive the code that wrote them.** Anything loaded from storage is
run through `normalise` in `storage/db.ts`, which fills in fields added by later
versions and drops only what is genuinely unusable. An `ErrorBoundary` sits
behind that: if a render still fails, it offers a reload and a "clear saved
reports" escape hatch, because a blank page caused by bad stored data would
otherwise recur on every load with no way for the user to clear it.

---

**What the player did is stored apart from what the camera measured.** A report
is the camera's record and nothing in it is a claim about the person holding the
phone. A drill marked as done is the opposite, and it lives in its own store for
three reasons that agree: correcting the handedness or tapping another serve
re-runs the pipeline and files a fresh report, which would erase a field sitting
on that row; preserving it instead would mean reading a row of keyframe images
back before every save, which is the cost the pruning was rewritten to stop
paying; and a note that somebody did a drill in March has no reason to be deleted
when the report that suggested it is pruned. It rides along in an export, merged
newer-wins per record so two phones each keep what the other never saw, and a
history with none of it behaves exactly as it always did.

**What one analysis holds, and it is not what a stored one holds.** The two
budgets have opposite shapes and reading either as the other is how somebody
optimises the wrong thing. In memory the sampled frames dominate: 120 frames of
33 landmarks twice over is 1.1 MB against 0.3 MB of stills, and a swept basket of
eight serves is about 11 MB. In storage there are no frames at all — a saved
`Session` is `Omit<Analysis, 'frames'>` — so nearly all of it is stills, which is
why pruning drops pictures before numbers.

A landmark costs about 120 bytes to hold four numbers that are 32 bytes, because
V8 boxes each double rather than storing it in the object. That constant is
measured on every test run rather than asserted, and the suite prints the whole
accounting. The canvases turn out to be the smallest thing in the pipeline: the
ball pass runs 256 px wide and the stills 420, both scaled down, so 4K footage
does not enlarge them.

`footprint.ts` counts what is on the JavaScript heap, exactly, and names what it
cannot see rather than estimating it — the decoded video the browser holds, the
WASM heap with its 9 MB model, and the GPU-side copies of anything drawn. So the
headline is bounded on one side only: the JavaScript half of an analysis is
around fifty times under the ceiling this app is held to, and everything that
could breach it is in that unseen list.

**The two numbers that bound the largest allocation now have names.** How many
frames one serve is extracted at was a module-private constant, and how many
serves a clip is broken into was a default argument — so the product of the two,
which is the biggest thing the app ever holds, was written down in one place and
understood in none. Both are exported, and a budget test computes the worst case
the constants allow *from those constants* rather than from a copy. Raising
either is what turns it red. The budget itself is a ratchet at about six times
today's worst case, not the device ceiling divided by something: nobody has
measured a phone, and three of the largest things in an analysis are unreachable
from script, so a split would be arithmetic dressed as evidence.

**The store's own ratchet was counting pictures and tracks, and a report is not
made of those.** It came to stills plus swing track and nothing else, which was a
fair scope while those were the only two things being added — and it meant three
rounds in a row could put fields into a stored report with no number in the
storage gate able to move. Measured on the rig: the rest of a report is **9.2 kB
of measurements and copy plus 0.8 kB of captions**, on every report the store
keeps, because the prune ladder strips pictures and downgrades tracks and there
is nothing in it that strips the words.

Counted whole, a full history is 2.9 MB — against a ratchet set at 3.0 MB "a
third above the measured worst case". That left **1.03× of headroom, not 1.33×**,
so the line would have fired on the next stored boolean and told nobody anything,
which is the same uselessness as a line set too loose arriving from the other
side. The ratchet is re-derived to 3.9 MB at the same third it always claimed:
the policy did not move, the measurement it rested on was wrong. Both its
canaries still fire, and zeroing the new term reddens the headroom check and the
breach canary together.

**History is bounded, numbers before pictures.** Nearly all of a stored report's
size is its six keyframe stills, and those are the part nobody revisits after a
few weeks — while the measurements are what the trend chart and the practice
advice are built from. So the stills are dropped from older reports first and the
numbers survive much longer, which is the opposite of deleting whole reports
oldest-first. If the browser refuses a write because storage is full, the app
frees space and retries rather than silently losing the serve you just recorded.

**What one stored report actually costs.** Measured rather than guessed: a real
keyframe still — JPEG at quality 0.72, 420 px wide, with the tracked skeleton and
callouts drawn onto it, the shape `captureThumbnails` actually writes — runs
27–80 KB depending on the clip's aspect ratio, cheapest on a landscape clip and
costliest on a portrait one. A stored report is six of those plus **31.3 KB** of
everything else a `Session` carries — 21.3 KB of swing track and 10.0 KB of
measurements and captions — so one report is **193–511 KB**, stills still nearly
all of it. `KEEP_STILLS = 20` reports keep theirs; the rest, up to
`MAX_SESSIONS = 60`, keep only their numbers at 31.3 KB each — so a full history
is **5.1–11.5 MB**, and which end of that a player lands on is decided by their
camera orientation, not by anything the app does.

That paragraph said 15 KB until an audit measured it. The figure was true when it
was written and the swing track was written afterwards: 21.3 KB, kept on every
report the ladder keeps and downgraded to 2.7 KB of keyframes only under quota
pressure. So the per-report cost had roughly doubled, on the number the same
sentence multiplies by forty. Nothing could have caught it, because the byte
figures in `footprint.test.ts` are its own constants and had never been asked to
agree with this prose. They are now. The pressure ladder
that enforces those two limits — routine pruning after every save, then
stripping stills across the whole history, then deleting the oldest reports
outright — is driven by a test now rather than trusted: `storage/db.test.ts`
exercises `planPrune`'s selection at every boundary the three levels create.

## Privacy

The video is read from a local object URL, decoded in the page, and never sent
anywhere. Reports are stored in IndexedDB on the device; the clips themselves
are never saved, which is also why reopening an old report shows the numbers and
the keyframe stills but not the video. Clearing site data removes everything.

**Which is also the risk.** Browsers treat site storage as disposable — Safari
clears it after seven days without a visit unless the site has been added to the
home screen, and a player who films every other weekend crosses that line
constantly. So the app asks for persistent storage once there is a history worth
keeping, nudges iPhone users to install it, and can export the whole history to
a file you can carry to a new phone. Import merges rather than replaces, and a
report already on the device wins if it is the newer of the two, so restoring an
old backup cannot roll back training you have done since.

**A report that could not be saved says so.** `saveSession` frees space and
retries before giving up — stripping stills across the whole history, then
deleting the oldest reports — but a device that is still out of room after that
used to fail silently: the report stayed on screen looking saved, and the only
sign anything was wrong was its absence from the history weeks later. The report
screen now carries a warning when that happens, telling you to export or free up
space. Importing a backup has the same honesty: a report that will not fit is
counted apart from one that was already on file, because the two need different
advice — an up-to-date report needs nothing, one that failed to save is worth
freeing space and importing again for.
