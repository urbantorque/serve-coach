import { describe, expect, it } from 'vitest'
import { METRIC_IDS, REAR_ONLY_METRIC_IDS } from '../../../analysis/types.ts'
import { DEMO_FIXTURES } from '../../../data/fixtures.ts'
import type { ProfileRecord, VideoRecord } from '../../../data/records.ts'
import { lintCopy } from '../../copy/lint.ts'
import { buildCoachSummary, escapeHtml, MAX_STATS, pickStats } from './coachSummary.ts'
import * as copy from './copy.ts'
import { CANNOT_MEASURE, GROUP_NOTES, GROUP_TITLES, measureIndex } from './measureIndex.ts'
import { formatBytes, retentionFootnote, storageLine, storageTotals, wouldDeleteNow } from './storageModel.ts'
import { formFromProfile, heightChanged, patchFromForm, saveBlocker, seasonCheck } from './yourServeModel.ts'

const NOW = new Date('2026-09-27T10:00:00+10:00')

describe('Your serve form', () => {
  const p: ProfileRecord = { ...DEMO_FIXTURES.profile }

  it('fills from the stored profile and saves the same answers back', () => {
    const f = formFromProfile(p)
    expect(f).toMatchObject({ heightCm: 178, handedness: 'right', utrText: '4.5', noUtr: false, goal: 'first-serves-in', playStyle: ['night-comp'] })
    expect(saveBlocker(f)).toBeNull()
    expect(patchFromForm(f)).toMatchObject({ heightM: 1.78, handedness: 'right', utr: 4.5, level: 'utr-4-5', playStyle: ['night-comp'], matchNights: ['tue'] })
  })

  it('an empty profile starts empty, never with invented answers', () => {
    const f = formFromProfile(null)
    expect(f.heightCm).toBeNull()
    expect(f.handedness).toBeNull()
    expect(f.goal).toBeNull()
    const patch = patchFromForm(f)
    expect(patch.heightM).toBeUndefined()
    expect(patch.handedness).toBeUndefined()
    expect(patch.goal).toBeUndefined()
  })

  it('removing the UTR falls back to the chosen description', () => {
    const patch = patchFromForm({ ...formFromProfile(p), utrText: '', noUtr: true, description: 'getting-going' })
    expect(patch.utr).toBeUndefined()
    expect(patch.level).toBe('utr-1-3')
  })

  it('season is optional, but both fields must be valid when either is filled', () => {
    expect(seasonCheck({ seasonStart: '', seasonWeeks: '' })).toEqual({})
    expect(seasonCheck({ seasonStart: '2026-10-07', seasonWeeks: '14' })).toEqual({ season: { startDate: '2026-10-07', weeks: 14 } })
    expect(seasonCheck({ seasonStart: '2026-10-07', seasonWeeks: '' }).error).toBeTruthy()
    expect(seasonCheck({ seasonStart: '', seasonWeeks: '14' }).error).toBeTruthy()
    expect(seasonCheck({ seasonStart: '2026-10-07', seasonWeeks: '40' }).error).toBeTruthy()
  })

  it('flags a height change (centimetres are never compared across it, METRICS §4.4)', () => {
    expect(heightChanged(p, { ...formFromProfile(p), heightCm: 180 })).toBe(true)
    expect(heightChanged(p, formFromProfile(p))).toBe(false)
  })
})

describe('storage model', () => {
  const video = (id: string, importedAt: string, patch: Partial<VideoRecord> = {}): VideoRecord =>
    ({
      id,
      sessionId: 's',
      role: 'primary',
      source: 'in-app-web',
      capture: {} as VideoRecord['capture'],
      fileName: 'a.mp4',
      sizeBytes: 90e6,
      fingerprint: id,
      meta: {} as VideoRecord['meta'],
      importedAt,
      storage: 'idb',
      retention: { policy: 'auto-delete-days', pinned: 0 },
      audio: 'never-recorded',
      isDemo: 0,
      ...patch,
    }) as VideoRecord

  it('writes sizes the way phones do', () => {
    expect(formatBytes(1.234e9)).toBe('1.2 GB')
    expect(formatBytes(34.4e6)).toBe('34 MB')
    expect(formatBytes(8.46e6)).toBe('8.5 MB')
    expect(formatBytes(820e3)).toBe('820 KB')
    expect(formatBytes(-5)).toBe('0 KB')
  })

  it('counts only stored videos, and the rest of the browser usage separately', () => {
    const vids = [video('a', '2026-09-01'), video('b', '2026-09-20', { storage: 'deleted' })]
    const t = storageTotals(vids, 200e6)
    expect(t).toEqual({ videoBytes: 90e6, videoCount: 1, otherBytes: 110e6 })
    expect(storageLine(t)).toBe('On this phone: 90 MB of video, 110 MB of stats, frames and app data.')
    expect(storageLine(storageTotals(vids, null))).toBe('On this phone: 90 MB of video.')
    expect(storageTotals(vids, 10e6).otherBytes).toBeNull()
  })

  it('says how many videos a shorter keep period would delete now; pinned and deleted ones never count', () => {
    const vids = [
      video('old', '2026-09-01T00:00:00+10:00'),
      video('new', '2026-09-25T00:00:00+10:00'),
      video('pinned', '2026-08-01T00:00:00+10:00', { retention: { policy: 'keep', pinned: 1 } }),
      video('gone', '2026-08-01T00:00:00+10:00', { storage: 'deleted' }),
    ]
    expect(wouldDeleteNow(vids, { policy: 'auto-delete-days', days: 7 }, NOW)).toBe(1)
    expect(wouldDeleteNow(vids, { policy: 'auto-delete-days', days: 90 }, NOW)).toBe(0)
    expect(wouldDeleteNow(vids, { policy: 'keep', days: 30 }, NOW)).toBe(0)
    expect(wouldDeleteNow(vids, { policy: 'delete-after-analysis', days: 30 }, NOW)).toBe(0)
  })

  it('the footnote is honest about when deletion happens (ARCHITECTURE §8.2)', () => {
    expect(retentionFootnote({ policy: 'auto-delete-days', days: 30 })).toBe('Videos older than 30 days are deleted the next time you open Serve Coach.')
  })
})

describe('coach summary (M12)', () => {
  const s3 = DEMO_FIXTURES.sessions.at(-1)!
  const decision = DEMO_FIXTURES.decision

  it('picks 3 to 5 labelled stats and never an experimental or unavailable one', () => {
    const stats = pickStats(s3.stats, decision)
    expect(stats.length).toBeGreaterThanOrEqual(3)
    expect(stats.length).toBeLessThanOrEqual(MAX_STATS)
    for (const st of stats) {
      expect(['measured', 'estimated', 'player-entered']).toContain(st.status)
      expect(st.statusLabel).toBeTruthy()
    }
  })

  it('builds a self-contained HTML page and JSON with status words, the sample label and nothing private', () => {
    const out = buildCoachSummary({ session: s3.session, stats: s3.stats, decision, now: NOW })
    expect(out.html).toContain('<html lang="en-AU">')
    expect(out.html).toContain('Sample data · synthetic player')
    expect(out.html).not.toMatch(/<script|<link|https?:\/\//)
    const picked = pickStats(s3.stats, decision)
    for (const st of picked) expect(out.html).toContain(escapeHtml(st.statusLabel))
    const json = JSON.parse(out.json)
    expect(json.format).toBe('serve-coach-coach-summary')
    expect(json.sample).toBe(true)
    for (const st of json.stats) expect(st.status).not.toBe('experimental')
    expect(out.json).not.toMatch(/comfortRegions|painFlag|"note"/)
    expect(lintCopy(out.html.replace(/<[^>]+>/g, ' '))).toEqual([])
  })

  it('escapes text', () => {
    expect(escapeHtml(`<b>"x" & 'y'</b>`)).toBe('&lt;b&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/b&gt;')
  })
})

describe('How we measure index', () => {
  const groups = measureIndex()
  const rows = groups.flatMap((g) => g.rows)

  it('lists every metric exactly once', () => {
    expect(rows.map((r) => r.id).sort()).toEqual([...METRIC_IDS].sort())
  })

  it('spin is not measurable, outcomes are logged, and view-from-behind bands are not shown as measured', () => {
    const byId = new Map(rows.map((r) => [r.id, r]))
    expect(byId.get('spin')?.status).toBe('unavailable')
    expect(byId.get('serve-in-rate')?.status).toBe('player-entered')
    expect(byId.get('speed-experimental')?.status).toBe('experimental')
    for (const id of REAR_ONLY_METRIC_IDS) expect(['experimental', 'estimated']).toContain(byId.get(id)?.status)
    expect(byId.get('knee-bend-band')?.views).toBe('View from behind')
  })
})

describe('profile copy', () => {
  it('passes the copy lint', () => {
    const all = [
      ...Object.values(copy).flatMap((v) => (Array.isArray(v) ? v : [v])),
      ...Object.values(GROUP_TITLES),
      ...Object.values(GROUP_NOTES),
      ...CANNOT_MEASURE,
    ] as string[]
    for (const t of all) expect(lintCopy(t), t).toEqual([])
  })
})
