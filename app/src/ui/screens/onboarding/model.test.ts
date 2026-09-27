import { describe, expect, it } from 'vitest'
import {
  ADULTS_ONLY,
  comfortConsent,
  continueBlocker,
  EMPTY_DRAFT,
  hasProfileAnswers,
  isFirstRun,
  levelAnswer,
  nextStep,
  normaliseStep,
  prevStep,
  STEPS,
  toProfilePatch,
  type OnboardingDraft,
} from './model.ts'

const draft = (patch: Partial<OnboardingDraft> = {}): OnboardingDraft => ({ ...EMPTY_DRAFT, adult: true, ...patch })
const NOW = new Date('2026-09-27T10:00:00+10:00')

describe('onboarding steps (PRODUCT §6.1 O1 to O9)', () => {
  it('has the nine steps in order', () => {
    expect(STEPS).toEqual(['welcome', 'age', 'play', 'goal', 'you', 'level', 'comfort', 'privacy', 'ready'])
    expect(nextStep('welcome')).toBe('age')
    expect(nextStep('ready')).toBeNull()
    expect(prevStep('welcome')).toBeNull()
    expect(prevStep('play')).toBe('age')
  })

  it('unknown step ids fall back to the welcome screen; the adults-only message is recognised', () => {
    expect(normaliseStep(undefined)).toBe('welcome')
    expect(normaliseStep('nope')).toBe('welcome')
    expect(normaliseStep('goal')).toBe('goal')
    expect(normaliseStep(ADULTS_ONLY)).toBe(ADULTS_ONLY)
  })
})

describe('continue rules', () => {
  it('requires how you play, a goal, and both height and hand', () => {
    expect(continueBlocker('play', draft())).toMatch(/how you play/)
    expect(continueBlocker('play', draft({ playStyle: ['pennant'] }))).toBeNull()
    expect(continueBlocker('goal', draft())).not.toBeNull()
    expect(continueBlocker('goal', draft({ goal: 'more-pace' }))).toBeNull()
    expect(continueBlocker('you', draft())).toBe('Add your height and serving hand to continue.')
    expect(continueBlocker('you', draft({ heightCm: 178 }))).toBe('Choose your serving hand to continue.')
    expect(continueBlocker('you', draft({ handedness: 'left' }))).toBe('Add your height to continue.')
    expect(continueBlocker('you', draft({ heightCm: 178, handedness: 'left' }))).toBeNull()
  })

  it('level is optional but a mistyped UTR blocks until fixed', () => {
    expect(continueBlocker('level', draft())).toBeNull()
    expect(continueBlocker('level', draft({ utrText: '4.5' }))).toBeNull()
    expect(continueBlocker('level', draft({ utrText: '20' }))).not.toBeNull()
  })

  it('comfort needs a save answer only when an area is chosen (APP 3.3 express consent)', () => {
    expect(continueBlocker('comfort', draft())).toBeNull()
    expect(continueBlocker('comfort', draft({ comfortRegions: ['back'] }))).not.toBeNull()
    expect(continueBlocker('comfort', draft({ comfortRegions: ['back'], comfortSave: false }))).toBeNull()
  })
})

describe('profile patch', () => {
  it('stores height in metres, the hand, goal, play style and nights; age band is 18-plus only', () => {
    const p = toProfilePatch(
      draft({ heightCm: 178, handedness: 'left', goal: 'second-serve-reliability', playStyle: ['night-comp'], matchNights: ['tue'] }),
      NOW,
    )
    expect(p).toMatchObject({ heightM: 1.78, handedness: 'left', goal: 'second-serve-reliability', playStyle: ['night-comp'], matchNights: ['tue'], ageBand: '18-plus' })
  })

  it('drops match nights when the player does not play comp', () => {
    expect(toProfilePatch(draft({ playStyle: ['no-comp'], matchNights: ['tue'] }), NOW).matchNights).toBeUndefined()
  })

  it('maps a UTR to its band (COACHING §9.1), and the no-UTR options to theirs; skip keeps the middle option', () => {
    expect(levelAnswer(draft({ utrText: '3.9' }))).toEqual({ level: 'utr-1-3', utr: 3.9 })
    expect(levelAnswer(draft({ utrText: '4,5' }))).toEqual({ level: 'utr-4-5', utr: 4.5 })
    expect(levelAnswer(draft({ utrText: '8' }))).toEqual({ level: 'utr-6-7', utr: 8 })
    expect(levelAnswer(draft({ noUtr: true, levelDescription: 'getting-going' })).level).toBe('utr-1-3')
    expect(levelAnswer(draft({ noUtr: true, levelDescription: 'competition' })).level).toBe('utr-4-5')
    expect(levelAnswer(draft()).level).toBe('unknown')
    expect(levelAnswer(draft()).utr).toBeUndefined()
  })

  it('stores comfort areas only with consent, and never a pain flag', () => {
    const saved = toProfilePatch(draft({ comfortRegions: ['shoulder', 'back'], comfortSave: true }), NOW)
    expect(saved.comfortRegions).toEqual(['shoulder', 'back'])
    expect(saved.comfort).toEqual({ painFlag: 0, consentAt: NOW.toISOString() })
    const declined = toProfilePatch(draft({ comfortRegions: ['shoulder'], comfortSave: false }), NOW)
    expect(declined.comfortRegions).toBeUndefined()
    expect(declined.comfort).toBeUndefined()
  })

  it('records the comfort consent answer only when the question was asked', () => {
    expect(comfortConsent(draft(), {}, NOW)).toBeNull()
    expect(comfortConsent(draft({ comfortRegions: ['knee'], comfortSave: false }), {}, NOW)?.painNotes).toEqual({
      granted: false,
      version: 'comfort@1',
      at: NOW.toISOString(),
    })
  })

  it('knows when only the age question was answered (skip writes no profile)', () => {
    expect(hasProfileAnswers(draft())).toBe(false)
    expect(hasProfileAnswers(draft({ goal: 'more-pace' }))).toBe(true)
  })
})

describe('first-run rule', () => {
  it('redirects only when nothing has happened yet', () => {
    const base = { onboarding: { status: 'not-started' as const }, hasProfile: false, sessionCount: 0 }
    expect(isFirstRun(base)).toBe(true)
    expect(isFirstRun({ ...base, hasProfile: true })).toBe(false)
    expect(isFirstRun({ ...base, sessionCount: 3 })).toBe(false)
    expect(isFirstRun({ ...base, onboarding: { status: 'skipped' } })).toBe(false)
    expect(isFirstRun({ ...base, onboarding: { status: 'completed' } })).toBe(false)
  })
})
