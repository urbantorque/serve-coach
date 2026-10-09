/**
 * One run of a practice session against its video, start to finish (L2.4,
 * L2.5, L2.8): the reading, the pictures of the best and worst serves, and what
 * the screen shows at each step.
 *
 * Out of `App.tsx`, which only hands it the video, the screen and the store:
 * this is loaded with the rest of a session's code when a long clip is picked
 * (`live.ts`), so none of it is in the bundle every cold open parses.
 *
 * The bar is the work in seeks, from the plan's own arithmetic: the scan's
 * share, then the reads, then the pictures, so it never runs backwards.
 */
import type { Analysis } from '../analysis/types'
import { Cancelled } from '../pose/extract'
import { guessServes, sampleServes, sessionCost } from './plan'
import { runSession } from './runner'
import type { PracticeSession, SessionStage } from './session'
import { extremes, highlightsOf } from './stats'
import type { SessionVideo } from './video'

export interface Drive {
  start: PracticeSession
  reader: SessionVideo
  tier?: number
  /** The calibrated cost of a seek, kept for pricing what is left after a pause. */
  perSampleMs?: number
  signal: AbortSignal
  /** Put the session on screen at a stage. */
  show: (session: PracticeSession, stage: SessionStage) => void
  save: (session: PracticeSession) => Promise<void>
  /** Why the run stopped, asked at the moment it did. */
  stopReason: () => 'player' | 'hidden' | 'warm'
  /** Whether this run is still the one on screen; a run the player left shows nothing more. */
  current: () => boolean
}

export async function driveSession(d: Drive): Promise<void> {
  const { start, reader, signal } = d
  const located = start.found !== undefined
  const serves = start.found?.length ?? guessServes(start.duration)
  const reading = start.chosen?.length ?? (start.mode === 'every' ? serves : sampleServes(serves).length)
  const cost = sessionCost({ duration: start.duration, serves, reading, perSampleMs: 1, located })
  const total = Math.max(1, cost.locate + cost.read + cost.full)
  const scanShare = cost.locate / total
  const readShare = cost.read / total
  const ratioOf = (s: PracticeSession, scan = 1) =>
    s.chosen === undefined
      ? scanShare * scan
      : scanShare + readShare * (s.lines.length / Math.max(1, s.chosen.length))
  const detailOf = (s: PracticeSession) =>
    s.chosen === undefined
      ? undefined
      : `Reading serve ${Math.min(s.lines.length + 1, s.chosen.length)} of ${s.chosen.length}…`
  const show = (session: PracticeSession, stage: SessionStage) => {
    if (d.current()) d.show(session, stage)
  }

  let latest = start
  const readOpts = { handedness: start.handedness, serveType: start.serveType, tier: d.tier, signal }
  /*
   * The best and worst serves read so far, whole, so their stills can be drawn
   * at the end without reading them again. Never more than six, so memory does
   * not grow with the session.
   */
  const kept = new Map<number, Analysis>()
  show(start, { state: 'running', ratio: ratioOf(start, 0), detail: detailOf(start) })

  const result = await runSession(start, {
    locate: () => reader.locate(signal, (scan) => show(latest, { state: 'running', ratio: ratioOf(latest, scan) })),
    read: async (index) => {
      const analysis = await reader.read(index, latest.found!, readOpts)
      if (analysis.triage?.status !== 'rejected') {
        kept.set(index + 1, analysis)
        const so = extremes([...latest.lines, { number: index + 1, t: 0, status: 'read', overall: analysis.overall }])
        const keep = new Set([...so.best, ...so.worst])
        for (const n of [...kept.keys()]) if (!keep.has(n)) kept.delete(n)
      }
      return analysis
    },
    choose: (count) => (start.mode === 'every' ? Array.from({ length: count }, (_, i) => i) : sampleServes(count)),
    save: d.save,
    signal,
    onChange: (s) => {
      latest = s
      if (s.phase === 'locating' || s.phase === 'reading') {
        show(s, { state: 'running', ratio: ratioOf(s), detail: detailOf(s) })
      }
    },
  })
  if (!d.current()) return

  let finished = result
  if (result.phase === 'done' && result.found) {
    /*
     * A still of each of the best and worst serves (L2.8), the pictures the
     * plan priced as its full reads. Kept analyses are drawn from; a serve read
     * before a pause is read again. Best-effort: a stop here leaves the session
     * finished with fewer pictures.
     */
    const { best, worst } = extremes(result.lines)
    const wanted = [...best, ...worst].filter((n) => !result.stills?.[n])
    const stills = { ...(result.stills ?? {}) }
    for (const [i, n] of wanted.entries()) {
      if (signal.aborted) break
      show(result, {
        state: 'running',
        ratio: scanShare + readShare + (1 - scanShare - readShare) * (i / wanted.length),
        detail: 'Taking pictures of your best and worst serves…',
      })
      try {
        const still = await reader.still(n - 1, result.found, readOpts, kept.get(n))
        if (still) stills[n] = still
      } catch (err) {
        if (signal.aborted || err instanceof Cancelled) break
      }
      kept.delete(n)
    }
    // The stretches to watch again from the same file (L2.11), saved with the
    // stills whatever happened to them.
    finished = {
      ...result,
      ...(Object.keys(stills).length ? { stills } : {}),
      highlights: highlightsOf(result.lines, result.duration),
      updatedAt: Date.now(),
    }
    await d.save(finished)
  }
  if (!d.current()) return
  show(
    finished,
    finished.phase === 'done' ? { state: 'done' } : { state: 'paused', reason: d.stopReason(), perSampleMs: d.perSampleMs },
  )
}
