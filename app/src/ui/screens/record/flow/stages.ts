/**
 * Maps pipeline progress onto the four stage rows the player sees (DESIGN §8.18, ARCHITECTURE §5.8):
 * "Finding serves", "Tracking the toss", "Timing each phase", "Choosing your focus". Pure; tested.
 */
import type { AnalysisProgress } from '../../../../data/domain.ts'
import type { Stage } from '../../../components/index.ts'

export const STAGE_ROWS = [
  { id: 'find', label: 'Finding serves' },
  { id: 'toss', label: 'Tracking the toss' },
  { id: 'time', label: 'Timing each phase' },
  { id: 'focus', label: 'Choosing your focus' },
] as const

/** Overall-progress spans per row, from the ARCHITECTURE §5.8 stage weights (probe + audio + Pass A = 32%, Pass B 60%, finishing 8%). */
const SPANS: [number, number][] = [
  [0, 0.32],
  [0.32, 0.92],
  [0.92, 0.96],
  [0.96, 1],
]

/** Which row is active: the label names it when it can, otherwise the engine stage does. */
export function activeRow(p: Pick<AnalysisProgress, 'stage' | 'label'>): number {
  const label = p.label.toLowerCase()
  for (let i = STAGE_ROWS.length - 1; i >= 0; i--) if (label.startsWith(STAGE_ROWS[i].label.toLowerCase())) return i
  switch (p.stage) {
    case 'probe':
    case 'audio':
    case 'sparse':
      return 0
    case 'dense':
      return 1
    case 'keyframes':
      return 2
    case 'session':
      return 3
    case 'done':
      return 4
  }
  return 0
}

/** "9 found", "serve 3 of 9": the part of the label in brackets, else built from the counts. */
export function rowDetail(p: AnalysisProgress, row: number): string | undefined {
  const bracket = /\(([^)]+)\)/.exec(p.label)?.[1]
  if (bracket) return bracket
  if (row === 0 && p.servesFound !== undefined) return `${p.servesFound} found`
  if (row === 1 && p.servesFound) return `serve ${Math.min(p.servesFound, (p.servesDone ?? 0) + 1)} of ${p.servesFound}`
  return undefined
}

export function stagesFor(p: AnalysisProgress | null, state: 'running' | 'paused' | 'failed' | 'done' = 'running'): Stage[] {
  const active = p ? activeRow(p) : 0
  return STAGE_ROWS.map((row, i) => {
    if (state === 'done' || i < active) {
      const detail = i === 0 && p?.servesFound !== undefined ? `${p.servesFound} found` : undefined
      return { id: row.id, label: row.label, state: 'done', detail }
    }
    if (i > active) return { id: row.id, label: row.label, state: 'waiting' }
    const [a, b] = SPANS[i]
    const fraction = p ? Math.min(1, Math.max(0, (p.overall - a) / (b - a))) : 0
    return {
      id: row.id,
      label: row.label,
      state: state === 'paused' ? 'paused' : state === 'failed' ? 'failed' : 'active',
      fraction,
      detail: p ? rowDetail(p, i) : undefined,
    }
  })
}

/**
 * ETA text, only after 5 s of measured throughput (DESIGN §8.18): "About 1 minute left". Uses the
 * engine's own estimate when it gives one.
 */
export function etaText(p: AnalysisProgress | null, startedAtMs: number, nowMs: number): string | undefined {
  if (!p || p.overall >= 1) return undefined
  const elapsed = (nowMs - startedAtMs) / 1000
  let eta = p.etaS
  if (eta === undefined) {
    if (elapsed < 5 || p.overall <= 0.02) return undefined
    eta = (elapsed * (1 - p.overall)) / p.overall
  }
  if (!Number.isFinite(eta) || eta < 0) return undefined
  if (eta < 15) return 'Almost done'
  if (eta < 55) return `About ${Math.max(20, Math.round(eta / 10) * 10)} seconds left`
  const minutes = Math.round(eta / 60)
  return minutes <= 1 ? 'About 1 minute left' : `About ${minutes} minutes left`
}
