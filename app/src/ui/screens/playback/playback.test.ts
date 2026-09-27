import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { MetricValue } from '../../../analysis/types.ts'
import { DEMO_FIXTURES } from '../../../data/fixtures.ts'
import type { ServeTagRecord } from '../../../data/records.ts'
import {
  compareTargets,
  FOCUS_OVERLAY,
  focusInfo,
  groupServeMetrics,
  openingFrame,
  peekMetrics,
  sameCameraSetup,
  videoGoneLine,
  type CompareSessionData,
} from './serveView.ts'
import {
  afterSkip,
  afterTag,
  afterUndo,
  announce,
  countTags,
  faultWords,
  initialTagging,
  nextServeNumber,
  resumeIndex,
  tagPatch,
  tallyConflict,
} from './tagging.ts'
import { stepStill, stillFor } from './useServePlayback.ts'

const s1 = DEMO_FIXTURES.sessions[0]
const serve7 = s1.serves[6]
const mv = (id: string, status: MetricValue['status'], value: number | null = 1): MetricValue => ({ id, value, unit: 'cm', status, confidence: 1, basis: 't' })

describe('focus and opening frame (PRODUCT §6.6)', () => {
  it('opens on the focus event (toss: the peak) with the focus overlay', () => {
    const f = focusInfo(DEMO_FIXTURES.decision)
    expect(f.event).toBe('apex')
    expect(f.overlay).toBe('apex-scatter')
    expect(openingFrame(serve7, f.event)).toBe(serve7.events.tossApex!.frameIndex)
  })
  it('without a decision, or under a gate, opens on contact', () => {
    expect(focusInfo(null).event).toBe('contact')
    expect(focusInfo({ ...DEMO_FIXTURES.decision, gate: 'pain-referral' }).overlay).toBeNull()
    expect(openingFrame(serve7, 'contact')).toBe(serve7.events.contact!.frameIndex)
  })
  it('an unclear focus event falls back to contact, then to the window start', () => {
    const weak = { ...serve7, events: { ...serve7.events, tossApex: { ...serve7.events.tossApex!, confidence: 0.3 } } }
    expect(openingFrame(weak, 'apex')).toBe(serve7.events.contact!.frameIndex)
    expect(openingFrame({ ...weak, events: {} }, 'apex')).toBe(serve7.window.startFrame)
  })
  it('the overlay table matches coaching-library.json (COACHING §8.1 owns the ids)', () => {
    const lib = JSON.parse(readFileSync(resolve(process.cwd(), '../docs/specs/coaching-library.json'), 'utf8')) as {
      id: string
      faultId: string | null
      evidence: { overlay: string }
    }[]
    for (const item of lib) {
      if (item.evidence.overlay === 'none' && !item.faultId) continue
      expect(FOCUS_OVERLAY[item.id], item.id).toBe(item.evidence.overlay)
      if (item.faultId) expect(FOCUS_OVERLAY[item.faultId], item.faultId).toBe(item.evidence.overlay)
    }
  })
})

describe('per-serve values (DESIGN §8.11 item 4)', () => {
  it('groups by phase; experimental only with the toggle; unavailable last with reasons; spin always listed', () => {
    const off = groupServeMetrics(serve7.metrics, 'side', false)
    expect(off.groups.map((g) => g.title)).toEqual(['Toss', 'Loading', 'Drive', 'Contact', 'Landing'])
    expect(off.experimental).toHaveLength(0)
    const allRows = off.groups.flatMap((g) => g.rows)
    expect(allRows.every((r) => r.value.status !== 'experimental' && r.value.status !== 'unavailable')).toBe(true)
    expect(off.unavailable.find((u) => u.id === 'knee-bend-band')?.reasonCode).toBe('NEEDS_REAR_VIEW')
    expect(off.unavailable.find((u) => u.id === 'spin')?.reasonCode).toBe('NOT_MEASURABLE')
    const on = groupServeMetrics(serve7.metrics, 'side', true)
    expect(on.experimental.map((r) => r.id)).toContain('trophy-pause')
  })
  it('a rear-view serve says the side-only values need the side view', () => {
    const rear = groupServeMetrics({ 'leg-drive': mv('leg-drive', 'estimated') }, 'rear', false)
    expect(rear.unavailable.find((u) => u.id === 'leg-drive')?.reasonCode).toBe('NEEDS_SIDE_VIEW')
  })
  it('the peek puts the focus metric first and never shows experimental values', () => {
    const peek = peekMetrics({ ...serve7.metrics, 'toss-forward': mv('toss-forward', 'experimental') }, ['toss-height-spread', 'toss-apex-height'], 3)
    expect(peek[0].id).toBe('toss-apex-height')
    expect(peek.map((r) => r.id)).not.toContain('toss-forward')
    expect(peek).toHaveLength(3)
  })
})

describe('video availability lines', () => {
  it('says why there is no video, in plain words', () => {
    expect(videoGoneLine(s1.video)).toBe('Sample serves have no video. Phases and values are below.')
    const stored = { ...s1.video, role: 'primary' as const, storage: 'idb' as const }
    expect(videoGoneLine(stored)).toBeNull()
    expect(videoGoneLine({ ...stored, storage: 'deleted', deletedReason: 'retention' })).toBe('Video deleted after 30 days. Key frames kept.')
    expect(videoGoneLine({ ...stored, storage: 'deleted', deletedReason: 'after-analysis' })).toBe('Video deleted after analysis. Key frames kept.')
  })
  it('steps between stored key frames when the video is gone', () => {
    const frames = [100, 140, 170]
    expect(stepStill(frames, 120, 1)).toBe(140)
    expect(stepStill(frames, 120, -1)).toBe(100)
    expect(stepStill(frames, 170, 1)).toBe(170)
    const stills = new Map([[100, 'a'], [140, 'b'], [170, 'c']])
    expect(stillFor(frames, stills, 150)).toBe('b')
    expect(stillFor(frames, stills, 10)).toBe('a')
  })
})

describe('compare targets (DESIGN §8.12, COACHING §8.1)', () => {
  const universe: CompareSessionData[] = DEMO_FIXTURES.sessions.map((s) => ({ session: s.session, serves: s.serves, stats: s.stats, tags: s.tags }))
  const s3 = DEMO_FIXTURES.sessions[2]
  it('offers the best serve, the last matched session and the session before the drill; never the same serve', () => {
    const t = compareTargets({ session: s3.session, serve: s3.serves[0], universe, experiment: DEMO_FIXTURES.experiment, usable: () => true })
    const best = t.find((x) => x.kind === 'best')!
    expect(best.serveId).toBeDefined()
    expect(best.serveId).not.toBe(s3.serves[0].id)
    const last = t.find((x) => x.kind === 'last-session')!
    // The view from behind (19 Sep) is never matched with a side-view session (D1).
    expect(last.sessionId).toBe('demo-s1')
    expect(t.find((x) => x.kind === 'before-drill')?.sessionId).toBe('demo-s1')
  })
  it('explains every disabled row', () => {
    const t = compareTargets({ session: s1.session, serve: s1.serves[0], universe, experiment: null, usable: () => false })
    expect(t.every((x) => x.reason)).toBe(true)
    expect(t.find((x) => x.kind === 'last-session')?.reason).toBe('No earlier session from the same side.')
  })
  it('the video ghost needs the same camera set-up', () => {
    expect(sameCameraSetup(s1.session, s1.session)).toBe(true)
    expect(sameCameraSetup(s1.session, DEMO_FIXTURES.sessions[1].session)).toBe(false)
  })
})

describe('tagging state (DESIGN §8.14)', () => {
  const ids = ['a', 'b', 'c']
  const session = { defaultServeNumber: 1 as const, defaultSide: 'ad' as const, defaultTarget: 'T' as const, template: 'outcomes' as const }
  it('starts from the block defaults at the first untagged serve', () => {
    const s = initialTagging(session, resumeIndex(ids, [{ serveId: 'a', sessionId: 'x', outcome: 'in', taggedAt: '', via: 'review' }]))
    expect(s.index).toBe(1)
    expect(s.attrs).toEqual({ serveNumber: 1, side: 'ad', targetZone: 'T' })
    expect(s.pointPlay).toBe(false)
  })
  it('writes a player-entered tag with the sticky attributes', () => {
    expect(tagPatch('net', { serveNumber: 2, side: 'deuce', intendedType: 'kick' })).toEqual({
      outcome: 'net',
      outcomeSource: 'player',
      serveNumber: 2,
      side: 'deuce',
      intendedType: 'kick',
      via: 'review',
    })
  })
  it('advances, finishes after the last serve, and undoes one step at a time', () => {
    let s = initialTagging(session)
    s = afterTag(s, ids, 'in', null)
    s = afterTag(s, ids, 'net', null)
    expect(s.index).toBe(2)
    s = afterTag(s, ids, 'wide', null)
    expect(s.finished).toBe(true)
    const u = afterUndo(s)
    expect(u.entry?.serveId).toBe('c')
    expect(u.state.index).toBe(2)
    expect(u.state.finished).toBe(false)
    expect(afterSkip(initialTagging(session), 3).index).toBe(1)
  })
  it('point-play mode: a first-serve fault makes the next a second serve; in or a second serve resets', () => {
    expect(nextServeNumber(1, 'net')).toBe(2)
    expect(nextServeNumber(1, 'in')).toBe(1)
    expect(nextServeNumber(2, 'long')).toBe(1)
    expect(nextServeNumber(1, 'let')).toBe(1)
    let s = { ...initialTagging(session), pointPlay: true }
    s = afterTag(s, ids, 'long', null)
    expect(s.attrs.serveNumber).toBe(2)
  })
  it('counts, words and the spoken confirmation', () => {
    const tags: ServeTagRecord[] = [
      { serveId: 'a', sessionId: 'x', outcome: 'in', taggedAt: '', via: 'review' },
      { serveId: 'b', sessionId: 'x', outcome: 'net', taggedAt: '', via: 'review' },
      { serveId: 'c', sessionId: 'x', outcome: 'let', taggedAt: '', via: 'review' },
    ]
    const c = countTags(ids, tags)
    expect(c).toMatchObject({ total: 3, tagged: 3, in: 1, net: 1, let: 1 })
    expect(faultWords(c)).toBe('1 net')
    expect(announce(6, 'in', 15, false)).toBe('Serve 7: in. Serve 8 of 15.')
    expect(tallyConflict(c, 2)).toEqual({ tags: 1, tally: 2 })
    expect(tallyConflict(c, 1)).toBeNull()
  })
})
