// Builds the two data files the Metric info screen reads (the app cannot import from ../docs or
// ../validation at runtime: Vite's dev server only serves the app package):
//   data/catalogue.json   the player-facing subset of docs/specs/metrics.json
//   data/validation.json  building-block numbers from validation/results/smoke/*.json
// Run from app/:  node src/ui/screens/metric/tools/build-metric-data.mjs
// metricData.test.ts re-derives both and fails when they drift from their sources.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '../../../../../..')

export function catalogueFrom(metricsJson) {
  const pick = (m) => ({
    id: m.id,
    name: m.name,
    question: m.question,
    unit: m.unit,
    kind: m.kind,
    views: m.views ?? [],
    statusDefault: m.statusDefault,
    validationLevel: m.validationLevel?.day ?? 'V0',
    prerequisites: m.prerequisites ?? [],
    reasonCodes: m.reasonCodes ?? [],
    higherIsBetter: m.higherIsBetter ?? null,
    trendOnly: Boolean(m.trendOnly),
    descriptiveOnly: Boolean(m.descriptiveOnly),
    requiredCopy: m.requiredCopy ?? null,
    referenceRange: m.referenceRange
      ? {
          population: m.referenceRange.population,
          unit: m.referenceRange.unit,
          low: m.referenceRange.low ?? null,
          high: m.referenceRange.high ?? null,
          sd: m.referenceRange.sd ?? null,
          mean: m.referenceRange.mean ?? null,
        }
      : null,
    provisionalBands: m.provisionalBands
      ? {
          low: m.provisionalBands.low,
          typical: m.provisionalBands.typical,
          high: m.provisionalBands.high,
          unit: m.provisionalBands.unit,
          labels: m.provisionalBands.labels ?? null,
        }
      : null,
  })
  const reasons = {}
  for (const [code, r] of Object.entries(metricsJson.reasonCodes)) {
    reasons[code] = { meaning: r.meaning ?? null, unlockHint: r.unlockHint ?? null, unlockHintRearOnly: r.unlockHintRearOnly ?? null }
  }
  return { version: metricsJson.version, metrics: metricsJson.metrics.map(pick), reasonCodes: reasons }
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  const n = s.length
  return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null
}
const round = (x, step) => (x === null ? null : Math.round(x / step) * step)

export function validationFrom(clips, generated) {
  const ok = clips.filter((c) => c?.result?.ok && c.result.scores)
  const side = ok.filter((c) => c.result.inputs?.view === 'side')
  const toss = (c) => c.result.scores.ball.passes[c.result.scores.ball.finalPass ?? 0]?.toss
  const speedOf = (c) => c.result.scores.ball.passes[c.result.scores.ball.finalPass ?? 0]?.speed
  const apexCm = side.map((c) => toss(c)?.apexHeight?.errorM).filter((v) => typeof v === 'number').map((v) => Math.abs(v * 100))
  const apexCovered = side.filter((c) => toss(c)?.apexHeight?.covered === true).length
  const release = side.map((c) => toss(c)?.releaseErrorMs).filter((v) => typeof v === 'number').map(Math.abs)
  const release60 = side
    .filter((c) => (c.result.meta?.final?.captureFps ?? 0) >= 50)
    .map((c) => toss(c)?.releaseErrorMs)
    .filter((v) => typeof v === 'number')
    .map(Math.abs)
  const contact = side.map((c) => c.result.scores.audio?.contact?.nearestErrorRealMs).filter((v) => typeof v === 'number').map(Math.abs)
  const pose = side.map((c) => c.result.scores.pose?.raw?.medianErrorBH).filter((v) => typeof v === 'number')
  const ranges = side.map(speedOf).filter((s) => s && s.status === 'experimental')
  const refused = side.map(speedOf).filter((s) => s && s.status === 'unavailable').length
  return {
    source: 'validation/results/smoke (synthetic clips only)',
    generated,
    clips: ok.length,
    sideClips: side.length,
    apexHeight: { n: apexCm.length, medianAbsCm: round(median(apexCm), 0.5), maxAbsCm: round(Math.max(...apexCm), 0.5), inRange: apexCovered },
    release: { n: release.length, medianAbsMs: round(median(release), 1), maxAbsMs: round(Math.max(...release), 1), n60: release60.length, max60Ms: round(Math.max(...release60), 1) },
    contactSound: { n: contact.length, medianAbsMs: round(median(contact), 0.01), maxAbsMs: round(Math.max(...contact), 0.01) },
    pose: { n: pose.length, medianErrorPctHeight: round(median(pose) * 100, 0.1) },
    speed: {
      ranges: ranges.length,
      covered: ranges.filter((s) => s.covered === true).length,
      medianWidthKmh: round(median(ranges.map((s) => s.highKmh - s.lowKmh)), 5),
      refused,
    },
  }
}

export function loadSmoke(dir) {
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'))
  const clips = files.map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')))
  const summary = readFileSync(join(dir, 'SUMMARY.md'), 'utf8')
  const generated = summary.match(/Generated (\S+)/)?.[1] ?? null
  return { clips, generated }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const metrics = JSON.parse(readFileSync(join(root, 'docs/specs/metrics.json'), 'utf8'))
  writeFileSync(join(here, '../data/catalogue.json'), JSON.stringify(catalogueFrom(metrics), null, 1) + '\n')
  const { clips, generated } = loadSmoke(join(root, 'validation/results/smoke'))
  writeFileSync(join(here, '../data/validation.json'), JSON.stringify(validationFrom(clips, generated), null, 1) + '\n')
  console.log('wrote catalogue.json and validation.json')
}
