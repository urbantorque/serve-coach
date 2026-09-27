import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb, resetDbForTests } from './db.ts'
import { deleteEverything } from './deletion.ts'
import {
  clearEvents,
  daysBucket,
  droppedEventCount,
  EVENT_SCHEMAS,
  hasEvent,
  hourBucket,
  lengthBucket,
  listEvents,
  minutesBucket,
  onceHash,
  recordEvent,
  servesBucket,
  validateEvent,
} from './repos/events.ts'
import { sweepRetention } from './retention.ts'

const NOW = new Date('2026-09-28T09:41:27.123Z')

beforeEach(async () => {
  await resetDbForTests()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('event catalogue', () => {
  it('accepts only known names, known props and in-range values', () => {
    expect(validateEvent('drill_started', {})).toBe(true)
    expect(validateEvent('analysis_completed', { serves: '10-14', capture: 'fair', valid: true, source: 'recorded' })).toBe(true)
    expect(validateEvent('usefulness_rated', { rating: 4 })).toBe(true)
    // Unknown event, unknown prop, wrong type, out of range, non-integer.
    expect(validateEvent('page_view', {})).toBe(false)
    expect(validateEvent('drill_started', { itemId: 'toss-height-steady' })).toBe(false)
    expect(validateEvent('analysis_completed', { valid: 'yes' })).toBe(false)
    expect(validateEvent('usefulness_rated', { rating: 6 })).toBe(false)
    expect(validateEvent('usefulness_rated', { rating: 4.5 })).toBe(false)
    expect(validateEvent('analysis_completed', { serves: 12 })).toBe(false)
  })

  it('never has a free-text, id, height, UTR, body or referral property', () => {
    const banned = /note|text|name|height|utr|region|area|level|answer|pain|body|location|device/i
    for (const props of Object.values(EVENT_SCHEMAS)) {
      for (const key of Object.keys(props)) {
        expect(key).not.toMatch(banned)
        expect(key).not.toMatch(/^id$|Id$/)
      }
      // Every rule is an enum, a yes/no or a small integer range: never an open string.
      for (const rule of Object.values(props) as unknown[]) {
        expect(Array.isArray(rule) || rule === 'bool' || (typeof rule === 'object' && rule !== null && 'int' in rule)).toBe(true)
      }
    }
    // No pain, referral or body-check event at all, not even a count (PRODUCT §9.4).
    expect(Object.keys(EVENT_SCHEMAS).filter((n) => /pain|referral|body|comfort|sore/i.test(n))).toEqual([])
  })

  it('buckets values instead of storing them', () => {
    expect([0, 3, 9, 10, 14, 15, 30].map(servesBucket)).toEqual(['0', '1-4', '5-9', '10-14', '10-14', '15-24', '25+'])
    expect([2, 8, 12, 20, 45].map(minutesBucket)).toEqual(['0-4', '5-9', '10-14', '15-29', '30+'])
    expect([0, 7, 8, 14, 15, 40].map(daysBucket)).toEqual(['0-7', '0-7', '8-14', '8-14', '15-28', '29+'])
    expect([30, 90, 400, 900].map(lengthBucket)).toEqual(['under-1-min', '1-4-min', '5-9-min', '10-min-plus'])
    expect(hourBucket(NOW)).toBe('2026-09-28T09:00:00.000Z')
  })

  it('hashes once-keys so no record id is stored', () => {
    expect(onceHash('verdict_viewed:01J9ZX')).toMatch(/^[0-9a-f]{8}$/)
    expect(onceHash('a')).not.toBe(onceHash('b'))
  })
})

describe('recordEvent', () => {
  it('stores the event with the time rounded to the hour', async () => {
    expect(await recordEvent('focus_opened', {}, { now: NOW })).toBe(true)
    const [row] = await listEvents()
    expect(row).toMatchObject({ name: 'focus_opened', at: '2026-09-28T09:00:00.000Z', props: {} })
  })

  it('drops and counts an invalid event without throwing', async () => {
    const before = droppedEventCount()
    // @ts-expect-error: not in the catalogue
    expect(await recordEvent('free_text', { text: 'my shoulder hurts' })).toBe(false)
    expect(await recordEvent('practice_logged', { note: 'sore' })).toBe(false)
    expect(droppedEventCount()).toBe(before + 2)
    expect(await listEvents()).toHaveLength(0)
  })

  it('records a once-keyed event only once', async () => {
    expect(await recordEvent('verdict_viewed', { verdict: 'likely-better' }, { once: 'exp-1:likely-better' })).toBe(true)
    expect(await recordEvent('verdict_viewed', { verdict: 'likely-better' }, { once: 'exp-1:likely-better' })).toBe(false)
    expect(await recordEvent('verdict_viewed', { verdict: 'likely-better' }, { once: 'exp-2:likely-better' })).toBe(true)
    expect(await hasEvent('verdict_viewed', 'exp-1:likely-better')).toBe(true)
    expect(await hasEvent('verdict_viewed', 'exp-3:likely-better')).toBe(false)
    const rows = await listEvents()
    expect(rows).toHaveLength(2)
    expect(JSON.stringify(rows)).not.toContain('exp-1')
  })

  it('never throws when storage fails', async () => {
    getDb().close()
    await expect(recordEvent('drill_started')).resolves.toBe(false)
  })
})

describe('deleting and sweeping events', () => {
  it('"Delete everything" clears the events and the runtime caches', async () => {
    const deleted: string[] = []
    vi.stubGlobal('caches', {
      keys: async () => ['serve-coach-precache-abc', 'serve-coach-runtime-demo', 'serve-coach-runtime-assets'],
      delete: async (name: string) => {
        deleted.push(name)
        return true
      },
    })
    await recordEvent('drill_started')
    await recordEvent('paywall_viewed', { trigger: 'plan' })
    await deleteEverything()
    expect(await listEvents()).toHaveLength(0)
    // The app shell stays so the app still opens offline.
    expect(deleted.sort()).toEqual(['serve-coach-runtime-assets', 'serve-coach-runtime-demo'])
  })

  it('"Clear usage events" empties the table and logs a count', async () => {
    await recordEvent('drill_started')
    await recordEvent('drill_started')
    expect(await clearEvents()).toBe(2)
    expect(await listEvents()).toHaveLength(0)
    const log = await getDb().deletionLog.toArray()
    expect(log.at(-1)).toMatchObject({ scope: 'events-sweep', counts: { events: 2 } })
  })

  it('keeps events for 180 days', async () => {
    await recordEvent('drill_started', {}, { now: new Date('2026-03-01T10:00:00Z') })
    await recordEvent('drill_started', {}, { now: new Date('2026-09-01T10:00:00Z') })
    const res = await sweepRetention(new Date('2026-09-28T10:00:00Z'))
    expect(res.eventsDeleted).toBe(1)
    expect(await listEvents()).toHaveLength(1)
  })
})
