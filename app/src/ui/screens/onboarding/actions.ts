/**
 * Onboarding writes. The profile, the comfort consent and the onboarding state are written together
 * at the end (or when the player leaves set-up); nothing is written for a player under 18.
 */
import { getProfile, getSetting, listSessions, saveProfile, setSetting } from '../../../data/index.ts'
import type { OnboardingSetting } from '../../../data/records.ts'
import { comfortConsent, hasProfileAnswers, isFirstRun, toProfilePatch, type OnboardingDraft } from './model.ts'

export async function saveOnboarding(draft: OnboardingDraft, status: OnboardingSetting['status'], now: Date = new Date()): Promise<void> {
  if (draft.adult !== true) throw new Error('Onboarding answers are only stored for adults (D11).')
  // "Skip set-up" right after the age question writes no profile, so nothing is invented for the
  // player; Profile then asks for height and hand.
  if (hasProfileAnswers(draft)) await saveProfile(toProfilePatch(draft, now), now)
  const consents = comfortConsent(draft, await getSetting('consents'), now)
  if (consents) await setSetting('consents', consents, now)
  await setSetting('onboarding', { status, at: now.toISOString() }, now)
}

/** Marks onboarding done without touching the profile (O9 buttons, which may run after a reload). */
export async function markOnboarding(status: OnboardingSetting['status'], now: Date = new Date()): Promise<void> {
  const current = await getSetting('onboarding')
  if (current.status === status) return
  await setSetting('onboarding', { status, at: now.toISOString() }, now)
}

/**
 * Test switch for the first-run redirect. Under vitest the redirect is off by default, so other
 * screens' tests that render Today on an empty database keep testing Today's empty state; the
 * onboarding tests turn it on. It has no effect outside tests.
 */
export const firstRunGateTesting = { enabled: false }

/** Reads what the first-run rule needs. Any failure (for example no IndexedDB) means "not first run". */
export async function checkFirstRun(): Promise<boolean> {
  try {
    const [onboarding, profile, sessions] = await Promise.all([getSetting('onboarding'), getProfile(), listSessions({ includeDemo: true })])
    return isFirstRun({ onboarding, hasProfile: Boolean(profile), sessionCount: sessions.length })
  } catch {
    return false
  }
}
