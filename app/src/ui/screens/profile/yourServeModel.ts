/**
 * Profile → Your serve form model (PRODUCT §6.13 item 1): the editable answers, how a stored profile
 * fills them, what blocks saving, and the patch to save. Pure, so it is unit-tested.
 */
import type { Handedness } from '../../../analysis/types.ts'
import type { Goal, PlayStyle, ProfileRecord, Weekday } from '../../../data/records.ts'
import {
  checkHeightCm,
  DEFAULT_LEVEL_DESCRIPTION,
  descriptionFromLevel,
  levelFromDescription,
  levelFromUtr,
  parseUtr,
  type LevelDescription,
} from './parts/words.ts'

export interface ServeForm {
  heightCm: number | null
  handedness: Handedness | null
  utrText: string
  noUtr: boolean
  description: LevelDescription | null
  goal: Goal | null
  playStyle: PlayStyle[]
  matchNights: Weekday[]
  /** YYYY-MM-DD or empty. */
  seasonStart: string
  /** Whole weeks as typed, or empty. */
  seasonWeeks: string
}

export function formFromProfile(p: ProfileRecord | null | undefined): ServeForm {
  if (!p) {
    return {
      heightCm: null,
      handedness: null,
      utrText: '',
      noUtr: false,
      description: null,
      goal: null,
      playStyle: [],
      matchNights: [],
      seasonStart: '',
      seasonWeeks: '',
    }
  }
  const hasUtr = typeof p.utr === 'number'
  return {
    heightCm: p.heightM ? Math.round(p.heightM * 100) : null,
    handedness: p.handedness,
    utrText: hasUtr ? String(p.utr) : '',
    noUtr: !hasUtr,
    description: hasUtr ? null : descriptionFromLevel(p.level),
    goal: p.goal,
    playStyle: [...p.playStyle],
    matchNights: [...p.matchNights],
    seasonStart: p.season?.startDate ?? '',
    seasonWeeks: p.season ? String(p.season.weeks) : '',
  }
}

export const SEASON_WEEKS_MIN = 1
export const SEASON_WEEKS_MAX = 30

/** Season is optional; when either field is filled both must be valid. */
export function seasonCheck(f: Pick<ServeForm, 'seasonStart' | 'seasonWeeks'>): { season?: { startDate: string; weeks: number }; error?: string } {
  const start = f.seasonStart.trim()
  const weeksRaw = f.seasonWeeks.trim()
  if (!start && !weeksRaw) return {}
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return { error: 'Choose the date your season starts.' }
  if (!/^\d{1,2}$/.test(weeksRaw)) return { error: 'Enter the season length in whole weeks.' }
  const weeks = Number(weeksRaw)
  if (weeks < SEASON_WEEKS_MIN || weeks > SEASON_WEEKS_MAX) return { error: `Enter a length from ${SEASON_WEEKS_MIN} to ${SEASON_WEEKS_MAX} weeks.` }
  return { season: { startDate: start, weeks } }
}

/** What stops Save (null = can save). */
export function saveBlocker(f: ServeForm): string | null {
  if (f.heightCm !== null && !checkHeightCm(String(f.heightCm)).ok) return 'Check your height.'
  if (!f.noUtr && parseUtr(f.utrText).error) return 'Check your UTR, or choose “I don’t have one”.'
  const s = seasonCheck(f)
  if (s.error) return s.error
  return null
}

export type ServePatch = Partial<Omit<ProfileRecord, 'id' | 'createdAt' | 'updatedAt' | 'inSegment'>>

/** The profile patch. Unset answers are left out (never invented); clearing UTR or season removes them. */
export function patchFromForm(f: ServeForm): ServePatch {
  const patch: ServePatch = {}
  if (f.heightCm !== null) patch.heightM = f.heightCm / 100
  if (f.handedness) patch.handedness = f.handedness
  if (f.goal) patch.goal = f.goal
  patch.playStyle = [...f.playStyle]
  patch.matchNights = f.playStyle.some((p) => p !== 'no-comp') ? [...f.matchNights] : []
  const utr = f.noUtr ? null : parseUtr(f.utrText).value
  if (utr !== null) {
    patch.utr = utr
    patch.level = levelFromUtr(utr)
  } else {
    patch.utr = undefined
    patch.level = levelFromDescription(f.description ?? DEFAULT_LEVEL_DESCRIPTION)
  }
  patch.season = seasonCheck(f).season
  return patch
}

/** Height changed from a stored value: centimetres are recomputed and never compared across it (METRICS §4.4). */
export function heightChanged(p: ProfileRecord | null | undefined, f: ServeForm): boolean {
  return Boolean(p?.heightM && f.heightCm !== null && Math.round(p.heightM * 100) !== f.heightCm)
}

export function sameForm(a: ServeForm, b: ServeForm): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}
