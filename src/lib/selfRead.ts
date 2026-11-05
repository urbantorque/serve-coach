/**
 * What one serve says against the player's own record, ready for a screen.
 *
 * `baseline.ts` keeps the sums and their false-alarm rates, and says nothing when
 * a history is too short to hold them. This is the one place that joins its
 * pieces, so a report and a list read a serve the same way: a row named against
 * the usual is not named again against the best, and the reward is only offered
 * when a best stands clear of luck.
 */
import {
  againstBest,
  againstUsual,
  baselineFor,
  closestToBest,
  earlierBest,
  type BestReached,
  type Direction,
  type ReadableServe,
  type SelfFinding,
} from './baseline'
import type { ServeTag, Session } from './storage/db'

export interface SelfRead {
  usual: SelfFinding[]
  best: SelfFinding[]
  reward?: BestReached
}

export function selfRead(serve: ReadableServe, history: readonly Session[], tags: readonly ServeTag[] = []): SelfRead | undefined {
  const baseline = baselineFor(serve, history, tags)
  if (!baseline) return undefined
  const usual = againstUsual(serve, baseline)
  const top = earlierBest(serve, history, baseline, tags)
  const best = top ? againstBest(serve, top, baseline).filter((f) => !usual.some((u) => u.metricId === f.metricId)) : []
  return { usual, best, reward: top ? closestToBest(serve, top, baseline) : undefined }
}

/** Short enough for a card, and true of a serve that has been hit. */
const MOVED: Record<string, Record<Direction, string>> = {
  releaseHeight: { higher: 'Let the ball go higher', lower: 'Let the ball go lower' },
  tossArmHold: { higher: 'Tossing arm stayed up longer', lower: 'Tossing arm came down sooner' },
  tossPathWobble: { higher: 'Toss further off line', lower: 'Straighter toss' },
  kneeBend: { higher: 'Deeper knee bend', lower: 'Less knee bend' },
  shoulderTilt: { higher: 'Hitting shoulder lower', lower: 'Hitting shoulder higher' },
  legDrive: { higher: 'More drive off the legs', lower: 'Less drive off the legs' },
  dropDepth: { higher: 'Racket hand dropped lower', lower: 'Racket hand stayed higher' },
  elbowAtDrop: { higher: 'Wider elbow at the racket drop', lower: 'Tighter elbow at the racket drop' },
  handUnderElbow: { higher: 'Hand under the elbow longer', lower: 'Hand under the elbow less' },
  dropToContact: { higher: 'Longer from the drop to the ball', lower: 'Quicker from the drop to the ball' },
  contactHeight: { higher: 'Met the ball higher', lower: 'Met the ball lower' },
  armExtension: { higher: 'Straighter arm at the ball', lower: 'More bent arm at the ball' },
  contactAhead: { higher: 'Met the ball further in front', lower: 'Met the ball further back' },
  loadRatio: { higher: 'Longer from trophy to ball', lower: 'Less time from trophy to ball' },
}

/** A headline for the strongest thing a serve did differently, or nothing. */
export function movedTitle(finding: Pick<SelfFinding, 'metricId' | 'direction'>): string | undefined {
  const words = MOVED[finding.metricId]?.[finding.direction]
  return words && `${words} than usual`
}
