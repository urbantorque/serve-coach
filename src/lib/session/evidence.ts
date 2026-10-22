/**
 * A practice session as evidence for the ladder (N1.5).
 *
 * A whole practice's worth of judged serves never reached the ladder,
 * graduation or the week plan: those read saved reports, and a session keeps
 * one small line per serve instead. Two bridges, both pure:
 *
 *   - `sessionEvidence` turns each read line into the judgement-only shape
 *     `judgeServe` reads, timed where the serve was in the session. All of a
 *     session's lines sit inside one trip by the app's own rule, so a session
 *     counts as one trip towards graduation, never as twelve.
 *   - `sessionDrillCheck` holds the session's newest judged serves against the
 *     bar of the fault the player came in drilling, as a trip's check does.
 */
import { CHECK_SERVES, lastSeverity, progressionFor, rungFor } from '../analysis/progressions'
import type { FlawId } from '../analysis/flaws'
import { SCORING_VERSION } from '../analysis/types'
import type { Session } from '../storage/db'
import type { TripCheck } from '../tripCheck'
import { drilledFault } from '../weekPlan'
import type { PracticeSession } from './session'

export function sessionEvidence(practice: readonly PracticeSession[]): Session[] {
  return practice.flatMap((p) =>
    p.lines
      .filter((l) => l.status === 'read' && l.judged?.length)
      .map(
        (l) =>
          ({
            id: `${p.id}-serve-${l.number}`,
            createdAt: p.createdAt + Math.round(l.t * 1000),
            // The engine version that read it, so the rubric era is not cut at
            // every session: an unstamped row reads as the legacy version.
            scoringVersion: p.scoringVersion ?? SCORING_VERSION,
            triage: { schema: 1, status: 'ok', injury_risk: [], suppressed_count: 0 },
            diagnosis: {
              flaws: l.judged!.map((flaw) => ({ flaw, detected: l.named?.includes(flaw) ?? false, confidence: 1 })),
            },
          }) as unknown as Session,
      ),
  )
}

export function sessionDrillCheck(
  practice: PracticeSession,
  reports: readonly Session[],
  rungs?: Partial<Record<string, number>>,
  movedAt?: Partial<Record<string, number>>,
): TripCheck | undefined {
  const flaw: FlawId | undefined = drilledFault([...reports], practice.createdAt, rungs)
  if (!flaw) return undefined
  const ladder = progressionFor(flaw)
  if (!ladder) return undefined
  const since = movedAt?.[flaw] ?? -Infinity
  const judged = practice.lines
    .filter((l) => l.status === 'read' && l.judged?.includes(flaw) && practice.createdAt + l.t * 1000 >= since)
    .sort((a, b) => a.t - b.t)
    .slice(-CHECK_SERVES)
  if (!judged.length) return undefined
  const named = judged.filter((l) => l.named?.includes(flaw)).length
  const clean = judged.length - named
  const need = ladder.pass
  const outcome: TripCheck['outcome'] =
    clean >= need ? 'passed' : named > CHECK_SERVES - need || judged.length >= CHECK_SERVES ? 'not_yet' : 'unread'
  const rung = rungFor(flaw, ladder, rungs, lastSeverity([...reports], flaw))
  return { flaw, read: judged.length, clean, need, outcome, rung, steps: ladder.steps.length, step: ladder.steps[rung].name, since: practice.createdAt }
}
