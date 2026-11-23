# Serve Coach: the Apex programme (handover for Opus 5.5, extra effort)

> **Closed on 2026-11-23.** Built in `docs/apex/LEDGER.md`, Waves 0 to 6;
> the ledger's last section measures this brief's "done means" item by item.
> Merged into `main` and tagged `apex-close`. Kept below as it was written.

Written 2026-11-20 by the planning session (Fable 5.2, medium effort) after a
review of the code, the docs, the ledger and the current screens at phone and
laptop width. Nothing in this file has been executed. You are the building
session.

Repo: `C:\Users\roger\OneDrive\Desktop\serve coach`. Trunk is `main` at
the commit that added this file (same as `next/premium`), clean, no remote. Windows 11,
PowerShell and Git Bash.

## 1. The brief, in the owner's words

> I have an existing tennis app to specifically help with serve analysis
> (filming and uploads), advice and training. The base ingredients are already
> there, but I want you to lift the app from a 7.5/10 to a premium, high quality
> serve coaching tool that is 9.5/10 and something people would pay money for.
> The design and layout improved from the last refinement round, but think more
> ambitious and polish the look and feel even further to something remarkable.
> Critically assess the core product features and create an ambitious round to
> lift and dramatically refine things towards the next level. You have complete
> agency to think and execute bold, and remove any prior restrictions and legacy
> thinking that has been holding it back. Focus on 5 to 6 core priority areas to
> refine, expand and polish rather than an endless list of small changes.

Read that as the goal. This file is the planning session's route. Where you
find a better one, take it and say why in the ledger. Six areas, done deeply.
If an idea does not serve one of the six, it waits.

## 2. What you are inheriting

An offline React 18, TypeScript and Vite PWA. MediaPipe Pose plus RTMPose-s on
WASM. About 127,000 lines under `src`, 190 test files, 2,360 checks, 606
commits. A thin Cloudflare Pages Function for payments, switched off.

Read first, in this order: `STATUS.md`, `DESIGN.md` (Floodlit, the owner's
pick), `docs/next/OWNER-STEPS.md`, then skim `docs/next/LEDGER.md` for N2.2,
N2.8, N4.x and N7.x. Look at `docs/lift/next-gallery.html` and
`docs/lift/next-gallery-laptop.html` before you judge any screen.

**Strong, and must survive:**

- The honesty machinery: graded bands cite a study, unsupported readings are
  shown and never graded, refusals say what to change, speed is "about" with a
  range. The public accuracy page is generated from the engine's own tables.
- The lit figure, the multiple exposure, and the player's own footage as hero.
- Plain first-person copy held by a lint (`voice.ts`, `copy.test.ts`).
- The video never leaves the device.
- The test culture and the gate.

## 3. Why it is a 7.5 today (reviewed 2026-11-20)

The last programme built breadth: routing, a laptop layout, the commercial
surface, pathways, sessions, sharing. What is missing is depth at the few
moments a player would pay for. In order of weight:

1. **Nobody knows if it works on a real serve.** The fixture list of recorded
   players is still empty (`RECORDED: Fixture[] = []`). The only real clip in
   the gallery is a 320 by 240 web video. Run against truth on a drawn body,
   the app refused 37 of 40 serves because MediaPipe read the raised arm at
   contact as hanging down (N2.8). Nothing has run on a phone, in Safari or in
   Firefox, and iPhones film HEVC. A premium product cannot rest on this.
2. **The report informs; it does not land.** On the real clip the overlay is a
   white stick skeleton that looks like a debug view, on a small rounded video.
   The hero is a number and a paragraph. The one thing nobody else has, the
   fault shown on the player's own body with where it should be, is a still
   further down. There is no moment that makes a player say "that's me".
3. **Coaching is still mostly text.** One fault has a demonstration (N4.2).
   Drills are a name, a line and a rep count. On court the app counts and
   speaks a countdown, but it does not coach a set.
4. **The training loop is diffuse.** Today, the goal card, Progress (twelve
   blocks and seven "go deeper" rows), the pathway and sessions all tell parts
   of the story. A player cannot answer "am I getting better, and what is this
   week" in one look. Much of Progress is grey explanatory prose.
5. **The laptop studio is a layout, not a tool.** Two panes, a scrubber and a
   side by side. No drawing, no angle read-outs, no ghost overlay, no
   annotated export. It is not yet a reason to open the app on a laptop.
6. **The first five minutes and the reason to pay are thin.** The landing shows
   a mannequin and five text cards, with no motion and no real footage. The
   first read waits on a 57 MB download. A whole practice takes 8 to 15 minutes
   to read. Plus is a feature list, never shown on the player's own serve.

Smaller things seen in the shots, to verify rather than trust: on the phone
report (`09-report-real-clip-full.png`) the lime "First serve filmed" card
looks clipped under the docked action bar; Today's three figures sit on an
uneven row; the line under "What keeps coming back" on phone Progress is a
sliver; `App.tsx` is 1,171 lines and `Report.tsx` 1,235; CSS is 14,400 lines.

## 4. Rules for this round

Lifted, by the owner's "remove any prior restrictions":

| Old rule | Now |
| --- | --- |
| Screens are refined, not rethought | **Lifted.** Rebuild the report, Today, Progress, the studio and the landing whole where the six areas ask for it. |
| Floodlit as written in `DESIGN.md` | **Raised, not replaced.** The owner chose it five days ago; two re-skins were rejected before. Take it further (motion, depth, the footage treatment) and rewrite `DESIGN.md` to match. A new palette or type family is not this round. |
| No LLM | **Open,** as an optional Plus feature fed numbers only, never video, behind an interface, off by default. |
| No item may wait on a human | **Narrowed.** Nothing blocks on the owner, but area A asks once for their own serves, because it is the single most valuable input. Build everything so it proceeds without them. |
| Entry chunk 132 kB gzip | **Kept.** New surfaces load lazily. One re-baseline allowed with the reason in the ledger. |
| Kick and slice pathways cut (N4.5) | **Stays cut** unless area A's footage can prove them. |

Still binding:

- Never confident nonsense. Never lower a threshold to admit a clip or pass a
  test. A measured "not adopted" is a result.
- Copy rules: first person "I", no we or our, 25 words and two sentences a
  text node, sentence case, no long dashes anywhere (`copyDashes.test.ts`
  reads every file, this one included), the coach-jargon list.
- Two to four drills, worst cause first. Speed is never graded.
- The video and landmarks never leave the device. Any egress is the owner's
  call, asked first.
- Downloads need the owner's yes. Accounts, keys, domain, deploy, prices,
  remote and release are the owner's.
- `CLAUDE.md`: use `design-taste-frontend` for new UI, `DESIGN.md` wins on
  conflict, look at every UI under `playwright-cli` with a screenshot and the
  console before calling it done, run `web-design-guidelines` on changed
  files, `playwright-cli close-all` at the end.

## 5. The six areas

Each area has an outcome, the work, and proof. Split into ledger items as you
learn. Areas A and B carry the most weight; give them the most time.

### A. Proven on real serves

**Outcome:** a player filming on a current phone, by the guide, gets a read,
and the app can say with evidence how good that read is.

- **Ask the owner once, at the start (see section 7).** Ten to twenty of their
  own serves on a modern phone in `bench-data/own/` (never in the repo), a yes
  or no to the 200 MB WebKit and Firefox download, and a yes or no to fetching
  more openly licensed 720p or 1080p serve footage. Carry on without waiting.
- **Fix the raised arm.** Reproduce N2.8's failure, then find out whether it is
  the drawn body or the model. Routes to measure, not assume: MediaPipe heavy
  against full, RTMPose-m against s, a wider RTMPose window, a tighter person
  crop at contact, a temporal prior through the swing. Adopt what the bench
  proves. If the refusal rate on real footage stays high, say so on the
  accuracy page and widen what is shown ungraded.
- **A real-footage bench that runs in the gate's slow lane.** Every real clip:
  did it read, how long it took, what it refused and why, and test-retest
  noise. Decide `RETEST_SD` from footage that is not 320 by 240. Fill
  `RECORDED` if the owner's serves arrive, with the owner's hand labels kept
  to things a person can see (which fault, in or out).
- **Decode what phones make.** HEVC, `.mov`, variable frame rate, rotation,
  HDR, 4K and 240 fps slow motion. Prove in WebKit and Firefox if approved;
  if not, build the test so one command runs it later, and say exactly which
  browser cannot read which file with the route that works.
- **Make it fast.** Profile one serve and a 10 minute practice. Targets: a
  first read under 10 seconds on a mid phone profile, a 50 serve practice in
  under 4 minutes. Settle the worker and the threaded refine by measurement
  in a fresh process and delete the loser. Stream results: the first serve of
  a practice shows while the rest read.
- **The first download.** 57 MB before a first read is the biggest drop-off.
  Measure a first read on the smaller model alone, start the download from
  the landing page on intent, and make the wait useful (area F).

**Proof:** a bench report committed as data, the accuracy page regenerated
from it, timings in the ledger from a quiet run, and tests that fail if the
contact-arm misread returns.

### B. The report as the signature moment

**Outcome:** within five seconds of a read, the player sees their own serve,
slowed at the right instant, with the fault and the target drawn on their own
body. A screenshot of it is something they would send to a friend.

- **A directed replay.** The report opens by playing the player's clip: full
  speed to the toss, slow into the fault's moment, a held frame where the
  body lines draw on, then the target shape ghosts in over their own limbs
  (coral for what I saw, lime for where to get to, as `DESIGN.md` says). One
  tap replays it. Reduced motion gets the held frame with both shapes.
- **Redesign the overlay.** Retire the white stick skeleton. Draw the body as
  the lit figure does: soft limb lines, the one joint that matters marked,
  everything else quiet. Test it on dark, bright and busy footage, and on low
  resolution clips. The clip itself gets a proper treatment: edge to edge on
  a phone, graded and vignetted so overlays read, no rounded box.
- **One screen, three answers.** How did I do, what do I fix, what do I do
  now, over the footage, with nothing clipped under the action bar. Everything
  else is one scroll or one tap deeper. Count the controls on the first
  screen and halve them.
- **Rethink the headline.** Ask whether "81 /100" is the right hero. Options
  to prototype: the change against the player's own usual, a small set of
  area readings (toss, legs, drop, contact), or the score kept but second to
  the picture. Pick with reasons; keep `SCORING_VERSION` rules.
- **The same moment everywhere.** The glance, the share poster, the shared
  clip, history thumbnails and Today's "last serves" use the same held frame
  and overlay, so the product has one recognisable image.
- **Use Claude Design before building.** Artifacts `guide` with
  `intent: "design"`. Feed it the current report shots (phone and laptop) and
  two or three real frames. Ask for three takes on this one moment within
  Floodlit, phone and laptop. Show the owner on one canvas with a
  recommendation (section 7). Build the pick; if there is no answer, build
  your recommendation and say so.

**Proof:** shots of the replay's key frames at both sizes on at least three
different clips, a render test for each state (read, first read, soft,
injury, refused), reduced-motion shots, and no control or text under the bar
at 360, 375 and 390 wide.

### C. Coaching you can see and follow

**Outcome:** every fix is shown, not described, and a player can run a whole
practice set with the phone on a bag and never touch it.

- **Every fault and every drill demonstrated** on the figure renderer from the
  synthetic rig: the wrong way, the right way, and the feel. One component,
  one data table, so a new drill cannot ship without its demonstration (a
  test says so). Review the drill library as a coach would: cut weak drills,
  add the missing ones, cite or mark each claim.
- **A guided set.** Start the drill, prop the phone, and the app speaks:
  the cue, the count, a read after each rep in a few words ("better", "arm
  still early"), and a summary at the end. Hands-free, works offline, uses
  the existing speech and earcon code. The between-rep read is the drill's one
  target only, so it is fast.
- **A lesson for each fault**, short: why it matters, what it costs (pace,
  the net, the shoulder), what good looks like on a model serve and on the
  player's best serve.
- **The check that closes the loop.** After a drill block, the next filmed
  serve is read against that drill's target first, and the report says
  plainly whether it moved past the player's own noise.

**Proof:** a test that every drill has a demonstration and a spoken script,
copy lint over every spoken line, a scripted run of a guided set in the
browser with the audio events logged, and shots.

### D. One training loop

**Outcome:** opening the app answers three things in one look: what is my
serve like now, is it getting better, what do I do this week.

- **Today becomes the coach's desk.** One plan for the week built from the
  goal, the pathway step and what the last session showed. The next session
  in minutes. The last serve as the signature frame. Nothing else above the
  fold.
- **Progress becomes one story.** Start from the player's question, not the
  data: a single "then and now" on their own body, the two or three faults
  with their trend, speed, and what changed. Fold the seven "go deeper" rows
  and the grey prose into one tidy detail view. Read the `dataviz` skill
  before any chart; charts should look designed for this app, with hover or
  tap detail.
- **Moments worth returning for.** A weekly review, a re-test at the end of a
  pathway step with a measured before and after, records, a fault retired.
  Each earned, each using the lime moment surface once.
- **Practice sessions join the loop.** A session's summary feeds the week's
  plan: what tired, what the in serves share, one line for next time.
- **Backups carry everything** (`Prefs.goal`, `ladder`), since a paid player
  must not lose a plan.

**Proof:** a render test of Today and Progress for a new player, a two week
player and a three month player, each answering the three questions in the
first screen; shots at both sizes; the block count on Progress halved.

### E. The studio: a reason to open a laptop

**Outcome:** a player or a coach drops a clip on a laptop and has a real
analysis tool, better than scrubbing in a phone gallery.

- Large frame-accurate video with keyboard control (arrows, J K L, numbers
  for phases), zoom and pan.
- Ghost overlay: the player's best or usual serve, or the model, laid over
  the current one, synced at contact, with opacity.
- Drawing and measuring: lines, angles with read-outs, a marked ball path,
  saved with the serve.
- Compare anything in one component: this against best, usual, last month,
  a model; two or four up.
- Export: an annotated still and a short annotated clip, made on the device.
- The coach page gains the studio's marks, so a coach sees what the player
  drew. Settle the laptop rail question in `OWNER-STEPS.md` by building
  Studio as a rail entry and updating `DESIGN.md`.

**Proof:** a scripted browser run of each tool with shots, keyboard and focus
checks, and a test that marks survive reload and export and import.

### F. The first five minutes, and a reason to pay

**Outcome:** a stranger understands the product in ten seconds, gets a first
read fast, and meets Plus at a moment where it is obviously worth it.

- **A landing that demonstrates.** The directed replay from area B playing on
  a real, licensed serve at the top of the page, on both sizes. Then the
  accuracy stance, privacy, and the plans. Cut the five text cards to what a
  visitor reads. Keep it fast: measure LCP on the throttled profile.
- **First run to first read.** Count the steps and the seconds from landing
  to a report for a picked file and for a filmed serve. Remove steps. The
  wait while the model downloads and the clip reads becomes the first lesson:
  the player's own frames appearing, what I am looking for, how to film the
  next one.
- **Plus shown on the player's own serve.** Each locked feature previews with
  their data (a blurred breakdown is not this; show a real piece). Review the
  free and Plus split against what areas B to E built and propose a table for
  the owner. Add an annual option and a short trial to the client and the
  function, against the mock, for the owner to price.
- **Ask the coach (optional, last).** A chat that answers from the player's
  numbers and the app's own coaching content. Numbers only, opt-in, said
  plainly, behind an interface with a mock, switched off by default. Read the
  `claude-api` skill first and use a current Claude model. It is egress, so
  it ships dark until the owner says yes.

**Proof:** step and time counts before and after in the ledger, throttled
performance numbers, the payment flow run against the mock end to end, shots.

## 6. Order of work

- **Wave 0, ground.** Branch `apex` from `main`. Run the gate and record the
  baseline. Start `docs/apex/LEDGER.md`. Shoot `apex-before` at phone and
  laptop with `scripts/lift-shots.mjs`. Send the owner the one message in
  section 7.
- **Wave 1, truth and the moment.** Area A's bench, arm fix and speed work,
  in parallel with area B's design exploration and overlay.
- **Wave 2, the report and the coaching.** Build B's pick, then C.
- **Wave 3, the loop and the studio.** D and E.
- **Wave 4, the front door.** F.
- **Wave 5, close.** A fresh independent review: a UTR 3 player, a coach, a
  product designer, an engine regression hunter, and a first-time visitor
  deciding whether to pay, each finding re-checked by a skeptic. Then
  accessibility, throttled performance, offline, reduced motion, a green
  `npm run release`, `apex-after` shots and galleries, `STATUS.md` rewritten
  (keep `handover.test.ts` true), `OWNER-STEPS.md` updated. Each reviewer
  scores the app out of ten against the brief; report the scores as given.

Report to the owner at the end of each wave in a few plain lines: what
changed, what was measured, what was cut, what is waiting on them.

## 7. Owner gates, asked once and early

Send one message at the end of wave 0, then keep working:

1. Ten to twenty of your own serves, filmed side-on by the app's guide on your
   phone, some at normal speed and some in slow motion, dropped in
   `bench-data/own/`. This is the most useful thing you can give the round.
2. Yes or no: install WebKit and Firefox for Playwright (about 200 MB).
3. Yes or no: fetch more openly licensed serve footage, each licence recorded.

Later, one design gate: the three takes on the report moment (area B). And at
the close: the proposed free and Plus table, and whether Ask the coach may
ever be switched on.

Never do for the owner: accounts, keys, domain, deploy, prices, a git remote,
a push, a release.

## 8. How to work

- **Verify before you trust this file.** Findings were true on 2026-11-20.
- One ledger item per commit, with what it turned out to be and how it was
  proved. Messages end with the `Co-Authored-By` line the session gives you.
- Gate before every commit, chained so a failure cannot commit:
  `npm run -s typecheck && npx eslint . && npm run -s build && npm test && git commit ...`.
  The last round committed once on a red gate because the commit was not
  chained.
- Tests that will push back on purpose: `bundle.test.ts`, `entryGraph.test.ts`,
  `handover.test.ts`, `styleTokens.test.ts`, `contrast.test.ts`,
  `wordsInChrome.test.ts`, `copy.test.ts` (claim stamps), `copyDashes.test.ts`,
  `render.test.ts`. Update them to the new truth when the new truth is
  intended. Never delete one to get green.
- A change that moves a saved report's number bumps `SCORING_VERSION` and
  names its kind.
- Machine notes: files are CRLF, so normalise before scripted replaces; write
  files that hold backslashes or escapes with the Edit or Write tool, and
  build the unbreakable-space escape from a char code in scripts; long browser
  timings here are noisy, so time on a quiet run and say so; unlink a
  worktree's junctions before removing it; shots with a filter overwrite
  `log.json`.
- Playwright: `require(process.env.APPDATA + '/npm/node_modules/@playwright/cli/node_modules/playwright')`
  with `chromium.launch({ channel: 'chrome' })`. Dev server through the
  preview tooling (`.claude/launch.json`), never a shell.
- Use subagents for independent review and wide searches. Keep design
  judgement and engine decisions in the main session.
- Break up `App.tsx` and `Report.tsx` when an area needs it, not as a goal.

## 9. Done means

- A real serve from a current phone reads, in Chrome and in every browser the
  owner approved, with measured accuracy stated on the accuracy page.
- The report's opening moment exists, on real footage, at both sizes, and the
  same image carries through the glance, the poster and history.
- Every drill is demonstrated and a guided set runs hands-free.
- Today and Progress each answer their question on the first screen.
- The studio has ghost, draw, measure, compare and export.
- The landing demonstrates on real footage, and Plus previews on the player's
  own serve.
- `npm run release` is green, the galleries are rebuilt, `STATUS.md` is true,
  and the five reviewers' scores are reported honestly, whatever they are.
