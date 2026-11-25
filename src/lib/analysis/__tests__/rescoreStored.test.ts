/**
 * Re-scoring in place when only the bands move (L3.11).
 *
 * The proof the roadmap asks for — a v4 history re-scored equals a fresh v5
 * score — run against a version table in which the v5 bump only moved the
 * card's bands. The real v5 changed measurements, so on the real table a v4
 * report stays its own era; the second half holds that too.
 */
import { rescoreStoredSession } from '../rescoreStored'
import { SCORING_KINDS, SCORING_VERSION, rescorable } from '../types'
import { DEMO_DIALS, sampleAnalysis } from '../../../dev/sampleAnalysis'
import { buildProgress } from '../../progress'
import type { Session } from '../../storage/db'
import { assert, check, heading, note, report } from './harness'

/** A fresh report, as stored. */
function stored(dials = {}, createdAt = 1_000): Session {
  const { frames: _f, ...a } = sampleAnalysis(dials)
  void _f
  return { ...a, id: `serve-r${createdAt}-0`, createdAt, scoringVersion: SCORING_VERSION } as Session
}

/** The same readings scored under an older rubric: every score moved, nothing measured. */
function scoredUnderOlder(fresh: Session, version: number): Session {
  const fundamentals = fresh.fundamentals.map((f) => ({
    ...f,
    score: Math.max(0, f.score - 11),
    metrics: f.metrics.map((m) => ({ ...m, score: Math.max(0, m.score - 13), status: 'work' as const })),
  }))
  return { ...fresh, fundamentals, overall: fresh.overall - 12, scoringVersion: version }
}

/** A table where the last bump only moved the card's bands. */
const BANDS_ONLY = { ...SCORING_KINDS, [SCORING_VERSION]: 'card-bands' }

heading('A history re-scored from its readings equals a fresh score')

check('a v4 report re-scored equals the same serve scored fresh, row by row', () => {
  for (const [name, dials] of Object.entries({ default: {}, example: DEMO_DIALS.example, collapsed: DEMO_DIALS.collapsed })) {
    const fresh = stored(dials)
    const old = scoredUnderOlder(fresh, SCORING_VERSION - 1)
    const again = rescoreStoredSession(old, BANDS_ONLY)!
    assert(again !== undefined, `${name}: a band-only history wasn’t re-scored`)
    note(`${name}: ${old.overall} under v${old.scoringVersion} → ${again.overall} under v${again.scoringVersion}, fresh ${fresh.overall}`)
    assert(again.overall === fresh.overall && again.scoringVersion === SCORING_VERSION, `${name}: overall ${again.overall}`)
    for (const f of fresh.fundamentals) {
      const g = again.fundamentals.find((x) => x.id === f.id)!
      assert(g.score === f.score, `${name}: ${f.id} ${g.score} against ${f.score}`)
      for (const m of f.metrics) {
        const r = g.metrics.find((x) => x.id === m.id)!
        assert(r.score === m.score && r.readout === m.readout, `${name}: ${m.id} ${r.score}/${r.readout} against ${m.score}/${m.readout}`)
        assert(r.confidence === m.confidence, `${name}: ${m.id} lost how far it was believed`)
      }
    }
  }
})

check('a racket that never fell keeps that verdict through a re-score', () => {
  const fresh = stored(DEMO_DIALS.collapsed)
  const drop = fresh.fundamentals.flatMap((f) => f.metrics).find((m) => m.id === 'dropDepth')
  note(`collapsed drop reads "${drop?.readout}"`)
  const again = rescoreStoredSession(scoredUnderOlder(fresh, SCORING_VERSION - 1), BANDS_ONLY)!
  const after = again.fundamentals.flatMap((f) => f.metrics).find((m) => m.id === 'dropDepth')
  assert(after?.readout === drop?.readout && after?.score === drop?.score, `the drop read "${after?.readout}" at ${after?.score}`)
})

check('re-scored, the history has no break in it', () => {
  const older = scoredUnderOlder(stored({}, 1_000), SCORING_VERSION - 1)
  const newer = stored({ contactReach: 1.3 }, 3 * 86_400_000)
  const raw = buildProgress([newer, older])!
  const fixed = buildProgress([newer, rescoreStoredSession(older, BANDS_ONLY)!])!
  assert(raw.rubricBreakAt !== undefined, 'the fixture had no break to remove')
  assert(fixed.rubricBreakAt === undefined && fixed.previous !== undefined, 'the re-scored history still broke')
})

heading('A measurement change still starts a new era')

check('on the real table, a v4 report isn’t re-scored', () => {
  note(`kinds: ${JSON.stringify(SCORING_KINDS)}`)
  assert(!rescorable(SCORING_VERSION - 1), 'a report across a measurement change was declared re-scorable')
  assert(rescoreStoredSession(scoredUnderOlder(stored(), SCORING_VERSION - 1)) === undefined, 'it was re-scored anyway')
  assert(!rescorable(SCORING_VERSION), 'a current report was re-scored')
})

check('every scoring version says which kind of change it was', () => {
  for (let v = 2; v <= SCORING_VERSION; v++) {
    assert(SCORING_KINDS[v] === 'card-bands' || SCORING_KINDS[v] === 'measurement', `version ${v} isn’t classed`)
  }
  assert(!(SCORING_VERSION + 1 in SCORING_KINDS), 'a version past the current one is classed')
})

report()
