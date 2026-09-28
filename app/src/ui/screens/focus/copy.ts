/**
 * Strings for the focus, drill and practice-log screens (DESIGN §8.8, §10.9, §11; PRODUCT §6.8).
 * Coaching content (titles, cues, drills, referral copy) comes from coaching-library.json and
 * coaching/safety.ts. Australian English, sentence case, no dashes as separators, no exclamation marks.
 */
import type { EvidenceTier } from '../../../coaching/index.ts'

export const FOCUS_COPY = {
  screenTitle: 'Your focus',
  whyThisFocus: 'Why this focus?',
  whyItMatters: 'Why it matters',
  yourCue: 'Your cue',
  tryOtherCue: 'Try the other cue',
  yourDrill: 'Your drill',
  easier: 'Easier version',
  harder: 'Harder version',
  harderLocked: {
    'needs-two-logs': 'The harder version opens after two practices where you meet the goal.',
    'paused-sore': 'The harder version is paused while you are sore.',
    'level-or-comfort': 'There is no harder version for your level or comfort settings yet.',
  },
  coachesDiffer: 'Coaches differ on this one.',
  suggestedRegression: 'Two practices missed the goal, so the easier version is a good next step.',
  suggestedOtherCue: 'Some changes feel odd at first, but a good change usually starts to feel better within a session or two. Want to try the other cue?',
  goal: 'Goal',
  stopIfHurts: 'Stop if anything hurts',
  retest: 'Re-test',
  startDrill: 'Start drill',
  recordRetest: 'Record re-test',
  logPractice: 'Log practice',
  evidence: 'The evidence',
  thisServe: (n?: number) => (n ? `Serve ${n}` : 'This session'),
  yourBest: 'Your best',
  lastSession: 'Last session',
  sketchNote: 'Drawn from your measurements; no frame was saved.',
  pinned: 'Pinned from your coach',
  alsoNoticed: 'Also noticed',
  whatWeChecked: 'What we checked',
  howWeKnow: 'How we know',
  playingTonight: 'Playing tonight?',
  notTonight: 'Not playing tonight',
  sampleNote: 'This focus comes from the sample player, not from you.',
  keepGoingBody: 'Keep building consistency. Nothing stood out as clearly worth changing this session.',
  ruleExperimentalOff:
    'This coaching rule is still experimental: there are no club-player thresholds for it yet. It runs only when Experimental metrics is on in Profile.',
  /** The same, as one line of a list without titles ("Also checked" on the focus card). */
  ruleExperimentalOffFor: (subject: string) =>
    `${subject}: this coaching rule is still experimental, with no club-player thresholds yet. It runs only when Experimental metrics is on in Profile.`,
  recordNext: 'Record next session',
  captureTitle: "We couldn't see enough to coach this time",
  setupCamera: 'Set up camera',
  notAvailableTitle: 'The serve coach is for adults',
  pausedTitle: 'Coaching is paused',
  settled: "It's settled",
  emptyTitle: 'Record your first serves',
  emptyBody: "15 serves from one side, about 10 minutes. We'll find one thing to work on.",
  seeSample: 'See a sample session',
  verdictLabel: 'Did it work?',
  straightAfter: 'Straight after practice',
  tierExplain: {
    'research-backed': 'Studies link this change to better serving within the same players, and we measure it directly or estimate it from your video.',
    'coach-recommended':
      'Expert coaches teach this. The research behind it comes mostly from skilled and elite players, not club players, and no trial has tested this cue for club players yet.',
    experimental: 'This check is still being validated. It uses a new measurement or thresholds without published data, so treat it as a pointer, not a finding.',
  } satisfies Record<EvidenceTier, string>,
  cuesAreCoaching: 'Cues and drills are coaching interpretation: sensible defaults we keep testing.',
} as const

/** The session's own counts, as the report headline and capture line use them (sessionValues.headlineFor). */
export interface SessionServeCounts {
  /** Serves kept for statistics (analysis.counts.included). */
  measured: number
  /** Serves found (analysis.counts.analysed). */
  detected: number
}

/**
 * The count under a focus evidence stat, in the report's words so the two always agree. The report's
 * headline and capture line count the serves kept for statistics out of the serves found ("14 of 16
 * serves measured"). A stat's own n and nEligible count only the serves the engine could use for it
 * ("14 of 14"), which read as a contradiction beside the report. With the session's counts the line
 * starts with the report's phrase, and adds how many serves this value used when that is fewer (one
 * court side, or serves without this value).
 */
export function evidenceCountLine(stat: { n?: number; nEligible?: number }, counts?: SessionServeCounts | null): string | null {
  const n = stat.n
  if (n === undefined) return null
  const serves = (k: number) => (k === 1 ? 'serve' : 'serves')
  if (!counts || counts.detected <= 0) return stat.nEligible !== undefined ? `${n} of ${stat.nEligible} ${serves(stat.nEligible)}` : `${n} ${serves(n)}`
  const base = `${counts.measured} of ${counts.detected} ${serves(counts.detected)} measured`
  return n >= counts.measured ? base : `${base} · this uses ${n}`
}

export const DRILL_COPY = {
  step: (i: number, n: number) => `Step ${i} of ${n}`,
  setup: 'Set-up',
  nextStep: 'Next step',
  previousStep: 'Back a step',
  finish: 'Finish and log',
  start: 'Start',
  pause: 'Pause',
  resume: 'Resume',
  timeUp: "Time's up. Finish when you're ready.",
  paused: (step: number, left: string) => `Paused at step ${step}, ${left} left.`,
  count: 'Count',
  somethingHurts: 'Stop: something hurts',
  closeLabel: 'Close drill',
  leaveTitle: 'Leave the drill?',
  leaveBody: (min: number) => `Save ${min} ${min === 1 ? 'minute' : 'minutes'} as practice?`,
  leaveSave: 'Save as practice',
  leaveDiscard: 'Leave without saving',
  counterAria: (label: string, k: number, of: number) => `${label}: ${k} of ${of}`,
} as const

export const LOG_COPY = {
  title: 'Log practice',
  date: 'Date',
  minutes: 'Minutes',
  serves: 'Serves, roughly',
  goalMet: 'Did you meet the goal?',
  feel: 'How did it feel?',
  cueHelpful: 'Did the cue help?',
  body: 'How is your body?',
  setting: 'Where did you practise?',
  note: 'Note (stays on this phone)',
  noteHelp: (left: number) => `${left} characters left`,
  save: 'Save log',
  saved: 'Practice logged',
  saveError: "We couldn't save that. Try again.",
  nextTitle: 'Plan your re-test',
  pickDay: 'Pick a day',
  done: 'Done',
  discardTitle: 'Discard this log?',
  discardBody: 'Your answers are not saved yet.',
  keepEditing: 'Keep editing',
  discard: 'Discard',
  bodySoreLine: 'Thanks. We will go easy today.',
  answers: {
    yes: 'Yes',
    partly: 'Partly',
    no: 'No',
    natural: 'Felt natural',
    ok: 'OK',
    awkward: 'Felt awkward',
    notSure: 'Not sure',
    fine: 'Fine',
    sore: 'A bit sore',
    pain: 'It hurts',
    court: 'Court',
    wall: 'Wall',
    other: 'Other',
  },
} as const

export const WARMUP_COPY = {
  matchNight: 'Comp night tonight',
  yourCue: 'Your cue tonight',
  openRoutine: '5-minute warm-up',
  noNew: 'No new changes today.',
  serves: (n: number) => `${n} serves, easy to firm, no camera needed.`,
} as const
