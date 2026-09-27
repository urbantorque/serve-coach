import type { MetricId } from '../../analysis/types.ts'

/**
 * Player-facing metric names. They come from docs/specs/metrics.json (`metrics[].name`), never from
 * DESIGN.md; `strings.test.ts` fails if this copy drifts from the catalogue. Replace with the
 * generated catalogue once scripts/sync-specs.mjs exists (ARCHITECTURE §3).
 */
export const METRIC_NAMES: Record<MetricId, string> = {
  'serve-count': 'Serves',
  'retoss-count': 'Re-tosses',
  'toss-apex-height': 'Toss height',
  'toss-forward': 'Toss in front',
  'toss-lateral': 'Toss left-right',
  'toss-drop': 'Ball drop before contact',
  'toss-height-spread': 'Toss height consistency',
  'toss-forward-spread': 'Toss front-back consistency',
  'toss-lateral-spread': 'Toss side-to-side consistency',
  'contact-height-ratio': 'Contact height',
  'contact-height-spread': 'Contact height consistency',
  'contact-forward': 'Contact in front',
  'rhythm-release-to-contact': 'Toss-to-hit time',
  'rhythm-spread': 'Rhythm consistency',
  'trophy-pause': 'Pause at the top',
  'leg-drive': 'Leg drive (hip rise)',
  'drive-time': 'Drive time',
  'loading-depth': 'Loading (hip dip)',
  'deep-bend-flag': 'Deep bend (experimental)',
  'shoulder-tilt-trophy': 'Shoulder tilt at the top',
  'knee-bend-band': 'Knee bend',
  'shoulder-over-shoulder-contact': 'Shoulder over shoulder at contact',
  'landing-distance': 'Landing distance',
  repeatability: 'Serve shape repeatability',
  'serve-in-rate': 'Serves in',
  'first-serve-in-rate': 'First serves in',
  'second-serve-in-rate': 'Second serves in',
  'double-faults': 'Double faults',
  'placement-zone': 'Where serves land',
  'serve-type-mix': 'Serve types',
  'speed-experimental': 'Launch speed (experimental)',
  'speed-average-rear': 'Average speed to the bounce (experimental)',
  'speed-radar-entered': 'Radar speed (you logged)',
  spin: 'Spin',
  'capture-quality': 'Capture quality',
  'fatigue-flag': 'Fatigue check',
  'load-flag': 'Serving volume check',
}

export function metricName(id: string): string {
  return (METRIC_NAMES as Record<string, string>)[id] ?? id
}
