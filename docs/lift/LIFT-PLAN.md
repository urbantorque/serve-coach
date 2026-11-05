# Whole-app lift: the plan

Written 2026-11-05, after walking every screen and state at 390 x 844. The shots
are in `docs/lift/before/`, the capture is `scripts/lift-shots.mjs`, and its
measurements are in `docs/lift/before/log.json`. The ledger of what actually
happened is the Lift section at the end of `ROADMAP.md`; this file is the
reasoning, and stays as written unless a section says it was revised.

## Where it stands today

The engine is honest, well tested and more capable than the app lets a player
feel. The app around it reads like a very careful developer tool: correct
sentences, stacked in the order they were built, on one long scrolling page per
screen, with a wireframe where the hero image should be.

Measured on the walkthrough:

| Surface | Phone screens | Controls | Words |
| --- | --- | --- | --- |
| Report, reopened | 4.9 | 40 | 381 |
| Report, live | 5.9 | 52 | 512 |
| Example report | 5.5 | 41 | 452 |
| Home, with history | 2.9 | 22 | 338 |
| Progress | 4.2 | 20 | 443 |
| Session dashboard | 2.3 | 4 | 245 |
| Glance | 1.4 | 12 | 102 |

What the walkthrough found beyond the brief:

- **Nothing on the first screen is the player's own.** The real-clip report
  shows a ring and a sentence. Their serve starts on screen four.
- **The viewfinder is a sheet over Home.** The camera is a 300 px window with
  the marketing headline showing above it and four rows of toggles below.
- **The hand is asked before the first clip** although the detector reads it.
  A first run is two sheets and a blocked button before any video.
- **"Analyse a serve" and "Record now" are one intent with two names**, and the
  first one leads with a file picker on a phone.
- **Then and now shows two blank tiles** whenever stills are gone, on the screen
  that exists to reward a player.
- **The fault strip on Progress is 23 identical amber dots.** Nothing in it
  says whether anything is getting better.
- **The session dashboard's "Best and worst" reads 76, 76, 76 / 74, 74, 74**, in
  stand-in tiles. A two-point gap is noise, and the screen presents it as a
  finding. The headline stat row counts Found, Read and Unclear before anything
  a player cares about.
- **The glance repeats itself.** The fix is said in the speed block, again as a
  sentence, and the score ring sits between them.
- **Error screens end in a stack of three equal buttons**, and "Something went
  wrong reading that video" is what a player with no engine and no signal is
  told. The real cause (the coach has not downloaded) is known and not said.
- **The offline first open looks exactly like the online one.** Nothing says
  what will and will not work.
- **Every card is the same dark rounded box**, so the page has no hierarchy of
  surfaces. Overlines carry the structure at 12 px, in capitals.

## Grades, before

Out of ten, judged as a demanding player and a product designer would, not as an
engineer would.

| Area | Grade | Why |
| --- | --- | --- |
| Structure and navigation | 4 | No persistent navigation. Progress is a card two screens down, history is a clock icon, and nothing says where you are. |
| First run | 5 | A slogan the app cannot prove, two competing buttons, three text straps, then a five-step read. The value arrives last. |
| Filming | 6 | The framing judge is genuinely good. It is trapped in a small sheet under the home page's headline, with four rows of controls. |
| Waiting | 5.5 | Honest and calm, with a good model serve hidden below the fold. A step list, not a teacher, and nothing about the player's own clip. |
| Report | 6 | The content is right and the order was fixed by Q1 and Q2. The form is not: five screens, forty controls, eight wireframes, three exits, and a tag form in the middle. |
| Home | 5.5 | Correct and exhausting. A backup warning leads, two primary buttons compete, the week takes two screens, and every recent serve has the same title. |
| Progress | 5 | A document. Sentences where a picture is owed, a chart that is mostly empty space, a colliding label, and no feeling of having got anywhere. |
| Practice sessions | 6 | A sound analysis under a stat row of bookkeeping, then prose. |
| On-court use | 6.5 | The loop works hands-free. The glance says one thing three times and still scrolls. |
| Sharing | 5.5 | Three entry points on the report, a card built on the wireframe, and a coach page that is a data dump. Nothing shows change. |
| Settings | 6 | Clear enough, but backup is a chore the player owns, and the warning about it follows them home. |
| Look and feel | 6.5 | Restrained and tidy, inside a skin worth keeping. System type, one card shape, an 11 to 12 px signpost system and a stick figure as the main image. Premium it is not. |
| Motion and sound | 4 | A ring fill and a sheet. Nothing marks a moment. |
| Analysis depth for the player | 6.5 | Strong against bands, thin against the player's own history. It says what is wrong, rarely what is different about you today. |
| Trust and honesty | 9 | The best thing here. The lift must not spend it. |
| Accessibility | 7 | Good bones (live regions, reduced motion, 44 px). Faint small labels, and canvases with little to say. |

## The north star

**Film one serve. See it on your own body. Know the one thing to do next. Come
back and watch it change.**

Four tests for every screen, in this order:

1. Whose is this? If the answer could be anybody's, the screen is not done. The
   player's own swing, their own number, their own change.
2. What is the one thing to do here? One main action per screen.
3. What did the app work out for me? Anything asked that could be guessed is a
   defect.
4. Does it tell the truth? Unsure things say so where they are shown.

The replacement for "World-class eyes on your serve" is a promise the app can
keep on the first screen, and a demonstration of it rather than a claim: a real
serve, a fault drawn on it, and the fix.

## The structure

Three places, and one action between them.

```
  Today              Film              Progress
  what now      (the lime button)    is it working
```

- **Today** is the opening screen. One clear "what now": the next session of the
  programme, in minutes. Momentum in one line of real numbers. The last few
  serves, each with its own picture and its own headline.
- **Film** is one button, always in reach, and it replaces both "Analyse a
  serve" and "Record now". It opens a full-screen viewfinder, with the camera
  roll a tap away inside it. Where there is no camera it opens the picker.
- **Progress** is the shape of improvement: the score and speed over time, the
  faults fading, records, then and now, first and second serves, and every serve
  below that. History stops being a separate sheet.

Below those: the **report** is a full-screen flow of its own, with its one
action fixed at the bottom. The **programme** opens from Today. **Settings** is
the gear on Today, and is half the length it was. The bar hides during filming,
waiting, the report's reveal and the glance, and comes back everywhere else.

Why not more tabs: a separate Plan tab and a separate Serves tab are each
defensible and each make a player choose. A player who plays twice a month has
two questions, what now and is it working. Both of those screens hold the rest.

## The design direction

Inside the settled identity (dark, one tennis-lime accent, rounded, elevated),
written up in `DESIGN.md` as it lands.

- **Type.** One self-hosted variable family with a width axis, so headlines can
  stand wide and numerals can run tall and condensed like a scoreboard. Sentence
  case throughout. Signposts move up from 12 px capitals to a real label size.
- **Surfaces.** Three levels with a clear job each: the floor, a raised panel,
  and a lit stage for the player's own picture. Most of the "card around
  everything" goes.
- **Colour.** Lime gets louder and rarer: whole-panel moments, not a hundred
  small chips. Status colours stay reserved for score feedback.
- **The figure.** The main image of the app. A rim-lit athletic form with weight
  and light, drawn from the same landmarks, plus a multiple-exposure "your serve
  in one picture" that nobody else's serve could produce.
- **Data.** Every chart is drawn for this app: a ribbon for the score, ranges for
  speed, a fading grid for faults.
- **Motion and sound.** Motivated only: a reveal, a count-up, a drawn line, a
  chime for a real best. All of it collapses under reduced motion.

## What changes, ranked by player value

1. **The signature report.** First screen answers how did I do, what do I fix
   and what do I do now, on the player's own cropped frame with the fault drawn
   on it. A short cinematic reveal, skippable. Everything else is depth the
   player chooses. Target: 2.5 screens or fewer before optional depth, half the
   controls, one exit.
2. **The figure.** A new renderer used everywhere a body is drawn, the
   multiple-exposure picture, and a model serve driven by the Bath capture.
3. **The app's structure.** Today, Film, Progress, with persistent navigation.
4. **Today.** One "what now", real momentum, and serves that can be told apart.
5. **First run.** Value before effort, a real example serve, and no questions
   before the first clip (the hand is read from the clip, with one tap to fix).
6. **A real programme.** A goal chosen for the player and changeable in one tap,
   a fault to clear or a speed to reach, across weeks built from the ladders and
   their own cadence, moving on evidence.
7. **Progress as a reward.** Rebuilt around pictures of change.
8. **The player's own baseline.** Each serve set against their own typical and
   best, measured against their own noise. The most honest depth available.
9. **Moments.** Personal bests, a fault beaten and a weekly recap, each stated
   only when the numbers clear the noise.
10. **Waiting that teaches.** The player's own clip being read, live, beside what
    the coach is looking for right now.
11. **Sharing as one choice.** A card, a before and after clip made on the
    device, or a far better page for a coach, behind one button.
12. **Second serves as a first-class case.** A smart guess at first or second, a
    fast correction, and their own line on Progress.
13. **Steadier readings.** Arm extension (`KNOWN` in `bandNoise.test.ts`), then
    load ratio.
14. **Within-player links.** What this player's fastest and in-court serves share.
15. **A stronger kinetic chain read** from footage the app already accepts.
16. **Automatic protection of the history**, so backup stops being a chore.
17. **Serve volume and load over time**, as guidance, never a medical claim.
18. **Filming, sessions, glance, settings and error states**, each rebuilt to the
    same standard: full-screen viewfinder, a session dashboard that leads with
    what changed, a one-screen glance, half the settings, and errors that name
    the real cause.

## How it gets built

- Foundations first (type, tokens, surfaces, icons, the figure), then surfaces in
  the order above, with engine work alongside in separate commits.
- Engine experiments run in parallel in their own worktrees, each proved on the
  rig, the noise ensembles and the Bath bench, and brought back to this branch
  one commit per item. A measured "not adopted" is a result.
- No half-migrated screens: a surface moves to the new system whole.

## What I chose not to do

- **No re-skin.** The dark, lime, rounded identity stays. Two were rejected.
- **No 3D engine or rigged mesh.** A WebGL body needs an asset pipeline, a runtime
  and more memory on a warm phone, and tracked 2D landmarks would not honestly
  support a 3D claim. A well-lit 2D form on the same landmarks gets the effect.
- **No generated photographs or stock athletes.** The player's own footage is the
  photograph. Anything else on this screen would be a pretence.
- **No light mode.** The skill defaults to both. The owner's identity is dark, and
  the app is used at dusk and in a bag.
- **No Tailwind, Motion or icon runtime.** Budgets protect a real phone. Plain CSS
  stays, and icons come from Phosphor as a single small sprite of the glyphs used.
- **No fourth tab, feed, badge cabinet or social layer.** Facts a player cannot
  game stay; rewards for tapping do not.
- **No coach accounts, sync, cloud backup or analytics.** Nothing leaves the
  device. Automatic protection is local, and a file stays the only way out.
- **No outcome detection from the video.** The app does not see the court.
- **No claim that any serve speed is calibrated, and no new graded band without a
  source.** The ceiling on engine truth is still real players and a radar.
- **No planning around filming, coaches, testers or a court trip.**

## What only the owner can decide

Nothing yet needs stopping for. The moves above stay on the device, spend nothing
and keep the identity. If anything comes up it will be listed here.
