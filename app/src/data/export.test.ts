import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { getDb, resetDbForTests } from './db.ts'
import { loadDemoData } from './demo.ts'
import { buildExportCSV, buildExportJSON, csvField, toCsv } from './export.ts'
import { DEMO_FIXTURES } from './fixtures.ts'
import { saveProfile } from './repos/profile.ts'
import { logPractice, saveMatchLog } from './repos/coaching.ts'

beforeEach(async () => {
  await resetDbForTests()
  await loadDemoData()
  await saveProfile({ heightM: 1.8, comfortRegions: ['shoulder'], comfort: { painFlag: 1, area: 'shoulder' }, playStyle: ['pennant'] })
  await logPractice({ date: '2026-09-25', minutes: 9, note: 'felt better, windy' })
  await saveMatchLog({ date: '2026-09-22', competition: 'pennant', doubleFaults: 2 })
})

describe('JSON export', () => {
  it('writes serve-coach-export@1 without demo data, comfort data or practice notes by default', async () => {
    const json = await buildExportJSON({ now: new Date('2026-09-27T06:40:00Z') })
    expect(json.format).toBe('serve-coach-export')
    expect(json.version).toBe(1)
    expect(json.sessions).toHaveLength(0)
    expect(json.serves).toHaveLength(0)
    expect(json.experiments).toHaveLength(0)
    expect(json.practiceLogs).toHaveLength(1)
    expect(json.practiceLogs[0]).not.toHaveProperty('note')
    expect(json.matchLogs).toHaveLength(1)
    expect(json.profile).not.toHaveProperty('comfort')
    expect(json.profile).not.toHaveProperty('comfortRegions')
    expect(json).not.toHaveProperty('tracks')
  })

  it('includes demo sessions, comfort notes and pose tracks only when chosen', async () => {
    const serve = DEMO_FIXTURES.sessions[0].serves[0]
    await getDb().tracks.put({
      serveId: serve.id,
      sessionId: serve.sessionId,
      pose: {
        frameIndices: new Int32Array([1, 2]),
        tReal: new Float64Array([0.1, 0.2]),
        xyv: new Float32Array([0.5, 0.5, 1]),
        flags: new Uint8Array([0]),
        source: 'injected',
        frameAspect: 0.5625,
        bodyHeightHU: 0.4,
        pitchDeg: new Float32Array([]),
        rollDeg: new Float32Array([]),
      },
    })
    const json = await buildExportJSON({ includeDemo: true, includeComfort: true, includePose: true })
    expect(json.sessions).toHaveLength(3)
    expect(json.profile?.comfort?.painFlag).toBe(1)
    const track = (json.tracks as { pose: { frameIndices: unknown } }[])[0]
    expect(track.pose.frameIndices).toEqual([1, 2])
    // Capture context is summarised: no raw attitude series.
    const s1 = json.sessions.find((s) => s.id === 'demo-s1')
    expect(s1?.capture).not.toHaveProperty('orientationSamples')
    expect(s1?.capture?.pitchMedianDeg).toBeCloseTo(0.4)
  })

  it('leaves out every body-check and comfort detail when "Include comfort notes" is off (JSON and CSV)', async () => {
    const db = getDb()
    await logPractice({ date: '2026-09-26', minutes: 10, body: 'pain', successCriterionMet: 'yes' })
    const s = DEMO_FIXTURES.sessions[0].session.id
    await db.coaching.put({
      id: 'dec-toss',
      sessionId: s,
      createdAt: '2026-09-26T08:00:00Z',
      libraryVersion: 'lib-x',
      engineVersion: 'coaching@1.0.0',
      gate: 'ok',
      focus: { faultId: 'toss-height-inconsistent', title: 'Steady toss height', phase: 'toss', evidenceTier: 'coach-recommended', whyChosen: 'It comes early in your serve. Your comfort settings rule this focus out for now.' },
      alternatives: [
        { faultId: 'legs-no-drive', reason: 'Leg drive: not coached because of your hip, knee or ankle comfort setting.' },
        { faultId: 'rhythm-uneven', reason: 'Rhythm: comes later in the serve, so we will look again after this.' },
      ],
      trace: [
        { step: 'safety', passed: true, detail: 'Sore today: knee, back.' },
        { step: 'select', passed: true, detail: 'Chosen: stage 2.' },
      ],
      phrasing: { source: 'template' },
    })
    await db.coaching.put({
      id: 'dec-ref',
      sessionId: s,
      createdAt: '2026-09-26T09:00:00Z',
      libraryVersion: 'lib-x',
      engineVersion: 'coaching@1.0.0',
      gate: 'pain-referral',
      referral: { message: "Let's skip serving today." },
      alternatives: [],
      trace: [{ step: 'safety', passed: false, detail: 'Referral: stop-and-book. No focus, cue or drill.' }],
      phrasing: { source: 'template' },
    })
    const json = await buildExportJSON({ includeDemo: true })
    const text = JSON.stringify({ practice: json.practiceLogs, decisions: json.coachingDecisions, profile: json.profile })
    expect(text).not.toMatch(/\bpain\b|\bsore\b|knee|referral|comfort setting|skip serving/i)
    expect(json.practiceLogs.every((l) => !('body' in l) && !('discomfort' in l))).toBe(true)
    const kept = json.coachingDecisions.find((d) => d.id === 'dec-toss')
    expect(kept?.trace[0].detail).toBe('Safety check applied.')
    expect(kept?.alternatives.map((a) => a.faultId)).toEqual(['rhythm-uneven'])
    expect(kept?.focus?.whyChosen).toBe('It comes early in your serve.')
    expect(json.coachingDecisions.find((d) => d.id === 'dec-ref')).toBeUndefined()
    const csv = (await buildExportCSV({ includeDemo: true }))['practice.csv']
    expect(csv).not.toMatch(/,pain,|,sore,/)
    // With the box ticked the answers are there.
    const full = await buildExportJSON({ includeDemo: true, includeComfort: true })
    expect(full.practiceLogs.some((l) => l.body === 'pain' && l.discomfort === 1)).toBe(true)
    expect(full.coachingDecisions.find((d) => d.id === 'dec-ref')).toBeDefined()
  })
})

describe('CSV export', () => {
  it('quotes RFC 4180 fields and starts every file with a BOM', () => {
    expect(csvField('a,b')).toBe('"a,b"')
    expect(csvField('say "in"')).toBe('"say ""in"""')
    expect(csvField('two\nlines')).toBe('"two\nlines"')
    expect(csvField(undefined)).toBe('')
    const csv = toCsv(['x', 'y'], [[1, 'a,b']])
    expect(csv.startsWith('﻿')).toBe(true)
    expect(csv).toBe('﻿x,y\r\n1,"a,b"\r\n')
  })

  it('writes one file per table, keeps match logs separate, and leaves unavailable values empty with a status and reason', async () => {
    const files = await buildExportCSV({ includeDemo: true })
    expect(Object.keys(files).sort()).toEqual(['experiments.csv', 'match_logs.csv', 'practice.csv', 'serves.csv', 'sessions.csv'])
    const serves = files['serves.csv'].replace('﻿', '').split('\r\n')
    const header = serves[0].split(',')
    expect(header).toContain('knee-bend-band__status')
    const row = serves[1].split(',')
    const col = (name: string) => row[header.indexOf(name)]
    // Side-view serve: knee bend is unavailable, never a number (D1).
    expect(col('knee-bend-band')).toBe('')
    expect(col('knee-bend-band__status')).toBe('unavailable')
    expect(col('knee-bend-band__reason')).toBe('NEEDS_REAR_VIEW')
    expect(files['match_logs.csv']).toContain('pennant')
    expect(files['practice.csv']).not.toContain('windy')
    expect(files['sessions.csv']).not.toContain('trunk-tilt-band')
  })
})
