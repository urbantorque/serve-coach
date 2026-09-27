import { paths } from '../../../shell/paths.ts'

/**
 * Metric info for one metric as seen in one session: the route from `paths.metricInfo` plus a
 * `session` query, so the page describes the value the player tapped rather than the latest one.
 */
export function metricInfoFor(metricId: string, sessionId?: string): string {
  const base = paths.metricInfo(metricId)
  return sessionId ? `${base}?session=${encodeURIComponent(sessionId)}` : base
}
