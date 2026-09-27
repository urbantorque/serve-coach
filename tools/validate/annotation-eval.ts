/**
 * Pooled real-footage validation (docs/VALIDATION_PROTOCOL.md §9; METRICS §5.6): reads
 * `serve-coach-validation@1` files exported from "Check this serve" (Serve detail, More actions),
 * computes agreement between annotators, then between the app and the marks (Bland–Altman bias and
 * limits of agreement with the repeated-measures variant, MAE with a player-cluster bootstrap,
 * ICC(2,1) with its interval, interval coverage, event-timing error distributions, radar against the
 * experimental speed range), and writes a markdown report plus a JSON copy of the numbers.
 *
 * The statistics live in app/src/validation/annotation (unit-tested with the app). Nothing here
 * touches the network. Sample data and marks changed after the comparison was shown are left out
 * unless asked for.
 *
 *   app/node_modules/.bin/tsx tools/validate/annotation-eval.ts <file-or-folder> [...]
 *       [--out DIR]                 default validation/real/<today>/ (METRICS §5.7)
 *       [--participants FILE]       consent-sheet demographics by subject key (.json or .csv)
 *       [--metrics FILE]            default docs/specs/metrics.json (current levels, timing ids)
 *       [--include-sample] [--include-unblinded]
 *
 * Test: app/node_modules/.bin/tsx --test tools/validate/annotation-eval.test.ts
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { evaluate, renderReport, type Catalogue, type EvalResult, type Participant } from '../../app/src/validation/annotation/evaluate.ts'
import { isValidationExport, type ValidationExport } from '../../app/src/validation/annotation/export.ts'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

export interface RunOptions {
  inputs: string[]
  outDir?: string
  participantsPath?: string
  metricsPath?: string
  includeSample?: boolean
  includeUnblinded?: boolean
  now?: Date
}

export interface RunResult {
  reportPath: string
  jsonPath: string
  files: string[]
  skipped: { path: string; reason: string }[]
  result: EvalResult
}

const localDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function parseArgs(argv: readonly string[]): RunOptions {
  const opts: RunOptions = { inputs: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const value = () => {
      const v = argv[++i]
      if (v === undefined) throw new Error(`${a} needs a value`)
      return v
    }
    if (a === '--out') opts.outDir = value()
    else if (a === '--participants') opts.participantsPath = value()
    else if (a === '--metrics') opts.metricsPath = value()
    else if (a === '--include-sample') opts.includeSample = true
    else if (a === '--include-unblinded') opts.includeUnblinded = true
    else if (a.startsWith('--')) throw new Error(`Unknown option ${a}`)
    else opts.inputs.push(a)
  }
  return opts
}

/** Every .json file under the given files and folders (folders are searched recursively). */
function jsonFiles(inputs: readonly string[]): string[] {
  const out: string[] = []
  const walk = (p: string) => {
    const st = statSync(p)
    if (st.isDirectory()) for (const name of readdirSync(p).sort()) walk(join(p, name))
    else if (p.toLowerCase().endsWith('.json')) out.push(p)
  }
  for (const i of inputs) walk(resolve(i))
  return out
}

/** Participants: JSON `{ key: { sex, ageBand, utrBand } }` or CSV with a `subjectKey` column. */
export function readParticipants(path: string): Record<string, Participant> {
  const text = readFileSync(path, 'utf8').replace(/^﻿/, '')
  if (path.toLowerCase().endsWith('.json')) return JSON.parse(text) as Record<string, Participant>
  const [head, ...lines] = text.split(/\r?\n/).filter((l) => l.trim())
  const cols = head.split(',').map((c) => c.trim())
  const key = cols.indexOf('subjectKey')
  if (key < 0) throw new Error(`${path}: needs a subjectKey column`)
  const out: Record<string, Participant> = {}
  for (const line of lines) {
    const cells = line.split(',').map((c) => c.trim())
    const row: Record<string, string> = {}
    cols.forEach((c, i) => (row[c] = cells[i] ?? ''))
    out[cells[key]] = { sex: row.sex || undefined, ageBand: row.ageBand || undefined, utrBand: row.utrBand || undefined }
  }
  return out
}

export function run(opts: RunOptions): RunResult {
  if (!opts.inputs.length) throw new Error('Give at least one export file or folder.')
  const now = opts.now ?? new Date()
  const files: string[] = []
  const skipped: RunResult['skipped'] = []
  const exports: ValidationExport[] = []
  for (const path of jsonFiles(opts.inputs)) {
    let parsed: unknown
    try {
      parsed = JSON.parse(readFileSync(path, 'utf8'))
    } catch {
      skipped.push({ path, reason: 'not valid JSON' })
      continue
    }
    if (!isValidationExport(parsed)) {
      skipped.push({ path, reason: 'not a serve-coach-validation@1 file' })
      continue
    }
    exports.push(parsed)
    files.push(path)
  }
  const metricsPath = opts.metricsPath ?? join(repoRoot, 'docs/specs/metrics.json')
  const catalogue = existsSync(metricsPath) ? (JSON.parse(readFileSync(metricsPath, 'utf8')) as Catalogue) : undefined
  const result = evaluate(exports, {
    includeSample: opts.includeSample,
    includeUnblinded: opts.includeUnblinded,
    participants: opts.participantsPath ? readParticipants(opts.participantsPath) : undefined,
    catalogue,
  })
  const outDir = resolve(opts.outDir ?? join(repoRoot, 'validation/real', localDate(now)))
  mkdirSync(outDir, { recursive: true })
  const shown = files.map((f) => relative(repoRoot, f).replace(/\\/g, '/'))
  const reportPath = join(outDir, 'annotation-report.md')
  const jsonPath = join(outDir, 'annotation-report.json')
  writeFileSync(reportPath, renderReport(result, { generatedAt: localDate(now), files: shown }))
  writeFileSync(jsonPath, JSON.stringify({ generatedAt: now.toISOString(), files: shown, skipped, result }, null, 2))
  return { reportPath, jsonPath, files, skipped, result }
}

function main() {
  try {
    const r = run(parseArgs(process.argv.slice(2)))
    const i = r.result.inputs
    console.log(`Read ${r.files.length} export file(s): ${i.servesUsed} serves, ${i.players} players, ${i.annotators} annotators.`)
    for (const s of r.skipped) console.log(`Skipped ${s.path}: ${s.reason}`)
    console.log(`Report: ${r.reportPath}`)
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main()
