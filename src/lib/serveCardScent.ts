/**
 * What makes each serve card on Today worth opening (E2.3).
 *
 * The cards looked alike: the same figure at the same moment, and on a season
 * of one fault three neighbours carried the same title. A history with no
 * scent is a list nobody opens. Each card now carries:
 *
 * - its own picture: held at the moment its title is about (the fault it
 *   names, or the one that went), with that fault painted in `--work` only
 *   where the serve had it. A record or a moved reading is held at contact.
 * - its score against the player's usual, only past their own noise: the
 *   change the overall's chip already holds to (`deltaStatus`), and past the
 *   spread of their own usual, so a wobble is never printed as a better serve.
 * - a title that differs from its neighbour's: a fault shown on serve after
 *   serve reads "Tossing arm again", then "Tossing arm, 3 in a row", oldest
 *   first, rather than the same sentence three times.
 *
 * Pure: it reads what stored reports carry.
 */
import type { FlawId } from './analysis/flaws'
import type { PhaseId } from './analysis/types'
import { playerBaseline } from './baseline'
import { FAULT_NAME } from './graduation'
import { faultMoment } from './lookFor'
import { deltaStatus } from './progress'
import { serveStory, type ServeStory } from './serveStory'
import type { ServeTag, Session } from './storage/db'

export interface CardScent {
  story: ServeStory
  /** The moment the card's picture is held at. */
  moment: PhaseId
  /** The fault painted on it, when the serve had it. */
  paint?: FlawId
  /** The overall against the player's usual before this serve, past their noise. */
  vsUsual?: number
}

/** The overall against the usual of the serves before it, or nothing inside the noise. */
export function vsUsual(s: Session, history: readonly Session[], tags?: readonly ServeTag[]): number | undefined {
  const before = history.filter((h) => h.createdAt < s.createdAt)
  const usual = playerBaseline(before, { serveType: s.serveType, tags })?.overall
  if (!usual) return undefined
  const delta = Math.round(s.overall - usual.typical)
  return deltaStatus(delta, 'overall') !== 'flat' && Math.abs(delta) > usual.spread ? delta : undefined
}

/**
 * @param cards the serves on screen, newest first, as Today lays them out
 * @param history every serve, in any order
 */
export function cardScents(cards: readonly Session[], history: readonly Session[], tags?: ReadonlyMap<string, ServeTag>): CardScent[] {
  const tagList = tags ? [...tags.values()] : undefined
  const scents = cards.map((s): CardScent => {
    const story = serveStory(s, history, tags)
    const about = story.kind === 'fix' || story.kind === 'gone' ? story.flaw : undefined
    return {
      story,
      moment: (about && faultMoment(s.fundamentals ?? [], about)) || 'contact',
      paint: story.kind === 'fix' ? about : undefined,
      vsUsual: s.triage?.status === 'rejected' ? undefined : vsUsual(s, history, tagList),
    }
  })
  // Oldest first, so the first of a run keeps the full sentence and the later ones say "again".
  let run = 1
  for (let i = scents.length - 2; i >= 0; i--) {
    const older = scents[i + 1].story
    const newer = scents[i].story
    const same = newer.kind === 'fix' && older.kind === 'fix' && newer.flaw !== undefined && newer.flaw === older.flaw
    run = same ? run + 1 : 1
    if (same) {
      const name = FAULT_NAME[newer.flaw!]
      scents[i] = { ...scents[i], story: { ...newer, title: run === 2 ? `${name} again` : `${name}, ${run} in a row` } }
    }
  }
  return scents
}
