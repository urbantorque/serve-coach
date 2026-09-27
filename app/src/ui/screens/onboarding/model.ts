/**
 * Onboarding model (PRODUCT §6.1 O1 to O9, DESIGN §10.1): step order, the in-progress answers, what
 * each step needs before Continue, and how the answers become the stored profile. Pure functions, so
 * the rules are unit-tested without rendering.
 */
import type { Handedness } from '../../../analysis/types.ts'
import type {
  BodyRegion,
  ConsentState,
  Goal,
  OnboardingSetting,
  PlayStyle,
  ProfileRecord,
  Weekday,
} from '../../../data/records.ts'
import {
  DEFAULT_LEVEL_DESCRIPTION,
  levelFromDescription,
  levelFromUtr,
  parseUtr,
  type LevelDescription,
} from '../profile/parts/words.ts'

/** URL step ids, in order (O1 to O9). */
export const STEPS = ['welcome', 'age', 'play', 'goal', 'you', 'level', 'comfort', 'privacy', 'ready'] as const
export type StepId = (typeof STEPS)[number]
/** The "No" answer to O2 replaces the question with a message; it is not a step of its own. */
export const ADULTS_ONLY = 'adults-only'

export function normaliseStep(raw: string | undefined): StepId | typeof ADULTS_ONLY {
  if (raw === ADULTS_ONLY) return ADULTS_ONLY
  return (STEPS as readonly string[]).includes(raw ?? '') ? (raw as StepId) : 'welcome'
}

export function stepIndex(step: StepId): number {
  return STEPS.indexOf(step)
}

export function nextStep(step: StepId): StepId | null {
  const i = stepIndex(step)
  return i >= 0 && i < STEPS.length - 1 ? STEPS[i + 1] : null
}

export function prevStep(step: StepId): StepId | null {
  const i = stepIndex(step)
  return i > 0 ? STEPS[i - 1] : null
}

/** Steps that can be skipped (PRODUCT §6.1 "Required?" column). */
export const OPTIONAL_STEPS: readonly StepId[] = ['level', 'comfort']

export interface OnboardingDraft {
  /** O2 answer. Null until answered; false shows the adults-only message and stores nothing. */
  adult: boolean | null
  playStyle: PlayStyle[]
  matchNights: Weekday[]
  goal: Goal | null
  heightCm: number | null
  handedness: Handedness | null
  /** O6: the typed UTR ("4.5"), or empty. */
  utrText: string
  /** O6: "I don't have one" was chosen. */
  noUtr: boolean
  levelDescription: LevelDescription | null
  comfortRegions: BodyRegion[]
  /** O7 "None" (exclusive). */
  comfortNone: boolean
  /** O7 consent to store the areas on this phone (APP 3.3 express consent). Null until answered. */
  comfortSave: boolean | null
  /** O1 "Skip set-up": answer the age question, then go straight to Today. */
  skipAfterAge: boolean
}

export const EMPTY_DRAFT: OnboardingDraft = {
  adult: null,
  playStyle: [],
  matchNights: [],
  goal: null,
  heightCm: null,
  handedness: null,
  utrText: '',
  noUtr: false,
  levelDescription: null,
  comfortRegions: [],
  comfortNone: false,
  comfortSave: null,
  skipAfterAge: false,
}

export const COMP_STYLES: readonly PlayStyle[] = ['pennant', 'night-comp', 'other-league']

export function playsComp(playStyle: readonly PlayStyle[]): boolean {
  return playStyle.some((p) => COMP_STYLES.includes(p))
}

/** Why Continue is not available yet (null = it is). The reason shows as helper text (DESIGN §8.3). */
export function continueBlocker(step: StepId, d: OnboardingDraft): string | null {
  switch (step) {
    case 'play':
      return d.playStyle.length ? null : 'Choose how you play to continue.'
    case 'goal':
      return d.goal ? null : 'Choose one to continue.'
    case 'you':
      if (d.heightCm === null && d.handedness === null) return 'Add your height and serving hand to continue.'
      if (d.heightCm === null) return 'Add your height to continue.'
      if (d.handedness === null) return 'Choose your serving hand to continue.'
      return null
    case 'level':
      return parseUtr(d.utrText).error ? 'Check your UTR, or choose “I don’t have one”.' : null
    case 'comfort':
      return d.comfortRegions.length && d.comfortSave === null ? 'Choose whether to save these on this phone.' : null
    default:
      return null
  }
}

/** Stored level and UTR from the O6 answers. Skip or no answer keeps the middle option. */
export function levelAnswer(d: OnboardingDraft): Pick<ProfileRecord, 'level' | 'utr'> {
  const utr = d.noUtr ? null : parseUtr(d.utrText).value
  if (utr !== null) return { level: levelFromUtr(utr), utr }
  return { level: levelFromDescription(d.levelDescription ?? DEFAULT_LEVEL_DESCRIPTION), utr: undefined }
}

export type ProfilePatch = Partial<Omit<ProfileRecord, 'id' | 'createdAt' | 'updatedAt' | 'inSegment'>>

/**
 * The profile patch from the answers so far. Only answered fields are written, so leaving set-up
 * early never invents answers; the data layer's defaults fill required fields that were not reached.
 * Comfort areas are stored only with the player's consent; otherwise nothing about comfort is kept.
 */
export function toProfilePatch(d: OnboardingDraft, now: Date = new Date()): ProfilePatch {
  const patch: ProfilePatch = { ageBand: '18-plus' }
  if (d.playStyle.length) patch.playStyle = [...d.playStyle]
  if (playsComp(d.playStyle) && d.matchNights.length) patch.matchNights = [...d.matchNights]
  if (d.goal) patch.goal = d.goal
  if (d.heightCm !== null) patch.heightM = Math.round(d.heightCm) / 100
  if (d.handedness) patch.handedness = d.handedness
  const lvl = levelAnswer(d)
  patch.level = lvl.level
  if (lvl.utr !== undefined) patch.utr = lvl.utr
  if (d.comfortSave && d.comfortRegions.length) {
    patch.comfortRegions = [...d.comfortRegions]
    patch.comfort = { painFlag: 0, consentAt: now.toISOString() }
  }
  return patch
}

/** At least one profile question (O3 to O7) was answered. */
export function hasProfileAnswers(d: OnboardingDraft): boolean {
  return Boolean(
    d.playStyle.length ||
      d.goal ||
      d.heightCm !== null ||
      d.handedness ||
      d.utrText.trim() ||
      d.noUtr ||
      d.levelDescription ||
      d.comfortRegions.length,
  )
}

/** The consent record for comfort areas, when the question was asked (O7 save question). */
export function comfortConsent(d: OnboardingDraft, existing: ConsentState, now: Date = new Date()): ConsentState | null {
  if (!d.comfortRegions.length || d.comfortSave === null) return null
  return { ...existing, painNotes: { granted: d.comfortSave, version: 'comfort@1', at: now.toISOString() } }
}

/**
 * First-run rule: redirect Today to onboarding only when nothing has happened yet. A returning
 * player with a profile or any session (including sample data) never sees onboarding again, and
 * leaving set-up early ("skipped") ends the redirect for good (PRODUCT §6.1 states).
 */
export function isFirstRun(input: { onboarding: OnboardingSetting; hasProfile: boolean; sessionCount: number }): boolean {
  return input.onboarding.status === 'not-started' && !input.hasProfile && input.sessionCount === 0
}
