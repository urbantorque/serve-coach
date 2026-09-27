/** Key-frame strip model (DESIGN §8.9): events in time order and which one the playhead is on. */
import type { KeyFrameEvent, ServeEvents } from '../../../analysis/types.ts'

export const EVENT_KEY: Record<KeyFrameEvent, keyof ServeEvents> = {
  setup: 'setupStart',
  release: 'tossRelease',
  apex: 'tossApex',
  trophy: 'trophy',
  lowestHip: 'lowestHip',
  contact: 'contact',
  landing: 'landing',
  recovery: 'recoveryEnd',
}

const CORE: KeyFrameEvent[] = ['release', 'apex', 'trophy', 'lowestHip', 'contact', 'landing']

export interface StripItem {
  event: KeyFrameEvent
  frame: number | null
  /** Found with confidence ≥ 0.5. */
  clear: boolean
}

/** Strip items in time order: the six core events, plus Setup and Recovery when detected. */
export function stripItems(events: ServeEvents): StripItem[] {
  const list: KeyFrameEvent[] = [...(events.setupStart ? (['setup'] as const) : []), ...CORE, ...(events.recoveryEnd ? (['recovery'] as const) : [])]
  return list.map((event) => {
    const e = events[EVENT_KEY[event]]
    return { event, frame: e ? e.frameIndex : null, clear: Boolean(e && e.confidence >= 0.5) }
  })
}

/** The item the playhead is on or has most recently passed. */
export function currentItem(items: StripItem[], frame: number): KeyFrameEvent | null {
  let found: KeyFrameEvent | null = null
  for (const it of items) if (it.clear && it.frame !== null && it.frame <= frame) found = it.event
  return found
}
