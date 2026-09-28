// Finding 4: with "Include comfort notes" off, nothing that leaves the phone names a comfort setting
// or a body-check answer: not the export (JSON and CSV), not the coach summary, whether the decision
// was stored before or after the fix.
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { decideFocus, toCoachingRecord } from '../coaching/index.ts'
import { mv, profile, session } from '../coaching/testkit.ts'
import { buildCoachSummary } from '../ui/screens/profile/coachSummary.ts'
import { getDb, resetDbForTests } from './db.ts'
import { loadDemoData } from './demo.ts'
import { buildExportCSV, buildExportJSON } from './export.ts'
import { DEMO_FIXTURES } from './fixtures.ts'
import { logPractice } from './repos/coaching.ts'
import type { CoachingRecord } from './records.ts'

const HEALTH = /comfort|sore|pain|hurt|knee|shoulder setting|legs-quiet/i

const reachUpSession = () =>
  session({
    id: 'demo-s1',
    startedAt: '2026-09-26T09:00:00+10:00',
    n: 16,
    metrics: { 'contact-height-ratio': (i) => mv('contact-height-ratio', 1.3 + ((i % 3) - 1) * 0.01, { half: 0.02, unit: 'ratio-of-height' }) },
  })

beforeEach(async () => {
  await resetDbForTests()
  await loadDemoData()
})

describe('export with "Include comfort notes" off', () => {
  it('a pinned focus ruled out by a knee setting: no fault id, no comfort wording in the trace (new and older records)', async () => {
    const d = decideFocus({ profile: profile({ pinnedFocusItemId: 'legs-spring', comfortRegions: ['knee'] }), session: reachUpSession(), now: '2026-09-26T10:00:00+10:00' })
    const fresh = toCoachingRecord(d, { id: 'dec-new', sessionId: 'demo-s1' })
    // A record stored before the fix carried the item and the comfort wording at the "candidate" step.
    const older: CoachingRecord = {
      ...fresh,
      id: 'dec-old',
      trace: [
        ...fresh.trace,
        { step: 'candidate', faultId: 'legs-quiet', passed: false, detail: 'Pinned focus excluded by a comfort setting.' },
        { step: 'select', passed: false, detail: 'Every eligible item is excluded by comfort.' },
      ],
    }
    await getDb().coaching.bulkPut([fresh, older])
    await logPractice({ date: '2026-09-25', minutes: 10, body: 'pain' })
    const json = await buildExportJSON({ includeDemo: true })
    const decisions = json.coachingDecisions.filter((c) => c.id === 'dec-new' || c.id === 'dec-old')
    expect(decisions).toHaveLength(2)
    expect(JSON.stringify(decisions)).not.toMatch(HEALTH)
    expect(JSON.stringify(json.practiceLogs)).not.toMatch(/"body"|discomfort/)
    const csv = await buildExportCSV({ includeDemo: true })
    expect(Object.values(csv).join('\n')).not.toMatch(/excluded by (a )?comfort|comfort setting/i)
    // With the toggle on, the player's own wording is exported as stored.
    const full = await buildExportJSON({ includeDemo: true, includeComfort: true })
    expect(JSON.stringify(full.coachingDecisions)).toMatch(/excluded by a comfort setting/)
  })
})

describe('coach summary (never pain or comfort answers)', () => {
  const s = DEMO_FIXTURES.sessions[0]

  it('a shoulder-comfort reach-up focus: the "why" names no comfort setting', () => {
    const d = decideFocus({ profile: profile({ pinnedFocusItemId: 'reach-up', comfortRegions: ['shoulder'] }), session: reachUpSession(), now: '2026-09-26T10:00:00+10:00' })
    expect(d.kind).toBe('focus')
    const rec = toCoachingRecord(d, { sessionId: s.session.id })
    const out = buildCoachSummary({ session: s.session, stats: s.stats, decision: rec, now: new Date('2026-09-26T10:00:00+10:00') })
    expect(out.html).not.toMatch(/comfort setting|shoulder comfort/i)
    expect(out.json).not.toMatch(/comfort setting|shoulder comfort/i)
    expect(out.html).toMatch(/contact height is compared only with your own best/)
  })

  it('an older stored "why" with the comfort sentence is scrubbed on the way out', () => {
    const decision = {
      ...DEMO_FIXTURES.decision,
      focus: {
        ...DEMO_FIXTURES.decision.focus!,
        whyChosen: "Your coach's focus. This session: with your shoulder comfort setting, contact height is compared only with your own best. It fits your goal: more first serves in.",
      },
    }
    const out = buildCoachSummary({ session: s.session, stats: s.stats, decision, now: new Date('2026-09-26T10:00:00+10:00') })
    expect(out.html).not.toMatch(/comfort setting/i)
    expect(out.html).toContain("Your coach&#39;s focus.")
    expect(out.html).toContain('It fits your goal: more first serves in.')
  })
})
