/**
 * Tagging state (DESIGN §8.14, §10.8; PRODUCT §6.7, §7.3): the current serve, the sticky serve
 * attributes ("Applies to the rest of this block"), point-play serve numbering and a one-step-at-a-time
 * undo. Pure: the screen persists each step with the data layer (tags are player-entered, D3).
 */
import type { ServeNumber, ServeOutcome, ServeSide, ServeType, TargetZone } from '../../../analysis/types.ts'
import type { ServeTagRecord, SessionRecord } from '../../../data/records.ts'

export type TagOutcome = Extract<ServeOutcome, 'in' | 'net' | 'long' | 'wide' | 'let'>

export interface TagAttrs {
  serveNumber: ServeNumber
  side: ServeSide
  intendedType?: ServeType
  targetZone?: TargetZone
}

export interface UndoEntry {
  serveId: string
  /** The tag before this step (null = there was none). */
  previous: ServeTagRecord | null
  index: number
  attrs: TagAttrs
}

export interface TaggingState {
  index: number
  attrs: TagAttrs
  pointPlay: boolean
  undo: UndoEntry[]
  /** Set after the last serve is tagged or skipped. */
  finished: boolean
}

export function initialTagging(session: Pick<SessionRecord, 'defaultServeNumber' | 'defaultSide' | 'defaultIntendedType' | 'defaultTarget' | 'template'>, startIndex = 0): TaggingState {
  return {
    index: startIndex,
    attrs: {
      serveNumber: session.defaultServeNumber ?? 1,
      side: session.defaultSide ?? 'deuce',
      ...(session.defaultIntendedType ? { intendedType: session.defaultIntendedType } : {}),
      ...(session.defaultTarget ? { targetZone: session.defaultTarget } : {}),
    },
    pointPlay: session.template === 'second-serve-check-in',
    undo: [],
    finished: false,
  }
}

/** The index of the first untagged serve (where tagging resumes), or 0. */
export function resumeIndex(serveIds: readonly string[], tags: readonly ServeTagRecord[]): number {
  const tagged = new Set(tags.filter((t) => t.outcome && t.outcome !== 'unknown').map((t) => t.serveId))
  const i = serveIds.findIndex((id) => !tagged.has(id))
  return i < 0 ? 0 : i
}

/** Point-play numbering (METRICS §3.19): a first-serve fault makes the next a second serve; otherwise back to first. */
export function nextServeNumber(current: ServeNumber, outcome: TagOutcome): ServeNumber {
  if (outcome === 'let') return current
  if (current === 1 && outcome !== 'in') return 2
  return 1
}

/** The tag patch one outcome writes (every field player-entered). */
export function tagPatch(outcome: TagOutcome, attrs: TagAttrs): Omit<ServeTagRecord, 'serveId' | 'sessionId' | 'taggedAt'> {
  return {
    outcome,
    outcomeSource: 'player',
    serveNumber: attrs.serveNumber,
    side: attrs.side,
    ...(attrs.intendedType ? { intendedType: attrs.intendedType } : {}),
    ...(attrs.targetZone ? { targetZone: attrs.targetZone } : {}),
    via: 'review',
  }
}

/** After tagging serve `state.index`: record undo, advance, and apply point-play numbering. */
export function afterTag(state: TaggingState, serveIds: readonly string[], outcome: TagOutcome, previous: ServeTagRecord | null): TaggingState {
  const entry: UndoEntry = { serveId: serveIds[state.index], previous, index: state.index, attrs: state.attrs }
  const last = state.index >= serveIds.length - 1
  const attrs = state.pointPlay ? { ...state.attrs, serveNumber: nextServeNumber(state.attrs.serveNumber, outcome) } : state.attrs
  return { ...state, attrs, undo: [...state.undo, entry], index: last ? state.index : state.index + 1, finished: last }
}

export function afterSkip(state: TaggingState, serveCount: number): TaggingState {
  const last = state.index >= serveCount - 1
  return { ...state, index: last ? state.index : state.index + 1, finished: last }
}

/** Undo steps back one serve and restores its attributes; the screen restores the stored tag. */
export function afterUndo(state: TaggingState): { state: TaggingState; entry: UndoEntry | null } {
  const entry = state.undo[state.undo.length - 1] ?? null
  if (!entry) return { state, entry: null }
  return { state: { ...state, index: entry.index, attrs: entry.attrs, undo: state.undo.slice(0, -1), finished: false }, entry }
}

export function goTo(state: TaggingState, index: number, serveCount: number): TaggingState {
  return { ...state, index: Math.max(0, Math.min(serveCount - 1, index)), finished: false }
}

export interface TagCounts {
  total: number
  tagged: number
  in: number
  net: number
  long: number
  wide: number
  let: number
  notSure: number
}

export function countTags(serveIds: readonly string[], tags: readonly ServeTagRecord[]): TagCounts {
  const by = new Map(tags.map((t) => [t.serveId, t]))
  const c: TagCounts = { total: serveIds.length, tagged: 0, in: 0, net: 0, long: 0, wide: 0, let: 0, notSure: 0 }
  for (const id of serveIds) {
    const o = by.get(id)?.outcome
    if (!o) continue
    if (o === 'unknown') c.notSure++
    else {
      c.tagged++
      c[o]++
    }
  }
  return c
}

/** "3 net, 3 long, 1 wide" (zero counts left out). */
export function faultWords(c: Pick<TagCounts, 'net' | 'long' | 'wide'>): string {
  return (['net', 'long', 'wide'] as const)
    .filter((k) => c[k] > 0)
    .map((k) => `${c[k]} ${k}`)
    .join(', ')
}

/** Spoken confirmation after a tag (DESIGN §8.14): "Serve 7: in. Serve 8 of 15." */
export function announce(index: number, outcome: TagOutcome, total: number, finished: boolean): string {
  const word = outcome === 'let' ? 'let' : outcome
  return finished ? `Serve ${index + 1}: ${word}. All ${total} serves done.` : `Serve ${index + 1}: ${word}. Serve ${index + 2} of ${total}.`
}

/** Tally consistency (PRODUCT §6.7): the difference between tagged ins and the tally, if both exist. */
export function tallyConflict(counts: TagCounts, tallyIn: number | undefined): { tags: number; tally: number } | null {
  if (tallyIn === undefined || counts.tagged === 0) return null
  return counts.in === tallyIn ? null : { tags: counts.in, tally: tallyIn }
}
