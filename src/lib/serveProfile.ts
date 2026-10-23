/**
 * How you serve (L3.12): one trip's serve described rather than graded.
 *
 * Every other block on the progress screen judges: a score, a band, a fault.
 * This one describes — the trip's median reading on each row, said as the body
 * position it is (`readoutOf`) and nothing more. No colour, no status, no
 * target: two players can serve well in different ways, and a profile is the
 * one place the app says what a serve is like without saying whether it is
 * right.
 *
 * Only readings the card stood behind count (`SOFT_MEASUREMENT`), and a row
 * needs half the trip's serves to have one, so a reading seen once is not the
 * player's style.
 */
import { readoutOf } from './analysis/anatomy'
import { SOFT_MEASUREMENT } from './analysis/softness'
import type { Session } from './storage/db'

/** The rows a profile describes, in the order a serve happens. */
export const PROFILE_ROWS = [
  'tossPeakHeight',
  'releaseHeight',
  'tossArmHold',
  'kneeBend',
  'legDrive',
  'dropDepth',
  'handUnderElbow',
  'contactHeight',
  'armExtension',
  'contactAhead',
  'loadRatio',
] as const

export interface ProfileLine {
  id: string
  label: string
  /** The body position, in the readout's words. */
  tag: string
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** One trip's serve, described. Empty when nothing on it could be read. */
export function serveProfile(trip: readonly Session[]): ProfileLine[] {
  const serves = trip.filter((s) => s.triage?.status !== 'rejected')
  const out: ProfileLine[] = []
  for (const id of PROFILE_ROWS) {
    const rows = serves
      .map((s) => s.fundamentals.flatMap((f) => f.metrics).find((m) => m.id === id))
      .filter((m) => m !== undefined && (m.confidence ?? 1) >= SOFT_MEASUREMENT && Number.isFinite(m.value))
    if (!rows.length || rows.length * 2 < serves.length) continue
    const tag = readoutOf(id, median(rows.map((m) => m!.value)))
    if (tag) out.push({ id, label: rows[0]!.label, tag })
  }
  return out
}
