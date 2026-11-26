/**
 * What set one serve apart, in a few words.
 *
 * Every row in the recent list used to carry the same title, the first fix,
 * which on a season of one fault is the same line three times over. A list of
 * serves a player cannot tell apart is a list nobody opens. So each serve gets
 * the most notable true thing about it: its speed record, the best of its trip,
 * what it did differently from their usual, a fault it did not show. Only then
 * does it fall back on the fix, and a serve read too poorly says so.
 *
 * Pure, and light: it reads what a stored report already carries.
 */
import { causalPlan } from './analysis/verdict'
import type { FlawId } from './analysis/flaws'
import type { Session, ServeTag } from './storage/db'
import { tripsOf } from './progress'
import { movedTitle, selfRead } from './selfRead'
import { SOFT_READ } from '../components/statusLabels'

export interface ServeStory {
  title: string
  /** Lit when this is a record of some kind. */
  best: boolean
  /** What the title is about (E2.3): a record, a fault gone, the fix itself, or neither. */
  kind?: 'record' | 'second' | 'moved' | 'gone' | 'fix' | 'rough' | 'unclear'
  /** The fault the title names, gone or still there, for the picture to be held on. */
  flaw?: FlawId
}

const flawsOf = (s: Session): string[] => causalPlan(s.triage, s.diagnosis).flatMap((p) => (p.flaw ? [p.flaw] : []))

/**
 * @param s the serve
 * @param history every serve, in any order
 * @param tags what the player said about each serve
 */
export function serveStory(s: Session, history: readonly Session[], tags?: ReadonlyMap<string, ServeTag>): ServeStory {
  if (s.triage?.status === 'rejected') return { title: 'Too unclear to score', best: false, kind: 'unclear' }

  const earlier = history.filter((h) => h.createdAt < s.createdAt && h.triage?.status !== 'rejected')
  const speed = s.speed && 'speed' in s.speed ? s.speed.speed : undefined
  if (speed && earlier.length) {
    const quickest = earlier.reduce((m, h) => {
      const v = h.speed && 'speed' in h.speed ? h.speed.speed.high : 0
      return Math.max(m, v)
    }, 0)
    // Past the top of every earlier range, so it is a record and not a wobble.
    if (quickest > 0 && speed.low > quickest) return { title: 'Your fastest so far', best: true, kind: 'record' }
  }

  const trip = tripsOf([...history]).find((t) => t.some((h) => h.id === s.id))
  if (trip && trip.length > 2) {
    const top = Math.max(...trip.map((h) => h.overall))
    if (s.overall === top && trip.filter((h) => h.overall === top).length === 1) return { title: 'Best of that session', best: true, kind: 'record' }
  }

  const tag = tags?.get(s.id)
  if (tag?.serveNumber === 2) return { title: 'Second serve', best: false, kind: 'second' }

  // Past the player's own noise, so it is the serve and not the camera.
  if (s.quality.confidence >= SOFT_READ) {
    const moved = selfRead(s, history as Session[], tags ? [...tags.values()] : [])?.usual[0]
    const title = moved && movedTitle(moved)
    if (title) return { title, best: false, kind: 'moved' }
  }

  // A fault named on the serve before and not on this one, on a clear read.
  const last = [...earlier].sort((a, b) => b.createdAt - a.createdAt)[0]
  if (last && s.quality.confidence >= SOFT_READ) {
    const now = new Set(flawsOf(s))
    const gone = causalPlan(last.triage, last.diagnosis).find((p) => p.flaw && !now.has(p.flaw))
    if (gone) return { title: `No sign of: ${gone.title.charAt(0).toLowerCase()}${gone.title.slice(1)}`, best: false, kind: 'gone', flaw: gone.flaw }
  }

  if (s.quality.confidence < SOFT_READ) return { title: 'A rough read', best: false, kind: 'rough' }
  return { title: s.focus.title, best: false, kind: 'fix', flaw: s.focus.flaw }
}
