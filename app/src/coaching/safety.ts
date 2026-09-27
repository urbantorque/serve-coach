/**
 * Pain and red-flag screen, and referral copy (COACHING §10). The app screens and signposts: it never
 * assesses, never names a condition, never estimates severity and never suggests treatment. Wording
 * is adapted from clinical guidance and MUST be reviewed by an Australian physiotherapist or sports
 * and exercise physician before release (COACHING §10; PRODUCT §6.16 release blocker).
 */
import { REGION_WORDS } from './profile.ts'
import type { BodyCheck, BodyRegion, ReferralCopy, ReferralLevel } from './types.ts'

export const BODY_CHECK = {
  title: 'Quick body check',
  question: "How's your body today?",
  answers: { fine: 'All good', sore: 'A bit sore or tight', pain: 'It hurts' },
  whereQuestion: 'Where?',
  regions: [
    { id: 'shoulder', label: 'Shoulder' },
    { id: 'elbow', label: 'Elbow or wrist' },
    { id: 'back', label: 'Back' },
    { id: 'knee', label: 'Hip, knee or ankle' },
    { id: 'other', label: 'Somewhere else' },
  ] as { id: BodyRegion; label: string }[],
  sharpQuestion: 'Is it sharp, getting worse, waking you at night, or still there from your last session?',
  consentQuestion: "Save body-check answers on this phone so we can adjust your drills? They never leave this phone.",
  consentYes: 'Save on this phone',
  consentNo: "Don't save",
  settled: "It's settled",
  checkedQuestion: 'Have you been checked by a doctor or physio?',
  checkedThanks: 'Thanks. If anything flares up, stop and get it checked again.',
} as const

/** Today's soreness line (§10.1). */
export function sorenessLine(regions: readonly BodyRegion[]): string {
  const area = regions.length === 1 ? REGION_WORDS[regions[0]] : 'sore areas'
  return `We'll go easy on your ${area} today: fewer serves, no jumps or max-effort swings. If it turns sharp or builds while you play, stop.`
}

export interface RedFlagQuestion {
  id: string
  text: string
  level: 'emergency' | 'today'
}

/** §10.2, in order. The first three map to Emergency; the rest to See a doctor today. */
export const RED_FLAGS: readonly RedFlagQuestion[] = [
  { id: 'chest', text: "Chest pain or pressure, fainting, or trouble breathing that isn't normal for you", level: 'emergency' },
  { id: 'bladder', text: 'New trouble controlling your bladder or bowels, or numbness around your groin or buttocks', level: 'emergency' },
  { id: 'legs', text: 'Leg weakness that is getting worse, or numbness in both legs', level: 'emergency' },
  { id: 'joint', text: "A joint that looks out of shape, or won't move, after a fall or knock", level: 'today' },
  { id: 'arm', text: "You suddenly can't lift your arm", level: 'today' },
  { id: 'hot', text: 'A hot, red or swollen joint, or you feel feverish or unwell', level: 'today' },
  { id: 'side', text: 'Sudden sharp pain in your side or tummy while serving', level: 'today' },
]

export const RED_FLAG_TITLE = 'Do any of these apply right now?'
export const RED_FLAG_ANSWERS = { some: 'One or more of these', none: 'None of these' } as const

/** Referral level from the red-flag answers (§10.2): any emergency row wins; none ticked -> Stop and book. */
export function referralLevel(tickedIds: readonly string[]): ReferralLevel {
  const ticked = RED_FLAGS.filter((q) => tickedIds.includes(q.id))
  if (ticked.some((q) => q.level === 'emergency')) return 'emergency'
  if (ticked.length > 0) return 'today'
  return 'stop-and-book'
}

/** The body check answer that the engine's safety gate reads, from the red-flag step. */
export function bodyCheckFromRedFlags(tickedIds: readonly string[]): BodyCheck {
  const level = referralLevel(tickedIds)
  return level === 'stop-and-book' ? { answer: 'pain' } : { answer: 'red-flag', level }
}

/** Referral cards (§10.3), verbatim. The healthdirect number must be verified before release. */
export const REFERRAL_COPY: Record<ReferralLevel, ReferralCopy> = {
  emergency: {
    level: 'emergency',
    title: 'Please stop and call 000 now.',
    body: ["What you've described needs urgent medical care. If you can't call, ask someone nearby to call for you."],
    call000: true,
    actions: ['call-000'],
  },
  today: {
    level: 'today',
    title: 'Please stop serving and see a doctor today.',
    body: ["A GP or an emergency department can check this properly. We've paused coaching; your stats are safe."],
    helpline: { label: "Not sure where to go? healthdirect's 24-hour line can help: 1800 022 222.", tel: '1800022222' },
    actions: ['ok'],
  },
  'stop-and-book': {
    level: 'stop-and-book',
    title: "Let's skip serving today.",
    body: [
      "Pain that's sharp, getting worse, waking you at night or hanging around is worth getting checked by a GP, physiotherapist or sports doctor.",
      "With back pain, see a GP soon if it comes with a fever, follows a fall, is there even when you rest, or you've had cancer or unexplained weight loss.",
      "We'll keep your focus and stats ready for when you're back.",
    ],
    actions: ['ok', 'remind-3-days'],
  },
}

/** The pain rule for all drills (§10.3 "During or after a drill"). */
export const DRILL_PAIN_RULE =
  'Stop the drill if pain is sharp, builds as you go, wakes you at night or is still there the next day, and see a physiotherapist or sports doctor.'

/** Focus-card comfort line (PRODUCT §6.8.1 item 7). */
export const COMFORT_LINE = 'Any pain? Stop and see a physio or GP.'

/** Pain-pause card (DESIGN §8.8 referral variant). */
export const PAUSE_LINE = 'Coaching is paused. Your stats are safe.'

/** Under-18 message (§7.5, §9.4). */
export const UNDER_18_MESSAGE = 'The serve coach is for adults for now. You can still record and review your serves.'

/** Goal screen safety line for less-effort (§9.2). */
export const LESS_EFFORT_LINE = 'If something hurts, see a physio or GP. This setting just keeps sessions gentler.'
