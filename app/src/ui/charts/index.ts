/**
 * Hand-built SVG charts (DESIGN §9, §13.8). Pure SVG + React, no chart library. Charts draw; screens
 * compute (statistics come in as props). Every chart is role="img" with a data summary, and sits in a
 * <ChartFrame> whose "Show as table" view is the full accessible equivalent.
 */
export { ChartFrame, type ChartFrameProps, type ChartTable } from './ChartFrame.tsx'
export { IntervalBars, type IntervalBarsProps, type IntervalRow } from './IntervalBars.tsx'
export { beeswarm, covarianceEllipse, nearestPoint, packUnits, stepSelection, type Ellipse, type Pt } from './layout.ts'
export { BandHatch, CentroidMark, ServeMark, ValuePoint } from './marks.tsx'
export { BAND_CLASS, cssId, OUTCOME_COLOUR } from './markStyle.ts'
export { PlacementMap, type PlacementMapProps, type PlacementOutcome, type PlacementServe } from './PlacementMap.tsx'
export { PlotSurface, type PlotTarget } from './PlotSurface.tsx'
export { useChartWidth } from './useChartWidth.ts'
export { extent, formatTick, linear, niceTicks, padDomain, tickStep, unionDomain, type Domain } from './scale.ts'
export { Sparkline, type SparklineProps, type SparkPoint } from './Sparkline.tsx'
export { StripPlot, type StripDatum, type StripPlotProps, type StripRow } from './StripPlot.tsx'
export { TossScatter, type TossCentroidPair, type TossPoint, type TossScatterProps } from './TossScatter.tsx'
export { WilsonBar, type WilsonBarProps } from './WilsonBar.tsx'
