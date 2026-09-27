/**
 * Player-facing words for profile answers (PRODUCT §6.1 O2 to O7, verbatim), shared by onboarding and
 * Profile → Your serve so both screens offer the same options (DESIGN §10.12). Australian English,
 * sentence case, no dashes (DESIGN §11).
 */
import type { LevelBand } from '../../../../analysis/types.ts'
import type { BodyRegion, Goal, PlayStyle, ProfileRecord, Weekday } from '../../../../data/records.ts'

export const PLAY_STYLE_OPTIONS: { value: PlayStyle; label: string }[] = [
  { value: 'pennant', label: 'Pennant' },
  { value: 'night-comp', label: 'Night comp or association' },
  { value: 'other-league', label: 'Another league' },
  { value: 'no-comp', label: 'No comp: social hits or booked courts' },
]

/** O4, in this order, none preselected (COACHING §9.2). */
export const GOAL_OPTIONS: { value: Goal; label: string }[] = [
  { value: 'second-serve-reliability', label: 'Double faults' },
  { value: 'first-serves-in', label: 'Not enough first serves in' },
  { value: 'more-pace', label: 'Not enough pace' },
  { value: 'less-effort', label: 'Serving feels like hard work' },
]

/** Short goal phrases for the profile summary line ("Goal: fewer double faults."). */
export const GOAL_SUMMARY: Record<Goal, string> = {
  'second-serve-reliability': 'fewer double faults',
  'first-serves-in': 'more first serves in',
  'more-pace': 'more pace',
  'less-effort': 'serving with less effort',
}

export const WEEKDAYS: { value: Weekday; label: string; long: string }[] = [
  { value: 'mon', label: 'Mon', long: 'Mondays' },
  { value: 'tue', label: 'Tue', long: 'Tuesdays' },
  { value: 'wed', label: 'Wed', long: 'Wednesdays' },
  { value: 'thu', label: 'Thu', long: 'Thursdays' },
  { value: 'fri', label: 'Fri', long: 'Fridays' },
  { value: 'sat', label: 'Sat', long: 'Saturdays' },
  { value: 'sun', label: 'Sun', long: 'Sundays' },
]

/**
 * O6 "Which sounds most like you?" (COACHING §9.1 mapping). The first and middle options both coach
 * as UTR 1 to 3; the middle one is stored as 'unknown' (which the coaching layer also treats as
 * UTR 1 to 3) so the answer can be shown again in Profile. Skip keeps the middle option.
 */
export type LevelDescription = 'getting-going' | 'most-in' | 'competition'
export const LEVEL_OPTIONS: { value: LevelDescription; label: string; level: LevelBand }[] = [
  { value: 'getting-going', label: 'Still getting my serve going', level: 'utr-1-3' },
  { value: 'most-in', label: 'I get most serves in but want more', level: 'unknown' },
  { value: 'competition', label: 'I play competition or pennant', level: 'utr-4-5' },
]
export const DEFAULT_LEVEL_DESCRIPTION: LevelDescription = 'most-in'

export function levelFromDescription(d: LevelDescription): LevelBand {
  return LEVEL_OPTIONS.find((o) => o.value === d)?.level ?? 'unknown'
}

/** The description to show for a stored band when no UTR was given. */
export function descriptionFromLevel(level: LevelBand): LevelDescription {
  if (level === 'utr-1-3') return 'getting-going'
  if (level === 'utr-4-5' || level === 'utr-6-7') return 'competition'
  return 'most-in'
}

/** UTR accepted range (PRODUCT O6). */
export const UTR_MIN = 1
export const UTR_MAX = 16.5

/** Data-layer band from a self-reported UTR (COACHING §9.1: below 4.0 is UTR 1 to 3). */
export function levelFromUtr(utr: number): LevelBand {
  if (utr < 4) return 'utr-1-3'
  if (utr < 6) return 'utr-4-5'
  return 'utr-6-7'
}

/** Parses a typed UTR ("4.5", "4,5"). Returns null when empty, NaN-free and in range otherwise. */
export function parseUtr(raw: string): { value: number | null; error?: string } {
  const t = raw.trim().replace(',', '.')
  if (!t) return { value: null }
  if (!/^\d{1,2}(\.\d{0,2})?$/.test(t)) return { value: null, error: 'Enter a UTR like 4.5.' }
  const v = Number(t)
  if (v < UTR_MIN || v > UTR_MAX) return { value: null, error: 'Enter a UTR from 1 to 16.5.' }
  return { value: Math.round(v * 100) / 100 }
}

/** O7 areas (COACHING §10.1 region ids), plus the exclusive "None". */
export const REGION_OPTIONS: { value: BodyRegion; label: string }[] = [
  { value: 'shoulder', label: 'Shoulder' },
  { value: 'elbow', label: 'Elbow or wrist' },
  { value: 'back', label: 'Back' },
  { value: 'knee', label: 'Hip, knee or ankle' },
  { value: 'other', label: 'Somewhere else' },
]
export const REGION_LABEL: Record<BodyRegion, string> = Object.fromEntries(REGION_OPTIONS.map((o) => [o.value, o.label])) as Record<
  BodyRegion,
  string
>

/**
 * Comfort and body copy (PRODUCT §6.1 O7). The over-40 GP line is gone: it followed the 2013 Better
 * Health Channel page that COACHING §10.3 replaced with the APSS stage 1 screen, whose questions still
 * need verifying and a clinician review. The pain referral stays in lineDrills.
 */
export const COMFORT_COPY = {
  question: 'Any areas to go easy on?',
  none: 'None',
  lineDrills: "We'll leave out drills that load these areas. This isn't a health check. If something hurts, see a physio or GP.",
  saveQuestion: 'Save these on this phone so we can adjust your drills? They never leave this phone.',
  save: 'Save on this phone',
  dontSave: "Don't save",
  profileLine: 'Used only to leave out drills that load these areas. Never shared, never exported unless you choose.',
} as const

export const HEIGHT_COPY = {
  label: 'Your height',
  why: 'We use it to turn your video into centimetres. It never leaves this phone.',
} as const

export const HEIGHT_MIN_CM = 140
export const HEIGHT_MAX_CM = 210
/** Soft flag (gap ranges §8; metrics.json plausibility enteredHeightM.soft 1.45 to 2.05 m). */
export const HEIGHT_SOFT_LOW_CM = 145
export const HEIGHT_SOFT_HIGH_CM = 205

export type HeightCheck = { ok: true; cm: number; softFlag: boolean } | { ok: false; error: string }

/** Validates a typed height in cm (whole numbers, 140 to 210). */
export function checkHeightCm(raw: string): HeightCheck {
  const t = raw.trim()
  if (!/^\d{2,3}$/.test(t)) return { ok: false, error: 'Enter your height in centimetres, like 178.' }
  const cm = Number(t)
  if (cm < HEIGHT_MIN_CM || cm > HEIGHT_MAX_CM) return { ok: false, error: 'Enter a height from 140 to 210 cm.' }
  return { ok: true, cm, softFlag: cm < HEIGHT_SOFT_LOW_CM || cm > HEIGHT_SOFT_HIGH_CM }
}

/** "1.78 m" for a stored height in metres. */
export function metresText(heightM: number): string {
  return `${heightM.toFixed(2)} m`
}

/** "UTR 4.5" with the stored precision (no trailing zeros beyond two decimals). */
export function utrText(utr: number): string {
  return `UTR ${Number.isInteger(utr) ? utr.toFixed(0) : String(Math.round(utr * 100) / 100)}`
}

function joinWords(items: string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

/**
 * The Profile summary line (DESIGN §10.12): "1.78 m, right-handed, UTR 4.5 (you logged). Night comp
 * on Tuesdays. Goal: fewer double faults." Missing answers are named, never guessed.
 */
export function profileSummary(p: ProfileRecord | null | undefined): string {
  if (!p) return 'Add your height and serving hand so we can turn video into centimetres.'
  const parts: string[] = []
  const first: string[] = []
  first.push(p.heightM ? metresText(p.heightM) : 'Height not added')
  first.push(p.handedness === 'left' ? 'left-handed' : 'right-handed')
  if (typeof p.utr === 'number') first.push(`${utrText(p.utr)} (you logged)`)
  parts.push(`${first.join(', ')}.`)
  const comps = p.playStyle.filter((s) => s !== 'no-comp')
  if (comps.length) {
    const names = comps.map((s) => (s === 'pennant' ? 'Pennant' : s === 'night-comp' ? 'Night comp' : 'Another league'))
    const nights = WEEKDAYS.filter((d) => p.matchNights.includes(d.value)).map((d) => d.long)
    parts.push(`${joinWords(names)}${nights.length ? ` on ${joinWords(nights)}` : ''}.`)
  } else if (p.playStyle.includes('no-comp')) {
    parts.push('Social hits or booked courts.')
  }
  parts.push(`Goal: ${GOAL_SUMMARY[p.goal]}.`)
  return parts.join(' ')
}
