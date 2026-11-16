# Serve Coach: the Next programme (handover for Opus 5.5, high effort)

Written 2026-11-15 by the planning session (Fable 5.2, medium effort) after a
review of the code, the docs, the screens and the open data on this machine.
Nothing in this file has been executed. You are the building session.

Repo: `C:\Users\roger\OneDrive\Desktop\serve coach`. Trunk is `master` at
`e8bf74c`, clean, no remote. Windows 11, PowerShell and Git Bash.

## 1. The brief, in the owner's words

> Dramatically lift the quality, trustworthiness and value of this app for
> recreational players around UTR 2 to 6 who want to take their serve to the next
> level. Uplift the core foundations, add depth to genuinely valuable features,
> and add unique value, towards a competitive commercial product: a website and
> browser launch with paid features. Dramatically improve the look and feel, UX
> and design principles, on par with leading premium apps, worthy of paying
> for. Take key screenshots and use Claude Design to revamp the look further.
> Critically assess the core product features and run an ambitious round. You
> have complete agency to think and execute bold, and to remove prior
> restrictions and legacy thinking that have been holding it back.

Read that as the goal. The rest of this file is how the planning session
suggests getting there. Where you find a better route, take it and say why in
the ledger.

## 2. What you are inheriting

An offline React, TypeScript and Vite PWA. MediaPipe Pose (full), an
EfficientDet crop, and RTMPose-s on WASM re-reading the swing window. About
80,000 lines of source, 173 test files, 2,269 checks, 555 commits. No backend.

Read first, in this order: `STATUS.md`, `DESIGN.md`, `docs/lift/LIFT-PLAN.md`,
then the last section of `ROADMAP.md` (H1 onward). `README.md` (2,674 lines) is
the design record: search it, do not read it whole.

**What is strong, and must survive:**

- Honesty machinery. Confidence, noise floors measured on the app's own read,
  bands that must cite a study or a mocap derivation, refusals that give a
  reason. Trust is the best asset here. Raise it, never spend it.
- The lit figure drawn on the player's own landmarks, and the multiple
  exposure picture of a swing. This is a signature nobody else has.
- Plain coaching copy with a lint (`voice.ts`, `cueIssues`).
- Privacy: the video never leaves the device.
- The test culture: a change is done when a test would fail if it regressed.

## 3. Review findings (verified in code on 2026-11-15)

### Trust

1. **No real player has ever been read as a fixture.** `RECORDED: Fixture[] = []`
   in `src/lib/analysis/__tests__/fixtures/index.ts`, against a minimum of 6.
   `groundTruth.ts` (841 lines) and `fixtures.test.ts` (770) are machinery around
   an empty list. Every accuracy claim is synthetic or mocap filmed through a
   virtual phone. No pose model has ever been scored end to end on a serve with
   known truth.
2. **The app does not adapt to level.** `inferTier` (`tiers.ts:1653`) always
   returns 4 because every candidate signal's noise is wider than a rung. A
   picked level moves only 3 to 5 hand-set ladders. For a product aimed at
   UTR 2 to 6, a UTR 2 and a UTR 6 get nearly the same targets.
3. **15 of 31 band definitions cite literature.** The rung anchors on
   `palm_to_sky`, `spine_lean` and `elbow_lift` are hand-set.
4. **The headline is one score (for example 81) whose meaning is unvalidated.**
   STATUS says every engine score is capped until real players are read. The
   review could not find that cap in `confidence.ts`. Check it.
5. **The worst geometric weakness sits at the recommended camera position.**
   The lateral toss axis collapses about seven-fold at 82 degrees, the angle
   the filming guide asks for (`tiers.ts:204`).
6. **Outcomes never inform the diagnosis.** In, net, long, wide and first or
   second are tapped by the player and used in Progress only. Nothing in
   `analysis/` reads them. The Bath in, out and net labels are parsed and
   unused.
7. **Speed is uncalibrated,** and one glossary line ("nineteen times in twenty")
   rests on synthetic serves only.
8. **Real-world decode coverage is Chrome on test-made H.264.** No Safari, no
   HEVC, no phone file. iPhone clips are HEVC `.mov`. For a website launch
   where players upload from a laptop, this is a launch blocker, not a note.

### Product

9. **It is a phone column on every screen.** `--shell: 560px`, three width
   breakpoints in 7,913 lines of CSS. At 1440 px there is a 560 px strip in a
   dark void. A browser product needs a real wide layout.
10. **No commercial surface at all.** No landing page, pricing, account,
    entitlement, paywall, legal pages, og:image, sitemap or hosting config.
11. **Coaching is text.** 13 faults, 11 ladders, 32 drill steps, about 26
    drills, each a name, a how and a rep count. Fault demos animate; drills do
    not. No structured multi-week pathway per goal, no kick or slice pathway,
    no second-serve programme.
12. **No URL routing.** One `View` union in a 1,057-line `App.tsx`, about 20
    `setView` call sites, more than 40 props drilled into `Report`. A website
    needs links that open a report, a drill, Progress.
13. **Density and small type.** The report runs 3 to 5 phone screens with 34 to
    41 controls. 114 CSS declarations sit at 11 to 13 px, hand-set, against a
    16 to 18 px body rule.
14. **Legacy weight.** Dead or test-only modules (`vision/detector.ts` 455
    lines, `vision/outbound.ts` 290, `analysis/invariants.ts` 302), three noise
    tables, two band paths joined by a shim, about 680 lines of prose kept as
    runtime strings in `tiers.ts`, a 4,815-line `ROADMAP.md`.

### Visual

Looked at `docs/lift/after/*.png` (29 states at 390 by 844). The skin is tidy
and the figure is distinctive. It is not yet premium: the tab bar overlaps
content on Today and Progress, the report's first screen stacks a score, a
moment card, a headline, a caveat and two buttons with no clear rhythm, charts
are thin, the player video sits in a plain rounded box with debug-looking
skeleton lines, and nothing uses the width of a laptop.

## 4. What is lifted, and what still holds

The owner removed prior restrictions. The planning session read each standing
rule and decided as follows. These decisions replace `LOOP.md` sections 3 and 7
and the "do not re-skin" lines in `DESIGN.md` for this programme.

| Old rule | Now |
| --- | --- |
| Do not re-skin (two were rejected) | **Lifted.** A full visual revamp is asked for. The lesson from the two rejections stands: they were loud (stark black and white) or flat (paper). Explore, show the owner, then build. See wave 1. |
| Phone only, 560 px shell | **Lifted.** Responsive from 360 px to 1440 px and up. |
| Nothing leaves the device, no account | **Narrowed.** The video and the landmarks never leave. An account, an entitlement and optional sync of numbers may exist, each opt-in and said plainly. |
| No router, no backend, no analytics | **Lifted** for routing and a thin entitlement backend. Analytics only if privacy-preserving and opt-in. |
| Entry chunk under 130 kB gzip | **Kept as a discipline.** You may re-baseline it once, with the reason in the ledger. Do not let it drift. |
| One 4,815-line ledger, README as deliverable | **Lifted.** Archive and start clean (wave 0). |
| No 3D, no heavier models | **Open to measurement.** Adopt only what the benches prove. |
| No LLM | **Open,** as a paid feature fed numbers only, never video. |

Still binding, because they are why the app is worth trusting:

- Never report confident nonsense. No grade on a reading the camera cannot
  support. Do not lower a threshold to admit a clip or pass a test.
- Forgiving to amateur footage by degrading confidence, never by refusing
  early.
- Copy for someone who plays twice a month. 25 words, no jargon, first person
  "I". No long dashes anywhere: `copyDashes.test.ts` reads every file.
- Two to four drills, worst cause first.
- **No item may wait on a human.** No filming, no panel, no beta. Prove by
  machine: the synthetic rig, noise ensembles, the open-data benches, public
  video, published research, and the browser.
- A measured "not adopted" is a result. Write it down and move on.

## 5. The programme

Eight waves. Waves 2 and 3 do not depend on the design decision, so start them
while wave 1 waits on the owner. Each wave lists outcomes, not steps. Split
items as you learn.

### Wave 0. Ground

- Branch `next/premium` from `master`. Never commit to `master`.
- Run the full gate once and record the baseline: `npm run typecheck`,
  `npx eslint .`, `npm run build`, `npm test`.
- Move `ROADMAP.md`, `LOOP.md`, `ANALYSIS-REVIEW.md` and `NOTCH-REVIEW.md` to
  `docs/history/`. Fix the tests and source comments that cite them by path.
  Start `docs/next/LEDGER.md`: one line per item, what it turned out to be and
  how it was proved.
- Capture the baseline: dev server on 5180 through the preview tooling, then
  `node scripts/lift-shots.mjs next-before`. Extend the script to also shoot
  1440 by 900 and 820 by 1180, since wide screens are now in scope.
- Delete what is dead (finding 14), each deletion proved by the suite.

### Wave 1. Design direction, with Claude Design

Claude Design lives in Claude now, as the Design artifact type. Call the
artifacts `guide` tool with `intent: "design"` and follow what it returns
(on 2026-11-15 it said to call `create_from_type` with the account's Design
type). Do not use `DesignSync` for this: that tool only syncs component
libraries.

- Feed it the key shots from `docs/lift/next-before/`: first run, Today, the
  report on a real clip, Progress, the viewfinder, the glance, plus the 1440
  shots.
- Ask for **three distinct directions**, each shown on the same five surfaces
  at phone and laptop width: landing page, Today, report, Progress, and a new
  desktop review studio. One direction must be the current dark and lime
  identity taken as far as it can go. The other two are free.
- Judge them against premium references in sport and health (Whoop, Strava,
  Oura, Arc, Linear for craft). The figure and the player's own footage stay
  the hero in every direction.
- Use the `design-taste-frontend` skill for the critique. Reject anything that
  looks templated.
- **Owner gate.** Show the three directions with your recommendation and ask
  the owner to pick, using one question. Two re-skins were rejected after being
  fully built; do not build a third blind. While waiting, carry on with waves 2
  and 3.
- After the pick: rewrite `DESIGN.md` whole (principles, tokens, type scale
  with a real floor, grid and breakpoints, components, motion, data viz, the
  figure, voice). Rewrite `tokens.css` to match. Update the tests that lock
  style (`styleTokens.test.ts`, `contrast.test.ts`) to the new truth.

### Wave 2. Trust foundations

The aim: every number the app shows has a stated, measured basis, and a player
can see it.

- **Score the real pipeline against truth.** Bath gives 42 serves with 3D
  markers at 180 Hz. Today they are projected to 2D and noise is added. Find a
  way to run the real pose models on a picture of them (a rendered body from
  the markers is one route; say plainly what the domain gap is) and report
  per-metric error, not just per-joint error.
- **Real video, without labels.** Build a test-retest bench on real clips: the
  same serve re-encoded, cropped, shifted by a frame, scaled, darkened. A
  reading that moves more than its stated noise fails. Four Wikimedia clips
  are in `bench-data/clips/`. Fetch more openly licensed serve footage through
  `scripts/fetch-bench.mjs`, and record each licence.
- **Does the score know a good serve from a poor one?** Look for an open
  dataset with amateur and experienced players serving. THETIS (Gourgari and
  others, 2013) is the candidate the planning session remembers: flat, kick and
  slice serves by amateurs and experienced players. Verify its contents and
  licence before relying on it. If the app's readings cannot separate the two
  groups, say so and change what is graded.
- **Make level real.** Replace the inert `inferTier` with a stated level and
  goal at first run (a self-rating a UTR 2 to 6 player understands, and one
  goal: more pace, a second serve that goes in, learn a kick, fewer double
  faults). Level and goal must change targets, priorities and drills in a way a
  test can show. Cite each band shift or leave it ungraded.
- **Fix the geometry at the recommended angle** (finding 5), or change the
  recommended angle. Consider a second sanctioned placement behind the
  baseline, since that is where a fence is.
- **Unify the measurement core.** One band table, one noise table, one path
  from reading to grade. Move the prose records out of runtime code.
- **Use outcomes.** Where the player tagged where serves went, let the
  diagnosis and the drill order use it, past chance only.
- **Decode everything a phone makes.** HEVC, `.mov`, variable frame rate,
  rotation metadata, HDR. Test in Playwright's WebKit and Firefox as well as
  Chrome. Where a browser cannot decode a file, say exactly that and offer the
  route that works.
- **Decide on the pose worker and the threaded refine** (STATUS, "What is
  open") by measurement in a fresh process, then delete the losing path.
- **A public accuracy page.** What I measure, how well, how I know, what I
  cannot see. Generated from the bench results so it cannot drift. This is a
  selling point: no competitor publishes one.
- **Rethink the headline number.** If one score cannot be defended, lead with
  something that can: the fix, the change against the player's own usual, or a
  small set of honest area readings.

### Wave 3. A website, not a phone page

- A router with real URLs: landing, app home, a report, a drill, Progress,
  the studio, settings, pricing, legal. Back and forward work. Deep links
  survive reload. Break up `App.tsx`; state belongs to routes and stores, not
  to 40 props.
- A responsive shell: bottom bar on phones, side rail on wide screens, content
  that uses the width. No screen is a stretched phone.
- Performance budgets per route, lazy engine load kept, the PWA and offline
  behaviour intact.
- Keep the `?demo` routes working; the shots and tests depend on them.

### Wave 4. Product depth worth paying for

Rank by value to a UTR 2 to 6 player. The planning session's order:

1. **The review studio (desktop).** Drop a clip on a laptop. Big frame-accurate
   video, the fault drawn on it, scrub by phase, side by side with a model
   serve and with the player's own earlier serve, synced at contact. Drawing
   tools and angle read-outs. This is the reason to open it in a browser.
2. **Drills you can see.** Every drill animated on the figure renderer, from
   the synthetic rig: the wrong way, the right way, the feel cue. Then a check
   that reads the player's next clip against that drill's one target.
3. **Pathways.** Four to six week programmes per goal and level: first serve
   pace, a reliable second serve, a kick serve, a slice serve, ending double
   faults. Each with weekly sessions, a re-test, and a measured before and
   after. Second serves become a full case.
4. **Compare anything.** This serve against my best, my usual, last month, a
   model. One component, used in the report, Progress and the studio.
5. **Session intelligence.** A whole basket: fatigue drift, first against
   second, what the in serves share, a one-line plan for next time.
6. **Filming that works first time.** A guided setup with a live silhouette to
   match, a spoken verdict, and automatic clipping of each serve from a long
   recording made in the app (STATUS N1.10).
7. **A coach link.** A page a player can send to a coach or hitting partner.
   Rendered on the device today; shareable by link once a backend exists.
8. **Ask the coach (optional, paid).** A chat that answers from the player's
   own numbers and the app's coaching content. Numbers only, never video,
   opt-in, built behind an interface so it can be switched off. Use the latest
   Claude models and read the `claude-api` skill before writing any of it.

Cut anything that does not earn its place. A measured cut is a result.

### Wave 5. The premium rebuild

Every surface rebuilt whole in the chosen direction, phone and wide. No
half-migrated screens. Order: first run and landing, report, Today, studio,
Progress, filming and waiting, sessions and glance, sharing, settings, every
error and empty state.

- The report's first screen answers three questions on the player's own
  footage and fits in one screen on a phone.
- Type has a real floor. Kill the 11 to 13 px declarations.
- Charts designed for this app; read the `dataviz` skill first.
- Motion with meaning, all of it at rest under reduced motion.
- The share poster and clip redesigned as things people post.

### Wave 6. The commercial surface

- **Landing page** that demonstrates rather than claims: a real serve read in
  front of the visitor, the accuracy page linked, privacy stated, pricing
  clear. SEO basics: titles, descriptions, og:image, sitemap, canonical.
- **Free and paid.** Proposal to refine: free gives one full read and the top
  fix, with a short history. Paid gives the full breakdown, pathways, the
  studio, compare, sessions, speed over time and coach sharing. Put every gate
  behind one `can(feature)` function with tests. Paywalls show what is behind
  them on the player's own data.
- **Accounts and payments, built to be switched on.** Choose a provider
  pattern, write the client and any serverless functions in the repo, and run
  them against mocks and a provider's test mode on localhost only. Do not
  create accounts, enter keys or deploy. List the exact owner steps.
- **Legal and trust pages:** privacy, terms, the model and data credits.
- Hosting config ready for a static host with the right headers (the threaded
  WASM path needs cross-origin isolation).

### Wave 7. Close-out

- A full independent review with fresh subagents: one as a UTR 3 player, one as
  a coach, one as a product designer, one hunting engine regressions. Each
  finding re-checked by a skeptic before you act on it.
- Accessibility, performance on a throttled profile, offline, reduced motion.
- `npm run release` green.
- Regenerate the shots as `next-after` and build a before and after gallery.
- Rewrite `STATUS.md` (keep `handover.test.ts` true), `README.md` cut to a
  readable size, and a short `docs/next/OWNER-STEPS.md`: keys, domain, hosting,
  a radar check, and anything else only the owner can do.

## 6. How to work

- **Verify before you trust this file.** Findings were true on 2026-11-15.
  Check each against the code before building on it.
- **Tests that will push back, on purpose.** Update them to the new truth when
  the new truth is intended. Never delete one to get green.
  `bundle.test.ts`, `entryGraph.test.ts`, `handover.test.ts`,
  `screenshots.test.ts`, `screenFlow.test.ts`, `reachable.test.ts`,
  `styleTokens.test.ts`, `contrast.test.ts`, `jsxCopy.test.ts`,
  `copyDashes.test.ts`, `wordsInChrome.test.ts`, `cardCopy.test.ts`,
  `render.test.ts`, `a11y.test.ts`, `motion.test.ts`, `egress.test.ts`,
  `isolation.test.ts`, `bandNoise.test.ts`, `consistency.test.ts`.
- **Gate before every commit:** typecheck, eslint, build, test. Commit one
  ledger item at a time, in the repo's style: one plain sentence saying what
  changed for the player or the engine. End each message with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **UI is not done until you have looked at it.** The owner's global rules
  apply: use `design-taste-frontend` for new UI, run it under `playwright-cli`,
  screenshot it, read the console, fix what you find, run
  `web-design-guidelines` on changed files, and run `playwright-cli close-all`
  at the end. Start dev servers through the preview tooling
  (`.claude/launch.json`, `serve-coach` on 5180), never a bare shell.
- **Use subagents for width, not for judgement.** Engine experiments run well
  in parallel worktrees, one per experiment, brought back one commit each. On
  this machine a worktree may use junctions to the main `node_modules`; remove
  junctions as links only before deleting a worktree.
- **This machine is noisy.** Other apps load the CPU and headless Chrome has
  crashed after reports. Treat long browser timings as unreliable and say so.
- Edit files that hold backslashes with the Edit or Write tool. Shell heredocs
  drop them.
- Entry chunk headroom is about 2.7 kB gzip today. New screens load lazily.
- Player-facing lines go through `cue()`, which silently cuts past two
  sentences or 25 words. Check new headlines with `cueIssues`.
- **Stop only for the owner gate in wave 1 and for anything in section 7.**
  Otherwise keep going. Report at the end of each wave in a few lines: what
  shipped, what the gates said, what was cut and why.

## 7. Only the owner can do these

Do not attempt them. Prepare everything around them and list them in
`OWNER-STEPS.md`.

- Pick the design direction (wave 1).
- Create payment, auth and hosting accounts; enter keys; buy a domain; deploy.
- Agree prices and what is free.
- A git remote and a first tagged release.
- A radar-checked serve, and any filming of real players.
- Accepting any dataset licence that needs a signature or a form.

## 8. Done means

- A stranger landing on the site understands what it does in ten seconds,
  reads a serve without an account, and sees why paying is worth it.
- A UTR 3 and a UTR 6 get different, defensible coaching.
- Every graded number has a measured basis the player can open, and the
  accuracy page states it publicly.
- It looks and moves like something people pay for, at 390 px and at 1440 px.
- iPhone and Android clips read in Chrome, Safari and Firefox, or the app says
  exactly why not.
- Gates green, ledger complete, owner steps listed.
