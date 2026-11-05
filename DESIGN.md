# Serve Coach design

This is the visual source of truth. Where it disagrees with anything else, this
wins. Tokens live in `src/styles/tokens.css`; a colour, a radius or a width written
anywhere else is a defect, and `styleTokens.test.ts` says so.

## What it should feel like

A premium sports product at night under one floodlight. The player is the only
thing lit. Numbers are big enough to read from the baseline, words are few and
spoken, and the lime only ever means "this is the thing".

The test for any screen: one clear purpose, one main action, and a player's first
reaction to a report is "that's mine".

## The identity, and what is fixed

Dark, one tennis-lime accent, rounded, elevated. Two full re-skins, stark
black-and-white and warm paper, were built and rejected. Do not re-skin. Raise it.

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

Lime on a part of the body means "look here". Coral on a part of the body means
"this is the fault". The same body never uses both.

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

Sentence case everywhere. No capitals for emphasis. Tabular numerals wherever a
number can change (`.tnum`). Body copy is 16 to 18 px on a phone. Anything a player
reads on court is 27 px or more.

On a canvas, the widths are the font keywords `extra-condensed` and `expanded`, and
`cardFonts()` waits for the face.

## Space and shape

- Side margin 20 px. A stage bleeds past it, edge to edge.
- Radii: 12 for small, 16 for chips, 22 for cards, 28 for sheets and stages, pill for
  anything pressed.
- Touch targets 44 px at least. The film button is 70.
- A section is a heading and its content. Cards are for what needs elevation: the
  next action, a stat, a sheet. Plain lists are plain.

## Depth

Three levels: the ground, a panel, and what floats (the tab bar, the report's action,
sheets). Elevation comes from a top light and a soft shadow. A stage has no edges: it
falls off into the page.

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

Two places and one button: Today, Progress, and the lime film button between them. A
new player has no bar: one screen, one promise, one action. Filming is the whole
screen. Everything else is a sheet, one tap away, or a fold.

- **Today** is one "what now": the goal, the next step, the momentum, the last serves.
- **Progress** is the shape of the serve: the ribbon first, folds at the end, the list
  in a sheet.
- **The report**: the first screen answers how did I do, what do I fix, what do I do
  now. Depth comes after and is the player's choice.
- **The glance** is one screen, read from the walk back.

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
