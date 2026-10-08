/**
 * Every serve's toss in a basket, against the front foot (D6.3).
 *
 * One axis, not a top-down map, and that is the camera rather than a choice:
 * from the side the picture holds how far in front the toss went and not how
 * far across, and from behind the reverse (`readTossPlacement`). So the map is
 * a strip along whichever axis this clip was filmed for, and says which.
 */
import type { TossPlacement } from './analysis/tossPlacement'
import type { ServeOutcome, ServeTag, Session } from './storage/db'
import { clipIdOf } from './storage/sessionKey'

export interface TossMapPoint {
  /** The serve's number in the basket, from one. */
  serve: number
  /** Body heights from the front ankle along the map's axis. */
  value: number
  outcome?: ServeOutcome
  from: TossPlacement['from']
  /** The serve whose report this is. */
  current: boolean
}

export interface TossMap {
  /** In front of the foot (filmed from the side), or across it (from behind). */
  axis: 'ahead' | 'across'
  points: TossMapPoint[]
}

type Serve = Pick<Session, 'id'> & { diagnosis?: { tossPlacement?: TossPlacement } }

const serveNumber = (id: string): number | undefined => {
  const m = /-(\d+)$/.exec(id)
  return m ? Number(m[1]) + 1 : undefined
}

/**
 * The map for the basket `current` belongs to, or nothing with fewer than two
 * serves read along the same axis. `current` counts even before it is saved.
 */
export function tossMapFor(current: Serve, sessions: readonly Serve[], tags: readonly ServeTag[]): TossMap | undefined {
  const clip = clipIdOf(current.id)
  if (clip === current.id) return undefined
  const axis = current.diagnosis?.tossPlacement?.across !== undefined ? 'across' : 'ahead'
  const basket = [current, ...sessions.filter((s) => s.id !== current.id && clipIdOf(s.id) === clip)]
  const outcome = new Map(tags.map((t) => [t.id, t.outcome]))
  const points: TossMapPoint[] = []
  for (const s of basket) {
    const placed = s.diagnosis?.tossPlacement
    const value = placed?.[axis]
    const serve = serveNumber(s.id)
    if (!placed || value === undefined || serve === undefined) continue
    points.push({ serve, value, outcome: outcome.get(s.id), from: placed.from, current: s.id === current.id })
  }
  points.sort((a, b) => a.serve - b.serve)
  return points.length >= 2 ? { axis, points } : undefined
}
