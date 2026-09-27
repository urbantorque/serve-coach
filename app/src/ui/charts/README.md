# Charts (DESIGN §9, §13.8)

Hand-built SVG + React, no chart library and no new dependencies. **Charts draw; screens compute**:
intervals, verdicts, usual ranges and "N more serves" arrive as props (see
`ui/screens/progress/insights/`), so every chart stays a pure function of its data.

| Component | DESIGN | Use |
| --- | --- | --- |
| `ChartFrame` | §9.1 | `<figure>` with a takeaway title, data-state chip, subtitle, direction hint, the plot or an "insufficient data" line, and a "Show as table" toggle (the accessible equivalent). |
| `PlotSurface` | §9.1 | Shared SVG surface: `role="img"` + `aria-label` data summary, 24 px nearest-point tap layer, keyboard selection (Tab, arrows, Enter, Escape), value-first callout pill, polite live region, Court-side band hatch. |
| `Sparkline` | §9.2 | Progress tiles (318 × 72) and Metric info (`variant="detail"`, 318 × 180 with gradient intervals). Grey "usual" band, latest point in `--good` with a direct label. |
| `StripPlot` | §9.3, §9.5 | Per-serve dots in the outcome vocabulary, beeswarmed, median tick, usual band. |
| `TossScatter` | §9.4 | Toss map: forward vs height at equal scale, front-toe line, usual-area ellipse, centroid "+", optional in/fault centroid pair. |
| `PlacementMap` | §9.6 | Service-box schematic of player-logged zones (side view). |
| `IntervalBars` | §9.7 | Before / after with CI80/CI95 gradient bars, "About the same" zone, per-serve dots or unit marks. |
| `WilsonBar` | §9.8 | Inline 137 × 12 rate interval for tiles (n ≥ 10 only). |

Marks follow the outcome vocabulary in `marks.tsx` (● in, ▲ net, ✕ long / wide / fault, small ● untagged),
each with a 2 px surface ring. Colours are tokens only (`--good`, `--bad`, `--neutral`, `--band`, `--ink-*`),
so Day, Night and Court-side all work; dashed strokes are reserved for experimental marks.
