/**
 * Profile normalisation (COACHING §7.8, §9.1): data-layer bands to coaching bands, comfort merge,
 * cue register.
 */
import type { LevelBand } from '../analysis/types.ts'
import type { BodyCheck, BodyRegion, CoachLevel, CoachingAgeBand, CoachingProfile, CueRegister, Sex } from './types.ts'

export interface NormalisedProfile {
  level: CoachLevel
  /** UTR above 7: the library is written for UTR 1 to 7 (§9.1). */
  aboveLibraryRange: boolean
  ageBand: CoachingAgeBand
  sex: Sex
  comfort: Set<BodyRegion>
  /** Regions added from today's "a bit sore" answer (session only). */
  soreToday: BodyRegion[]
  register: CueRegister
  showExperimental: boolean
  heightM: number
}

/**
 * UTR < 4.0 -> utr-1-3; >= 4.0 -> utr-4-7 (§9.1). Data bands utr-4-5 and utr-6-7 map to utr-4-7;
 * 'unknown' falls back to utr-1-3, whose looser rules mean fewer false fires (§7.8).
 */
export function coachLevel(level: LevelBand | CoachLevel, utr?: number): CoachLevel {
  if (typeof utr === 'number' && Number.isFinite(utr)) return utr < 4 ? 'utr-1-3' : 'utr-4-7'
  if (level === 'utr-4-5' || level === 'utr-6-7' || level === 'utr-4-7') return 'utr-4-7'
  return 'utr-1-3'
}

/**
 * Coaching age band. The data layer stores '18-plus' only (D11 closed beta); until the adult band
 * with 60+ exists, '18-plus' is treated as under 60 (§7.8 "Until then: … age < 60").
 */
export function coachAgeBand(age: CoachingProfile['ageBand']): CoachingAgeBand {
  if (age === 'under-15' || age === '15-17' || age === 'under-18') return 'under-18'
  if (age === '60-plus' || age === '40-59' || age === '18-39') return age
  return '18-39'
}

export function registerForLevel(level: CoachLevel): CueRegister {
  return level === 'utr-1-3' ? 'analogy' : 'outcome'
}

export function normaliseProfile(p: CoachingProfile, bodyCheck?: BodyCheck): NormalisedProfile {
  const level = coachLevel(p.level, p.utr)
  const soreToday = bodyCheck?.answer === 'sore' ? bodyCheck.regions : []
  return {
    level,
    aboveLibraryRange: typeof p.utr === 'number' && p.utr > 7,
    ageBand: coachAgeBand(p.ageBand),
    sex: p.sex ?? 'not-given',
    comfort: new Set<BodyRegion>([...p.comfortRegions, ...soreToday]),
    soreToday,
    register: p.cueRegister ?? registerForLevel(level),
    showExperimental: p.showExperimental,
    heightM: p.heightM > 0 ? p.heightM : 1.75,
  }
}

export const REGION_WORDS: Record<BodyRegion, string> = {
  shoulder: 'shoulder',
  elbow: 'elbow or wrist',
  back: 'back',
  knee: 'hip, knee or ankle',
  other: 'body',
}
