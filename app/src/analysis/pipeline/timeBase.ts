/**
 * Time base for a run (ARCHITECTURE §5.1, §5.12; video/README "time base").
 *
 * Order of evidence:
 *   1. the player's confirmed capture rate (fpsOverride, CAPTURE §11.3)            -> 'user'
 *   2. the import question "Was this slow motion?" (capture.slowMotionAnswer)      -> 'user'
 *   3. the container (probe: >= 100 fps timestamps or capture-rate metadata)       -> 'proven'
 *   4. otherwise 'unknown': the first serve's toss gravity check confirms real time or
 *      corrects the time base ('physics'); audio timing stays off whenever timeScale != 1.
 * Only (3) sets meta.timeBaseStatus 'proven'. The engine checks (1), (2) and (4) against every
 * serve's toss (engine.ts timeBaseOf); speed needs (3) (CAPTURE §11.3, METRICS §2.9).
 * Frame indices never change, so windows kept as frame ranges survive a correction.
 */
import type { TimeBaseSuggestion } from '../ball/analyse.ts'
import type { CaptureContext, VideoMeta } from '../types.ts'
import { applyTimeScale } from '../video/timeBase.ts'

export type TimeBaseStatus = 'proven' | 'user' | 'physics' | 'unknown'

export interface TimeBaseDecision {
  meta: VideoMeta
  status: TimeBaseStatus
  notes: string[]
}

/** Relative distance under which two frame rates are the same. */
const SAME_RATE = 0.05

/**
 * A player-declared capture rate. It never makes the time base 'proven' (only container evidence
 * does, CAPTURE §11.3): the meta keeps fpsSource 'user' and its status, and the engine checks the
 * answer against the toss's fall (engine.ts timeBaseOf). A rate that matches a container-proven
 * timeline leaves the proven meta as it is.
 */
function withDeclaredRate(meta: VideoMeta, captureFps: number, why: string): TimeBaseDecision | null {
  const nominal = meta.nominalFps
  if (!(captureFps > 0) || !(nominal > 0)) return null
  if (Math.abs(captureFps / nominal - 1) <= SAME_RATE) {
    if (meta.timeBaseStatus === 'proven' && Math.abs(meta.timeScale - 1) < 1e-9) {
      return { meta, status: 'proven', notes: [`${why}: ${captureFps} fps agrees with the container, which proves ${meta.captureFps} fps capture`] }
    }
    // The timeline already runs at the declared rate: real time, if the toss's fall agrees.
    return {
      meta: { ...applyTimeScale(meta, nominal, 1, 'user'), timeBaseStatus: 'unknown' },
      status: 'user',
      notes: [`${why}: ${captureFps} fps matches the ${nominal.toFixed(1)} fps timeline, so the clip is real time (checked against the toss's fall)`],
    }
  }
  if (captureFps < nominal) {
    return null // a capture rate below the timeline rate would be fast motion: not a serve recording
  }
  const timeScale = nominal / captureFps
  return {
    meta: { ...applyTimeScale(meta, captureFps, timeScale, 'user'), timeBaseStatus: 'unknown' },
    status: 'user',
    notes: [`${why}: ${captureFps} fps shown on a ${nominal.toFixed(1)} fps timeline (x${timeScale.toFixed(4)} real time; checked against the toss's fall, speed unavailable)`],
  }
}

export function resolveTimeBase(
  meta: VideoMeta,
  options: { fpsOverride?: number; slowMotionAnswer?: CaptureContext['slowMotionAnswer'] } = {},
): TimeBaseDecision {
  const notes: string[] = []
  if (options.fpsOverride !== undefined) {
    const decided = withDeclaredRate(meta, options.fpsOverride, 'player-confirmed frame rate')
    if (decided) return decided
    notes.push(`player-confirmed ${options.fpsOverride} fps is below the ${meta.nominalFps.toFixed(1)} fps timeline; ignored`)
  }
  const answer = options.slowMotionAnswer
  const declared = answer === 'slomo-120' ? 120 : answer === 'slomo-240' ? 240 : undefined
  if (declared !== undefined && meta.timeBaseStatus !== 'proven') {
    const decided = withDeclaredRate(meta, declared, `import answer '${answer}'`)
    if (decided) return { ...decided, notes: [...notes, ...decided.notes] }
  }
  if (meta.timeBaseStatus === 'proven') return { meta, status: 'proven', notes: [...notes, `container proves ${meta.captureFps} fps capture`] }
  return { meta, status: 'unknown', notes: [...notes, 'time base not proven by the container; the toss gravity check decides'] }
}

/**
 * Applies the toss gravity check to an unknown time base. 'consistent' confirms real time;
 * 'apply-correction' rescales (fpsSource 'physics'); 'inconclusive' leaves it unknown. Neither makes
 * meta.timeBaseStatus 'proven' (container evidence only): the engine classes a gravity-confirmed clip
 * 'normal' and a corrected one 'physics' (timing estimated, speed never; METRICS §2.9). A
 * player-declared or container-proven base is never changed; a disagreement becomes a warning.
 */
export function applyGravityCheck(
  decision: TimeBaseDecision,
  suggestion: TimeBaseSuggestion,
): { decision: TimeBaseDecision; changed: boolean; warning?: string } {
  if (decision.status !== 'unknown' && decision.status !== 'physics') {
    if (suggestion.status === 'apply-correction') {
      return {
        decision,
        changed: false,
        warning: `The toss fell at a rate that doesn't match the ${decision.meta.captureFps} fps you gave. Check the frame rate if timings look wrong.`,
      }
    }
    return { decision, changed: false }
  }
  if (suggestion.status === 'consistent') {
    return {
      decision: { meta: decision.meta, status: 'physics', notes: [...decision.notes, `gravity check: ${suggestion.basis}`] },
      changed: false,
    }
  }
  if (suggestion.status === 'apply-correction' && suggestion.timeScale && suggestion.timeScale > 0) {
    const scale = suggestion.timeScale
    const corrected = applyTimeScale(decision.meta, decision.meta.nominalFps / scale, scale, 'physics')
    return {
      decision: { meta: { ...corrected, timeBaseStatus: 'unknown' }, status: 'physics', notes: [...decision.notes, `gravity check: ${suggestion.basis}`] },
      changed: true,
    }
  }
  return { decision: { ...decision, notes: [...decision.notes, `gravity check inconclusive: ${suggestion.basis}`] }, changed: false }
}
