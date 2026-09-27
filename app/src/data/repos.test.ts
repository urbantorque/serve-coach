import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { resetDbForTests } from './db.ts'
import { loadDemoData } from './demo.ts'
import { DEMO_FIXTURES } from './fixtures.ts'
import { attachRetest, createExperiment, getActiveExperiment, lastLogsForDrill, logPractice } from './repos/coaching.ts'
import { computeInSegment, getProfile, saveProfile } from './repos/profile.ts'
import { listServesBySession, setServeIncluded } from './repos/serves.ts'
import { analysedDaysInMonth, createSession, listByMode, listSessions, setAnalysis } from './repos/sessions.ts'
import { getAllSettings, getSetting, setSetting } from './repos/settings.ts'
import { bulkSetTags, listTags, setTag } from './repos/tags.ts'
import { addVideo, getVideo, retainUntilFor, setVideoRetention } from './repos/videos.ts'

beforeEach(async () => {
  await resetDbForTests()
})

describe('profile', () => {
  it('creates the single row, keeps createdAt and recomputes the D11 segment flag', async () => {
    const first = await saveProfile({ heightM: 1.78, playStyle: ['no-comp'] }, new Date('2026-09-01T00:00:00Z'))
    expect(first.inSegment).toBe(0)
    const second = await saveProfile({ playStyle: ['night-comp'], matchNights: ['tue'] }, new Date('2026-09-02T00:00:00Z'))
    expect(second.inSegment).toBe(1)
    expect(second.createdAt).toBe(first.createdAt)
    expect(second.heightM).toBe(1.78)
    expect((await getProfile())?.matchNights).toEqual(['tue'])
    expect(computeInSegment(['pennant'])).toBe(1)
  })
})

describe('settings', () => {
  it('returns documented defaults until set', async () => {
    expect(await getSetting('experimentalMetrics')).toBe(false)
    expect(await getSetting('retention')).toEqual({ policy: 'auto-delete-days', days: 30 })
    expect((await getSetting('captureDefaults')).orientation).toBe('portrait')
    await setSetting('theme', { scheme: 'dark', courtSide: 'always' })
    expect((await getAllSettings()).theme).toEqual({ scheme: 'dark', courtSide: 'always' })
  })
})

describe('sessions', () => {
  it('lists newest first, filters demo data, and keeps views apart for Progress', async () => {
    await loadDemoData()
    const own = await createSession({
      startedAt: '2026-09-27T09:00:00+10:00',
      visitId: '2026-09-27',
      status: 'ready',
      mode: 'technique',
      view: 'side',
    })
    const all = await listSessions()
    expect(all[0].id).toBe(own.id)
    expect((await listSessions({ includeDemo: false })).map((s) => s.id)).toEqual([own.id])
    // Demo sessions never enter Progress (ARCHITECTURE §11).
    expect((await listByMode('technique')).map((s) => s.id)).toEqual([own.id])
    expect((await listByMode('technique', {}, { includeDemo: true })).every((s) => s.mode === 'technique')).toBe(true)
    expect((await listByMode('outcomes', {}, { includeDemo: true })).map((s) => s.view)).toEqual(['rear'])
  })

  it('counts analysed practice days, not blocks, and never demo days (free-tier meter)', async () => {
    await loadDemoData()
    const base = { status: 'ready' as const, mode: 'technique' as const, view: 'side' as const }
    await createSession({ ...base, startedAt: '2026-09-27T09:00:00+10:00', visitId: '2026-09-27' })
    await createSession({ ...base, startedAt: '2026-09-27T09:40:00+10:00', visitId: '2026-09-27' })
    await createSession({ ...base, startedAt: '2026-09-28T09:00:00+10:00', visitId: '2026-09-28', status: 'failed' })
    expect(await analysedDaysInMonth('2026-09')).toBe(1)
  })

  it('setAnalysis stores engine output and denormalises the matching fields', async () => {
    const fx = DEMO_FIXTURES.sessions[2]
    const s = await createSession({ startedAt: fx.session.startedAt, status: 'analysing', mode: 'technique', view: 'side' })
    await setAnalysis(s.id, { ...fx.session.analysis!, sessionId: s.id })
    const [row] = await listSessions()
    expect(row.status).toBe('ready')
    expect(row.fpsClass).toBe('fps120plus')
    expect(row.tiltStatus).toBe('unknown')
    expect(row.orientation).toBe('portrait')
  })
})

describe('serves and tags', () => {
  it('lists serves in index order and records the player exclusion', async () => {
    await loadDemoData()
    const serves = await listServesBySession('demo-s1')
    expect(serves.map((s) => s.index)).toEqual([...serves].map((s) => s.index).sort((a, b) => a - b))
    await setServeIncluded(serves[0].id, false)
    const again = await listServesBySession('demo-s1')
    expect(again[0].included).toBe(false)
    expect(again[0].includedFlag).toBe(0)
  })

  it('merges tag patches and applies bulk attributes', async () => {
    await setTag('sv1', 's1', { outcome: 'net' })
    await setTag('sv1', 's1', { serveNumber: 1, targetZone: 'T' })
    await bulkSetTags('s1', ['sv1', 'sv2'], { side: 'ad' })
    const tags = await listTags('s1')
    const sv1 = tags.find((t) => t.serveId === 'sv1')
    expect(sv1).toMatchObject({ outcome: 'net', serveNumber: 1, targetZone: 'T', side: 'ad' })
    expect(tags).toHaveLength(2)
  })
})

describe('videos', () => {
  it('computes retainUntil from the policy and keeps pinned videos out of the sweep index', async () => {
    const fx = DEMO_FIXTURES.sessions[0].video
    const importedAt = '2026-09-01T00:00:00.000Z'
    expect(retainUntilFor('auto-delete-days', importedAt, 30)).toBe(Date.parse(importedAt) + 30 * 86_400_000)
    expect(retainUntilFor('keep', importedAt, 30)).toBeUndefined()
    expect(retainUntilFor('auto-delete-days', importedAt, 30, true)).toBeUndefined()
    await addVideo({ ...fx, importedAt }, new Blob(['x']))
    const pinned = await setVideoRetention(fx.id, { pinned: true })
    expect(pinned?.retainUntil).toBeUndefined()
    const seven = await setVideoRetention(fx.id, { pinned: false, days: 7 })
    expect(seven?.retainUntil).toBe(Date.parse(importedAt) + 7 * 86_400_000)
    expect((await getVideo(fx.id))?.retention.pinned).toBe(0)
  })
})

describe('experiments and practice', () => {
  it('attaches re-tests once and finds the active experiment', async () => {
    const exp = await createExperiment({ ...DEMO_FIXTURES.experiment, id: 'e1', retestSessionIds: [], isDemo: 0 })
    await attachRetest(exp.id, 's9')
    await attachRetest(exp.id, 's9')
    expect((await getActiveExperiment())?.retestSessionIds).toEqual(['s9'])
  })

  it('truncates notes to 140 characters and flags pain as discomfort', async () => {
    await logPractice({ date: '2026-09-20', minutes: 8, drillId: 'd1', note: 'x'.repeat(200), body: 'pain' })
    await logPractice({ date: '2026-09-21', minutes: 8, drillId: 'd1', body: 'fine' })
    const logs = await lastLogsForDrill('d1', 2)
    expect(logs).toHaveLength(2)
    const pain = logs.find((l) => l.body === 'pain')
    expect(pain?.note).toHaveLength(140)
    expect(pain?.discomfort).toBe(1)
  })
})
