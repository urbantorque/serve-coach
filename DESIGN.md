# Serve Coach design: Floodlit

This is the visual source of truth. Where it disagrees with anything else, this
wins. Tokens live in `src/styles/tokens.css`; a colour, a radius or a width written
anywhere else is a defect, and `styleTokens.test.ts` says so.

On 2026-11-16 the owner looked at three directions on a Claude Design canvas
(Floodlit, Daylight and Broadcast; the ledger is `docs/next/LEDGER.md`, N1) and
chose Floodlit: today's dark and lime identity, taken as far as it goes, with a
real wide layout. Daylight and Broadcast stay on the canvas as references, not
as options for a single screen.

## What it should feel like

A premium sports product at night under one floodlight. The player is the only
thing lit. Numbers are big enough to read from the baseline, words are few, and
the lime only ever means "this is the thing".

The test for any screen: one clear purpose, one main action, and a player's first
reaction to a report is "that's mine". On a laptop, add a fourth: it uses the
width. A phone column in the middle of a dark field is a defect.

## The identity

Dark, one tennis-lime accent, rounded, elevated, Archivo. The lit figure and the
player's own footage are the hero images. Two earlier re-skins (stark black and
white, warm paper) were rejected for being loud and flat; Floodlit is the answer
to both, so it is raised, not replaced.

## Colour

| Role | Token | Use |
|---|---|---|
| Ground | `--ink`, `--ink-1` to `--ink-4` | The page, then steps up |
| Panel | `--panel`, `--panel-raised`, `--panel-edge` | Elevation, always as a soft top light, never a hard border |
| Stage | `--stage` | Behind the figure: a cool spotlight falling off to the ground colour |
| Accent | `--lime` | The main action, the current thing, a speed. One a screen where possible |
| Moment | `--moment`, `--moment-ink` | Lime as a whole surface. Only for something earned |
| Status | `--great`, `--good`, `--fair-ink`, `--work` | A grade or a caution. Never decoration |
| Text | `--fg`, `--fg-muted`, `--fg-faint` | Three steps, no more |
| Glass | `--glass`, `--glass-edge`, `--veil`, `--veil-top` | Anything sitting on a picture |

On a picture, coral (`--work`) is what I saw and lime is where to get to. The
same body never uses lime for "look here" and coral for "the fault" at once:
pick the pair that says "from this, to that".

A speed is never coloured by status: nothing grades a speed. It is lime because it
is the reading, not because it is good.

## Type

Archivo, one variable file, self-hosted (`src/assets/fonts/archivo.woff2`, OFL). Its
width axis does the work a second family would do.

| Role | Class | Width | Use |
|---|---|---|---|
| Score | `.t-score` | 62 | The one big number |
| Figure | `.t-figure` | 62 | Stats, tiles, speed |
| Display | `.t-display` | 112 | A screen's title, a refusal |
| Headline | `.t-headline` | 112 | A section |
| Subhead | `.t-subhead` | 100 | A row's title |
| Overline | `.t-overline` | 100 | A short label, in sentence case |

**The floor.** Nothing a player reads is under 14 px: that is for incidental
metadata only (a date under a tile, an axis tick). Labels, chips and controls are
15 px or more. Body copy is 16 to 18 px. Anything a player reads on court is 27 px
or more. `wordsInChrome.test.ts` holds the floor on every stylesheet.

Sentence case everywhere. No capitals for emphasis. Tabular numerals wherever a
number can change (`.tnum`).

On a canvas, the widths are the font keywords `extra-condensed` and `expanded`, and
`cardFonts()` waits for the face.

## Space, shape and the grid

- Phone: side margin 20 px, one column, `--shell` (560 px) at most. A stage bleeds
  past the margin, edge to edge.
- Tablet, 768 px and up: the same column, wider stages, sheets centred.
- Laptop, 1024 px and up: a side rail (`--rail`) replaces the bottom bar, and
  screens lay out in two panes inside `--wide` (1280 px): the picture or the
  chart on the left, the words and the one action on the right (`--aside`).
- Breakpoints are 768, 1024 and 1280, and the screen layouts live in
  `styles/wide.css`. Custom properties cannot sit in a media query, so these are
  the numbers to use. Three older component rules (400, 480 and 640 px) predate
  them and should fold into them when their screens are rebuilt.
- Radii: 12 for small, 16 for chips, 22 for cards, 28 for sheets and stages, pill
  for anything pressed.
- Touch targets 44 px at least. The film button is 70.
- A section is a heading and its content. Cards are for what needs elevation: the
  next action, a stat, a sheet. Plain lists are plain.

## Depth

Three levels: the ground, a panel, and what floats (the rail or bar, the report's
action, sheets). Elevation comes from a top light and a soft shadow. A stage has
no edges: it falls off into the page. On a picture, glass panels carry the words:
`--glass` with a blur and a top highlight.

## The figure

The app's main image: a lit 2D solid drawn over the tracked landmarks (`lib/figure`),
never a wireframe. It is the player's own body from their own serve. The joints are
exactly where they were measured: `shape.test.ts` holds that on every frame.

- Kit by tone, a cross-limb light, a rim of lime on the far side, a shadow on the court.
- A still gets the soft rim. Motion gets the cheap one.
- `paintExposure` lays a swing down as one picture with the racket's real path. It is
  the app's signature, used when a swing finishes reading and on the shared poster.
- The model serve is a real serve from the Bath capture (CC BY, credited in Settings).
- A figure is never a photograph of anybody, which is why it can travel on a card.

## The review studio

The laptop's reason to exist. The player's clip fills the left pane with the
fault drawn on it (coral for what I saw, lime dashes for where to get to) and one
glass label for the reading. Under it, the phases as named stops, not a frame
counter. On the right, the number against the player's own usual, the one fix,
how each part read, the drills worst first, and one lime action at the foot.
Compare (on its own, your best, a model serve) is a segmented control above the
picture.

## Motion

- A report plays through once when fresh, and the number counts up as it lands.
  Reopened, it opens at rest.
- Screens rise 10 px and fade, with `backwards` fill. Never `both`: an animation left
  in effect on `transform` traps every fixed child inside the screen.
- `--fast` for presses, `--base` for sheets, `--slow` for arrivals, one ease family.
- Under reduced motion everything is at rest, the waiting screen keeps a still serve,
  and nothing is lost.
- Nothing loops on a screen that is not the waiting screen or the first run.

## Sound

Tones are made on the phone, with no files, and are never the only signal. Court
tones carry across a court. A report lands with a soft rise, and something earned with
a longer one, well under the court tones. Settings turns them off.

## Data

- Fit the axis to the player's own range, but never tighter than 24 points, so a wobble
  cannot pass for a climb.
- Draw the range, not just the median. A line never crosses a change of rubric.
- Words sit beside the picture only where the picture needs reading.
- Every number that could be noise is held to the player's own noise before it is
  shown as a change. A change that is only noise says nothing, or "about the same",
  and never a lone dash.

## Structure

Today, Progress, and the lime film button between them; on a laptop, a rail with
the film button, Today, Progress and Studio, which opens the latest serve in the
review studio. Pathways stays a sheet from Today's goal, where the goal is. A new player has no bar: one screen, one
promise, one action. Filming is the whole screen. Everything else is a sheet, one
tap away, or a fold.

- **Today** is one "what now": the goal, the next step, the momentum, the last serves.
- **Progress** is the shape of the serve: the ribbon first, folds at the end, the list
  in a sheet.
- **The report**: the first screen answers how did I do, what do I fix, what do I do
  now, and on a phone it fits in one screen. Depth comes after and is the player's
  choice.
- **The glance** is one screen, read from the walk back.
- **The landing page** demonstrates rather than claims: a real serve, the fault drawn
  on it, the fix, then how sure I am.

## Copy

Plain, warm, first-person "I", never "we", for recreational players. Sentence case.
Short. No long dashes: `copyDashes.test.ts` reads every file. No jargon without a tap
to explain it. A claim stays supportable, and the voice lint (`cueIssues`) holds every
line to 25 words. Say what the app cannot see.

## What is banned

- A wireframe skeleton as the main image.
- Three stacked exits, or two main actions on one screen.
- Frame counters, "1/52", "Full / Half / Quarter", "Skeleton".
- A form where a guess with one tap to correct would do.
- A second accent colour, a new font family, a light theme.
- A grade on an unsupported reading, or a speed without "about".
- A phone column stretched or centred alone on a wide screen.
- Text under 14 px.
