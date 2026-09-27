# UI layer: conventions for feature builders

React 19 + Tailwind v4 + react-router 8, phone-first at 390 × 844. **DESIGN.md is the visual source of
truth** (it overrides the `design-taste-frontend` skill); PRODUCT.md owns screens and copy, METRICS.md and
`docs/specs/metrics.json` own metric names, units and statuses. Read DESIGN §1, §3, §8, §11 and §14
before building a screen.

Live gallery of every base component in every state: **`/dev/components`** (`npm run dev`).

## Where things live

| Path | What |
| --- | --- |
| `ui/shell/routes.ts` | Route table: path, title, tab-bar rule, lazy screen. **Keep the path, replace the screen body.** |
| `ui/shell/paths.ts` | `paths.sessionReport(id)` etc. Never hand-build URLs. |
| `ui/shell/AppShell.tsx` | Outlet, push transition, tab bar, toasts, retention sweep, document title. |
| `ui/screens/<area>/…Screen.tsx` | One file per screen. Stubs render `<StubScreen>`; delete it when you build the screen. |
| `ui/components/` | Base components (import from `ui/components/index.ts`). |
| `ui/copy/strings.ts` | UI strings not owned by metrics.json / coaching-library.json, status labels, reason short forms, verdict words, band words, glossary, never-say list. |
| `ui/copy/metricNames.ts` | Player-facing metric names, kept equal to metrics.json by a test. |
| `ui/format/metricFormat.ts` | The display formatter (≈, ranges with "to", rounding, reasons). Only `MetricValue`/`MetricTile` call it. |
| `ui/format/dates.ts` | "Sat 26 Sep", "Sunday 27 September", "26 Sep 2026". Format a session by its `visitId`. |
| `ui/styles/tokens.css`, `base.css` | Tokens (Day, Night, Court-side) and base styles. |
| `ui/theme/` | `ThemeProvider` (in `App.tsx`), `<CourtSide>` for camera screens, `useCourtSide()`. |
| `ui/tokens/z.ts` | z-index layers (same values as `--z-*`). |
| `ui/charts/`, `ui/overlays/` | Hand-built SVG charts (DESIGN §9) and canvas overlays (§8.11): not built yet. |
| `data/` | Types, Dexie schema, repositories, hooks, stores, demo fixtures (see below). |

## Screens

- Wrap every screen in `<Screen title=… variant="root" | "pushed" back={{ to, label }} trailing banner bottomAction>`.
  Root = tab roots (large `display` title that collapses on scroll). Pushed = back button + centred title.
  The page's `h1` comes from the app bar; use `h2` (`SectionLabel`) inside.
- **One primary (optic) button per screen or sheet** (DESIGN §1, §8.3). Put a long screen's primary in
  `bottomAction`. Labels 1 to 3 words, verbs, sentence case, one label per intent ("Record re-test").
- Full-screen flows (camera, tagging, drill player, serve detail) set `tabBar: false` in `routes.ts`.
  Camera screens wrap their root in `<CourtSide>` (sun-readable tokens, 2 px edges, 28 px icons).
- Every screen needs its empty, loading (`<DelayedSkeleton>`: nothing for 150 ms, then static blocks, no
  shimmer, no spinners), error (inline, plain sentence + one action) and deleted-video states.
- Demo data on screen means `<SampleBanner />` in `banner` (PRODUCT §4.4 rule 11). Demo sessions never
  enter Progress, experiments or exports (`listByMode` excludes them by default).

## Tokens and styling

- Only token utilities: `bg-bg bg-surface bg-surface-2 text-ink text-ink-2 text-ink-3 border-line
  border-line-strong bg-optic text-on-optic border-optic-edge text-good text-bad text-attention
  text-critical …`. Tailwind's default palette, radii, shadows and type scale are removed, so a raw
  colour class will not compile to anything. **No raw hex in components** (the video overlay palette is
  the only exception, as `var(--overlay-*)`).
- Type: `text-display text-title-1 text-title-2 text-headline text-body text-callout text-subhead
  text-footnote text-caption text-metric text-metric-hero text-cue text-timer` (size, line height and
  weight in one class; rem, so Dynamic Type works). `font-wide` for values, `tabular-nums` for columns,
  counters and n lines, `font-label` (600) / `font-strong` (700), both +100 in Court-side.
- Radii: `rounded-control` (14) controls, `rounded-card` (20) containers, `rounded-sheet` (28),
  `rounded-media` (10) thumbnails, `rounded-full` chips. No others.
- Spacing is px (`--spacing: 4px`, so `p-4` = 16 px). Gutter: `gutter` utility (20 px, 16 px under 360 px,
  safe-area aware). Level-1 card: `card` utility or `<Card>`. Level-2 chrome: `glass`.
- Variants: `court:` (Court-side subtree), `dark:` (rarely needed: tokens already switch). Borders that
  must be 2 px in Court-side use `border-token`.
- Motion: `transition-[transform,opacity] duration-(--dur-fast) ease-standard motion-reduce:transition-none`;
  `motion/react` with `useReducedMotion()` (Sheet and the shell show the pattern). Transform and opacity only.
- Icons: Phosphor `…Icon` names, regular weight only (set once by `ThemeProvider`), `aria-hidden="true"`
  when decorative; icon-only buttons use `<IconButton label=…>`. The serve marks (●▲✕) are `<OutcomeMark>`
  data drawings, not icons.
- Hit areas: every tappable element ≥ 44 × 44 (chips and segments extend theirs with an `::after` box).

## Honesty rules (non-negotiable; D2, D7, DESIGN §3)

1. **Never render a metric number yourself.** Use `<MetricValue metricId value>` (inline, `size="metric"`,
   `size="hero"`) or `<MetricTile>`. They format, prefix "≈" for estimates, write experimental values as
   "about X to Y" ranges, replace unavailable values with the reason, and render the `StatusChip`.
   `MetricValue` throws in development if `status` is missing. Tests assert every `[data-metric]` has a
   `data-status`.
2. Every number shows its data state (Measured, Estimate, You logged, Experimental, Not available) as
   glyph + word + container, never colour alone. The compact chip is only for dense tables with a legend.
3. **n on every rate and spread** ("12 of 14 serves"). Rates under 10 serves show counts only.
   Provisional values show "Early read" (automatic from `value.provisional`) and never go in a headline.
4. **Unavailable is a normal outcome**: `<UnavailableRow metricId reasonCode to>` ghost rows with the
   reason ("Needs a view from behind", "Needs 120 fps", "Tag your target"), never a dash or a guess.
5. **Views never mix (D1).** Side-view screens never show `knee-bend-band`,
   `shoulder-over-shoulder-contact` or `speed-average-rear` except as "Needs a view from behind" ghost
   rows; `trunk-tilt-band` no longer exists. No degrees on bands, no comparison with published trunk
   angles, and legs are described, never demanded (no "bend more", "jump higher", "little bend").
6. **Experimental stays out of the story**: only shown when `useSettingsStore(s => s.experimentalMetrics)`
   is on, in its own "Experimental" group, never in headlines, focus, verdicts or Progress. Speed is
   always a range that names its quantity; spin is always unavailable.
7. Verdicts use `<VerdictChip>` words (Clearly better … Not comparable yet); no arrows, no red/green deltas.
8. Copy: Australian English, sentence case, no em or en dashes (write ranges with "to"), no exclamation
   marks, no emoji, second person, calm. `ui/copy/lint.ts` checks rendered text in tests.

## Data layer (`src/data`)

- Types: engine and domain types in `data/domain.ts` (re-exports `analysis/types.ts`), stored records in
  `data/records.ts`. `MetricId`, `ReasonCode`, `METRIC_IDS`, `REAR_ONLY_METRIC_IDS` live in `analysis/types.ts`.
- Read with hooks from `data/hooks.ts` (`useSessions`, `useSession`, `useSessionStats`, `useServes`,
  `useTags`, `useProfile`, `useLatestDecision`, `useActiveExperiment`, `useSetting`…). They return
  `undefined` while loading and re-render on writes.
- Write with repository functions from `data/index.ts` (`createSession`, `setTag`, `logPractice`,
  `saveProfile`, `setSetting`, `setVideoRetention`…), delete with `deleteServe` / `deleteSession` /
  `deleteVideo` / `deleteAllVideos` / `deleteEverything` (UI owns confirmations and the 8 s Undo), export
  with `buildExportJSON` / `buildExportCSV`. **UI never touches `getDb()` directly.**
- UI state: `useSettingsStore` (theme, Court-side, experimental toggle; persisted), `useUiStore`
  (filters, running job), `useToastStore` / `showToast(message, action?)`.
- Sample data: `loadDemoData()` loads the **engine-built seed** in `public/demo/` (`data/sample.ts`): three
  sessions of the synthetic player analysed by the real pipeline, with the real coaching decisions, an
  experiment and its "Did it work?" verdict (built by `node scripts/build-demo.mjs`), and returns the
  session id to open; `removeDemoData()` deletes it. Every row is `isDemo: 1`. `DEMO_FIXTURES`
  (hand-authored, not engine output) remain for tests and development only: a production build never
  falls back to them.
- Coaching loop: `integration/coachingSync.ts` `syncCoaching()` stores the session's decision (same input
  as /focus, `ui/screens/focus/focusInput.ts`), links a re-test to the active experiment and stores its
  verdict (`integration/verdict.ts`: METRICS §4.5 through `analysis/stats`). It runs after an analysis and
  after tag, include/exclude and practice-log changes (`integration/schedule.ts`, debounced).
- Schema changes: add a version in `data/db.ts` (additive only) and a test in `data/migrations.test.ts`.

## Checks before you call a screen done

`npm run typecheck && npm test && npm run lint && npm run build`, then
`npx vite preview --port 4173 --strictPort` and `node scripts/ui-screenshots.mjs` (headless Edge,
390 × 844, Day and Night; console, overflow, tap-target and font checks; add your screen to `SCREENS`).
Look at the screenshots, run the DESIGN §14 pre-flight, and `playwright-cli close-all` at the end.
