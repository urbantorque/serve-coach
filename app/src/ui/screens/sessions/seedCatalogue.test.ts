// Finding 49: the published sample seed must never claim more than the CURRENT catalogue allows.
// The seed stores engine output; when a metric's validation level drops (toss-apex-height V1 -> V0,
// finding 41) without a rebuild, the sample shows "Estimate" for an experimental metric. Version
// strings alone (data/sample.test.ts) do not catch that, so this walks every stored metric: session,
// stratum and per-serve values alike. Fix a failure by rebuilding: `node app/scripts/build-demo.mjs`.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { METRIC_UNITS, statusCeiling, validationLevel, type ConditionClass } from '../../../analysis/metrics/catalogue.ts'
import type { MetricId, MetricStatus, MetricValue } from '../../../analysis/types.ts'

const seedPath = join(process.cwd(), 'public/demo/seed@1.json')
const STATUS_RANK: Record<MetricStatus, number> = { unavailable: 0, experimental: 1, estimated: 2, measured: 3, 'player-entered': 4 }
const LEVEL_RANK: Record<string, number> = { V0: 0, V1: 1, V2: 2, V3: 3 }

function isMetric(v: unknown): v is MetricValue & { id: MetricId } {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return typeof o.id === 'string' && o.id in METRIC_UNITS && typeof o.status === 'string' && 'value' in o
}

/** Every stored metric value in the seed, with where it sits. */
function walk(node: unknown, path: string, out: { path: string; m: MetricValue }[]): void {
  if (Array.isArray(node)) {
    node.forEach((x, i) => walk(x, `${path}[${i}]`, out))
    return
  }
  if (!node || typeof node !== 'object') return
  if (isMetric(node)) out.push({ path, m: node })
  for (const [k, v] of Object.entries(node)) if (v && typeof v === 'object') walk(v, `${path}.${k}`, out)
}

describe.skipIf(!existsSync(seedPath))('sample seed against the current catalogue (finding 49)', () => {
  const seed = JSON.parse(readFileSync(seedPath, 'utf8')) as { sessions: { session: { id: string; conditionClass?: ConditionClass } }[] }

  it('no stored status or validation level is higher than the catalogue now allows (rebuild with scripts/build-demo.mjs)', () => {
    const found: { path: string; m: MetricValue }[] = []
    seed.sessions.forEach((s, i) => walk(s, `sessions[${i}](${s.session.id})`, found))
    expect(found.length).toBeGreaterThan(100)
    const stale = found.flatMap(({ path, m }) => {
      if (m.status === 'unavailable') return []
      const condition: ConditionClass = m.conditionClass ?? 'day'
      const ceiling = statusCeiling(m.id as MetricId, condition)
      const level = validationLevel(m.id as MetricId, condition)
      const tooHigh = STATUS_RANK[m.status] > STATUS_RANK[ceiling.status]
      const levelTooHigh = m.validationLevel !== undefined && LEVEL_RANK[m.validationLevel] > LEVEL_RANK[level]
      return tooHigh || levelTooHigh ? [`${path} ${m.id}: stored ${m.status}/${m.validationLevel ?? '-'}, catalogue allows ${ceiling.status}/${level}`] : []
    })
    expect(stale.slice(0, 10), `${stale.length} stale values`).toEqual([])
  })
})
